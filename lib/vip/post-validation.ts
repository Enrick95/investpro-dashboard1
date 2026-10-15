import type { VipPostCategory, VipReaction } from "./types";

export const VIP_POST_CATEGORIES: readonly VipPostCategory[] = ["analysis", "signal", "performance", "followup", "partnership"];
export const VIP_REACTIONS: readonly VipReaction[] = ["like", "fire", "heart"];
export const VIP_MEDIA_BUCKET = "vip-post-media";
export const VIP_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const VIP_MEDIA_MULTIPART_MAX_BYTES = 4 * 1024 * 1024;
export const VIP_MEDIA_TTL_SECONDS = 600;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IMAGE_PATH = new RegExp(`^${UUID}/${UUID}\\.(png|jpg|webp|gif)$`, "i");

export class VipPostInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function isVipPostId(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^${UUID}$`, "i").test(value);
}
export function isVipImagePath(value: unknown): value is string {
  return typeof value === "string" && IMAGE_PATH.test(value);
}
export function isVipReaction(value: unknown): value is VipReaction {
  return typeof value === "string" && VIP_REACTIONS.includes(value as VipReaction);
}
export function emptyVipReactions() {
  return { counts: { like: 0, fire: 0, heart: 0 }, mine: null };
}

export type VipPostFields = {
  category: VipPostCategory;
  title: string;
  body: string;
  symbol: string | null;
  direction: "buy" | "sell" | null;
  levels: Record<string, number>;
  image_path: string | null;
  image_url: string | null;
};

/** Validate the final row, but return only supplied fields on PATCH so legacy metadata is not rewritten. */
export function validateVipPostInput(input: Record<string, unknown>, current?: VipPostFields): Partial<VipPostFields> {
  const has = (key: string) => Object.hasOwn(input, key);
  if (has("imageUrl") && input.imageUrl !== null && input.imageUrl !== "") {
    throw new VipPostInputError("Importez l’image depuis votre appareil. Les nouveaux liens d’image externes ne sont pas acceptés.");
  }
  const category = has("category") ? input.category : current?.category;
  if (typeof category !== "string" || !VIP_POST_CATEGORIES.includes(category as VipPostCategory)) throw new VipPostInputError("Choisissez une catégorie de publication.");
  const title = has("title") ? input.title : current?.title;
  if (typeof title !== "string" || !title.trim() || title.trim().length > 160) throw new VipPostInputError("Le titre est requis et ne doit pas dépasser 160 caractères.");
  const body = has("body") ? input.body : current?.body ?? "";
  if (typeof body !== "string" || body.trim().length > 12000) throw new VipPostInputError("Le texte ne doit pas dépasser 12 000 caractères.");

  let imagePath = current?.image_path ?? null;
  let imageUrl = current?.image_url ?? null;
  if (has("imagePath")) {
    if (input.imagePath !== null && !isVipImagePath(input.imagePath)) throw new VipPostInputError("Pièce jointe invalide. Importez à nouveau l’image.");
    imagePath = input.imagePath as string | null;
    imageUrl = null;
  }
  if (!body.trim() && !imagePath && !imageUrl) throw new VipPostInputError("Ajoutez un message ou une image à la publication.");

  const patch: Partial<VipPostFields> = {};
  if (!current || has("category")) patch.category = category as VipPostCategory;
  if (!current || has("title")) patch.title = title.trim();
  if (!current || has("body")) patch.body = body.trim();
  if (!current || has("imagePath")) { patch.image_path = imagePath; patch.image_url = imageUrl; }
  if (!current || has("symbol")) {
    const value = input.symbol;
    if (value !== undefined && value !== null && typeof value !== "string") throw new VipPostInputError("Symbole invalide.");
    const symbol = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (symbol && !/^[A-Z0-9._-]{1,32}$/.test(symbol)) throw new VipPostInputError("Symbole invalide.");
    patch.symbol = symbol || null;
  }
  if (!current || has("direction")) {
    const value = input.direction;
    if (value !== undefined && value !== null && value !== "" && value !== "buy" && value !== "sell") throw new VipPostInputError("Direction invalide.");
    patch.direction = value === "buy" || value === "sell" ? value : null;
  }
  if (!current || has("levels")) {
    const values = input.levels ?? {};
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new VipPostInputError("Niveaux invalides.");
    const levels: Record<string, number> = {};
    for (const [key, value] of Object.entries(values)) {
      if (!["entry", "stopLoss", "takeProfit", "takeProfit2"].includes(key)) throw new VipPostInputError("Niveau non pris en charge. Les zones et TP3 peuvent être indiqués dans le texte.");
      if (value === undefined || value === null || value === "") continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new VipPostInputError("Les niveaux doivent être des nombres positifs.");
      levels[key] = value;
    }
    patch.levels = levels;
  }
  return patch;
}

export type VipMediaExtension = "png" | "jpg" | "webp" | "gif";
export function validateVipMediaMetadata(filename: unknown, mimeType: unknown, sizeBytes: unknown): { mimeType: string; sizeBytes: number; extension: VipMediaExtension } {
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > VIP_MEDIA_MAX_BYTES) throw new VipPostInputError("L’image doit peser 10 Mo maximum.", 413);
  const types: Record<string, VipMediaExtension> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
  const mime = typeof mimeType === "string" ? mimeType.toLowerCase() : "";
  const extension = Object.hasOwn(types, mime) ? types[mime] : undefined;
  if (!extension || typeof filename !== "string" || filename.length > 255 || /[\u0000-\u001f\u007f]/.test(filename) || !new RegExp(`\\.${extension === "jpg" ? "jpe?g" : extension}$`, "i").test(filename)) throw new VipPostInputError("Le type et l’extension du fichier doivent correspondre à une image JPG, PNG, WebP ou GIF.", 415);
  return { mimeType: mime, sizeBytes, extension };
}

/** Verify real file bytes; metadata and a signed upload ticket alone never establish a valid image. */
export function validateVipMedia(bytes: Uint8Array, mimeType: string, filename: string): { mimeType: string; extension: VipMediaExtension } {
  validateVipMediaMetadata(filename, mimeType, bytes.length);
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length));
  let extension: VipMediaExtension;
  let actual: string;
  if (bytes.length >= 45 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value) && text(12, 4) === "IHDR" && text(bytes.length - 8, 4) === "IEND") {
    extension = "png"; actual = "image/png";
  } else if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) {
    extension = "jpg"; actual = "image/jpeg";
  } else if (bytes.length >= 20 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(text(12, 4)) && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) === bytes.length - 8) {
    extension = "webp"; actual = "image/webp";
  } else if (bytes.length >= 14 && ["GIF87a", "GIF89a"].includes(text(0, 6)) && bytes[bytes.length - 1] === 59 && (bytes[6] || bytes[7]) && (bytes[8] || bytes[9])) {
    extension = "gif"; actual = "image/gif";
  } else throw new VipPostInputError("Format d’image invalide. Utilisez un fichier JPG, PNG, WebP ou GIF.", 415);
  const filenamePattern = new RegExp(`\\.${extension === "jpg" ? "jpe?g" : extension}$`, "i");
  if (mimeType.toLowerCase() !== actual || !filenamePattern.test(filename)) throw new VipPostInputError("Le type et l’extension du fichier doivent correspondre à une image JPG, PNG, WebP ou GIF.", 415);
  return { mimeType: actual, extension };
}
