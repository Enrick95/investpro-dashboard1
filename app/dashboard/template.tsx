"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  FileText,
  ChevronRight,
  Clock3,
  LineChart,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import NotificationEngine from "@/components/NotificationEngine";
import MobileGlobalV1 from "@/components/MobileGlobalV1";
import InstallAppExperience from "@/components/InstallAppExperience";
import NewMemberJourney from "@/components/NewMemberJourney";
import PremiumEmptyStateGuide from "@/components/PremiumEmptyStateGuide";
import SmartDashboardInsights from "@/components/intelligence/SmartDashboardInsights";

type Trade = {
  id: number;
  trade_date: string;
  symbol: string;
  result_amount: number | null;
  result_r: number | null;
  status: string;
  risk_percent: number | null;
};

type Plan = {
  max_risk_percent: number;
};

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [accountsCount, setAccountsCount] = useState(0);
  const [journeyHidden, setJourneyHidden] = useState(false);
  const [appInstalled, setAppInstalled] = useState(false);

  const isHome = pathname === "/dashboard";

  useEffect(() => {
    if (!isHome) return;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const [tradesResult, planResult, accountsResult] = await Promise.all([
        supabase
          .from("trading_journal")
          .select("id, trade_date, symbol, result_amount, result_r, status, risk_percent")
          .eq("user_id", user.id)
          .order("trade_date", { ascending: true }),

        supabase
          .from("trading_plans")
          .select("max_risk_percent")
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase
          .from("trading_accounts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

      if (!tradesResult.error) {
        setTrades((tradesResult.data as Trade[]) || []);
      }

      if (!planResult.error && planResult.data) {
        setPlan({
          max_risk_percent: Number(planResult.data.max_risk_percent || 0),
        });
      }

      if (!accountsResult.error) {
        setAccountsCount(Number(accountsResult.count || 0));
      }
    }

    load();
  }, [isHome, supabase]);


  useEffect(() => {
    if (!isHome) return;

    const hideLegacyHero = () => {
      const nodes = Array.from(document.querySelectorAll("h1, h2, h3, div, span"));
      const titleNode = nodes.find((node) =>
        node.textContent?.replace(/\s+/g, " ").trim().startsWith("Bienvenue dans ton espace InvestPro")
      );

      const section = titleNode?.closest("section");
      if (section instanceof HTMLElement) {
        section.dataset.investproLegacyHeroHidden = "1";
        section.style.display = "none";
      }
    };

    const timer = window.setTimeout(hideLegacyHero, 250);
    return () => window.clearTimeout(timer);
  }, [isHome]);

  useEffect(() => {
    if (!isHome) return;

    const routes: Record<string, string> = {
      "Capital total": "/dashboard/comptes",
      "P&L du mois": "/dashboard/rapports",
      Winrate: "/dashboard/rapports",
      "Risque moyen": "/dashboard/plan",
      "Trades du mois": "/dashboard/journal",
    };

    const timer = window.setTimeout(() => {
      const candidates = Array.from(document.querySelectorAll("div"));

      Object.entries(routes).forEach(([label, href]) => {
        const labelNode = candidates.find(
          (node) => node.textContent?.trim() === label
        );

        const card = labelNode?.closest(".group");
        if (!(card instanceof HTMLElement)) return;
        if (card.dataset.investproV3Linked === "1") return;

        card.dataset.investproV3Linked = "1";
        card.dataset.ipHomeKpi = "true";
        if (label === "Capital total") {
          card.dataset.ipCapitalKpi = "true";
        }
        card.parentElement?.setAttribute("data-ip-home-kpi-grid", "true");
        card.style.cursor = "pointer";
        card.setAttribute("role", "link");
        card.setAttribute("tabindex", "0");

        const go = () => router.push(href);

        card.addEventListener("click", go);
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            go();
          }
        });
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [isHome, router]);


  useEffect(() => {
    if (!isHome || onboardingChecked) return;

    async function checkOnboarding() {
      try {
        const completed =
          window.localStorage.getItem("investpro_onboarding_completed") === "1";
        const skipped =
          window.localStorage.getItem("investpro_onboarding_skipped") === "1";

        if (completed || skipped) {
          setOnboardingChecked(true);
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setOnboardingChecked(true);
          return;
        }

        const [accountsResult, planResult, tradesResult] = await Promise.all([
          supabase
            .from("trading_accounts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),

          supabase
            .from("trading_plans")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle(),

          supabase
            .from("trading_journal")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);

        const accountDone = Number(accountsResult.count || 0) > 0;
        const planDone = !!planResult.data;
        const tradeDone = Number(tradesResult.count || 0) > 0;

        // L'onboarding reste actif jusqu'à la dernière étape, sauf si l'utilisateur le passe.
        // Pour les comptes existants déjà configurés avant cette V1, on ne force pas l'onboarding.
        if (accountDone && planDone && tradeDone) {
          window.localStorage.setItem("investpro_onboarding_completed", "1");
          setOnboardingChecked(true);
          return;
        }

        router.replace("/dashboard/onboarding");
      } catch (error) {
        console.error("Erreur onboarding :", error);
        setOnboardingChecked(true);
      }
    }

    checkOnboarding();
  }, [isHome, onboardingChecked, router, supabase]);


  useEffect(() => {
    if (!isHome) return;

    const hidden =
      window.localStorage.getItem("investpro_new_member_journey_hidden") === "1";
    setJourneyHidden(hidden);

    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    setAppInstalled(Boolean(standalone));
  }, [isHome]);

  function hideJourney() {
    window.localStorage.setItem("investpro_new_member_journey_hidden", "1");
    setJourneyHidden(true);
  }

  const analytics = useMemo(() => {
    const closed = trades.filter((trade) =>
      ["win", "loss", "breakeven"].includes(trade.status)
    );

    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;

    const curve = closed.map((trade, index) => {
      cumulative += Number(trade.result_amount || 0);
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.min(maxDrawdown, cumulative - peak);

      return {
        index,
        value: cumulative,
      };
    });

    const wins = closed.filter((t) => Number(t.result_amount || 0) > 0);
    const losses = closed.filter((t) => Number(t.result_amount || 0) < 0);

    const grossWin = wins.reduce(
      (sum, t) => sum + Number(t.result_amount || 0),
      0
    );
    const grossLoss = Math.abs(
      losses.reduce((sum, t) => sum + Number(t.result_amount || 0), 0)
    );

    const profitFactor =
      grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? grossWin : 0;

    const riskKnown = closed.filter((t) => Number(t.risk_percent || 0) > 0);
    const riskRespect =
      riskKnown.length && plan?.max_risk_percent
        ? (riskKnown.filter(
            (t) =>
              Number(t.risk_percent || 0) <= Number(plan.max_risk_percent || 0)
          ).length /
            riskKnown.length) *
          100
        : null;

    return {
      curve,
      profitFactor,
      maxDrawdown,
      riskRespect,
      totalPnl: cumulative,
    };
  }, [trades, plan]);



  const todaySummary = useMemo(() => {
    const now = new Date();
    const todayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const todayTrades = trades.filter((trade) => {
      if (!trade.trade_date) return false;
      const value = new Date(trade.trade_date);
      if (Number.isNaN(value.getTime())) return String(trade.trade_date).slice(0, 10) === todayKey;
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(value);
      return key === todayKey;
    });

    const closed = todayTrades.filter((trade) =>
      ["win", "loss", "breakeven"].includes(trade.status)
    );
    const wins = closed.filter((trade) => Number(trade.result_amount || 0) > 0).length;
    const losses = closed.filter((trade) => Number(trade.result_amount || 0) < 0).length;
    const pnl = closed.reduce((sum, trade) => sum + Number(trade.result_amount || 0), 0);
    const riskAlerts = plan?.max_risk_percent
      ? todayTrades.filter(
          (trade) => Number(trade.risk_percent || 0) > Number(plan.max_risk_percent || 0)
        ).length
      : 0;

    let status = "Session calme";
    let tone: "neutral" | "good" | "warn" = "neutral";

    if (riskAlerts > 0) {
      status = `${riskAlerts} alerte${riskAlerts > 1 ? "s" : ""} risque`;
      tone = "warn";
    } else if (closed.length && pnl > 0) {
      status = "Session positive";
      tone = "good";
    } else if (losses >= 2) {
      status = "Discipline prioritaire";
      tone = "warn";
    } else if (todayTrades.length) {
      status = "Session en cours";
    }

    return {
      count: todayTrades.length,
      closed: closed.length,
      wins,
      losses,
      pnl,
      riskAlerts,
      status,
      tone,
    };
  }, [trades, plan]);

  return (
    <>
      {isHome && !journeyHidden ? (
        <NewMemberJourney
          accountDone={accountsCount > 0}
          planDone={!!plan}
          tradeDone={trades.length > 0}
          appDone={appInstalled}
          onDismiss={hideJourney}
        />
      ) : null}


      {isHome ? (
        <section className="ip-daily-pulse mb-5 overflow-hidden rounded-[24px] border border-white/[0.07] bg-[color:var(--panel)]">
          <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr]">
            <div className="relative p-4 md:p-5">
              <div className="pointer-events-none absolute -left-14 -top-20 h-56 w-56 rounded-full bg-[color:var(--gold)] opacity-[0.055] blur-[70px]" />
              <div className="relative">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
                    <Clock3 size={11} />
                    Aujourd’hui
                  </span>
                  <span
                    className={[
                      "rounded-full border px-2.5 py-1 text-[9px] font-semibold",
                      todaySummary.tone === "good"
                        ? "border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-400"
                        : todaySummary.tone === "warn"
                        ? "border-amber-500/20 bg-amber-500/[0.05] text-amber-300"
                        : "border-white/[0.07] bg-black/20 text-white/40",
                    ].join(" ")}
                  >
                    {todaySummary.status}
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Pulse de session</h2>
                    <p className="mt-1 max-w-xl text-[10px] leading-5 text-[color:var(--muted)]">
                      Un résumé instantané pour savoir où tu en es avant de reprendre une position.
                    </p>
                  </div>

                  <Link
                    href="/dashboard/journal"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-[color:var(--gold)]"
                  >
                    Ouvrir le journal
                    <ChevronRight size={12} />
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-t border-white/[0.05] bg-white/[0.04] sm:grid-cols-4 xl:border-l xl:border-t-0">
              <PulseMetric label="Trades" value={String(todaySummary.count)} />
              <PulseMetric label="Wins / Loss" value={`${todaySummary.wins} / ${todaySummary.losses}`} />
              <PulseMetric
                label="P&L jour"
                value={`${todaySummary.pnl > 0 ? "+" : ""}${todaySummary.pnl.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}`}
                tone={todaySummary.pnl > 0 ? "good" : todaySummary.pnl < 0 ? "bad" : "neutral"}
              />
              <PulseMetric
                label="Alertes risque"
                value={String(todaySummary.riskAlerts)}
                tone={todaySummary.riskAlerts > 0 ? "warn" : "good"}
              />
            </div>
          </div>
        </section>
      ) : null}

      {isHome ? <SmartDashboardInsights /> : null}

      {isHome ? (
        <section className="mb-5 rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
                <LineChart size={11} />
                Dashboard V4
              </div>
              <h2 className="mt-3 text-lg font-semibold text-white">
                Analyse rapide
              </h2>
              <p className="mt-1 text-[10px] text-[color:var(--muted)]">
                Tes raccourcis Journal, Rapports et Discipline réunis sur l’accueil.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              <QuickLink
                href="/dashboard/journal"
                icon={<BookOpen size={14} />}
                label="Journal"
              />
              <QuickLink
                href="/dashboard/rapports"
                icon={<BarChart3 size={14} />}
                label="Rapports"
              />
              <QuickLink
                href="/dashboard/plan"
                icon={<ShieldCheck size={14} />}
                label="Discipline"
              />
              <QuickLink
                href="/dashboard/comptes"
                icon={<Target size={14} />}
                label="Comptes"
              />
              <QuickLink
                href="/dashboard/rapport-mensuel"
                icon={<FileText size={14} />}
                label="Bilan mensuel"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4 lg:col-span-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.08em] text-white/30">
                    Mini equity curve
                  </div>
                  <div
                    className={[
                      "mt-1 text-lg font-semibold",
                      analytics.totalPnl > 0
                        ? "text-emerald-400"
                        : analytics.totalPnl < 0
                        ? "text-red-400"
                        : "text-white",
                    ].join(" ")}
                  >
                    {analytics.totalPnl > 0 ? "+" : ""}
                    {analytics.totalPnl.toLocaleString("fr-FR", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    $US
                  </div>
                </div>

                <Link
                  href="/dashboard/rapports"
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-[color:var(--gold)]"
                >
                  Analyse complète
                  <ChevronRight size={12} />
                </Link>
              </div>

              <MiniCurve values={analytics.curve.map((point) => point.value)} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-5">
              <MiniMetric
                icon={<TrendingUp size={15} />}
                label="Profit Factor"
                value={
                  analytics.profitFactor
                    ? analytics.profitFactor.toFixed(2)
                    : "—"
                }
              />
              <MiniMetric
                icon={<BarChart3 size={15} />}
                label="Drawdown max"
                value={`${analytics.maxDrawdown.toLocaleString("fr-FR", {
                  maximumFractionDigits: 0,
                })} $`}
              />
              <MiniMetric
                icon={<ShieldCheck size={15} />}
                label="Risque respecté"
                value={
                  analytics.riskRespect == null
                    ? "N/D"
                    : `${Math.round(analytics.riskRespect)}%`
                }
              />
            </div>
          </div>
        </section>
      ) : null}

      <NotificationEngine />
      <MobileGlobalV1 />
      <InstallAppExperience />
      <PremiumEmptyStateGuide />
      {children}
    </>
  );
}

function QuickLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-w-[112px] items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 text-[10px] font-semibold text-white/70 transition hover:border-[color:var(--gold-border)] hover:text-white"
    >
      <span className="inline-flex items-center gap-2">
        <span className="text-[color:var(--gold)]">{icon}</span>
        {label}
      </span>
      <ChevronRight size={12} className="text-white/25" />
    </Link>
  );
}

function MiniMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
      <div className="text-[color:var(--gold)]">{icon}</div>
      <div className="mt-3 text-[9px] text-white/35">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}


function PulseMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
      ? "text-red-400"
      : tone === "warn"
      ? "text-amber-300"
      : "text-white";

  return (
    <div className="bg-[color:var(--panel)] p-4 xl:min-h-[118px] xl:p-5">
      <div className="text-[8px] uppercase tracking-[0.1em] text-white/25">{label}</div>
      <div className={`mt-2 text-lg font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function MiniCurve({ values }: { values: number[] }) {
  if (!values.length) {
    return (
      <div className="mt-4 flex h-[92px] items-center justify-center rounded-xl border border-dashed border-white/[0.07] text-[9px] text-white/25">
        La courbe apparaîtra avec tes trades clôturés.
      </div>
    );
  }

  const width = 800;
  const height = 100;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  const points = values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="mt-4 h-[92px] overflow-hidden rounded-xl border border-white/[0.05] bg-black/20">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke="rgba(242,199,91,.95)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
