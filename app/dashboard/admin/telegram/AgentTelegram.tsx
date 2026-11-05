"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Check, CheckCircle2, Copy, ExternalLink, Laptop, Loader2, MailCheck, RefreshCw, ScanSearch, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import s from "./TelegramAdmin.module.css";

/**
 * Agent Telegram : l’interface est ici, mais les données restent sur l’ordinateur d’Enrick.
 * Le navigateur lit directement le service Python local (127.0.0.1) ; rien ne passe par le serveur du site.
 * Aucun envoi automatique : chaque relance est copiée, envoyée à la main dans Telegram, puis notée ici.
 */
const AGENT = "http://127.0.0.1:8765";

type Category = "chaud" | "tiede" | "froid" | "vip" | "invite" | "stop";
type Contact = {
  peer_id: number; display_name: string; username: string | null; last_message_at: string; last_message_outgoing: boolean;
  last_followup_at: string | null; invited_at: string | null; vip_checked_manually_at: string | null;
  status: string; status_label: string; category: Category; reason: string; exclusion: string | null;
};
type Overview = {
  total: number; categories: Record<Category, number>; replies: number; to_review: number; pending_tasks: number;
  last_scan_at: string | null; vip_membership_state: string; vip_membership_groups: string[]; vip_membership_issues: string[];
  scan_running: boolean; scan_error: string | null; scan_processed: number; status_labels: Record<string, string>; contacts: Contact[];
};
type Detail = { contact: Contact; events: { at: string; action: string; detail: string | null }[]; draft: string | null };

const CATEGORIES: { key: Category | "all"; label: string }[] = [
  { key: "all", label: "Tous" }, { key: "chaud", label: "Chauds" }, { key: "tiede", label: "Tièdes" }, { key: "froid", label: "Froids" },
  { key: "vip", label: "Déjà membre VIP" }, { key: "invite", label: "Déjà invité" }, { key: "stop", label: "Ne plus contacter" },
];
const CATEGORY_LABEL: Record<Category, string> = { chaud: "Chaud", tiede: "Tiède", froid: "Froid", vip: "Déjà membre VIP", invite: "Déjà invité", stop: "Ne plus contacter" };
const EDITABLE_STATUSES = ["a_verifier", "vip_interesse", "appel_demande", "infos_broker_demandees", "reponse_attendue", "relance_envoyee"];

async function agent<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(AGENT + path, body === undefined ? { cache: "no-store" } : { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string; message?: string }).error || (data as { message?: string }).message || "L’agent n’a pas pu traiter la demande.");
  return data as T;
}
function when(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(date);
}

