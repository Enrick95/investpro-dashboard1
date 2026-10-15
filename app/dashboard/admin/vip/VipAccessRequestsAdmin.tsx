"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { vipDate, vipRequest } from "@/lib/vip/client";
import { VIP_AFFILIATION_BROKERS, vipAffiliationBrokerLabel } from "@/lib/vip/identity";
import { validateVipApproval } from "@/lib/vip/access-requests";
import type { VipAccessRequest } from "@/lib/vip/types";
import s from "./VipAdmin.module.css";

type Props = { requests: VipAccessRequest[] | null; error: string; onRefresh: () => Promise<void> };
type Review = { firstName: string; lastName: string; type: string; affiliationBroker: string; expiresAt: string; confirmed: boolean };

function RequestReview({ request, onRefresh }: { request: VipAccessRequest; onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState<Review>({ firstName: request.first_name, lastName: request.last_name, type: request.type, affiliationBroker: request.affiliation_broker || "", expiresAt: "", confirmed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function review(action: "approve" | "deny") {
    setError("");
    let expiresAt: string | null = null;
    if (action === "approve") {
      if (!form.confirmed) { setError("Confirmez avoir vérifié l’adhésion auprès du membre."); return; }
      const date = form.expiresAt ? new Date(form.expiresAt) : null;
      expiresAt = date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
      const validation = validateVipApproval({ ...form, expiresAt });
      if (!validation.ok) { setError(validation.error); return; }
    }
    setBusy(true);
    try {
      await vipRequest("/api/admin/vip/requests", { method: "POST", body: JSON.stringify({ action, id: request.id, firstName: form.firstName, lastName: form.lastName, type: form.type, affiliationBroker: form.affiliationBroker, expiresAt }) });
      await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "La demande n’a pas pu être traitée."); }
    finally { setBusy(false); }
  }
  function approve(event: FormEvent) { event.preventDefault(); void review("approve"); }
  return <article className={s.member}>
    <div className={s.memberHeading}><div><h3>{request.first_name} {request.last_name}</h3><span className={s.memberEmail}>{request.email}</span><small>Telegram : {request.telegram_username ? `@${request.telegram_username}` : "Non renseigné"}</small><small>Déclaré : {request.type === "abonnement" ? "Abonnement" : `Affiliation · ${vipAffiliationBrokerLabel(request.affiliation_broker) || "Broker à confirmer"}`}</small></div><span className={s.badge}>À vérifier</span></div>
    <p className={s.fine}>Demande du {vipDate(request.created_at)}. Ces informations sont déclarées par le membre.</p>
    <form className={s.requestReview} onSubmit={approve}>
      <div className={s.nameFields}><label>Prénom vérifié<input value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} required maxLength={80} /></label><label>Nom vérifié<input value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} required maxLength={80} /></label></div>
      <label>Origine confirmée<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value, affiliationBroker: "", expiresAt: "", confirmed: false })}><option value="affiliation">Affiliation</option><option value="abonnement">Abonnement</option></select></label>
      {form.type === "affiliation" ? <label>Broker confirmé<select value={form.affiliationBroker} onChange={event => setForm({ ...form, affiliationBroker: event.target.value, confirmed: false })} required><option value="" disabled>Confirmer le broker</option>{VIP_AFFILIATION_BROKERS.map(broker => <option value={broker.value} key={broker.value}>{broker.label}</option>)}</select></label> : <label>Fin d’accès réellement payée · date et heure<input type="datetime-local" value={form.expiresAt} onChange={event => setForm({ ...form, expiresAt: event.target.value, confirmed: false })} required /><small className={s.fine}>Heure locale de votre appareil. Reprenez l’échéance actuelle : aucun nouveau mois n’est offert lors du rattachement.</small></label>}
      <label className={s.verifyCheck}><input type="checkbox" checked={form.confirmed} onChange={event => setForm({ ...form, confirmed: event.target.checked })} required /><span>J’ai vérifié l’identité, l’adhésion et {form.type === "abonnement" ? "l’échéance payée" : "le broker d’origine"}.</span></label>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.identityActions}><button className={s.primary} disabled={busy}><Check size={16} />{busy ? "Traitement…" : "Valider l’accès vérifié"}</button><button type="button" className={s.secondary} disabled={busy} onClick={() => void review("deny")}>Ne pas valider</button></div>
    </form>
  </article>;
}

export default function VipAccessRequestsAdmin({ requests, error, onRefresh }: Props) {
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("all");
  const [copied, setCopied] = useState(false);
  const filtered = useMemo(() => (requests || []).filter(request => {
    const query = search.trim().toLocaleLowerCase("fr");
    const matches = `${request.first_name} ${request.last_name} ${request.email} ${request.telegram_username}`.toLocaleLowerCase("fr").includes(query);
    return matches && (origin === "all" || origin === "abonnement" && request.type === "abonnement" || origin === "unknown" && request.type === "affiliation" && !request.affiliation_broker || request.type === "affiliation" && request.affiliation_broker === origin);
  }), [requests, search, origin]);
  async function copyLink() {
    try { await navigator.clipboard.writeText(new URL("/vip/deja-membre", window.location.origin).toString()); setCopied(true); }
    catch { setCopied(false); }
  }
  return <section className={s.card}>
    <div className={s.listHeading}><h2>Membres à vérifier {requests && <span>({requests.length})</span>}</h2><button type="button" className={s.secondary} onClick={() => void onRefresh()}><RefreshCw size={16} />Actualiser</button></div>
    <p className={s.fine}>Partagez ce lien commun dans votre canal existant. Chaque membre crée son compte puis déclare son origine. Vous validez ici après vérification ; l’inscription seule n’accorde pas le VIP.</p>
    <div className={s.intakeLink}><a href="/vip/deja-membre" target="_blank" rel="noopener noreferrer">Ouvrir la page « Déjà membre Telegram » ↗</a><button type="button" className={s.secondary} onClick={copyLink}><Copy size={15} />{copied ? "Lien copié" : "Copier le lien à partager"}</button><span className={s.fine}>Adresse : /vip/deja-membre</span></div>
    {error ? <p className={s.error} role="alert">{error}</p> : <>
      <div className={s.listFilters}><label className={s.search}>Rechercher un membre<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nom, e-mail, pseudo Telegram…" /></label><label className={s.originFilter}>Origine déclarée<select value={origin} onChange={event => setOrigin(event.target.value)}><option value="all">Toutes les origines</option>{VIP_AFFILIATION_BROKERS.map(broker => <option value={broker.value} key={broker.value}>{broker.label}</option>)}<option value="unknown">Broker à confirmer</option><option value="abonnement">Abonnement</option></select></label></div>
      <div className={s.members}>{requests === null ? <p className={s.empty}>Chargement des demandes…</p> : filtered.length ? filtered.map(request => <RequestReview request={request} key={request.id} onRefresh={onRefresh} />) : <p className={s.empty}>{requests.length ? "Aucune demande ne correspond aux filtres." : "Aucune demande en attente. Les prochains membres apparaîtront ici après leur inscription sur la page dédiée."}</p>}</div>
    </>}
  </section>;
}
