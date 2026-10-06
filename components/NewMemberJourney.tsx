"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Circle,
  ClipboardCheck,
  MonitorSmartphone,
  Sparkles,
  WalletCards,
  BookOpen,
  BarChart3,
  X,
} from "lucide-react";

type Props = {
  accountDone: boolean;
  planDone: boolean;
  tradeDone: boolean;
  appDone: boolean;
  onDismiss?: () => void;
};

const STEPS = [
  {
    key: "account",
    title: "Ajouter un compte",
    text: "Ajoute un compte CFD ou Futures pour centraliser ton suivi.",
    href: "/dashboard/comptes",
    cta: "Ajouter",
    icon: WalletCards,
  },
  {
    key: "plan",
    title: "Configurer ton plan",
    text: "Définis ton risque, tes sessions et tes règles de discipline.",
    href: "/dashboard/plan",
    cta: "Configurer",
    icon: ClipboardCheck,
  },
  {
    key: "trade",
    title: "Ajouter ton premier trade",
    text: "Ton journal débloque ensuite tes statistiques et rapports.",
    href: "/dashboard/journal",
    cta: "Ouvrir le journal",
    icon: BookOpen,
  },
  {
    key: "app",
    title: "Installer InvestPro",
    text: "Ajoute InvestPro à ton écran d’accueil pour l’utiliser comme une app.",
    href: "/dashboard/profil",
    cta: "Voir le guide",
    icon: MonitorSmartphone,
  },
] as const;

export default function NewMemberJourney({
  accountDone,
  planDone,
  tradeDone,
  appDone,
  onDismiss,
}: Props) {
  const doneMap = {
    account: accountDone,
    plan: planDone,
    trade: tradeDone,
    app: appDone,
  };

  const completed = Object.values(doneMap).filter(Boolean).length;
  const percent = Math.round((completed / STEPS.length) * 100);

  if (completed === STEPS.length) return null;

  return (
    <section className="mb-5 overflow-hidden rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)]">
      <div className="border-b border-white/[0.06] p-4 md:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
              <Sparkles size={11} />
              Commence ici
            </div>

            <h2 className="mt-3 text-lg font-semibold text-white">
              Configure ton espace InvestPro
            </h2>

            <p className="mt-1 max-w-2xl text-[10px] leading-5 text-[color:var(--muted)]">
              Quelques étapes suffisent pour débloquer une expérience complète :
              comptes, discipline, journal, statistiques et accès mobile.
            </p>
          </div>

          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-white/35 transition hover:text-white"
              aria-label="Masquer"
            >
              <X size={15} />
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full bg-[color:var(--gold)] transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="shrink-0 text-[10px] font-semibold text-[color:var(--gold)]">
            {completed}/{STEPS.length} · {percent}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px bg-white/[0.05] md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((step) => {
          const done = doneMap[step.key];
          const Icon = step.icon;

          return (
            <div
              key={step.key}
              className="bg-[color:var(--panel)] p-4 md:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={[
                    "grid h-10 w-10 place-items-center rounded-xl border",
                    done
                      ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400"
                      : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
                  ].join(" ")}
                >
                  {done ? <Check size={17} /> : <Icon size={17} />}
                </div>

                <span
                  className={[
                    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[8px] font-bold uppercase",
                    done
                      ? "border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-400"
                      : "border-white/[0.07] bg-black/20 text-white/30",
                  ].join(" ")}
                >
                  {done ? <Check size={9} /> : <Circle size={8} />}
                  {done ? "Terminé" : "À faire"}
                </span>
              </div>

              <div className="mt-4 text-[12px] font-semibold text-white">
                {step.title}
              </div>

              <p className="mt-1 min-h-[40px] text-[9px] leading-4 text-white/35">
                {step.text}
              </p>

              {done ? (
                <div className="mt-4 inline-flex items-center gap-2 text-[9px] font-semibold text-emerald-400">
                  <Check size={12} />
                  Étape complétée
                </div>
              ) : (
                <Link
                  href={step.href}
                  className="mt-4 inline-flex items-center gap-1.5 text-[9px] font-semibold text-[color:var(--gold)] no-underline"
                >
                  {step.cta}
                  <ArrowRight size={11} />
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {tradeDone ? (
        <div className="flex flex-col gap-3 border-t border-white/[0.06] bg-black/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
          <div className="flex items-center gap-2 text-[9px] text-white/38">
            <BarChart3 size={13} className="text-[color:var(--gold)]" />
            Tes premières données sont prêtes à être analysées.
          </div>

          <Link
            href="/dashboard/rapports"
            className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-[color:var(--gold)]"
          >
            Voir mes rapports
            <ArrowRight size={11} />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
