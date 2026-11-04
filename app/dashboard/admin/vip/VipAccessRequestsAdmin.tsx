"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Check, Copy, RefreshCw } from "lucide-react";
import { vipDate, vipRequest } from "@/lib/vip/client";
import { VIP_AFFILIATION_BROKERS, vipAffiliationBrokerLabel } from "@/lib/vip/identity";
import { validateVipApproval, vipParisPaymentDate, vipPaymentExpiry } from "@/lib/vip/access-requests";
import type { VipAccessRequest } from "@/lib/vip/types";
import s from "./VipAdmin.module.css";
import { allowedCompletionFields, completionFieldLabel, needsVipCompletion, requestRevision, type CompletionField } from "@/lib/vip/request-completions";

type Props = { requests: VipAccessRequest[] | null; error: string; onRefresh: () => Promise<void> };
type Review = { firstName: string; lastName: string; type: string; affiliationBroker: string; paidOn: string; confirmed: boolean; brokerLinkedVerified: boolean; verifiedDepositUsd: string; depositVerified: boolean; paymentVerified: boolean };

function RequestReview({ request, onRefresh }: { request: VipAccessRequest; onRefresh: () => Promise<void> }) {
  const { t: tr, locale } = useLocale();
  const isNew = request.request_kind === "new";
  const text = (fr: string, en: string) => locale === "en" ? en : fr;
  const usd = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
  const [form, setForm] = useState<Review>({ firstName: request.first_name, lastName: request.last_name, type: request.type, affiliationBroker: request.affiliation_broker || "", paidOn: request.paid_on || "", confirmed: false, brokerLinkedVerified: false, verifiedDepositUsd: "", depositVerified: false, paymentVerified: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completionFields, setCompletionFields] = useState<CompletionField[]>([]);
  const [completionNote, setCompletionNote] = useState("");
  const needsCompletion = needsVipCompletion(request);
  async function requestCompletion(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!completionFields.length || !completionNote.trim()) { setError(text("Choisissez les informations manquantes et précisez votre demande.", "Choose the missing information and explain your request.")); return; }
    setBusy(true); setError("");
    try {
      await vipRequest("/api/admin/vip/requests", { method: "POST", body: JSON.stringify({ action: "request_completion", id: request.id, expectedRevision: requestRevision(request), fields: completionFields, note: completionNote }) });
      await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : text("La demande de complément n’a pas pu être envoyée.", "The request could not be sent.")); }
    finally { setBusy(false); }
  }
  async function review(action: "approve" | "deny") {
    if (busy) return;
    setError("");
    if (action === "approve") {
      if (!form.confirmed) { setError(tr("Confirmez avoir vérifié l’adhésion auprès du membre.")); return; }
      const validation = validateVipApproval(form);
      if (!validation.ok) { setError(validation.error); return; }
      if (isNew && form.type === "affiliation") {
        if (!form.brokerLinkedVerified) { setError(text("Confirmez le rattachement dans votre espace partenaire ou auprès du broker.", "Confirm the referral link in your partner portal or with the broker.")); return; }
        const deposit = Number(form.verifiedDepositUsd);
        if (!form.depositVerified || !form.verifiedDepositUsd.trim() || !Number.isFinite(deposit) || deposit < 300) { setError(text("Vérifiez le dépôt réel, hors bonus, puis renseignez au moins 300 $ USD.", "Verify the actual deposit, excluding bonuses, and enter at least US$300.")); return; }
      }
      if (isNew && form.type === "abonnement" && !form.paymentVerified) { setError(text("Vérifiez le règlement dans Stripe avant de confirmer le paiement.", "Check the payment in Stripe before confirming it.")); return; }
    }
    setBusy(true);
    try {
      await vipRequest("/api/admin/vip/requests", { method: "POST", body: JSON.stringify({ action, id: request.id, expectedRevision: requestRevision(request), firstName: form.firstName, lastName: form.lastName, type: form.type, affiliationBroker: form.affiliationBroker, paidOn: form.paidOn, brokerLinkedVerified: form.brokerLinkedVerified, verifiedDepositUsd: form.verifiedDepositUsd.trim() ? Number(form.verifiedDepositUsd) : null, paymentVerified: form.paymentVerified }) });
      await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("La demande n’a pas pu être traitée.")); }
    finally { setBusy(false); }
  }
  function approve(event: FormEvent) { event.preventDefault(); void review("approve"); }
  return <article className={s.member}>
    <div className={s.memberHeading}><div><h3>{request.first_name} {request.last_name}</h3><span className={s.memberEmail}>{request.email}</span><small>{tr("Telegram : ")}{request.telegram_username ? `@${request.telegram_username}` : tr("Non renseigné")}</small><small>{tr("Déclaré : ")}{request.type === "abonnement" ? tr("Abonnement") : (tr("Affiliation · ") + (vipAffiliationBrokerLabel(request.affiliation_broker) || tr("Broker à confirmer")))}</small></div><span className={s.badge} data-kind={isNew ? "new" : "existing"}>{isNew ? text("Nouvelle adhésion · à vérifier", "New application · to review") : text("Déjà membre · à vérifier", "Existing member · to review")}</span></div>
    <p className={s.fine}>{tr("Demande du ")}{vipDate(request.created_at, locale)}{tr(". Ces informations sont déclarées par le membre.")}</p>
    {request.completion_requested_at && <div className={s.completionStatus} data-waiting={needsCompletion}>
      <b>{needsCompletion ? text("À compléter · réponse du membre attendue", "Action required · waiting for the member") : text("Compléments reçus · à vérifier", "Update received · to review")}</b>
      <p>{request.completion_note}</p>
      {needsCompletion ? <ul>{request.completion_fields?.map(field => <li key={field}>{completionFieldLabel(field, locale)}</li>)}</ul> : <><small>{text("Réponse du ", "Reply received ")}{vipDate(request.completion_submitted_at, locale)}</small>{request.completion_reply && <p className={s.memberReply}>{request.completion_reply}</p>}</>}
    </div>}
    {request.type === "abonnement" && <p className={s.fine}>{tr("Dernier paiement déclaré : ")}{vipDate(request.paid_on, locale)}{tr(". Vérifiez votre échange ou le règlement avant de confirmer.")}</p>}
    {isNew && request.type === "affiliation" && <div className={s.declaration}>
      <strong>{text("Déclaration du client · non confirmée", "Client declaration · unverified")}</strong>
      <dl className={s.requestFacts}>
        <div><dt>{text("Situation du compte", "Account status")}</dt><dd>{request.broker_account_kind === "existing" ? text("Compte existant · rattachement", "Existing account · referral transfer") : text("Nouveau compte", "New account")}</dd></div>
        <div><dt>{text("Référence du compte broker", "Broker account reference")}</dt><dd>{request.broker_account_id || text("Non renseignée", "Not provided")}</dd></div>
        <div><dt>{text("E-mail chez le broker", "Broker email")}</dt><dd>{request.broker_email || request.email}</dd></div>
        <div><dt>{text("Dépôt déclaré · hors bonus", "Declared deposit · excluding bonuses")}</dt><dd>{request.declared_deposit_usd === null ? text("Non renseigné", "Not provided") : usd(request.declared_deposit_usd)}</dd></div>
        <div><dt>InvestPro Copy</dt><dd>{request.copy_requested ? text("Demandé · vérification séparée", "Requested · separate verification") : text("Non demandé", "Not requested")}</dd></div>
      </dl>
      <p>{text("La déclaration ne prouve ni le dépôt ni le rattachement. Contrôlez-les dans votre espace partenaire ou directement auprès du broker.", "The declaration does not confirm the deposit or the referral link. Check both in your partner portal or directly with the broker.")}</p>
    </div>}
    {isNew && request.type === "abonnement" && <p className={s.renewal}>{text("Paiement déclaré par le client. Aucun paiement Stripe n’est confirmé automatiquement sur cette page. Vérifiez le règlement de 80 € avant de valider l’accès.", "Payment declared by the client. This page does not automatically confirm Stripe payments. Check the €80 payment before approving access.")}</p>}
    <details className={s.completionRequest}><summary>{needsCompletion ? text("Modifier la demande de complément", "Update the information request") : text("Dossier incomplet ? Demander un complément", "Missing information? Request an update")}</summary>
      <form onSubmit={requestCompletion}>
        <fieldset disabled={busy}><legend>{text("Informations à vérifier par le membre", "Information the member needs to check")}</legend>
          <div className={s.completionChoices}>{allowedCompletionFields(request).map(field => <label key={field}><input type="checkbox" checked={completionFields.includes(field)} onChange={event => setCompletionFields(current => event.target.checked ? [...current, field] : current.filter(value => value !== field))} /><span>{completionFieldLabel(field, locale)}</span></label>)}</div>
          <label>{text("Votre message au membre", "Your message to the member")}<textarea value={completionNote} onChange={event => setCompletionNote(event.target.value)} required maxLength={500} rows={3} placeholder={text("Précisez exactement ce qui manque pour vérifier le dossier…", "Explain exactly what is missing to review this application…")} /></label>
          <p className={s.fine}>{text("Le membre recevra la liste et pourra compléter sa demande depuis son compte. L’accès reste en attente de vérification.", "The member will receive the checklist and can update the application from their account. Access remains subject to review.")}</p>
          <button className={s.secondary} type="submit" disabled={busy}>{busy ? tr("Traitement…") : text("Demander les compléments", "Request the missing information")}</button>
        </fieldset>
      </form>
    </details>
    {needsCompletion && <button className={s.secondary} type="button" disabled={busy} onClick={() => void review("deny")}>{tr("Ne pas valider")}</button>}
    {error && <p className={s.error} role="alert">{tr(error)}</p>}
    {!needsCompletion && <form className={s.requestReview} onSubmit={approve}>
      <div className={s.nameFields}><label>{tr("Prénom vérifié")}<input value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value, confirmed: false })} required maxLength={80} /></label><label>{tr("Nom vérifié")}<input value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value, confirmed: false })} required maxLength={80} /></label></div>
      <label>{tr("Origine confirmée")}<select value={form.type} disabled={isNew} onChange={event => setForm({ ...form, type: event.target.value, affiliationBroker: "", paidOn: "", confirmed: false, brokerLinkedVerified: false, depositVerified: false, paymentVerified: false })}><option value="affiliation">{tr("Affiliation")}</option><option value="abonnement">{tr("Abonnement")}</option></select></label>
      {form.type === "affiliation" ? <label>{tr("Broker confirmé")}<select value={form.affiliationBroker} onChange={event => setForm({ ...form, affiliationBroker: event.target.value, confirmed: false, brokerLinkedVerified: false, depositVerified: false })} required><option value="" disabled>{tr("Confirmer le broker")}</option>{VIP_AFFILIATION_BROKERS.map(broker => <option value={broker.value} key={broker.value}>{broker.label}</option>)}</select></label> : <label>{tr("Date du dernier paiement · à vérifier")}<input type="date" value={form.paidOn} max={vipParisPaymentDate()} onChange={event => setForm({ ...form, paidOn: event.target.value, confirmed: false, paymentVerified: false })} required /><small className={s.fine}>{tr("Date préremplie depuis la déclaration du membre, modifiable après vérification. Le renouvellement est dû le ")}{form.paidOn && vipPaymentExpiry(form.paidOn) ? vipDate(vipPaymentExpiry(form.paidOn), locale) : tr("même jour du mois suivant")}{tr(", à 00:00 (heure de Paris).")}</small></label>}
      {isNew && form.type === "affiliation" && <fieldset className={s.verification}>
        <legend>{text("Vos vérifications auprès du broker", "Your broker checks")}</legend>
        <label className={s.verifyCheck}><input type="checkbox" checked={form.brokerLinkedVerified} onChange={event => setForm({ ...form, brokerLinkedVerified: event.target.checked })} required /><span>{text("J’ai confirmé que ce compte est rattaché à InvestPro.", "I confirmed that this account is linked to InvestPro.")}</span></label>
        <label>{text("Dépôt réel vérifié en dollars · hors bonus", "Verified actual deposit in US dollars · excluding bonuses")}<input type="number" inputMode="decimal" min="300" step="0.01" value={form.verifiedDepositUsd} onChange={event => setForm({ ...form, verifiedDepositUsd: event.target.value, depositVerified: false })} required placeholder="300.00" /><small className={s.fine}>{text("Minimum VIP : 300 $ USD. Le montant déclaré n’est pas repris automatiquement comme preuve.", "VIP minimum: US$300. The declared amount is not automatically treated as proof.")}</small></label>
        <label className={s.verifyCheck}><input type="checkbox" checked={form.depositVerified} onChange={event => setForm({ ...form, depositVerified: event.target.checked })} required /><span>{text("J’ai vérifié ce dépôt réel auprès du broker.", "I verified this actual deposit with the broker.")}</span></label>
        {request.copy_requested && <p className={s.fine}>{text("Copy demandé : 500 $ USD minimum et vérification dédiée. La validation VIP ne configure ni n’active automatiquement le copy trading.", "Copy requested: US$500 minimum and a dedicated review. VIP approval does not configure or automatically enable copy trading.")}</p>}
      </fieldset>}
      {isNew && form.type === "abonnement" && <label className={s.verifyCheck}><input type="checkbox" checked={form.paymentVerified} onChange={event => setForm({ ...form, paymentVerified: event.target.checked })} required /><span>{text("J’ai retrouvé et vérifié dans Stripe le paiement de ce membre, avec le même e-mail et la date indiquée.", "I found and verified this member’s payment in Stripe, matching the email and date shown.")}</span></label>}
      <label className={s.verifyCheck}><input type="checkbox" checked={form.confirmed} onChange={event => setForm({ ...form, confirmed: event.target.checked })} required /><span>{tr("J’ai vérifié l’identité, l’adhésion et ")}{form.type === "abonnement" ? tr("la date du dernier paiement") : tr("le broker d’origine")}.</span></label>
      <div className={s.identityActions}><button className={s.primary} disabled={busy}><Check size={16} />{busy ? tr("Traitement…") : tr("Valider l’accès vérifié")}</button><button type="button" className={s.secondary} disabled={busy} onClick={() => void review("deny")}>{tr("Ne pas valider")}</button></div>
    </form>}
  </article>;
}

