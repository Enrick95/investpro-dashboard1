"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Delivery = { id: string; event_key: string; user_id: string; channel: "email" | "push"; title: string; status: string; attempts: number; last_error: string | null; updated_at: string };

export default function CopierDeliveryFailures() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Delivery[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, [supabase]);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/copier-notification-deliveries", { headers: await headers(), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chargement impossible.");
      setRows(data.deliveries || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chargement impossible."); }
  }, [headers]);

  useEffect(() => { void load(); }, [load]);

  async function retry(row: Delivery) {
    setBusy(row.id); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/copier-notification-deliveries", { method: "POST", headers: { ...(await headers()), "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Relance impossible.");
      setMessage(data.ok ? "Notification envoyée." : `Non envoyée : ${data.reason || "vérifie la configuration"}.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Relance impossible."); }
    finally { setBusy(""); }
  }

  return <section className="mt-6 rounded-2xl border border-amber-500/15 bg-[#11130f] p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><AlertTriangle size={16} className="text-amber-300" /> Suivi des notifications</h2><p className="mt-1 text-xs text-white/45">E-mails et notifications push non envoyés ou ignorés.</p></div>
      <button type="button" onClick={() => void load()} aria-label="Actualiser" className="rounded-lg border border-white/10 p-2 text-white/60"><RefreshCw size={15} /></button>
    </div>
    {error ? <p role="status" className="mt-3 text-xs text-red-300">{error}</p> : null}
    {message ? <p role="status" className="mt-3 text-xs text-emerald-300">{message}</p> : null}
    {!rows.length && !error ? <p className="mt-4 rounded-xl border border-white/[0.06] p-3 text-xs text-white/40">Aucun échec ni envoi ignoré récent.</p> : null}
    <div className="mt-3 space-y-2">{rows.map((row) => <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><div className="text-xs font-semibold text-white/80">{row.title} <span className="ml-1 font-normal text-white/40">· {row.channel === "email" ? "E-mail" : "Push"}</span></div><div className="mt-1 text-[11px] text-amber-200/70">{row.status === "skipped" ? "Ignorée" : "Échec"} · {row.last_error || "raison inconnue"} · {row.attempts} tentative(s)</div><div className="mt-1 break-all text-[10px] text-white/30">{new Date(row.updated_at).toLocaleString("fr-FR")}</div></div>
      <button type="button" disabled={busy === row.id} onClick={() => void retry(row)} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[color:var(--gold-border)] px-3 text-xs font-semibold text-[color:var(--gold)] disabled:opacity-50"><RefreshCw size={13} className={busy === row.id ? "animate-spin" : ""} /> Relancer</button>
    </div>)}</div>
  </section>;
}
