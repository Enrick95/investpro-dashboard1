import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { VipRequestError } from "./membership-server";
import { isVipPostId } from "./post-validation";
import type { VipPost } from "./types";

export const VIP_FAVORITES_PAGE_SIZE = 50;
export type VipFavoriteCursor = { createdAt: string; postId: string };
const timestamp = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !timestamp.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (year < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function encodeVipFavoriteCursor(cursor: VipFavoriteCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.postId]), "utf8").toString("base64url");
}

/** Only a bounded timestamp/UUID tuple reaches the PostgREST keyset filter. */
export function decodeVipFavoriteCursor(value: string | null): VipFavoriteCursor | null {
  if (value === null) return null;
  try {
    if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error();
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw Error();
    const decoded: unknown = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(decoded) || decoded.length !== 2 || !validTimestamp(decoded[0]) || !isVipPostId(decoded[1])) throw Error();
    return { createdAt: decoded[0], postId: decoded[1].toLowerCase() };
  } catch { throw new VipRequestError("Page de favoris invalide.", 400); }
}

/** Called only after requireVipAccess; never returns favorite owners or other members' saves. */
export async function markVipPostFavorites(db: SupabaseClient, posts: VipPost[], userId: string): Promise<VipPost[]> {
  if (!posts.length) return [];
  if (posts.length > 100) throw new VipRequestError("Favoris indisponibles.", 503);
  const { data, error } = await db.from("vip_post_favorites").select("post_id").eq("user_id", userId).in("post_id", posts.map(post => post.id));
  if (error || !Array.isArray(data)) throw new VipRequestError("Favoris indisponibles.", 503);
  const saved = new Set(data.map(row => row.post_id));
  return posts.map(post => ({ ...post, favorite: saved.has(post.id) }));
}
