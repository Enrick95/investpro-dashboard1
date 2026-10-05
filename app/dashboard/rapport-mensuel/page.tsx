"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Gauge,
  LineChart,
  Loader2,
  Medal,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Trade = {
  id: number;
  trade_date: string;
  symbol: string;
  direction: "buy" | "sell";
  result_amount: number | null;
  result_r: number | null;
  status: "open" | "win" | "loss" | "breakeven" | "cancelled";
  risk_percent: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  setup: string | null;
  session: string | null;
  timeframe: string | null;
};

type TradingPlan = {
  max_risk_percent: number;
  minimum_rr: number;
  allowed_sessions: string[];
  allowed_assets: string[];
  allowed_setups: string[];
};

type Checklist = {
  is_completed: boolean | null;
  created_at: string | null;
};

type MonthReport = {
  trades: Trade[];
  pnl: number;
  wins: number;
  losses: number;
  breakeven: number;
  winrate: number;
  profitFactor: number | null;
  maxDrawdown: number;
  avgWin: number;
  avgLoss: number;
  avgR: number | null;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  bestAsset: { label: string; pnl: number; trades: number } | null;
  worstAsset: { label: string; pnl: number; trades: number } | null;
  bestSession: { label: string; pnl: number; trades: number } | null;
  bestSetup: { label: string; pnl: number; trades: number } | null;
  bestWeekday: { label: string; pnl: number; trades: number } | null;
  equity: number[];
  compliant: number;
  nonCompliant: number;
  disciplineScore: number | null;
};

const WEEKDAYS = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

function monthStart(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1);
}

function nextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function previousMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

