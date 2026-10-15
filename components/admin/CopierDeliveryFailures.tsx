"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { AlertTriangle, Archive, ArchiveRestore, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Delivery = {
  id: string;
  event_key: string;
  user_id: string;
  channel: "email" | "push";
  title: string;
  status: string;
  attempts: number;
  last_error: string | null;
  updated_at: string;
};

export default function CopierDeliveryFailures() {
  const { t: tr, locale } = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Delivery[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, [supabase]);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/admin/copier-notification-deliveries${showArchived ? "?archived=1" : ""}`, {
        headers: await headers(),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || tr("Chargement impossible."));
      setRows(data.deliveries || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Chargement impossible."));
    }
  }, [headers, showArchived, tr]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(action: "retry" | "archive" | "restore" | "archive_all", row?: Delivery) {
    setBusy(row?.id || action);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/copier-notification-deliveries", {
        method: "POST",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(row ? { id: row.id } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || tr("Mise à jour impossible."));

      if (action === "retry") {
        setMessage(data.ok ? tr("Notification envoyée.") : (tr("Non envoyée : ") + (data.reason || tr("vérifie la configuration")) + "."));
      } else if (action === "archive_all") {
        setMessage(tr("Les notifications visibles ont été archivées."));
      } else {
        setMessage(action === "archive" ? tr("Notification archivée.") : tr("Notification restaurée."));
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Mise à jour impossible."));
    } finally {
      setBusy("");
    }
  }

  const isBusy = Boolean(busy);

  return (
    <section className="mt-6 rounded-2xl border border-amber-500/15 bg-[#11130f] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <AlertTriangle size={16} className="text-amber-300" />{tr("Suivi des notifications")}<span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">{rows.length}</span>
          </h2>
          <p className="mt-1 text-xs text-white/45">{tr("Les envois ignorés sont classés automatiquement dans l’historique. Archive les échecs traités pour vider cette liste ; ils restent consultables.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!showArchived && rows.length > 0 ? (
            <button type="button" disabled={isBusy} onClick={() => void mutate("archive_all")} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-white/60 disabled:opacity-50">
              <Archive size={14} />{tr(" Tout archiver")}</button>
          ) : null}
          <button type="button" onClick={() => setShowArchived((value) => !value)} className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-white/60">
            {showArchived ? tr("Voir les notifications") : tr("Historique")}
          </button>
          <button type="button" onClick={() => void load()} aria-label={tr("Actualiser")} className="rounded-lg border border-white/10 p-2 text-white/60">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {error ? <p role="status" className="mt-3 text-xs text-red-300">{tr(error)}</p> : null}
      {message ? <p role="status" className="mt-3 text-xs text-emerald-300">{message}</p> : null}
      {!rows.length && !error ? (
        <p className="mt-4 rounded-xl border border-white/[0.06] p-3 text-xs text-white/40">
          {showArchived ? tr("Aucune notification archivée.") : tr("Aucun échec ni envoi ignoré récent.")}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white/80">
                {row.title} <span className="ml-1 font-normal text-white/40">· {row.channel === "email" ? "E-mail" : "Push"}</span>
              </div>
              <div className="mt-1 text-[11px] text-amber-200/70">{row.status === "skipped" ? tr("Ignorée") : tr("Échec")} · {row.last_error || tr("raison inconnue")} · {row.attempts}{tr(" tentative(s)")}</div>
              <div className="mt-1 break-all text-[10px] text-white/30">{new Date(row.updated_at).toLocaleString((locale === "en" ? "en-US" : "fr-FR"))}</div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {!showArchived ? (
                <button type="button" disabled={busy === row.id} onClick={() => void mutate("retry", row)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[color:var(--gold-border)] px-3 text-xs font-semibold text-[color:var(--gold)] disabled:opacity-50">
                  <RefreshCw size={13} className={busy === row.id ? "animate-spin" : ""} />{tr(" Relancer")}</button>
              ) : null}
              <button type="button" disabled={isBusy} onClick={() => void mutate(showArchived ? "restore" : "archive", row)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-white/60 disabled:opacity-50">
                {showArchived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                {showArchived ? "Restaurer" : "Archiver"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
