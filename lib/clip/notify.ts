import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { validPushEndpoint } from "@/lib/vip/push-validation";
import { CLIP_PUBLIC_URL } from "@/lib/clip/rules";
import { videoEmail, type VideoNotice } from "@/lib/clip/videoEmail";

/**
 * Nouvelle vidéo publiée par Enrick : notification sur les téléphones abonnés + e-mail aux clippeurs
 * (en test ou actifs). Une seule vague par vidéo, lancée à la publication.
 */

export type { VideoNotice };
/** Bilan : clippeurs concernés, clippeurs prévenus (au moins un canal), puis par canal. */
export type NotifyResult = { clippers: number; reached: number; push: number; email: number; failed: number; emailReady: boolean };

type Recipient = { id: string; user_id: string; display_name: string; notify_email: boolean };
type Device = { id: string; clipper_id: string; endpoint: string; p256dh: string; auth: string; home: string };
type Outcome = { reached: Set<string>; failed: number };

const PUSH_ICON = "/clip-app/icon-192.png";
const PUSH_BADGE = "/clip-app/badge-96.png";

/** Même identité web-push que le reste du site (une clé VAPID par projet). */
export function clipPushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "";
  return { publicKey, privateKey, subject, available: Boolean(publicKey && privateKey && subject) };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

/** Lance au plus `limit` envois en même temps ; `run` ne doit pas lever d'erreur. */
async function eachLimited<T>(items: readonly T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await run(item);
    }
  });
  await Promise.all(workers);
}

// ——— Désabonnement des e-mails : lien signé, propre à chaque clippeur ———

function emailOptOutToken(clipperId: string): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`clip-email-optout:${clipperId}`).digest("base64url").slice(0, 32);
}

export function validEmailOptOut(clipperId: string, token: string): boolean {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clipperId) || !/^[A-Za-z0-9_-]{32}$/.test(token)) return false;
  const expected = emailOptOutToken(clipperId);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function emailOptOutUrl(clipperId: string): string | null {
  const token = emailOptOutToken(clipperId);
  return token ? `${CLIP_PUBLIC_URL}/api/clip/emails?c=${clipperId}&t=${token}` : null;
}

// ——— Notifications sur les téléphones ———

async function pushNewVideo(db: SupabaseClient, recipients: Recipient[], notice: VideoNotice): Promise<Outcome> {
  const outcome: Outcome = { reached: new Set(), failed: 0 };
  const config = clipPushConfig();
  if (!config.available) return outcome;
  const { data, error } = await db.from("clip_push_subscriptions").select("id,clipper_id,endpoint,p256dh,auth,home").in("clipper_id", recipients.map((recipient) => recipient.id)).limit(2000);
  if (error) {
    console.error("[clip-notify] appareils illisibles", error.code);
    return outcome;
  }
  const devices = (data ?? []) as unknown as Device[];
  const body = notice.campaign ? `${notice.title} · ${notice.campaign}` : notice.title;
  await eachLimited(devices, 10, async (device) => {
    if (!validPushEndpoint(device.endpoint)) return;
    const payload = JSON.stringify({
      title: "Nouvelle vidéo à clipper 🎬",
      body,
      url: `${device.home === "/clip/login" ? "/clip/login" : "/login"}#campagnes`,
      tag: `clip-video-${notice.id}`,
      icon: PUSH_ICON,
      badge: PUSH_BADGE,
    });
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        payload,
        { TTL: 86_400, urgency: "normal", timeout: 8000, vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey } },
      );
      outcome.reached.add(device.clipper_id);
    } catch (cause) {
      const status = Number((cause as { statusCode?: number } | null)?.statusCode || 0);
      // Abonnement expiré ou retiré du téléphone : on l'oublie, ce n'est pas un échec.
      if (status === 404 || status === 410) await db.from("clip_push_subscriptions").delete().eq("id", device.id);
      else outcome.failed += 1;
    }
  });
  return outcome;
}

