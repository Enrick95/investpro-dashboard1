import { serviceDb } from "@/lib/clip/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Diagnostic temporaire (préproduction seulement) : peut-on lire les vues des clips depuis les serveurs Vercel ? */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };

async function probe(label: string, url: string, patterns: RegExp[], extra: Record<string, string> = {}) {
  try {
    const response = await fetch(url, { headers: { ...HEADERS, ...extra }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
    const body = await response.text();
    const found: Record<string, string | null> = {};
    for (const pattern of patterns) found[pattern.source.slice(0, 40)] = body.match(pattern)?.[1] ?? null;
    return { label, status: response.status, finalHost: new URL(response.url).host, finalPath: new URL(response.url).pathname.replace(/[A-Za-z0-9_.-]{3,}/g, (s) => (/^\d+$/.test(s) ? "<id>" : s.length > 12 ? "<x>" : s)), length: body.length, found, markers: { captcha: /captcha|verify/i.test(body.slice(0, 20000)), login: /login|connexion/i.test(body.slice(0, 5000)) } };
  } catch (error) {
    return { label, error: error instanceof Error ? error.name + ": " + error.message.slice(0, 80) : "unknown" };
  }
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return new Response("Not found", { status: 404 });
  const { data } = await serviceDb().from("clip_clips").select("platform,url").limit(20);
  const clips = (data ?? []) as { platform: string; url: string }[];
  const out: unknown[] = [];
  for (const clip of clips) {
    if (clip.platform === "tiktok") {
      // Lien court vm.tiktok.com : on suit la redirection pour trouver l'identifiant de la vidéo.
      let resolved = clip.url;
      try {
        const r = await fetch(clip.url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(10_000) });
        resolved = r.url;
        await r.body?.cancel();
      } catch {}
      const id = resolved.match(/\/video\/(\d+)/)?.[1] ?? clip.url.match(/\/video\/(\d+)/)?.[1] ?? null;
      out.push({
        platform: "tiktok",
        idFound: Boolean(id),
        page: await probe("page", resolved, [/"playCount":(\d+)/, /"diggCount":(\d+)/, /(__UNIVERSAL_DATA_FOR_REHYDRATION__)/]),
        embed: id ? await probe("embed", `https://www.tiktok.com/embed/v2/${id}`, [/"playCount":(\d+)/, /"play_count":(\d+)/]) : null,
        oembed: await probe("oembed", `https://www.tiktok.com/oembed?url=${encodeURIComponent(resolved)}`, [/"author_name":"([^"]{0,3})/]),
      });
    } else if (clip.platform === "youtube") {
      const id = clip.url.match(/(?:youtu\.be\/|v=|shorts\/)([A-Za-z0-9_-]{11})/)?.[1] ?? null;
      out.push({
        platform: "youtube",
        idFound: Boolean(id),
        watch: id ? await probe("watch", `https://www.youtube.com/watch?v=${id}&hl=en`, [/"viewCount":"(\d+)"/, /"viewCount":\{"simpleText":"([^"]+)"/], { Cookie: "CONSENT=YES+cb; SOCS=CAI" }) : null,
        shorts: id ? await probe("shorts", `https://www.youtube.com/shorts/${id}?hl=en`, [/"viewCount":"(\d+)"/]) : null,
      });
    } else if (clip.platform === "instagram") {
      const code = clip.url.match(/\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
      out.push({
        platform: "instagram",
        idFound: Boolean(code),
        page: code ? await probe("page", `https://www.instagram.com/reel/${code}/`, [/"video_view_count":(\d+)/, /"play_count":(\d+)/, /"view_count":(\d+)/]) : null,
        embed: code ? await probe("embed", `https://www.instagram.com/reel/${code}/embed/captioned/`, [/"video_view_count":(\d+)/, /"play_count":(\d+)/, /([0-9,.]+[KMk]? (?:views|vues|plays))/]) : null,
      });
    }
  }
  return Response.json({ region: process.env.VERCEL_REGION ?? null, results: out }, { headers: { "Cache-Control": "no-store" } });
}
