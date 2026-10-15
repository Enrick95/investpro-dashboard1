import { randomUUID } from "node:crypto";
import { authenticateAdmin } from "@/lib/admin/permissions";
import { readVipJson, vipJson, VipRequestError } from "@/lib/vip/membership-server";
import { createVipUploadTicket, readVipUploadTicket } from "@/lib/vip/media-upload";
import { validateVipMediaMetadata, VIP_MEDIA_BUCKET, VIP_MEDIA_TTL_SECONDS } from "@/lib/vip/post-validation";
import { assertVipImageExists, assertVipMutationEnvironment, vipPostErrorResponse } from "@/lib/vip/posts-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const access = await authenticateAdmin(request, "users_write");
    if ("error" in access) return vipJson({ error: access.error }, access.status);
    assertVipMutationEnvironment();
    const input = await readVipJson(request, 8192);
    const bucket = access.admin.storage.from(VIP_MEDIA_BUCKET);
    if (input.action === "prepare") {
      const image = validateVipMediaMetadata(input.filename, input.mimeType, input.sizeBytes);
      const imagePath = `${access.user.id}/${randomUUID()}.${image.extension}`;
      const uploadTicket = createVipUploadTicket(access.user.id, imagePath, image.mimeType, image.sizeBytes);
      const { data, error } = await bucket.createSignedUploadUrl(imagePath, { upsert: false });
      if (error || !data?.token || !data.signedUrl) throw new VipRequestError("Impossible de préparer l’importation sécurisée. Réessayez.", 503);
      return vipJson({ imagePath, token: data.token, signedUrl: data.signedUrl, uploadTicket, mimeType: image.mimeType, sizeBytes: image.sizeBytes });
    }
    if (input.action === "complete") {
      const ticket = readVipUploadTicket(input.uploadTicket, access.user.id, input.imagePath);
      const actual = await assertVipImageExists(access.admin, ticket.imagePath);
      if (actual.mimeType !== ticket.mimeType || actual.sizeBytes !== ticket.sizeBytes) throw new VipRequestError("Le fichier reçu ne correspond pas à l’image sélectionnée. Recommencez l’importation.", 400);
      const { data, error } = await bucket.createSignedUrl(ticket.imagePath, VIP_MEDIA_TTL_SECONDS);
      if (error || !data?.signedUrl) throw new VipRequestError("L’image a été importée mais son aperçu est indisponible. Réessayez l’importation.", 503);
      return vipJson({ imagePath: ticket.imagePath, imageUrl: data.signedUrl, mimeType: actual.mimeType, sizeBytes: actual.sizeBytes });
    }
    throw new VipRequestError("Étape d’importation invalide.", 400);
  } catch (error) { return vipPostErrorResponse(error, "Importation de l’image impossible. Réessayez dans un instant."); }
}
