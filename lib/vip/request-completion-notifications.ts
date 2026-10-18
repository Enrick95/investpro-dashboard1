import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { isValidVipEmail } from "./membership";
import { vipPushConfig } from "./notifications";
import { validPushEndpoint, validPushKeys } from "./push-validation";

type Channel = "email" | "push";
type Outcome = { status: "sent" | "failed" | "skipped"; error: string | null };
type CompletionEvent = {
  id: string; user_id: string; request_id: string; revision: number;
  kind: "needs_info" | "submitted"; event_key: string; title: string; message: string;
  href: string; created_at: string; email_status: string; email_attempts: number;
  push_status: string; push_attempts: number;
};
type SubscriptionSource = { table: "vip_push_subscriptions" | "copier_push_subscriptions"; id: string };
type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLAIM_LIMIT = 10;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const ORIGIN = "https://investprotrading.fr";

function validEvent(row: CompletionEvent, channel: Channel): boolean {
  const createdAt = Date.parse(row.created_at);
  return UUID.test(row.id) && UUID.test(row.user_id) && UUID.test(row.request_id)
    && Number.isSafeInteger(row.revision) && row.revision > 0
    && ["needs_info", "submitted"].includes(row.kind)
    && row.event_key === `vip:completion:${row.kind}:${row.request_id}:${row.revision}:${row.user_id}`
    && row[`${channel}_status`] === "processing"
    && Number.isInteger(row[`${channel}_attempts`]) && row[`${channel}_attempts`] >= 1 && row[`${channel}_attempts`] <= 4
    && typeof row.title === "string" && row.title.length > 0 && row.title.length <= 160 && !/[\r\n\u0000]/.test(row.title)
    && typeof row.message === "string" && row.message.length > 0 && row.message.length <= 1500 && !/\u0000/.test(row.message)
    && ["/vip/deja-membre", "/vip/rejoindre"].includes(row.href)
    && Number.isFinite(createdAt) && createdAt > Date.now() - RETRY_WINDOW_MS && createdAt <= Date.now() + 60000;
}

async function currentRequest(db: SupabaseClient, row: CompletionEvent): Promise<Outcome | null> {
  const { data, error } = await db.from("vip_access_requests")
    .select("id,user_id,status,request_kind,revision,completion_fields,completion_submitted_at")
    .eq("id", row.request_id).eq("user_id", row.user_id).maybeSingle();
  if (error) return { status: "failed", error: "request_lookup_failed" };
  if (!data || data.user_id !== row.user_id || data.id !== row.request_id || data.status !== "pending"
    || data.revision !== row.revision || !["new", "existing"].includes(data.request_kind)
    || row.href !== (data.request_kind === "new" ? "/vip/rejoindre" : "/vip/deja-membre")
    || !Array.isArray(data.completion_fields)
    || (row.kind === "needs_info" ? data.completion_fields.length === 0 : data.completion_fields.length !== 0 || !data.completion_submitted_at)) {
    return { status: "skipped", error: "request_event_stale" };
  }
  // A direct member grant can supersede an application without reviewing its row.
  const membership = await db.from("vip_memberships").select("user_id").eq("user_id", row.user_id).maybeSingle();
  if (membership.error) return { status: "failed", error: "membership_lookup_failed" };
  if (membership.data) return { status: "skipped", error: "request_superseded_by_membership" };
  return null;
}

