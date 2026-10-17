import { isSameVipOrigin } from "@/lib/vip/membership";
import { vipErrorResponse, vipJson, VipRequestError } from "@/lib/vip/membership-server";
import { isVipChatUuid } from "@/lib/vip/chat";
import { assertVipChatMutationEnvironment, requireVipChatAccess } from "@/lib/vip/chat-server";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireVipChatAccess(request);
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    assertVipChatMutationEnvironment();
    if (!isSameVipOrigin(request)) throw new VipRequestError("Origine de la requête refusée.", 403);
    const { id } = await context.params;
    if (!isVipChatUuid(id)) throw new VipRequestError("Message invalide.", 400);
    // Repeating an owner/admin deletion is safe after a lost success response.
    let query = access.db.from("vip_chat_messages").update({ body: "", deleted_at: new Date().toISOString() }).eq("id", id);
    if (!access.admin) query = query.eq("author_id", access.user.id);
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw new VipRequestError("Le message n’a pas pu être supprimé.", 503);
    if (!data) throw new VipRequestError("Message introuvable ou suppression non autorisée.", 404);
    return vipJson({ ok: true });
  } catch (error) { return vipErrorResponse(error); }
}
