"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { vipRequest } from "@/lib/vip/client";
import { vipAffiliationBrokerLabel } from "@/lib/vip/identity";
import s from "./VipAdmin.module.css";
import r from "./RequestsRedesign.module.css";

export type VipMemberApplication = {
  id: string;
  revision: number;
  status: "submitted" | "approved" | "denied" | "claimed";
  first_name: string;
  last_name: string;
  email: string;
  telegram_username: string;
  phone_whatsapp: string;
  affiliation_broker: string;
  mt_platform: string;
  broker_account_id: string;
  mt_server: string;
  deposit_range: string;
  declared_deposit_usd: number;
  proof_path: string;
  created_at: string;
  broker_account_kind?: "new" | "existing";
  broker_email?: string | null;
  transfer_requested_on?: string | null;
  transfer_proof_path?: string | null;
  approval_email_sent_at: string | null;
  claim_expires_at: string | null;
  claimed_user_id: string | null;
};

type Form = { firstName: string; lastName: string; deposit: string; linked: boolean; reason: string };

const initials = (item: VipMemberApplication) => `${(item.first_name || "?").charAt(0)}${(item.last_name || "").charAt(0)}`.toUpperCase();
function depositLabel(value: string) { return value === "300-499" ? "300 $ à 499 $" : value === "500-999" ? "500 $ à 999 $" : "1 000 $ ou plus"; }
function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
}