// ——— E-mails ———

/** Nom d'expéditeur « InvestPro Clip », avec l'adresse déjà vérifiée du site. */
function clipSender(from: string): string {
  const address = from.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/)?.[1] ?? (/^[^<>\s]+@[^<>\s]+$/.test(from.trim()) ? from.trim() : null);
  return address ? `InvestPro Clip <${address}>` : from;
}

async function emailNewVideo(db: SupabaseClient, recipients: Recipient[], notice: VideoNotice): Promise<Outcome & { ready: boolean }> {
  const outcome = { reached: new Set<string>(), failed: 0, ready: false };
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INVESTPRO_EMAIL_FROM;
  if (!key || !from) return outcome;
  outcome.ready = true;
  if (!recipients.length) return outcome;

  const addressed: { clipperId: string; email: string; first: string }[] = [];
  await eachLimited(recipients, 8, async (recipient) => {
    try {
      const { data, error } = await db.auth.admin.getUserById(recipient.user_id);
      const email = error ? null : data.user?.email ?? null;
      if (email) addressed.push({ clipperId: recipient.id, email, first: firstName(recipient.display_name) });
      else outcome.failed += 1;
    } catch {
      outcome.failed += 1;
    }
  });

  const sender = clipSender(from);
  for (let start = 0; start < addressed.length; start += 100) {
    const chunk = addressed.slice(start, start + 100);
    const messages = chunk.map((recipient) => {
      const optOut = emailOptOutUrl(recipient.clipperId);
      const content = videoEmail({ first: recipient.first, notice, optOut });
      return {
        from: sender,
        to: [recipient.email],
        subject: content.subject,
        html: content.html,
        text: content.text,
        ...(optOut ? { headers: { "List-Unsubscribe": `<${optOut}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
      };
    });
    try {
      const response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          // Une adresse refusée n'empêche pas les autres de partir.
          "x-batch-validation": "permissive",
          "Idempotency-Key": `clip-video-${notice.id}-${start}`,
        },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        console.error("[clip-notify] e-mails refusés par le service", response.status);
        outcome.failed += chunk.length;
        continue;
      }
      const result = (await response.json().catch(() => null)) as { errors?: { index?: number }[] } | null;
      const refused = new Set((Array.isArray(result?.errors) ? result.errors : []).map((item) => Number(item.index)));
      chunk.forEach((recipient, index) => {
        if (refused.has(index)) outcome.failed += 1;
        else outcome.reached.add(recipient.clipperId);
      });
    } catch {
      console.error("[clip-notify] envoi des e-mails impossible");
      outcome.failed += chunk.length;
    }
  }
  return outcome;
}

/** Prévient tous les clippeurs en test ou actifs ; les e-mails seulement à ceux qui ne les ont pas coupés. */
export async function notifyNewVideo(db: SupabaseClient, notice: VideoNotice): Promise<NotifyResult> {
  const { data, error } = await db.from("clip_clippers").select("id,user_id,display_name,notify_email").in("status", ["test", "active"]).limit(2000);
  if (error) throw error;
  const recipients = (data ?? []) as unknown as Recipient[];
  const result: NotifyResult = { clippers: recipients.length, reached: 0, push: 0, email: 0, failed: 0, emailReady: false };
  if (!recipients.length) return result;
  const [push, email] = await Promise.all([
    pushNewVideo(db, recipients, notice),
    emailNewVideo(db, recipients.filter((recipient) => recipient.notify_email !== false), notice),
  ]);
  result.push = push.reached.size;
  result.email = email.reached.size;
  result.emailReady = email.ready;
  result.reached = new Set([...push.reached, ...email.reached]).size;
  result.failed = push.failed + email.failed;
  console.info("[clip-notify] nouvelle vidéo", { video: notice.id, clippers: result.clippers, reached: result.reached, push: result.push, email: result.email, failed: result.failed });
  return result;
}
