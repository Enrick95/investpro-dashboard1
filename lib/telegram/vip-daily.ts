import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { telegram } from "@/lib/telegram/server";

/**
 * Tâche quotidienne du bot (site principal uniquement) :
 *  - rappels d’abonnement à J-7, J-5 et J0 (message Telegram si le membre a démarré le bot, sinon e-mail) ;
 *  - retrait du canal VIP le lendemain de l’expiration (l’accès au site s’arrête déjà à l’échéance) ;
 *  - résumé du matin envoyé à Enrick, avec un bouton « Relancer » par membre retiré.
 * Idempotence : une seule exécution par jour (cron Vercel) ; les retraits vérifient d’abord si la
 * personne est encore dans le canal ; les e-mails portent une clé d’idempotence Resend.
 */

const REMINDER_DAYS = [7, 5, 0] as const;
/** Échéances signalées à Enrick dans le résumé du matin (abonnement par abonnement). */
const ADMIN_ALERT_DAYS = [10, 7, 5, 3, 1, 0] as const;
const RENEW_URL = "https://investprotrading.fr/dashboard/vip";
const DAY = 86_400_000;

type Membership = { user_id: string; email: string; first_name: string | null; last_name: string | null; type: string; expires_at: string | null; status: string };
type Link = { user_id: string; channel_user_id: number | null; channel_username: string | null };
export type DailyReport = { reminders: { name: string; days: number; telegram: boolean; email: boolean }[]; removed: { userId: string; name: string }[]; manual: string[]; pendingRequests: number; pendingApplications: number; expiringSoon: number; upcoming: { name: string; days: number; date: string }[]; errors: string[] };

const esc = (value: string) => value.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const name = (m: Pick<Membership, "first_name" | "last_name" | "email">) => [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || m.email;

/** Nombre de jours calendaires (heure de Paris) entre aujourd’hui et l’échéance. */
export function parisDaysUntil(expiresAt: string, now = Date.now()): number {
  const day = (t: number) => { const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(t); return Date.parse(p + "T00:00:00Z"); };
  return Math.round((day(new Date(expiresAt).getTime()) - day(now)) / DAY);
}

export function reminderText(firstName: string | null, days: number): string {
  const hello = `Salut${firstName ? " " + firstName : ""} 👋`;
  const when = days === 0 ? "se termine <b>aujourd’hui</b>" : `se termine dans <b>${days} jours</b>`;
  return `${hello}\nTon accès au VIP InvestPro ${when}.\n\nPour ne rien rater, renouvelle-le ici : ${RENEW_URL}\n\nUne question ? Écris à @EquipeInvestPro.`;
}
export function relaunchText(firstName: string | null): string {
  return `Salut${firstName ? " " + firstName : ""} 👋\nTon abonnement au VIP InvestPro est arrivé à son terme, et ton accès au canal a été retiré.\n\nTu peux revenir quand tu veux : ${RENEW_URL}\nDès que ton renouvellement est validé, tu reçois un nouveau lien d’accès.\n\nUne question ? Écris à @EquipeInvestPro.`;
}

async function sendEmail(to: string, subject: string, text: string, key: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.INVESTPRO_EMAIL_FROM;
  if (!apiKey || !from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ from, to: [to], subject, text: text.replace(/<\/?b>/g, "") }), signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch { return false; }
}
async function sendDm(chatId: number | null, text: string): Promise<boolean> {
  if (!chatId) return false;
  try { await telegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }); return true; }
  catch { return false; } // Le membre n’a pas démarré le bot : repli e-mail.
}

async function links(db: SupabaseClient, userIds: string[]): Promise<Map<string, Link>> {
  const map = new Map<string, Link>();
  if (!userIds.length) return map;
  const { data } = await db.from("vip_access_requests").select("user_id,channel_user_id,channel_username,reviewed_at").in("user_id", userIds).eq("status", "approved").not("channel_user_id", "is", null).order("reviewed_at", { ascending: false });
  for (const row of (data || []) as (Link & { reviewed_at: string | null })[]) if (!map.has(row.user_id)) map.set(row.user_id, row);
  return map;
}

