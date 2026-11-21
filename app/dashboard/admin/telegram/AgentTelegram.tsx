"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Ban, CheckCircle2, Copy, ExternalLink, Laptop, Loader2, MailCheck, RefreshCw, ScanSearch, Search, Send, ShieldAlert, ShieldCheck, SkipForward } from "lucide-react";
import s from "./TelegramAdmin.module.css";

/**
 * Agent Telegram : la plateforme de relance est ici, mais les données restent sur le Mac d’Enrick.
 * Le navigateur lit directement l’agent local (127.0.0.1) ; rien ne passe par le serveur du site.
 * Un message ne part que quand Enrick clique sur « Envoyer », depuis son compte support.
 */
const AGENT = "http://127.0.0.1:8765";
const AGENT_VERSION = "2";

type Category = "chaud" | "abonne" | "tiede" | "froid" | "vip" | "invite" | "stop";
type AgeBucket = "recent" | "3m" | "6m" | "1an";
type Filter = "ready" | "chaud" | "abonne" | "tiede" | "froid" | "check" | "excluded" | "all";
type Contact = {
  peer_id: number; display_name: string; username: string | null; last_message_at: string; last_message_outgoing: boolean;
  last_followup_at: string | null; invited_at: string | null; vip_checked_manually_at: string | null;
  status: string; status_label: string; category: Category; reason: string; exclusion: string | null; warning: string | null;
  needs_vip_check: boolean; can_send: boolean; age_days: number | null; age_bucket: AgeBucket | null;
  snippet: string | null; snippet_outgoing: boolean | null; vip_check: "membre" | "non_membre" | "inconnu" | null; vip_checked_at: string | null;
};
type Overview = {
  agent_version?: string; total: number; ready: number; categories: Record<Category, number>; replies: number; to_review: number;
  sent_today: number; daily_send_limit: number; last_scan_at: string | null; vip_membership_issues: string[];
  scan_running: boolean; scan_error: string | null; scan_processed: number; scan_phase: string | null; send_running: boolean;
  contacts: Contact[];
};
type Detail = { contact: Contact; events: { at: string; action: string; detail: string | null }[]; draft: string | null };

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ready", label: "À relancer" }, { key: "chaud", label: "Chauds" }, { key: "abonne", label: "Anciens abonnés" }, { key: "tiede", label: "Tièdes" }, { key: "froid", label: "Froids" },
  { key: "check", label: "VIP à vérifier" }, { key: "excluded", label: "Écartés" }, { key: "all", label: "Tous" },
];
const AGES: { key: AgeBucket | "all"; label: string }[] = [
  { key: "all", label: "Toutes" }, { key: "recent", label: "Moins de 3 mois" }, { key: "3m", label: "3 à 6 mois" },
  { key: "6m", label: "6 à 12 mois" }, { key: "1an", label: "Plus d’un an" },
];
const CATEGORY_LABEL: Record<Category, string> = { chaud: "Chaud", abonne: "Ancien abonné", tiede: "Tiède", froid: "Froid", vip: "Déjà membre VIP", invite: "Déjà invité", stop: "Ne plus contacter" };
const ORDER: Record<Category, number> = { chaud: 0, abonne: 1, tiede: 2, froid: 3, invite: 4, vip: 5, stop: 6 };
const GROUP_LABEL: Record<Category, string> = { chaud: "Les plus chauds", abonne: "Anciens abonnés", tiede: "Tièdes", froid: "Froids", invite: "Déjà invités", vip: "Déjà membres VIP", stop: "Ne plus contacter" };
const CAT_SHORT: Record<Category, string> = { chaud: "Chaud", abonne: "Ex-abonné", tiede: "Tiède", froid: "Froid", invite: "Invité", vip: "VIP", stop: "Stop" };
const EXCLUDED: Category[] = ["vip", "stop", "invite"];

