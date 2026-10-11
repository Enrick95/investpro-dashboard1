import type { SupabaseClient } from "@supabase/supabase-js";

type CopierNotice = {
  eventKey: string;
  userId: string;
  title: string;
  message: string;
  href?: string;
};

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
  userId: string,
  subject: string,
  message: string
) {
  const key = process.env.RESEND_API_KEY;
  const sender = process.env.INVESTPRO_EMAIL_FROM;
  if (!key || !sender) return { sent: false, reason: "email_not_configured" };

  const { data, error } = await db.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (error || !email) return { sent: false, reason: "recipient_unavailable" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: sender,
        to: [email],
        subject,
        text: `${message}\n\nhttps://www.investprotrading.fr/dashboard/copieur\n\nL’équipe InvestPro Trading`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { sent: false, reason: `email_provider_${response.status}` };
    return { sent: true };
  } catch {
    return { sent: false, reason: "email_delivery_failed" };
  }
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

