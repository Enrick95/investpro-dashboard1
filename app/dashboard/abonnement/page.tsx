"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { getCurrentAccount } from "../../../lib/authStore";

import {
  Check,
  X as XIcon,
  Sparkles,
  Crown,
  Zap,
  HelpCircle,
  ChevronDown,
  CreditCard,
  Lock,
  BadgeCheck,
  Calendar,
  Timer,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

type PlanId = "free" | "pro" | "elite";
type BillingCycle = "monthly" | "yearly";

type CompareKey =
  | "calendar"
  | "tradingview"
  | "riskCalculator"
  | "journal"
  | "reports"
  | "terminal"
  | "copier"
  | "support";

type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  recommended?: boolean;
  icon: React.ReactNode;
  monthlyPrice: number; // 0 for free
  yearlyPrice: number; // total / year
  highlights: string[];
  compare: Record<CompareKey, boolean>;
};

type FaqItem = {
  q: string;
  a: string;
  icon: React.ReactNode;
};

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function formatEuro(n: number) {
  if (n === 0) return "0€";
  return (
    n.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "€"
  );
}

/** fade-in on scroll */
function useInViewOnce<T extends HTMLElement>(opts?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "40px", ...(opts || {}) }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [shown, opts]);

  return { ref, shown };
}

const COMPARE_ROWS: Array<{ key: CompareKey; label: string }> = [
  { key: "calendar", label: "Calendrier économique" },
  { key: "tradingview", label: "Intégration TradingView" },
  { key: "riskCalculator", label: "Calculateur de risques" },
  { key: "journal", label: "Journal de trading" },
  { key: "reports", label: "Rapports avancés" },
  { key: "terminal", label: "Terminal de trading" },
  { key: "copier", label: "Copieur de trades" },
  { key: "support", label: "Support prioritaire" },
];

