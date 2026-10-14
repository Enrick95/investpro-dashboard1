export const VIP_AFFILIATION_BROKERS = [
  { value: "raise_fx", label: "Raise FX" },
  { value: "vantage", label: "Vantage" },
  { value: "puprime", label: "PU Prime" },
  { value: "axi", label: "Axi" },
] as const;

export type VipAffiliationBroker = (typeof VIP_AFFILIATION_BROKERS)[number]["value"];

export type VipIdentity = {
  first_name: string;
  last_name: string;
  affiliation_broker: VipAffiliationBroker | null;
};

export function isVipAffiliationBroker(value: unknown): value is VipAffiliationBroker {
  return VIP_AFFILIATION_BROKERS.some((broker) => broker.value === value);
}

export function vipAffiliationBrokerLabel(value: unknown): string | null {
  return VIP_AFFILIATION_BROKERS.find((broker) => broker.value === value)?.label ?? null;
}

export function normalizeVipPersonName(value: unknown): string | null {
  // Reject hidden formatting and line breaks before trimming, including at the edges.
  if (typeof value !== "string" || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)) return null;
  const name = value.normalize("NFC").trim();
  const length = Array.from(name).length;
  return length >= 1 && length <= 80 ? name : null;
}

export function validateVipIdentity(
  input: { firstName?: unknown; lastName?: unknown; affiliationBroker?: unknown },
  type: "affiliation" | "abonnement",
): { ok: true; identity: VipIdentity } | { ok: false; error: string } {
  const firstName = normalizeVipPersonName(input.firstName);
  const lastName = normalizeVipPersonName(input.lastName);
  if (firstName === null || lastName === null) {
    return { ok: false, error: "Prénom et nom requis (1 à 80 caractères, sans caractères de contrôle)." };
  }
  if (type === "affiliation" && !isVipAffiliationBroker(input.affiliationBroker)) {
    return { ok: false, error: "Choisissez le broker de l’affiliation : Raise FX, Vantage, PU Prime ou Axi." };
  }
  return {
    ok: true,
    identity: {
      first_name: firstName,
      last_name: lastName,
      affiliation_broker: type === "affiliation" ? input.affiliationBroker as VipAffiliationBroker : null,
    },
  };
}