async function agent<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(AGENT + path, body === undefined ? { cache: "no-store" } : { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string; message?: string }).error || (data as { message?: string }).message || "L’agent n’a pas pu traiter la demande.");
  return data as T;
}
function when(value: string | null, withTime = true) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("fr-FR", withTime ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" }).format(date);
}
function firstName(name: string) { return name.trim().split(/\s+/)[0] || "ce contact"; }
function ageText(days: number | null) {
  if (days === null) return "";
  if (days < 1) return "aujourd’hui";
  if (days < 31) return `${days} j`;
  if (days < 365) return `${Math.round(days / 30.4)} mois`;
  return days < 730 ? `${(days / 365).toFixed(1).replace(".", ",")} an` : `${Math.floor(days / 365)} ans`;
}
function matches(contact: Contact, filter: Filter, age: AgeBucket | "all", query: string) {
  if (filter === "ready" && !contact.can_send) return false;
  if ((filter === "chaud" || filter === "abonne" || filter === "tiede" || filter === "froid") && contact.category !== filter) return false;
  if (filter === "check" && !contact.needs_vip_check) return false;
  if (filter === "excluded" && !EXCLUDED.includes(contact.category)) return false;
  if (age !== "all" && contact.age_bucket !== age) return false;
  return !query || `${contact.display_name} ${contact.username || ""}`.toLocaleLowerCase("fr").includes(query);
}

