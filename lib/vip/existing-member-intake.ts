import { VIP_AFFILIATION_BROKERS, normalizeVipPersonName, type VipAffiliationBroker } from "@/lib/vip/identity";

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
/** « Abonnement ou autre broker » on the page: no broker, the team confirms the origin when validating. */
export const EXISTING_MEMBER_NO_BROKER = "abonnement";

export type ExistingMemberIdentity = { firstName: string; lastName: string; email: string; phone: string | null; telegram: string | null; broker: VipAffiliationBroker | null };
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
  // The broker the member joined through. A page opened before this field existed sends none: the origin stays to confirm.
  const declared = str(body.broker);
  const broker = VIP_AFFILIATION_BROKERS.find(item => item.value === declared)?.value ?? null;
  if (declared && !broker && declared !== EXISTING_MEMBER_NO_BROKER) return { ok: false, field: "broker", error: "Choisis ton broker, ou « Abonnement ou autre broker »." };
  return { ok: true, value: { firstName, lastName, email, phone, telegram: telegram ? telegram.toLowerCase() : null, broker } };
}
