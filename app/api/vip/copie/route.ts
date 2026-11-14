import { readVipJson, requireVipAccess, vipErrorResponse, vipJson, VipRequestError } from "@/lib/vip/membership-server";
import { assertVipMutationEnvironment } from "@/lib/vip/posts-server";

export const dynamic = "force-dynamic";

/**
 * Onglet « Copie » de l'espace VIP : la copie du compte d'Enrick ouvre bientôt. Un membre actif peut demander à être
 * prévenu de l'ouverture, ou retirer sa demande. Rien d'autre n'est enregistré : ni compte, ni mot de passe.
 */
export async function GET(request: Request) {
  try {
    const access = await requireVipAccess(request);
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    const { data, error } = await access.db.from("vip_copy_interest").select("created_at").eq("user_id", access.user.id).maybeSingle();
    if (error) throw new VipRequestError("La copie est momentanément indisponible.", 503);
    return vipJson({ status: "soon", notify: Boolean(data) });
  } catch (error) { return vipErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const access = await requireVipAccess(request);
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    assertVipMutationEnvironment();
    const input = await readVipJson(request, 256);
    if (Object.keys(input).length !== 1 || typeof input.notify !== "boolean") throw new VipRequestError("Demande invalide.", 400);
    const table = access.db.from("vip_copy_interest");
    const { error } = input.notify
      ? await table.upsert({ user_id: access.user.id }, { onConflict: "user_id", ignoreDuplicates: true })
      : await table.delete().eq("user_id", access.user.id);
    if (error) throw new VipRequestError("Ta demande n’a pas pu être enregistrée. Réessaie dans un instant.", 503);
    return vipJson({ status: "soon", notify: input.notify });
  } catch (error) { return vipErrorResponse(error); }
}
