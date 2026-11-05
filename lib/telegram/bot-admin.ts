import "server-only";
import { telegram } from "@/lib/telegram/server";

/** Mises à jour que le bot doit recevoir sur /api/telegram/webhook. */
export const BOT_UPDATES = ["message", "callback_query", "chat_member", "my_chat_member", "channel_post", "edited_channel_post"] as const;
export const SITE_ORIGIN = "https://investprotrading.fr";

type Me = { id: number; username?: string; first_name?: string };
type WebhookInfo = { url?: string; pending_update_count?: number; last_error_date?: number; last_error_message?: string; allowed_updates?: string[] };
type ChatMember = { status?: string; can_invite_users?: boolean; can_restrict_members?: boolean };

export type BotStatus = {
  configured: boolean;
  environment: string;
  bot: { username: string | null; name: string | null } | null;
  webhook: { connected: boolean; pointsToSite: boolean; pending: number; lastError: string | null; missingUpdates: string[] } | null;
  channel: { configured: boolean; isAdmin: boolean; canInvite: boolean; canBan: boolean } | null;
  adminChatConfigured: boolean;
  problems: string[];
};

/** Lecture seule : aucune valeur secrète (token, secret du webhook, identifiants) n’est renvoyée. */
export async function readBotStatus(): Promise<BotStatus> {
  const environment = process.env.VERCEL_ENV || "development";
  const problems: string[] = [];
  const adminChatConfigured = /^-?\d+$/.test(process.env.TELEGRAM_CHAT_ID || "");
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return { configured: false, environment, bot: null, webhook: null, channel: null, adminChatConfigured, problems: [environment === "production" ? "Le token du bot n’est pas renseigné dans Vercel." : "Le bot n’est branché que sur le site principal : cette version de test ne l’utilise pas."] };
  }
  let me: Me | null = null;
  try { me = await telegram("getMe") as Me; }
  catch { problems.push("Telegram refuse le token : vérifie qu’il a été copié en entier depuis BotFather."); }

  let webhook: BotStatus["webhook"] = null;
  if (me) {
    try {
      const info = await telegram("getWebhookInfo") as WebhookInfo;
      const url = info.url || "";
      const pointsToSite = url === `${SITE_ORIGIN}/api/telegram/webhook`;
      const allowed = info.allowed_updates || [];
      const missingUpdates = allowed.length ? BOT_UPDATES.filter(update => !allowed.includes(update)) : [];
      webhook = { connected: !!url, pointsToSite, pending: info.pending_update_count || 0, lastError: info.last_error_message ? String(info.last_error_message).slice(0, 160) : null, missingUpdates };
      if (!url) problems.push("Le bot n’est pas encore connecté au site : clique sur « Connecter le bot ».");
      else if (!pointsToSite) problems.push("Le bot est connecté à une autre adresse que investprotrading.fr.");
      else if (missingUpdates.length) problems.push("Le bot ne reçoit pas toutes les informations utiles : reconnecte-le.");
    } catch { problems.push("Impossible de lire l’état de la connexion du bot."); }
  }

  let channel: BotStatus["channel"] = null;
  const channelId = process.env.TELEGRAM_VIP_CHAT_ID || "";
  if (me) {
    if (!/^-100\d+$/.test(channelId)) { channel = { configured: false, isAdmin: false, canInvite: false, canBan: false }; problems.push("Le canal VIP n’est pas renseigné (TELEGRAM_VIP_CHAT_ID)."); }
    else {
      try {
        const member = await telegram("getChatMember", { chat_id: channelId, user_id: me.id }) as ChatMember;
        const isAdmin = member.status === "administrator" || member.status === "creator";
        channel = { configured: true, isAdmin, canInvite: isAdmin && member.can_invite_users !== false, canBan: isAdmin && member.can_restrict_members !== false };
      } catch { channel = { configured: true, isAdmin: false, canInvite: false, canBan: false }; }
      if (!channel.isAdmin) problems.push("Le bot n’est pas administrateur du canal VIP.");
      else {
        if (!channel.canInvite) problems.push("Donne au bot le droit « Inviter des utilisateurs via un lien ».");
        if (!channel.canBan) problems.push("Donne au bot le droit « Bannir des utilisateurs » pour retirer les membres expirés.");
      }
    }
  }
  if (!adminChatConfigured) problems.push("Ton compte Telegram de réception des alertes n’est pas renseigné (TELEGRAM_CHAT_ID).");
  return { configured: true, environment, bot: me ? { username: me.username || null, name: me.first_name || null } : null, webhook, channel, adminChatConfigured, problems };
}

export async function connectBotWebhook(): Promise<void> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (secret.length < 32) throw new Error("WEBHOOK_SECRET");
  await telegram("setWebhook", { url: `${SITE_ORIGIN}/api/telegram/webhook`, secret_token: secret, allowed_updates: BOT_UPDATES, drop_pending_updates: false });
  await telegram("setMyCommands", { commands: [{ command: "start", description: "Activer mes rappels VIP" }, { command: "aide", description: "Contacter l’équipe InvestPro" }] }).catch(() => {});
}

export async function sendAdminTest(): Promise<void> {
  const chat = process.env.TELEGRAM_CHAT_ID || "";
  if (!/^-?\d+$/.test(chat)) throw new Error("ADMIN_CHAT");
  await telegram("sendMessage", { chat_id: chat, text: "✅ <b>Bot InvestPro connecté</b>\nTu recevras ici les nouvelles demandes VIP, les retraits et le résumé du matin.", parse_mode: "HTML" });
}
