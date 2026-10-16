"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import StaffMemberPicker, { staffMatches, type StaffMember } from "@/components/admin/StaffMemberPicker";
import { createClient } from "@/lib/supabase/client";
import s from "@/components/admin/StaffTeam.module.css";

const definitions = [
  ["overview", "Tableau de bord", "Dashboard"], ["users", "Consulter les membres", "View members"], ["users_write", "Modifier les membres", "Manage members"],
  ["moderation", "Modération", "Moderation"], ["inbox", "Consulter les messages", "View messages"], ["inbox_write", "Traiter les messages", "Manage messages"],
  ["copier", "Voir les demandes InvestPro Copier (données sensibles)", "View InvestPro Copier requests (sensitive data)"], ["copier_write", "Gérer InvestPro Copier", "Manage InvestPro Copier"],
  ["announcements_write", "Envoyer des annonces aux membres", "Send member announcements"], ["finance", "Finances", "Finance"], ["analytics", "Statistiques", "Statistics"],
  ["feedback", "Consulter les avis", "View feedback"], ["feedback_write", "Gérer les avis", "Manage feedback"], ["system", "Système / maintenance", "System / maintenance"], ["navigation", "Modifier la navigation", "Manage navigation"],
] as const;
type Item = { user_id: string; permissions: string[]; enabled: boolean; updated_at: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function StaffPage() {
  const { locale } = useLocale();
  const english = locale === "en";
  const tr = useCallback((fr: string, en: string) => english ? en : fr, [english]);
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[]>([]);
  const [member, setMember] = useState<StaffMember | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<StaffMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const searchController = useRef<AbortController | null>(null);
  const headers = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error(tr("Connexion requise", "Sign in required"));
    return { Authorization: "Bearer " + data.session.access_token };
  }, [supabase, tr]);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/admin/staff", { headers: await headers(), cache: "no-store", signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || tr("Chargement impossible", "Could not load the team"));
    return (data.items || []) as Item[];
  }, [headers, tr]);
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal).then(nextItems => { if (!controller.signal.aborted) setItems(nextItems); }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : tr("Chargement impossible", "Could not load the team")); });
    return () => { controller.abort(); searchController.current?.abort(); };
  }, [reload, tr]);
  function clearMember() {
    searchController.current?.abort(); setMember(null); setSelected([]); setEnabled(true); setMatches([]); setQuery(""); setSearched(false); setSearching(false); setSearchError(""); setError(""); setInfo("");
  }
  function changeQuery(value: string) {
    searchController.current?.abort(); setQuery(value); setMatches([]); setSearched(false); setSearching(false); setSearchError("");
  }
  async function search() {
    if (query.trim().length < 2 || saving) return;
    searchController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    setSearching(true); setSearched(false); setSearchError(""); setMatches([]);
    try {
      const response = await fetch("/api/admin/staff?search=" + encodeURIComponent(query.trim()), { headers: await headers(), cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || tr("Recherche impossible", "Search failed"));
      if (!controller.signal.aborted) { setMatches(staffMatches(data.matches)); setSearched(true); }
    } catch (cause: unknown) { if (!controller.signal.aborted) setSearchError(cause instanceof Error ? cause.message : tr("Recherche impossible", "Search failed")); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  }
  function choose(match: StaffMember) {
    if (match.is_owner || saving) return;
    searchController.current?.abort();
    const current = items.find(item => item.user_id === match.user_id);
    setMember(match); setSelected(current?.permissions || []); setEnabled(current?.enabled ?? true); setMatches([]); setSearched(false); setSearching(false); setError(""); setInfo("");
  }
  function chooseExisting(item: Item) { choose({ user_id: item.user_id, name: item.user_id, email: "", is_owner: false }); }
  async function save() {
    if (!member || member.is_owner || saving || !uuid.test(member.user_id)) return;
    setError(""); setInfo(""); setSaving(true);
    try {
      const response = await fetch("/api/admin/staff", { method: "POST", headers: { ...(await headers()), "Content-Type": "application/json" }, body: JSON.stringify({ user_id: member.user_id, permissions: selected, enabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || tr("Enregistrement impossible", "Could not save permissions"));
      setInfo(tr("Permissions enregistrées pour " + member.name + ".", "Permissions saved for " + member.name + "."));
      setItems(await reload());
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : tr("Enregistrement impossible", "Could not save permissions")); }
    finally { setSaving(false); }
  }
  return <div className={s.page}>
    <header className={s.heading}><h2>{tr("Gestion de l’équipe", "Team management")}</h2><p className={s.hint}>{tr("Choisissez un compte InvestPro, puis les rubriques que cette personne pourra gérer.", "Select an InvestPro account, then choose which sections they can manage.")}</p></header>
    {error ? <p className={s.error} role="alert">{error}</p> : null}
    {info ? <p className={s.success} role="status">{info}</p> : null}
    <section className={s.panel} aria-label={tr("Accès de l’équipe", "Team access")}>
      <StaffMemberPicker english={english} query={query} matches={matches} member={member} searching={searching} searched={searched} error={searchError} disabled={saving} onQuery={changeQuery} onSearch={() => void search()} onChoose={choose} onClear={clearMember} />
      <fieldset className={s.permissions} disabled={!member || saving}><legend>{tr("Droits d’administration", "Administration permissions")}</legend>
        <p className={s.hint}>{tr("Pour gérer les demandes et publications VIP, cochez « Consulter les membres » et « Modifier les membres ».", "To manage VIP requests and posts, select “View members” and “Manage members”.")}</p>
        <div className={s.permissionsGrid}>{definitions.map(([key, fr, en]) => <label key={key} className={s.checkbox}><input type="checkbox" checked={selected.includes(key)} onChange={event => setSelected(previous => event.target.checked ? [...previous, key] : previous.filter(value => value !== key))} />{tr(fr, en)}</label>)}</div>
      </fieldset>
      <div className={s.actions}><label className={s.checkbox}><input type="checkbox" checked={enabled} disabled={!member || saving} onChange={event => setEnabled(event.target.checked)} />{tr("Accès actif", "Access enabled")}</label>
        <button type="button" disabled={saving || !member || member.is_owner || (enabled && selected.length === 0)} onClick={() => void save()} className={s.primary}>{saving ? tr("Enregistrement…", "Saving…") : tr("Enregistrer les permissions", "Save permissions")}</button>
        <p className={s.hint}>{tr("Pour retirer l’accès, sélectionnez le membre, décochez « Accès actif » et enregistrez. La gestion de l’équipe reste réservée au propriétaire.", "To remove access, select the member, uncheck “Access enabled” and save. Team management remains owner-only.")}</p>
      </div>
    </section>
    <section className={s.authorized}><h3>{tr("Membres autorisés", "Authorized team members")}</h3>{items.length ? items.map(item => <button key={item.user_id} type="button" disabled={saving} onClick={() => chooseExisting(item)} className={s.staffEntry}><span>{item.user_id}<br /><small>{item.permissions.length} {tr("permission(s)", "permission(s)")}</small></span><span>{item.enabled ? tr("Activé", "Enabled") : tr("Désactivé", "Disabled")}</span></button>) : <p className={s.hint}>{tr("Les membres de votre équipe apparaîtront ici après l’enregistrement de leurs droits.", "Your team members will appear here after their permissions are saved.")}</p>}</section>
  </div>;
}
