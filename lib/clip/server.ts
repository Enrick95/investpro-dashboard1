import "server-only";

import { createHash, randomInt } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authenticateAdmin, permissionsFor } from "@/lib/admin/permissions";
import { FREEZE_DAYS, freezeAt, normalizePhone, normalizeTelegram } from "@/lib/clip/rules";

export const CLIPPER_COLUMNS = "id,user_id,ref,display_name,whatsapp,telegram,tracking_code,status,payout_method,payout_details,admin_note,created_at";
export const ACCOUNT_COLUMNS = "id,clipper_id,platform,handle,followers,verified,created_at";
export const CAMPAIGN_COLUMNS = "id,title,platforms,brief,forbidden,rushes_url,starts_on,ends_on,quota_per_clipper,rate_per_1000,min_views,max_per_clip,vip_bonus,status,created_at";
export const CLIP_COLUMNS = "id,ref,clipper_id,campaign_id,platform,url,title,published_at,status,reject_reason,views,views_updated_at,frozen_views,frozen_at,payout_id,reviewed_at,created_at";
export const PAYOUT_COLUMNS = "id,ref,clipper_id,cycle_start,cycle_end,clips_count,views_total,base_amount,bonus_amount,deduction_amount,total,method,proof,paid_at";
export const CANDIDATE_COLUMNS = "id,user_id,email,display_name,whatsapp,telegram,accounts,availability,sample_url,message,source,status,reviewed_at,created_at";

export class ClipError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function clipJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization", "Referrer-Policy": "no-referrer" },
  });
}

export function clipErrorResponse(error: unknown): NextResponse {
  if (error instanceof ClipError) return clipJson({ error: error.message }, error.status);
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "23505") return clipJson({ error: "Cet élément existe déjà." }, 409);
  if (code === "23514" || code === "22P02" || code === "22007" || code === "22008") return clipJson({ error: "Une des valeurs envoyées n'est pas valide." }, 400);
  console.error("[clip]", error);
  return clipJson({ error: "Service momentanément indisponible, réessaie." }, 500);
}

export function serviceDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ClipError("Service indisponible.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type ClipContext = { user: User; db: SupabaseClient; owner: boolean };
export type ClipAuthError = { error: string; status: number };

/** Session Supabase du navigateur (jeton Bearer) ; les données passent ensuite par le rôle serveur. */
export async function authenticateClip(request: Request): Promise<ClipContext | ClipAuthError> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: "Service indisponible.", status: 503 };
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || token.length > 8192) return { error: "Connecte-toi pour continuer.", status: 401 };
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return { error: "Session expirée, reconnecte-toi.", status: 401 };
  let owner = false;
  try {
    owner = (await permissionsFor(data.user.id)).owner;
  } catch {
    owner = false;
  }
  return { user: data.user, db: serviceDb(), owner };
}

/** Espace admin des clippeurs : réservé au propriétaire du site. */
export async function authenticateClipAdmin(request: Request): Promise<{ user: User; db: SupabaseClient } | ClipAuthError> {
  const result = await authenticateAdmin(request);
  if ("error" in result) return { error: result.error ?? "Accès refusé", status: result.status ?? 403 };
  if (!result.access.owner) return { error: "Accès réservé à l'administrateur.", status: 403 };
  return { user: result.user, db: result.admin };
}

export function assertSameOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") throw new ClipError("Origine de la requête refusée.", 403);
  const origin = request.headers.get("origin");
  if (!origin) return;
  let same = false;
  try {
    same = new URL(origin).origin === new URL(request.url).origin;
  } catch {
    same = false;
  }
  if (!same) throw new ClipError("Origine de la requête refusée.", 403);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 20_000) throw new ClipError("Requête trop volumineuse.", 413);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ClipError("Requête invalide.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ClipError("Requête invalide.");
  return body as Record<string, unknown>;
}

export function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

