import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { database } from "@/lib/telegram/server";

type EssaiVipRateLimit = { allowed: boolean; retryAfterSeconds: number };

const UNAVAILABLE = "ESSAI_VIP_RATE_LIMIT_UNAVAILABLE";

function normalizeIp(address: string): string {
  const family = isIP(address);
  if (family === 4) return address;
  if (family !== 6 || address.includes("%")) throw new Error(UNAVAILABLE);

  // WHATWG URL serialization collapses equivalent IPv6 spellings and casing.
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (!mapped) return canonical;
  // IPv4-mapped IPv6 must share the original IPv4 address's bucket.
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

export async function consumeEssaiVipRateLimit(request: Request): Promise<EssaiVipRateLimit> {
  try {
    const secret = process.env.TELEGRAM_BOT_TOKEN;
    if (process.env.VERCEL !== "1" || !secret || secret.trim() !== secret) throw new Error(UNAVAILABLE);

    // Trust only Vercel's overwritten ingress headers, never arbitrary forwarding lists.
    // https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
    const address = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-real-ip");
    if (!address) throw new Error(UNAVAILABLE);
    const bucket = createHmac("sha256", secret).update(`essai-vip:v1:${normalizeIp(address)}`).digest("hex");
    const { data, error } = await database().rpc("consume_essai_vip_rate_limit", { p_bucket: bucket });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new Error(UNAVAILABLE);

    const result = data as Record<string, unknown>;
    const allowed = result.allowed;
    const retryAfterSeconds = result.retry_after_seconds;
    if (
      typeof allowed !== "boolean" || typeof retryAfterSeconds !== "number" ||
      !Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds < 0 || retryAfterSeconds > 3600 ||
      (allowed ? retryAfterSeconds !== 0 : retryAfterSeconds < 1)
    ) throw new Error(UNAVAILABLE);

    return { allowed, retryAfterSeconds };
  } catch {
    // Provider errors can contain connection details. Expose only a fixed failure.
    throw new Error(UNAVAILABLE);
  }
}
