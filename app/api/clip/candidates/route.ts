import { assertSameOrigin, authenticateClip, ClipError, clipErrorResponse, clipJson, parseCandidature, readJson, referrerId } from "@/lib/clip/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Candidature d'un compte déjà connecté à l'espace clippeurs. */
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

    const { referral_code: referralCode, ...fields } = parseCandidature(await readJson(request));
    const referredBy = await referrerId(db, referralCode, user.id).catch(() => null);
    const { error } = await db.from("clip_candidates").insert({ user_id: user.id, email: user.email ?? null, ...fields, referred_by: referredBy, source: "form" });
    if (error) {
      if (error.code === "23505") throw new ClipError("Ta candidature est déjà en cours d'examen.", 409);
      throw error;
    }
    return clipJson({ ok: true }, 201);
  } catch (error) {
    return clipErrorResponse(error);
  }
}
