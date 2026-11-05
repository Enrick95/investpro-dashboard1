"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, ExternalLink, Flame, MessageCircle, Phone, RefreshCw, Search, ShieldCheck, Signal, Users } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { vipRequest } from "@/lib/vip/client";

type Status = "new" | "contacted" | "qualified" | "demo_active" | "completed" | "converted" | "lost";
type Temperature = "unclassified" | "hot" | "warm" | "cold";
type Lead = {
  id: string; nom: string; telegram: string | null; telephone: string | null; consentement_whatsapp: boolean;
  broker: string; compte: string; serveur: string; status: Status; temperature: Temperature;
  broker_affiliation_verified: boolean; demo_account_verified: boolean; copy_linked: boolean; channel_joined: boolean;
  copier_account_reference: string | null; admin_notes: string; next_follow_up_on: string | null;
  last_contacted_at: string | null; submitted_at: string; updated_at: string;
};
const STATUS: Status[] = ["new", "contacted", "qualified", "demo_active", "completed", "converted", "lost"];
const TEMP: Temperature[] = ["unclassified", "hot", "warm", "cold"];
const statusFr: Record<Status, string> = { new: "Nouveau", contacted: "Contacté", qualified: "À qualifier", demo_active: "Démo branchée", completed: "Essai terminé", converted: "Converti", lost: "Clos / perdu" };
const statusEn: Record<Status, string> = { new: "New", contacted: "Contacted", qualified: "Qualify", demo_active: "Demo connected", completed: "Trial completed", converted: "Converted", lost: "Closed / lost" };
const tempFr: Record<Temperature, string> = { unclassified: "À classer", hot: "Chaud", warm: "Tiède", cold: "Froid" };
const tempEn: Record<Temperature, string> = { unclassified: "Unclassified", hot: "Hot", warm: "Warm", cold: "Cold" };

function localDate(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short", year: "numeric", ...(value.includes("T") ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(date);
}
function today() { return new Date().toISOString().slice(0, 10); }
function contactHref(lead: Lead) { return lead.telephone ? `https://wa.me/${lead.telephone.replace(/\D/g, "")}` : lead.telegram ? `https://t.me/${lead.telegram.replace(/^@/, "")}` : ""; }

