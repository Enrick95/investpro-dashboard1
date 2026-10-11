import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateAdmin } from "@/lib/admin/permissions";
import { sendCopierPush } from "@/lib/copier/notifications";

async function listAllUsers(admin: SupabaseClient) {
  const users: Array<{ id: string }> = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = data.users.map((user: { id: string }) => ({ id: user.id }));
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request, "announcements_write");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const [users, announcementsResult] = await Promise.all([
      listAllUsers(auth.admin),
      auth.admin.from("investpro_announcements").select("id,title,message,href,recipient_count,push_recipient_count,created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    if (announcementsResult.error) throw announcementsResult.error;
    const { count, error } = await auth.admin.from("copier_push_subscriptions").select("id", { count: "exact", head: true });
    if (error) throw error;
    return NextResponse.json({ recipientCount: users.length, pushSubscriptionCount: count || 0, announcements: announcementsResult.data || [] });
  } catch (error) {
    console.error("[admin-announcements][GET]", error);
    return NextResponse.json({ error: "Le suivi des annonces n’est pas prêt. Vérifiez la migration de notifications." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request, "announcements_write");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const requestKey = String(body?.requestKey || "");
    const title = String(body?.title || "").trim();
    const message = String(body?.message || "").trim();
    const href = String(body?.href || "/dashboard").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) return NextResponse.json({ error: "Identifiant de campagne invalide." }, { status: 400 });
    if (!title || title.length > 90 || !message || message.length > 400) return NextResponse.json({ error: "Le titre est requis (90 caractères max) et le message doit contenir au plus 400 caractères." }, { status: 400 });
    if (!href.startsWith("/dashboard") || href.startsWith("//") || href.length > 250) return NextResponse.json({ error: "Choisis un lien interne InvestPro valide." }, { status: 400 });

    const users = await listAllUsers(auth.admin);
    const { data: subscriptions, error: subscriptionsError } = await auth.admin.from("copier_push_subscriptions").select("user_id");
    if (subscriptionsError) throw subscriptionsError;
    const pushUsers = new Set((subscriptions || []).map((row: { user_id: string }) => row.user_id));
    const campaignKey = `investpro-announcement-${requestKey}`;
    const { error: campaignError } = await auth.admin.from("investpro_announcements").insert({
      request_key: requestKey,
      admin_user_id: auth.user.id,
      title,
      message,
      href,
      recipient_count: users.length,
      push_recipient_count: pushUsers.size,
    });
    if (campaignError) {
      if (campaignError.code === "23505") return NextResponse.json({ error: "Cette annonce a déjà été envoyée." }, { status: 409 });
      throw campaignError;
    }

    let notificationErrors = 0;
    for (let offset = 0; offset < users.length; offset += 500) {
      const rows = users.slice(offset, offset + 500).map((user) => ({
        user_id: user.id,
        event_key: `${campaignKey}-${user.id}`,
        title,
        message,
        href,
      }));
      const { error } = await auth.admin.from("investpro_notifications").upsert(rows, { onConflict: "event_key", ignoreDuplicates: true });
      if (error) { notificationErrors += rows.length; console.error("[admin-announcements] lot in-app non enregistré", error.message); }
    }

    const pushRecipients = users.filter((user) => pushUsers.has(user.id));
    let pushSent = 0;
    let pushFailed = 0;
    for (let offset = 0; offset < pushRecipients.length; offset += 40) {
      const batch = await Promise.all(pushRecipients.slice(offset, offset + 40).map(async (user) => {
        const result = await sendCopierPush(auth.admin, campaignKey, user.id, title, message, href);
        return result.sent ? "sent" : result.reason === "push_not_configured" ? "skipped" : "failed";
      }));
      pushSent += batch.filter((value) => value === "sent").length;
      pushFailed += batch.filter((value) => value === "failed").length;
    }

    return NextResponse.json({ ok: true, recipientCount: users.length - notificationErrors, pushRecipientCount: pushUsers.size, pushSent, pushFailed, notificationErrors });
  } catch (error) {
    console.error("[admin-announcements][POST]", error);
    return NextResponse.json({ error: "Impossible d’envoyer l’annonce. Vérifiez la configuration de notifications." }, { status: 503 });
  }
}
