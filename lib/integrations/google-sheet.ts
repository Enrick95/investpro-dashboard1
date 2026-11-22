import { vipAffiliationBrokerLabel } from "@/lib/vip/identity";

// Google Sheet d'Enrick : chaque inscription au VIP (affiliation, rattachement, abonnement) et chaque demande d'essai,
// lues par son script Google toutes les 5 minutes. On n'y met que ce qu'il suit : jamais de capture de dépôt,
// de mot de passe, de numéro de compte MetaTrader ni de serveur.

export const SHEET_APPLICATION_COLUMNS = "id,created_at,first_name,last_name,verified_first_name,verified_last_name,email,phone_whatsapp,telegram_username,affiliation_broker,verified_affiliation_broker,broker_account_kind,deposit_range,declared_deposit_usd,verified_deposit_usd,status,reviewed_at,claim_request_id";
export const SHEET_REQUEST_COLUMNS = "id,created_at,first_name,last_name,email,phone_whatsapp,telegram_username,type,verified_type,affiliation_broker,verified_affiliation_broker,broker_account_kind,deposit_range,declared_deposit_usd,verified_deposit_usd,status,reviewed_at,request_kind";
export const SHEET_TRIAL_COLUMNS = "id,submitted_at,prenom,nom_famille,nom,email,telephone,telegram,broker,status,channel_joined,last_contacted_at,next_follow_up_on";

type Row = Record<string, unknown>;

export type SheetSignup = {
  id: string; date_inscription: string | null; type: "Affiliation" | "Rattachement" | "Abonnement";
  prenom: string; nom: string; email: string; telephone: string; telegram: string; broker: string;
  depot_declare: string; depot_verifie: number | null; statut: string; date_validation: string | null;
};

export type SheetTrial = {
  id: string; date_demande: string | null; prenom: string; nom: string; email: string; telephone: string; telegram: string;
  broker: string; statut: string; canal_rejoint: string; dernier_contact: string | null; prochaine_relance: string | null;
};

const DEPOSIT_RANGES: Record<string, string> = { "300-499": "300 $ à 499 $", "500-999": "500 $ à 999 $", "1000-plus": "1 000 $ ou plus" };
const APPLICATION_STATUS: Record<string, string> = { submitted: "À vérifier", approved: "Validé", claimed: "Validé", denied: "Refusé" };
const REQUEST_STATUS: Record<string, string> = { pending: "À vérifier", approved: "Validé", denied: "Refusé" };
// Mêmes mots que l'admin « Essai VIP ».
const TRIAL_STATUS: Record<string, string> = { new: "Nouveau", contacted: "Contacté", qualified: "À vérifier", demo_active: "Démo branchée", completed: "Essai terminé", converted: "Converti en VIP", lost: "Clos" };

/** Texte sur une ligne, sans caractère de contrôle. */
function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim() : "";
}
function date(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return Number.isNaN(Date.parse(value)) ? null : new Date(value).toISOString();
}
function amount(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
function telegram(value: unknown): string {
  const handle = text(value).replace(/^@+/, "");
  return handle ? `@${handle}` : "";
}
function declaredDeposit(range: unknown, declared: unknown): string {
  const label = DEPOSIT_RANGES[text(range)];
  if (label) return label;
  const n = amount(declared);
  return n === null ? "" : `${n.toLocaleString("fr-FR")} $`;
}
function brokerLabel(verified: unknown, declared: unknown): string {
  return vipAffiliationBrokerLabel(verified) ?? vipAffiliationBrokerLabel(declared) ?? text(verified || declared);
}

/**
 * Les inscriptions VIP, de la plus ancienne à la plus récente.
 * Une demande « nouveau membre » validée puis activée crée aussi une demande d'accès (claim_request_id) : on ne la compte qu'une fois.
 */
export function sheetSignups(applications: Row[], requests: Row[]): SheetSignup[] {
  const claimed = new Set(applications.map(app => text(app.claim_request_id)).filter(Boolean));
  const fromApplications = applications.map((app): SheetSignup => {
    const status = text(app.status);
    const validated = status === "approved" || status === "claimed";
    return {
      id: text(app.id),
      date_inscription: date(app.created_at),
      type: app.broker_account_kind === "existing" ? "Rattachement" : "Affiliation",
      prenom: text(app.verified_first_name) || text(app.first_name),
      nom: text(app.verified_last_name) || text(app.last_name),
      email: text(app.email),
      telephone: text(app.phone_whatsapp),
      telegram: telegram(app.telegram_username),
      broker: brokerLabel(app.verified_affiliation_broker, app.affiliation_broker),
      depot_declare: declaredDeposit(app.deposit_range, app.declared_deposit_usd),
      depot_verifie: validated ? amount(app.verified_deposit_usd) : null,
      statut: APPLICATION_STATUS[status] ?? status,
      date_validation: validated ? date(app.reviewed_at) : null,
    };
  });
  const fromRequests = requests
    .filter(request => request.request_kind === "new" && !claimed.has(text(request.id)))
    .map((request): SheetSignup => {
      const status = text(request.status);
      const validated = status === "approved";
      const subscription = (text(request.verified_type) || text(request.type)) === "abonnement";
      return {
        id: text(request.id),
        date_inscription: date(request.created_at),
        type: subscription ? "Abonnement" : request.broker_account_kind === "existing" ? "Rattachement" : "Affiliation",
        prenom: text(request.first_name),
        nom: text(request.last_name),
        email: text(request.email),
        telephone: text(request.phone_whatsapp),
        telegram: telegram(request.telegram_username),
        broker: subscription ? "" : brokerLabel(request.verified_affiliation_broker, request.affiliation_broker),
        depot_declare: subscription ? "" : declaredDeposit(request.deposit_range, request.declared_deposit_usd),
        depot_verifie: !subscription && validated ? amount(request.verified_deposit_usd) : null,
        statut: REQUEST_STATUS[status] ?? status,
        date_validation: validated ? date(request.reviewed_at) : null,
      };
    });
  return [...fromApplications, ...fromRequests]
    .filter(row => row.id)
    .sort((a, b) => (a.date_inscription ?? "").localeCompare(b.date_inscription ?? ""));
}

/** Les demandes d'essai VIP, pour le suivi : statut de l'admin, canal rejoint, dernier contact et prochaine relance. */
export function sheetTrials(leads: Row[]): SheetTrial[] {
  return leads.map((lead): SheetTrial => {
    const legacy = text(lead.nom).split(" ");
    const status = text(lead.status);
    const followUp = text(lead.next_follow_up_on);
    return {
      id: text(lead.id),
      date_demande: date(lead.submitted_at),
      prenom: text(lead.prenom) || legacy[0] || "",
      nom: text(lead.nom_famille) || (text(lead.prenom) ? "" : legacy.slice(1).join(" ")),
      email: text(lead.email),
      telephone: text(lead.telephone),
      telegram: telegram(lead.telegram),
      broker: brokerLabel(lead.broker, lead.broker),
      statut: TRIAL_STATUS[status] ?? status,
      canal_rejoint: lead.channel_joined === true ? "Oui" : "Non",
      dernier_contact: date(lead.last_contacted_at),
      prochaine_relance: /^\d{4}-\d{2}-\d{2}$/.test(followUp) ? followUp : null,
    };
  }).filter(row => row.id).sort((a, b) => (a.date_demande ?? "").localeCompare(b.date_demande ?? ""));
}
