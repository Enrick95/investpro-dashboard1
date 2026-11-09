import { assertSameOrigin, authenticateClip, ClipError, clipErrorResponse, clipJson, httpsUrl, optionalText, readJson, text } from "@/lib/clip/server";
import { normalizePhone, normalizeTelegram } from "@/lib/clip/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Candidature pour devenir clippeur (le futur tri WhatsApp « clip » arrivera ici aussi). */
export async function POST(request: Request) {
  try {
    const ctx = await authenticateClip(request);
    if ("error" in ctx) return clipJson({ error: ctx.error }, ctx.status);
    assertSameOrigin(request);
    const { db, user } = ctx;

    const existing = await db.from("clip_clippers").select("id").eq("user_id", user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) throw new ClipError("Tu fais déjà partie des clippeurs.", 409);
    const open = await db.from("clip_candidates").select("id").eq("user_id", user.id).eq("status", "new").maybeSingle();
    if (open.error) throw open.error;
    if (open.data) throw new ClipError("Ta candidature est déjà en cours d'examen.", 409);

    const body = await readJson(request);
    const displayName = text(body, "display_name");
    if (displayName.length < 2 || displayName.length > 60) throw new ClipError("Indique ton prénom et l'initiale de ton nom.");
    const whatsapp = normalizePhone(text(body, "whatsapp"));
    if (!whatsapp) throw new ClipError("Numéro WhatsApp au format international, par exemple +33612345678.");
    const telegramRaw = text(body, "telegram");
    const telegram = telegramRaw ? normalizeTelegram(telegramRaw) : null;
    if (telegramRaw && !telegram) throw new ClipError("Pseudo Telegram invalide.");
    const accounts = text(body, "accounts");
    if (accounts.length < 3 || accounts.length > 400) throw new ClipError("Liste tes comptes (réseau, nom, abonnés).");
    const availability = text(body, "availability");
    if (!availability || availability.length > 60) throw new ClipError("Indique combien de clips tu peux faire par semaine.");
    const sampleRaw = text(body, "sample_url");
    const sampleUrl = sampleRaw ? httpsUrl(sampleRaw, "Exemple de montage") : null;
    const message = optionalText(body, "message", 600, "Message");

    const { error } = await db.from("clip_candidates").insert({
      user_id: user.id,
      email: user.email ?? null,
      display_name: displayName,
      whatsapp,
      telegram,
      accounts,
      availability,
      sample_url: sampleUrl,
      message,
      source: "form",
    });
    if (error) {
      if (error.code === "23505") throw new ClipError("Ta candidature est déjà en cours d'examen.", 409);
      throw error;
    }
    return clipJson({ ok: true }, 201);
  } catch (error) {
    return clipErrorResponse(error);
  }
}