export default function EssaiVipAdminPage() {
  const { locale } = useLocale();
  const en = locale === "en";
  const tr = (fr: string, english: string) => en ? english : fr;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await vipRequest<{ leads: Lead[] }>("/api/admin/essai-vip", { signal });
      if (signal?.aborted) return;
      setLeads(response.leads || []);
      setError("");
      setSelectedId(current => current && response.leads.some(item => item.id === current) ? current : response.leads[0]?.id || "");
      setDraft(current => current ? response.leads.find(item => item.id === current.id) || current : response.leads[0] || null);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : tr("Chargement impossible.", "Unable to load leads."));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [tr]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const selected = leads.find(item => item.id === selectedId) || null;
  const visible = useMemo(() => {
    const needle = search.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
    return leads.filter(lead => {
      if (filter === "follow-up" && (!lead.next_follow_up_on || lead.next_follow_up_on > today())) return false;
      if (filter === "telegram" && !lead.telegram) return false;
      if (filter === "whatsapp" && !(lead.telephone && lead.consentement_whatsapp)) return false;
      if (filter !== "all" && filter !== "follow-up" && filter !== "telegram" && filter !== "whatsapp" && (filter === "hot" || filter === "warm" || filter === "cold" ? lead.temperature !== filter : lead.status !== filter)) return false;
      const haystack = [lead.nom, lead.telegram, lead.telephone, lead.broker, lead.compte, lead.serveur].filter(Boolean).join(" ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      return !needle || haystack.includes(needle);
    });
  }, [filter, leads, search]);
  const due = leads.filter(lead => lead.next_follow_up_on && lead.next_follow_up_on <= today() && !["converted", "lost"].includes(lead.status)).length;
  const linked = leads.filter(lead => lead.copy_linked).length;
  const hot = leads.filter(lead => lead.temperature === "hot" && !["converted", "lost"].includes(lead.status)).length;

  function choose(lead: Lead) { setSelectedId(lead.id); setDraft(lead); setNotice(""); }
  function update<K extends keyof Lead>(key: K, value: Lead[K]) { setDraft(current => current ? { ...current, [key]: value } : current); }
  async function save(markContacted = false) {
    if (!draft) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await vipRequest<{ lead: Lead }>("/api/admin/essai-vip", { method: "PATCH", body: JSON.stringify({
        id: draft.id, status: draft.status, temperature: draft.temperature,
        broker_affiliation_verified: draft.broker_affiliation_verified, demo_account_verified: draft.demo_account_verified,
        copy_linked: draft.copy_linked, channel_joined: draft.channel_joined,
        copier_account_reference: draft.copier_account_reference || "", admin_notes: draft.admin_notes,
        next_follow_up_on: draft.next_follow_up_on, ...(markContacted ? { mark_contacted: true, status: draft.status === "new" ? "contacted" : draft.status } : {}),
      }) });
      setLeads(current => current.map(item => item.id === response.lead.id ? response.lead : item));
      setDraft(response.lead);
      setNotice(markContacted ? tr("Contact enregistré.", "Contact recorded.") : tr("Suivi enregistré.", "Follow-up saved."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Enregistrement impossible.", "Unable to save.")); }
    finally { setSaving(false); }
  }

  const input = "w-full rounded-xl border border-white/10 bg-[#0c100f] px-3 py-2.5 text-sm text-white outline-none focus:border-[#F0C575]/70";
  const select = input;
  const card = "rounded-2xl border border-white/[.08] bg-[#101412]";
  if (loading) return <div className="grid min-h-64 place-items-center text-sm text-white/45">{tr("Chargement des demandes Essai VIP…", "Loading VIP trial leads…")}</div>;
  return <div className="space-y-5 pb-10 text-white">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#F0C575]">{tr("Suivi commercial · espace privé", "Sales follow-up · private workspace")}</div><h2 className="mt-2 text-2xl font-semibold">{tr("Demandes Essai VIP", "VIP trial leads")}</h2><p className="mt-1 max-w-2xl text-sm text-white/50">{tr("Qualification, relances et branchement des comptes démo, séparés des demandes et statistiques VIP existantes.", "Qualify, follow up and connect demo accounts, separately from existing VIP requests and statistics.")}</p></div><button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-white/75 hover:border-[#F0C575]/50"><RefreshCw size={14}/>{tr("Actualiser", "Refresh")}</button></div>
    {error && <div role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[{ label: tr("Nouvelles demandes", "New leads"), value: leads.filter(x => x.status === "new").length, Icon: Users }, { label: tr("Prospects chauds", "Hot leads"), value: hot, Icon: Flame }, { label: tr("Relances dues", "Follow-ups due"), value: due, Icon: CalendarClock }, { label: tr("Comptes branchés", "Demo accounts linked"), value: linked, Icon: Signal }].map(item => <div key={item.label} className={`${card} p-4`}><div className="flex items-center justify-between text-xs text-white/45"><span>{item.label}</span><item.Icon size={16} className="text-[#F0C575]"/></div><b className="mt-3 block text-2xl">{item.value}</b></div>)}
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,.9fr)_minmax(0,1.5fr)]">
      <section className={`${card} overflow-hidden`} aria-label={tr("Liste des prospects", "Lead list")}>
        <div className="space-y-3 border-b border-white/[.07] p-4"><label className="relative block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35"/><input className={`${input} pl-9`} value={search} onChange={event => setSearch(event.target.value)} placeholder={tr("Nom, Telegram, téléphone, broker…", "Name, Telegram, phone, broker…")}/></label><select className={select} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{tr("Tous les prospects", "All leads")}</option><option value="follow-up">{tr("Relance à faire", "Follow-up due")}</option><optgroup label={tr("Canal de contact", "Contact channel")}><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option></optgroup><optgroup label={tr("Température", "Temperature")}><option value="hot">{tempFr.hot}</option><option value="warm">{tempFr.warm}</option><option value="cold">{tempFr.cold}</option></optgroup><optgroup label={tr("Étape", "Stage")}>{STATUS.map(value => <option key={value} value={value}>{en ? statusEn[value] : statusFr[value]}</option>)}</optgroup></select></div>
        <div className="max-h-[680px] divide-y divide-white/[.06] overflow-y-auto">{visible.length ? visible.map(lead => <button type="button" key={lead.id} onClick={() => choose(lead)} aria-current={selectedId === lead.id ? "true" : undefined} className={`w-full p-4 text-left transition hover:bg-white/[.03] ${selectedId === lead.id ? "bg-[#F0C575]/[.07]" : ""}`}><div className="flex items-start justify-between gap-3"><span className="font-semibold">{lead.nom}</span><span className={`rounded-full px-2 py-1 text-[10px] ${lead.temperature === "hot" ? "bg-rose-300/15 text-rose-200" : lead.temperature === "warm" ? "bg-amber-200/10 text-amber-100" : lead.temperature === "cold" ? "bg-sky-300/10 text-sky-200" : "bg-white/[.07] text-white/55"}`}>{en ? tempEn[lead.temperature] : tempFr[lead.temperature]}</span></div><div className="mt-2 text-xs text-white/45">{lead.broker} · #{lead.compte}</div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/35"><span>{en ? statusEn[lead.status] : statusFr[lead.status]}</span><span>· {localDate(lead.submitted_at, locale)}</span>{lead.next_follow_up_on && <span className="text-[#F0C575]">· {tr("Relance", "Follow-up")} {localDate(lead.next_follow_up_on, locale)}</span>}</div></button>) : <div className="p-10 text-center text-sm text-white/35">{tr("Aucun prospect ne correspond.", "No matching leads.")}</div>}</div>
      </section>
      {draft ? <section className={`${card} space-y-5 p-4 sm:p-5`} aria-label={tr("Fiche de suivi", "Lead details")}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[.18em] text-white/35">{tr("Fiche prospect", "Lead record")}</div><h3 className="mt-1 text-xl font-semibold">{draft.nom}</h3><p className="mt-1 text-xs text-white/40">{draft.broker} · {tr("demande reçue", "received")} {localDate(draft.submitted_at, locale)}</p></div><a href={contactHref(draft)} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F0C575] px-3 text-xs font-semibold text-[#11130f]">{draft.telephone && draft.consentement_whatsapp ? <MessageCircle size={15}/> : <ExternalLink size={15}/>} {draft.telephone && draft.consentement_whatsapp ? tr("Ouvrir WhatsApp", "Open WhatsApp") : tr("Contacter", "Contact")}</a></div>
        <div className="grid gap-3 rounded-xl border border-white/[.06] bg-black/20 p-3 sm:grid-cols-2"><div><span className="text-[10px] uppercase text-white/35">Telegram</span><div className="mt-1 text-sm">{draft.telegram || "—"}</div></div><div><span className="text-[10px] uppercase text-white/35">{tr("Téléphone", "Phone")}</span><div className="mt-1 flex items-center gap-2 text-sm">{draft.telephone ? <><a className="hover:text-[#F0C575]" href={`tel:${draft.telephone}`}>{draft.telephone}</a>{draft.consentement_whatsapp ? <span className="text-[10px] text-emerald-200">· {tr("accord WhatsApp", "WhatsApp consent")}</span> : null}</> : "—"}</div></div><div><span className="text-[10px] uppercase text-white/35">{tr("Compte démo", "Demo account")}</span><div className="mt-1 text-sm">{draft.compte} <span className="text-white/40">· {draft.serveur}</span></div></div><div><span className="text-[10px] uppercase text-white/35">{tr("Dernier contact", "Last contact")}</span><div className="mt-1 text-sm">{localDate(draft.last_contacted_at, locale)}</div></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs text-white/55">{tr("Étape du suivi", "Follow-up stage")}<select className={select} value={draft.status} onChange={event => update("status", event.target.value as Status)}>{STATUS.map(value => <option key={value} value={value}>{en ? statusEn[value] : statusFr[value]}</option>)}</select></label><label className="space-y-1.5 text-xs text-white/55">{tr("Température commerciale", "Lead temperature")}<select className={select} value={draft.temperature} onChange={event => update("temperature", event.target.value as Temperature)}>{TEMP.map(value => <option key={value} value={value}>{en ? tempEn[value] : tempFr[value]}</option>)}</select></label><label className="space-y-1.5 text-xs text-white/55">{tr("Prochaine relance", "Next follow-up")}<input className={input} type="date" value={draft.next_follow_up_on || ""} onChange={event => update("next_follow_up_on", event.target.value || null)}/></label><label className="space-y-1.5 text-xs text-white/55">{tr("Référence du compte InvestPro Copy", "InvestPro Copy account reference")}<input className={input} value={draft.copier_account_reference || ""} onChange={event => update("copier_account_reference", event.target.value)} placeholder={tr("À saisir après ajout manuel", "Enter after manually adding")}/></label></div>
        <div className="space-y-2 rounded-xl border border-white/[.06] p-3"><div className="text-xs font-medium text-white/75">{tr("Avancement de la demande", "Application progress")}</div>{([["broker_affiliation_verified", tr("Affiliation broker vérifiée", "Broker affiliation verified")], ["demo_account_verified", tr("Compte démo vérifié", "Demo account verified")], ["copy_linked", tr("Compte ajouté à la copie", "Account linked to copier")], ["channel_joined", tr("Canal Telegram rejoint", "Telegram channel joined")]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 py-1 text-xs text-white/60"><input className="accent-[#F0C575]" type="checkbox" checked={draft[key]} onChange={event => update(key, event.target.checked)}/>{label}</label>)}</div>
        <label className="block space-y-1.5 text-xs text-white/55">{tr("Notes internes", "Internal notes")}<textarea className={`${input} resize-y`} rows={4} maxLength={4000} value={draft.admin_notes || ""} onChange={event => update("admin_notes", event.target.value)} placeholder={tr("Intérêt, objectif de dépôt, objections, échange effectué…", "Interest, deposit goal, objections, conversation notes…")}/></label>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void save(false)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F0C575] px-4 text-xs font-semibold text-[#11130f] disabled:opacity-50"><Check size={15}/>{saving ? tr("Enregistrement…", "Saving…") : tr("Enregistrer le suivi", "Save follow-up")}</button><button type="button" disabled={saving} onClick={() => void save(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs text-white/75 disabled:opacity-50"><Phone size={14}/>{tr("Marquer contacté", "Mark contacted")}</button></div>
        <p className="text-[10px] leading-5 text-white/35"><ShieldCheck size={12} className="mr-1 inline-block"/>{tr("Le mot de passe du compte démo n’est pas conservé dans ce suivi. Le numéro sert uniquement au suivi demandé et autorisé.", "The demo account password is not stored in this tracker. The phone number is used only for the requested and consented follow-up.")}</p>
      </section> : <div className={`${card} grid min-h-72 place-items-center p-8 text-sm text-white/35`}>{tr("Sélectionne une demande dans la liste.", "Select a lead from the list.")}</div>}
    </div>
  </div>;
}