async function finish(db: SupabaseClient, row: CompletionEvent, channel: Channel, outcome: Outcome) {
  const attempts = row[`${channel}_attempts`];
  const now = Date.now();
  const { data, error } = await db.from("vip_request_completion_events").update({
    [`${channel}_status`]: outcome.status,
    [`${channel}_last_error`]: outcome.error,
    [`${channel}_next_attempt_at`]: outcome.status === "failed" && attempts < 4
      ? new Date(now + 5 * 60 * 1000 * attempts).toISOString() : null,
    updated_at: new Date(now).toISOString(),
  }).eq("id", row.id).eq(`${channel}_status`, "processing").eq(`${channel}_attempts`, attempts)
    .select("id").maybeSingle();
  if (error || data?.id !== row.id) throw new Error("VIP_COMPLETION_TRACKING_FAILED");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

function completionHtml(row: CompletionEvent) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(row.title)}</title></head>
<body style="margin:0;background:#f1f2ef;font-family:Arial,Helvetica,sans-serif;color:#20231f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e4e5df;border-radius:16px;overflow:hidden">
<tr><td style="padding:24px 28px;background:#10120f;color:#fff;font-size:20px;font-weight:700;border-top:5px solid #e9b64d">InvestPro <span style="color:#e9b64d">VIP</span></td></tr>
<tr><td style="padding:28px"><h1 style="font-size:25px;line-height:32px;margin:0 0 20px">${escapeHtml(row.title)}</h1><p style="font-size:16px;line-height:26px;color:#4b5049">Bonjour,<br><br>${escapeHtml(row.message).replace(/\r?\n/g, "<br>")}</p>
<a href="${ORIGIN}${row.href}" style="display:inline-block;margin-top:16px;padding:14px 22px;border-radius:9px;background:#e9b64d;color:#17140c;text-decoration:none;font-weight:700">Retrouver mon dossier &#8594;</a></td></tr>
<tr><td style="padding:20px 28px;background:#f7f7f4;border-top:1px solid #e9eae4;font-size:12px;line-height:20px;color:#777c73">Cet e-mail concerne votre demande d’accès VIP.<br>L’équipe InvestPro Trading</td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail(db: SupabaseClient, row: CompletionEvent, apiKey: string, from: string, waitForSlot: () => Promise<void>): Promise<Outcome> {
  const { data, error } = await db.auth.admin.getUserById(row.user_id);
  const user = data?.user;
  if (error) return { status: "failed", error: "recipient_lookup_failed" };
  if (!user || user.id !== row.user_id || !user.email || !isValidVipEmail(user.email)) return { status: "skipped", error: "recipient_unavailable" };
  if (!user.email_confirmed_at || user.is_anonymous) return { status: "skipped", error: "recipient_unconfirmed" };
  await waitForSlot();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": row.event_key },
    body: JSON.stringify({ from, to: [user.email], subject: row.title,
      text: `Bonjour,\n\n${row.message}\n\nRetrouver mon dossier : ${ORIGIN}${row.href}\n\nL’équipe InvestPro Trading`, html: completionHtml(row) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { status: "failed", error: `email_provider_${response.status}` };
  const accepted: unknown = await response.json();
  const id = accepted && typeof accepted === "object" && "id" in accepted ? accepted.id : null;
  return typeof id === "string" && UUID.test(id) ? { status: "sent", error: null } : { status: "failed", error: "email_provider_response_invalid" };
}

async function sendPush(db: SupabaseClient, row: CompletionEvent): Promise<Outcome> {
  const tables: SubscriptionSource["table"][] = ["vip_push_subscriptions", "copier_push_subscriptions"];
  const channels = await Promise.all(tables.map(async table => ({ table,
    ...await db.from(table).select("id,endpoint,p256dh,auth").eq("user_id", row.user_id).limit(10),
  })));
  if (channels.some(channel => channel.error)) return { status: "failed", error: "subscription_lookup_failed" };
  const endpoints = new Map<string, Subscription & { sources: SubscriptionSource[] }>();
  for (const channel of channels) for (const subscription of (channel.data || []) as Subscription[]) {
    if (!UUID.test(subscription.id) || !validPushEndpoint(subscription.endpoint) || !validPushKeys(subscription)) continue;
    const previous = endpoints.get(subscription.endpoint);
    if (previous) previous.sources.push({ table: channel.table, id: subscription.id });
    else endpoints.set(subscription.endpoint, { ...subscription, sources: [{ table: channel.table, id: subscription.id }] });
  }
  if (!endpoints.size) return { status: "skipped", error: "no_push_subscription" };
  // Account numbers and the administrator's note stay behind authentication.
  const payload = JSON.stringify({ title: row.kind === "needs_info" ? "Votre dossier VIP est à compléter" : "Vos compléments VIP ont été reçus",
    body: row.kind === "needs_info" ? "L’équipe vous a demandé des informations. Retrouvez les détails dans votre dossier InvestPro." : "Vos informations ont été transmises à l’équipe pour vérification.",
    url: row.href, tag: row.event_key });
  const outcomes = await Promise.allSettled([...endpoints.values()].map(async subscription => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 3600, timeout: 8000 });
      return true;
    } catch (error) {
      const code = Number((error as { statusCode?: number })?.statusCode || 0);
      if (code === 404 || code === 410) {
        const removed = await Promise.all(subscription.sources.map(source => db.from(source.table).delete().eq("id", source.id).eq("user_id", row.user_id)));
        if (removed.some(result => result.error)) throw new Error("VIP_COMPLETION_PUSH_PRUNE_FAILED");
      }
      return false;
    }
  }));
  // Retry partial failures too; a stable device tag replaces an existing notification.
  return outcomes.every(result => result.status === "fulfilled" && result.value)
    ? { status: "sent", error: null } : { status: "failed", error: "push_delivery_failed" };
}