function money(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} $US`;
}

function normalizeAsset(value: string | null | undefined) {
  const clean = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  return clean === "GOLD" ? "XAUUSD" : clean;
}

function normalizeSession(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace("newyork", "new york");
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function calculateRR(trade: Trade) {
  if (
    trade.entry_price == null ||
    trade.stop_loss == null ||
    trade.take_profit == null
  ) {
    return null;
  }

  const risk = Math.abs(Number(trade.entry_price) - Number(trade.stop_loss));
  const reward = Math.abs(Number(trade.take_profit) - Number(trade.entry_price));

  return risk > 0 ? reward / risk : null;
}

function isCompliant(trade: Trade, plan: TradingPlan | null) {
  if (!plan) return null;

  const checks: boolean[] = [];

  const risk = Number(trade.risk_percent || 0);
  if (risk > 0) {
    checks.push(risk <= Number(plan.max_risk_percent || 0));
  }

  const rr = calculateRR(trade);
  if (rr != null) {
    checks.push(rr >= Number(plan.minimum_rr || 0));
  }

  if (plan.allowed_assets?.length) {
    checks.push(
      plan.allowed_assets.map(normalizeAsset).includes(normalizeAsset(trade.symbol))
    );
  }

  if (plan.allowed_sessions?.length && trade.session) {
    checks.push(
      plan.allowed_sessions
        .map(normalizeSession)
        .includes(normalizeSession(trade.session))
    );
  }

  if (plan.allowed_setups?.length && trade.setup) {
    checks.push(
      plan.allowed_setups.map(normalizeText).includes(normalizeText(trade.setup))
    );
  }

  return checks.length ? checks.every(Boolean) : null;
}

function aggregate(
  trades: Trade[],
  getKey: (trade: Trade) => string | null
) {
  const map = new Map<string, { pnl: number; trades: number }>();

  for (const trade of trades) {
    const key = getKey(trade);
    if (!key) continue;

    const current = map.get(key) || { pnl: 0, trades: 0 };
    current.pnl += Number(trade.result_amount || 0);
    current.trades += 1;
    map.set(key, current);
  }

  return Array.from(map.entries()).map(([label, value]) => ({
    label,
    ...value,
  }));
}

function computeReport(
  trades: Trade[],
  plan: TradingPlan | null,
  checklistScore: number | null
): MonthReport {
  const closed = trades.filter((trade) =>
    ["win", "loss", "breakeven"].includes(trade.status)
  );

  const wins = closed.filter((t) => Number(t.result_amount || 0) > 0);
  const losses = closed.filter((t) => Number(t.result_amount || 0) < 0);
  const breakeven = closed.filter((t) => Number(t.result_amount || 0) === 0);

  const pnl = closed.reduce(
    (sum, trade) => sum + Number(trade.result_amount || 0),
    0
  );

  const grossWin = wins.reduce(
    (sum, trade) => sum + Number(trade.result_amount || 0),
    0
  );
  const grossLoss = Math.abs(
    losses.reduce((sum, trade) => sum + Number(trade.result_amount || 0), 0)
  );

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equity = closed
    .slice()
    .sort(
      (a, b) =>
        new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime()
    )
    .map((trade) => {
      cumulative += Number(trade.result_amount || 0);
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.min(maxDrawdown, cumulative - peak);
      return cumulative;
    });

  const resultRs = closed
    .map((trade) => Number(trade.result_r))
    .filter((value) => Number.isFinite(value) && value !== 0);

  const byAsset = aggregate(closed, (trade) => normalizeAsset(trade.symbol));
  const bySession = aggregate(closed, (trade) =>
    trade.session ? trade.session : null
  );
  const bySetup = aggregate(closed, (trade) => (trade.setup ? trade.setup : null));
  const byWeekday = aggregate(closed, (trade) => {
    const date = new Date(trade.trade_date);
    return WEEKDAYS[date.getDay()];
  });

  const sortedBest = (rows: { label: string; pnl: number; trades: number }[]) =>
    [...rows].sort((a, b) => b.pnl - a.pnl);
  const sortedWorst = (rows: { label: string; pnl: number; trades: number }[]) =>
    [...rows].sort((a, b) => a.pnl - b.pnl);

  const compliance = closed
    .map((trade) => ({ trade, value: isCompliant(trade, plan) }))
    .filter((item) => item.value !== null);

  const compliant = compliance.filter((item) => item.value === true).length;
  const nonCompliant = compliance.filter((item) => item.value === false).length;

  const ruleScore = compliance.length
    ? (compliant / compliance.length) * 100
    : null;

  const disciplineScore =
    ruleScore != null && checklistScore != null
      ? Math.round((ruleScore + checklistScore) / 2)
      : ruleScore != null
      ? Math.round(ruleScore)
      : checklistScore != null
      ? Math.round(checklistScore)
      : null;

  return {
    trades: closed,
    pnl,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winrate: closed.length ? (wins.length / closed.length) * 100 : 0,
    profitFactor:
      grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? grossWin : null,
    maxDrawdown,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    avgR: resultRs.length
      ? resultRs.reduce((a, b) => a + b, 0) / resultRs.length
      : null,
    bestTrade: closed.length
      ? [...closed].sort(
          (a, b) => Number(b.result_amount || 0) - Number(a.result_amount || 0)
        )[0]
      : null,
    worstTrade: closed.length
      ? [...closed].sort(
          (a, b) => Number(a.result_amount || 0) - Number(b.result_amount || 0)
        )[0]
      : null,
    bestAsset: byAsset.length ? sortedBest(byAsset)[0] : null,
    worstAsset: byAsset.length ? sortedWorst(byAsset)[0] : null,
    bestSession: bySession.length ? sortedBest(bySession)[0] : null,
    bestSetup: bySetup.length ? sortedBest(bySetup)[0] : null,
    bestWeekday: byWeekday.length ? sortedBest(byWeekday)[0] : null,
    equity,
    compliant,
    nonCompliant,
    disciplineScore,
  };
}

export default function MonthlyReportPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [trades, setTrades] = useState<Trade[]>([]);
  const [plan, setPlan] = useState<TradingPlan | null>(null);
  const [checklists, setChecklists] = useState<Checklist[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
          return;
        }

        const start = previousMonth(selectedMonth);
        const end = nextMonth(selectedMonth);

        const [tradesResult, planResult, checklistResult] = await Promise.all([
          supabase
            .from("trading_journal")
            .select(
              `
                id,
                trade_date,
                symbol,
                direction,
                result_amount,
                result_r,
                status,
                risk_percent,
                entry_price,
                stop_loss,
                take_profit,
                setup,
                session,
                timeframe
              `
            )
            .eq("user_id", user.id)
            .gte("trade_date", start.toISOString())
            .lt("trade_date", end.toISOString())
            .order("trade_date", { ascending: true }),

          supabase
            .from("trading_plans")
            .select(
              "max_risk_percent, minimum_rr, allowed_sessions, allowed_assets, allowed_setups"
            )
            .eq("user_id", user.id)
            .maybeSingle(),

          supabase
            .from("trade_checklists")
            .select("is_completed, created_at")
            .eq("user_id", user.id)
            .gte("created_at", selectedMonth.toISOString())
            .lt("created_at", nextMonth(selectedMonth).toISOString()),
        ]);

        setTrades((tradesResult.data as Trade[]) || []);

        if (planResult.data) {
          setPlan({
            max_risk_percent: Number(planResult.data.max_risk_percent || 0),
            minimum_rr: Number(planResult.data.minimum_rr || 0),
            allowed_sessions: Array.isArray(planResult.data.allowed_sessions)
              ? planResult.data.allowed_sessions
              : [],
            allowed_assets: Array.isArray(planResult.data.allowed_assets)
              ? planResult.data.allowed_assets
              : [],
            allowed_setups: Array.isArray(planResult.data.allowed_setups)
              ? planResult.data.allowed_setups
              : [],
          });
        } else {
          setPlan(null);
        }

        setChecklists((checklistResult.data as Checklist[]) || []);
      } catch (error) {
        console.error("Erreur rapport mensuel :", error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [selectedMonth, supabase]);

  const currentTrades = useMemo(
    () =>
      trades.filter((trade) => {
        const date = new Date(trade.trade_date);
        return (
          date.getFullYear() === selectedMonth.getFullYear() &&
          date.getMonth() === selectedMonth.getMonth()
        );
      }),
    [trades, selectedMonth]
  );

  const previousTrades = useMemo(() => {
    const prev = previousMonth(selectedMonth);
    return trades.filter((trade) => {
      const date = new Date(trade.trade_date);
      return (
        date.getFullYear() === prev.getFullYear() &&
        date.getMonth() === prev.getMonth()
      );
    });
  }, [trades, selectedMonth]);

  const checklistScore = useMemo(() => {
    if (!checklists.length) return null;
    return (
      (checklists.filter((item) => item.is_completed).length /
        checklists.length) *
      100
    );
  }, [checklists]);

  const report = useMemo(
    () => computeReport(currentTrades, plan, checklistScore),
    [currentTrades, plan, checklistScore]
  );

  const previousReport = useMemo(
    () => computeReport(previousTrades, plan, null),
    [previousTrades, plan]
  );

  const pnlChange =
    previousReport.pnl !== 0
      ? ((report.pnl - previousReport.pnl) / Math.abs(previousReport.pnl)) * 100
      : report.pnl !== 0
      ? 100
      : 0;

  const summary = useMemo(() => {
    if (!report.trades.length) {
      return "Aucun trade clôturé sur cette période. Ton bilan apparaîtra automatiquement dès que des trades seront disponibles.";
    }

    const parts: string[] = [];

    if (report.pnl > 0) {
      parts.push(
        `Tu termines ${monthLabel(selectedMonth)} avec un P&L positif de ${money(
          report.pnl
        )}.`
      );
    } else if (report.pnl < 0) {
      parts.push(
        `Tu termines ${monthLabel(selectedMonth)} avec un P&L de ${money(
          report.pnl
        )}.`
      );
    } else {
      parts.push(`Ton P&L est à l’équilibre sur ${monthLabel(selectedMonth)}.`);
    }

    if (report.bestAsset) {
      parts.push(
        `${report.bestAsset.label} est ton actif le plus rentable avec ${money(
          report.bestAsset.pnl
        )}.`
      );
    }

    if (report.profitFactor != null) {
      if (report.profitFactor >= 2) {
        parts.push(
          `Ton Profit Factor de ${report.profitFactor.toFixed(
            2
          )} montre une très bonne efficacité des gains face aux pertes.`
        );
      } else if (report.profitFactor >= 1) {
        parts.push(
          `Ton Profit Factor est de ${report.profitFactor.toFixed(
            2
          )}; la performance reste positive mais peut encore être renforcée.`
        );
      } else {
        parts.push(
          `Ton Profit Factor de ${report.profitFactor.toFixed(
            2
          )} montre que les pertes pèsent encore trop lourd.`
        );
      }
    }

    if (report.disciplineScore != null) {
      parts.push(
        `Ton score de discipline est de ${report.disciplineScore}/100.`
      );
    }

    return parts.join(" ");
  }, [report, selectedMonth]);

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 className="animate-spin text-[color:var(--gold)]" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
            <FileText size={12} />
            Bilan InvestPro
          </div>

          <h1 className="mt-3 text-2xl font-semibold text-white">
            Rapport <span className="text-[color:var(--gold)]">mensuel</span>
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Ton mois résumé automatiquement à partir de ton Journal et de ton Plan de trading.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedMonth(previousMonth(selectedMonth))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] text-white/70"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="min-w-[180px] rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 py-2.5 text-center text-xs font-semibold capitalize text-[color:var(--gold)]">
            {monthLabel(selectedMonth)}
          </div>

          <button
            type="button"
            onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] text-white/70"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <section className="rounded-[24px] border border-[color:var(--gold-border)] bg-gradient-to-br from-[color:var(--gold-soft)] to-transparent p-5 md:p-6">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <div className="text-[9px] uppercase tracking-[0.12em] text-white/35">
              Résumé automatique
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Ton mois en un coup d’œil
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              {summary}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 xl:col-span-4">
            <div className="text-[9px] text-white/35">Évolution vs mois précédent</div>
            <div
              className={[
                "mt-2 flex items-center gap-2 text-2xl font-semibold",
                pnlChange > 0
                  ? "text-emerald-400"
                  : pnlChange < 0
                  ? "text-red-400"
                  : "text-white",
              ].join(" ")}
            >
              {pnlChange > 0 ? (
                <ArrowUpRight size={20} />
              ) : pnlChange < 0 ? (
                <ArrowDownRight size={20} />
              ) : null}
              {pnlChange > 0 ? "+" : ""}
              {pnlChange.toFixed(1)}%
            </div>
            <div className="mt-2 text-[10px] text-white/30">
              Mois précédent : {money(previousReport.pnl)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Metric label="P&L" value={money(report.pnl)} tone={report.pnl} icon={<TrendingUp size={15} />} />
        <Metric label="Winrate" value={`${report.winrate.toFixed(1)}%`} icon={<Target size={15} />} />
        <Metric label="Profit Factor" value={report.profitFactor == null ? "—" : report.profitFactor.toFixed(2)} icon={<Gauge size={15} />} />
        <Metric label="Drawdown max" value={`${report.maxDrawdown.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} $`} tone={report.maxDrawdown} icon={<TrendingDown size={15} />} />
        <Metric label="Trades" value={String(report.trades.length)} icon={<BarChart3 size={15} />} />
        <Metric label="R moyen" value={report.avgR == null ? "—" : `${report.avgR.toFixed(2)}R`} icon={<LineChart size={15} />} />
        <Metric label="Gain moyen" value={money(report.avgWin)} tone={report.avgWin} icon={<ArrowUpRight size={15} />} />
        <Metric label="Perte moyenne" value={report.avgLoss ? `-${report.avgLoss.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} $US` : "—"} tone={report.avgLoss ? -report.avgLoss : 0} icon={<ArrowDownRight size={15} />} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 xl:col-span-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Courbe du mois</div>
              <div className="mt-1 text-[9px] text-[color:var(--muted)]">
                P&L cumulé sur les trades clôturés
              </div>
            </div>
            <Link href="/dashboard/rapports" className="text-[10px] font-semibold text-[color:var(--gold)]">
              Rapports complets →
            </Link>
          </div>

          <EquityChart values={report.equity} />
        </div>

        <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 xl:col-span-4">
          <div className="text-sm font-semibold text-white">Résultats</div>
          <div className="mt-5 space-y-4">
            <ResultBar label="Wins" value={report.wins} total={report.trades.length} tone="green" />
            <ResultBar label="Losses" value={report.losses} total={report.trades.length} tone="red" />
            <ResultBar label="Break-even" value={report.breakeven} total={report.trades.length} tone="gold" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Highlight
          icon={<Trophy size={17} />}
          title="Meilleur trade"
          label={report.bestTrade?.symbol || "—"}
          value={report.bestTrade ? money(Number(report.bestTrade.result_amount || 0)) : "—"}
        />
        <Highlight
          icon={<TrendingDown size={17} />}
          title="Pire trade"
          label={report.worstTrade?.symbol || "—"}
          value={report.worstTrade ? money(Number(report.worstTrade.result_amount || 0)) : "—"}
        />
        <Highlight
          icon={<Medal size={17} />}
          title="Meilleur actif"
          label={report.bestAsset?.label || "—"}
          value={report.bestAsset ? money(report.bestAsset.pnl) : "—"}
        />
        <Highlight
          icon={<CalendarDays size={17} />}
          title="Meilleur jour"
          label={report.bestWeekday?.label || "—"}
          value={report.bestWeekday ? money(report.bestWeekday.pnl) : "—"}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 xl:col-span-7">
          <div className="text-sm font-semibold text-white">Ce qui fonctionne le mieux</div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <BestBlock
              label="Session"
              value={report.bestSession?.label || "Données insuffisantes"}
              pnl={report.bestSession?.pnl ?? null}
            />
            <BestBlock
              label="Setup"
              value={report.bestSetup?.label || "Données insuffisantes"}
              pnl={report.bestSetup?.pnl ?? null}
            />
            <BestBlock
              label="Actif"
              value={report.bestAsset?.label || "Données insuffisantes"}
              pnl={report.bestAsset?.pnl ?? null}
            />
          </div>

          {report.worstAsset && report.worstAsset.pnl < 0 ? (
            <div className="mt-4 rounded-xl border border-red-500/15 bg-red-500/[0.04] p-4">
              <div className="text-[9px] uppercase tracking-[0.08em] text-red-300/60">
                Point de vigilance
              </div>
              <div className="mt-1 text-xs text-white/65">
                {report.worstAsset.label} est ton actif le moins performant du mois avec{" "}
                <span className="font-semibold text-red-400">
                  {money(report.worstAsset.pnl)}
                </span>.
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 xl:col-span-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-[color:var(--gold)]" />
            <div className="text-sm font-semibold text-white">Discipline</div>
          </div>

          <div className="mt-5 flex items-center gap-5">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]">
              <div className="text-center">
                <div className="text-xl font-semibold text-white">
                  {report.disciplineScore == null ? "—" : report.disciplineScore}
                  {report.disciplineScore != null ? (
                    <span className="text-xs text-white/35">/100</span>
                  ) : null}
                </div>
                <div className="mt-1 text-[8px] text-[color:var(--gold)]">Score</div>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              <SmallRow label="Trades conformes" value={String(report.compliant)} good />
              <SmallRow label="Trades à vérifier" value={String(report.nonCompliant)} />
              <SmallRow
                label="Checklists complètes"
                value={
                  checklists.length
                    ? `${checklists.filter((item) => item.is_completed).length}/${checklists.length}`
                    : "N/D"
                }
                good
              />
            </div>
          </div>

          <Link
            href="/dashboard/plan"
            className="mt-5 inline-flex items-center gap-2 text-[10px] font-semibold text-[color:var(--gold)]"
          >
            Voir ma discipline <ArrowRight size={12} />
          </Link>
        </div>
      </section>

      <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Continuer l’analyse</div>
            <p className="mt-1 text-[10px] text-[color:var(--muted)]">
              Le rapport mensuel te donne le résumé ; Rapports V2 te permet d’aller dans le détail.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/journal"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--border)] bg-black/20 px-4 text-xs font-semibold text-white"
            >
              Journal
            </Link>
            <Link
              href="/dashboard/rapports"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[color:var(--gold)] px-4 text-xs font-semibold text-black"
            >
              Rapports complets <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 0,
  icon,
}: {
  label: string;
  value: string;
  tone?: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <div className="text-[color:var(--gold)]">{icon}</div>
      <div className="mt-3 text-[9px] text-white/35">{label}</div>
      <div
        className={[
          "mt-1 text-base font-semibold",
          tone > 0
            ? "text-emerald-400"
            : tone < 0
            ? "text-red-400"
            : "text-white",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function EquityChart({ values }: { values: number[] }) {
  if (!values.length) {
    return (
      <div className="mt-5 flex h-[180px] items-center justify-center rounded-xl border border-dashed border-white/[0.07] text-xs text-white/25">
        Aucun trade clôturé sur ce mois.
      </div>
    );
  }

  const width = 900;
  const height = 210;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  const points = values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : (index / (values.length - 1)) * width;
      const y = height - 12 - ((value - min) / range) * (height - 24);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="mt-5 h-[180px] overflow-hidden rounded-xl border border-white/[0.05] bg-black/20 md:h-[220px]">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="monthlyGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(242,199,91,.22)" />
            <stop offset="100%" stopColor="rgba(242,199,91,0)" />
          </linearGradient>
        </defs>
        <polyline
          points={`0,${height} ${points} ${width},${height}`}
          fill="url(#monthlyGold)"
          stroke="none"
        />
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

function ResultBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "green" | "red" | "gold";
}) {
  const percent = total ? (value / total) * 100 : 0;
  const cls =
    tone === "green"
      ? "bg-emerald-400"
      : tone === "red"
      ? "bg-red-400"
      : "bg-[color:var(--gold)]";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-white/55">{label}</span>
        <span className="font-semibold text-white">
          {value} · {percent.toFixed(0)}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${cls}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Highlight({
  icon,
  title,
  label,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <div className="flex items-center gap-2 text-[color:var(--gold)]">
        {icon}
        <span className="text-[9px] uppercase tracking-[0.08em] text-white/35">
          {title}
        </span>
      </div>
      <div className="mt-4 text-sm font-semibold text-white">{label}</div>
      <div className="mt-1 text-xs text-white/45">{value}</div>
    </div>
  );
}

function BestBlock({
  label,
  value,
  pnl,
}: {
  label: string;
  value: string;
  pnl: number | null;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="text-[9px] text-white/30">{label}</div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
      <div
        className={[
          "mt-1 text-[10px] font-semibold",
          pnl == null
            ? "text-white/25"
            : pnl >= 0
            ? "text-emerald-400"
            : "text-red-400",
        ].join(" ")}
      >
        {pnl == null ? "—" : money(pnl)}
      </div>
    </div>
  );
}

function SmallRow({
  label,
  value,
  good = false,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] text-white/45">{label}</span>
      <span
        className={[
          "text-xs font-semibold",
          good ? "text-emerald-400" : "text-amber-300",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
