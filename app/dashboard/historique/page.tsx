"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, History, LockKeyhole, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function formatDate(value: string | null) {
  if (!value) return "Aucune date disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Aucune date disponible";
  return date.toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export default function HistoriquePage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data.user) {
          window.location.href = "/login";
          return;
        }
        if (!cancelled) setLastSignInAt(data.user.last_sign_in_at || null);
      } catch {
        if (!cancelled) setLastSignInAt(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
            <History size={19} />
          </span>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">Compte InvestPro</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">Historique & sécurité</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              Consulte la dernière date de connexion connue et accède aux actions de sécurité de ton compte.
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6">
          <div className="flex items-center gap-2 text-white">
            <Activity size={17} className="text-[color:var(--gold)]" />
            <h2 className="text-sm font-semibold">Dernière connexion</h2>
          </div>
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/15 p-4">
            <div className="text-[10px] uppercase tracking-wide text-white/35">Connexion au compte</div>
            <div className="mt-2 text-sm font-semibold text-white">
              {loading ? <Loader2 size={16} className="animate-spin text-[color:var(--gold)]" /> : formatDate(lastSignInAt)}
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-white/40">
            Cette page affiche la dernière connexion connue. Le détail de toutes les anciennes sessions et appareils n’est pas disponible ici.
          </p>
        </section>

        <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6">
          <div className="flex items-center gap-2 text-white">
            <ShieldCheck size={17} className="text-[color:var(--gold)]" />
            <h2 className="text-sm font-semibold">Sécurité du compte</h2>
          </div>
          <p className="mt-3 text-xs leading-5 text-white/45">
            Modifie ton mot de passe, vérifie ton e-mail ou demande la suppression de ton compte depuis les réglages de sécurité.
          </p>
          <Link
            href="/dashboard/compte"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)] no-underline transition hover:bg-[color:var(--gold)]/15 sm:w-auto"
          >
            <LockKeyhole size={14} />
            Ouvrir les réglages de sécurité
            <ArrowRight size={14} />
          </Link>
        </section>
      </div>

      <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="flex items-center gap-2 text-white">
          <Activity size={17} className="text-[color:var(--gold)]" />
          <h2 className="text-sm font-semibold">Journal des activités</h2>
        </div>
        <div className="mt-4 rounded-2xl border border-dashed border-white/[0.10] bg-black/15 px-4 py-7 text-center">
          <p className="text-sm font-semibold text-white">Consulte les événements récents de ton espace</p>
          <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-white/40">
            Retrouve les trades, connexions, comptes et échanges de support dans le centre d’activité.
          </p>
          <Link href="/dashboard/activite" className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)] no-underline hover:bg-[color:var(--gold-soft)]/80">
            Ouvrir le centre d’activité
            <ArrowRight size={13} />
          </Link>
        </div>
      </section>
    </div>
  );
}
