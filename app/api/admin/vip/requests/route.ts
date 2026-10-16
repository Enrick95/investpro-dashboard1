import { authenticateAdmin } from "@/lib/admin/permissions";
import { validateNewVipApproval, validateVipApproval, VIP_ACCESS_REQUEST_COLUMNS } from "@/lib/vip/access-requests";
import { readVipJson, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { after } from "next/server";
import { queueVipAdminActivity } from "@/lib/vip/admin-activity";
import { deliverVipNotifications } from "@/lib/vip/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const context = await authenticateAdmin(request, "users_write");
  if ("error" in context) return vipJson({ error: context.error }, context.status);
  try {
    const history = new URL(request.url).searchParams.get("history") === "1";
    const { data, error } = await context.admin.from("vip_access_requests").select(VIP_ACCESS_REQUEST_COLUMNS).eq("status", history ? "approved" : "pending").order(history ? "reviewed_at" : "created_at", { ascending: !history }).limit(history ? 100 : 1000);
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
    if (typeof body.id !== "string" || !uuid.test(body.id) || !["approve", "deny"].includes(String(body.action))) return vipJson({ error: "Demande ou action invalide." }, 400);
    const validation = body.action === "approve" ? validateVipApproval(body) : null;
    if (validation && !validation.ok) return vipJson({ error: validation.error }, 400);
    const value = validation?.ok ? validation.value : null;
    // The stored intake controls additional checks; browser-supplied requestKind
    // cannot disguise a new application as an existing member declaration.
    const source = await context.admin.from("vip_access_requests").select("id,request_kind,type,copy_requested,status").eq("id", body.id).maybeSingle();
    if (source.error) throw source.error;
    if (!source.data || source.data.status !== "pending") return vipJson({ error: "Cette demande a déjà été traitée ou n’existe plus." }, 409);
    const checks = body.action === "approve" && source.data.request_kind === "new" ? validateNewVipApproval(body, source.data) : null;
    if (checks && !checks.ok) return vipJson({ error: checks.error }, 400);
    const verified = checks?.ok ? checks.value : null;
    const { data, error } = await context.admin.rpc(source.data.request_kind === "new" ? "vip_review_access_request_checked" : "vip_review_access_request", {
      p_request_id: body.id, p_action: body.action, p_reviewed_by: context.user.id,
      p_first_name: value?.first_name || null, p_last_name: value?.last_name || null,
      p_type: value?.type || null, p_affiliation_broker: value?.affiliation_broker || null, p_paid_on: value?.paid_on || null,
      ...(source.data.request_kind === "new" ? {
        p_verified_deposit_usd: verified?.verified_deposit_usd ?? null,
        p_broker_linked_verified: verified?.verified_broker_linked ?? false,
        p_payment_verified: verified?.verified_payment ?? false,
      } : {}),
    });
    if (error) {
      if (error.message === "vip_request_unavailable") return vipJson({ error: "Cette demande a déjà été traitée ou n’existe plus." }, 409);
      if (error.message === "vip_membership_exists") return vipJson({ error: "Ce compte a déjà un accès VIP. Utilisez sa fiche membre pour le gérer." }, 409);
      if (error.message === "vip_request_approval_invalid") return vipJson({ error: "Vérifiez l’identité, le broker et la date réelle du dernier paiement." }, 400);
      throw error;
    }
    after(async () => {
      try { await queueVipAdminActivity(context.admin); await deliverVipNotifications(context.admin); }
      catch { console.error("VIP_ADMIN_ACTIVITY_DEFERRED_FAILED"); }
    });
    return vipJson({ ok: true, request: data });
  } catch (error) { return vipErrorResponse(error); }
}
