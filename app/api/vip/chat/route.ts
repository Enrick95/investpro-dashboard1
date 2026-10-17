import { readVipJson, vipErrorResponse, vipJson, VipRequestError } from "@/lib/vip/membership-server";
import { isVipChatUuid, vipChatPublicName, vipChatText, VIP_CHAT_MAX_BODY_BYTES, VIP_CHAT_PAGE_SIZE } from "@/lib/vip/chat";
import { assertVipChatMutationEnvironment, decodeVipChatCursor, encodeVipChatCursor, requireVipChatAccess, VIP_CHAT_COLUMNS, vipChatMessage, type VipChatStoredMessage } from "@/lib/vip/chat-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireVipChatAccess(request);
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    const cursor = decodeVipChatCursor(new URL(request.url).searchParams.get("before"));
    let query = access.db.from("vip_chat_messages").select(VIP_CHAT_COLUMNS).is("deleted_at", null)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(VIP_CHAT_PAGE_SIZE + 1);
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error) throw new VipRequestError("Les messages sont temporairement indisponibles.", 503);
    const rows = (data || []) as VipChatStoredMessage[];
    const page = rows.slice(0, VIP_CHAT_PAGE_SIZE);
    const nextCursor = rows.length > VIP_CHAT_PAGE_SIZE ? encodeVipChatCursor(page[page.length - 1]) : null;
    return vipJson({ messages: page.reverse().map(row => vipChatMessage(row, access.user.id)), nextCursor, canModerate: access.admin });
  } catch (error) { return vipErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const access = await requireVipChatAccess(request);
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    assertVipChatMutationEnvironment();
    const input = await readVipJson(request, VIP_CHAT_MAX_BODY_BYTES);
    const text = vipChatText(input.text);
    if (!text) throw new VipRequestError("Écrivez un message de 1 à 2 000 caractères.", 400);
    if (!isVipChatUuid(input.clientId)) throw new VipRequestError("Identifiant du message invalide.", 400);
    const { data: profile, error: profileError } = await access.db.from("profiles").select("username").eq("id", access.user.id).maybeSingle();
    if (profileError) throw new VipRequestError("Votre nom public est temporairement indisponible.", 503);
    const { data, error } = await access.db.rpc("vip_chat_send", {
      p_author_id: access.user.id, p_client_id: input.clientId.toLowerCase(),
      p_body: text, p_author_name: vipChatPublicName(profile?.username), p_admin_author: access.admin,
    });
    if (error) {
      if (error.message === "vip_chat_rate_limited") return vipJson({ error: "Quelques secondes entre chaque message, s’il vous plaît. Réessayez dans un instant." }, 429);
      if (error.message === "vip_chat_message_deleted") return vipJson({ error: "Ce message a été supprimé. Écrivez un nouveau message pour continuer." }, 409);
      if (error.message === "vip_chat_client_conflict") return vipJson({ error: "Ce message a déjà été envoyé avec un autre contenu. Réessayez avec un nouveau message." }, 409);
      throw new VipRequestError("Le message n’a pas pu être envoyé. Vous pouvez réessayer.", 503);
    }
    if (!Array.isArray(data) || data.length !== 1) throw new VipRequestError("L’envoi du message n’a pas été confirmé.", 503);
    return vipJson({ message: vipChatMessage(data[0] as VipChatStoredMessage, access.user.id) }, 201);
  } catch (error) { return vipErrorResponse(error); }
}
