import { randomUUID } from "node:crypto";
import { authenticateAdmin } from "@/lib/admin/permissions";
import { vipJson, VipRequestError } from "@/lib/vip/membership-server";
import { validateVipMedia, VIP_MEDIA_BUCKET, VIP_MEDIA_TTL_SECONDS } from "@/lib/vip/post-validation";
import { assertVipMutationEnvironment, readVipImageUpload, vipPostErrorResponse } from "@/lib/vip/posts-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const access = await authenticateAdmin(request, "users_write");
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    assertVipMutationEnvironment();
    const file = await readVipImageUpload(request);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = validateVipMedia(bytes, file.type, file.name);
    const imagePath = `${access.user.id}/${randomUUID()}.${image.extension}`;
    const bucket = access.admin.storage.from(VIP_MEDIA_BUCKET);
    const { error } = await bucket.upload(imagePath, bytes, { contentType: image.mimeType, cacheControl: "60", upsert: false });
    if (error) throw error;
    const { data, error: signingError } = await bucket.createSignedUrl(imagePath, VIP_MEDIA_TTL_SECONDS);
    if (signingError || !data?.signedUrl) throw new VipRequestError("L’image a été importée mais son aperçu est indisponible. Réessayez l’importation.", 503);
    return vipJson({ imagePath, imageUrl: data.signedUrl, mimeType: image.mimeType, sizeBytes: bytes.length }, 201);
  } catch (error) { return vipPostErrorResponse(error, "Importation de l’image impossible. Réessayez dans un instant."); }
}
