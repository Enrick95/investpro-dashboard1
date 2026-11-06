import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerIds } from "@/lib/admin/permissions";
import { queueVipAdminActivity } from "@/lib/vip/admin-activity";
import { deliverVipNotifications } from "@/lib/vip/notifications";
import { telegram } from "@/lib/telegram/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notification « téléphone » à l'équipe pour toute nouvelle demande VIP (abonnement, affiliation, paiement Stripe) :
 *  - notification push sur les téléphones où l'alerte admin est activée (+ cloche du site),
 *  - envoi immédiat de la file push existante.
 * Ne bloque jamais la demande du client : toute erreur est seulement journalisée (sans données personnelles).
 */
export async function pushAdminNotice(db: SupabaseClient, id: string, title: string, message: string) {
  if (process.env.VERCEL_ENV !== "production" || !UUID.test(id)) return;
  try {
    // Demandes de la table vip_access_requests : le déclencheur base de données a déjà créé l'événement.
    await queueVipAdminActivity(db).catch(() => { console.error("VIP_ADMIN_ACTIVITY_QUEUE_FAILED"); });
    const { data: staff } = await db.from("admin_staff_permissions").select("user_id,permissions").eq("enabled", true);
    const recipients = [...new Set([...ownerIds(), ...(staff || []).filter(s => Array.isArray(s.permissions) && s.permissions.includes("users_write")).map(s => s.user_id as string)])].filter(v => UUID.test(v));
    if (recipients.length) {
      const href = "/dashboard/admin?tool=vip&view=requests";
      const rows = recipients.map(user_id => ({ user_id, event_key: `vip:admin:request:${id}:${user_id}`, title: title.slice(0, 120), message: message.slice(0, 500), href }));
      await db.from("investpro_notifications").upsert(rows, { onConflict: "event_key", ignoreDuplicates: true });
      await db.from("vip_notification_outbox").upsert(rows.map(r => ({ ...r, kind: "admin_event" })), { onConflict: "event_key", ignoreDuplicates: true });
    }
    await deliverVipNotifications(db);
  } catch { console.error("VIP_ADMIN_PUSH_FAILED"); }
}

/** Message Telegram à Enrick, avec une seconde tentative sans boutons ni mise en forme si la première échoue. */
export async function telegramAdmin(text: string, buttons?: { text: string; url: string }[]): Promise<boolean> {
  const chat = process.env.TELEGRAM_CHAT_ID || "";
  if (!process.env.TELEGRAM_BOT_TOKEN || !/^-?\d+$/.test(chat)) { console.error("VIP_TELEGRAM_NOT_CONFIGURED"); return false; }
  try {
    await telegram("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...(buttons?.length ? { reply_markup: { inline_keyboard: [buttons] } } : {}) });
    return true;
  } catch {
    try { await telegram("sendMessage", { chat_id: chat, text: text.replace(/<\/?[a-z][^>]*>/gi, ""), disable_web_page_preview: true }); return true; }
    catch { console.error("VIP_TELEGRAM_ALERT_FAILED"); return false; }
  }
}
