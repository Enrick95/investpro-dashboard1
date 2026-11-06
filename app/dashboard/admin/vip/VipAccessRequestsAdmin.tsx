"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Check, Copy, RefreshCw } from "lucide-react";
import { vipDate, vipRequest } from "@/lib/vip/client";
import { VIP_AFFILIATION_BROKERS, vipAffiliationBrokerLabel } from "@/lib/vip/identity";
import { validateVipApproval, vipParisPaymentDate, vipPaymentExpiry } from "@/lib/vip/access-requests";
import type { VipAccessRequest } from "@/lib/vip/types";
import s from "./VipAdmin.module.css";
import r from "./RequestsRedesign.module.css";
import { allowedCompletionFields, completionFieldLabel, needsVipCompletion, requestRevision, type CompletionField } from "@/lib/vip/request-completions";

const initials = (request: VipAccessRequest) => `${(request.first_name || "?").charAt(0)}${(request.last_name || "").charAt(0)}`.toUpperCase();
function ago(value: string | null | undefined, locale: string) {
  if (!value) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return locale === "en" ? `${minutes} min ago` : `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return locale === "en" ? `${hours} h ago` : `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? (locale === "en" ? "yesterday" : "hier") : (locale === "en" ? `${days} days ago` : `il y a ${days} j`);
}
const kindOf = (request: VipAccessRequest) => request.type === "abonnement" ? "sub" : "aff";

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
  const [proofUrl, setProofUrl] = useState("");
  const [denialReason, setDenialReason] = useState("");
  useEffect(() => {
    if (!request.member_intake || !request.proof_path) return;
    let active = true;
    void vipRequest<{ url: string }>(`/api/admin/vip/requests/${request.id}/preuve`).then(value => { if (active) setProofUrl(value.url); }).catch(() => {});
    return () => { active = false; };
  }, [request.id, request.member_intake, request.proof_path]);
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
    if (action === "deny" && request.member_intake && denialReason.trim().length < 5) { setError(text("Indiquez un motif de refus (5 caractères minimum).", "Enter a reason for refusal (at least 5 characters).")); return; }
    setBusy(true);
    try {
      await vipRequest("/api/admin/vip/requests", { method: "POST", body: JSON.stringify({ action, id: request.id, expectedRevision: requestRevision(request), reason: denialReason.trim(), firstName: form.firstName, lastName: form.lastName, type: form.type, affiliationBroker: form.affiliationBroker, paidOn: form.paidOn, brokerLinkedVerified: form.brokerLinkedVerified, verifiedDepositUsd: form.verifiedDepositUsd.trim() ? Number(form.verifiedDepositUsd) : null, paymentVerified: form.paymentVerified }) });
      await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("La demande n’a pas pu être traitée.")); }
    finally { setBusy(false); }
  }
  function approve(event: FormEvent) { event.preventDefault(); void review("approve"); }
  return <article className={`${s.member} ${r.sheet}`}>
    <header className={r.sheetHead}>
      <span className={r.bigAvatar} data-kind={kindOf(request)} aria-hidden="true">{initials(request)}</span>
      <div className={r.sheetWho}><h3>{request.first_name} {request.last_name}</h3><p>{text("Demande envoyée ", "Sent ")}{vipDate(request.created_at, locale)} · {request.member_intake ? text("nouveau membre (affiliation)", "new member (referral)") : isNew ? text("nouvelle adhésion", "new application") : text("déjà membre Telegram", "existing Telegram member")}</p></div>
      <span className={r.typePill} data-kind={kindOf(request)}>{request.type === "abonnement" ? text("Abonnement 80 €/mois", "Subscription €80/month") : (tr("Affiliation · ") + (vipAffiliationBrokerLabel(request.affiliation_broker) || tr("Broker à confirmer")))}</span>
    </header>
    <div className={r.contactRow}>
      {request.phone_whatsapp && <a className={r.btnWa} href={`https://wa.me/${request.phone_whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
      {request.telegram_username && <a className={r.btnTg} href={`https://t.me/${encodeURIComponent(request.telegram_username)}`} target="_blank" rel="noreferrer">Telegram</a>}
      {request.email && <a className={r.btnMail} href={`mailto:${request.email}`}>{text("E-mail", "Email")}</a>}
      {request.type === "abonnement" && request.email && <a className={r.btnMail} href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(request.email)}`} target="_blank" rel="noreferrer">{text("Chercher dans Stripe ↗", "Search in Stripe ↗")}</a>}
    </div>
    <dl className={r.facts}>
      <div><dt>{text("E-mail", "Email")}</dt><dd>{request.email || "—"}</dd></div>
      <div><dt>WhatsApp</dt><dd>{request.phone_whatsapp || "—"}</dd></div>
      <div><dt>Telegram</dt><dd>{request.telegram_username ? `@${request.telegram_username}` : "—"}</dd></div>
      {request.type === "abonnement" ? <>
        <div><dt>{text("Payé le", "Paid on")}</dt><dd>{vipDate(request.paid_on, locale)}</dd></div>
        <div><dt>{text("Fin d’abonnement", "Renewal due")}</dt><dd>{request.paid_on && vipPaymentExpiry(request.paid_on) ? vipDate(vipPaymentExpiry(request.paid_on), locale) : "—"}</dd></div>
        <div data-tone="warn"><dt>Stripe</dt><dd>{text("À vérifier avant de valider", "Check before approving")}</dd></div>
      </> : <>
        <div data-tone={request.broker_account_kind === "existing" ? "warn" : undefined}><dt>{text("Broker", "Broker")}</dt><dd>{vipAffiliationBrokerLabel(request.affiliation_broker) || text("À confirmer", "To confirm")}{request.broker_account_kind === "existing" ? text(" · rattachement", " · transfer") : request.broker_account_kind === "new" ? text(" · nouveau compte", " · new account") : ""}</dd></div>
        <div><dt>{text("Compte", "Account")}</dt><dd>{request.broker_account_id ? `${request.mt_platform ? request.mt_platform + " · " : ""}${request.broker_account_id}` : "—"}</dd></div>
        <div><dt>{text("Dépôt déclaré", "Declared deposit")}</dt><dd>{request.declared_deposit_usd !== null && request.declared_deposit_usd !== undefined ? usd(request.declared_deposit_usd) : request.deposit_range ? (request.deposit_range === "300-499" ? "300 $ à 499 $" : request.deposit_range === "500-999" ? "500 $ à 999 $" : "1 000 $ ou plus") : "—"}</dd></div>
      </>}
    </dl>
    {request.completion_requested_at && <div className={s.completionStatus} data-waiting={needsCompletion}>
      <b>{needsCompletion ? text("À compléter · réponse du membre attendue", "Action required · waiting for the member") : text("Compléments reçus · à vérifier", "Update received · to review")}</b>
      <p>{request.completion_note}</p>
      {needsCompletion ? <ul>{request.completion_fields?.map(field => <li key={field}>{completionFieldLabel(field, locale)}</li>)}</ul> : <><small>{text("Réponse du ", "Reply received ")}{vipDate(request.completion_submitted_at, locale)}</small>{request.completion_reply && <p className={s.memberReply}>{request.completion_reply}</p>}</>}
    </div>}
    {request.member_intake && <div className={s.declaration}>
      <strong>{text("Dossier nouveau membre · données déclarées", "New member application · declared details")}</strong>
      <dl className={s.requestFacts}>
        <div><dt>{text("Téléphone WhatsApp", "WhatsApp phone")}</dt><dd>{request.phone_whatsapp ? <a href={`https://wa.me/${request.phone_whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{request.phone_whatsapp} ↗</a> : "—"}</dd></div>
        <div><dt>{text("Telegram", "Telegram")}</dt><dd>{request.telegram_username ? <a href={`https://t.me/${encodeURIComponent(request.telegram_username)}`} target="_blank" rel="noreferrer">@{request.telegram_username} ↗</a> : "—"}</dd></div>
        <div><dt>{text("Compte MetaTrader", "MetaTrader account")}</dt><dd>{request.mt_platform} · {request.broker_account_id}</dd></div>
        <div><dt>{text("Serveur", "Server")}</dt><dd>{request.mt_server}</dd></div>
        <div><dt>{text("Dépôt déclaré", "Declared deposit")}</dt><dd>{request.deposit_range === "300-499" ? "300 $ à 499 $" : request.deposit_range === "500-999" ? "500 $ à 999 $" : "1 000 $ ou plus"}</dd></div>
        <div><dt>{text("Lien d’Enrick", "Enrick referral link")}</dt><dd>{request.via_enrick_link ? text("Confirmé par le membre · à contrôler", "Member confirmed · verify") : "—"}</dd></div>
        <div><dt>{text("Compte ajouté dans Mes comptes", "Account added to My Accounts")}</dt><dd>{request.trading_account_id ? `#${request.trading_account_id}` : "—"}</dd></div>
      </dl>
      {proofUrl ? request.proof_path?.toLowerCase().endsWith(".pdf") ? <a href={proofUrl} target="_blank" rel="noreferrer">{text("Ouvrir la preuve du dépôt ↗", "Open deposit proof ↗")}</a> : <a href={proofUrl} target="_blank" rel="noreferrer"><img src={proofUrl} alt={text("Capture privée du dépôt", "Private deposit screenshot")} style={{ display: "block", maxWidth: 320, maxHeight: 240, objectFit: "contain", borderRadius: 12, marginTop: 12 }} />{text("Agrandir la preuve ↗", "Open full size ↗")}</a> : <p className={s.fine}>{text("Chargement de la preuve privée…", "Loading private proof…")}</p>}
      <p className={s.fine}>{text("Reçue le ", "Received ")}{vipDate(request.created_at, locale)}. {text("Les champs et la capture sont privés à l’équipe.", "Details and proof are private to the team.")}</p>
      <p className={s.fine}>{text("Le compte est enregistré sans mot de passe. La synchronisation MetaTrader reste à activer par le membre.", "The account is registered without a password. The member must separately enable MetaTrader sync.")}</p>
    </div>}
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
    {!needsCompletion && <form className={`${s.requestReview} ${r.reviewForm}`} onSubmit={approve}>
      <h4 className={r.formTitle}>{text("Validation", "Approval")}</h4>
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
      {request.member_intake && <label>{text("Motif de refus (si tu refuses)", "Reason for refusal (if declining)")}<input value={denialReason} onChange={event => setDenialReason(event.target.value)} maxLength={300} placeholder={text("Ex. dépôt insuffisant, compte non affilié…", "e.g. insufficient deposit, account not referred…")} /></label>}
      <div className={r.actions}><button type="button" className={r.deny} disabled={busy} onClick={() => void review("deny")}>{tr("Refuser")}</button><button className={r.approve} disabled={busy}><Check size={17} />{busy ? tr("Traitement…") : text("Valider et envoyer le lien", "Approve and send the link")}</button></div>
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
    return matches && matchesKind && matchesCompletion && (origin === "all" || origin === "transfer" && request.type === "affiliation" && request.broker_account_kind === "existing" || origin === "affiliation-any" && request.type === "affiliation" || origin === "abonnement" && request.type === "abonnement" || origin === "unknown" && request.type === "affiliation" && !request.affiliation_broker || request.type === "affiliation" && request.affiliation_broker === origin);
  }), [requests, search, origin, kind, completionState]);
  const [selectedId, setSelectedId] = useState("");
  const selected = filtered.find(request => request.id === selectedId) || filtered[0] || null;
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
    <div className={r.top}>
      <div><span className={r.kicker}>{text("Mon VIP", "My VIP")}</span><h2 className={r.title}>{text("Demandes VIP", "VIP requests")}{requests && <b>{requests.length}</b>}</h2></div>
      <button type="button" className={r.ghost} onClick={() => void onRefresh()}><RefreshCw size={16} />{tr("Actualiser")}</button>
    </div>
    {requests && <div className={r.kpis}>
      <article><span>{text("À vérifier", "To review")}</span><strong>{requests.filter(item => !needsVipCompletion(item)).length}</strong></article>
      <article data-kind="sub"><span>{text("Abonnements", "Subscriptions")}</span><strong>{requests.filter(item => item.type === "abonnement").length}</strong></article>
      <article data-kind="aff"><span>{text("Affiliations", "Referrals")}</span><strong>{requests.filter(item => item.type === "affiliation").length}</strong></article>
      <article data-kind="warn"><span>{text("Infos manquantes", "Missing info")}</span><strong>{requests.filter(item => needsVipCompletion(item)).length}</strong></article>
    </div>}
    <details className={s.shareLinks}><summary>{text("Liens à partager", "Links to share")}</summary><div className={s.intakeLinks}>
      <div className={s.intakeLink}><a href="/vip/rejoindre" target="_blank" rel="noopener noreferrer">{text("Nouvelles adhésions · abonnement ou affiliation ↗", "New members · subscription or referral ↗")}</a><button type="button" className={s.secondary} onClick={() => void copyLink("/vip/rejoindre")}><Copy size={15} />{copied === "/vip/rejoindre" ? tr("Lien copié") : tr("Copier le lien à partager")}</button><span className={s.fine}>/vip/rejoindre</span></div>
      <div className={s.intakeLink}><a href="/vip/deja-membre" target="_blank" rel="noopener noreferrer">{tr("Ouvrir la page « Déjà membre Telegram » ↗")}</a><button type="button" className={s.secondary} onClick={() => void copyLink("/vip/deja-membre")}><Copy size={15} />{copied === "/vip/deja-membre" ? tr("Lien copié") : tr("Copier le lien à partager")}</button><span className={s.fine}>/vip/deja-membre</span></div>
    </div></details>
    {copyError && <p className={s.error} role="status">{copyError}</p>}
    {error ? <p className={s.error} role="alert">{tr(error)}</p> : <>
      <div className={r.filterBar}>
        <label className={r.search}><span className={r.srOnly}>{tr("Rechercher un membre")}</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={tr("Nom, e-mail, pseudo Telegram…")} /></label>
        <div className={r.chips} role="group" aria-label={text("Type de demande", "Request type")}>
          {([["all", text("Toutes", "All")], ["abonnement", text("Abonnement", "Subscription")], ["affiliation-any", text("Affiliation", "Referral")], ["transfer", text("Rattachement", "Account transfer")]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={origin === value} onClick={() => setOrigin(value)}>{label}</button>)}
        </div>
      </div>
      <details className={r.more}><summary>{text("Plus de filtres", "More filters")}</summary><div className={s.listFilters}><label className={s.originFilter}>{text("Parcours", "Application type")}<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">{text("Tous les parcours", "All applications")}</option><option value="new">{text("Nouvelles adhésions", "New members")}</option><option value="existing">{text("Déjà membres", "Existing members")}</option></select></label><label className={s.originFilter}>{tr("Origine déclarée")}<select value={origin} onChange={event => setOrigin(event.target.value)}><option value="all">{tr("Toutes les origines")}</option><option value="affiliation-any">{text("Toutes les affiliations", "All referrals")}</option>{VIP_AFFILIATION_BROKERS.map(broker => <option value={broker.value} key={broker.value}>{broker.label}</option>)}<option value="unknown">{tr("Broker à confirmer")}</option><option value="abonnement">{tr("Abonnement")}</option></select></label>
      <label className={s.completionFilter}>{text("État du dossier", "Application status")}<select value={completionState} onChange={event => setCompletionState(event.target.value)}><option value="all">{text("Tous les dossiers", "All applications")}</option><option value="needed">{text("À compléter", "Awaiting member update")}</option><option value="submitted">{text("Compléments reçus", "Update received")}</option></select></label></div></details>
      {requests === null ? <p className={s.empty}>{tr("Chargement des demandes…")}</p> : filtered.length ? <div className={`${s.reviewSplit} ${r.split}`}>
        <ul className={`${s.reviewList} ${r.list}`} aria-label={text("Demandes à vérifier", "Applications to review")}>{filtered.map(request => {
          const waiting = needsVipCompletion(request);
          const state = waiting ? "waiting" : request.completion_submitted_at ? "updated" : "new";
          return <li key={request.id}><button type="button" aria-pressed={selected?.id === request.id} onClick={() => setSelectedId(request.id)}>
            <span className={`${s.reviewAvatar} ${r.avatar}`} data-kind={kindOf(request)} aria-hidden="true">{initials(request)}</span>
            <span className={s.reviewWho}><b>{request.first_name} {request.last_name}</b><small>{request.type === "abonnement" ? tr("Abonnement") : ((request.broker_account_kind === "existing" ? text("Rattachement · ", "Transfer · ") : tr("Affiliation · ")) + (vipAffiliationBrokerLabel(request.affiliation_broker) || "?"))} · {ago(request.created_at, locale)}</small></span>
            <span className={s.reviewState} data-state={state}>{state === "waiting" ? text("À compléter", "Waiting") : state === "updated" ? text("Complété", "Updated") : text("À vérifier", "To review")}</span>
          </button></li>;
        })}</ul>
        <div className={`${s.reviewSheet} ${r.sheetWrap}`}>{selected && <RequestReview request={selected} key={`${selected.id}:${requestRevision(selected)}`} onRefresh={refreshed} />}</div>
      </div> : <p className={s.empty}>{requests.length ? tr("Aucune demande ne correspond aux filtres.") : tr("Aucune demande en attente. Les prochains membres apparaîtront ici après leur inscription sur la page dédiée.")}</p>}
    </>}
    <details className={s.optional} onToggle={event => { if (event.currentTarget.open && history === null && !historyBusy) void loadHistory(); }}><summary>{text("Adhésions et rattachements validés", "Approved applications and transfers")}</summary><p className={s.fine}>{text("Les 100 derniers dossiers validés. Le paiement et le dépôt affichés correspondent à votre vérification lors de la validation ; les renouvellements ultérieurs restent gérés sur la fiche membre.", "The last 100 approved applications. Payment and deposit details reflect your checks at approval; later renewals are managed on the member’s profile.")}</p>
      {historyBusy ? <p role="status" className={s.fine}>{tr("Chargement…")}</p> : historyError ? <p className={s.error} role="alert">{tr(historyError)}</p> : history && <div className={s.invitations}>{history.length ? history.map(item => <article className={s.invitationRow} key={item.id}><div><b>{item.first_name} {item.last_name}</b><span className={s.memberEmail}>{item.email}</span><small>{item.request_kind === "new" ? text("Nouvelle adhésion", "New member") : text("Déjà membre", "Existing member")}</small><small>{item.verified_type === "abonnement" ? (tr("Abonnement · Paiement confirmé au rattachement : ") + (vipDate(item.verified_paid_on, locale)) + tr(" · Renouvellement dû : ") + (vipDate(item.verified_expires_at, locale))) : (tr("Affiliation · ") + (vipAffiliationBrokerLabel(item.verified_affiliation_broker) || tr("Broker non renseigné")))}</small>{item.request_kind === "new" && item.verified_type === "affiliation" && <small>{text("Dépôt vérifié : ", "Verified deposit: ")}{item.verified_deposit_usd === null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(item.verified_deposit_usd)}{item.copy_requested && text(" · Copy demandé, configuration séparée", " · Copy requested, separate setup")}</small>}</div></article>) : <p className={s.empty}>{tr("Aucun rattachement validé.")}</p>}</div>}
      <button type="button" className={s.secondary} onClick={() => void loadHistory()} disabled={historyBusy}><RefreshCw size={16} />{tr("Actualiser l’historique")}</button>
    </details>
  </section>;
}
