import { authenticateAdmin } from "@/lib/admin/permissions";
import { vipJson, readVipJson, VipRequestError } from "@/lib/vip/membership-server";
import { deliverVipNotifications } from "@/lib/vip/notifications";
import { isVipPostId, validateVipPostInput } from "@/lib/vip/post-validation";
import type { VipPost } from "@/lib/vip/types";
import { assertVipImageExists, assertVipMutationEnvironment, hydrateVipPosts, VIP_POST_COLUMNS, vipPostErrorResponse, type VipStoredPost } from "@/lib/vip/posts-server";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const access = await authenticateAdmin(request, "users_write");
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    const { data, error } = await access.admin.from("vip_posts").select(VIP_POST_COLUMNS).eq("published", true).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return vipJson({ posts: await hydrateVipPosts(access.admin, (data || []) as VipStoredPost[], access.user.id, { admin: true }) });
  } catch (error) { return vipPostErrorResponse(error, "Publications indisponibles."); }
}

export async function POST(request: Request) {
  try {
    const access = await authenticateAdmin(request, "users_write");
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    assertVipMutationEnvironment();
    const input = await readVipJson(request, 65536);
    const fields = validateVipPostInput(input);
    if (fields.image_path) await assertVipImageExists(access.admin, fields.image_path);
    const { data: post, error } = await access.admin.from("vip_posts").insert({ ...fields, created_by: access.user.id, published: true }).select(VIP_POST_COLUMNS).single();
    if (error || !post) throw error || new Error("Missing publication");
    // Only creation queues a generic alert through the existing INSERT trigger.
    after(async () => {
      try { await deliverVipNotifications(access.admin); }
      catch { console.error("VIP_NOTIFICATION_DELIVERY_RETRY_PENDING"); }
    });
    // Do not report a successful insert as failed merely because a subsequent read is unavailable.
    let published: VipPost | VipStoredPost = post as VipStoredPost;
    try { [published] = await hydrateVipPosts(access.admin, [post as VipStoredPost], access.user.id, { admin: true }); }
    catch { published = { ...post, image_url: fields.image_path ? null : post.image_url }; }
    return vipJson({ post: published, notifications: { queued: true } }, 201);
  } catch (error) { return vipPostErrorResponse(error, "Publication impossible. Réessayez après avoir actualisé le fil pour vérifier qu’elle n’a pas déjà été publiée."); }
}

export async function PATCH(request: Request) {
  try {
    const access = await authenticateAdmin(request, "users_write");
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    assertVipMutationEnvironment();
    const input = await readVipJson(request, 65536);
    if (!isVipPostId(input.id)) throw new VipRequestError("Publication invalide.", 400);
    const { data: current, error: readError } = await access.admin.from("vip_posts").select(VIP_POST_COLUMNS).eq("id", input.id).maybeSingle();
    if (readError) throw readError;
    if (!current) throw new VipRequestError("Publication introuvable.", 404);
    const fields = validateVipPostInput(input, current as VipStoredPost);
    if (!Object.keys(fields).length) throw new VipRequestError("Aucune modification à enregistrer.", 400);
    const imagePath = Object.hasOwn(fields, "image_path") ? fields.image_path : current.image_path;
    if (imagePath) await assertVipImageExists(access.admin, imagePath);
    let expected = current.updated_at;
    if (Object.hasOwn(input, "expectedUpdatedAt")) {
      if (typeof input.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(input.expectedUpdatedAt))) throw new VipRequestError("Date de modification invalide.", 400);
      expected = input.expectedUpdatedAt;
    }
    const { data: post, error } = await access.admin.from("vip_posts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", input.id).eq("updated_at", expected).select(VIP_POST_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!post) throw new VipRequestError("Cette publication a été modifiée entre-temps. Actualisez-la avant de réessayer.", 409);
    let updated: VipPost | VipStoredPost = post as VipStoredPost;
    try { [updated] = await hydrateVipPosts(access.admin, [post as VipStoredPost], access.user.id, { admin: true }); }
    catch { updated = { ...post, image_url: post.image_path ? null : post.image_url }; }
    // No notification, outbox insert or delivery call on an edit.
    return vipJson({ post: updated, notifications: { queued: false } });
  } catch (error) { return vipPostErrorResponse(error, "Modification impossible. Actualisez la publication pour vérifier son état."); }
}