export function optionalText(body: Record<string, unknown>, key: string, max: number, label: string): string | null {
  const value = text(body, key);
  if (!value) return null;
  if (value.length > max) throw new ClipError(`${label} : ${max} caractères maximum.`);
  return value;
}

export function httpsUrl(value: string, label: string): string {
  if (value.length > 500) throw new ClipError(`${label} trop long.`);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("protocol");
    return url.toString();
  } catch {
    throw new ClipError(`${label} : colle un lien qui commence par https://`);
  }
}

export type CandidatureFields = {
  display_name: string;
  whatsapp: string;
  telegram: string | null;
  accounts: string;
  availability: string;
  sample_url: string | null;
  message: string | null;
};

/** Champs de la candidature, communs à l'inscription et au formulaire d'un compte déjà connecté. */
export function parseCandidature(body: Record<string, unknown>): CandidatureFields {
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
  return { display_name: displayName, whatsapp, telegram, accounts, availability, sample_url: sampleUrl, message };
}

export function parseEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ClipError("Adresse e-mail invalide.");
  return email;
}

/** Mot de passe tel que saisi (sans retirer les espaces). */
export function readPassword(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

export function assertPassword(password: string): void {
  if (password.length < 8) throw new ClipError("Mot de passe : 8 caractères minimum.");
  if (password.length > 72) throw new ClipError("Mot de passe : 72 caractères maximum.");
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) throw new ClipError("Mot de passe : des lettres et au moins un chiffre.");
}

export function authErrorCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code ?? "") : "";
}

/** Limite les inscriptions par connexion (adresse IP hachée, jamais stockée en clair). */
export async function limitSignupAttempts(db: SupabaseClient, request: Request): Promise<void> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "inconnue";
  const ipHash = createHash("sha256").update(`enrick95-clips:${ip}`).digest("hex").slice(0, 32);
  const [recent, daily] = await Promise.all([
    db.from("clip_signup_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString()),
    db.from("clip_signup_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
  ]);
  if (recent.error) throw recent.error;
  if (daily.error) throw daily.error;
  if ((recent.count ?? 0) >= 5 || (daily.count ?? 0) >= 20) throw new ClipError("Trop d'essais depuis ta connexion. Réessaie dans un moment.", 429);
  const { error } = await db.from("clip_signup_attempts").insert({ ip_hash: ipHash });
  if (error) throw error;
  await db.from("clip_signup_attempts").delete().lt("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString());
}

/** Mot de passe provisoire lisible, envoyé par l'admin sur WhatsApp. */
export function temporaryPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (set: string) => set[randomInt(set.length)];
  const groups = [0, 1, 2].map(() => `${pick(letters)}${pick(letters + digits)}${pick(letters + digits)}${pick(digits)}`);
  return groups.join("-");
}

/** Vérifie un mot de passe sans toucher à la session du navigateur. */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ClipError("Service indisponible.", 503);
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  try {
    await auth.auth.signOut({ scope: "local" });
  } catch {
    // session jetable : rien à faire si la révocation échoue
  }
  return true;
}

export function trackingCodeFrom(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "clip";
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Fige les vues des clips validés publiés il y a 7 jours ou plus. */
export async function freezeDueClips(db: SupabaseClient, clipperId?: string): Promise<void> {
  const cutoff = new Date(Date.now() - FREEZE_DAYS * 86_400_000).toISOString();
  const base = db.from("clip_clips").select("id,views,published_at").eq("status", "approved").is("frozen_views", null).lte("published_at", cutoff);
  const { data, error } = await (clipperId ? base.eq("clipper_id", clipperId) : base).limit(500);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { id: string; views: number | string; published_at: string }[];
  for (const row of rows) {
    const { error: updateError } = await db
      .from("clip_clips")
      .update({ frozen_views: Number(row.views) || 0, frozen_at: freezeAt(row.published_at).toISOString() })
      .eq("id", row.id)
      .is("frozen_views", null);
    if (updateError) throw updateError;
  }
}
