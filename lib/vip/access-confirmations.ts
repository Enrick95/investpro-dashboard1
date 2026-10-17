import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidVipEmail, isVipMembershipActive } from "./membership";
import type { VipMembership } from "./types";

type AccessConfirmation = {
  id: string;
  user_id: string;
  event_key: string;
  title: string;
  message: string;
  created_at: string;
  email_status: string;
  email_attempts: number;
};

type EmailOutcome = {
  status: "sent" | "failed" | "skipped";
  error: string | null;
};

const VIP_URL = "https://investprotrading.fr/dashboard/vip";
const CLAIM_LIMIT = 10;
// Resend retains its idempotency keys for 24 hours. Keep a margin for slow requests.
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const SEND_SPACING_MS = 650;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validConfirmation(row: AccessConfirmation, now: number): boolean {
  const createdAt = Date.parse(row.created_at);
  return uuid.test(row.id) && uuid.test(row.user_id)
    && row.event_key === `vip:access:${row.id}:${row.user_id}`
    && row.email_status === "processing"
    && Number.isInteger(row.email_attempts) && row.email_attempts >= 1 && row.email_attempts <= 4
    && typeof row.title === "string" && row.title.length > 0 && row.title.length <= 160
    && !/[\r\n\u0000]/.test(row.title)
    && typeof row.message === "string" && row.message.length > 0 && row.message.length <= 500
    && Number.isFinite(createdAt) && createdAt > now - RETRY_WINDOW_MS && createdAt <= now + 60000;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

function confirmationHtml(title: string, message: string): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replace(/\r?\n/g, "<br>");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head>
<body style="margin:0;padding:0;background:#f1f2ef;font-family:Arial,Helvetica,sans-serif;color:#20231f;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safeTitle}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f2ef;padding:28px 12px;"><tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e4e5df;border-radius:16px;overflow:hidden;">
      <tr><td style="height:5px;background:#e9b64d;"></td></tr>
      <tr><td style="padding:26px 28px;background:#10120f;color:#fff;font-size:19px;font-weight:700;">InvestPro <span style="color:#e9b64d;">VIP</span></td></tr>
      <tr><td style="padding:30px 28px 12px;"><div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#8b671b;">VOTRE ACCÈS VIP</div><h1 style="margin:14px 0 0;font-size:25px;line-height:32px;">${safeTitle}</h1></td></tr>
      <tr><td style="padding:12px 28px;font-size:16px;line-height:26px;color:#4b5049;">Bonjour,<br><br>${safeMessage}</td></tr>
      <tr><td style="padding:20px 28px 28px;"><a href="${VIP_URL}" style="display:inline-block;padding:14px 22px;border-radius:9px;background:#e9b64d;color:#17140c;text-decoration:none;font-size:15px;font-weight:700;">Ouvrir mon espace VIP &#8594;</a></td></tr>
      <tr><td style="padding:22px 28px;background:#f7f7f4;border-top:1px solid #e9eae4;font-size:14px;line-height:23px;color:#4b5049;">Sur téléphone, vous pouvez ajouter InvestPro à votre écran d’accueil pour l’utiliser comme une application.<br>Activez ensuite les notifications depuis votre espace pour recevoir les prochaines alertes VIP.</td></tr>
      <tr><td style="padding:20px 28px;font-size:12px;line-height:20px;color:#777c73;">Vous recevez cet e-mail à la suite de la validation de votre accès VIP.<br><strong>L’équipe InvestPro Trading</strong></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

async function finishEmail(db: SupabaseClient, row: AccessConfirmation, outcome: EmailOutcome) {
  const now = Date.now();
  const nextAttempt = outcome.status === "failed" && row.email_attempts < 4
    ? new Date(now + 5 * 60 * 1000 * row.email_attempts).toISOString()
    : null;
  const { data, error } = await db.from("vip_access_confirmations").update({
    email_status: outcome.status,
    email_last_error: outcome.error,
    email_next_attempt_at: nextAttempt,
    updated_at: new Date(now).toISOString(),
  }).eq("id", row.id).eq("email_status", "processing")
    .eq("email_attempts", row.email_attempts).select("id").maybeSingle();
  // A stale worker must never replace the result of a newer lease.
  if (error || !data?.id) throw new Error("VIP_ACCESS_EMAIL_TRACKING_FAILED");
}

/** Future-only access confirmations. No browser push subscription is needed for email. */
export async function deliverVipAccessConfirmations(db: SupabaseClient) {
  const counts = { sent: 0, failed: 0, skipped: 0 };
  // Fail closed on local/test/unknown deployments, as well as ordinary previews.
  if (process.env.VERCEL_ENV !== "production") return { ...counts, preview: true };
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVESTPRO_EMAIL_FROM;
  if (!apiKey || !from) return { ...counts, unavailable: true };

  const { data, error } = await db.rpc("vip_claim_access_confirmation_emails", { p_limit: CLAIM_LIMIT });
  if (error) throw new Error("VIP_ACCESS_EMAIL_CLAIM_FAILED");
  const queued = (data || []) as AccessConfirmation[];
  if (!Array.isArray(queued) || queued.length > CLAIM_LIMIT
    || queued.some(row => !row || !validConfirmation(row, Date.now()))) {
    throw new Error("VIP_ACCESS_EMAIL_CLAIM_INVALID");
  }

  let lastRequestAt: number | null = null;
  for (const row of queued) {
    let outcome: EmailOutcome;
    try {
      const { data: membership, error: membershipError } = await db.from("vip_memberships")
        .select("type,started_at,expires_at,status").eq("user_id", row.user_id).maybeSingle();
      if (membershipError) outcome = { status: "failed", error: "membership_lookup_failed" };
      else if (!isVipMembershipActive(membership as VipMembership | null)) outcome = { status: "skipped", error: "membership_inactive" };
      else {
        const { data: recipient, error: recipientError } = await db.auth.admin.getUserById(row.user_id);
        const user = recipient?.user;
        if (recipientError) outcome = { status: "failed", error: "recipient_lookup_failed" };
        else if (!user || user.id !== row.user_id || !user.email || !isValidVipEmail(user.email)) {
          outcome = { status: "skipped", error: "recipient_unavailable" };
        } else if (!user.email_confirmed_at || user.is_anonymous) {
          outcome = { status: "skipped", error: "recipient_unconfirmed" };
        } else {
          if (lastRequestAt !== null) {
            const delay = Math.max(0, SEND_SPACING_MS - (Date.now() - lastRequestAt));
            if (delay) await new Promise<void>(resolve => setTimeout(resolve, delay));
          }
          lastRequestAt = Date.now();
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": row.event_key,
            },
            body: JSON.stringify({
              from,
              to: [user.email],
              subject: row.title,
              text: `Bonjour,\n\n${row.message}\n\nOuvrir mon espace VIP : ${VIP_URL}\n\nSur téléphone, vous pouvez ajouter InvestPro à votre écran d’accueil pour l’utiliser comme une application. Activez ensuite les notifications depuis votre espace pour recevoir les prochaines alertes VIP.\n\nL’équipe InvestPro Trading`,
              html: confirmationHtml(row.title, row.message),
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) outcome = { status: "failed", error: `email_provider_${response.status}` };
          else {
            // Only inspect the acceptance id. Never log a provider response or a recipient address.
            const accepted: unknown = await response.json();
            const providerId = accepted && typeof accepted === "object" && "id" in accepted ? accepted.id : null;
            outcome = typeof providerId === "string" && uuid.test(providerId)
              ? { status: "sent", error: null }
              : { status: "failed", error: "email_provider_response_invalid" };
          }
        }
      }
    } catch {
      // Timeouts and ambiguous provider failures can retry with the same persisted event key.
      outcome = { status: "failed", error: "email_delivery_failed" };
    }
    await finishEmail(db, row, outcome);
    counts[outcome.status]++;
  }
  return { ...counts, remaining: queued.length === CLAIM_LIMIT };
}
