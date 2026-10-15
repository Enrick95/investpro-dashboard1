import { requireVipAccess, vipJson } from "@/lib/vip/membership-server";
import { hydrateVipPosts, VIP_POST_COLUMNS, vipPostErrorResponse, type VipStoredPost } from "@/lib/vip/posts-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const access = await requireVipAccess(request);
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    const { data, error } = await access.db.from("vip_posts").select(VIP_POST_COLUMNS).eq("published", true).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return vipJson({ posts: await hydrateVipPosts(access.db, (data || []) as VipStoredPost[], access.user.id, { membership: access.membership, admin: access.admin }) });
  } catch (error) { return vipPostErrorResponse(error, "Les publications privées sont indisponibles."); }
}
