import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCESS_CODE_ALPHABET, normalizeAccessCode } from "@/lib/vip/access-code";

/** Champs d'une demande « nouveau membre » utiles à la création du compte. */
export type VipApplicationAccess = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  verified_first_name?: string | null;
  verified_last_name?: string | null;
  account_created?: boolean | null;
  account_user_id?: string | null;
};

export type VipAccessIssue = { emailSent: boolean; accountCreated: boolean };

const DEFAULT_SITE_URL = "https://investprotrading.fr";

export function vipSiteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

/**
 * Code de 12 caractères tiré avec un générateur cryptographique, affiché en blocs de 4 : Ab3d-Ef7g-Hk9m.
 * Il contient toujours des majuscules, des minuscules et des chiffres, pour passer les règles de mot de passe courantes.
 */
export function generateAccessCode(): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let raw = "";
    for (let i = 0; i < 12; i += 1) raw += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
    if (/[A-Z]/.test(raw) && /[a-z]/.test(raw) && /[0-9]/.test(raw)) return normalizeAccessCode(raw) ?? raw;
  }
  throw new Error("VIP_CODE_GENERATION_FAILED");
}

function alreadyRegistered(error: unknown): boolean {
  const info = error as { message?: string; code?: string } | null;
  return /already|exists|registered/i.test(info?.message || "") || info?.code === "email_exists";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}

/**
 * Compte InvestPro d'une demande validée : identifiant = e-mail, code = mot de passe tiré au sort, envoyé par e-mail.
 * Un compte qui existait déjà garde son mot de passe : il n'est jamais modifié. Le code n'est jamais stocké en clair.
 */
export async function issueMemberAccess(db: SupabaseClient, app: VipApplicationAccess): Promise<VipAccessIssue> {
  const firstName = (app.verified_first_name || app.first_name || "").trim();
  const lastName = (app.verified_last_name || app.last_name || "").trim();
  let code: string | null = null;
  let accountCreated = false;

  if (app.account_created && app.account_user_id) {
    // Compte créé par cette demande : le code est remplacé, pour que le mail porte toujours un code valide.
    code = generateAccessCode();
    const { error } = await db.auth.admin.updateUserById(app.account_user_id, { password: code });
    if (error) throw new Error("VIP_ACCOUNT_CODE_UPDATE_FAILED");
    accountCreated = true;
  } else {
    const candidate = generateAccessCode();
    const { data, error } = await db.auth.admin.createUser({
      email: app.email,
      password: candidate,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });
    if (data?.user) {
      code = candidate;
      accountCreated = true;
      const linked = await db.from("vip_member_applications").update({ account_user_id: data.user.id, account_created: true }).eq("id", app.id);
      // Le mail porte déjà le code : un échec de ce suivi n'empêche pas la connexion.
      if (linked.error) console.error("VIP_ACCOUNT_LINK_SAVE_FAILED");
    } else if (!alreadyRegistered(error)) {
      throw new Error("VIP_ACCOUNT_CREATE_FAILED");
    }
  }

  const emailSent = await sendAccessEmail(app, firstName, code);
  return { emailSent, accountCreated };
}

async function sendAccessEmail(app: VipApplicationAccess, firstName: string, code: string | null): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.INVESTPRO_EMAIL_FROM;
  if (!apiKey || !from || !app.email) return false;
  const link = new URL("/vip/nouveau-membre/compte", vipSiteOrigin());
  link.searchParams.set("application", app.id);
  const href = link.toString();
  const email = escapeHtml(app.email);
  const hello = firstName ? `Bonjour ${escapeHtml(firstName)},` : "Bonjour,";
  const intro = code
    ? `<p>L’équipe a vérifié ton dossier. Voici tes identifiants pour ouvrir ton accès VIP :</p><p style="margin:18px 0;padding:16px 18px;border:1px solid #3b3526;border-radius:12px;background:#111310;line-height:1.9">Identifiant : <strong>${email}</strong><br>Code (majuscules et minuscules comptent) : <strong style="letter-spacing:.08em">${escapeHtml(code)}</strong></p>`
    : "<p>L’équipe a vérifié ton dossier. Tu as déjà un compte InvestPro avec cette adresse : connecte-toi comme d’habitude, avec ton mot de passe ou avec « Continuer avec Google » si tu t’es inscrit avec Google. Tu n’as pas de nouveau code.</p>";
  const help = code
    ? "Tu peux changer ce code à tout moment avec « Mot de passe oublié » sur la page de connexion. Ne transfère pas cet e-mail."
    : "Tu ne te souviens plus de ton mot de passe ? Utilise « Mot de passe oublié » sur la page de connexion, ou écris à @EquipeInvestPro sur Telegram.";
  const html = `<div style="font-family:Arial,sans-serif;background:#0b0d0b;color:#f3efe6;padding:32px;border-radius:16px"><h1 style="color:#f0c575">Ta demande VIP est validée</h1><p>${hello}</p>${intro}<p><a href="${href}" style="display:inline-block;background:#f0c575;color:#111;padding:14px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${code ? "Me connecter et ouvrir mon accès VIP" : "Me connecter"}</a></p><p style="color:#b7bcb6;font-size:13px;line-height:1.6">${help}</p></div>`;
  const text = [
    firstName ? `Bonjour ${firstName},` : "Bonjour,",
    "Ta demande VIP est validée.",
    code ? `Identifiant : ${app.email}\nCode (majuscules et minuscules comptent) : ${code}` : `Tu as déjà un compte InvestPro avec ${app.email} : connecte-toi comme d’habitude, avec ton mot de passe ou avec « Continuer avec Google » si tu t’es inscrit avec Google.`,
    `Connexion : ${href}`,
  ].join("\n");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [app.email], subject: "Ta demande VIP est validée · tes accès InvestPro", html, text }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
