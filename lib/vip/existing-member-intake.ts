import { isVipAffiliationBroker, normalizeVipPersonName, type VipAffiliationBroker } from "@/lib/vip/identity";

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
/** « Abonnement » on the page, with the date of the last payment that the team checks in Stripe. */
export const EXISTING_MEMBER_SUBSCRIPTION = "abonnement";
/** « Autre broker » on the page: no broker on the list, the team confirms the origin when validating. */
export const EXISTING_MEMBER_OTHER_BROKER = "autre";

export type ExistingMemberIdentity = {
  firstName: string; lastName: string; email: string; phone: string | null; telegram: string | null;
  type: "affiliation" | "abonnement"; broker: VipAffiliationBroker | null; paidOn: string | null;
};

/** Today in Europe/Paris, the calendar the subscription payments are dated in. */
function parisToday(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

/** A real calendar date written YYYY-MM-DD: not 2026-02-30, not 2026-13-01. */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export type ExistingMemberIdentityResult = { ok: true; value: ExistingMemberIdentity } | { ok: false; error: string; field: string };

/** Téléphone et Telegram restent facultatifs ; s'ils sont donnés, ils doivent être exploitables. */
export function parseExistingMemberIdentity(body: Record<string, unknown>): ExistingMemberIdentityResult {
  const firstName = normalizeVipPersonName(body.firstName);
  if (!firstName) return { ok: false, field: "firstName", error: "Indique ton prénom." };
  const lastName = normalizeVipPersonName(body.lastName);
  if (!lastName) return { ok: false, field: "lastName", error: "Indique ton nom." };
  const email = str(body.email).toLowerCase();
  if (!email || email.length > 254 || !EMAIL.test(email)) return { ok: false, field: "email", error: "Vérifie ton adresse e-mail." };
  let phone: string | null = str(body.phone).replace(/[\s().-]/g, "") || null;
  if (phone?.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) return { ok: false, field: "phone", error: "Numéro WhatsApp : ajoute l’indicatif du pays, par exemple +33 6 12 34 56 78. Tu peux aussi laisser ce champ vide." };
  const telegram = str(body.telegram).replace(/^https?:\/\//i, "").replace(/^(www\.)?(t|telegram)\.me\//i, "").replace(/^@+/, "") || null;
  if (telegram && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram)) return { ok: false, field: "telegram", error: "Pseudo Telegram : 5 à 32 caractères, par exemple @monpseudo. Tu peux aussi laisser ce champ vide." };
  // How the member joined: a broker of the list, a subscription with its payment date, or another broker. A page opened
  // before these fields existed sends no broker or no date: the origin then stays to confirm, as before.
  const declared = str(body.broker);
  let type: ExistingMemberIdentity["type"] = "affiliation";
  let broker: VipAffiliationBroker | null = null;
  let paidOn: string | null = null;
  if (declared === EXISTING_MEMBER_SUBSCRIPTION) {
    const paid = str(body.paidOn);
    if (paid) {
      if (!isCalendarDate(paid) || paid > parisToday() || paid < "2020-01-01") return { ok: false, field: "paidOn", error: "Indique la date de ton dernier paiement, sans date future." };
      type = "abonnement";
      paidOn = paid;
    }
  } else if (declared && declared !== EXISTING_MEMBER_OTHER_BROKER) {
    // The current brokers, plus Vantage: members who joined through it are still in the VIP.
    if (!isVipAffiliationBroker(declared)) return { ok: false, field: "broker", error: "Choisis ton broker, ton abonnement ou « Autre broker »." };
    broker = declared;
  }
  return { ok: true, value: { firstName, lastName, email, phone, telegram: telegram ? telegram.toLowerCase() : null, type, broker, paidOn } };
}
