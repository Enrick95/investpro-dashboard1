import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { telegram } from "@/lib/telegram/server";

/**
 * Abonnement VIP payé sur Stripe → accès automatique au canal.
 *  - checkout.session.completed : enregistre le client (nom, e-mail, téléphone, Telegram),
 *    crée un lien d'invitation à usage unique, l'envoie au client par e-mail et prévient Enrick.
 *  - invoice.paid (renouvellement) : remet le statut actif.
 *  - invoice.payment_failed : statut « paiement en échec », Enrick est prévenu.
 *  - customer.subscription.deleted : retire la personne du canal si on la connaît, Enrick est prévenu.
 * Aucun secret Stripe n'est nécessaire en dehors du secret de signature du webhook.
 */

const TOLERANCE_SECONDS = 300;
const INVITE_DAYS = 7;
const ADMIN_URL = "https://investprotrading.fr/dashboard/admin?tool=telegram&view=subscriptions";

export function verifyStripeSignature(payload: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map(p => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v || "");
  if (!t || !/^\d+$/.test(t) || !signatures.length) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(t)) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"));
  return signatures.some(sig => { const b = Buffer.from(sig); return b.length === expected.length && timingSafeEqual(b, expected); });
}

const esc = (v: string) => v.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const money = (cents: number | null, currency: string | null) => cents == null ? "?" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: (currency || "eur").toUpperCase() }).format(cents / 100);

/** Cherche un champ personnalisé Stripe contenant « telegram » (ex. « Pseudo Telegram »). */
export function telegramFromCustomFields(fields: unknown): string | null {
  if (!Array.isArray(fields)) return null;
  for (const f of fields as { key?: string; label?: { custom?: string }; text?: { value?: string } }[]) {
    const label = `${f?.key || ""} ${f?.label?.custom || ""}`.toLowerCase();
    if (!label.includes("telegram")) continue;
    const raw = (f?.text?.value || "").trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?(t|telegram)\.me\//i, "").replace(/^@+/, "").replace(/\/+$/, "");
    if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(raw)) return "@" + raw;
    if (raw) return raw.slice(0, 64);
  }
  return null;
}

async function notifyAdmin(text: string, buttons?: { text: string; url: string }[]) {
  const chat = process.env.TELEGRAM_CHAT_ID || "";
  if (!/^-?\d+$/.test(chat)) return;
  await telegram("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...(buttons?.length ? { reply_markup: { inline_keyboard: [buttons] } } : {}) }).catch(() => {});
}

async function emailInvite(to: string, firstName: string | null, invite: string, key: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.INVESTPRO_EMAIL_FROM;
  if (!apiKey || !from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
  const text = `Salut${firstName ? " " + firstName : ""} 👋\n\nMerci, ton paiement pour le VIP InvestPro est bien reçu.\n\nVoici ton lien personnel pour rejoindre le canal VIP sur Telegram (valable ${INVITE_DAYS} jours, utilisable une seule fois) :\n${invite}\n\nUne question ? Écris à @EquipeInvestPro sur Telegram.\n\nEnrick — InvestPro`;
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ from, to: [to], subject: "Ton accès au VIP InvestPro 🎉", text }), signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch { return false; }
}

async function createInvite(id: string): Promise<string | null> {
  const channel = process.env.TELEGRAM_VIP_CHAT_ID || "";
  if (!/^-100\d+$/.test(channel)) return null;
  try {
    const r = await telegram("createChatInviteLink", { chat_id: channel, member_limit: 1, expire_date: Math.floor(Date.now() / 1000) + INVITE_DAYS * 86400, name: `STRIPE-${id.slice(0, 8)}` }) as { invite_link?: string };
    return r.invite_link || null;
  } catch { return null; }
}

type Row = { id: string; full_name: string | null; email: string | null; phone: string | null; telegram_username: string | null; invite_url: string | null; channel_user_id: number | null; status: string };

