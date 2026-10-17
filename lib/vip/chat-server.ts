import "server-only";

import { requireVipAccess, VipRequestError } from "./membership-server";
import { isVipChatUuid, vipChatPublicName, type VipChatMessage } from "./chat";

export const VIP_CHAT_COLUMNS = "id,body,author_id,author_name,admin_author,created_at";
export type VipChatStoredMessage = {
  id: string; body: string; author_id: string; author_name: string;
  admin_author: boolean; created_at: string;
};

/** Revalidate identity, current VIP membership and current admin permissions on every request. */
export async function requireVipChatAccess(request: Request) {
  const access = await requireVipAccess(request);
  if ("error" in access) return access;
  if (!access.user.email_confirmed_at || access.user.is_anonymous) return { error: "Confirmez votre adresse e-mail avant d’accéder au chat.", status: 403 };
  const bannedUntil = (access.user as unknown as { banned_until?: string | null }).banned_until;
  if (bannedUntil && Date.parse(bannedUntil) > Date.now()) return { error: "Votre compte ne peut pas accéder au chat.", status: 403 };
  return access;
}

export function vipChatMessage(row: VipChatStoredMessage, userId: string): VipChatMessage {
  return {
    id: row.id, body: row.body, authorId: row.author_id,
    authorName: vipChatPublicName(row.author_name), createdAt: row.created_at,
    own: row.author_id === userId, adminAuthor: row.admin_author === true,
  };
}

export type VipChatCursor = { createdAt: string; id: string };
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export function encodeVipChatCursor(row: VipChatStoredMessage): string {
  return Buffer.from(JSON.stringify([row.created_at, row.id]), "utf8").toString("base64url");
}
export function decodeVipChatCursor(value: string | null): VipChatCursor | null {
  if (value === null) return null;
  try {
    if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error();
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw Error();
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== "string" || !timestamp.test(parsed[0]) || !Number.isFinite(Date.parse(parsed[0])) || !isVipChatUuid(parsed[1])) throw Error();
    return { createdAt: parsed[0], id: parsed[1].toLowerCase() };
  } catch { throw new VipRequestError("Page de messages invalide.", 400); }
}

export function assertVipChatMutationEnvironment() {
  if (process.env.VERCEL_ENV === "preview") throw new VipRequestError("Le chat est en lecture seule sur les aperçus. Utilisez le site principal pour écrire.", 403);
}
