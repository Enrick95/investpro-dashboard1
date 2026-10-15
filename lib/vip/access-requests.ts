import { isVipAffiliationBroker, normalizeVipPersonName, validateVipIdentity } from "./identity";
import { isVipMembershipType } from "./membership";

export const VIP_ACCESS_REQUEST_COLUMNS = "id,user_id,email,first_name,last_name,telegram_username,type,affiliation_broker,status,created_at,reviewed_at,verified_type,verified_affiliation_broker,verified_expires_at";

export type VipAccessRequestInput = {
  firstName?: unknown; lastName?: unknown; telegramUsername?: unknown;
  type?: unknown; affiliationBroker?: unknown; expiresAt?: unknown;
};

export function validateVipAccessRequest(input: VipAccessRequestInput) {
  const firstName = normalizeVipPersonName(input.firstName);
  const lastName = normalizeVipPersonName(input.lastName);
  if (!firstName || !lastName) return { ok: false as const, error: "Renseignez votre prénom et votre nom (80 caractères maximum)." };
  if (!isVipMembershipType(input.type)) return { ok: false as const, error: "Choisissez votre mode d’accès : affiliation ou abonnement." };
  const rawUsername = typeof input.telegramUsername === "string" ? input.telegramUsername.trim() : "";
  const username = rawUsername.replace(/^@/, "");
  if (rawUsername && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) return { ok: false as const, error: "Vérifiez votre nom d’utilisateur Telegram, par exemple @monpseudo (5 à 32 caractères)." };
  if (input.telegramUsername !== undefined && typeof input.telegramUsername !== "string") return { ok: false as const, error: "Nom d’utilisateur Telegram invalide." };
  if (input.type === "affiliation" && input.affiliationBroker !== "unknown" && !isVipAffiliationBroker(input.affiliationBroker)) {
    return { ok: false as const, error: "Choisissez votre broker ou « Je ne sais plus · à vérifier »." };
  }
  return { ok: true as const, value: {
    first_name: firstName, last_name: lastName, telegram_username: username ? username.toLowerCase() : null, type: input.type,
    affiliation_broker: input.type === "affiliation" && isVipAffiliationBroker(input.affiliationBroker) ? input.affiliationBroker : null,
  } };
}

export function validateVipApproval(input: VipAccessRequestInput, now = Date.now()) {
  if (!isVipMembershipType(input.type)) return { ok: false as const, error: "Confirmez le mode d’accès du membre." };
  const identity = validateVipIdentity(input, input.type);
  if (!identity.ok) return identity;
  let expiresAt: string | null = null;
  if (input.type === "abonnement") {
    const timestamp = typeof input.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(input.expiresAt) ? Date.parse(input.expiresAt) : NaN;
    if (!Number.isFinite(timestamp) || timestamp <= now) return { ok: false as const, error: "Indiquez la date et l’heure de fin réellement payées, encore à venir. Aucun nouveau mois n’est ajouté." };
    expiresAt = new Date(timestamp).toISOString();
  }
  return { ok: true as const, value: { ...identity.identity, type: input.type, expires_at: expiresAt } };
}
