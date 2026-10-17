import { authenticateVip, hashVipInvitationCode, readVipJson, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { isValidVipCode, normalizeVipCode } from "@/lib/vip/membership";
import type { VipMembership } from "@/lib/vip/types";
import { after } from "next/server";
import { deliverVipAccessConfirmations } from "@/lib/vip/access-confirmations";
import { deliverVipNotifications } from "@/lib/vip/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    if (process.env.VERCEL_ENV === "preview") return vipJson({ error: "Activez votre accès VIP depuis le site principal." }, 403);
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
    after(async () => {
      if (process.env.VERCEL_ENV !== "production") return;
      const outcomes = await Promise.allSettled([deliverVipAccessConfirmations(context.db), deliverVipNotifications(context.db)]);
      if (outcomes.some(outcome => outcome.status === "rejected")) console.error("VIP_ACCESS_CONFIRMATION_DEFERRED_FAILED");
    });
    return vipJson({ membership: data as VipMembership, active: true });
  } catch (error) { return vipErrorResponse(error); }
}
