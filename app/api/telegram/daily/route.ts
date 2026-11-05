import { timingSafeEqual } from "node:crypto";
import { vipDatabase, vipJson } from "@/lib/vip/membership-server";
import { runVipTelegramDaily, sendMorningSummary } from "@/lib/telegram/vip-daily";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Lancée chaque matin par le cron Vercel : rappels, retraits et résumé. Site principal uniquement. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token = Buffer.from(request.headers.get("authorization") || ""), expected = Buffer.from(secret ? `Bearer ${secret}` : "");
  if (!secret || token.byteLength !== expected.byteLength || !timingSafeEqual(token, expected)) return vipJson({ error: "Accès refusé." }, 401);
  if (process.env.VERCEL_ENV !== "production") return vipJson({ error: "Exécuté uniquement sur le site principal." }, 403);
  if (!process.env.TELEGRAM_BOT_TOKEN) return vipJson({ error: "Bot non configuré." }, 503);
  try {
    const report = await runVipTelegramDaily(vipDatabase());
    await sendMorningSummary(report).catch(() => { console.error("VIP_DAILY_SUMMARY_FAILED"); });
    // Aucun nom ni e-mail dans la réponse ou les journaux : seulement des totaux.
    return vipJson({ ok: true, reminders: report.reminders.length, removed: report.removed.length, manual: report.manual.length, errors: report.errors.length });
  } catch { console.error("VIP_DAILY_FAILED"); return vipJson({ error: "Tâche quotidienne indisponible." }, 503); }
}
