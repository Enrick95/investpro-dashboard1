import { requireVipAccess, readVipJson, vipJson, VipRequestError } from "@/lib/vip/membership-server";
import { isVipPostId, isVipReaction } from "@/lib/vip/post-validation";
import { assertVipMutationEnvironment, normalizedReactions, vipPostErrorResponse } from "@/lib/vip/posts-server";

export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireVipAccess(request);
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    assertVipMutationEnvironment();
    const { id } = await context.params;
    if (!isVipPostId(id)) throw new VipRequestError("Publication invalide.", 400);
    const input = await readVipJson(request, 1024);
    if (!Object.hasOwn(input, "reaction") || (input.reaction !== null && !isVipReaction(input.reaction))) throw new VipRequestError("Réaction invalide.", 400);
    const { data, error } = await access.db.rpc("vip_set_post_reaction", { p_post_id: id, p_user_id: access.user.id, p_reaction: input.reaction, p_is_admin: access.admin });
    if (error) {
      if (error.message?.includes("vip_access_inactive")) throw new VipRequestError("Votre accès VIP n’est pas actif.", 403);
      if (error.message?.includes("vip_post_unavailable")) throw new VipRequestError("Publication introuvable.", 404);
      throw error;
    }
    return vipJson({ postId: id, reactions: normalizedReactions(data) });
  } catch (error) { return vipPostErrorResponse(error, "Impossible d’enregistrer votre réaction. Réessayez."); }
}
