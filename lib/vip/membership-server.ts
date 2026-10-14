import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { canAdmin } from "@/lib/admin/permissions";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { isSameVipOrigin, isVipMembershipActive, normalizeVipCode } from "@/lib/vip/membership";
import type { VipMembership, VipMembershipType } from "@/lib/vip/types";

export const VIP_MEMBERSHIP_COLUMNS = "user_id,email,type,started_at,expires_at,status,renewal_requested_at,created_at,updated_at";
export const VIP_INVITATION_COLUMNS = "id,email,type,created_by,created_at,expires_at,redeemed_at,redeemed_by,revoked_at";

export class VipRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function vipJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "Vary": "Authorization, Cookie",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function vipDatabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new VipRequestError("Service VIP indisponible.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type VipAuthError = { error: string; status: number };
export type VipAuthContext = { user: User; db: SupabaseClient; admin: boolean };

/** Auth server validation; user_metadata and browser plan flags never grant VIP access. */
export async function authenticateVip(request: Request): Promise<VipAuthContext | VipAuthError> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { error: "Service VIP indisponible.", status: 503 };
  try {
    let user: User | null = null;
    const authorization = request.headers.get("authorization");
    if (authorization) {
      const token = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
      if (!token || token.length > 8192) return { error: "Session invalide.", status: 401 };
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await client.auth.getUser(token);
      if (result.error) return { error: "Session invalide.", status: 401 };
      user = result.data.user;
    } else {
      const client = await createCookieClient();
      const result = await client.auth.getUser();
      if (result.error) return { error: "Session invalide.", status: 401 };
      user = result.data.user;
    }
    if (!user || user.is_anonymous) return { error: "Connectez-vous à votre compte InvestPro.", status: 401 };
    let admin = false;
    try { admin = await canAdmin(user.id, "users_write"); } catch { /* Fail closed for administrative access. */ }
    return { user, db: vipDatabase(), admin };
  } catch { return { error: "Vérification de session indisponible.", status: 503 }; }
}

export async function readVipMembership(db: SupabaseClient, userId: string): Promise<VipMembership | null> {
  const { data, error } = await db.from("vip_memberships").select(VIP_MEMBERSHIP_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw new VipRequestError("Accès VIP indisponible.", 503);
  return data as VipMembership | null;
}

export async function requireVipAccess(request: Request): Promise<(VipAuthContext & { membership: VipMembership | null; active: true }) | VipAuthError> {
  const context = await authenticateVip(request);
  if ("error" in context) return context;
  try {
    const membership = await readVipMembership(context.db, context.user.id);
    if (!context.admin && !isVipMembershipActive(membership)) return { error: "Votre accès VIP n’est pas actif.", status: 403 };
    return { ...context, membership, active: true };
  } catch { return { error: "Accès VIP indisponible.", status: 503 }; }
}

export function createVipInvitationCode(type: VipMembershipType): string {
  return `IP-${type === "affiliation" ? "AFF" : "ABO"}-${randomBytes(24).toString("hex").toUpperCase()}`;
}

export function hashVipInvitationCode(code: string): string {
  return createHash("sha256").update(normalizeVipCode(code), "utf8").digest("hex");
}

/** Read incrementally so chunked bodies cannot bypass the byte limit. */
export async function readVipJson(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  if (!isSameVipOrigin(request)) throw new VipRequestError("Origine de la requête refusée.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new VipRequestError("Le format JSON est requis.", 415);
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    throw new VipRequestError("Requête trop volumineuse.", 413);
  }
  if (!request.body) throw new VipRequestError("Requête vide.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new VipRequestError("Requête trop volumineuse.", 413);
      }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new VipRequestError("JSON invalide."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new VipRequestError("Objet JSON requis.");
  return body as Record<string, unknown>;
}

export function vipErrorResponse(error: unknown): NextResponse {
  return error instanceof VipRequestError
    ? vipJson({ error: error.message }, error.status)
    : vipJson({ error: "Service VIP temporairement indisponible." }, 503);
}