async function deliverChannel(db: SupabaseClient, channel: Channel) {
  const counts = { sent: 0, failed: 0, skipped: 0 };
  const apiKey = process.env.RESEND_API_KEY, from = process.env.INVESTPRO_EMAIL_FROM;
  if (channel === "email" && (!apiKey || !from)) return { ...counts, unavailable: true };
  if (channel === "push") {
    const config = vipPushConfig();
    if (!config.available) return { ...counts, unavailable: true };
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  }
  const { data, error } = await db.rpc("vip_claim_request_completion_notifications", { p_channel: channel, p_limit: CLAIM_LIMIT });
  if (error) throw new Error("VIP_COMPLETION_CLAIM_FAILED");
  const rows = (data || []) as CompletionEvent[];
  if (!Array.isArray(rows) || rows.length > CLAIM_LIMIT || rows.some(row => !row || !validEvent(row, channel))) throw new Error("VIP_COMPLETION_CLAIM_INVALID");
  let lastRequestAt: number | null = null;
  const waitForSlot = async () => {
    if (lastRequestAt !== null) {
      const delay = Math.max(0, 650 - (Date.now() - lastRequestAt));
      if (delay) await new Promise<void>(resolve => setTimeout(resolve, delay));
    }
    lastRequestAt = Date.now();
  };
  let trackingFailed = false;
  for (const row of rows) {
    let outcome: Outcome;
    try {
      outcome = await currentRequest(db, row) || (channel === "email"
        ? await sendEmail(db, row, apiKey!, from!, waitForSlot) : await sendPush(db, row));
    } catch { outcome = { status: "failed", error: `${channel}_delivery_failed` }; }
    try { await finish(db, row, channel, outcome); counts[outcome.status]++; }
    catch { trackingFailed = true; }
  }
  if (trackingFailed) throw new Error("VIP_COMPLETION_TRACKING_FAILED");
  return { ...counts, remaining: rows.length === CLAIM_LIMIT };
}

/** No historical backfill. Applicants can receive email before VIP/push enrollment. */
export async function deliverVipRequestCompletionNotifications(db: SupabaseClient) {
  if (process.env.VERCEL_ENV !== "production") return { preview: true };
  const [email, push] = await Promise.allSettled([deliverChannel(db, "email"), deliverChannel(db, "push")]);
  if (email.status === "rejected" || push.status === "rejected") throw new Error("VIP_COMPLETION_DELIVERY_FAILED");
  return { email: email.value, push: push.value };
}
