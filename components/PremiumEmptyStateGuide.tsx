"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  LineChart,
  Plus,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type State = {
  loading: boolean;
  accounts: number;
  trades: number;
};

export default function PremiumEmptyStateGuide() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<State>({
    loading: true,
    accounts: 0,
    trades: 0,
  });

  const relevant =
    pathname === "/dashboard/comptes" ||
    pathname === "/dashboard/journal" ||
    pathname === "/dashboard/rapports";

  useEffect(() => {
    if (!relevant) return;

    let cancelled = false;

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || cancelled) return;

        const [accountsResult, tradesResult] = await Promise.all([
          supabase
            .from("trading_accounts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),

          supabase
            .from("trading_journal")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);

        if (cancelled) return;

        setState({
          loading: false,
          accounts: Number(accountsResult.count || 0),
          trades: Number(tradesResult.count || 0),
        });
      } catch (error) {
        console.error("InvestPro empty states:", error);

        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
          }));
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [pathname, relevant, supabase]);

  if (!relevant || state.loading) return null;

  if (pathname === "/dashboard/comptes" && state.accounts === 0) {
    return (
      <PremiumState
        eyebrow="PREMIÈRE ÉTAPE"
        icon={<WalletCards size={21} />}
        title="Ajoute ton premier compte de trading"
        text="Centralise ton capital et prépare ton espace pour le Journal, les rapports et la synchronisation CFD & Futures."
        primary={{
          label: "Ajouter mon premier compte",
          href: "/dashboard/comptes#ajouter-compte",
        }}
        secondary={{
          label: "Voir les connexions",
          href: "/dashboard/connexions",
        }}
        bullets={[
          "Compte réel, démo ou prop firm",
          "CFD & Futures",
          "Compatible avec le suivi multi-comptes",
        ]}
      />
    );
  }

  if (pathname === "/dashboard/journal" && state.trades === 0) {
    return (
      <PremiumState
        eyebrow="TON JOURNAL EST PRÊT"
        icon={<BookOpen size={21} />}
        title="Ajoute ton premier trade"
        text={
          state.accounts > 0
            ? "Ton compte est prêt. Enregistre maintenant un premier trade pour débloquer tes statistiques, ta discipline et tes analyses."
            : "Commence par ajouter un compte ou enregistre directement un trade manuel pour lancer ton suivi InvestPro."
        }
        primary={{
          label: "Ajouter un trade",
          href: "/dashboard/journal#ajouter-trade",
        }}
        secondary={{
          label: state.accounts > 0 ? "Configurer mon plan" : "Ajouter un compte",
          href: state.accounts > 0 ? "/dashboard/plan" : "/dashboard/comptes",
        }}
        bullets={[
          "Calcul automatique des statistiques",
          "Contrôle du risque et de la discipline",
          "Rapports débloqués dès les premières données",
        ]}
      />
    );
  }

  if (pathname === "/dashboard/rapports" && state.trades === 0) {
    return (
      <PremiumState
        eyebrow="ANALYTICS INVESTPRO"
        icon={<BarChart3 size={21} />}
        title="Tes rapports se construisent à partir de ton Journal"
        text="Dès ton premier trade clôturé, InvestPro commencera à calculer ton winrate, Profit Factor, courbe d’équité, drawdown et tes performances par actif."
        primary={{
          label: "Ajouter mon premier trade",
          href: "/dashboard/journal",
        }}
        secondary={{
          label: "Configurer mon plan",
          href: "/dashboard/plan",
        }}
        bullets={[
          "Winrate, P&L et Profit Factor",
          "Courbe d’équité & drawdown",
          "Analyse par actif, session et setup",
        ]}
        reports
      />
    );
  }

  return null;
}

function PremiumState({
  eyebrow,
  icon,
  title,
  text,
  primary,
  secondary,
  bullets,
  reports = false,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  title: string;
  text: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  bullets: string[];
  reports?: boolean;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)]">
      <div className="relative p-5 md:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[color:var(--gold)] opacity-[0.05] blur-[70px]" />

        <div className="relative z-10 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-semibold tracking-[0.12em] text-[color:var(--gold)]">
              <Sparkles size={11} />
              {eyebrow}
            </div>

            <div className="mt-4 flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
                {icon}
              </div>

              <div>
                <h2 className="text-lg font-semibold text-white md:text-xl">
                  {title}
                </h2>

                <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[color:var(--muted)]">
                  {text}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Link
                href={primary.href}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 text-[11px] font-semibold text-black no-underline transition hover:bg-[color:var(--gold-2)]"
              >
                <Plus size={14} />
                {primary.label}
                <ArrowRight size={13} />
              </Link>

              <Link
                href={secondary.href}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-4 text-[11px] font-semibold text-white/65 no-underline transition hover:border-[color:var(--gold-border)] hover:text-white"
              >
                {secondary.label}
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5">
            {reports ? <ReportsPreview /> : <FeaturePreview bullets={bullets} />}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturePreview({ bullets }: { bullets: string[] }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/28">
        Ce que tu vas débloquer
      </div>

      <div className="mt-4 space-y-3">
        {bullets.map((item) => (
          <div key={item} className="flex items-center gap-3">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-400">
              <CheckCircle2 size={13} />
            </div>
            <span className="text-[10px] text-white/55">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsPreview() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[8px] uppercase tracking-[0.12em] text-white/25">
            Aperçu analytics
          </div>
          <div className="mt-1 text-[11px] font-semibold text-white">
            Tes données apparaîtront ici
          </div>
        </div>
        <LineChart size={18} className="text-[color:var(--gold)]" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {["Winrate", "Profit Factor", "Drawdown"].map((label) => (
          <div
            key={label}
            className="rounded-xl border border-white/[0.05] bg-black/20 p-3"
          >
            <div className="text-[7px] text-white/25">{label}</div>
            <div className="mt-2 text-sm font-semibold text-white/35">—</div>
          </div>
        ))}
      </div>

      <div className="mt-3 h-[58px] overflow-hidden rounded-xl border border-white/[0.05] bg-black/15 p-2">
        <svg viewBox="0 0 300 50" className="h-full w-full">
          <path
            d="M0 40 C40 38, 55 30, 85 33 S130 22, 160 25 S205 16, 235 19 S275 12,300 8"
            fill="none"
            stroke="rgba(232,194,102,.38)"
            strokeWidth="2"
            strokeDasharray="5 5"
          />
        </svg>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[8px] text-white/25">
        <ShieldCheck size={11} className="text-[color:var(--gold)]" />
        Aucune fausse statistique n’est affichée avant tes données.
      </div>
    </div>
  );
}
