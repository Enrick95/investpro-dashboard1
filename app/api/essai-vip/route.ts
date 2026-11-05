import { buildEssaiVipMessage, validateEssaiVipPayload } from "@/lib/essai-vip";
import { consumeEssaiVipRateLimit } from "@/lib/essai-vip-rate-limit";
import { telegram } from "@/lib/telegram/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8192;

function json(ok: boolean, status = 200, headers: Record<string, string> = {}, error?: string) {
  return Response.json(error ? { ok, error } : { ok }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function isSameOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") return false;
  const origin = request.headers.get("origin");
  // Non-browser callers such as the documented curl test do not send Origin.
  if (origin === null) return true;
  try {
    return new URL(origin).origin === origin && origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readBoundedJson(request: Request): Promise<{ value: unknown } | { status: number }> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { status: 415 };
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) return { status: 400 };
    if (Number(length) > MAX_BODY_BYTES) return { status: 413 };
  }
  if (!request.body) return { status: 400 };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let raw = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return { status: 413 };
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return { value: JSON.parse(raw) as unknown };
  } catch {
    return { status: 400 };
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json(false, 403);
  const parsed = await readBoundedJson(request);
  if ("status" in parsed) return json(false, parsed.status);
  const validation = validateEssaiVipPayload(parsed.value);
  if (validation.kind === "honeypot") return json(true);
  if (validation.kind === "invalid-telegram") return json(false, 400, {}, "telegram");
  if (validation.kind === "invalid") return json(false, 400);

  // Previews must never forward demo credentials to the live team's Telegram.
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (process.env.VERCEL_ENV !== "production" || !token || !/^\d+:[A-Za-z0-9_-]+$/.test(token) || !chatId || !/^-?[1-9]\d{0,19}$/.test(chatId)) {
    return json(false, 503);
  }

  try {
    const limit = await consumeEssaiVipRateLimit(request);
    if (!limit.allowed) return json(false, 429, { "Retry-After": String(Math.max(1, Math.ceil(limit.retryAfterSeconds))) });
  } catch {
    return json(false, 503);
  }

  try {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: buildEssaiVipMessage(validation.value),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    return json(true);
  } catch {
    // The shared Telegram helper verifies HTTP + Telegram's ok and sanitizes failures.
    return json(false, 502);
  }
}
