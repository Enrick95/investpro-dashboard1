"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Check, RefreshCw, ShieldAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Removal = {
  id: string; status: string; admin_note: string | null; created_at: string;
  account: { alias: string; platform: string; login: string; server: string; broker: string };
  member: { username: string; email: string };
};

export default function CopierMasterRemovalRequests() {
  const { t: tr, locale } = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Removal[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, [supabase]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/copier-master-removals", { headers: await headers(), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || tr("Chargement impossible."));
      setRows(data.requests || []);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Chargement impossible.")); }
  }, [headers, tr]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 20_000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function process(row: Removal, status: "completed" | "rejected") {
    if (status === "completed" && !window.confirm(tr("Confirme que ce Master a déjà été retiré du moteur de copie. La liaison InvestPro sera ensuite supprimée."))) return;
    setBusy(row.id); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/copier-master-removals", {
        method: "PATCH", headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status, admin_note: notes[row.id] || "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || tr("Mise à jour impossible."));
      setSuccess(status === "completed" ? tr("Retrait confirmé et client notifié.") : tr("Demande refusée et client notifié."));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Mise à jour impossible.")); }
    finally { setBusy(""); }
  }

  const pending = rows.filter((row) => ["pending", "processing"].includes(row.status));
  return <section className="mt-6 rounded-2xl border border-amber-500/15 bg-[#11130f] p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldAlert size={16} className="text-amber-300" />{tr(" Demandes de retrait Master ")}<span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">{pending.length}</span></h2><p className="mt-1 text-xs text-white/45">{tr("Confirme le retrait seulement après l’avoir effectué dans le moteur de copie.")}</p></div>
      <button type="button" onClick={() => void load()} aria-label={tr("Actualiser")} className="rounded-lg border border-white/10 p-2 text-white/60"><RefreshCw size={15} /></button>
    </div>
    {error ? <p role="status" className="mt-3 text-xs text-red-300">{tr(error)}</p> : null}
    {success ? <p role="status" className="mt-3 text-xs text-emerald-300">{tr(success)}</p> : null}
    {!pending.length && !error ? <p className="mt-4 rounded-xl border border-white/[0.06] p-3 text-xs text-white/40">{tr("Aucune demande de retrait en attente.")}</p> : null}
    <div className="mt-3 space-y-2">{pending.map((row) => <article key={row.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0"><div className="text-xs font-semibold text-white">{row.account.alias} · {row.account.platform} {row.account.login}</div><div className="mt-1 text-[11px] text-white/50">{row.member.username}{row.member.email ? ` · ${row.member.email}` : ""} · {row.account.server}</div><div className="mt-1 text-[10px] text-white/35">{tr("Reçue le ")}{new Date(row.created_at).toLocaleString((locale === "en" ? "en-US" : "fr-FR"))}</div></div>
        <div className="flex shrink-0 flex-wrap gap-2"><button type="button" disabled={busy === row.id} onClick={() => void process(row, "completed")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-400 px-3 text-[11px] font-semibold text-black disabled:opacity-50"><Check size={14} />{tr(" Confirmer le retrait effectué")}</button><button type="button" disabled={busy === row.id} onClick={() => void process(row, "rejected")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-400/20 px-3 text-[11px] font-semibold text-red-200 disabled:opacity-50"><X size={14} />{tr(" Refuser")}</button></div>
      </div>
      <label className="mt-3 block text-[10px] text-white/45">{tr("Motif facultatif, visible par le client en cas de refus")}<textarea value={notes[row.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))} rows={2} maxLength={240} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-amber-400/40" placeholder={tr("Ex. le compte est encore utilisé par une copie active.")} /></label>
    </article>)}</div>
  </section>;
}
