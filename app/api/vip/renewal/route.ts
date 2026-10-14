import { authenticateVip, readVipJson, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import type { VipMembership } from "@/lib/vip/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await readVipJson(request);
    const context = await authenticateVip(request);
    if ("error" in context) return vipJson({ error: context.error }, context.status);
    const { data, error } = await context.db.rpc("vip_request_renewal", { p_user_id: context.user.id });
    if (error) {
      if (error.message === "vip_membership_missing") return vipJson({ error: "Aucun abonnement VIP n’est rattaché à ce compte." }, 404);
      if (error.message === "vip_subscription_required") return vipJson({ error: "Cet accès affilié ne nécessite pas de renouvellement mensuel." }, 400);
      throw error;
    }
    const membership = data as VipMembership;
    return vipJson({ ok: true, membership, requestedAt: membership.renewal_requested_at });
  } catch (error) { return vipErrorResponse(error); }
}
