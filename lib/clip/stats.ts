import { clipViewsOf, type ClipRow } from "./rules";

/** Un relevé de vues d'un clip (table clip_view_snapshots). */
export type ViewSnapshot = { clip_id: string; views: number | string; recorded_at: string };

const DAY = 86_400_000;

/** Numéro du jour local (fuseau du navigateur), comme la courbe de l'admin. */
export function dayNumber(time: number): number {
  const date = new Date(time);
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
}

export function dayIso(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

/**
 * Vues gagnées par jour à partir des relevés : même calcul que la courbe de l'admin.
 * Chaque hausse est répartie entre le relevé précédent (ou la publication) et ce relevé ;
 * une correction à la baisse plafonne les relevés plus anciens.
 */
export function viewGains(
  clips: Pick<ClipRow, "id" | "status" | "views" | "frozen_views" | "views_updated_at" | "published_at">[],
  snapshots: ViewSnapshot[],
  startDay: number,
  days: number,
): { daily: number[]; byClip: Map<string, number> } {
  const daily = new Array<number>(days).fill(0);
  const byClip = new Map<string, number>();
  const grouped = new Map<string, { time: number; views: number }[]>();
  for (const snapshot of snapshots) {
    const list = grouped.get(snapshot.clip_id) ?? [];
    list.push({ time: new Date(snapshot.recorded_at).getTime(), views: Number(snapshot.views) || 0 });
    grouped.set(snapshot.clip_id, list);
  }
  const lastDay = startDay + days - 1;
  for (const clip of clips) {
    if (clip.status === "rejected") continue;
    let points = (grouped.get(clip.id) ?? []).sort((a, b) => a.time - b.time);
    if (!points.length) {
      const views = clipViewsOf(clip);
      if (views <= 0) continue;
      points = [{ time: new Date(clip.views_updated_at ?? clip.published_at).getTime(), views }];
    }
    for (let index = points.length - 2; index >= 0; index -= 1) points[index] = { ...points[index], views: Math.min(points[index].views, points[index + 1].views) };
    let prevTime = new Date(clip.published_at).getTime();
    let prevViews = 0;
    let inWindow = 0;
    for (const point of points) {
      const delta = point.views - prevViews;
      if (delta > 0) {
        const from = dayNumber(Math.min(prevTime, point.time));
        const to = dayNumber(point.time);
        const share = delta / Math.max(1, to - from + 1);
        for (let day = Math.max(from, startDay); day <= Math.min(to, lastDay); day += 1) {
          daily[day - startDay] += share;
          inWindow += share;
        }
        prevViews = point.views;
      }
      prevTime = Math.max(prevTime, point.time);
    }
    if (inWindow > 0) byClip.set(clip.id, inWindow);
  }
  return { daily, byClip };
}
