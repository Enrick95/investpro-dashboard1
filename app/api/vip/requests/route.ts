import { authenticateVip, readVipJson, readVipMembership, vipErrorResponse, vipJson } from "@/lib/vip/membership-server";
import { isVipMembershipActive } from "@/lib/vip/membership";
import { validateVipAccessRequest, VIP_ACCESS_REQUEST_COLUMNS } from "@/lib/vip/access-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authenticateVip(request);
  if ("error" in context) return vipJson({ error: context.error }, context.status);
  try {
    const [membership, result] = await Promise.all([
      readVipMembership(context.db, context.user.id),
      context.db.from("vip_access_requests").select(VIP_ACCESS_REQUEST_COLUMNS).eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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
    }).select(VIP_ACCESS_REQUEST_COLUMNS).single();
    if (error?.code === "23505") return vipJson({ error: "Votre demande est déjà en attente de vérification." }, 409);
    if (error) throw error;
    return vipJson({ request: data }, 201);
  } catch (error) { return vipErrorResponse(error); }
}
