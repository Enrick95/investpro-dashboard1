import { authenticateVip, hashVipInvitationCode, readVipJson, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { isValidVipCode, normalizeVipCode } from "@/lib/vip/membership";
import type { VipMembership } from "@/lib/vip/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readVipJson(request);
    const context = await authenticateVip(request);
    if ("error" in context) return vipJson({ error: context.error }, context.status);
    if (!context.user.email || !context.user.email_confirmed_at) {
      return vipJson({ error: "Vérifiez l’adresse e-mail de votre compte avant d’activer le VIP." }, 403);
    }
    const code = normalizeVipCode(body.code);
    if (!isValidVipCode(code)) return vipJson({ error: "Ce code d’invitation est invalide." }, 400);
    const { data, error } = await context.db.rpc("vip_redeem_invitation", {
      p_code_hash: hashVipInvitationCode(code),
      p_user_id: context.user.id,
      p_email: context.user.email,
      p_email_confirmed_at: context.user.email_confirmed_at,
    });
    if (error) {
      if (error.message === "vip_membership_exists") {
        return vipJson({ error: "Votre accès est déjà rattaché à ce compte. Contactez l’équipe pour le renouveler ou le réactiver." }, 409);
      }
      if (error.message === "vip_email_unconfirmed") return vipJson({ error: "Vérifiez l’adresse e-mail de votre compte." }, 403);
      if (error.message === "vip_invitation_unavailable" || error.message === "vip_invitation_invalid") {
        return vipJson({ error: "Cette invitation n’est pas disponible pour ce compte : vérifiez l’e-mail, le code ou sa date de validité." }, 400);
      }
      throw error;
    }
    return vipJson({ membership: data as VipMembership, active: true });
  } catch (error) { return vipErrorResponse(error); }
}
