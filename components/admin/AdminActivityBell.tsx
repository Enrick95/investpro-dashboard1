"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ChevronRight, Loader2, RefreshCw, X } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import s from "./AdminActivityBell.module.css";

type AdminNotice = { id: string; title: string; message: string; href: string; read_at: string | null; created_at: string };

export function adminActivityDestination(value: unknown): string | null {
  if (typeof value !== "string" || /[\u0000-\u0020]/.test(value) || !value.startsWith("/dashboard/admin?")) return null;
  try {
    const url = new URL(value, "https://investprotrading.fr");
    const keys = [...url.searchParams.keys()];
    const view = url.searchParams.get("view");
    if (url.origin !== "https://investprotrading.fr" || url.pathname !== "/dashboard/admin" || url.hash || keys.length !== 2 || !keys.includes("tool") || !keys.includes("view") || url.searchParams.get("tool") !== "vip" || (view !== "requests" && view !== "members")) return null;
    return `/dashboard/admin?tool=vip&view=${view}`;
  } catch { return null; }
}

export function adminActivityNotices(value: unknown): AdminNotice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(row => {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || !row.id.trim() || row.id.length > 100 || typeof row.title !== "string" || !row.title.trim() || typeof row.message !== "string" || typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at)) || (row.read_at !== null && (typeof row.read_at !== "string" || !Number.isFinite(Date.parse(row.read_at))))) return [];
    const href = adminActivityDestination(row.href);
    return href ? [{ id: row.id, title: row.title, message: row.message, href, read_at: row.read_at, created_at: row.created_at }] : [];
  });
}

/** Mounted only after the administration's server authorization gate. */
export default function AdminActivityBell({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { locale } = useLocale();
  const tr = (fr: string, en: string) => locale === "en" ? en : fr;
  const [notices, setNotices] = useState<AdminNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"fetch" | "mark" | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const activeFetch = useRef<AbortController | null>(null);
  const activeMark = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (activeMark.current) return;
    activeFetch.current?.abort();
    const controller = new AbortController(); activeFetch.current = controller;
    try {
      const response = await fetch("/api/notifications", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setNotices([]);
        throw new Error("unavailable");
      }
      const payload = await response.json();
      if (mounted.current && !controller.signal.aborted) { setNotices(adminActivityNotices(payload?.notifications)); setError(null); }
    } catch {
      if (mounted.current && !controller.signal.aborted) setError("fetch");
    } finally { if (mounted.current && !controller.signal.aborted) setLoading(false); }
  }, []);

  // Fetches are cancellable; notification permission is never requested by this component.
  useEffect(() => {
    mounted.current = true;
    // State updates occur only after the cancellable network request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { mounted.current = false; window.clearInterval(interval); window.removeEventListener("focus", refresh); activeFetch.current?.abort(); activeMark.current?.abort(); };
  }, [load]);

  async function visit(notice: AdminNotice) {
    const destination = adminActivityDestination(notice.href);
    if (!destination || marking) return;
    setError(null);
    if (!notice.read_at) {
      activeFetch.current?.abort();
      const controller = new AbortController(); activeMark.current = controller; setMarking(notice.id);
      try {
        const response = await fetch("/api/notifications", { method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: notice.id }), signal: controller.signal });
        if (!response.ok) throw new Error("mark_failed");
        if (!mounted.current || controller.signal.aborted) return;
        setNotices(current => current.map(row => row.id === notice.id ? { ...row, read_at: new Date().toISOString() } : row));
      } catch {
        if (mounted.current && !controller.signal.aborted) setError("mark");
        return;
      } finally { activeMark.current = null; if (mounted.current && !controller.signal.aborted) setMarking(null); }
    }
    modal.current?.close(); onNavigate(destination);
  }

  const unread = notices.filter(notice => !notice.read_at).length;
  const date = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return <div className={s.root}>
    <button type="button" className={s.bell} onClick={() => { modal.current?.showModal(); void load(); }} aria-label={tr(`Alertes administrateur, ${unread} non lues`, `Admin alerts, ${unread} unread`)}>
      <Bell size={17} aria-hidden="true" /><span>{tr("Mes alertes admin", "My admin alerts")}</span>{unread > 0 && <b className={s.count}>{unread}</b>}
    </button>
    <dialog ref={modal} className={s.dialog} aria-labelledby="admin-activity-title" onClick={event => { if (event.target === event.currentTarget) modal.current?.close(); }}>
      <div className={s.panel}>
        <header className={s.header}><div><span>{tr("INVESTPRO · ADMINISTRATION", "INVESTPRO · ADMINISTRATION")}</span><h2 id="admin-activity-title">{tr("Vos dernières alertes VIP", "Your latest VIP alerts")}</h2></div><button type="button" className={s.iconButton} onClick={() => modal.current?.close()} aria-label={tr("Fermer les alertes", "Close alerts")}><X size={20} aria-hidden="true" /></button></header>
        <div className={s.toolbar}><p><CheckCheck size={15} aria-hidden="true" />{tr(`${unread} non lue${unread > 1 ? "s" : ""}`, `${unread} unread`)}</p><button type="button" className={s.refresh} onClick={() => void load()}><RefreshCw size={14} aria-hidden="true" />{tr("Actualiser", "Refresh")}</button></div>
        {error && <p role="alert" className={s.error}>{error === "mark" ? tr("Impossible de marquer cette alerte comme lue. Réessayez.", "Could not mark this alert as read. Try again.") : tr("Les alertes sont momentanément indisponibles. Actualisez pour réessayer.", "Alerts are temporarily unavailable. Refresh to try again.")}</p>}
        {loading ? <p className={s.empty} role="status"><Loader2 size={20} className={s.spinner} aria-hidden="true" />{tr("Chargement des alertes…", "Loading alerts…")}</p> : error === "fetch" && !notices.length ? <p className={s.empty}>{tr("Actualisez pour retrouver vos alertes.", "Refresh to load your alerts.")}</p> : !notices.length ? <div className={s.empty}><Bell size={25} aria-hidden="true" /><h3>{tr("Aucune alerte VIP pour le moment", "No VIP alerts yet")}</h3><p>{tr("Les nouvelles demandes et décisions apparaîtront ici.", "New applications and decisions will appear here.")}</p></div> : <ul className={s.list}>{notices.map(notice => <li key={notice.id}><button type="button" className={`${s.notice} ${!notice.read_at ? s.unread : ""}`} disabled={marking !== null} onClick={() => void visit(notice)}><span className={s.dot} aria-hidden="true" /><span className={s.noticeCopy}><strong>{notice.title}</strong><span>{notice.message}</span><time dateTime={notice.created_at}>{date.format(new Date(notice.created_at))}{!notice.read_at ? ` · ${tr("Non lue", "Unread")}` : ""}</time></span>{marking === notice.id ? <Loader2 size={17} className={s.spinner} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}</button></li>)}</ul>}
      </div>
    </dialog>
  </div>;
}
