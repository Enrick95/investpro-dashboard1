import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSameOrigin, authenticateClip, ClipError, clipErrorResponse, clipJson, readJson, text } from "@/lib/clip/server";
import { CAPTURE_BUCKET, CAPTURE_MAX_BYTES, CAPTURE_TYPES, CAPTURES_PER_CLIP, captureLinks, capturePath, capturePathOk, imageBytesMatch, type CaptureRow } from "@/lib/clip/captures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Captures des stats d'un clip (vues, rétention, temps de visionnage…).
 * prepare : réserve une place (6 par clip) et donne un lien d'envoi direct vers le
 * stockage, l'image ne passe pas par le site ; complete : vérifie l'image reçue et
 * confirme la réservation ; DELETE : retire une capture.
 */

const PENDING_MINUTES = 15;

type Reserved = CaptureRow & { mime_type: string; confirmed_at: string | null };

async function clipperOf(db: SupabaseClient, userId: string): Promise<{ id: string; status: string }> {
  const { data, error } = await db.from("clip_clippers").select("id,status").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const clipper = data as unknown as { id: string; status: string } | null;
  if (!clipper) throw new ClipError("Ton espace clippeur n'est pas encore ouvert.", 403);
  return clipper;
}

async function ownClip(db: SupabaseClient, clipperId: string, clipId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(clipId)) throw new ClipError("Clip introuvable.", 404);
  const { data, error } = await db.from("clip_clips").select("id,status").eq("id", clipId).eq("clipper_id", clipperId).maybeSingle();
  if (error) throw error;
  const clip = data as unknown as { id: string; status: string } | null;
  if (!clip) throw new ClipError("Clip introuvable.", 404);
  if (clip.status === "rejected") throw new ClipError("Ce clip a été refusé : plus besoin de ses stats.", 409);
  return clip;
}

/** Captures confirmées et envois en cours : les deux comptent dans la limite. */
async function countFor(db: SupabaseClient, clipId: string): Promise<number> {
  const { count, error } = await db.from("clip_captures").select("id", { count: "exact", head: true }).eq("clip_id", clipId);
  if (error) throw error;
  return count ?? 0;
}

/** Envois réservés mais jamais terminés (réseau coupé, appli fermée…) : retirés au bout de 15 min. */
async function sweepPending(db: SupabaseClient, clipperId: string): Promise<void> {
  const before = new Date(Date.now() - PENDING_MINUTES * 60_000).toISOString();
  const { data, error } = await db.from("clip_captures").select("id,path").eq("clipper_id", clipperId).is("confirmed_at", null).lt("created_at", before).limit(50);
  if (error || !data?.length) return;
  const stale = data as unknown as { id: string; path: string }[];
  await db.storage.from(CAPTURE_BUCKET).remove(stale.map((row) => row.path));
  await db.from("clip_captures").delete().in("id", stale.map((row) => row.id));
}

export async function POST(request: Request) {
  try {
    const ctx = await authenticateClip(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    assertSameOrigin(request);
    const { db } = ctx;
    const clipper = await clipperOf(db, ctx.user.id);
    const body = await readJson(request);
    const clipId = text(body, "clip_id");
    await ownClip(db, clipper.id, clipId);
    const bucket = db.storage.from(CAPTURE_BUCKET);

    if (body.action === "prepare") {
      if (clipper.status === "paused") throw new ClipError("Ton compte clippeur est en pause. Écris à Enrick sur WhatsApp.", 403);
      const mime = text(body, "mime_type");
      const size = Number(body.size_bytes);
      const extension = CAPTURE_TYPES[mime];
      if (!extension) throw new ClipError("Envoie une capture d'écran en image (JPG, PNG ou WebP).");
      if (!Number.isSafeInteger(size) || size < 1 || size > CAPTURE_MAX_BYTES) throw new ClipError("Image trop lourde : 8 Mo maximum.");
      await sweepPending(db, clipper.id);
      if ((await countFor(db, clipId)) >= CAPTURES_PER_CLIP) throw new ClipError(`${CAPTURES_PER_CLIP} captures maximum par clip : retires-en une pour en ajouter une autre.`, 409);
      const path = capturePath(clipper.id, clipId, `${randomUUID()}.${extension}`);
      // La place est réservée avant l'envoi : impossible de dépasser la limite en envoyant plusieurs images d'un coup.
      const { data: reserved, error: reserveError } = await db
        .from("clip_captures")
        .insert({ clip_id: clipId, clipper_id: clipper.id, path, mime_type: mime, size_bytes: size })
        .select("id")
        .single();
      if (reserveError) throw reserveError;
      const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: false });
      if (error || !data?.token) {
        await db.from("clip_captures").delete().eq("id", (reserved as unknown as { id: string }).id);
        throw new ClipError("Envoi impossible pour le moment, réessaie.", 503);
      }
      return clipJson({ path, token: data.token });
    }

    if (body.action === "complete") {
      const path = text(body, "path");
      if (!capturePathOk(path, clipper.id, clipId)) throw new ClipError("Capture invalide, recommence l'envoi.");
      const { data: found, error: findError } = await db
        .from("clip_captures")
        .select("id,clip_id,clipper_id,path,mime_type,created_at,confirmed_at")
        .eq("path", path)
        .eq("clipper_id", clipper.id)
        .maybeSingle();
      if (findError) throw findError;
      const reserved = found as unknown as Reserved | null;
      if (!reserved) throw new ClipError("Envoi expiré : ajoute la capture à nouveau.", 409);
      if (!reserved.confirmed_at) {
        // Lecture serveur → stockage : on vérifie que c'est bien une image du type annoncé.
        const { data: file, error } = await bucket.download(path);
        if (error || !file) throw new ClipError("Image pas encore reçue, réessaie.", 409);
        const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
        if (file.size < 1 || file.size > CAPTURE_MAX_BYTES || !imageBytesMatch(head, reserved.mime_type)) {
          await bucket.remove([path]);
          await db.from("clip_captures").delete().eq("id", reserved.id);
          throw new ClipError("Ce fichier n'est pas une image valide.");
        }
        const { error: confirmError } = await db.from("clip_captures").update({ confirmed_at: new Date().toISOString(), size_bytes: file.size }).eq("id", reserved.id);
        if (confirmError) throw confirmError;
      }
      const [link] = await captureLinks(db, [reserved]);
      return clipJson({ capture: link ?? null }, 201);
    }
    throw new ClipError("Étape d'envoi inconnue.");
  } catch (error) {
    return clipErrorResponse(error);
  }
}

/** Le clippeur retire une de ses captures. */
export async function DELETE(request: Request) {
  try {
    const ctx = await authenticateClip(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    assertSameOrigin(request);
    const { db } = ctx;
    const clipper = await clipperOf(db, ctx.user.id);
    const body = await readJson(request);
    const id = text(body, "id");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ClipError("Capture introuvable.", 404);
    const { data, error } = await db.from("clip_captures").select("id,path").eq("id", id).eq("clipper_id", clipper.id).maybeSingle();
    if (error) throw error;
    const capture = data as unknown as { id: string; path: string } | null;
    if (!capture) throw new ClipError("Capture introuvable.", 404);
    await db.storage.from(CAPTURE_BUCKET).remove([capture.path]);
    const { error: deleteError } = await db.from("clip_captures").delete().eq("id", capture.id);
    if (deleteError) throw deleteError;
    return clipJson({ ok: true });
  } catch (error) {
    return clipErrorResponse(error);
  }
}
