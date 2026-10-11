import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

type CopierNotice = {
  eventKey: string;
  userId: string;
  title: string;
  message: string;
  href?: string;
};

type CopierDelivery = {
  eventKey: string;
  userId: string;
  channel: "email" | "push";
  title: string;
  message: string;
  href?: string;
};

async function beginDelivery(db: SupabaseClient, delivery: CopierDelivery, retry = false) {
  const { data: existing } = await db.from("copier_notification_deliveries")
    .select("status,attempts")
    .eq("event_key", delivery.eventKey)
    .eq("user_id", delivery.userId)
    .eq("channel", delivery.channel)
    .maybeSingle();
  if (existing?.status === "sent") return false;
  if (existing && !retry) return false;
  const { error } = await db.from("copier_notification_deliveries").upsert({
    event_key: delivery.eventKey,
    user_id: delivery.userId,
    channel: delivery.channel,
    title: delivery.title,
    message: delivery.message,
    href: delivery.href || "/dashboard/copieur",
    status: "pending",
    attempts: Number(existing?.attempts || 0) + 1,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_key,user_id,channel" });
  if (error) throw error;
  return true;
}

async function finishDelivery(db: SupabaseClient, delivery: CopierDelivery, status: "sent" | "failed" | "skipped", errorCode: string | null = null) {
  const { error } = await db.from("copier_notification_deliveries").update({
    status,
    last_error: errorCode,
    updated_at: new Date().toISOString(),
  }).eq("event_key", delivery.eventKey).eq("user_id", delivery.userId).eq("channel", delivery.channel);
  if (error) console.error(`[copier-notifications] delivery ${delivery.channel} non journalisée`, error.message);
}

export async function createCopierNotice(db: SupabaseClient, notice: CopierNotice) {
  const { data, error } = await db.from("investpro_notifications").upsert(
    {
      user_id: notice.userId,
      event_key: notice.eventKey,
      title: notice.title,
      message: notice.message,
      href: notice.href || "/dashboard/copieur",
    },
    { onConflict: "event_key", ignoreDuplicates: true }
  ).select("id").maybeSingle();
  if (error) throw error;
  return { inserted: Boolean(data?.id) };
}

export async function sendCopierEmail(
  db: SupabaseClient,
  eventKey: string,
  userId: string,
  subject: string,
  message: string,
  href = "/dashboard/copieur",
  retry = false
) {
  const delivery = { eventKey, userId, channel: "email" as const, title: subject, message, href };
  let claimed = false;
  try { claimed = await beginDelivery(db, delivery, retry); }
  catch (error) { console.error("[copier-notifications] suivi e-mail indisponible", error); return { sent: false, reason: "delivery_tracking_unavailable" }; }
  if (!claimed) return { sent: false, reason: "already_attempted" };
  const key = process.env.RESEND_API_KEY;
  const sender = process.env.INVESTPRO_EMAIL_FROM;
  if (!key || !sender) {
    await finishDelivery(db, delivery, "skipped", "email_not_configured");
    return { sent: false, reason: "email_not_configured" };
  }

  const { data, error } = await db.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (error || !email) {
    await finishDelivery(db, delivery, "failed", "recipient_unavailable");
    return { sent: false, reason: "recipient_unavailable" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: sender,
        to: [email],
        subject,
        text: `${message}\n\nhttps://www.investprotrading.fr${href}\n\nL’équipe InvestPro Trading`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const reason = `email_provider_${response.status}`;
      await finishDelivery(db, delivery, "failed", reason);
      return { sent: false, reason };
    }
    await finishDelivery(db, delivery, "sent");
    return { sent: true };
  } catch {
    await finishDelivery(db, delivery, "failed", "email_delivery_failed");
    return { sent: false, reason: "email_delivery_failed" };
  }
}

export async function sendCopierPush(
  db: SupabaseClient,
  eventKey: string,
  userId: string,
  title: string,
  message: string,
  href = "/dashboard/copieur",
  retry = false
) {
  const delivery = { eventKey, userId, channel: "push" as const, title, message, href };
  let claimed = false;
  try { claimed = await beginDelivery(db, delivery, retry); }
  catch (error) { console.error("[copier-notifications] suivi push indisponible", error); return { sent: false, reason: "delivery_tracking_unavailable" }; }
  if (!claimed) return { sent: false, reason: "already_attempted" };

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    await finishDelivery(db, delivery, "skipped", "push_not_configured");
    return { sent: false, reason: "push_not_configured" };
  }

  const { data: subscriptions, error } = await db.from("copier_push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (error) {
    await finishDelivery(db, delivery, "failed", "subscription_lookup_failed");
    return { sent: false, reason: "subscription_lookup_failed" };
  }
  if (!subscriptions?.length) {
    await finishDelivery(db, delivery, "skipped", "no_active_subscription");
    return { sent: false, reason: "no_active_subscription" };
  }

  try { webpush.setVapidDetails(subject, publicKey, privateKey); }
  catch {
    await finishDelivery(db, delivery, "failed", "push_configuration_invalid");
    return { sent: false, reason: "push_configuration_invalid" };
  }
  const payload = JSON.stringify({ title, body: message, url: href, tag: eventKey });
  const outcomes = await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 60 * 60 * 24 });
      return { id: subscription.id, ok: true };
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await db.from("copier_push_subscriptions").delete().eq("id", subscription.id);
      }
      return { id: subscription.id, ok: false, reason: statusCode ? `push_endpoint_${statusCode}` : "push_delivery_failed" };
    }
  }));
  const failed = outcomes.filter((outcome) => !outcome.ok);
  if (failed.length === outcomes.length) {
    const reason = failed[0]?.reason || "push_delivery_failed";
    await finishDelivery(db, delivery, "failed", reason);
    return { sent: false, reason };
  }
  await finishDelivery(db, delivery, "sent", failed.length ? `${failed.length}_endpoint_failures` : null);
  return { sent: true, failedEndpoints: failed.length };
}

export function adminUserIds() {
  return String(process.env.INVESTPRO_ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function copierAdminUserIds(db: SupabaseClient) {
  const ids = new Set(adminUserIds());
  const { data, error } = await db
    .from("admin_staff_permissions")
    .select("user_id,permissions")
    .eq("enabled", true);
  if (error) {
    console.error("[copier-notifications] liste staff indisponible", error.message);
    return [...ids];
  }
  for (const row of data || []) {
    if (Array.isArray(row.permissions) && row.permissions.includes("copier")) {
      ids.add(String(row.user_id));
    }
  }
  return [...ids];
}

