"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, Copy, Eye, EyeOff, KeyRound, Loader2, MessageCircle, RefreshCw, Search, Send, ShieldCheck } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { vipRequest } from "@/lib/vip/client";
import s from "./essai.module.css";

type Status = "new" | "contacted" | "qualified" | "demo_active" | "completed" | "converted" | "lost";
type Lead = {
  id: string; nom: string; telegram: string | null; telephone: string | null; consentement_whatsapp: boolean;
  broker: string; compte: string; serveur: string; status: Status; temperature: string;
  broker_affiliation_verified: boolean; demo_account_verified: boolean; copy_linked: boolean; channel_joined: boolean;
  copier_account_reference: string | null; admin_notes: string | null; next_follow_up_on: string | null;
  last_contacted_at: string | null; submitted_at: string; updated_at: string; has_demo_password?: boolean;
  prenom?: string | null; nom_famille?: string | null; email?: string | null;
};
const STATUS: Status[] = ["new", "contacted", "qualified", "demo_active", "completed", "converted", "lost"];
const statusFr: Record<Status, string> = { new: "Nouveau", contacted: "Contacté", qualified: "À vérifier", demo_active: "Démo branchée", completed: "Essai terminé", converted: "Converti en VIP", lost: "Clos" };
const statusEn: Record<Status, string> = { new: "New", contacted: "Contacted", qualified: "To check", demo_active: "Demo connected", completed: "Trial completed", converted: "Converted to VIP", lost: "Closed" };
const FILTERS = [["all", "Toutes"], ["new", "Nouvelles"], ["progress", "En cours"], ["demo_active", "Démo branchée"], ["converted", "Converties"], ["lost", "Closes"]] as const;
const STEPS = [["broker_affiliation_verified", "Affiliation vérifiée"], ["demo_account_verified", "Compte démo vérifié"], ["copy_linked", "Ajouté à la copie"], ["channel_joined", "Canal Telegram rejoint"]] as const;

function localDate(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(date);
}
function ago(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}
const initials = (name: string) => name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
const waHref = (lead: Lead) => lead.telephone ? `https://wa.me/${lead.telephone.replace(/\D/g, "")}` : "";
const tgHref = (lead: Lead) => lead.telegram ? `https://t.me/${lead.telegram.replace(/^@/, "")}` : "";
const firstName = (name: string) => name.split(/[\s,]+/).filter(Boolean)[0] || "";
function confirmationText(lead: Lead) {
  const hello = firstName(lead.nom) ? `Salut ${firstName(lead.nom)} 👋` : "Salut 👋";
  return `${hello}\nBonne nouvelle : ton compte démo ${lead.broker} n° ${lead.compte} est bien connecté à InvestPro Copy ✅\nLes trades du VIP vont arriver directement dessus pendant ton essai, tu n’as rien à faire.\nUne question ? Réponds-moi ici. — Enrick`;
}
const inProgress = (status: Status) => status === "contacted" || status === "qualified" || status === "completed";

