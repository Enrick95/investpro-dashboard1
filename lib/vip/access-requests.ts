import { isVipAffiliationBroker, normalizeVipPersonName, validateVipIdentity } from "./identity";
import { isVipMembershipType } from "./membership";

export const VIP_ACCESS_REQUEST_COLUMNS = "id,user_id,email,first_name,last_name,telegram_username,type,affiliation_broker,paid_on,status,created_at,reviewed_at,verified_type,verified_affiliation_broker,verified_paid_on,verified_expires_at";

export type VipAccessRequestInput = {
  firstName?: unknown; lastName?: unknown; telegramUsername?: unknown;
  type?: unknown; affiliationBroker?: unknown; paidOn?: unknown;
};

const parisCalendar = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

function parisDateParts(timestamp: number) {
  const parts = parisCalendar.formatToParts(timestamp);
  const part = (type: string) => Number(parts.find(value => value.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: part("second") };
}

export function vipParisPaymentDate(timestamp = Date.now()): string {
  const value = parisDateParts(timestamp);
  return `${value.year.toString().padStart(4, "0")}-${value.month.toString().padStart(2, "0")}-${value.day.toString().padStart(2, "0")}`;
}

/** Next calendar renewal date at 00:00 Europe/Paris, matching PostgreSQL date + interval '1 month'. */
export function vipPaymentExpiry(paidOn: unknown): string | null {
  if (typeof paidOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return null;
  const date = new Date(`${paidOn}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== paidOn) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const finalDay = new Date(date);
  finalDay.setUTCMonth(finalDay.getUTCMonth() + 1);
  finalDay.setUTCDate(0);
  date.setUTCDate(Math.min(day, finalDay.getUTCDate()));
  const utcMidnight = date.getTime();
  // Europe/Paris switches clocks after midnight; its offset at UTC midnight
  // equals the offset of the corresponding local midnight, including DST days.
  const local = parisDateParts(utcMidnight);
  const localAsUtc = new Date(date);
  localAsUtc.setUTCFullYear(local.year, local.month - 1, local.day);
  localAsUtc.setUTCHours(local.hour, local.minute, local.second, 0);
  return new Date(utcMidnight - (localAsUtc.getTime() - utcMidnight)).toISOString();
}

export function validateVipAccessRequest(input: VipAccessRequestInput, now = Date.now()) {
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
  let paidOn: string | null = null;
  if (input.type === "abonnement") {
    if (!vipPaymentExpiry(input.paidOn) || typeof input.paidOn !== "string" || input.paidOn > vipParisPaymentDate(now)) return { ok: false as const, error: "Indiquez la date de votre dernier paiement, sans date future." };
    paidOn = input.paidOn;
  }
  return { ok: true as const, value: {
    first_name: firstName, last_name: lastName, telegram_username: username ? username.toLowerCase() : null, type: input.type,
    affiliation_broker: input.type === "affiliation" && isVipAffiliationBroker(input.affiliationBroker) ? input.affiliationBroker : null,
    paid_on: paidOn,
  } };
}

export function validateVipApproval(input: VipAccessRequestInput, now = Date.now()) {
  if (!isVipMembershipType(input.type)) return { ok: false as const, error: "Confirmez le mode d’accès du membre." };
  const identity = validateVipIdentity(input, input.type);
  if (!identity.ok) return identity;
  let expiresAt: string | null = null;
  let paidOn: string | null = null;
  if (input.type === "abonnement") {
    expiresAt = vipPaymentExpiry(input.paidOn);
    if (!expiresAt || typeof input.paidOn !== "string" || input.paidOn > vipParisPaymentDate(now)) return { ok: false as const, error: "Renseignez la date réelle du dernier paiement, sans date future." };
    if (Date.parse(expiresAt) <= now) return { ok: false as const, error: "Ce paiement ne couvre plus l’accès aujourd’hui. Vérifiez le renouvellement avant de valider." };
    paidOn = input.paidOn;
  }
  return { ok: true as const, value: { ...identity.identity, type: input.type, paid_on: paidOn, expires_at: expiresAt } };
}
