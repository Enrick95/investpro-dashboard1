import {
  assertPassword,
  assertSameOrigin,
  authErrorCode,
  ClipError,
  clipErrorResponse,
  clipJson,
  limitSignupAttempts,
  parseCandidature,
  referrerId,
  parseEmail,
  readJson,
  readPassword,
  serviceDb,
  text,
} from "@/lib/clip/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inscription directe depuis l'espace clippeurs : le compte est créé confirmé, sans e-mail envoyé,
 * et la candidature est enregistrée dans la foulée. Le navigateur se connecte ensuite avec ce mot de passe.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    if (text(body, "hp_field")) throw new ClipError("Envoi refusé.");
    const email = parseEmail(text(body, "email"));
    const password = readPassword(body, "password");
    assertPassword(password);
    const fields = parseCandidature(body);

    const db = serviceDb();
    await limitSignupAttempts(db, request);

    const created = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: fields.display_name },
      app_metadata: { clip_signup: true },
    });
    if (created.error || !created.data.user) {
      const code = authErrorCode(created.error);
      if (code === "email_exists" || code === "user_already_exists" || /already/i.test(created.error?.message ?? "")) {
        throw new ClipError("Cet e-mail a déjà un compte. Connecte-toi pour envoyer ta candidature.", 409);
      }
      if (code === "weak_password") throw new ClipError("Mot de passe trop simple : 8 caractères minimum, avec des lettres et au moins un chiffre.");
      throw created.error ?? new Error("Création du compte impossible.");
    }

    const userId = created.data.user.id;
    const { referral_code: referralCode, ...candidature } = fields;
    const referredBy = await referrerId(db, referralCode, userId).catch(() => null);
    const { error } = await db.from("clip_candidates").insert({ user_id: userId, email, ...candidature, referred_by: referredBy, source: "form" });
    if (error) {
      await db.auth.admin.deleteUser(userId);
      throw error;
    }
    return clipJson({ ok: true }, 201);
  } catch (error) {
    return clipErrorResponse(error);
  }
}