export default function AgentTelegram() {
  const [state, setState] = useState<"checking" | "offline" | "online">("checking");
  const [data, setData] = useState<Overview | null>(null);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try { const overview = await agent<Overview>("/api/agent/overview"); setData(overview); setState("online"); }
    catch { setState("offline"); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!data?.scan_running) return;
    const timer = setInterval(() => void load(), 2500);
    return () => clearInterval(timer);
  }, [data?.scan_running, load]);

  const contacts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return (data?.contacts || []).filter(contact => (filter === "all" || contact.category === filter) && (!query || `${contact.display_name} ${contact.username || ""}`.toLocaleLowerCase("fr").includes(query)));
  }, [data, filter, search]);
  const selected = contacts.find(contact => contact.peer_id === selectedId) || contacts[0] || null;

  const loadDetail = useCallback(async (peerId: number) => {
    try { const value = await agent<Detail>(`/api/agent/contacts/${peerId}`); setDetail(value); setDraft(value.draft || ""); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Fiche indisponible."); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selected) void loadDetail(selected.peer_id); else setDetail(null); }, [selected?.peer_id, loadDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(label: string, path: string, body: unknown, done: string) {
    if (busy) return;
    setBusy(label); setNotice("");
    try { await agent(path, body); setNotice(done); await load(); if (selected) await loadDetail(selected.peer_id); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Action impossible."); }
    finally { setBusy(""); }
  }
  async function copyDraft() {
    try { await navigator.clipboard.writeText(draft); setNotice("Message copié. Colle-le dans Telegram, relis-le, puis envoie-le toi-même."); }
    catch { setNotice("Copie impossible : sélectionne le texte et copie-le à la main."); }
  }

  if (state !== "online") return <section className={s.card}>
    <header><h3><Laptop size={16} aria-hidden="true" /> Agent Telegram · sur ton ordinateur</h3></header>
    {state === "checking" ? <p className={s.muted}><Loader2 size={14} className={s.spin} aria-hidden="true" /> Connexion à l’agent sur ton Mac…</p> : <>
      <p className={s.muted}>L’agent lit ton compte InvestPro Support <b>sur ton Mac uniquement</b> : tes messages, ta session et tes identifiants ne sont jamais envoyés au site. Pour l’afficher ici, lance-le sur cet ordinateur :</p>
      <ol className={s.stepsList}>
        <li>Ouvre <b>Terminal</b> et va dans le dossier de l’agent (<code>cd</code> + glisse le dossier dans la fenêtre).</li>
        <li>Tape <code>.venv/bin/tg-followup dashboard</code> puis Entrée. Laisse la fenêtre ouverte.</li>
        <li>Reviens ici et clique sur « Réessayer ». Utilise Chrome ; s’il demande l’accès au réseau local, clique sur « Autoriser ».</li>
      </ol>
      <p className={s.muted}>Ça ne marche que sur l’ordinateur où tourne l’agent (pas sur ton téléphone).</p>
      <div><button type="button" className={s.ghost} onClick={() => { setState("checking"); void load(); }}><RefreshCw size={14} aria-hidden="true" />Réessayer</button></div>
    </>}
  </section>;

  const overview = data as Overview;
  const contact = detail?.contact.peer_id === selected?.peer_id ? detail?.contact : selected;
  const tg = contact?.username ? `https://t.me/${encodeURIComponent(contact.username)}` : null;
  return <div className={s.root}>
    <div className={s.kpis}>
      <article><span>Contacts suivis</span><strong>{overview.total}</strong><small>dernière analyse : {when(overview.last_scan_at)}</small></article>
      <article data-tone="tg"><span>Réponses reçues</span><strong>{overview.replies}</strong><small>à lire</small></article>
      <article data-tone="warn"><span>Relances à vérifier</span><strong>{overview.to_review}</strong><small>froids sans blocage</small></article>
      <article data-tone="bad"><span>Tâches en attente</span><strong>{overview.pending_tasks}</strong><small>contacts chauds</small></article>
    </div>

    {overview.vip_membership_state !== "verified" && <div className={s.warnBox}><ShieldAlert size={16} aria-hidden="true" /><div><b>Contrôle des groupes VIP incomplet.</b> Avant de relancer quelqu’un, confirme à la main qu’il n’est pas déjà membre (bouton dans sa fiche).{overview.vip_membership_issues.length > 0 && <ul>{overview.vip_membership_issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</div></div>}

    <div className={s.toolbar}>
      <span>{overview.scan_running ? `Analyse en cours… ${overview.scan_processed} conversations parcourues` : overview.scan_error ? `Dernière analyse : ${overview.scan_error}` : "Aucun message n’est envoyé automatiquement."}</span>
      <span style={{ display: "flex", gap: 8 }}>
        <button type="button" className={s.ghost} onClick={() => void load()}><RefreshCw size={14} aria-hidden="true" />Actualiser</button>
        <button type="button" className={s.ghost} disabled={overview.scan_running || !!busy} onClick={() => void run("scan", "/api/scan", {}, "Analyse démarrée sur ton Mac.")}><ScanSearch size={14} aria-hidden="true" />Analyser Telegram</button>
      </span>
    </div>
    {notice && <p className={s.notice} role="status">{notice}</p>}

    <nav className={s.chips} aria-label="Catégories">{CATEGORIES.map(item => <button type="button" key={item.key} aria-pressed={filter === item.key} data-cat={item.key} onClick={() => setFilter(item.key)}>{item.label} <b>{item.key === "all" ? overview.total : overview.categories[item.key]}</b></button>)}</nav>

    <div className={s.agentSplit}>
      <div className={s.agentList}>
        <label className={s.search}><Search size={14} aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nom ou @pseudo…" aria-label="Rechercher un contact" /></label>
        <ul>{contacts.map(item => <li key={item.peer_id}><button type="button" aria-pressed={selected?.peer_id === item.peer_id} onClick={() => setSelectedId(item.peer_id)}>
          <span className={s.dot} data-cat={item.category} aria-hidden="true" />
          <span className={s.agentWho}><b>{item.display_name}</b><small>{item.last_message_outgoing ? "Toi" : "Lui"} · {when(item.last_message_at)}</small></span>
          {item.exclusion ? <Ban size={13} aria-label="Exclu des relances" /> : null}
        </button></li>)}</ul>
        {!contacts.length && <p className={s.empty}>Aucun contact dans cette catégorie.</p>}
      </div>

      {contact ? <article className={s.card}>
        <header><div><h3>{contact.display_name}</h3>{tg ? <a className={s.link} href={tg} target="_blank" rel="noreferrer">@{contact.username} ↗</a> : <small className={s.muted}>Pas de @pseudo</small>}</div><span className={s.catPill} data-cat={contact.category}>{CATEGORY_LABEL[contact.category]}</span></header>
        <div className={s.factGrid}>
          <div><span>Dernier échange</span>{when(contact.last_message_at)} · {contact.last_message_outgoing ? "envoyé par toi" : "reçu de lui"}</div>
          <div><span>Statut</span>{contact.status_label}</div>
          <div><span>Dernière relance</span>{when(contact.last_followup_at)}</div>
          <div><span>Lien VIP envoyé</span>{when(contact.invited_at)}</div>
        </div>
        <div className={s.reasonBox}><b>Pourquoi ce classement</b><p>{contact.reason}</p><small>Classement suggéré à partir de mots-clés : vérifie toujours la conversation.</small></div>
        {contact.exclusion && <div className={s.warnBox}><Ban size={16} aria-hidden="true" /><div><b>Pas de relance pour l’instant</b> — {contact.exclusion}</div></div>}

        {detail?.draft !== null && detail?.contact.peer_id === contact.peer_id && !contact.exclusion?.startsWith("Déjà relancé") && <div className={s.block}>
          <h4>Brouillon de relance (modifiable)</h4>
          <textarea className={s.draft} value={draft} onChange={event => setDraft(event.target.value)} rows={9} />
          <div className={s.actionsRow}>
            <button type="button" className={s.ghost} onClick={() => void copyDraft()}><Copy size={14} aria-hidden="true" />Copier le message</button>
            {tg && <a className={s.ghost} href={tg} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" />Ouvrir la conversation</a>}
            <button type="button" className={s.primaryBtn} disabled={!!busy} onClick={() => { if (window.confirm(`Confirmes-tu avoir envoyé toi-même la relance à ${contact.display_name} dans Telegram ?`)) void run("sent", `/api/contacts/${contact.peer_id}/mark-followup`, {}, "Relance notée. Le contact passe en « réponse attendue »."); }}><MailCheck size={14} aria-hidden="true" />J’ai envoyé la relance</button>
          </div>
          <small className={s.muted}>Rien n’est envoyé par le site ni par l’agent : c’est toi qui envoies depuis Telegram.</small>
        </div>}

        <div className={s.block}><h4>Actions</h4><div className={s.actionsRow}>
          {contact.exclusion?.startsWith("Vérification VIP") && <button type="button" className={s.ghost} disabled={!!busy} onClick={() => void run("vip", `/api/contacts/${contact.peer_id}/vip-checked`, {}, "Noté : vérifié à la main, pas membre VIP.")}><ShieldCheck size={14} aria-hidden="true" />J’ai vérifié : pas membre VIP</button>}
          {!["vip", "stop", "invite"].includes(contact.category) && <button type="button" className={s.ghost} disabled={!!busy} onClick={() => void run("inv", `/api/contacts/${contact.peer_id}/invited`, {}, "Noté : lien d’invitation déjà envoyé.")}><CheckCircle2 size={14} aria-hidden="true" />Lien déjà envoyé</button>}
          {contact.category !== "stop" && <button type="button" className={s.ghost} disabled={!!busy} onClick={() => { if (window.confirm(`Ne plus jamais proposer de relance à ${contact.display_name} ?`)) void run("stop", `/api/contacts/${contact.peer_id}/do-not-contact`, {}, "Contact marqué « ne plus contacter »."); }}><Ban size={14} aria-hidden="true" />Ne plus contacter</button>}
          {!["vip", "stop"].includes(contact.category) && <label className={s.selectLabel}>Statut<select value={EDITABLE_STATUSES.includes(contact.status) ? contact.status : ""} disabled={!!busy} onChange={event => event.target.value && void run("status", `/api/contacts/${contact.peer_id}/status`, { status: event.target.value }, "Statut mis à jour.")}>
            {!EDITABLE_STATUSES.includes(contact.status) && <option value="">{contact.status_label}</option>}
            {EDITABLE_STATUSES.map(value => <option key={value} value={value}>{overview.status_labels[value] || value}</option>)}
          </select></label>}
        </div></div>

        <div className={s.block}><h4>Historique</h4>
          {detail?.contact.peer_id === contact.peer_id && detail.events.length ? <ol className={s.timeline}>{detail.events.map((event, index) => <li key={index} data-tone="tg"><time>{when(event.at).split(" à ")[0]}</time><span>{event.action}{event.detail ? ` · ${event.detail}` : ""}</span></li>)}</ol> : <p className={s.muted}>Pas encore d’action enregistrée (l’historique démarre avec cette version).</p>}
        </div>
      </article> : <p className={s.empty}>Sélectionne un contact.</p>}
    </div>
    {busy && <p className={s.muted}><Check size={13} aria-hidden="true" /> Traitement…</p>}
  </div>;
}
