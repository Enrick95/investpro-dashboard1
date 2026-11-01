import { timingSafeEqual } from "node:crypto";
import { telegram } from "@/lib/telegram/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const secret = process.env.ESSAI_VIP_SETUP_SECRET;
  if (process.env.VERCEL_ENV !== "production" || !secret || !/^[a-f0-9]{32,}$/i.test(secret)) {
    return json({ ok: false }, 404);
  }
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return json({ ok: false }, 403);
  }

  try {
    const [me, webhook] = await Promise.all([telegram("getMe"), telegram("getWebhookInfo")]);
    if (typeof me?.username !== "string" || !me.username || typeof webhook?.url !== "string") throw new Error("PROVIDER");
    const botUsername = me.username;
    const webhookActive = webhook.url.length > 0;
    if (webhookActive) {
      return json({ botUsername, webhookActive, candidates: [], candidateCount: 0, blocker: "webhook_active" });
    }

    // No offset, allowed_updates or webhook changes: preserve the bot's delivery configuration.
    const updates: unknown = await telegram("getUpdates", { limit: 100, timeout: 0 });
    if (!Array.isArray(updates)) throw new Error("PROVIDER");
    const candidates: { chatId: string; username: string }[] = [];
    const seen = new Set<string>();
    for (const update of updates) {
      const message = update?.message;
      const chat = message?.chat;
      if (chat?.type !== "private" || typeof chat.username !== "string" || chat.username.toLowerCase() !== "equipeinvestpro") continue;
      if (typeof message.text !== "string" || !/^\/start(?:@\w+)?(?:\s|$)/.test(message.text)) continue;
      if (!Number.isSafeInteger(chat.id) || chat.id <= 0) continue;
      const chatId = String(chat.id);
      if (seen.has(chatId)) continue;
      seen.add(chatId);
      candidates.push({ chatId, username: chat.username });
    }
    return json({ botUsername, webhookActive, candidates, candidateCount: candidates.length });
  } catch {
    return json({ ok: false }, 503);
  }
}
