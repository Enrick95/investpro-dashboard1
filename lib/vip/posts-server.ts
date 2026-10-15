import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VipMembership, VipPost, VipPostReactions } from "./types";
import { isSameVipOrigin } from "./membership";
import { VipRequestError, vipJson } from "./membership-server";
import { emptyVipReactions, isVipImagePath, isVipReaction, validateVipMedia, VIP_MEDIA_BUCKET, VIP_MEDIA_MAX_BYTES, VIP_MEDIA_MULTIPART_MAX_BYTES, VIP_MEDIA_TTL_SECONDS, VipPostInputError, type VipPostFields } from "./post-validation";

export const VIP_POST_COLUMNS = "id,category,title,body,symbol,direction,levels,image_url,image_path,created_at,updated_at,published";
export type VipStoredPost = VipPostFields & { id: string; created_at: string; updated_at: string; published: boolean };

export function assertVipMutationEnvironment() {
  if (process.env.VERCEL_ENV === "preview") throw new VipRequestError("Les modifications du VIP sont désactivées sur les aperçus. Utilisez le site principal.", 403);
}
export function vipPostErrorResponse(error: unknown, fallback: string) {
  return error instanceof VipPostInputError || error instanceof VipRequestError
    ? vipJson({ error: error.message }, error.status) : vipJson({ error: fallback }, 503);
}
export function vipImageTtl(membership: VipMembership | null | undefined, admin = false, now = Date.now()): number {
  if (admin || membership?.type === "affiliation") return VIP_MEDIA_TTL_SECONDS;
  const remaining = membership?.expires_at ? Math.floor((Date.parse(membership.expires_at) - now) / 1000) : 0;
  if (!Number.isFinite(remaining) || remaining < 1) throw new VipRequestError("Votre accès VIP n’est pas actif.", 403);
  return Math.min(VIP_MEDIA_TTL_SECONDS, remaining);
}
export function normalizedReactions(value: unknown): VipPostReactions {
  if (!value || typeof value !== "object") throw new VipRequestError("Réactions indisponibles.", 503);
  const row = value as Record<string, unknown>;
  if (!row.counts || typeof row.counts !== "object") throw new VipRequestError("Réactions indisponibles.", 503);
  const counts = row.counts as Record<string, unknown>;
  if (![counts.like, counts.fire, counts.heart].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) throw new VipRequestError("Réactions indisponibles.", 503);
  if (row.mine !== null && !isVipReaction(row.mine)) throw new VipRequestError("Réactions indisponibles.", 503);
  return { counts: { like: counts.like as number, fire: counts.fire as number, heart: counts.heart as number }, mine: row.mine as VipPostReactions["mine"] };
}

/** Called only after an admin or active-member guard; no reaction identities are returned. */
export async function hydrateVipPosts(db: SupabaseClient, posts: VipStoredPost[], userId: string, options: { admin?: boolean; membership?: VipMembership | null } = {}): Promise<VipPost[]> {
  if (!posts.length) return [];
  const { data: summaries, error } = await db.rpc("vip_post_reaction_summary", { p_post_ids: posts.map(post => post.id), p_user_id: userId });
  if (error || !Array.isArray(summaries)) throw new VipRequestError("Réactions indisponibles.", 503);
  const reactions = new Map<string, VipPostReactions>();
  for (const row of summaries as Array<Record<string, unknown>>) if (typeof row.post_id === "string") reactions.set(row.post_id, normalizedReactions(row));
  const paths = [...new Set(posts.map(post => post.image_path).filter((path): path is string => Boolean(path)))];
  const images = new Map<string, string>();
  if (paths.length) {
    const { data, error: imageError } = await db.storage.from(VIP_MEDIA_BUCKET).createSignedUrls(paths, vipImageTtl(options.membership, options.admin));
    if (imageError) throw new VipRequestError("Images privées indisponibles.", 503);
    for (const image of data || []) if (image.path && image.signedUrl && !image.error) images.set(image.path, image.signedUrl);
  }
  return posts.map(post => {
    const summary = reactions.get(post.id);
    if (post.published && !summary) throw new VipRequestError("Réactions indisponibles.", 503);
    return {
      id: post.id, category: post.category, title: post.title, body: post.body,
      symbol: post.symbol, direction: post.direction, levels: post.levels,
      image_url: post.image_path ? images.get(post.image_path) || null : post.image_url,
      ...(options.admin ? { image_path: post.image_path } : {}),
      created_at: post.created_at, updated_at: post.updated_at,
      reactions: summary || emptyVipReactions(),
    };
  });
}
export async function assertVipImageExists(db: SupabaseClient, imagePath: string): Promise<{ mimeType: string; sizeBytes: number }> {
  if (!isVipImagePath(imagePath)) throw new VipRequestError("Pièce jointe invalide. Importez à nouveau l’image.", 400);
  const { data, error } = await db.storage.from(VIP_MEDIA_BUCKET).info(imagePath);
  const metadata = data?.metadata as Record<string, unknown> | undefined;
  const size = data?.size ?? metadata?.size;
  const mime = data?.contentType ?? metadata?.mimetype ?? metadata?.contentType;
  if (error || !data || typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size > VIP_MEDIA_MAX_BYTES || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(String(mime))) {
    throw new VipRequestError("L’image importée est introuvable ou invalide. Importez-la à nouveau.", 400);
  }
  // This is a server-to-Storage read, never a file body sent through the Vercel route.
  // Rechecking actual bytes here also prevents a caller from bypassing upload completion via POST/PATCH.
  const { data: file, error: downloadError } = await db.storage.from(VIP_MEDIA_BUCKET).download(imagePath);
  if (downloadError || !file || file.size !== size || file.size > VIP_MEDIA_MAX_BYTES) throw new VipRequestError("L’image importée est introuvable ou invalide. Importez-la à nouveau.", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateVipMedia(bytes, String(mime), imagePath.split("/").at(-1) || "");
  return { mimeType: checked.mimeType, sizeBytes: bytes.length };
}

/** Bound a multipart stream before parsing, including requests without Content-Length. */
export async function readVipImageUpload(request: Request): Promise<File> {
  if (!isSameVipOrigin(request)) throw new VipRequestError("Origine de la requête refusée.", 403);
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new VipRequestError("Un fichier image est requis.", 415);
  const maximum = VIP_MEDIA_MULTIPART_MAX_BYTES + 65536;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new VipRequestError("L’image doit peser 4 Mo maximum.", 413);
  if (!request.body) throw new VipRequestError("Un fichier image est requis.", 400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximum) { await reader.cancel(); throw new VipRequestError("L’image doit peser 4 Mo maximum.", 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let form: FormData;
  try { form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw new VipRequestError("Le fichier image n’a pas pu être lu.", 400); }
  const file = form.get("file");
  if (!file || typeof file === "string" || form.getAll("file").length !== 1 || [...form.keys()].some(key => key !== "file")) throw new VipRequestError("Importez une seule image JPG, PNG ou WebP.", 400);
  if (!file.size || file.size > VIP_MEDIA_MULTIPART_MAX_BYTES) throw new VipRequestError("L’image doit peser 4 Mo maximum.", 413);
  return file;
}
