import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authenticateAdmin, permissionsFor } from "@/lib/admin/permissions";
import { FREEZE_DAYS, freezeAt } from "@/lib/clip/rules";

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

function serviceDb(): SupabaseClient {
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
