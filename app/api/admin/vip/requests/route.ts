import { authenticateAdmin } from "@/lib/admin/permissions";
import { validateVipApproval, VIP_ACCESS_REQUEST_COLUMNS } from "@/lib/vip/access-requests";
import { readVipJson, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const context = await authenticateAdmin(request, "users_write");
  if ("error" in context) return vipJson({ error: context.error }, context.status);
  try {
    const { data, error } = await context.admin.from("vip_access_requests").select(VIP_ACCESS_REQUEST_COLUMNS).eq("status", "pending").order("created_at", { ascending: true }).limit(1000);
    if (error) throw error;
    return vipJson({ requests: data || [] });
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
    const { data, error } = await context.admin.rpc("vip_review_access_request", {
      p_request_id: body.id, p_action: body.action, p_reviewed_by: context.user.id,
      p_first_name: value?.first_name || null, p_last_name: value?.last_name || null,
      p_type: value?.type || null, p_affiliation_broker: value?.affiliation_broker || null, p_expires_at: value?.expires_at || null,
    });
    if (error) {
      if (error.message === "vip_request_unavailable") return vipJson({ error: "Cette demande a déjà été traitée ou n’existe plus." }, 409);
      if (error.message === "vip_membership_exists") return vipJson({ error: "Ce compte a déjà un accès VIP. Utilisez sa fiche membre pour le gérer." }, 409);
      if (error.message === "vip_request_approval_invalid") return vipJson({ error: "Vérifiez l’identité, le broker et l’échéance réellement payée." }, 400);
      throw error;
    }
    return vipJson({ ok: true, request: data });
  } catch (error) { return vipErrorResponse(error); }
}
