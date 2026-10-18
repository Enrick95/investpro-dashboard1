import { authenticateAdmin } from "@/lib/admin/permissions";
import { validateNewVipApproval, validateVipApproval, VIP_ACCESS_REQUEST_COLUMNS } from "@/lib/vip/access-requests";
import { readVipJson, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { after } from "next/server";
import { queueVipAdminActivity } from "@/lib/vip/admin-activity";
import { deliverVipNotifications } from "@/lib/vip/notifications";
import { deliverVipAccessConfirmations } from "@/lib/vip/access-confirmations";
import { deliverVipRequestCompletionNotifications } from "@/lib/vip/request-completion-notifications";
import { completionColumns, completionRevisionValid, validateCompletionRequest } from "@/lib/vip/request-completions";
import type { VipAccessRequest } from "@/lib/vip/types";
const REQUEST_COLUMNS = `${VIP_ACCESS_REQUEST_COLUMNS},${completionColumns}`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const context = await authenticateAdmin(request, "users_write");
  if ("error" in context) return vipJson({ error: context.error }, context.status);
  try {
    const history = new URL(request.url).searchParams.get("history") === "1";
    const { data, error } = await context.admin.from("vip_access_requests").select(REQUEST_COLUMNS).eq("status", history ? "approved" : "pending").order(history ? "reviewed_at" : "created_at", { ascending: !history }).limit(history ? 100 : 1000);
    if (error) throw error;
    return vipJson(history ? { history: data || [] } : { requests: data || [] });
  } catch (error) { return vipErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    if (process.env.VERCEL_ENV === "preview") return vipJson({ error: "Validez les demandes depuis le site principal." }, 403);
    const context = await authenticateAdmin(request, "users_write");
    if ("error" in context) return vipJson({ error: context.error }, context.status);
    const body = await readVipJson(request);
    if (typeof body.id !== "string" || !uuid.test(body.id) || !["approve", "deny", "request_completion"].includes(String(body.action)) || !completionRevisionValid(body.expectedRevision)) return vipJson({ error: "Demande, action ou version invalide. Actualisez la page si nécessaire." }, 400);
    const source = await context.admin.from("vip_access_requests").select(REQUEST_COLUMNS).eq("id", body.id).maybeSingle();
    if (source.error) throw source.error;
    if (!source.data || source.data.status !== "pending") return vipJson({ error: "Cette demande a déjà été traitée ou n’existe plus." }, 409);
    if (body.action === "request_completion") {
      const completion = validateCompletionRequest(body, source.data as VipAccessRequest);
      if (!completion.ok) return vipJson({ error: completion.error }, 400);
      const result = await context.admin.rpc("vip_request_completion_action", { p_request_id: body.id, p_expected_revision: body.expectedRevision, p_actor_id: context.user.id, p_fields: completion.fields, p_note: completion.note });
      if (result.error?.message === "vip_request_revision_conflict" || result.error?.message === "vip_request_unavailable") return vipJson({ error: "Le dossier a changé. Actualisez avant de poursuivre." }, 409);
      if (result.error?.message === "vip_completion_invalid") return vipJson({ error: "Vérifiez les informations demandées et votre message." }, 400);
      if (result.error) throw result.error;
      after(async () => {
        try { await deliverVipRequestCompletionNotifications(context.admin); }
        catch { console.error("VIP_COMPLETION_DEFERRED_FAILED"); }
      });
      return vipJson({ ok: true, request: result.data });
    }
    const validation = body.action === "approve" ? validateVipApproval(body) : null;
    if (validation && !validation.ok) return vipJson({ error: validation.error }, 400);
    const value = validation?.ok ? validation.value : null;
    // The stored intake controls additional checks; browser-supplied requestKind
    // cannot disguise a new application as an existing member declaration.
    const checks = body.action === "approve" && source.data.request_kind === "new" ? validateNewVipApproval(body, source.data) : null;
    if (checks && !checks.ok) return vipJson({ error: checks.error }, 400);
    const verified = checks?.ok ? checks.value : null;
    const { data, error } = await context.admin.rpc("vip_review_access_request_revision", {
      p_request_id: body.id, p_expected_revision: body.expectedRevision, p_action: body.action, p_reviewed_by: context.user.id,
      p_first_name: value?.first_name || null, p_last_name: value?.last_name || null,
      p_type: value?.type || null, p_affiliation_broker: value?.affiliation_broker || null, p_paid_on: value?.paid_on || null,
      p_verified_deposit_usd: verified?.verified_deposit_usd ?? null,
      p_broker_linked_verified: verified?.verified_broker_linked ?? false,
      p_payment_verified: verified?.verified_payment ?? false,
    });
    if (error) {
      if (error.message === "vip_request_revision_conflict") return vipJson({ error: "Le membre ou un autre administrateur a modifié le dossier. Actualisez et vérifiez à nouveau les informations." }, 409);
      if (error.message === "vip_completion_outstanding") return vipJson({ error: "Le membre doit répondre à la demande de complément avant validation." }, 409);
      if (error.message === "vip_request_unavailable") return vipJson({ error: "Cette demande a déjà été traitée ou n’existe plus." }, 409);
      if (error.message === "vip_membership_exists") return vipJson({ error: "Ce compte a déjà un accès VIP. Utilisez sa fiche membre pour le gérer." }, 409);
      if (error.message === "vip_request_approval_invalid") return vipJson({ error: "Vérifiez l’identité, le broker et la date réelle du dernier paiement." }, 400);
      throw error;
    }
    after(async () => {
      if (process.env.VERCEL_ENV !== "production") return;
      const outcomes = await Promise.allSettled([
        deliverVipAccessConfirmations(context.admin),
        (async () => {
          try { await queueVipAdminActivity(context.admin); }
          catch { console.error("VIP_ADMIN_ACTIVITY_DEFERRED_FAILED"); }
          return deliverVipNotifications(context.admin);
        })(),
      ]);
      if (outcomes.some(outcome => outcome.status === "rejected")) console.error("VIP_ACCESS_CONFIRMATION_DEFERRED_FAILED");
    });
    return vipJson({ ok: true, request: data });
  } catch (error) { return vipErrorResponse(error); }
}