// Fiche d'un dossier « nouveau membre » (formulaire /vip/nouveau-membre), affichée dans la liste Demandes VIP.
// Les appels API et les règles de validation sont ceux de l'ancienne rubrique, seule la présentation change.
export default function VipApplicationReview({ item, onChanged }: { item: VipMemberApplication; onChanged: () => Promise<void> }) {
  const transfer = item.broker_account_kind === "existing";
  const brokerLabel = vipAffiliationBrokerLabel(item.affiliation_broker) || item.affiliation_broker || "";
  const [form, setForm] = useState<Form>({ firstName: item.first_name, lastName: item.last_name, deposit: "", linked: false, reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proofs, setProofs] = useState<{ deposit?: string; transfer?: string }>({});
  useEffect(() => {
    let active = true;
    if (item.proof_path) void vipRequest<{ url: string }>(`/api/admin/vip/member-applications/${item.id}/preuve`).then(value => { if (active) setProofs(old => ({ ...old, deposit: value.url })); }).catch(() => {});
    if (item.transfer_proof_path) void vipRequest<{ url: string }>(`/api/admin/vip/member-applications/${item.id}/preuve?type=rattachement`).then(value => { if (active) setProofs(old => ({ ...old, transfer: value.url })); }).catch(() => {});
    return () => { active = false; };
  }, [item.id, item.proof_path, item.transfer_proof_path]);

  async function act(action: "approve" | "deny" | "resend", event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    if (action === "approve" && (!form.linked || Number(form.deposit) < 300)) { setError("Confirme le rattachement et saisis le dépôt réel vérifié (300 $ minimum)."); return; }
    if (action === "deny" && form.reason.trim().length < 5) { setError("Indique un motif de refus d’au moins 5 caractères."); return; }
    setBusy(true); setError("");
    try {
      const result = await vipRequest<{ ok: true; emailSent?: boolean }>("/api/admin/vip/member-applications", { method: "POST", body: JSON.stringify({
        action, id: item.id, expectedRevision: item.revision,
        firstName: form.firstName, lastName: form.lastName, affiliationBroker: item.affiliation_broker,
        brokerLinkedVerified: form.linked, verifiedDepositUsd: Number(form.deposit), reason: form.reason,
      }) });
      await onChanged();
      if (action === "approve" && !result.emailSent) setError("Demande validée, mais l’e-mail n’a pas pu partir. Utilise « Renvoyer le lien » sur le dossier.");
      if (action === "resend" && !result.emailSent) setError("Le lien n’a pas pu être envoyé. Vérifie la configuration e-mail.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de traiter le dossier."); }
    finally { setBusy(false); }
  }

  return <article className={`${s.member} ${r.sheet}`}>
    <header className={r.sheetHead}>
      <span className={r.bigAvatar} data-kind="aff" aria-hidden="true">{initials(item)}</span>
      <div className={r.sheetWho}><h3>{item.first_name} {item.last_name}</h3><p>Demande envoyée {dateLabel(item.created_at)} · nouveau membre ({transfer ? "rattachement" : "affiliation"})</p></div>
      <span className={r.typePill} data-kind="aff">{transfer ? "Rattachement · " : "Affiliation · "}{brokerLabel || "Broker à confirmer"}</span>
    </header>
    {error && <p className={s.error} role="alert">{error}</p>}
    <div className={r.contactRow}>
      {item.phone_whatsapp && <a className={r.btnWa} href={`https://wa.me/${item.phone_whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
      {item.telegram_username && <a className={r.btnTg} href={`https://t.me/${encodeURIComponent(item.telegram_username)}`} target="_blank" rel="noreferrer">Telegram</a>}
      {item.email && <a className={r.btnMail} href={`mailto:${item.email}`}>E-mail</a>}
    </div>
    <dl className={r.facts}>
      <div><dt>E-mail</dt><dd>{item.email || "—"}</dd></div>
      <div><dt>WhatsApp</dt><dd>{item.phone_whatsapp || "—"}</dd></div>
      <div><dt>Telegram</dt><dd>{item.telegram_username ? `@${item.telegram_username}` : "—"}</dd></div>
      <div data-tone={transfer ? "warn" : undefined}><dt>Broker</dt><dd>{brokerLabel || "—"}{transfer ? " · rattachement" : " · nouveau compte"}</dd></div>
      <div><dt>Compte MetaTrader</dt><dd>{item.mt_platform} · {item.broker_account_id}</dd></div>
      <div><dt>Serveur</dt><dd>{item.mt_server}</dd></div>
      <div><dt>Dépôt déclaré</dt><dd>{depositLabel(item.deposit_range)}</dd></div>
      {transfer && <div><dt>E-mail chez le broker</dt><dd>{item.broker_email || "—"}</dd></div>}
      {transfer && <div><dt>Rattachement demandé le</dt><dd>{item.transfer_requested_on ? dateLabel(item.transfer_requested_on) : "Non précisé"}</dd></div>}
    </dl>
    <div className={s.declaration}>
      <strong>Preuve du dépôt</strong>
      {proofs.deposit ? <a href={proofs.deposit} target="_blank" rel="noreferrer">Ouvrir la preuve de dépôt ↗</a> : <p className={s.fine}>{item.proof_path ? "Chargement de la preuve privée…" : "Aucune preuve jointe."}</p>}
    </div>
    {transfer && <div className={s.declaration}>
      <strong>Preuve du rattachement</strong>
      {proofs.transfer ? <a href={proofs.transfer} target="_blank" rel="noreferrer">Ouvrir la capture du rattachement ↗</a> : <p className={s.fine}>{item.transfer_proof_path ? "Chargement de la capture privée…" : "Aucune capture du rattachement jointe."}</p>}
    </div>}
    {item.status === "submitted" ? <form className={`${s.requestReview} ${r.reviewForm}`} onSubmit={event => void act("approve", event)}>
      <h4 className={r.formTitle}>Validation</h4>
      <div className={s.nameFields}>
        <label>Prénom vérifié<input value={form.firstName} maxLength={80} onChange={event => setForm({ ...form, firstName: event.target.value })} /></label>
        <label>Nom vérifié<input value={form.lastName} maxLength={80} onChange={event => setForm({ ...form, lastName: event.target.value })} /></label>
      </div>
      <label>Dépôt réel vérifié en USD, hors bonus<input type="number" min="300" step="0.01" value={form.deposit} onChange={event => setForm({ ...form, deposit: event.target.value })} placeholder="300.00" /></label>
      <label className={s.verifyCheck}><input type="checkbox" checked={form.linked} onChange={event => setForm({ ...form, linked: event.target.checked })} /><span>J’ai confirmé le rattachement de ce compte dans l’espace partenaire du broker.</span></label>
      <label>Motif de refus (si tu refuses)<input value={form.reason} maxLength={300} onChange={event => setForm({ ...form, reason: event.target.value })} placeholder="Ex. dépôt insuffisant, compte non affilié…" /></label>
      <div className={r.actions}><button type="button" className={r.deny} disabled={busy} onClick={() => void act("deny")}>Refuser</button><button className={r.approve} disabled={busy}><Check size={17} />{busy ? "Traitement…" : "Valider et envoyer le lien"}</button></div>
    </form> : <div className={s.declaration}>
      <strong>Suivi</strong>
      <p className={s.fine}>{item.claimed_user_id ? "Le compte a été créé et rattaché." : item.approval_email_sent_at ? `Lien envoyé le ${dateLabel(item.approval_email_sent_at)}` : item.status === "denied" ? "Dossier refusé." : "L’e-mail n’a pas été envoyé."}</p>
      {item.status === "approved" && !item.claimed_user_id && <button type="button" className={s.secondary} disabled={busy} onClick={() => void act("resend")}>{busy ? "Envoi…" : "Renvoyer le lien"}</button>}
    </div>}
  </article>;
}