export default function AbonnementsPage() {
  const [mounted, setMounted] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  useEffect(() => {
    setMounted(true);
    try {
      setIsLogged(!!getCurrentAccount());
    } catch {
      setIsLogged(false);
    }

    try {
      const saved = localStorage.getItem("ip_billing_cycle");
      if (saved === "monthly" || saved === "yearly") setCycle(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("ip_billing_cycle", cycle);
    } catch {}
  }, [cycle]);

  const plans: Plan[] = useMemo(
    () => [
      {
        id: "free",
        name: "Free",
        tagline: "Découvre InvestPro et commence à tracker.",
        monthlyPrice: 0,
        yearlyPrice: 0,
        highlights: [
          "Journal de trading (base)",
          "Calendrier économique intégré",
          "TradingView + calculateur de risque",
        ],
        compare: {
          journal: true,
          calendar: true,
          tradingview: true,
          riskCalculator: true,
          reports: false,
          terminal: false,
          copier: false,
          support: false,
        },
        icon: <Sparkles size={18} className="text-[color:var(--gold)]" />,
      },
      {
        id: "pro",
        name: "Pro",
        tagline: "Pour trader sérieusement et progresser vite.",
        monthlyPrice: 19.9,
        yearlyPrice: 190.0, // ~ -20%
        highlights: [
          "Rapports avancés (RR, PF, streaks…)",
          "Terminal de trading (gestion + prévisualisation)",
          "Sauvegardes / exports + notifications avancées",
        ],
        compare: {
          journal: true,
          calendar: true,
          tradingview: true,
          riskCalculator: true,
          reports: true,
          terminal: true,
          copier: false, // ✅ réservé Elite
          support: false,
        },
        recommended: true,
        icon: <Crown size={18} className="text-[color:var(--gold)]" />,
      },
      {
        id: "elite",
        name: "Elite",
        tagline: "Pour performer et scaler (team / prop).",
        monthlyPrice: 49.9,
        yearlyPrice: 479.0, // ~ -20%
        highlights: [
          "Copieur de trades (multi-comptes) + risk manager",
          "Support prioritaire + accès nouveautés en premier",
          "Tout Pro + outils premium (progressivement)",
        ],
        compare: {
          journal: true,
          calendar: true,
          tradingview: true,
          riskCalculator: true,
          reports: true,
          terminal: true,
          copier: true,
          support: true,
        },
        icon: <Zap size={18} className="text-[color:var(--gold)]" />,
      },
    ],
    []
  );

  const faqs: FaqItem[] = useMemo(
    () => [
      {
        q: "Je peux annuler quand je veux ?",
        a: "Oui. Tu peux annuler à tout moment. Ton accès reste actif jusqu’à la fin de la période.",
        icon: <HelpCircle size={16} className="text-[color:var(--muted)]" />,
      },
      {
        q: "Le paiement est sécurisé ?",
        a: "Oui. Les paiements sont gérés via un prestataire sécurisé (type Stripe) quand la partie billing est branchée.",
        icon: <Lock size={16} className="text-[color:var(--muted)]" />,
      },
      {
        q: "Mensuel vs Annuel : c’est quoi la diff ?",
        a: "Annuel = meilleur prix (réduction). Mensuel = plus flexible. Tu peux changer quand tu veux.",
        icon: <Calendar size={16} className="text-[color:var(--muted)]" />,
      },
    ],
    []
  );

  const ctaHref = mounted ? (isLogged ? "/dashboard/abonnement" : "/login") : "/login";

  const hero = useInViewOnce<HTMLDivElement>();
  const faqIn = useInViewOnce<HTMLDivElement>();

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      {/* HERO */}
      <div
        ref={hero.ref}
        className={cx(
          "transition-all duration-500 ease-out",
          hero.shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        )}
      >
        <Card>
          <CardBody className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="text-2xl md:text-3xl font-semibold">💳 Abonnements InvestPro</div>
              <div className="text-sm text-muted">
                1 plan gratuit + 2 plans premium. Simple, clair, efficace.
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[color:var(--border)] bg-[color:var(--panel-2)]">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  Paiement sécurisé
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[color:var(--border)] bg-[color:var(--panel-2)]">
                  <CreditCard size={14} className="text-[color:var(--gold)]" />
                  Annulation facile
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[color:var(--border)] bg-[color:var(--panel-2)]">
                  <Timer size={14} className="text-[color:var(--muted)]" />
                  Upgrade instant
                </span>
              </div>
            </div>

            <div className="flex flex-col items-stretch md:items-end gap-3">
              <CycleSwitch cycle={cycle} onChange={setCycle} />

              <div className="flex gap-2">
                <Link href={ctaHref}>
                  <Button>
                    Gérer mon abonnement <ArrowRight size={16} className="ml-2" />
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="ghost">Retour dashboard</Button>
                </Link>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* PLANS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p, idx) => (
          <PlanCard key={p.id} plan={p} cycle={cycle} ctaHref={ctaHref} delayMs={idx * 90} />
        ))}
      </div>

      {/* FAQ */}
      <div
        ref={faqIn.ref}
        className={cx(
          "transition-all duration-500 ease-out",
          faqIn.shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        )}
      >
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <HelpCircle size={18} className="text-[color:var(--muted)]" />
              <div className="text-lg font-semibold">FAQ</div>
              <div className="text-xs text-muted">Questions rapides</div>
            </div>

            <div className="space-y-2">
              {faqs.map((f, idx) => (
                <FaqRow key={idx} item={f} />
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <style>{`
        .ip-glow{
          background: radial-gradient(60% 60% at 50% 50%, rgba(255,200,90,.22), rgba(0,0,0,0));
        }
        .ip-reco{
          border: 1px solid rgba(255,200,90,.25);
          box-shadow: 0 0 0 1px rgba(255,200,90,.12) inset;
        }
        .ip-badge{
          position: relative;
          overflow: hidden;
        }
        .ip-badge:after{
          content:"";
          position:absolute;
          top:-40%;
          left:-60%;
          width:40%;
          height:180%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
          transform: rotate(18deg);
          animation: ipShine 2.8s ease-in-out infinite;
        }
        @keyframes ipShine{
          0%{ transform: translateX(0) rotate(18deg); opacity:.0; }
          20%{ opacity:.6; }
          60%{ opacity:.0; }
          100%{ transform: translateX(320%) rotate(18deg); opacity:0; }
        }
      `}</style>
    </div>
  );
}

function CycleSwitch({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange: (c: BillingCycle) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 p-1 rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel-2)]">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={cx(
          "px-3 h-9 rounded-xl text-xs font-semibold transition border",
          cycle === "monthly"
            ? "border-[color:var(--gold-border)] bg-[color:var(--panel)] text-[color:var(--text)]"
            : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--text)]"
        )}
      >
        Mensuel
      </button>

      <button
        type="button"
        onClick={() => onChange("yearly")}
        className={cx(
          "px-3 h-9 rounded-xl text-xs font-semibold transition border flex items-center gap-2",
          cycle === "yearly"
            ? "border-[color:var(--gold-border)] bg-[color:var(--panel)] text-[color:var(--text)]"
            : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--text)]"
        )}
      >
        Annuel
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
          -20%
        </span>
      </button>
    </div>
  );
}

