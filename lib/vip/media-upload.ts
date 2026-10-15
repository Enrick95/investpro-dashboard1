import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { VipRequestError } from "./membership-server";
import { isVipImagePath, isVipPostId, validateVipMediaMetadata } from "./post-validation";

const TICKET_LIFETIME_MS = 2 * 60 * 60 * 1000;
const DOMAIN = "investpro-vip-media-ticket-v1:";
type VipUploadTicket = { v: 1; userId: string; imagePath: string; mimeType: string; sizeBytes: number; expiresAt: number };
function ticketSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) throw new VipRequestError("Importation sécurisée indisponible.", 503);
  return secret;
}
function signature(payload: string): Buffer {
  return createHmac("sha256", ticketSecret()).update(DOMAIN + payload).digest();
}
function invalidTicket(): never { throw new VipRequestError("L’autorisation d’importation est invalide ou a expiré. Sélectionnez à nouveau l’image.", 400); }

/** Stateless, authenticated metadata: the browser cannot change path, owner, MIME, size or expiry. */
export function createVipUploadTicket(userId: string, imagePath: string, mimeType: string, sizeBytes: number, now = Date.now()): string {
  if (!isVipPostId(userId) || !isVipImagePath(imagePath) || !imagePath.startsWith(userId + "/")) invalidTicket();
  validateVipMediaMetadata(imagePath.split("/").at(-1), mimeType, sizeBytes);
  const ticket: VipUploadTicket = { v: 1, userId, imagePath, mimeType, sizeBytes, expiresAt: now + TICKET_LIFETIME_MS };
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return payload + "." + signature(payload).toString("base64url");
}

export function readVipUploadTicket(value: unknown, userId: string, imagePath: unknown, now = Date.now()): VipUploadTicket {
  if (typeof value !== "string" || value.length > 2048 || !isVipImagePath(imagePath) || !imagePath.startsWith(userId + "/")) invalidTicket();
  const parts = value.split(".");
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) invalidTicket();
  const expected = signature(parts[0]), provided = Buffer.from(parts[1], "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) invalidTicket();
  let ticket: VipUploadTicket;
  try { ticket = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { invalidTicket(); }
  if (!ticket || ticket.v !== 1 || ticket.userId !== userId || ticket.imagePath !== imagePath || !Number.isSafeInteger(ticket.expiresAt) || ticket.expiresAt <= now || ticket.expiresAt > now + TICKET_LIFETIME_MS) invalidTicket();
  validateVipMediaMetadata(imagePath.split("/").at(-1), ticket.mimeType, ticket.sizeBytes);
  return ticket;
}
