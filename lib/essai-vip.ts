export const ESSAI_VIP_BROKERS = ["Raise FX", "VT Markets", "PU Prime", "Axi", "Bullwaves"] as const;

export type EssaiVipSubmission = {
  broker: (typeof ESSAI_VIP_BROKERS)[number];
  nom: string;
  contactMethod: "whatsapp" | "telegram";
  telephone: string;
  telegram: string;
  compte: string;
  serveur: string;
  motdepasse: string;
  /** Formulaire complet (depuis nov. 2026) : prénom, nom, e-mail, WhatsApp et Telegram tous fournis. */
  prenom?: string;
  nomFamille?: string;
  email?: string;
};

export const ESSAI_VIP_FIELD_LIMITS = {
  nom: 100,
  telegram: 64,
  telephone: 24,
  compte: 64,
  serveur: 128,
  motdepasse: 256,
  prenom: 60,
  nomFamille: 60,
  email: 254,
} as const;

type Validation =
  | { kind: "invalid" }
  | { kind: "invalid-contact" }
  | { kind: "honeypot" }
  | { kind: "valid"; value: EssaiVipSubmission };

// Keep each label on one line and disallow invisible direction overrides.
const UNSAFE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

export function validateEssaiVipPayload(input: unknown): Validation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { kind: "invalid" };
  const fields = input as Record<string, unknown>;
  if (fields.website !== undefined && typeof fields.website !== "string") return { kind: "invalid" };
  if (typeof fields.website === "string" && fields.website.length > 0) return { kind: "honeypot" };
  if (fields.confirmeDemo !== true) return { kind: "invalid" };
  if (typeof fields.broker !== "string" || !ESSAI_VIP_BROKERS.some(broker => broker === fields.broker)) {
    return { kind: "invalid" };
  }
  if (fields.prenom !== undefined) return validateFullForm(fields);
  const contactMethod = fields.contactMethod;
  if (contactMethod !== "whatsapp" && contactMethod !== "telegram") return { kind: "invalid-contact" };

  let telephone = "";
  let telegram = "";
  if (contactMethod === "whatsapp") {
    const rawPhone = fields.telephone;
    if (typeof rawPhone !== "string" || rawPhone.length > ESSAI_VIP_FIELD_LIMITS.telephone || UNSAFE_CONTROL.test(rawPhone)) return { kind: "invalid-contact" };
    const phone = rawPhone.trim().replace(/[()\s.-]/g, "").replace(/^00/, "+");
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return { kind: "invalid-contact" };
    telephone = phone;
  } else {
    const rawTelegram = fields.telegram;
    if (typeof rawTelegram !== "string" || rawTelegram.length > ESSAI_VIP_FIELD_LIMITS.telegram || UNSAFE_CONTROL.test(rawTelegram)) return { kind: "invalid-contact" };
    const username = rawTelegram
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^(www\.)?(t|telegram)\.me\//i, "")
      .replace(/^@+/, "")
      .replace(/\/+$/, "");
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) return { kind: "invalid-contact" };
    telegram = `@${username}`;
  }

  for (const field of ["nom", "compte", "serveur", "motdepasse"] as const) {
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
      contactMethod,
      telephone,
      telegram,
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
  const liveServer = /live|real|r[ée]el/i.test(submission.serveur) && !/d[ée]mo/i.test(submission.serveur);
  const contact = submission.email
    ? `📧 ${esc(submission.email)}\n📲 WhatsApp : <a href="https://wa.me/${esc(submission.telephone.replace(/\D/g, ""))}">${esc(submission.telephone)}</a>\n✈️ Telegram : <a href="https://t.me/${esc(submission.telegram.slice(1))}">${esc(submission.telegram)}</a>\n`
    : submission.contactMethod === "whatsapp"
    ? `📲 WhatsApp : <a href="https://wa.me/${esc(submission.telephone.replace(/\D/g, ""))}">${esc(submission.telephone)}</a>\n`
    : `✈️ Telegram : <a href="https://t.me/${esc(submission.telegram.slice(1))}">${esc(submission.telegram)}</a>\n`;
  return (
    `🆕 <b>Essai VIP sans dépôt</b>\n` +
    `👤 ${esc(submission.nom)}\n` +
    contact +
    `🏦 ${esc(submission.broker)}\n` +
    `💻 Démo n° <code>${esc(submission.compte)}</code>\n` +
    `🖥 Serveur : <code>${esc(submission.serveur)}</code>\n` +
    `🔑 MDP démo : <code>${esc(submission.motdepasse)}</code>\n` +
    (liveServer ? `⚠️ Serveur « Live » : vérifier que c'est bien un compte DÉMO (solde fictif).\n` : "") +
    `\n` +
    `À faire : vérifier l'affiliation, ajouter le compte dans InvestPro Copy, répondre au client.`
  );
}

function normalizeTelegram(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > ESSAI_VIP_FIELD_LIMITS.telegram || UNSAFE_CONTROL.test(raw)) return "";
  const username = raw.trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?(t|telegram)\.me\//i, "").replace(/^@+/, "").replace(/\/+$/, "");
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? `@${username}` : "";
}
function normalizePhone(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > ESSAI_VIP_FIELD_LIMITS.telephone || UNSAFE_CONTROL.test(raw)) return "";
  const phone = raw.trim().replace(/[()\s.-]/g, "").replace(/^00/, "+");
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : "";
}

/** Formulaire complet : prénom, nom, e-mail, WhatsApp et Telegram obligatoires. */
function validateFullForm(fields: Record<string, unknown>): Validation {
  for (const field of ["prenom", "nomFamille", "compte", "serveur", "motdepasse"] as const) {
    const value = fields[field];
    if (typeof value !== "string" || !value.trim() || value.length > ESSAI_VIP_FIELD_LIMITS[field] || UNSAFE_CONTROL.test(value)) return { kind: "invalid" };
  }
  const email = typeof fields.email === "string" ? fields.email.trim().toLowerCase() : "";
  if (!email || email.length > ESSAI_VIP_FIELD_LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { kind: "invalid-contact" };
  const telephone = normalizePhone(fields.telephone);
  const telegram = normalizeTelegram(fields.telegram);
  if (!telephone || !telegram) return { kind: "invalid-contact" };
  const prenom = (fields.prenom as string).trim(), nomFamille = (fields.nomFamille as string).trim();
  return {
    kind: "valid",
    value: {
      broker: fields.broker as EssaiVipSubmission["broker"],
      nom: `${prenom} ${nomFamille}`.slice(0, ESSAI_VIP_FIELD_LIMITS.nom),
      prenom, nomFamille, email,
      contactMethod: "whatsapp",
      telephone, telegram,
      compte: (fields.compte as string).trim(),
      serveur: (fields.serveur as string).trim(),
      motdepasse: fields.motdepasse as string,
    },
  };
}