function PlanCard({
  plan,
  cycle,
  ctaHref,
  delayMs,
}: {
  plan: Plan;
  cycle: BillingCycle;
  ctaHref: string;
  delayMs: number;
}) {
  const { ref, shown } = useInViewOnce<HTMLDivElement>();

  const price = cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;

  const priceLabel = plan.id === "free" ? "0€" : formatEuro(price);

  const periodLabel =
    plan.id === "free" ? "" : cycle === "monthly" ? "/mois" : "/an";

  const subLabel =
    plan.id === "free"
      ? "Parfait pour commencer"
      : cycle === "yearly"
      ? "Meilleur prix sur l’année"
      : "Flexible, sans engagement long";

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delayMs}ms` }}
      className={cx(
        "relative transition-all duration-500 ease-out",
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      )}
    >
      {plan.recommended ? (
        <div className="pointer-events-none absolute -inset-0.5 rounded-3xl opacity-70 blur-xl ip-glow" />
      ) : null}

      <Card>
        <CardBody
          className={cx(
            "relative rounded-3xl transition",
            "hover:-translate-y-1 hover:shadow-2xl",
            plan.recommended ? "ip-reco" : ""
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--panel-2)] flex items-center justify-center">
                  {plan.icon}
                </span>
                <div className="text-lg font-semibold">{plan.name}</div>
              </div>

              <div className="text-xs text-muted mt-2">{plan.tagline}</div>
            </div>

            {plan.recommended ? (
              <span className="ip-badge text-[10px] px-2 py-0.5 rounded-full font-bold border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
                Recommandé
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex items-end gap-2">
            <div className="text-3xl font-bold text-[color:var(--text)]">
              {priceLabel}
            </div>
            <div className="text-xs text-muted mb-1">{periodLabel}</div>
          </div>

          <div className="mt-1 text-[11px] text-muted">{subLabel}</div>

          {/* Highlights */}
          <div className="mt-4">
            <CardSubCard>
              <div className="space-y-2">
                {plan.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Check size={16} className="mt-0.5 text-emerald-400" />
                    <span className="text-[color:var(--text)]">{h}</span>
                  </div>
                ))}
              </div>
            </CardSubCard>
          </div>

          {/* Mini comparaison */}
          <div className="mt-3">
            <CardSubCard>
              <div className="flex items-center gap-2 mb-2">
                <BadgeCheck size={16} className="text-[color:var(--muted)]" />
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  Comparaison rapide
                </div>
              </div>

              <div className="space-y-1.5">
                {COMPARE_ROWS.map((r) => {
                  const ok = plan.compare[r.key];
                  return (
                    <div key={r.key} className="flex items-center justify-between gap-3">
                      <div className="text-xs text-[color:var(--muted)]">{r.label}</div>
                      <div className="shrink-0">
                        {ok ? (
                          <Check size={16} className="text-emerald-400" />
                        ) : (
                          <XIcon size={16} className="text-rose-400" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardSubCard>
          </div>

          <div className="mt-4 flex gap-2">
            <Link href={ctaHref} className="w-full">
              <Button className="w-full" variant={plan.recommended ? "primary" : "ghost"}>
                Choisir {plan.name}
              </Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function FaqRow({ item }: { item: { q: string; a: string; icon: React.ReactNode } }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[color:var(--panel-2)] transition text-left"
      >
        <span className="w-9 h-9 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] flex items-center justify-center">
          {item.icon}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[color:var(--text)]">{item.q}</div>
        </div>

        <ChevronDown
          size={18}
          className={cx(
            "text-[color:var(--muted)] transition-transform duration-200",
            open ? "rotate-180" : "rotate-0"
          )}
        />
      </button>

      <div
        className={cx(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden px-4 pb-4">
          <div className="text-sm text-[color:var(--muted)] leading-relaxed">{item.a}</div>
        </div>
      </div>
    </div>
  );
}
