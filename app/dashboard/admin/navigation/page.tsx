"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Menu, RefreshCw, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Definition = { key: string; label: string; href: string; group: string; defaultVisible: boolean; order: number };

export default function AdminNavigationPage() {
  const supabase = useMemo(() => createClient(), []);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/navigation", { headers: await authHeaders(), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Chargement impossible.");
      setDefinitions(data.definitions || []);
      setVisibility(data.visibility || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function toggle(item: Definition) {
    const next = !visibility[item.key];
    setSaving(item.key); setError("");
    try {
      const response = await fetch("/api/admin/navigation", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ key: item.key, visible: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Modification impossible.");
      setVisibility((current) => ({ ...current, [item.key]: next }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification impossible.");
    } finally { setSaving(null); }
  }

  const groups = Array.from(new Set(definitions.map((item) => item.group)));

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[color:var(--gold)]">
              <Menu size={13}/> Navigation InvestPro
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-white">Gestion du menu</h1>
            <p className="mt-1 text-sm text-[color:var(--muted)]">Affiche ou masque une rubrique sur desktop, mobile et dans l’accès direct.</p>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.03] px-4 py-2 text-sm text-white/70">
            <RefreshCw size={14}/> Actualiser
          </button>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-red-500/20 bg-red-500/[.06] px-4 py-3 text-sm text-red-300">{error}</div> : null}

      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center text-sm text-[color:var(--muted)]"><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Chargement…</div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group} className="overflow-hidden rounded-[22px] border border-white/[.07] bg-[color:var(--panel)]">
              <div className="border-b border-white/[.06] px-5 py-4 text-xs font-bold tracking-[.14em] text-[color:var(--gold)]">{group}</div>
              <div className="divide-y divide-white/[.05]">
                {definitions.filter((item) => item.group === group).sort((a,b)=>a.order-b.order).map((item) => {
                  const visible = visibility[item.key] !== false;
                  const locked = ["dashboard", "profile"].includes(item.key);
                  return (
                    <div key={item.key} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold text-white">
                          {visible ? <Eye size={14} className="text-emerald-400"/> : <EyeOff size={14} className="text-white/35"/>}
                          {item.label}
                        </div>
                        <div className="mt-1 truncate text-[10px] text-white/35">{item.href}</div>
                      </div>
                      <button
                        type="button"
                        disabled={locked || saving === item.key}
                        onClick={() => void toggle(item)}
                        className={`relative h-7 w-12 rounded-full border transition ${visible ? "border-emerald-500/25 bg-emerald-500/15" : "border-white/10 bg-white/[.04]"} disabled:cursor-not-allowed disabled:opacity-45`}
                        aria-label={`${visible ? "Masquer" : "Afficher"} ${item.label}`}
                      >
                        <span className={`absolute top-[3px] h-5 w-5 rounded-full transition ${visible ? "left-[23px] bg-emerald-400" : "left-[3px] bg-white/35"}`}/>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4 text-xs leading-5 text-white/55">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[color:var(--gold)]"/>
        Une rubrique masquée disparaît du menu desktop et du menu mobile. Son URL directe affiche également un écran d’indisponibilité. Dashboard et Profil restent toujours accessibles.
      </div>
    </div>
  );
}
