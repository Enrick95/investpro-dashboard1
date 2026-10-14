import { authenticateAdmin } from "@/lib/admin/permissions";
import { createVipInvitationCode, hashVipInvitationCode, readVipJson, VIP_INVITATION_COLUMNS, VIP_MEMBERSHIP_COLUMNS, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { isValidVipEmail, isVipMembershipType, normalizeVipEmail } from "@/lib/vip/membership";
import type { VipInvitation } from "@/lib/vip/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const context = await authenticateAdmin(request, "users");
  if ("error" in context) return vipJson({ error: context.error }, context.status);
  try {
    const [members, invitations, settings] = await Promise.all([
      context.admin.from("vip_memberships").select(VIP_MEMBERSHIP_COLUMNS).order("updated_at", { ascending: false }).limit(1000),
      context.admin.from("vip_invitations").select(VIP_INVITATION_COLUMNS).order("created_at", { ascending: false }).limit(1000),
      context.admin.from("vip_settings").select("telegram_invite_url").eq("id", 1).maybeSingle(),
    ]);
    if (members.error || invitations.error || settings.error) throw new Error("vip_admin_read_failed");
    return vipJson({ members: members.data || [], invitations: invitations.data || [], settings: { telegramConfigured: Boolean(settings.data?.telegram_invite_url) } });
  } catch (error) { return vipErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readVipJson(request);
    const context = await authenticateAdmin(request, "users_write");
    if ("error" in context) return vipJson({ error: context.error }, context.status);
    if (body.action === "invite") {
      const email = normalizeVipEmail(body.email);
      if (!isValidVipEmail(email) || !isVipMembershipType(body.type)) return vipJson({ error: "E-mail et origine de l’accès valides requis." }, 400);
      const { data: existing, error: lookupError } = await context.admin.from("vip_memberships").select("user_id").eq("email", email).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return vipJson({ error: "Un accès existe déjà pour ce compte. Utilisez les actions de renouvellement ou de réactivation." }, 409);
      const code = createVipInvitationCode(body.type);
      const { data, error } = await context.admin.from("vip_invitations").insert({ email, type: body.type, code_hash: hashVipInvitationCode(code), created_by: context.user.id }).select(VIP_INVITATION_COLUMNS).single();
      if (error) throw error;
      return vipJson({ code, invitation: data as VipInvitation, activationUrl: `/vip?code=${encodeURIComponent(code)}` }, 201);
    }
    if (body.action === "revokeInvitation") {
      if (typeof body.id !== "string" || !uuid.test(body.id)) return vipJson({ error: "Invitation invalide." }, 400);
      const { data, error } = await context.admin.from("vip_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", body.id).is("redeemed_at", null).is("revoked_at", null).select(VIP_INVITATION_COLUMNS).maybeSingle();
      if (error) throw error;
      if (!data) return vipJson({ error: "Cette invitation est déjà utilisée, annulée ou indisponible." }, 409);
      return vipJson({ ok: true, invitation: data as VipInvitation });
    }
    if (["renew", "suspend", "resume"].includes(String(body.action))) {
      if (typeof body.userId !== "string" || !uuid.test(body.userId)) return vipJson({ error: "Membre invalide." }, 400);
      const { data, error } = await context.admin.rpc("vip_admin_membership_action", { p_user_id: body.userId, p_action: body.action });
      if (error) {
        if (error.message === "vip_membership_missing") return vipJson({ error: "Ce membre n’a pas d’accès VIP." }, 404);
        if (error.message === "vip_subscription_required") return vipJson({ error: "Seuls les abonnements mensuels peuvent être renouvelés." }, 400);
        throw error;
      }
      return vipJson({ ok: true, membership: data });
    }
    return vipJson({ error: "Action VIP inconnue." }, 400);
  } catch (error) { return vipErrorResponse(error); }
}
