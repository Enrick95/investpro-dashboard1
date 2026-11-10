import { after } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { authenticateVip, readVipJson, vipDatabase, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { isSameVipOrigin, isVipMembershipActive } from "@/lib/vip/membership";
import { VIP_ACCESS_REQUEST_COLUMNS } from "@/lib/vip/access-requests";
import { generateAccessCode } from "@/lib/vip/access-account";
import { normalizeAccessCode } from "@/lib/vip/access-code";
import { parseExistingMemberIdentity } from "@/lib/vip/existing-member-intake";
import { consumeEssaiVipRateLimit } from "@/lib/essai-vip-rate-limit";
import { queueVipAdminActivity } from "@/lib/vip/admin-activity";
import { deliverVipNotifications } from "@/lib/vip/notifications";
import { notifyAdminNewVipRequest } from "@/lib/vip/admin-request-alert";
import type { VipAccessRequest, VipMembership } from "@/lib/vip/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Page « Déjà membre » (/vip/deja-membre), tout sur une seule page :
 *  - le membre du canal Telegram donne prénom, nom et e-mail (WhatsApp et Telegram facultatifs) ;
 *  - un compte InvestPro est créé sur place : son code d'accès (= mot de passe tiré au sort) s'affiche
 *    directement sur la page, sans passer par l'e-mail, et le navigateur repart connecté ;
 *  - une adresse qui a déjà un compte ne reçoit jamais de code : le membre entre son mot de passe ;
 *  - la demande arrive dans « Demandes VIP » ; l'accès ne s'ouvre qu'après la validation de l'équipe.
 * Le code n'est ni stocké ni journalisé ici.
 */

const MEMBERSHIP_COLUMNS = "user_id,email,type,first_name,last_name,affiliation_broker,started_at,expires_at,status,renewal_requested_at,created_at,updated_at,member_number";
const REQUEST_COLUMNS = "id,status,request_kind,first_name,last_name,rejection_reason,completion_fields,completion_note,created_at";
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function alreadyRegistered(error: unknown): boolean {
  const info = error as { message?: string; code?: string } | null;
  return /already|exists|registered/i.test(info?.message || "") || info?.code === "email_exists";
}

/** Ce que la page affiche pour le compte connecté : formulaire, attente, accès ouvert, refus ou complément. */
async function readMemberState(db: SupabaseClient, user: User) {
  const [membershipResult, requestResult] = await Promise.all([
    db.from("vip_memberships").select(MEMBERSHIP_COLUMNS).eq("user_id", user.id).maybeSingle(),
    db.from("vip_access_requests").select(REQUEST_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (membershipResult.error || requestResult.error) throw new Error("VIP_MEMBER_STATE_UNAVAILABLE");
  const membership = membershipResult.data as (VipMembership & { member_number?: number | null }) | null;
  const request = requestResult.data as Partial<VipAccessRequest> | null;
  const active = isVipMembershipActive(membership);
  const state = active ? "active"
    : membership ? "inactive"
      : request?.status === "pending" ? (request.completion_fields?.length ? "completion" : "pending")
        : request?.status === "denied" ? "denied" : "none";
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  return {
    state,
    email: user.email || "",
    firstName: membership?.first_name || request?.first_name || str(meta.first_name),
    lastName: membership?.last_name || request?.last_name || str(meta.last_name),
    memberNumber: active && membership?.member_number ? membership.member_number : null,
    since: active ? membership?.started_at || null : null,
    completionNote: state === "completion" ? request?.completion_note || null : null,
    rejectionReason: state === "denied" ? request?.rejection_reason || null : null,
  };
}

export async function GET(request: Request) {
  const context = await authenticateVip(request);
  if ("error" in context) return context.status === 401 ? vipJson({ signedIn: false }) : vipJson({ error: context.error }, context.status);
  try { return vipJson({ signedIn: true, ...(await readMemberState(context.db, context.user)) }); }
  catch { return vipJson({ error: "Ton espace VIP est momentanément indisponible. Réessaie dans un instant." }, 503); }
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "preview") return vipJson({ error: "Les demandes sont envoyées uniquement depuis le site principal." }, 403);
  let body: Record<string, unknown>;
  try { body = await readVipJson(request); } catch (error) { return vipErrorResponse(error); }
  if (str(body.website)) return vipJson({ ok: true, state: "pending" }, 201); // pot de miel anti-robots

  const parsed = parseExistingMemberIdentity(body);
  if (!parsed.ok) return vipJson({ error: parsed.error, field: parsed.field }, 400);
  const input = parsed.value;

  // 1. Le compte : session déjà ouverte, connexion au compte existant, ou création avec un code affiché ici.
  let db: SupabaseClient;
  try { db = vipDatabase(); } catch { return vipJson({ error: "Service momentanément indisponible." }, 503); }
  let user: User | null = null;
  let code: string | null = null;
  let created = false;
  let signedIn = true;
  const session = await authenticateVip(request);
  if (!("error" in session)) user = session.user;
  else if (session.status !== 401) return vipJson({ error: session.error }, session.status);
  else {
    try {
      const limit = await consumeEssaiVipRateLimit(request);
      if (!limit.allowed) {
        const response = vipJson({ error: "Trop de tentatives depuis cette connexion. Réessaie dans un moment." }, 429);
        response.headers.set("Retry-After", String(Math.max(1, Math.ceil(limit.retryAfterSeconds))));
        return response;
      }
    } catch { return vipJson({ error: "L’envoi est momentanément indisponible. Réessaie dans un instant." }, 503); }
    const auth = await createCookieClient();
    if (body.mode === "login") {
      const password = typeof body.password === "string" ? body.password : "";
      if (!password || password.length > 72) return vipJson({ error: "Entre le mot de passe de ton compte InvestPro.", field: "password" }, 400);
      let { data, error } = await auth.auth.signInWithPassword({ email: input.email, password });
      // Un code d'accès recopié sans ses tirets (ou avec des espaces) reste accepté.
      const typedCode = normalizeAccessCode(password);
      if ((error || !data.user) && typedCode && typedCode !== password && !/not confirmed/i.test(error?.message || "")) ({ data, error } = await auth.auth.signInWithPassword({ email: input.email, password: typedCode }));
      if (error || !data.user) {
        if (/not confirmed/i.test(error?.message || "")) return vipJson({ error: "Ton adresse e-mail n’est pas encore confirmée : ouvre le lien reçu à l’inscription, puis réessaie.", code: "EMAIL_NOT_CONFIRMED" }, 403);
        return vipJson({ error: "Mot de passe incorrect. Réessaie, ou utilise « Mot de passe oublié ».", code: "BAD_PASSWORD", field: "password" }, 401);
      }
      user = data.user;
    } else {
      const candidate = generateAccessCode();
      const { data, error } = await db.auth.admin.createUser({
        email: input.email, password: candidate, email_confirm: true,
        user_metadata: { first_name: input.firstName, last_name: input.lastName },
      });
      if (error || !data?.user) {
        if (alreadyRegistered(error)) return vipJson({ error: "Tu as déjà un compte InvestPro avec cette adresse : entre ton mot de passe pour continuer.", code: "EXISTING_ACCOUNT" }, 409);
        return vipJson({ error: "Impossible de créer ton accès pour le moment. Réessaie dans un instant." }, 503);
      }
      user = data.user;
      code = candidate;
      created = true;
      const signIn = await auth.auth.signInWithPassword({ email: input.email, password: candidate });
      signedIn = !signIn.error && !!signIn.data.session;
    }
  }
  if (!user) return vipJson({ error: "Connecte-toi à ton compte InvestPro." }, 401);
  // « accessCode » : le code affiché sur la page (jamais renvoyé pour un compte existant). « code » reste réservé aux erreurs.
  const account = { accessCode: code, created, signedIn, email: (user.email || input.email).toLowerCase() };

  // 2. Déjà membre sur le site ? Rien à redemander.
  let state: Awaited<ReturnType<typeof readMemberState>>;
  try { state = await readMemberState(db, user); }
  catch { return vipJson({ error: "Ta demande n’a pas pu être enregistrée. Réessaie dans un instant.", ...account }, 503); }
  if (state.state === "active" || state.state === "inactive" || state.state === "pending" || state.state === "completion") return vipJson({ ok: true, ...state, ...account });

  // 3. La demande, visible dans « Demandes VIP » : le broker choisi, ou l'abonnement avec sa date de paiement à vérifier
  // dans Stripe. « Autre broker » : l'équipe confirme l'origine à la validation.
  const { data, error } = await db.from("vip_access_requests").insert({
    user_id: user.id, email: account.email, first_name: input.firstName, last_name: input.lastName,
    telegram_username: input.telegram, phone_whatsapp: input.phone,
    type: input.type, affiliation_broker: input.broker, paid_on: input.paidOn, request_kind: "existing", status: "pending",
  }).select(VIP_ACCESS_REQUEST_COLUMNS).single();
  if (error?.code === "23505") return vipJson({ ok: true, ...state, state: "pending", ...account });
  if (error || !data) return vipJson({ error: "Ta demande n’a pas pu être enregistrée. Réessaie dans un instant.", ...account }, 503);

  after(async () => {
    try { await queueVipAdminActivity(db); await deliverVipNotifications(db); }
    catch { console.error("VIP_ADMIN_ACTIVITY_DEFERRED_FAILED"); }
    try { await notifyAdminNewVipRequest(data as unknown as VipAccessRequest); }
    catch { console.error("VIP_REQUEST_TELEGRAM_DEFERRED_FAILED"); }
  });
  return vipJson({ ok: true, ...state, state: "pending", firstName: input.firstName, lastName: input.lastName, ...account }, 201);
}

/** « Ce n’est pas toi ? » : ferme la session de ce navigateur pour qu’un autre membre puisse remplir la page. */
export async function DELETE(request: Request) {
  if (!isSameVipOrigin(request)) return vipJson({ error: "Origine de la requête refusée." }, 403);
  try { const auth = await createCookieClient(); await auth.auth.signOut(); }
  catch { /* La session est peut-être déjà fermée. */ }
  return vipJson({ ok: true });
}
