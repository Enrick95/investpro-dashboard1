export const ESSAI_VIP_BROKERS = ["Raise FX", "VT Markets", "PU Prime", "Axi", "Bullwaves"] as const;

export type EssaiVipSubmission = {
  broker: (typeof ESSAI_VIP_BROKERS)[number];
  nom: string;
  telegram: string;
  compte: string;
  serveur: string;
  motdepasse: string;
};

export const ESSAI_VIP_FIELD_LIMITS = {
  nom: 100,
  telegram: 64,
  compte: 64,
  serveur: 128,
  motdepasse: 256,
} as const;

type Validation =
  | { kind: "invalid" }
  | { kind: "honeypot" }
  | { kind: "valid"; value: EssaiVipSubmission };

// Keep each label on one line and disallow invisible direction overrides.
const UNSAFE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

export function validateEssaiVipPayload(input: unknown): Validation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { kind: "invalid" };
  const fields = input as Record<string, unknown>;
  if (fields.website !== undefined && typeof fields.website !== "string") return { kind: "invalid" };
  if (typeof fields.website === "string" && fields.website.length > 0) return { kind: "honeypot" };
  if (typeof fields.broker !== "string" || !ESSAI_VIP_BROKERS.some(broker => broker === fields.broker)) {
    return { kind: "invalid" };
  }
  for (const field of Object.keys(ESSAI_VIP_FIELD_LIMITS) as (keyof typeof ESSAI_VIP_FIELD_LIMITS)[]) {
    const value = fields[field];
    if (typeof value !== "string" || !value.trim() || value.length > ESSAI_VIP_FIELD_LIMITS[field] || UNSAFE_CONTROL.test(value)) {
      return { kind: "invalid" };
    }
  }
  return {
    kind: "valid",
    value: {
      broker: fields.broker as EssaiVipSubmission["broker"],
      nom: (fields.nom as string).trim(),
      telegram: (fields.telegram as string).trim(),
      compte: (fields.compte as string).trim(),
      serveur: (fields.serveur as string).trim(),
      // Passwords must reach the team exactly as entered, without trimming or truncation.
      motdepasse: fields.motdepasse as string,
    },
  };
}

export function escapeEssaiVipHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildEssaiVipMessage(submission: EssaiVipSubmission): string {
  const esc = escapeEssaiVipHtml;
  return (
    `🆕 <b>Essai VIP sans dépôt</b>\n` +
    `👤 ${esc(submission.nom)} · ${esc(submission.telegram)}\n` +
    `🏦 ${esc(submission.broker)}\n` +
    `💻 Démo n° <code>${esc(submission.compte)}</code>\n` +
    `🖥 Serveur : <code>${esc(submission.serveur)}</code>\n` +
    `🔑 MDP démo : <code>${esc(submission.motdepasse)}</code>\n\n` +
    `À faire : vérifier l'affiliation, ajouter le compte dans InvestPro Copy, répondre au client.`
  );
}
