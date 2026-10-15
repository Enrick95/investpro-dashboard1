"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Check, Copy, RefreshCw } from "lucide-react";
import { vipDate, vipRequest } from "@/lib/vip/client";
import { VIP_AFFILIATION_BROKERS, vipAffiliationBrokerLabel } from "@/lib/vip/identity";
import { validateVipApproval, vipParisPaymentDate, vipPaymentExpiry } from "@/lib/vip/access-requests";
import type { VipAccessRequest } from "@/lib/vip/types";
import s from "./VipAdmin.module.css";

type Props = { requests: VipAccessRequest[] | null; error: string; onRefresh: () => Promise<void> };
type Review = { firstName: string; lastName: string; type: string; affiliationBroker: string; paidOn: string; confirmed: boolean };

function RequestReview({ request, onRefresh }: { request: VipAccessRequest; onRefresh: () => Promise<void> }) {
  const { t: tr, locale } = useLocale();
  const [form, setForm] = useState<Review>({ firstName: request.first_name, lastName: request.last_name, type: request.type, affiliationBroker: request.affiliation_broker || "", paidOn: request.paid_on || "", confirmed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function review(action: "approve" | "deny") {
    setError("");
    if (action === "approve") {
      if (!form.confirmed) { setError(tr("Confirmez avoir vérifié l’adhésion auprès du membre.")); return; }
      const validation = validateVipApproval(form);
      if (!validation.ok) { setError(validation.error); return; }
    }
    setBusy(true);
    try {
      await vipRequest("/api/admin/vip/requests", { method: "POST", body: JSON.stringify({ action, id: request.id, firstName: form.firstName, lastName: form.lastName, type: form.type, affiliationBroker: form.affiliationBroker, paidOn: form.paidOn }) });
      await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("La demande n’a pas pu être traitée.")); }
    finally { setBusy(false); }
  }
  function approve(event: FormEvent) { event.preventDefault(); void review("approve"); }
  return <article className={s.member}>
    <div className={s.memberHeading}><div><h3>{request.first_name} {request.last_name}</h3><span className={s.memberEmail}>{request.email}</span><small>{tr("Telegram : ")}{request.telegram_username ? `@${request.telegram_username}` : tr("Non renseigné")}</small><small>{tr("Déclaré : ")}{request.type === "abonnement" ? tr("Abonnement") : (tr("Affiliation · ") + (vipAffiliationBrokerLabel(request.affiliation_broker) || tr("Broker à confirmer")))}</small></div><span className={s.badge}>{tr("À vérifier")}</span></div>
    <p className={s.fine}>{tr("Demande du ")}{vipDate(request.created_at, locale)}{tr(". Ces informations sont déclarées par le membre.")}</p>
    {request.type === "abonnement" && <p className={s.fine}>{tr("Dernier paiement déclaré : ")}{vipDate(request.paid_on, locale)}{tr(". Vérifiez votre échange ou le règlement avant de confirmer.")}</p>}
    <form className={s.requestReview} onSubmit={approve}>
      <div className={s.nameFields}><label>{tr("Prénom vérifié")}<input value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} required maxLength={80} /></label><label>{tr("Nom vérifié")}<input value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} required maxLength={80} /></label></div>
      <label>{tr("Origine confirmée")}<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value, affiliationBroker: "", paidOn: "", confirmed: false })}><option value="affiliation">{tr("Affiliation")}</option><option value="abonnement">{tr("Abonnement")}</option></select></label>
      {form.type === "affiliation" ? <label>{tr("Broker confirmé")}<select value={form.affiliationBroker} onChange={event => setForm({ ...form, affiliationBroker: event.target.value, confirmed: false })} required><option value="" disabled>{tr("Confirmer le broker")}</option>{VIP_AFFILIATION_BROKERS.map(broker => <option value={broker.value} key={broker.value}>{broker.label}</option>)}</select></label> : <label>{tr("Date du dernier paiement · à vérifier")}<input type="date" value={form.paidOn} max={vipParisPaymentDate()} onChange={event => setForm({ ...form, paidOn: event.target.value, confirmed: false })} required /><small className={s.fine}>{tr("Date préremplie depuis la déclaration du membre, modifiable après vérification. Le renouvellement est dû le ")}{form.paidOn && vipPaymentExpiry(form.paidOn) ? vipDate(vipPaymentExpiry(form.paidOn), locale) : tr("même jour du mois suivant")}{tr(", à 00:00 (heure de Paris).")}</small></label>}
      <label className={s.verifyCheck}><input type="checkbox" checked={form.confirmed} onChange={event => setForm({ ...form, confirmed: event.target.checked })} required /><span>{tr("J’ai vérifié l’identité, l’adhésion et ")}{form.type === "abonnement" ? tr("la date du dernier paiement") : tr("le broker d’origine")}.</span></label>
      {error && <p className={s.error} role="alert">{tr(error)}</p>}
      <div className={s.identityActions}><button className={s.primary} disabled={busy}><Check size={16} />{busy ? "Traitement…" : tr("Valider l’accès vérifié")}</button><button type="button" className={s.secondary} disabled={busy} onClick={() => void review("deny")}>{tr("Ne pas valider")}</button></div>
    </form>
  </article>;
}

