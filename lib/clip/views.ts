import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Vues relevées automatiquement sur la page publique du clip, sans compte ni clé :
 * TikTok (données de la page vidéo, avec j'aime, commentaires, partages et enregistrements)
 * et YouTube (page de la vidéo). Instagram, Facebook,
 * Snapchat et X ne montrent pas leurs vues sans connexion : Enrick les saisit à la main.
 */
export const AUTO_VIEW_PLATFORMS = ["tiktok", "youtube"] as const;
export type ViewError = "unsupported" | "not_found" | "blocked" | "unreadable" | "timeout";
/** Interactions publiques d'une vidéo TikTok, relevées avec ses vues (enregistrements : parfois absents). */
export type ClipEngagement = { likes: number; comments: number; shares: number; saves: number | null };
export type ViewResult = { views: number; engagement: ClipEngagement | null } | { error: ViewError };
export type ViewClip = { id: string; url: string; platform: string; views: number | string | null; frozen_views: number | string | null };

export function autoViews(platform: string): boolean {
  return (AUTO_VIEW_PLATFORMS as readonly string[]).includes(platform);
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

async function page(url: string, timeoutMs: number, extra: Record<string, string> = {}) {
  const response = await fetch(url, { headers: { ...HEADERS, ...extra }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  return { status: response.status, url: response.url, html: await response.text() };
}

type TikTokStats = { playCount?: number | string; diggCount?: number | string; commentCount?: number | string; shareCount?: number | string; collectCount?: number | string };

/** Premier compteur lisible (les données de la page donnent des nombres ou des textes). */
function counter(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return null;
}

function tiktokEngagement(primary: TikTokStats | undefined, backup: TikTokStats | undefined): ClipEngagement | null {
  const likes = counter(primary?.diggCount, backup?.diggCount);
  const comments = counter(primary?.commentCount, backup?.commentCount);
  const shares = counter(primary?.shareCount, backup?.shareCount);
  if (likes === null || comments === null || shares === null) return null;
  return { likes, comments, shares, saves: counter(primary?.collectCount, backup?.collectCount) };
}

/** TikTok : compteurs de la vidéo dans les données de la page (jamais ceux d'une autre vidéo). */
function tiktokStats(html: string, videoId: string | null): { views: number; engagement: ClipEngagement | null } | null {
  const marker = html.indexOf('id="__UNIVERSAL_DATA_FOR_REHYDRATION__"');
  if (marker >= 0) {
    const start = html.indexOf(">", marker) + 1;
    const end = html.indexOf("</script>", start);
    try {
      const data = JSON.parse(html.slice(start, end)) as { __DEFAULT_SCOPE__?: Record<string, { itemInfo?: { itemStruct?: { id?: string; stats?: TikTokStats; statsV2?: TikTokStats } } }> };
      const item = data.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
      if (item && (!videoId || String(item.id) === videoId)) {
        const views = counter(item.statsV2?.playCount, item.stats?.playCount);
        if (views !== null) return { views, engagement: tiktokEngagement(item.statsV2, item.stats) };
      }
    } catch {
      // format inattendu : lecture de secours juste après l'identifiant de la vidéo
    }
  }
  if (!videoId) return null;
  const at = html.indexOf(`"id":"${videoId}"`);
  if (at < 0) return null;
  const chunk = html.slice(at, at + 20_000);
  const read = (key: string) => chunk.match(new RegExp(`"${key}":"?(\\d+)`))?.[1];
  const views = counter(read("playCount"));
  if (views === null) return null;
  return { views, engagement: tiktokEngagement({ diggCount: read("diggCount"), commentCount: read("commentCount"), shareCount: read("shareCount"), collectCount: read("collectCount") }, undefined) };
}

export function youtubeId(url: string): string | null {
  return url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/)?.[1] ?? null;
}

/** YouTube : nombre de vues dans la fiche de la vidéo (videoDetails). */
function youtubeViews(html: string, id: string): number | null {
  const at = html.indexOf(`"videoDetails":{"videoId":"${id}"`);
  if (at < 0) return null;
  const match = html.slice(at, at + 60_000).match(/"viewCount":"(\d+)"/);
  return match ? Number(match[1]) : null;
}

export async function readClipViews(url: string, platform: string, timeoutMs = 9000): Promise<ViewResult> {
  try {
    if (platform === "tiktok") {
      // Les liens courts (vm.tiktok.com) redirigent vers la page de la vidéo : une seule requête suffit.
      const result = await page(url, timeoutMs);
      if (result.status === 404) return { error: "not_found" };
      if (result.status >= 400) return { error: "blocked" };
      const id = result.url.match(/\/(?:video|photo)\/(\d+)/)?.[1] ?? url.match(/\/(?:video|photo)\/(\d+)/)?.[1] ?? null;
      return tiktokStats(result.html, id) ?? { error: "unreadable" };
    }
    if (platform === "youtube") {
      const id = youtubeId(url);
      if (!id) return { error: "not_found" };
      const result = await page(`https://www.youtube.com/watch?v=${id}&hl=en`, timeoutMs, { Cookie: "CONSENT=YES+cb; SOCS=CAI" });
      if (result.status >= 400) return { error: result.status === 404 ? "not_found" : "blocked" };
      const views = youtubeViews(result.html, id);
      return views === null ? { error: "unreadable" } : { views, engagement: null };
    }
    return { error: "unsupported" };
  } catch (error) {
    return { error: error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "unreadable" };
  }
}

/**
 * Relève les vues de ces clips et les enregistre (avec un relevé pour les courbes quand elles changent).
 * Quelques pages à la fois, dans le temps imparti ; les clips restants attendent le prochain passage.
 */
export async function refreshClipViews(db: SupabaseClient, clips: ViewClip[], budgetMs: number, concurrency = 3) {
  const deadline = Date.now() + budgetMs;
  const outcome = { updated: 0, failed: 0, skipped: 0 };
  const queue = clips.filter((clip) => autoViews(clip.platform));
  outcome.skipped = clips.length - queue.length;
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const clip = queue[next];
      next += 1;
      const left = deadline - Date.now();
      if (left < 3000) {
        outcome.skipped += 1;
        continue;
      }
      const result = await readClipViews(clip.url, clip.platform, Math.min(9000, left - 1000));
      const now = new Date().toISOString();
      try {
        if ("views" in result) {
          const previous = Number(clip.frozen_views ?? clip.views) || 0;
          const update: Record<string, number | string | null> = { views: result.views, views_updated_at: now, views_auto_at: now, views_auto_error: null };
          // Comme la saisie admin : les vues restent à jour même sur un clip figé ou payé.
          if (clip.frozen_views !== null && clip.frozen_views !== undefined) update.frozen_views = result.views;
          // TikTok : j'aime, commentaires, partages et enregistrements relevés avec les vues.
          if (result.engagement) Object.assign(update, { ...result.engagement, engagement_at: now });
          const { error } = await db.from("clip_clips").update(update).eq("id", clip.id).neq("status", "rejected");
          if (error) throw error;
          if (result.views !== previous) {
            const { error: snapshotError } = await db.from("clip_view_snapshots").insert({ clip_id: clip.id, views: result.views });
            if (snapshotError) throw snapshotError;
          }
          outcome.updated += 1;
        } else {
          await db.from("clip_clips").update({ views_auto_at: now, views_auto_error: result.error }).eq("id", clip.id);
          outcome.failed += 1;
        }
      } catch {
        outcome.failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return outcome;
}

/** Clips à relever : pas refusés, sur TikTok ou YouTube, publiés depuis moins de 45 jours, les plus anciens relevés d'abord. */
export async function dueViewClips(db: SupabaseClient, limit: number, options: { clipperId?: string; staleMs?: number } = {}): Promise<ViewClip[]> {
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
  let query = db
    .from("clip_clips")
    .select("id,url,platform,views,frozen_views")
    .in("status", ["review", "approved"])
    .in("platform", [...AUTO_VIEW_PLATFORMS])
    .gte("published_at", since);
  if (options.clipperId) query = query.eq("clipper_id", options.clipperId);
  if (options.staleMs) query = query.or(`views_auto_at.is.null,views_auto_at.lt.${new Date(Date.now() - options.staleMs).toISOString()}`);
  const { data, error } = await query.order("views_auto_at", { ascending: true, nullsFirst: true }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ViewClip[];
}