export default function VipAccessRequestsAdmin({ requests, error, onRefresh }: Props) {
  const { t: tr, locale } = useLocale();
  const text = (fr: string, en: string) => locale === "en" ? en : fr;
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("all");
  const [kind, setKind] = useState("all");
  const [completionState, setCompletionState] = useState("all");
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const [history, setHistory] = useState<VipAccessRequest[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const filtered = useMemo(() => (requests || []).filter(request => {
    const query = search.trim().toLocaleLowerCase("fr");
    const matches = `${request.first_name} ${request.last_name} ${request.email} ${request.telegram_username} ${request.broker_account_id || ""} ${request.broker_email || ""}`.toLocaleLowerCase("fr").includes(query);
    const matchesKind = kind === "all" || (request.request_kind || "existing") === kind;
    const matchesCompletion = completionState === "all" || completionState === "needed" && needsVipCompletion(request) || completionState === "submitted" && !!request.completion_submitted_at && !needsVipCompletion(request);
    return matches && matchesKind && matchesCompletion && (origin === "all" || origin === "abonnement" && request.type === "abonnement" || origin === "unknown" && request.type === "affiliation" && !request.affiliation_broker || request.type === "affiliation" && request.affiliation_broker === origin);
  }), [requests, search, origin, kind, completionState]);
  async function copyLink(path: string) {
    setCopyError("");
    try { await navigator.clipboard.writeText(new URL(path, window.location.origin).toString()); setCopied(path); }
    catch { setCopied(""); setCopyError(text("La copie est indisponible. Ouvrez le lien ci-dessus puis copiez son adresse.", "Copying is unavailable. Open the link above and copy its address.")); }
  }
  async function loadHistory() {
    setHistoryBusy(true); setHistoryError("");
    try { const result = await vipRequest<{ history: VipAccessRequest[] }>("/api/admin/vip/requests?history=1"); setHistory(result.history); }
    catch (cause) { setHistoryError(cause instanceof Error ? cause.message : tr("Historique indisponible.")); }
    finally { setHistoryBusy(false); }
  }
  async function refreshed() { await onRefresh(); if (history !== null) await loadHistory(); }
  return <section className={s.card}>
    <div className={s.listHeading}><h2>{tr("Membres à vérifier ")}{requests && <span>({requests.length})</span>}</h2><button type="button" className={s.secondary} onClick={() => void onRefresh()}><RefreshCw size={16} />{tr("Actualiser")}</button></div>
    <p className={s.fine}>{text("Les nouvelles adhésions et les membres déjà présents sur Telegram arrivent ici. L’inscription seule n’accorde pas le VIP : vérifiez chaque dossier avant de valider l’accès.", "New applications and existing Telegram members appear here. Signing up does not grant VIP access: review each application before approving access.")}</p>
    <div className={s.intakeLinks}>
      <div className={s.intakeLink}><a href="/vip/rejoindre" target="_blank" rel="noopener noreferrer">{text("Nouvelles adhésions · abonnement ou affiliation ↗", "New members · subscription or referral ↗")}</a><button type="button" className={s.secondary} onClick={() => void copyLink("/vip/rejoindre")}><Copy size={15} />{copied === "/vip/rejoindre" ? tr("Lien copié") : tr("Copier le lien à partager")}</button><span className={s.fine}>/vip/rejoindre</span></div>
      <div className={s.intakeLink}><a href="/vip/deja-membre" target="_blank" rel="noopener noreferrer">{tr("Ouvrir la page « Déjà membre Telegram » ↗")}</a><button type="button" className={s.secondary} onClick={() => void copyLink("/vip/deja-membre")}><Copy size={15} />{copied === "/vip/deja-membre" ? tr("Lien copié") : tr("Copier le lien à partager")}</button><span className={s.fine}>/vip/deja-membre</span></div>
    </div>
    {copyError && <p className={s.error} role="status">{copyError}</p>}
    {error ? <p className={s.error} role="alert">{tr(error)}</p> : <>
      <div className={s.listFilters}><label className={s.search}>{tr("Rechercher un membre")}<input value={search} onChange={event => setSearch(event.target.value)} placeholder={tr("Nom, e-mail, pseudo Telegram…")} /></label><label className={s.originFilter}>{text("Parcours", "Application type")}<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">{text("Tous les parcours", "All applications")}</option><option value="new">{text("Nouvelles adhésions", "New members")}</option><option value="existing">{text("Déjà membres", "Existing members")}</option></select></label><label className={s.originFilter}>{tr("Origine déclarée")}<select value={origin} onChange={event => setOrigin(event.target.value)}><option value="all">{tr("Toutes les origines")}</option>{VIP_AFFILIATION_BROKERS.map(broker => <option value={broker.value} key={broker.value}>{broker.label}</option>)}<option value="unknown">{tr("Broker à confirmer")}</option><option value="abonnement">{tr("Abonnement")}</option></select></label></div>
      <label className={s.completionFilter}>{text("État du dossier", "Application status")}<select value={completionState} onChange={event => setCompletionState(event.target.value)}><option value="all">{text("Tous les dossiers", "All applications")}</option><option value="needed">{text("À compléter", "Awaiting member update")}</option><option value="submitted">{text("Compléments reçus", "Update received")}</option></select></label>
      <div className={s.members}>{requests === null ? <p className={s.empty}>{tr("Chargement des demandes…")}</p> : filtered.length ? filtered.map(request => <RequestReview request={request} key={`${request.id}:${requestRevision(request)}`} onRefresh={refreshed} />) : <p className={s.empty}>{requests.length ? tr("Aucune demande ne correspond aux filtres.") : tr("Aucune demande en attente. Les prochains membres apparaîtront ici après leur inscription sur la page dédiée.")}</p>}</div>
    </>}
    <details className={s.optional} onToggle={event => { if (event.currentTarget.open && history === null && !historyBusy) void loadHistory(); }}><summary>{text("Adhésions et rattachements validés", "Approved applications and transfers")}</summary><p className={s.fine}>{text("Les 100 derniers dossiers validés. Le paiement et le dépôt affichés correspondent à votre vérification lors de la validation ; les renouvellements ultérieurs restent gérés sur la fiche membre.", "The last 100 approved applications. Payment and deposit details reflect your checks at approval; later renewals are managed on the member’s profile.")}</p>
      {historyBusy ? <p role="status" className={s.fine}>{tr("Chargement…")}</p> : historyError ? <p className={s.error} role="alert">{tr(historyError)}</p> : history && <div className={s.invitations}>{history.length ? history.map(item => <article className={s.invitationRow} key={item.id}><div><b>{item.first_name} {item.last_name}</b><span className={s.memberEmail}>{item.email}</span><small>{item.request_kind === "new" ? text("Nouvelle adhésion", "New member") : text("Déjà membre", "Existing member")}</small><small>{item.verified_type === "abonnement" ? (tr("Abonnement · Paiement confirmé au rattachement : ") + (vipDate(item.verified_paid_on, locale)) + tr(" · Renouvellement dû : ") + (vipDate(item.verified_expires_at, locale))) : (tr("Affiliation · ") + (vipAffiliationBrokerLabel(item.verified_affiliation_broker) || tr("Broker non renseigné")))}</small>{item.request_kind === "new" && item.verified_type === "affiliation" && <small>{text("Dépôt vérifié : ", "Verified deposit: ")}{item.verified_deposit_usd === null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(item.verified_deposit_usd)}{item.copy_requested && text(" · Copy demandé, configuration séparée", " · Copy requested, separate setup")}</small>}</div></article>) : <p className={s.empty}>{tr("Aucun rattachement validé.")}</p>}</div>}
      <button type="button" className={s.secondary} onClick={() => void loadHistory()} disabled={historyBusy}><RefreshCw size={16} />{tr("Actualiser l’historique")}</button>
    </details>
  </section>;
}
