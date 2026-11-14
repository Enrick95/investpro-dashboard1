import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Captures des stats d'un clip : stockage privé, lues par liens signés. */
export const CAPTURE_BUCKET = "clip-analytics";
export const CAPTURE_MAX_BYTES = 8 * 1024 * 1024;
export const CAPTURES_PER_CLIP = 6;
export const CAPTURE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const LINK_SECONDS = 3600;

export type CaptureRow = { id: string; clip_id: string; clipper_id: string; path: string; created_at: string };
export type CaptureLink = { id: string; clip_id: string; url: string; created_at: string };

/** Chemin réservé à ce clippeur et à ce clip : clippeur/clip/fichier. */
export function capturePath(clipperId: string, clipId: string, file: string): string {
  return `${clipperId}/${clipId}/${file}`;
}

export function capturePathOk(path: string, clipperId: string, clipId: string): boolean {
  return new RegExp(`^${clipperId}/${clipId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(path);
}

/** Les premiers octets doivent correspondre au type annoncé (une image, pas autre chose). */
export function imageBytesMatch(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mime === "image/webp") return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return false;
}

/** Liens signés (1 h) pour afficher les captures ; une capture illisible est simplement omise. */
export async function captureLinks(db: SupabaseClient, rows: CaptureRow[]): Promise<CaptureLink[]> {
  if (!rows.length) return [];
  const { data, error } = await db.storage.from(CAPTURE_BUCKET).createSignedUrls(rows.map((row) => row.path), LINK_SECONDS);
  if (error || !data) {
    console.error("Captures des stats illisibles :", error?.message ?? "inconnu");
    return [];
  }
  const byPath = new Map<string, string>();
  for (const item of data) if (item.path && item.signedUrl) byPath.set(item.path, item.signedUrl);
  return rows.flatMap((row) => {
    const url = byPath.get(row.path);
    return url ? [{ id: row.id, clip_id: row.clip_id, url, created_at: row.created_at }] : [];
  });
}
