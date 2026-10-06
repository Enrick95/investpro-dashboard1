"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Clock3,
  Flame,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Trade = {
  id: number;
  trade_date: string;
  symbol: string;
  result_amount: number | null;
  result_r: number | null;
  status: string;
  risk_percent: number | null;
  setup: string | null;
  session: string | null;
};

type Plan = {
  max_risk_percent: number | null;
  max_trades_per_day: number | null;
};

function parisDay(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalize(value: string | null) {
  return String(value || "Non renseigné")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function scoreLabel(score: number) {
  if (score >= 90) return "Excellente discipline";
  if (score >= 75) return "Discipline solide";
  if (score >= 55) return "Quelques écarts";
  return "Discipline à renforcer";
}

export default function SmartDashboardInsights() {
  const supabase = useMemo(() => createClient(), []);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const start = new Date();
        start.setDate(start.getDate() - 90);

        const [tradesResult, planResult] = await Promise.all([
          supabase
            .from("trading_journal")
            .select(
              "id,trade_date,symbol,result_amount,result_r,status,risk_percent,setup,session"
            )
            .eq("user_id", user.id)
            .gte("trade_date", start.toISOString())
            .order("trade_date", { ascending: true }),
          supabase
            .from("trading_plans")
            .select("max_risk_percent,max_trades_per_day")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        if (!tradesResult.error) {
          setTrades((tradesResult.data || []) as Trade[]);
        }

        if (!planResult.error && planResult.data) {
          setPlan({
            max_risk_percent: Number(planResult.data.max_risk_percent || 0),
            max_trades_per_day: Number(planResult.data.max_trades_per_day || 0),
          });
        }
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [supabase]);

  const insight = useMemo(() => {
    const closed = trades.filter((trade) =>
      ["win", "loss", "breakeven"].includes(
        String(trade.status || "").toLowerCase()
      )
    );

    const todayKey = parisDay(new Date());
    const today = trades.filter((trade) => parisDay(trade.trade_date) === todayKey);
    const todayClosed = today.filter((trade) =>
      ["win", "loss", "breakeven"].includes(
        String(trade.status || "").toLowerCase()
      )
    );

    const pnlToday = todayClosed.reduce(
      (sum, trade) => sum + Number(trade.result_amount || 0),
      0
    );
    const lossesToday = todayClosed.filter(
      (trade) => Number(trade.result_amount || 0) < 0
    ).length;

    let lossStreak = 0;
    let winStreak = 0;

    for (let index = closed.length - 1; index >= 0; index -= 1) {
      const result = Number(closed[index].result_amount || 0);

      if (result < 0 && winStreak === 0) {
        lossStreak += 1;
      } else if (result > 0 && lossStreak === 0) {
        winStreak += 1;
      } else if (result !== 0) {
        break;
      }
    }

    const riskLimit = Number(plan?.max_risk_percent || 0);
    const dailyLimit = Number(plan?.max_trades_per_day || 0);

    const riskBreaches =
      riskLimit > 0
        ? closed.filter(
            (trade) => Number(trade.risk_percent || 0) > riskLimit
          ).length
        : 0;

    const byDay = new Map<string, number>();

    for (const trade of trades) {
      const key = parisDay(trade.trade_date);
      byDay.set(key, (byDay.get(key) || 0) + 1);
    }

    const dayBreaches =
      dailyLimit > 0
        ? [...byDay.values()].filter((count) => count > dailyLimit).length
        : 0;

    const disciplineBase = closed.length || trades.length;
    const penalty = disciplineBase
      ? Math.min(
          100,
          ((riskBreaches + dayBreaches) / Math.max(1, disciplineBase)) *
            100 *
            2.5
        )
      : 0;
    const disciplineScore = Math.max(0, Math.round(100 - penalty));

    type Group = {
      count: number;
      pnl: number;
      wins: number;
      losses: number;
    };

    const group = (field: "session" | "setup") => {
      const map = new Map<string, Group>();

      closed.forEach((trade) => {
        const label = normalize(trade[field]);
        const row = map.get(label) || {
          count: 0,
          pnl: 0,
          wins: 0,
          losses: 0,
        };
        const result = Number(trade.result_amount || 0);

        row.count += 1;
        row.pnl += result;
        if (result > 0) row.wins += 1;
        if (result < 0) row.losses += 1;
        map.set(label, row);
      });

      return [...map.entries()]
        .filter(([, row]) => row.count >= 2)
        .sort((a, b) => b[1].pnl - a[1].pnl);
    };

    const sessions = group("session");
    const setups = group("setup");
    const bestSession = sessions[0] || null;
    const worstSession = sessions.length ? sessions[sessions.length - 1] : null;
    const bestSetup = setups[0] || null;

    let headline = "Session calme";
    let recommendation =
      "Aucun signal particulier. Continue à suivre ton plan avant chaque entrée.";
    let tone: "good" | "warn" | "neutral" = "neutral";

    if (lossesToday >= 2) {
      headline = "Protection du capital prioritaire";
      recommendation =
        "Tu as déjà 2 pertes aujourd’hui. Évite de forcer un nouveau setup et privilégie la qualité.";
      tone = "warn";
    } else if (
      riskLimit > 0 &&
      today.some((trade) => Number(trade.risk_percent || 0) > riskLimit)
    ) {
      headline = "Risque au-dessus du plan";
      recommendation = `Au moins un trade dépasse ta limite de ${riskLimit}%. Reviens à ton risque prévu avant la prochaine entrée.`;
      tone = "warn";
    } else if (todayClosed.length && pnlToday > 0) {
      headline = "Session positive";
      recommendation =
        "Tu es positif aujourd’hui. Le meilleur choix peut être de préserver la session plutôt que d’augmenter la fréquence.";
      tone = "good";
    } else if (lossStreak >= 3) {
      headline = "Série de pertes détectée";
      recommendation = `${lossStreak} pertes consécutives. Réduis le rythme et vérifie ton setup avant de reprendre.`;
      tone = "warn";
    } else if (bestSession && bestSession[1].pnl > 0) {
      headline = `Ton avantage ressort sur ${bestSession[0]}`;
      recommendation = `Sur les 90 derniers jours, ${bestSession[0]} est ta session la plus performante. Priorise tes meilleurs contextes.`;
      tone = "good";
    }

    return {
      todayCount: today.length,
      pnlToday,
      lossStreak,
      winStreak,
      disciplineScore,
      headline,
      recommendation,
      tone,
      bestSession,
      worstSession,
      bestSetup,
    };
  }, [trades, plan]);

  if (loading || !trades.length) return null;

  return (
    <section className="mb-5 overflow-hidden rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)]">
      <div className="border-b border-white/[0.06] p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
              <BrainCircuit size={11} />
              Intelligence trading
            </div>

            <h2 className="mt-3 text-lg font-semibold text-white">
              Ce qu’InvestPro détecte dans ton trading
            </h2>

            <p className="mt-1 text-[10px] leading-5 text-white/35">
              Analyse automatique basée sur tes 90 derniers jours et ton plan de trading.
            </p>
          </div>

          <Link
            href="/dashboard/rapports"
            className="inline-flex items-center gap-2 text-[10px] font-semibold text-[color:var(--gold)] no-underline"
          >
            Voir l’analyse complète
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr]">
        <div className="p-4 md:p-5">
          <div
            className={[
              "rounded-2xl border p-4",
              insight.tone === "good"
                ? "border-emerald-500/15 bg-emerald-500/[0.04]"
                : insight.tone === "warn"
                  ? "border-amber-500/20 bg-amber-500/[0.04]"
                  : "border-white/[0.06] bg-black/20",
            ].join(" ")}
          >
            <div className="flex items-start gap-3">
              <div
                className={[
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                  insight.tone === "good"
                    ? "border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-400"
                    : insight.tone === "warn"
                      ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-300"
                      : "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
                ].join(" ")}
              >
                {insight.tone === "warn" ? (
                  <AlertTriangle size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
              </div>

              <div>
                <div className="text-sm font-semibold text-white">
                  {insight.headline}
                </div>
                <p className="mt-1 text-[10px] leading-5 text-white/45">
                  {insight.recommendation}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Trades aujourd’hui"
              value={String(insight.todayCount)}
              icon={<Clock3 size={13} />}
            />
            <Metric
              label="P&L aujourd’hui"
              value={`${insight.pnlToday > 0 ? "+" : ""}${insight.pnlToday.toLocaleString(
                "fr-FR",
                { maximumFractionDigits: 0 }
              )}`}
              icon={
                insight.pnlToday >= 0 ? (
                  <TrendingUp size={13} />
                ) : (
                  <TrendingDown size={13} />
                )
              }
              tone={
                insight.pnlToday > 0
                  ? "good"
                  : insight.pnlToday < 0
                    ? "bad"
                    : "neutral"
              }
            />
            <Metric
              label="Série actuelle"
              value={
                insight.lossStreak
                  ? `${insight.lossStreak}L`
                  : insight.winStreak
                    ? `${insight.winStreak}W`
                    : "—"
              }
              icon={<Flame size={13} />}
              tone={
                insight.lossStreak >= 2
                  ? "warn"
                  : insight.winStreak >= 2
                    ? "good"
                    : "neutral"
              }
            />
            <Metric
              label="Discipline"
              value={`${insight.disciplineScore}/100`}
              icon={<ShieldCheck size={13} />}
              tone={insight.disciplineScore >= 75 ? "good" : "warn"}
            />
          </div>
        </div>

        <div className="border-t border-white/[0.05] bg-black/15 p-4 md:p-5 xl:border-l xl:border-t-0">
          <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">
            Forces / points d’attention
          </div>

          <div className="mt-3 space-y-2">
            <InsightLine
              icon={<Target size={13} />}
              title="Discipline"
              value={scoreLabel(insight.disciplineScore)}
              good={insight.disciplineScore >= 75}
            />
            <InsightLine
              icon={<TrendingUp size={13} />}
              title="Meilleure session"
              value={
                insight.bestSession
                  ? insight.bestSession[0]
                  : "Pas assez de données"
              }
              good={Boolean(insight.bestSession)}
            />
            <InsightLine
              icon={<Sparkles size={13} />}
              title="Meilleur setup"
              value={
                insight.bestSetup
                  ? insight.bestSetup[0]
                  : "Pas assez de données"
              }
              good={Boolean(insight.bestSetup)}
            />
            <InsightLine
              icon={<AlertTriangle size={13} />}
              title="Session à surveiller"
              value={
                insight.worstSession && insight.worstSession[1].pnl < 0
                  ? insight.worstSession[0]
                  : "Aucune alerte nette"
              }
              good={
                !(insight.worstSession && insight.worstSession[1].pnl < 0)
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
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
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="flex items-center gap-1.5 text-[color:var(--gold)]">
        {icon}
        <span className="text-[8px] text-white/30">{label}</span>
      </div>
      <div className={`mt-2 text-sm font-semibold ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

function InsightLine({
  icon,
  title,
  value,
  good,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  good: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-black/20 p-3">
      <div className="flex items-center gap-2 text-[9px] text-white/40">
        <span className="text-[color:var(--gold)]">{icon}</span>
        {title}
      </div>

      <div
        className={`max-w-[55%] truncate text-right text-[9px] font-semibold ${
          good ? "text-emerald-400" : "text-amber-300"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