export default function EssaiVipAdminPage() {
  const { locale } = useLocale();
  const en = locale === "en";
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState<{ id: string; value: string; shown: boolean } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [manualPassword, setManualPassword] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await vipRequest<{ leads: Lead[] }>("/api/admin/essai-vip", { signal });
      if (signal?.aborted) return;
      const list = response.leads || [];
      setLeads(list);
      setError("");
      setSelectedId(current => current && list.some(item => item.id === current) ? current : list[0]?.id || "");
      setDraft(current => current ? list.find(item => item.id === current.id) || current : list[0] || null);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const visible = useMemo(() => {
    const needle = search.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
    return leads.filter(lead => {
      if (filter === "progress" ? !inProgress(lead.status) : filter !== "all" && lead.status !== filter) return false;
      const haystack = [lead.nom, lead.email, lead.telegram, lead.telephone, lead.broker, lead.compte, lead.serveur].filter(Boolean).join(" ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      return !needle || haystack.includes(needle);
    });
  }, [filter, leads, search]);
  const counts = {
    new: leads.filter(lead => lead.status === "new").length,
    progress: leads.filter(lead => inProgress(lead.status)).length,
    demo: leads.filter(lead => lead.status === "demo_active" || lead.copy_linked).length,
    converted: leads.filter(lead => lead.status === "converted").length,
  };

  function choose(lead: Lead) { setSelectedId(lead.id); setDraft(lead); setNotice(""); setError(""); setPassword(null); setManualPassword(""); }
  async function storePassword() {
    if (!draft || !manualPassword || revealing) return;
    setRevealing(true); setError("");
    try {
      await vipRequest<{ ok: true }>("/api/admin/essai-vip", { method: "POST", body: JSON.stringify({ action: "store", id: draft.id, password: manualPassword }) });
      const updated = { ...draft, has_demo_password: true };
      setLeads(current => current.map(item => item.id === draft.id ? { ...item, has_demo_password: true } : item));
      setDraft(updated);
      setPassword({ id: draft.id, value: manualPassword, shown: false });
      setManualPassword("");
      setNotice("Mot de passe enregistré (chiffré).");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible."); }
    finally { setRevealing(false); }
  }
  function update<K extends keyof Lead>(key: K, value: Lead[K]) { setDraft(current => current ? { ...current, [key]: value } : current); }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copié.`); } catch { setError("Copie impossible : sélectionne le texte à la main."); }
  }
  async function reveal() {
    if (!draft || revealing) return;
    if (password?.id === draft.id) { setPassword({ ...password, shown: !password.shown }); return; }
    setRevealing(true); setError("");
    try {
      const result = await vipRequest<{ password: string }>("/api/admin/essai-vip", { method: "POST", body: JSON.stringify({ action: "reveal", id: draft.id }) });
      setPassword({ id: draft.id, value: result.password, shown: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Mot de passe indisponible."); }
    finally { setRevealing(false); }
  }
  async function save(markContacted = false) {
    if (!draft) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await vipRequest<{ lead: Lead }>("/api/admin/essai-vip", { method: "PATCH", body: JSON.stringify({
        id: draft.id, status: draft.status,
        broker_affiliation_verified: draft.broker_affiliation_verified, demo_account_verified: draft.demo_account_verified,
        copy_linked: draft.copy_linked, channel_joined: draft.channel_joined,
        copier_account_reference: draft.copier_account_reference || "", admin_notes: draft.admin_notes || "",
        next_follow_up_on: draft.next_follow_up_on, ...(markContacted ? { mark_contacted: true, status: draft.status === "new" ? "contacted" : draft.status } : {}),
      }) });
      setLeads(current => current.map(item => item.id === response.lead.id ? response.lead : item));
      setDraft(response.lead);
      setNotice(markContacted ? "Contact enregistré." : "Suivi enregistré.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  }

  if (loading) return <div className={s.loading}><Loader2 size={18} className={s.spin} aria-hidden="true" /> Chargement des demandes d’essai…</div>;
  const shownPassword = password && draft && password.id === draft.id ? password : null;
  return <div className={s.root}>
    <header className={s.head}>
      <div><span className={s.kicker}>Essai VIP sans dépôt</span><h2>Les demandes d’essai <b>{leads.length}</b></h2><p>Tout ce que la personne a rempli sur le site : contact, broker et accès à son compte démo.</p></div>
      <button type="button" className={s.ghost} onClick={() => { setLoading(true); void load(); }}><RefreshCw size={14} aria-hidden="true" />Actualiser</button>
    </header>

    <div className={s.kpis}>
      <article data-tone="gold"><span>Nouvelles</span><strong>{counts.new}</strong><small>à contacter</small></article>
      <article data-tone="blue"><span>En cours</span><strong>{counts.progress}</strong><small>contactées ou à vérifier</small></article>
      <article data-tone="teal"><span>Démo branchée</span><strong>{counts.demo}</strong><small>sur InvestPro Copy</small></article>
      <article data-tone="green"><span>Converties</span><strong>{counts.converted}</strong><small>passées au VIP</small></article>
    </div>

    {error && <p role="alert" className={s.error}>{error}</p>}
    {notice && <p role="status" className={s.notice}>{notice}</p>}

    <div className={s.split}>
      <aside className={s.listCard} aria-label="Demandes d’essai">
        <label className={s.search}><Search size={15} aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nom, Telegram, téléphone, compte…" aria-label="Rechercher" /></label>
        <div className={s.filters}>{FILTERS.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        <ul className={s.list}>{visible.map(lead => <li key={lead.id}><button type="button" aria-pressed={selectedId === lead.id} onClick={() => choose(lead)}>
          <span className={s.avatar} aria-hidden="true">{initials(lead.nom)}</span>
          <span className={s.who}><b>{lead.nom}</b><small>{lead.broker} · n° {lead.compte}</small><small className={s.when}>{ago(lead.submitted_at)}</small></span>
          <span className={s.state} data-status={lead.status}>{en ? statusEn[lead.status] : statusFr[lead.status]}</span>
        </button></li>)}</ul>
        {!visible.length && <p className={s.empty}>Aucune demande ici.</p>}
      </aside>

      {draft ? <article className={s.sheet} aria-label="Fiche de la demande">
        <header className={s.sheetHead}>
          <span className={s.bigAvatar} aria-hidden="true">{initials(draft.nom)}</span>
          <div><h3>{draft.nom}</h3><p>Demande reçue le {localDate(draft.submitted_at, locale)}</p></div>
          <span className={s.state} data-status={draft.status}>{en ? statusEn[draft.status] : statusFr[draft.status]}</span>
        </header>

        <div className={s.contactRow}>
          {draft.telephone && <a className={s.btnWa} href={waHref(draft)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" />WhatsApp</a>}
          {draft.telegram && <a className={s.btnTg} href={tgHref(draft)} target="_blank" rel="noopener noreferrer"><Send size={16} aria-hidden="true" />Telegram</a>}
        </div>

        <section className={s.block}>
          <h4>Contact</h4>
          <div className={s.facts}>
            {draft.prenom && <div><span>Prénom</span>{draft.prenom}</div>}
            {draft.nom_famille && <div><span>Nom</span>{draft.nom_famille}</div>}
            <div className={s.copyable}><span>E-mail</span>{draft.email ? <><a href={`mailto:${draft.email}`}>{draft.email}</a><button type="button" onClick={() => void copy(draft.email as string, "E-mail")} aria-label="Copier l’e-mail"><Copy size={14} /></button></> : <small>Non demandé (ancien formulaire)</small>}</div>
            <div><span>Téléphone</span>{draft.telephone ? <>{draft.telephone}{draft.consentement_whatsapp && <em>accord WhatsApp ✓</em>}</> : "—"}</div>
            <div><span>Telegram</span>{draft.telegram || "—"}</div>
          </div>
        </section>

        <section className={s.block}>
          <h4>Compte démo à brancher</h4>
          <div className={s.facts}>
            <div><span>Broker</span>{draft.broker}</div>
            <div className={s.copyable}><span>N° de compte</span><code>{draft.compte}</code><button type="button" onClick={() => void copy(draft.compte, "Numéro de compte")} aria-label="Copier le numéro de compte"><Copy size={14} /></button></div>
            <div className={s.copyable}><span>Serveur</span><code>{draft.serveur}</code><button type="button" onClick={() => void copy(draft.serveur, "Serveur")} aria-label="Copier le serveur"><Copy size={14} /></button></div>
            <div className={s.copyable + " " + s.secret}><span><KeyRound size={12} aria-hidden="true" /> Mot de passe démo</span>
              {draft.has_demo_password ? <>
                <code>{shownPassword?.shown ? shownPassword.value : "••••••••••"}</code>
                <button type="button" onClick={() => void reveal()} aria-label={shownPassword?.shown ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{revealing ? <Loader2 size={14} className={s.spin} /> : shownPassword?.shown ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                {shownPassword && <button type="button" onClick={() => void copy(shownPassword.value, "Mot de passe")} aria-label="Copier le mot de passe"><Copy size={14} /></button>}
              </> : <div className={s.addPassword}>
                <small>Cette demande date d’avant l’enregistrement sécurisé : le mot de passe n’a été envoyé que sur Telegram. Colle-le ici une seule fois, il s’affichera ensuite avec l’œil 👁.</small>
                <div><input type="password" autoComplete="off" value={manualPassword} maxLength={256} onChange={event => setManualPassword(event.target.value)} placeholder="Mot de passe démo" aria-label="Mot de passe démo" /><button type="button" className={s.primary} disabled={!manualPassword || revealing} onClick={() => void storePassword()}>{revealing ? <Loader2 size={14} className={s.spin} /> : <Check size={14} />}Enregistrer</button></div>
              </div>}
            </div>
          </div>
          {/live|real|r[ée]el/i.test(draft.serveur) && !/d[ée]mo/i.test(draft.serveur) && <p className={s.warn}>Serveur « Live » : vérifie que c’est bien un compte démo (solde fictif). Chez Bullwaves, les comptes démo s’affichent en Live.</p>}
        </section>

        <section className={s.block}>
          <h4>Avancement</h4>
          <div className={s.steps}>{STEPS.map(([key, label]) => <label key={key} data-on={draft[key] || undefined}><input type="checkbox" checked={draft[key]} onChange={event => update(key, event.target.checked)} /><span>{label}</span></label>)}</div>
          <div className={s.fields}>
            <label><span>Étape</span><select value={draft.status} onChange={event => update("status", event.target.value as Status)}>{STATUS.map(value => <option key={value} value={value}>{en ? statusEn[value] : statusFr[value]}</option>)}</select></label>
            <label><span>Prochaine relance</span><input type="date" value={draft.next_follow_up_on || ""} onChange={event => update("next_follow_up_on", event.target.value || null)} /></label>
            <label><span>Réf. du compte dans InvestPro Copy</span><input value={draft.copier_account_reference || ""} maxLength={100} onChange={event => update("copier_account_reference", event.target.value)} placeholder="Après l’ajout manuel" /></label>
          </div>
          <label className={s.notes}><span>Notes</span><textarea rows={3} maxLength={4000} value={draft.admin_notes || ""} onChange={event => update("admin_notes", event.target.value)} placeholder="Échange, objectif de dépôt, questions…" /></label>
          <p className={s.meta}>Dernier contact : {localDate(draft.last_contacted_at, locale)}</p>
        </section>

        {draft.copy_linked && <section className={s.confirm}>
          <h4><BadgeCheck size={14} aria-hidden="true" /> Prévenir {firstName(draft.nom)} que son compte est connecté</h4>
          <p>Le message est prêt : clique sur WhatsApp ou Telegram, vérifie-le et appuie sur Envoyer.</p>
          <blockquote>{confirmationText(draft)}</blockquote>
          <div className={s.contactRow}>
            {draft.telephone && <a className={s.btnWa} href={`${waHref(draft)}?text=${encodeURIComponent(confirmationText(draft))}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" />Envoyer sur WhatsApp</a>}
            {draft.telegram && <a className={s.btnTg} href={`tg://resolve?domain=${encodeURIComponent(draft.telegram.replace(/^@/, ""))}&text=${encodeURIComponent(confirmationText(draft))}`} onClick={() => void copy(confirmationText(draft), "Message")}><Send size={16} aria-hidden="true" />Envoyer sur Telegram</a>}
            <button type="button" className={s.ghost} onClick={() => void copy(confirmationText(draft), "Message")}><Copy size={14} aria-hidden="true" />Copier le message</button>
          </div>
        </section>}

        <footer className={s.actions}>
          <button type="button" className={s.ghost} disabled={saving} onClick={() => void save(true)}><MessageCircle size={15} aria-hidden="true" />J’ai contacté la personne</button>
          <button type="button" className={s.primary} disabled={saving} onClick={() => void save(false)}><Check size={15} aria-hidden="true" />{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </footer>
        <p className={s.fine}><ShieldCheck size={12} aria-hidden="true" /> Compte démo uniquement. Le mot de passe est chiffré et ne s’affiche qu’à ta demande.</p>
      </article> : <div className={s.emptySheet}>Sélectionne une demande dans la liste.</div>}
    </div>
  </div>;
}
