import { authenticateVip, readVipJson, readVipMembership, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { isVipMembershipActive } from "@/lib/vip/membership";
import { validateVipAccessRequest, VIP_ACCESS_REQUEST_COLUMNS } from "@/lib/vip/access-requests";
import { after } from "next/server";
import { queueVipAdminActivity } from "@/lib/vip/admin-activity";
import { deliverVipNotifications } from "@/lib/vip/notifications";
import { deliverVipRequestCompletionNotifications } from "@/lib/vip/request-completion-notifications";
import { completionColumns, completionRevisionValid, validateCompletionSubmission } from "@/lib/vip/request-completions";
import type { VipAccessRequest } from "@/lib/vip/types";
const REQUEST_COLUMNS = `${VIP_ACCESS_REQUEST_COLUMNS},${completionColumns}`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const context = await authenticateVip(request);
  if ("error" in context) return vipJson({ error: context.error }, context.status);
  try {
    const [membership, result] = await Promise.all([
      readVipMembership(context.db, context.user.id),
      context.db.from("vip_access_requests").select(REQUEST_COLUMNS).eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (result.error) throw result.error;
    return vipJson({ user: { email: context.user.email }, request: result.data, membership, active: isVipMembershipActive(membership) });
  } catch (error) { return vipErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    if (process.env.VERCEL_ENV === "preview") return vipJson({ error: "Les demandes sont envoyées uniquement depuis le site principal." }, 403);
    const context = await authenticateVip(request);
    if ("error" in context) return vipJson({ error: context.error }, context.status);
    if (!context.user.email || !context.user.email_confirmed_at) return vipJson({ error: "Confirmez votre adresse e-mail avant d’envoyer votre demande." }, 403);
    const body = await readVipJson(request);
    const validation = validateVipAccessRequest(body);
    if (!validation.ok) return vipJson({ error: validation.error }, 400);
    if (await readVipMembership(context.db, context.user.id)) return vipJson({ error: "Un accès VIP est déjà rattaché à ce compte. Retrouvez-le dans votre espace ou contactez l’équipe pour le renouveler." }, 409);
    const { data, error } = await context.db.from("vip_access_requests").insert({
      ...validation.value, user_id: context.user.id, email: context.user.email.toLowerCase(), status: "pending",
    }).select(REQUEST_COLUMNS).single();
    if (error?.code === "23505") return vipJson({ error: "Votre demande est déjà en attente de vérification." }, 409);
    if (error) throw error;
    after(async () => {
      try { await queueVipAdminActivity(context.db); await deliverVipNotifications(context.db); }
      catch { console.error("VIP_ADMIN_ACTIVITY_DEFERRED_FAILED"); }
    });
    return vipJson({ request: data }, 201);
  } catch (error) { return vipErrorResponse(error); }
}

/** Only the verified owner can answer the current checklist; an answer never grants VIP access. */
export async function PATCH(request: Request) {
  try {
    if (process.env.VERCEL_ENV === "preview") return vipJson({ error: "Les compléments sont envoyés uniquement depuis le site principal." }, 403);
    const context = await authenticateVip(request);
    if ("error" in context) return vipJson({ error: context.error }, context.status);
    if (!context.user.email || !context.user.email_confirmed_at) return vipJson({ error: "Confirmez votre adresse e-mail avant d’envoyer vos compléments." }, 403);
    const body = await readVipJson(request);
    if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id) || !completionRevisionValid(body.expectedRevision)) return vipJson({ error: "Demande ou version invalide." }, 400);
    const source = await context.db.from("vip_access_requests").select(REQUEST_COLUMNS).eq("id", body.id).eq("user_id", context.user.id).maybeSingle();
    if (source.error) throw source.error;
    if (!source.data || source.data.status !== "pending") return vipJson({ error: "Cette demande n’est plus disponible." }, 409);
    const validation = validateCompletionSubmission(body, source.data as VipAccessRequest);
    if (!validation.ok) return vipJson({ error: validation.error }, 400);
    const { data, error } = await context.db.rpc("vip_submit_request_completion", {
      p_request_id: body.id, p_user_id: context.user.id, p_expected_revision: body.expectedRevision,
      p_values: validation.patch, p_reply: validation.reply,
    });
    if (error) {
      if (error.message === "vip_request_revision_conflict") return vipJson({ error: "Le dossier a changé. Actualisez la page avant de renvoyer vos informations." }, 409);
      if (error.message === "vip_request_unavailable") return vipJson({ error: "Cette demande n’attend plus de complément. Actualisez la page." }, 409);
      if (error.message === "vip_completion_invalid") return vipJson({ error: "Vérifiez les informations demandées." }, 400);
      throw error;
    }
    after(async () => {
      try { await deliverVipRequestCompletionNotifications(context.db); }
      catch { console.error("VIP_COMPLETION_DEFERRED_FAILED"); }
    });
    return vipJson({ ok: true, request: data });
  } catch (error) { return vipErrorResponse(error); }
}