async function handleCheckout(db: SupabaseClient, session: Record<string, any>) {
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;
  const sessionId = clip(session.id, 255); if (!sessionId) return;
  const details = session.customer_details || {};
  const row = {
    checkout_session_id: sessionId,
    stripe_customer_id: clip(typeof session.customer === "string" ? session.customer : session.customer?.id, 255),
    stripe_subscription_id: clip(typeof session.subscription === "string" ? session.subscription : session.subscription?.id, 255),
    email: clip(details.email, 254)?.toLowerCase() || null,
    full_name: clip(details.name, 120),
    phone: clip(details.phone, 40),
    telegram_username: telegramFromCustomFields(session.custom_fields),
    amount_total: Number.isSafeInteger(session.amount_total) ? session.amount_total : null,
    currency: clip(session.currency, 8),
    last_payment_at: new Date().toISOString(),
  };
  // Idempotent : Stripe peut renvoyer le même événement ; on ne crée qu'un seul lien.
  const { data: existing } = await db.from("vip_stripe_payments").select("id,invite_url").eq("checkout_session_id", sessionId).maybeSingle();
  let id = existing?.id as string | undefined;
  if (!id) {
    const { data, error } = await db.from("vip_stripe_payments").insert(row).select("id").single();
    if (error) { const again = await db.from("vip_stripe_payments").select("id,invite_url").eq("checkout_session_id", sessionId).maybeSingle(); if (!again.data) throw new Error("STRIPE_SAVE"); return; }
    id = data.id as string;
  } else if (existing?.invite_url) return;

  const invite = await createInvite(id);
  if (invite) await db.from("vip_stripe_payments").update({ invite_url: invite, invite_created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
  const firstName = row.full_name ? row.full_name.split(/\s+/)[0] : null;
  const mailed = invite && row.email ? await emailInvite(row.email, firstName, invite, `vip-stripe-${sessionId}`) : false;

  const lines = [
    "💳 <b>Nouveau paiement VIP (Stripe)</b>",
    "",
    `👤 ${esc(row.full_name || "Nom non renseigné")}`,
    `✉️ ${esc(row.email || "—")}`,
    `📱 ${esc(row.phone || "—")}`,
    `✈️ Telegram : ${esc(row.telegram_username || "—")}`,
    `💶 ${money(row.amount_total, row.currency)}`,
    "",
    invite ? `🔗 Lien d’accès créé${mailed ? " et envoyé par e-mail" : " (⚠️ e-mail non envoyé : transmets-le toi-même)"} :\n${invite}` : "⚠️ Le lien d’accès n’a pas pu être créé : vérifie les droits du bot sur le canal, puis crée-le depuis l’admin.",
  ];
  await notifyAdmin(lines.join("\n"), [{ text: "Ouvrir dans l’admin", url: ADMIN_URL }]);
}

async function findBySubscription(db: SupabaseClient, subscriptionId: string | null): Promise<Row | null> {
  if (!subscriptionId) return null;
  const { data } = await db.from("vip_stripe_payments").select("id,full_name,email,phone,telegram_username,invite_url,channel_user_id,status").eq("stripe_subscription_id", subscriptionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as Row) || null;
}
const who = (r: Row) => esc(r.full_name || r.email || "Client Stripe");
const subId = (v: any) => clip(typeof v === "string" ? v : v?.id, 255);

async function handleInvoice(db: SupabaseClient, invoice: Record<string, any>, paid: boolean) {
  const sub = subId(invoice.subscription ?? invoice.parent?.subscription_details?.subscription);
  const row = await findBySubscription(db, sub);
  if (!row) return;
  if (paid) {
    if (invoice.billing_reason === "subscription_create") return; // déjà traité par le paiement initial
    await db.from("vip_stripe_payments").update({ status: "active", last_payment_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id);
    await notifyAdmin(`🔁 <b>Renouvellement VIP payé</b>\n${who(row)} — ${money(invoice.amount_paid ?? null, invoice.currency ?? null)}`);
  } else {
    await db.from("vip_stripe_payments").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("id", row.id);
    await notifyAdmin(`⚠️ <b>Paiement VIP en échec</b>\n${who(row)} (${esc(row.email || "—")})\nStripe va retenter automatiquement. S’il n’aboutit pas, l’abonnement sera annulé et la personne retirée du canal.`);
  }
}

async function handleCanceled(db: SupabaseClient, subscription: Record<string, any>) {
  const row = await findBySubscription(db, subId(subscription.id));
  if (!row || row.status === "canceled") return;
  let removed = false;
  const channel = process.env.TELEGRAM_VIP_CHAT_ID || "";
  if (row.channel_user_id && /^-100\d+$/.test(channel)) {
    try {
      await telegram("banChatMember", { chat_id: channel, user_id: row.channel_user_id, until_date: Math.floor(Date.now() / 1000) + 60 });
      await telegram("unbanChatMember", { chat_id: channel, user_id: row.channel_user_id, only_if_banned: true });
      removed = true;
    } catch { removed = false; }
  }
  if (row.invite_url && /^-100\d+$/.test(channel)) await telegram("revokeChatInviteLink", { chat_id: channel, invite_link: row.invite_url }).catch(() => {});
  await db.from("vip_stripe_payments").update({ status: "canceled", removed_at: removed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", row.id);
  await notifyAdmin(`🚪 <b>Abonnement VIP annulé</b>\n${who(row)} (${esc(row.email || "—")})\n${removed ? "Retiré automatiquement du canal." : "✋ À retirer du canal à la main (compte Telegram inconnu)."}`);
}

export async function handleStripeEvent(db: SupabaseClient, event: { type?: string; data?: { object?: Record<string, any> } }) {
  const object = event?.data?.object || {};
  switch (event?.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": return handleCheckout(db, object);
    case "invoice.paid": return handleInvoice(db, object, true);
    case "invoice.payment_failed": return handleInvoice(db, object, false);
    case "customer.subscription.deleted": return handleCanceled(db, object);
    default: return;
  }
}

/** Arrivée dans le canal via un lien Stripe : on mémorise le compte Telegram pour pouvoir le retirer plus tard. */
export async function recordStripeChannelJoin(db: SupabaseClient, invite: string, user: { id?: number; username?: string }) {
  const { data } = await db.from("vip_stripe_payments").select("id").eq("invite_url", invite).maybeSingle();
  if (!data) return false;
  await db.from("vip_stripe_payments").update({ channel_joined_at: new Date().toISOString(), channel_user_id: Number.isSafeInteger(user.id) ? user.id : null, channel_username: typeof user.username === "string" ? user.username.slice(0, 32) : null, updated_at: new Date().toISOString() }).eq("id", data.id);
  return true;
}