export default function VipAccessRequestsAdmin({ requests, error, onRefresh }: Props) {
  const { t: tr, locale } = useLocale();
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("all");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<VipAccessRequest[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const filtered = useMemo(() => (requests || []).filter(request => {
    const query = search.trim().toLocaleLowerCase("fr");
    const matches = `${request.first_name} ${request.last_name} ${request.email} ${request.telegram_username}`.toLocaleLowerCase("fr").includes(query);
    return matches && (origin === "all" || origin === "abonnement" && request.type === "abonnement" || origin === "unknown" && request.type === "affiliation" && !request.affiliation_broker || request.type === "affiliation" && request.affiliation_broker === origin);
  }), [requests, search, origin]);
  async function copyLink() {
    try { await navigator.clipboard.writeText(new URL("/vip/deja-membre", window.location.origin).toString()); setCopied(true); }
    catch { setCopied(false); }
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
    <p className={s.fine}>{tr("Partagez ce lien commun dans votre canal existant. Chaque membre crée son compte puis déclare son origine. Vous validez ici après vérification ; l’inscription seule n’accorde pas le VIP.")}</p>
    <div className={s.intakeLink}><a href="/vip/deja-membre" target="_blank" rel="noopener noreferrer">{tr("Ouvrir la page « Déjà membre Telegram » ↗")}</a><button type="button" className={s.secondary} onClick={copyLink}><Copy size={15} />{copied ? tr("Lien copié") : tr("Copier le lien à partager")}</button><span className={s.fine}>{tr("Adresse : /vip/deja-membre")}</span></div>
    {error ? <p className={s.error} role="alert">{tr(error)}</p> : <>
      <div className={s.listFilters}><label className={s.search}>{tr("Rechercher un membre")}<input value={search} onChange={event => setSearch(event.target.value)} placeholder={tr("Nom, e-mail, pseudo Telegram…")} /></label><label className={s.originFilter}>{tr("Origine déclarée")}<select value={origin} onChange={event => setOrigin(event.target.value)}><option value="all">{tr("Toutes les origines")}</option>{VIP_AFFILIATION_BROKERS.map(broker => <option value={broker.value} key={broker.value}>{broker.label}</option>)}<option value="unknown">{tr("Broker à confirmer")}</option><option value="abonnement">{tr("Abonnement")}</option></select></label></div>
      <div className={s.members}>{requests === null ? <p className={s.empty}>{tr("Chargement des demandes…")}</p> : filtered.length ? filtered.map(request => <RequestReview request={request} key={request.id} onRefresh={refreshed} />) : <p className={s.empty}>{requests.length ? tr("Aucune demande ne correspond aux filtres.") : tr("Aucune demande en attente. Les prochains membres apparaîtront ici après leur inscription sur la page dédiée.")}</p>}</div>
    </>}
    <details className={s.optional} onToggle={event => { if (event.currentTarget.open && history === null && !historyBusy) void loadHistory(); }}><summary>{tr("Rattachements validés")}</summary><p className={s.fine}>{tr("Les 100 derniers rattachements. Le paiement affiché est celui confirmé lors du rattachement ; les renouvellements ultérieurs restent gérés sur la fiche membre.")}</p>
      {historyBusy ? <p role="status" className={s.fine}>{tr("Chargement…")}</p> : historyError ? <p className={s.error} role="alert">{tr(historyError)}</p> : history && <div className={s.invitations}>{history.length ? history.map(item => <article className={s.invitationRow} key={item.id}><div><b>{item.first_name} {item.last_name}</b><span className={s.memberEmail}>{item.email}</span><small>{item.verified_type === "abonnement" ? (tr("Abonnement · Paiement confirmé au rattachement : ") + (vipDate(item.verified_paid_on, locale)) + tr(" · Renouvellement dû : ") + (vipDate(item.verified_expires_at, locale))) : (tr("Affiliation · ") + (vipAffiliationBrokerLabel(item.verified_affiliation_broker) || tr("Broker non renseigné")))}</small></div></article>) : <p className={s.empty}>{tr("Aucun rattachement validé.")}</p>}</div>}
      <button type="button" className={s.secondary} onClick={() => void loadHistory()} disabled={historyBusy}><RefreshCw size={16} />{tr("Actualiser l’historique")}</button>
    </details>
  </section>;
}
