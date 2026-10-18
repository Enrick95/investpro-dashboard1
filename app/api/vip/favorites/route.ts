import { requireVipAccess, vipJson, VipRequestError } from "@/lib/vip/membership-server";
import { decodeVipFavoriteCursor, encodeVipFavoriteCursor, VIP_FAVORITES_PAGE_SIZE } from "@/lib/vip/favorites-server";
import { hydrateVipPosts, VIP_POST_COLUMNS, vipPostErrorResponse, type VipStoredPost } from "@/lib/vip/posts-server";

export const dynamic = "force-dynamic";
type FavoriteRow = { post_id: string; created_at: string; post: VipStoredPost | null };

export async function GET(request: Request) {
  try {
    const access = await requireVipAccess(request);
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== "cursor") || params.getAll("cursor").length > 1) throw new VipRequestError("Page de favoris invalide.", 400);
    const cursor = decodeVipFavoriteCursor(params.get("cursor"));
    let query = access.db.from("vip_post_favorites")
      .select(`post_id,created_at,post:vip_posts!inner(${VIP_POST_COLUMNS})`)
      .eq("user_id", access.user.id).eq("post.published", true)
      .order("created_at", { ascending: false }).order("post_id", { ascending: false })
      .limit(VIP_FAVORITES_PAGE_SIZE + 1);
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},post_id.lt.${cursor.postId})`);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new VipRequestError("Favoris indisponibles.", 503);
    const rows = data as unknown as FavoriteRow[];
    // Fail closed even if the relation shape or its published filter changes unexpectedly.
    if (rows.some(row => !row.post || !row.post.published || row.post.id !== row.post_id)) throw new VipRequestError("Favoris indisponibles.", 503);
    const page = rows.slice(0, VIP_FAVORITES_PAGE_SIZE);
    const posts = await hydrateVipPosts(access.db, page.map(row => row.post as VipStoredPost), access.user.id, { membership: access.membership, admin: access.admin });
    const last = page.at(-1);
    return vipJson({
      posts: posts.map(post => ({ ...post, favorite: true })),
      nextCursor: rows.length > VIP_FAVORITES_PAGE_SIZE && last ? encodeVipFavoriteCursor({ createdAt: last.created_at, postId: last.post_id }) : null,
    });
  } catch (error) { return vipPostErrorResponse(error, "Vos favoris sont indisponibles. Réessayez."); }
}
