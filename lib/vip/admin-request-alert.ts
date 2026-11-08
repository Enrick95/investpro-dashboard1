import "server-only";
import { telegram } from "@/lib/telegram/server";
import { vipAffiliationBrokerLabel } from "@/lib/vip/identity";
import type { VipAccessRequest } from "@/lib/vip/types";

/** A member of the Telegram channel who did not say how they joined: the team picks affiliation or subscription when validating. */
export function vipOriginUndeclared(request: Pick<VipAccessRequest, "request_kind" | "type" | "affiliation_broker">): boolean {
  return request.request_kind === "existing" && request.type === "affiliation" && !request.affiliation_broker;
}

/** Alerte Telegram envoyée à Enrick pour chaque nouvelle demande (abonnement, affiliation ou membre déjà dans le canal). */
export async function notifyAdminNewVipRequest(request: VipAccessRequest) {
  const chat = process.env.TELEGRAM_CHAT_ID || "";
  if (!process.env.TELEGRAM_BOT_TOKEN || !/^-?\d+$/.test(chat)) return;
  const esc = (value: string) => value.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const who = esc(`${request.first_name || ""} ${request.last_name || ""}`.trim() || request.email);
  const tg = request.telegram_username ? ` · @${esc(request.telegram_username)}` : "";
  const kind = request.request_kind === "existing" ? "Déjà membre Telegram" : "Nouvelle adhésion";
  const detail = request.type === "abonnement"
    ? `💳 Abonnement 80 €/mois · paiement déclaré le ${esc(request.paid_on || "—")} → à vérifier dans Stripe`
    : vipOriginUndeclared(request)
      ? "❓ Origine à confirmer à la validation : affiliation ou abonnement"
      : `🏦 Affiliation · ${esc(vipAffiliationBrokerLabel(request.affiliation_broker) || "broker à confirmer")}${request.declared_deposit_usd ? ` · dépôt déclaré ${request.declared_deposit_usd} $` : ""}${request.copy_requested ? " · Copy demandé" : ""}`;
  const contact = [request.email ? `✉️ ${esc(request.email)}` : "", request.phone_whatsapp ? `📱 WhatsApp : ${esc(request.phone_whatsapp)}` : ""].filter(Boolean).join("\n");
  await telegram("sendMessage", {
    chat_id: chat, parse_mode: "HTML", disable_web_page_preview: true,
    text: `🆕 <b>Nouvelle demande VIP</b> (${kind})\n👤 ${who}${tg}\n${contact ? `${contact}\n` : ""}${detail}\n\nÀ valider ici : https://investprotrading.fr/dashboard/admin?tool=vip&view=requests`,
  });
}

/** Membre « déjà dans le canal » validé : l'e-mail et la notification partent seuls ; Enrick peut aussi le prévenir sur WhatsApp en un geste. */
export async function notifyAdminExistingMemberApproved(request: Pick<VipAccessRequest, "first_name" | "last_name" | "email" | "phone_whatsapp">) {
  const chat = process.env.TELEGRAM_CHAT_ID || "";
  const phone = (request.phone_whatsapp || "").replace(/\D/g, "");
  if (!process.env.TELEGRAM_BOT_TOKEN || !/^-?\d+$/.test(chat) || phone.length < 8) return;
  const esc = (value: string) => value.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const first = (request.first_name || "").trim();
  const message = `Salut${first ? ` ${first}` : ""} 👋\n\nTon accès VIP InvestPro est validé ✅ Ta carte membre est débloquée.\n\nTon espace VIP : https://investprotrading.fr/dashboard/vip\n\nEnrick — InvestPro`;
  await telegram("sendMessage", {
    chat_id: chat, parse_mode: "HTML", disable_web_page_preview: true,
    text: `✅ <b>Accès VIP validé</b> : ${esc(`${first} ${request.last_name || ""}`.trim() || request.email)} (déjà membre Telegram)\nIl reçoit l’alerte par e-mail, et sur son téléphone s’il a activé les notifications.\n📱 Tu peux aussi le prévenir sur WhatsApp :`,
    reply_markup: { inline_keyboard: [[{ text: "💬 Le prévenir sur WhatsApp", url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` }]] },
  });
}
