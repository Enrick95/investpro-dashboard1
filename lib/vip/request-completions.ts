import { validateVipAccessRequest, type VipAccessRequestInput } from "./access-requests";
import type { VipAccessRequest } from "./types";

export const COMPLETION_LABELS = {
  firstName: ["Prénom", "First name"], lastName: ["Nom", "Last name"],
  telegramUsername: ["Pseudo Telegram", "Telegram username"],
  affiliationBroker: ["Broker de votre affiliation", "Referral broker"],
  paidOn: ["Date du dernier paiement", "Last payment date"],
  brokerAccountKind: ["Situation du compte broker", "Broker account status"],
  brokerAccountId: ["Numéro du compte broker", "Broker account number"],
  brokerEmail: ["E-mail chez le broker", "Broker account email"],
  declaredDepositUsd: ["Dépôt réel en dollars, hors bonus", "Actual deposit in US dollars, excluding bonus"],
  copyRequested: ["Souhait d’accès à InvestPro Copy", "Interest in InvestPro Copy"],
  reply: ["Précision pour l’équipe", "Additional information for the team"],
} as const;
export type CompletionField = keyof typeof COMPLETION_LABELS;
export const completionColumns = "revision,completion_fields,completion_note,completion_requested_at,completion_submitted_at,completion_reply";
export const requestRevision = (request: VipAccessRequest) => request.revision ?? 0;
export const needsVipCompletion = (request: VipAccessRequest) => request.status === "pending" && !!request.completion_fields?.length;
export function completionFieldLabel(field: string, locale = "fr") {
  return Object.hasOwn(COMPLETION_LABELS, field) ? COMPLETION_LABELS[field as CompletionField][locale === "en" ? 1 : 0] : "";
}
export function allowedCompletionFields(request: Pick<VipAccessRequest, "type" | "request_kind">): CompletionField[] {
  return ["firstName", "lastName", "telegramUsername", "reply", ...(request.type === "abonnement" ? ["paidOn" as const]
    : ["affiliationBroker" as const, ...(request.request_kind === "new" ? ["brokerAccountKind", "brokerAccountId", "brokerEmail", "declaredDepositUsd", "copyRequested"] as const : [])])];
}
function shortText(value: unknown, required = false): string | null {
  if (typeof value !== "string") return required ? null : "";
  const clean = value.trim();
  return clean.length <= 500 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean) && (!required || clean.length > 0) ? clean : null;
}
export function validateCompletionRequest(input: { fields?: unknown; note?: unknown }, request: VipAccessRequest) {
  const allowed = allowedCompletionFields(request);
  if (!Array.isArray(input.fields) || !input.fields.length || input.fields.length > allowed.length
    || input.fields.some(field => typeof field !== "string" || !allowed.includes(field as CompletionField))
    || new Set(input.fields).size !== input.fields.length) return { ok: false as const, error: "Choisissez les informations à compléter dans cette demande." };
  const note = shortText(input.note, true);
  if (note === null) return { ok: false as const, error: "Précisez ce qui manque en 500 caractères maximum." };
  return { ok: true as const, fields: input.fields as CompletionField[], note };
}
const valuesForRequest = (request: VipAccessRequest): VipAccessRequestInput => ({
  firstName: request.first_name, lastName: request.last_name, telegramUsername: request.telegram_username || "",
  type: request.type, requestKind: request.request_kind,
  affiliationBroker: request.affiliation_broker || "unknown", paidOn: request.paid_on,
  brokerAccountKind: request.broker_account_kind, brokerAccountId: request.broker_account_id,
  brokerEmail: request.broker_email || "", declaredDepositUsd: request.declared_deposit_usd, copyRequested: request.copy_requested,
});
const columnForField: Partial<Record<CompletionField, string>> = {
  firstName: "first_name", lastName: "last_name", telegramUsername: "telegram_username", affiliationBroker: "affiliation_broker", paidOn: "paid_on",
  brokerAccountKind: "broker_account_kind", brokerAccountId: "broker_account_id", brokerEmail: "broker_email", declaredDepositUsd: "declared_deposit_usd", copyRequested: "copy_requested",
};
export function validateCompletionSubmission(input: { values?: unknown; reply?: unknown }, request: VipAccessRequest, now = Date.now()) {
  if (!needsVipCompletion(request) || !input.values || typeof input.values !== "object" || Array.isArray(input.values)) return { ok: false as const, error: "Cette demande n’attend pas de complément." };
  const values = input.values as Record<string, unknown>;
  const fields = request.completion_fields || [];
  const editable = fields.filter(field => field !== "reply");
  if (Object.keys(values).some(key => !editable.includes(key)) || editable.some(key => !Object.hasOwn(values, key))) return { ok: false as const, error: "Complétez uniquement les informations demandées par l’équipe." };
  if (editable.some(key => key !== "copyRequested" && key !== "declaredDepositUsd" && (typeof values[key] !== "string" || !String(values[key]).trim()))
    || editable.includes("affiliationBroker") && values.affiliationBroker === "unknown") return { ok: false as const, error: "Renseignez chaque information demandée par l’équipe." };
  const reply = shortText(input.reply, fields.includes("reply"));
  if (reply === null) return { ok: false as const, error: "Ajoutez votre précision pour l’équipe (500 caractères maximum)." };
  // Identity, request kind and access origin always come from the stored row.
  const validation = validateVipAccessRequest({ ...valuesForRequest(request), ...values, type: request.type, requestKind: request.request_kind }, now);
  if (!validation.ok) return validation;
  const validated = validation.value as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of editable) {
    const column = columnForField[key as CompletionField];
    if (!column) return { ok: false as const, error: "Information demandée invalide." };
    patch[column] = validated[column] ?? null;
  }
  return { ok: true as const, patch, reply };
}
export const completionRevisionValid = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) < 2147483647;
