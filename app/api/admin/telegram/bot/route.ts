import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/admin/permissions";
import { isSameVipOrigin } from "@/lib/vip/membership";
import { connectBotWebhook, readBotStatus, sendAdminTest } from "@/lib/telegram/bot-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Réservé au propriétaire : état du bot (sans aucun secret) et connexion du webhook. */
async function owner(request: Request) {
  const result = await authenticateAdmin(request);
  if ("error" in result) return { response: json({ error: result.error }, result.status) };
  if (!result.access.owner) return { response: json({ error: "Réservé au propriétaire." }, 403) };
  return { ok: true as const };
}

export async function GET(request: Request) {
  const check = await owner(request);
  if ("response" in check) return check.response;
  try { return json(await readBotStatus()); }
  catch { return json({ error: "État du bot indisponible." }, 503); }
}

export async function POST(request: Request) {
  if (!isSameVipOrigin(request)) return json({ error: "Origine refusée." }, 403);
  const check = await owner(request);
  if ("response" in check) return check.response;
  let action = "";
  try { const body = await request.json() as { action?: unknown }; action = typeof body.action === "string" ? body.action : ""; } catch { /* invalid body */ }
  if (process.env.VERCEL_ENV !== "production") return json({ error: "Le bot se branche uniquement depuis le site principal (investprotrading.fr)." }, 409);
  try {
    if (action === "connect") { await connectBotWebhook(); return json({ ok: true, status: await readBotStatus() }); }
    if (action === "test") { await sendAdminTest(); return json({ ok: true }); }
    return json({ error: "Action inconnue." }, 400);
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (code === "WEBHOOK_SECRET") return json({ error: "Le secret du webhook (TELEGRAM_WEBHOOK_SECRET) est manquant ou trop court." }, 409);
    if (code === "ADMIN_CHAT") return json({ error: "TELEGRAM_CHAT_ID n’est pas renseigné." }, 409);
    return json({ error: action === "test" ? "Telegram a refusé l’envoi : envoie d’abord /start au bot depuis ton compte." : "Telegram a refusé la connexion. Vérifie le token du bot." }, 502);
  }
}