export async function runVipTelegramDaily(db: SupabaseClient, now = Date.now()): Promise<DailyReport> {
  const report: DailyReport = { reminders: [], removed: [], manual: [], pendingRequests: 0, pendingApplications: 0, expiringSoon: 0, upcoming: [], errors: [] };
  const channel = process.env.TELEGRAM_VIP_CHAT_ID || "";

  const { data, error } = await db.from("vip_memberships").select("user_id,email,first_name,last_name,type,expires_at,status").eq("type", "abonnement").eq("status", "active").not("expires_at", "is", null);
  if (error) throw new Error("VIP_DAILY_MEMBERS");
  const members = (data || []) as Membership[];
  const linked = await links(db, members.map(m => m.user_id));

  for (const m of members) {
    const days = parisDaysUntil(m.expires_at as string, now);
    const link = linked.get(m.user_id) || null;
    if (days >= 0 && days <= 7) report.expiringSoon++;
    if ((ADMIN_ALERT_DAYS as readonly number[]).includes(days)) report.upcoming.push({ name: name(m), days, date: new Date(m.expires_at as string).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short" }) });
    if ((REMINDER_DAYS as readonly number[]).includes(days)) {
      const text = reminderText(m.first_name, days);
      const tg = await sendDm(link?.channel_user_id ?? null, text);
      const mail = tg ? false : await sendEmail(m.email, days === 0 ? "Ton accès VIP se termine aujourd’hui" : `Ton accès VIP se termine dans ${days} jours`, text, `vip-renew-${m.user_id}-${m.expires_at}-${days}`);
      report.reminders.push({ name: name(m), days, telegram: tg, email: mail });
    }
    if (days <= -1) {
      if (!link?.channel_user_id || !/^-100\d+$/.test(channel)) { report.manual.push(name(m)); continue; }
      try {
        const member = await telegram("getChatMember", { chat_id: channel, user_id: link.channel_user_id }) as { status?: string };
        if (member.status === "member" || member.status === "restricted") {
          // Bannir puis débannir : la personne quitte le canal mais pourra revenir avec un nouveau lien.
          await telegram("banChatMember", { chat_id: channel, user_id: link.channel_user_id, until_date: Math.floor(now / 1000) + 60 });
          await telegram("unbanChatMember", { chat_id: channel, user_id: link.channel_user_id, only_if_banned: true });
          report.removed.push({ userId: m.user_id, name: name(m) });
        }
      } catch { report.errors.push(`Retrait impossible pour ${name(m)} (droits du bot ?)`); }
    }
  }

  const [requests, applications] = await Promise.all([
    db.from("vip_access_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("vip_member_applications").select("id", { count: "exact", head: true }).eq("status", "submitted"),
  ]);
  report.pendingRequests = requests.count || 0;
  report.pendingApplications = applications.count || 0;
  return report;
}

export async function sendMorningSummary(report: DailyReport): Promise<void> {
  const chat = process.env.TELEGRAM_CHAT_ID || "";
  if (!/^-?\d+$/.test(chat)) return;
  const pending = report.pendingRequests + report.pendingApplications;
  const lines = [
    "☀️ <b>Résumé InvestPro du matin</b>",
    "",
    `🆕 Demandes VIP à valider : <b>${pending}</b>`,
    `⏳ Abonnements qui finissent sous 7 jours : <b>${report.expiringSoon}</b>`,
    ...(report.upcoming.length ? ["", "📅 <b>Fins d’abonnement à suivre</b>", ...report.upcoming.sort((a, b) => a.days - b.days).map(u => `   • ${esc(u.name)} — ${u.days === 0 ? "<b>aujourd’hui</b>" : u.days === 1 ? "<b>demain</b>" : `dans ${u.days} jours`} (${u.date})`), ""] : []),
    `🔔 Rappels envoyés aujourd’hui : <b>${report.reminders.length}</b>`,
    ...report.reminders.map(r => `   • ${esc(r.name)} — ${r.days === 0 ? "J0" : "J-" + r.days} ${r.telegram ? "(Telegram)" : r.email ? "(e-mail)" : "(⚠️ non joignable)"}`),
    `🚪 Retirés du canal : <b>${report.removed.length}</b>`,
  ];
  if (report.manual.length) lines.push("", `✋ À retirer à la main (Telegram inconnu) : ${report.manual.map(esc).join(", ")}`);
  if (report.errors.length) lines.push("", ...report.errors.map(e => "⚠️ " + esc(e)));
  if (pending) lines.push("", "👉 https://investprotrading.fr/dashboard/admin?tool=vip&view=requests");
  await telegram("sendMessage", { chat_id: chat, text: lines.join("\n"), parse_mode: "HTML", disable_web_page_preview: true });
  for (const removed of report.removed) {
    await telegram("sendMessage", { chat_id: chat, parse_mode: "HTML", text: `🚪 <b>${esc(removed.name)}</b> a été retiré du canal VIP (abonnement expiré).`, reply_markup: { inline_keyboard: [[{ text: "🔁 Relancer", callback_data: `viprenew:${removed.userId}` }]] } }).catch(() => {});
  }
}

/** Bouton « Relancer » : message Telegram au membre si possible, sinon e-mail. */
export async function relaunchMember(db: SupabaseClient, userId: string): Promise<"telegram" | "email" | "none"> {
  const { data } = await db.from("vip_memberships").select("user_id,email,first_name,last_name,expires_at").eq("user_id", userId).maybeSingle();
  if (!data) return "none";
  const m = data as Membership;
  const link = (await links(db, [userId])).get(userId) || null;
  const text = relaunchText(m.first_name);
  if (await sendDm(link?.channel_user_id ?? null, text)) return "telegram";
  if (await sendEmail(m.email, "On t’attend dans le VIP InvestPro", text, `vip-relaunch-${userId}-${m.expires_at}`)) return "email";
  return "none";
}