export default function AgentTelegram() {
  const [state, setState] = useState<"checking" | "offline" | "online">("checking");
  const [data, setData] = useState<Overview | null>(null);
  const [filter, setFilter] = useState<Filter>("ready");
  const [age, setAge] = useState<AgeBucket | "all">("all");
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

  const query = search.trim().toLocaleLowerCase("fr");
  const visible = useMemo(() => (data?.contacts || [])
    .filter(contact => matches(contact, filter, age, query))
    .sort((a, b) => ORDER[a.category] - ORDER[b.category] || b.last_message_at.localeCompare(a.last_message_at)), [data, filter, age, query]);
  const ageCounts = useMemo(() => {
    const base = (data?.contacts || []).filter(contact => matches(contact, filter, "all", query));
    return Object.fromEntries(AGES.map(item => [item.key, item.key === "all" ? base.length : base.filter(contact => contact.age_bucket === item.key).length])) as Record<AgeBucket | "all", number>;
  }, [data, filter, query]);
  const groupCounts = useMemo(() => visible.reduce((acc, contact) => { acc[contact.category] = (acc[contact.category] || 0) + 1; return acc; }, {} as Partial<Record<Category, number>>), [visible]);
  const selected = visible.find(contact => contact.peer_id === selectedId) || visible[0] || null;

  const loadDetail = useCallback(async (peerId: number) => {
    try { const value = await agent<Detail>(`/api/agent/contacts/${peerId}`); setDetail(value); setDraft(value.draft || ""); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Fiche indisponible."); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selected) void loadDetail(selected.peer_id); else setDetail(null); }, [selected?.peer_id, loadDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(label: string, path: string, body: unknown, done: string) {
    if (busy || !selected) return;
    const peerId = selected.peer_id;
    setBusy(label); setNotice("");
    try { await agent(path, body); setNotice(done); await load(); await loadDetail(peerId); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Action impossible."); }
    finally { setBusy(""); }
  }
  async function send() {
    if (!selected || busy) return;
    if (!selected.can_send) { setNotice(selected.exclusion || "Envoi impossible pour ce contact."); return; }
    const text = draft.trim();
    if (!text) { setNotice("Le message est vide."); return; }
    const index = visible.findIndex(contact => contact.peer_id === selected.peer_id);
    const next = visible[index + 1] || null;
    setBusy("send"); setNotice("");
    try {
      const result = await agent<{ sent_today: number }>(`/api/contacts/${selected.peer_id}/send`, { text });
      setNotice(`Envoyé à ${selected.display_name} ✓ (${result.sent_today} aujourd’hui)`);
      await load();
      if (next) setSelectedId(next.peer_id); else await loadDetail(selected.peer_id);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Envoi impossible."); }
    finally { setBusy(""); }
  }
  function skip() {
    const index = visible.findIndex(contact => contact.peer_id === selected?.peer_id);
    const next = visible[index + 1] || visible[0];
    if (next) setSelectedId(next.peer_id);
  }
  async function copyDraft() {
    try { await navigator.clipboard.writeText(draft); setNotice("Message copié."); }
    catch { setNotice("Copie impossible : sélectionne le texte et copie-le à la main."); }
  }
  function onDraftKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void send(); }
  }

  if (state !== "online" || !data) return <section className={s.card}>
    <header><h3><Laptop size={16} aria-hidden="true" /> Agent Telegram · sur ton Mac</h3></header>
    {state === "checking" ? <p className={s.muted}><Loader2 size={14} className={s.spin} aria-hidden="true" /> Connexion à l’agent sur ton Mac…</p> : <>
      <p className={s.muted}>L’agent de relance tourne sur ton Mac : c’est là que ton compte Telegram support est connecté. Tes messages et ta session ne passent jamais par le site. Pour l’afficher ici :</p>
      <ol className={s.stepsList}>
        <li>Sur ton Mac, ouvre <b>Documents › ChatGPT › TELEGRAM</b> et double-clique sur <b>« Lancer-agent-relances »</b>. Laisse la fenêtre du Terminal ouverte.</li>
        <li>Reviens ici dans <b>Chrome</b> et clique sur « Réessayer ». Si Chrome demande l’accès aux appareils du réseau local, clique sur « Autoriser ».</li>
      </ol>
      <p className={s.muted}>Ça marche seulement sur le Mac où tourne l’agent, pas sur ton téléphone.</p>
      <div><button type="button" className={s.ghost} onClick={() => { setState("checking"); void load(); }}><RefreshCw size={14} aria-hidden="true" />Réessayer</button></div>
    </>}
  </section>;

  const excluded = data.categories.vip + data.categories.stop + data.categories.invite;
  const tg = selected?.username ? `https://t.me/${encodeURIComponent(selected.username)}` : null;
  const draftReady = detail !== null && selected !== null && detail.contact.peer_id === selected.peer_id && detail.draft !== null;
  const counts: Record<Filter, number> = { ready: data.ready, chaud: data.categories.chaud, abonne: data.categories.abonne ?? 0, tiede: data.categories.tiede, froid: data.categories.froid, check: data.to_review, excluded, all: data.total };
  const phase = data.scan_phase === "contrôle VIP" ? `contrôle VIP : ${data.scan_processed} contact(s) vérifié(s)` : data.scan_phase === "conversations" ? `${data.scan_processed} conversation(s) parcourue(s)` : "connexion à Telegram…";

  return <div className={s.root}>
    {data.agent_version !== AGENT_VERSION && <div className={s.warnBox}><ShieldAlert size={16} aria-hidden="true" /><div><b>Ton agent n’est pas à jour.</b> Ferme la fenêtre du Terminal sur ton Mac, puis relance « Lancer-agent-relances ».</div></div>}
    {data.scan_running && <p className={s.notice} role="status"><Loader2 size={14} className={s.spin} aria-hidden="true" /> Analyse de tout ton Telegram support en cours ({phase}). Si le Terminal demande ton numéro ou un code, réponds dans sa fenêtre. Rien n’est envoyé pendant l’analyse.</p>}
    {!data.scan_running && data.scan_error && <div className={s.warnBox}><ShieldAlert size={16} aria-hidden="true" /><div><b>L’analyse s’est arrêtée.</b> {data.scan_error}</div></div>}
    {!data.scan_running && data.vip_membership_issues.length > 0 && <div className={s.warnBox}><ShieldAlert size={16} aria-hidden="true" /><div><b>Contrôle du groupe InvestPro Trading VIP</b><ul>{data.vip_membership_issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div></div>}

    <div className={s.kpis}>
      <article data-tone="tg"><span>Prêts à relancer</span><strong>{data.ready}</strong><small>message prêt, rien ne bloque</small></article>
      <article><span>Envoyés aujourd’hui</span><strong>{data.sent_today}</strong><small>limite de sécurité : {data.daily_send_limit} par jour</small></article>
      <article data-tone="warn"><span>Ils t’ont écrit en dernier</span><strong>{data.replies}</strong><small>réponses à lire</small></article>
      <article data-tone="bad"><span>Écartés</span><strong>{excluded}</strong><small>déjà VIP, refus, déjà invités</small></article>
    </div>

    <div className={s.toolbar}>
      <span>{data.last_scan_at ? `Dernière analyse : ${when(data.last_scan_at)} · ${data.total} contacts suivis` : "Aucune analyse pour l’instant."}</span>
      <span style={{ display: "flex", gap: 8 }}>
        <button type="button" className={s.ghost} onClick={() => void load()}><RefreshCw size={14} aria-hidden="true" />Actualiser</button>
        <button type="button" className={s.ghost} disabled={data.scan_running || data.send_running || !!busy} onClick={() => void run("scan", "/api/scan", {}, "Analyse démarrée sur ton Mac.")}><ScanSearch size={14} aria-hidden="true" />Analyser Telegram</button>
      </span>
    </div>
    {notice && <p className={s.notice} role="status">{notice}</p>}

    <div className={s.filterRow}><span>Contacts</span><nav className={s.chips} aria-label="Catégories">{FILTERS.map(item => <button type="button" key={item.key} aria-pressed={filter === item.key} onClick={() => { setFilter(item.key); setAge("all"); }}>{item.label} <b>{counts[item.key]}</b></button>)}</nav></div>
    <div className={s.filterRow}><span>Ancienneté</span><nav className={s.chips} aria-label="Ancienneté">{AGES.map(item => <button type="button" key={item.key} aria-pressed={age === item.key} onClick={() => setAge(item.key)}>{item.label} <b>{ageCounts[item.key]}</b></button>)}</nav></div>

    <div className={s.agentSplit}>
      <div className={s.agentList}>
        <label className={s.search}><Search size={14} aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nom ou @pseudo…" aria-label="Rechercher un contact" /></label>
        <ul>{visible.map((item, index) => <Fragment key={item.peer_id}>
          {(index === 0 || visible[index - 1].category !== item.category) && <li className={s.groupHead} data-cat={item.category}>{GROUP_LABEL[item.category]} · {groupCounts[item.category]}</li>}
          <li><button type="button" aria-pressed={selected?.peer_id === item.peer_id} onClick={() => setSelectedId(item.peer_id)}>
            <span className={s.dot} data-cat={item.category} aria-hidden="true" />
            <span className={s.agentWho}><b>{item.display_name}</b><small>{item.last_message_outgoing ? "Toi" : firstName(item.display_name)} · {when(item.last_message_at, false)} · {ageText(item.age_days)}</small></span>
            <span className={s.catTag} data-cat={item.category}>{item.can_send ? "✓ " : ""}{CAT_SHORT[item.category]}</span>
          </button></li>
        </Fragment>)}</ul>
        {!visible.length && <p className={s.empty}>{data.total ? "Personne dans ce filtre." : "Lance une première analyse pour remplir la liste."}</p>}
      </div>

      {selected ? <article className={s.card}>
        <header><div><h3>{selected.display_name}</h3>{tg ? <a className={s.link} href={tg} target="_blank" rel="noreferrer">@{selected.username} ↗</a> : <small className={s.muted}>Pas de @pseudo</small>}</div>
          <span style={{ display: "flex", gap: 6 }}><span className={s.catPill} data-cat={selected.category}>{CATEGORY_LABEL[selected.category]}</span>{selected.age_days !== null && <span className={s.ageTag}>{ageText(selected.age_days)}</span>}</span></header>

        {selected.snippet && <div className={s.quote} data-them={selected.snippet_outgoing ? undefined : "true"}><small>Dernier message · {selected.snippet_outgoing ? "toi" : firstName(selected.display_name)} · {when(selected.last_message_at)}</small><p>{selected.snippet}</p></div>}
        <div className={s.factGrid}>
          <div><span>Pourquoi ce classement</span>{selected.reason}</div>
          <div><span>Dernière relance</span>{when(selected.last_followup_at)}</div>
          <div><span>Statut</span>{selected.status_label}</div>
        </div>

        {selected.category === "vip" ? <p className={s.okBox}>{selected.reason}</p>
          : selected.vip_checked_manually_at ? <p className={s.okBox}>Vérifié à la main : pas membre VIP ({when(selected.vip_checked_manually_at, false)}).</p>
          : selected.vip_check === "non_membre" ? <p className={s.okBox}>Pas membre d’InvestPro Trading VIP · contrôlé le {when(selected.vip_checked_at, false)}.</p>
          : selected.needs_vip_check ? <div className={s.warnBox}><ShieldAlert size={16} aria-hidden="true" /><div>{selected.exclusion}<div className={s.actionsRow} style={{ marginTop: 8 }}><button type="button" className={s.ghost} disabled={!!busy} onClick={() => void run("vip", `/api/contacts/${selected.peer_id}/vip-checked`, {}, "Noté : vérifié à la main, pas membre VIP.")}><ShieldCheck size={14} aria-hidden="true" />J’ai vérifié : pas membre VIP</button></div></div></div>
          : null}
        {selected.exclusion && !selected.needs_vip_check && <div className={s.warnBox}><Ban size={16} aria-hidden="true" /><div><b>Pas de relance pour l’instant</b> · {selected.exclusion}</div></div>}
        {selected.warning && <div className={s.warnBox}><ShieldAlert size={16} aria-hidden="true" /><div>{selected.warning}</div></div>}

        {draftReady && <div className={s.block}>
          <h4>Message (modifiable avant l’envoi)</h4>
          <textarea className={s.draft} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={onDraftKey} rows={12} aria-label="Message de relance" />
          <div className={s.actionsRow}>
            <button type="button" className={s.primaryBtn} disabled={!selected.can_send || !!busy} onClick={() => void send()}>{busy === "send" ? <Loader2 size={14} className={s.spin} aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}{busy === "send" ? "Envoi…" : `Envoyer à ${firstName(selected.display_name)}`}</button>
            <button type="button" className={s.ghost} onClick={skip}><SkipForward size={14} aria-hidden="true" />Passer</button>
            <button type="button" className={s.ghost} onClick={() => void copyDraft()}><Copy size={14} aria-hidden="true" />Copier</button>
            {tg && <a className={s.ghost} href={tg} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" />Ouvrir dans Telegram</a>}
            <span className={`${s.hint} ${s.push}`}>⌘ + Entrée pour envoyer</span>
          </div>
          <small className={s.muted}>Le message part de ton compte support seulement quand tu cliques sur « Envoyer ».</small>
        </div>}

        <div className={s.actionsRow}>
          {!EXCLUDED.includes(selected.category) && <button type="button" className={s.ghost} disabled={!!busy} onClick={() => void run("inv", `/api/contacts/${selected.peer_id}/invited`, {}, "Noté : lien VIP déjà envoyé.")}><CheckCircle2 size={14} aria-hidden="true" />Lien VIP déjà envoyé</button>}
          {selected.category !== "stop" && <button type="button" className={s.ghost} disabled={!!busy} onClick={() => { if (window.confirm(`Ne plus jamais proposer de relance à ${selected.display_name} ?`)) void run("stop", `/api/contacts/${selected.peer_id}/do-not-contact`, {}, `${selected.display_name} ne sera plus relancé.`); }}><Ban size={14} aria-hidden="true" />Ne plus contacter</button>}
          {draftReady && <button type="button" className={s.ghost} disabled={!!busy} onClick={() => { if (window.confirm(`Tu as envoyé toi-même la relance à ${selected.display_name} dans Telegram ?`)) void run("sent", `/api/contacts/${selected.peer_id}/mark-followup`, {}, "Relance notée comme envoyée à la main."); }}><MailCheck size={14} aria-hidden="true" />Je l’ai envoyé à la main</button>}
        </div>

        <div className={s.block}><h4>Historique</h4>
          {detail?.contact.peer_id === selected.peer_id && detail.events.length ? <ol className={s.timeline}>{detail.events.map((event, index) => <li key={index} data-tone="tg"><time>{when(event.at, false)}</time><span>{event.action}{event.detail ? ` · ${event.detail}` : ""}</span></li>)}</ol> : <p className={s.muted}>Pas encore d’action enregistrée.</p>}
        </div>
      </article> : <p className={s.empty}>Sélectionne un contact.</p>}
    </div>
  </div>;
}
