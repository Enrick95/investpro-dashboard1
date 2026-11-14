"use client";

/** Taille maximale d'une capture envoyée, comme le stockage (8 Mo). */
export const CAPTURE_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export class ScreenshotError extends Error {}

/**
 * Prépare une capture d'écran pour l'envoi : redimensionnée (2000 px au plus grand côté)
 * et recompressée en JPEG, assez nette pour lire les chiffres des statistiques.
 * Si le navigateur ne sait pas la lire, on envoie l'original quand son format est accepté.
 */
export async function screenshotBlob(file: File, maxSide = 2000, quality = 0.86): Promise<Blob> {
  if (file.type && !file.type.startsWith("image/")) throw new ScreenshotError("Choisis une image : une capture d'écran de tes statistiques.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("decode"));
      element.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("encode");
    // On garde l'original s'il est déjà plus léger et dans un format accepté.
    if (ALLOWED.includes(file.type) && file.size <= blob.size && file.size <= CAPTURE_MAX_BYTES) return file;
    if (blob.size > CAPTURE_MAX_BYTES) throw new ScreenshotError("Image trop lourde : 8 Mo maximum.");
    return blob;
  } catch (cause) {
    if (cause instanceof ScreenshotError) throw cause;
    if (ALLOWED.includes(file.type) && file.size <= CAPTURE_MAX_BYTES) return file;
    throw new ScreenshotError("Format non pris en charge : envoie une capture d'écran (PNG ou JPG).");
  } finally {
    URL.revokeObjectURL(url);
  }
}
