import { requireVipAccess, vipJson, VipRequestError } from "@/lib/vip/membership-server";
import { isVipPostId } from "@/lib/vip/post-validation";
import { vipPostErrorResponse } from "@/lib/vip/posts-server";
import { parseVipSignalRisk } from "@/lib/vip/signal-risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireVipAccess(request);
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    const { id } = await context.params;
    if (!isVipPostId(id)) throw new VipRequestError("Publication invalide.", 400);
    const { data, error } = await access.db.from("vip_posts")
      .select("id,category,title,body,symbol,direction,levels,published")
      .eq("id", id).eq("category", "signal").eq("published", true).maybeSingle();
    if (error) throw error;
    if (!data || data.published !== true || data.category !== "signal") throw new VipRequestError("Ce signal n’est plus disponible.", 404);
    const signal = parseVipSignalRisk(data);
    if (!signal) throw new VipRequestError("Ce signal n’est plus disponible.", 404);
    return vipJson(signal);
  } catch (error) { return vipPostErrorResponse(error, "Ce signal est momentanément indisponible. Réessayez."); }
}
