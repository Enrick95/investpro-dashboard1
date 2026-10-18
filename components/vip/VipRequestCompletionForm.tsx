"use client";

import { useState, type FormEvent } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { vipRequest } from "@/lib/vip/client";
import { VIP_AFFILIATION_BROKERS } from "@/lib/vip/identity";
import { vipParisPaymentDate } from "@/lib/vip/access-requests";
import { completionFieldLabel, needsVipCompletion, requestRevision } from "@/lib/vip/request-completions";
import type { VipAccessRequest } from "@/lib/vip/types";
import s from "./VipRequestCompletionForm.module.css";

type Props = { request: VipAccessRequest; onSubmitted: () => Promise<void> };
export default function VipRequestCompletionForm({ request, onSubmitted }: Props) {
  const { locale } = useLocale();
  const tr = (fr: string, en: string) => locale === "en" ? en : fr;
  const [values, setValues] = useState<Record<string, string | boolean>>(() => ({
    firstName: request.first_name, lastName: request.last_name, telegramUsername: request.telegram_username || "",
    affiliationBroker: request.affiliation_broker || "", paidOn: request.paid_on || "",
    brokerAccountKind: request.broker_account_kind || "", brokerAccountId: request.broker_account_id || "",
    brokerEmail: request.broker_email || "", declaredDepositUsd: request.declared_deposit_usd === null ? "" : String(request.declared_deposit_usd),
    copyRequested: request.copy_requested,
  }));
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  if (!needsVipCompletion(request)) return null;
  const fields = request.completion_fields || [];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const changes = Object.fromEntries(fields.filter(field => field !== "reply").map(field => [field, field === "declaredDepositUsd" ? Number(values[field]) : values[field]]));
    try {
      await vipRequest("/api/vip/requests", { method: "PATCH", body: JSON.stringify({ id: request.id, expectedRevision: requestRevision(request), values: changes, reply }) });
      setSent(true);
      await onSubmitted();
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Votre complément n’a pas pu être envoyé.", "Your update could not be sent.")); }
    finally { setBusy(false); }
  }
  return <section className={s.panel} aria-label={tr("Dossier VIP à compléter", "VIP application update required")}>
    <span className={s.status}>{tr("À COMPLÉTER", "ACTION REQUIRED")}</span>
    <h3>{tr("Quelques informations pour poursuivre.", "A few details to continue.")}</h3>
    <p className={s.note}>{request.completion_note}</p>
    <p>{tr("L’équipe vous demande de vérifier les éléments ci-dessous. Votre accès restera en attente de validation.", "The team needs the details below. Your access remains subject to approval.")}</p>
    <form className={s.form} onSubmit={submit}>
      <fieldset disabled={busy || sent}>
        <legend>{tr("Informations demandées", "Requested information")}</legend>
        {fields.filter(field => field !== "reply").map(field => <label key={field}>
          <span>{completionFieldLabel(field, locale)}</span>
          {field === "affiliationBroker" ? <select required value={String(values[field])} onChange={event => setValues({ ...values, [field]: event.target.value })}><option value="" disabled>{tr("Choisir le broker", "Choose a broker")}</option>{VIP_AFFILIATION_BROKERS.map(broker => <option value={broker.value} key={broker.value}>{broker.label}</option>)}</select>
            : field === "brokerAccountKind" ? <select required value={String(values[field])} onChange={event => setValues({ ...values, [field]: event.target.value })}><option value="" disabled>{tr("Choisir votre situation", "Choose your account status")}</option><option value="new">{tr("Nouveau compte", "New account")}</option><option value="existing">{tr("Compte existant", "Existing account")}</option></select>
              : field === "copyRequested" ? <select value={values[field] ? "yes" : "no"} onChange={event => setValues({ ...values, [field]: event.target.value === "yes" })}><option value="no">{tr("Non", "No")}</option><option value="yes">{tr("Oui · dépôt réel minimum 500 USD", "Yes · minimum actual deposit USD 500")}</option></select>
                : <input required value={String(values[field] ?? "")} onChange={event => setValues({ ...values, [field]: event.target.value })}
                  type={field === "paidOn" ? "date" : field === "declaredDepositUsd" ? "number" : field === "brokerEmail" ? "email" : "text"}
                  min={field === "declaredDepositUsd" ? "300" : undefined} step={field === "declaredDepositUsd" ? "0.01" : undefined}
                  max={field === "paidOn" ? vipParisPaymentDate() : field === "declaredDepositUsd" ? "100000000" : undefined}
                  maxLength={field === "brokerEmail" ? 254 : field === "telegramUsername" ? 33 : 80}
                  autoComplete={field === "firstName" ? "given-name" : field === "lastName" ? "family-name" : "off"} />}
        </label>)}
        <label><span>{tr("Précision pour l’équipe", "Additional information for the team")}{!fields.includes("reply") && tr(" · facultatif", " · optional")}</span><textarea value={reply} onChange={event => setReply(event.target.value)} required={fields.includes("reply")} maxLength={500} rows={3} placeholder={tr("Votre réponse à la demande de l’équipe…", "Your reply to the team…")} /></label>
        <small>{tr("Ne transmettez aucun mot de passe ni donnée bancaire. Aucun document d’identité n’est demandé ici.", "Do not send passwords or bank details. No identity document is requested here.")}</small>
        <button type="submit">{busy ? tr("Envoi…", "Sending…") : sent ? tr("Compléments reçus", "Update received") : tr("Envoyer mes compléments", "Send my update")}</button>
      </fieldset>
      {error && <p className={s.error} role="alert">{error}</p>}
    </form>
  </section>;
}
