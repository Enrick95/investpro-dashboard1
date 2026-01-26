import { NextResponse } from "next/server";

export const runtime = "nodejs";

let cache: Record<string, { at: number; data: any }> = {};
const TTL_MS = 15_000;

/**
 * IMPORTANT :
 * - On ne détecte PLUS avec "/live" (trop de faux positifs)
 * - On ne valide que des flags explicites "true"
 */
function detectLive(html: string) {
  const h = html.toLowerCase();

  // flags explicites
  if (/"islive"\s*:\s*true/.test(h)) return true;
  if (/"is_live"\s*:\s*true/.test(h)) return true;
  if (/"live"\s*:\s*true/.test(h)) return true;

  // sinon => pas live
  return false;
}

async function getLiveStatus(username?: string) {
  const now = Date.now();

  const envUsername = (process.env.TIKTOK_USERNAME || "").trim();
  const u = (username || envUsername).trim();

  const LIVE_URL =
    (process.env.TIKTOK_LIVE_URL || "").trim() ||
    (u ? `https://www.tiktok.com/@${u}/live` : "");

  const cacheKey = u || "default";

  const hit = cache[cacheKey];
  if (hit && now - hit.at < TTL_MS) return hit.data;

  if (!LIVE_URL) {
    const data = { ok: true, isLive: false, url: "", reason: "missing_username", checkedAt: now };
    cache[cacheKey] = { at: now, data };
    return data;
  }

  try {
    const r = await fetch(LIVE_URL, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
      cache: "no-store",
    });

    const html = await r.text();
    const isLive = r.ok ? detectLive(html) : false;

    // ✅ si pas live, on renvoie url vide (ça évite d’afficher un bouton live inutile)
    const data = {
      ok: true,
      isLive,
      url: isLive ? LIVE_URL : "",
      status: r.status,
      checkedAt: now,
      username: u || envUsername || null,
    };

    cache[cacheKey] = { at: now, data };
    return data;
  } catch (e: any) {
    const data = {
      ok: true,
      isLive: false,
      url: "",
      reason: "fetch_failed",
      detail: String(e?.message ?? e),
      checkedAt: now,
      username: u || envUsername || null,
    };
    cache[cacheKey] = { at: now, data };
    return data;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = (searchParams.get("username") || "").trim();
  const data = await getLiveStatus(username || undefined);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  let username: string | undefined;
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body.username === "string") username = body.username.trim();
  } catch {
    // ignore
  }
  const data = await getLiveStatus(username || undefined);
  return NextResponse.json(data);
}
