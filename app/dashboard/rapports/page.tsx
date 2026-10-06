"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Gauge,
  Flame,
  LineChart,
  Search,
  Scale,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type TradingAccount = {
  id: number;
  name: string;
  broker: string | null;
  account_type: "real" | "demo" | "prop";
  platform: "MT4" | "MT5" | "OTHER" | null;
  currency: string;
  initial_balance: number;
  current_balance: number;
};

type Trade = {
  id: number;
  account_id: number | null;
  trade_date: string;
  symbol: string;
  direction: "buy" | "sell";
  risk_percent: number | null;
  result_amount: number | null;
  result_r: number | null;
  status: "open" | "win" | "loss" | "breakeven" | "cancelled";
  setup: string | null;
  session: string | null;
  timeframe: string | null;
};

type Period = "7d" | "30d" | "90d" | "year" | "all";

type BreakdownRow = {
  label: string;
  count: number;
  pnl: number;
  wins: number;
  losses: number;
  winrate: number;
};

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency}`;
  }
}

function nfmt(value: number, digits = 2) {
  return Number(value || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pct(value: number) {
  return `${nfmt(value, 1)}%`;
}

function signedMoney(value: number, currency: string) {
  const text = money(Math.abs(value), currency);
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${text}`;
}

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function periodStart(period: Period) {
  const now = new Date();
  if (period === "all") return null;
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function shortDay(date: Date) {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function normalizeSession(v: string | null) {
  if (!v) return "Non renseigné";
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function safePct(num: number, den: number) {
  return den > 0 ? (num / den) * 100 : 0;
}

export default function RapportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<"all" | number>("all");
  const [period, setPeriod] = useState<Period>("30d");
  const [search, setSearch] = useState("");
  const [viewDate, setViewDate] = useState(new Date());

  useEffect(() => {
    async function loadPage() {
      try {
        setLoading(true);
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          window.location.href = "/login";
          return;
        }
        const [accountsResult, tradesResult] = await Promise.all([
          supabase
            .from("trading_accounts")
            .select("id,name,broker,account_type,platform,currency,initial_balance,current_balance")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true }),
          supabase
            .from("trading_journal")
            .select("id,account_id,trade_date,symbol,direction,risk_percent,result_amount,result_r,status,setup,session,timeframe")
            .eq("user_id", user.id)
            .order("trade_date", { ascending: true }),
        ]);
        if (!accountsResult.error) {
          setAccounts(((accountsResult.data || []) as TradingAccount[]).map((a) => ({
            ...a,
            initial_balance: Number(a.initial_balance || 0),
            current_balance: Number(a.current_balance || 0),
          })));
        }
        if (!tradesResult.error) {
          setTrades(((tradesResult.data || []) as Trade[]).map((t) => ({
            ...t,
            risk_percent: t.risk_percent == null ? null : Number(t.risk_percent),
            result_amount: t.result_amount == null ? null : Number(t.result_amount),
            result_r: t.result_r == null ? null : Number(t.result_r),
          })));
        }
      } finally {
        setLoading(false);
      }
    }
    loadPage();
  }, [supabase]);

  const selectedAccount = useMemo(() => {
    return selectedAccountId === "all" ? null : accounts.find((a) => a.id === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  const currency = selectedAccount?.currency || accounts[0]?.currency || "USD";
  const mixedCurrencies = selectedAccountId === "all" && accounts.some((a) => a.currency !== currency);

  const filteredTrades = useMemo(() => {
    const start = periodStart(period);
    const q = search.trim().toLowerCase();
    return trades.filter((trade) => {
      if (selectedAccountId !== "all" && trade.account_id !== selectedAccountId) return false;
      if (start && new Date(trade.trade_date) < start) return false;
      if (trade.status === "cancelled" || trade.status === "open") return false;
      if (q) {
        const haystack = [trade.symbol, trade.setup, trade.session, trade.timeframe, trade.direction]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [trades, selectedAccountId, period, search]);

  const stats = useMemo(() => {
    const closed = filteredTrades;
    const wins = closed.filter((t) => Number(t.result_amount || 0) > 0);
    const losses = closed.filter((t) => Number(t.result_amount || 0) < 0);
    const bes = closed.filter((t) => Number(t.result_amount || 0) === 0);
    const grossProfit = wins.reduce((s, t) => s + Number(t.result_amount || 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.result_amount || 0), 0));
    const pnl = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    const avgWin = wins.length ? grossProfit / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    const winrate = safePct(wins.length, wins.length + losses.length);
    const bestTrade = [...closed].sort((a, b) => Number(b.result_amount || 0) - Number(a.result_amount || 0))[0] || null;
    const worstTrade = [...closed].sort((a, b) => Number(a.result_amount || 0) - Number(b.result_amount || 0))[0] || null;
    const validR = closed.filter((t) => t.result_r != null && Number(t.result_r) !== 0);
    const avgR = validR.length ? validR.reduce((s, t) => s + Number(t.result_r || 0), 0) / validR.length : null;

    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;
    const equity = closed.map((trade, index) => {
      cumulative += Number(trade.result_amount || 0);
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
      return { index, value: cumulative, date: trade.trade_date };
    });

    const expectancy = closed.length ? pnl / closed.length : 0;
    const payoffRatio =
      avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    closed.forEach((trade) => {
      const result = Number(trade.result_amount || 0);

      if (result > 0) {
        currentWinStreak += 1;
        currentLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      } else if (result < 0) {
        currentLossStreak += 1;
        currentWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
      }
    });

    return {
      count: closed.length, wins: wins.length, losses: losses.length, bes: bes.length,
      grossProfit, grossLoss, pnl, profitFactor, avgWin, avgLoss, winrate,
      bestTrade, worstTrade, avgR, maxDrawdown, equity, expectancy, payoffRatio,
      maxWinStreak, maxLossStreak,
    };
  }, [filteredTrades]);

  const curve = useMemo(() => {
    const points = stats.equity;
    const width = 1000;
    const height = 280;
    if (!points.length) return { path: "", area: "", width, height, min: 0, max: 0 };
    const values = points.map((p) => p.value);
    let min = Math.min(0, ...values);
    let max = Math.max(0, ...values);
    if (min === max) { min -= 1; max += 1; }
    const x = (i: number) => points.length === 1 ? width / 2 : 30 + (i / (points.length - 1)) * (width - 60);
    const y = (v: number) => 24 + (1 - (v - min) / (max - min)) * (height - 48);
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
    const area = `${path} L ${x(points.length - 1)} ${height - 18} L ${x(0)} ${height - 18} Z`;
    return { path, area, width, height, min, max };
  }, [stats.equity]);

  const breakdowns = useMemo(() => {
    function aggregate(getLabel: (trade: Trade) => string): BreakdownRow[] {
      const map = new Map<string, { count: number; pnl: number; wins: number; losses: number }>();
      filteredTrades.forEach((trade) => {
        const label = getLabel(trade) || "Non renseigné";
        const row = map.get(label) || { count: 0, pnl: 0, wins: 0, losses: 0 };
        const result = Number(trade.result_amount || 0);
        row.count += 1;
        row.pnl += result;
        if (result > 0) row.wins += 1;
        if (result < 0) row.losses += 1;
        map.set(label, row);
      });
      return [...map.entries()].map(([label, row]) => ({
        label, ...row, winrate: safePct(row.wins, row.wins + row.losses),
      })).sort((a, b) => b.pnl - a.pnl);
    }

    const weekdays = aggregate((t) => new Date(t.trade_date).toLocaleDateString("fr-FR", { weekday: "long" }));
    const hours = aggregate((t) => `${String(new Date(t.trade_date).getHours()).padStart(2, "0")}h`);
    return {
      symbols: aggregate((t) => t.symbol || "Non renseigné"),
      sessions: aggregate((t) => normalizeSession(t.session)),
      setups: aggregate((t) => t.setup || "Non renseigné"),
      timeframes: aggregate((t) => t.timeframe || "Non renseigné"),
      weekdays,
      hours,
    };
  }, [filteredTrades]);

  const intelligence = useMemo(() => {
    const bestSession = breakdowns.sessions[0] || null;
    const worstSession = breakdowns.sessions.length
      ? breakdowns.sessions[breakdowns.sessions.length - 1]
      : null;
    const bestSetup = breakdowns.setups[0] || null;

    const messages: {
      tone: "good" | "warn" | "neutral";
      title: string;
      text: string;
    }[] = [];

    if (stats.maxLossStreak >= 3) {
      messages.push({
        tone: "warn",
        title: "Série de pertes à surveiller",
        text: `Ta plus longue série est de ${stats.maxLossStreak} pertes consécutives. Réduire la fréquence après 2 pertes peut protéger la session.`,
      });
    }

    if (bestSession && bestSession.pnl > 0) {
      messages.push({
        tone: "good",
        title: `Avantage sur ${bestSession.label}`,
        text: `${bestSession.count} trade(s) · ${pct(bestSession.winrate)} de winrate. C’est actuellement ta session la plus rentable sur la sélection.`,
      });
    }

    if (worstSession && worstSession.pnl < 0) {
      messages.push({
        tone: "warn",
        title: `${worstSession.label} te coûte le plus`,
        text: `${worstSession.count} trade(s) · ${pct(worstSession.winrate)} de winrate. Compare la qualité de tes setups sur cette session.`,
      });
    }

    if (bestSetup && bestSetup.pnl > 0) {
      messages.push({
        tone: "good",
        title: `Setup fort : ${bestSetup.label}`,
        text: `${bestSetup.count} occurrence(s) · ${pct(bestSetup.winrate)} de winrate.`,
      });
    }

    if (stats.expectancy > 0) {
      messages.push({
        tone: "good",
        title: "Espérance positive",
        text: `Chaque trade clôturé produit en moyenne ${
          mixedCurrencies
            ? nfmt(stats.expectancy)
            : signedMoney(stats.expectancy, currency)
        } sur la période.`,
      });
    } else if (stats.count >= 5 && stats.expectancy < 0) {
      messages.push({
        tone: "warn",
        title: "Espérance négative",
        text: `Chaque trade clôturé coûte en moyenne ${
          mixedCurrencies
            ? nfmt(Math.abs(stats.expectancy))
            : money(Math.abs(stats.expectancy), currency)
        } sur la période.`,
      });
    }

    return {
      messages: messages.slice(0, 4),
    };
  }, [breakdowns, stats, mixedCurrencies, currency]);

  const calendar = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const startWeekday = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startWeekday);
    const days = [] as { date: Date; key: string; pnl: number; count: number }[];
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + i);
      const key = ymd(date);
      const dayTrades = filteredTrades.filter((t) => ymd(new Date(t.trade_date)) === key);
      days.push({ date, key, pnl: dayTrades.reduce((s, t) => s + Number(t.result_amount || 0), 0), count: dayTrades.length });
    }
    return days;
  }, [filteredTrades, viewDate]);

  const weeks = useMemo(() => Array.from({ length: 6 }, (_, i) => calendar.slice(i * 7, i * 7 + 7)), [calendar]);

  const capital = useMemo(() => {
    if (selectedAccount) return { initial: selectedAccount.initial_balance, current: selectedAccount.current_balance };
    if (mixedCurrencies) return { initial: 0, current: 0 };
    return {
      initial: accounts.reduce((s, a) => s + Number(a.initial_balance || 0), 0),
      current: accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0),
    };
  }, [selectedAccount, mixedCurrencies, accounts]);

  if (loading) {
    return <div className="flex min-h-[70vh] items-center justify-center text-sm text-[color:var(--muted)]">Chargement des rapports…</div>;
  }

  return (
    <div className="space-y-5 pb-12">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[color:var(--gold)]">
            <BarChart3 size={12} /> Analytics InvestPro
          </div>
          <h1 className="text-2xl font-semibold text-white">Rapports & Analytics</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">Comprends ce qui te fait gagner, ce qui te coûte et où améliorer ta discipline.</p>
        </div>
        <Link href="/dashboard/journal" className="inline-flex h-10 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-xs font-semibold text-[color:var(--gold)] no-underline">Ouvrir le Journal →</Link>
      </header>

      <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value === "all" ? "all" : Number(e.target.value))} className={`${inputClass} xl:col-span-3`}>
            <option value="all">Tous les comptes</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.broker ? ` • ${a.broker}` : ""}</option>)}
          </select>
          <div className="grid grid-cols-5 gap-2 xl:col-span-6">
            {([ ["7d","7 jours"], ["30d","30 jours"], ["90d","3 mois"], ["year","Année"], ["all","Tout"] ] as [Period,string][]).map(([key,label]) => (
              <button key={key} onClick={() => setPeriod(key)} className={`h-11 rounded-xl border px-2 text-[10px] font-semibold ${period === key ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]" : "border-white/10 bg-black/20 text-white/45"}`}>{label}</button>
            ))}
          </div>
          <div className="relative xl:col-span-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Actif, setup, session…" className={`${inputClass} pl-9`} />
          </div>
        </div>
        {mixedCurrencies ? <div className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/[.04] px-3 py-2 text-[10px] text-amber-200/70">Plusieurs devises détectées : sélectionne un compte pour des montants exacts.</div> : null}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<CircleDollarSign size={16}/>} label="P&L net" value={mixedCurrencies ? "Multi-devises" : signedMoney(stats.pnl, currency)} tone={stats.pnl > 0 ? "success" : stats.pnl < 0 ? "danger" : "neutral"}/>
        <Kpi icon={<Target size={16}/>} label="Winrate" value={pct(stats.winrate)} sub={`${stats.wins}W / ${stats.losses}L`}/>
        <Kpi icon={<Gauge size={16}/>} label="Profit Factor" value={stats.profitFactor === Infinity ? "∞" : nfmt(stats.profitFactor)} tone="gold"/>
        <Kpi icon={<Activity size={16}/>} label="Trades" value={String(stats.count)} sub={`${stats.bes} BE`}/>
        <Kpi icon={<TrendingUp size={16}/>} label="R moyen" value={stats.avgR == null ? "—" : `${stats.avgR > 0 ? "+" : ""}${nfmt(stats.avgR)}R`}/>
        <Kpi icon={<ShieldAlert size={16}/>} label="Drawdown max" value={mixedCurrencies ? "—" : `-${money(stats.maxDrawdown, currency)}`} tone="danger"/>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={<Scale size={16}/>}
          label="Espérance / trade"
          value={mixedCurrencies ? nfmt(stats.expectancy) : signedMoney(stats.expectancy, currency)}
          tone={stats.expectancy > 0 ? "success" : stats.expectancy < 0 ? "danger" : "neutral"}
        />
        <Kpi
          icon={<Target size={16}/>}
          label="Payoff ratio"
          value={stats.payoffRatio === Infinity ? "∞" : `${nfmt(stats.payoffRatio)}x`}
          sub="Gain moyen / perte moyenne"
          tone="gold"
        />
        <Kpi
          icon={<Flame size={16}/>}
          label="Meilleure série"
          value={`${stats.maxWinStreak}W`}
          sub="Wins consécutifs"
          tone="success"
        />
        <Kpi
          icon={<ShieldAlert size={16}/>}
          label="Pire série"
          value={`${stats.maxLossStreak}L`}
          sub="Losses consécutives"
          tone={stats.maxLossStreak >= 3 ? "danger" : "neutral"}
        />
      </section>

      <section className="rounded-[24px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
            <BrainCircuit size={17}/>
          </div>

          <div>
            <div className="text-sm font-semibold text-white">
              Lecture intelligente de la période
            </div>
            <div className="mt-1 text-[9px] text-white/30">
              InvestPro transforme tes statistiques en points d’attention concrets.
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {intelligence.messages.length ? (
            intelligence.messages.map((item, index) => (
              <div
                key={`${item.title}-${index}`}
                className={`rounded-2xl border p-4 ${
                  item.tone === "good"
                    ? "border-emerald-500/15 bg-emerald-500/[.04]"
                    : item.tone === "warn"
                      ? "border-amber-500/20 bg-amber-500/[.04]"
                      : "border-white/[.06] bg-black/20"
                }`}
              >
                <div
                  className={`text-[11px] font-semibold ${
                    item.tone === "good"
                      ? "text-emerald-400"
                      : item.tone === "warn"
                        ? "text-amber-300"
                        : "text-white"
                  }`}
                >
                  {item.title}
                </div>

                <p className="mt-2 text-[9px] leading-5 text-white/40">
                  {item.text}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/[.07] bg-black/20 p-5 text-[10px] text-white/30 md:col-span-2">
              Ajoute davantage de trades clôturés pour obtenir des conclusions fiables.
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5 xl:col-span-8">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-white">Courbe d’equity réalisée</h2><p className="mt-1 text-[10px] text-[color:var(--muted)]">P&L cumulé sur les trades clôturés de la sélection.</p></div>
            <div className={`text-lg font-semibold ${stats.pnl > 0 ? "text-emerald-400" : stats.pnl < 0 ? "text-red-400" : "text-white"}`}>{mixedCurrencies ? "—" : signedMoney(stats.pnl, currency)}</div>
          </div>
          <div className="mt-5 h-[300px] overflow-hidden rounded-2xl border border-white/[.06] bg-black/20">
            {curve.path ? (
              <svg viewBox={`0 0 ${curve.width} ${curve.height}`} className="h-full w-full" preserveAspectRatio="none">
                <defs><linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(214,179,95,.28)"/><stop offset="100%" stopColor="rgba(214,179,95,0)"/></linearGradient></defs>
                {[.2,.4,.6,.8].map((r) => <line key={r} x1="0" x2={curve.width} y1={curve.height*r} y2={curve.height*r} stroke="rgba(255,255,255,.05)" />)}
                <path d={curve.area} fill="url(#eqFill)" />
                <path d={curve.path} fill="none" stroke="rgba(232,194,102,.98)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted)]">Pas encore assez de trades clôturés.</div>}
          </div>
        </div>
        <div className="space-y-4 xl:col-span-4">
          <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
            <div className="flex items-center gap-3"><WalletCards size={17} className="text-[color:var(--gold)]"/><div><div className="text-sm font-semibold text-white">Capital</div><div className="text-[9px] text-[color:var(--muted)]">{selectedAccount?.name || "Vue globale"}</div></div></div>
            <div className="mt-5 text-3xl font-semibold text-white">{mixedCurrencies ? "Multi-devises" : money(capital.current, currency)}</div>
            <div className="mt-4 grid grid-cols-2 gap-3"><Mini label="Initial" value={mixedCurrencies ? "—" : money(capital.initial,currency)}/><Mini label="Écart" value={mixedCurrencies ? "—" : signedMoney(capital.current-capital.initial,currency)} gold/></div>
          </div>
          <ResultDonut wins={stats.wins} losses={stats.losses} bes={stats.bes} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Advanced title="Gain moyen" value={mixedCurrencies ? "—" : `+${money(stats.avgWin,currency)}`} subtitle="Moyenne des trades gagnants" tone="success" icon={<ArrowUpRight size={17}/>}/>
        <Advanced title="Perte moyenne" value={mixedCurrencies ? "—" : `-${money(stats.avgLoss,currency)}`} subtitle="Moyenne des trades perdants" tone="danger" icon={<ArrowDownRight size={17}/>}/>
        <Advanced title="Meilleur trade" value={stats.bestTrade ? (mixedCurrencies ? stats.bestTrade.symbol : signedMoney(Number(stats.bestTrade.result_amount||0),currency)) : "—"} subtitle={stats.bestTrade ? `${stats.bestTrade.symbol} • ${shortDay(new Date(stats.bestTrade.trade_date))}` : "Pas assez de données"} tone="success" icon={<TrendingUp size={17}/>}/>
        <Advanced title="Pire trade" value={stats.worstTrade ? (mixedCurrencies ? stats.worstTrade.symbol : signedMoney(Number(stats.worstTrade.result_amount||0),currency)) : "—"} subtitle={stats.worstTrade ? `${stats.worstTrade.symbol} • ${shortDay(new Date(stats.worstTrade.trade_date))}` : "Pas assez de données"} tone="danger" icon={<TrendingDown size={17}/>}/>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Breakdown title="Performance par actif" rows={breakdowns.symbols} currency={currency} moneyDisabled={mixedCurrencies}/>
        <Breakdown title="Performance par session" rows={breakdowns.sessions} currency={currency} moneyDisabled={mixedCurrencies}/>
        <Breakdown title="Performance par setup" rows={breakdowns.setups} currency={currency} moneyDisabled={mixedCurrencies}/>
        <Breakdown title="Performance par timeframe" rows={breakdowns.timeframes} currency={currency} moneyDisabled={mixedCurrencies}/>
        <Breakdown title="Jours de la semaine" rows={breakdowns.weekdays} currency={currency} moneyDisabled={mixedCurrencies}/>
        <Breakdown title="Horaires les plus rentables" rows={breakdowns.hours} currency={currency} moneyDisabled={mixedCurrencies}/>
      </section>

      <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-semibold text-white">Calendrier / Heatmap</h2><p className="mt-1 text-[10px] text-[color:var(--muted)]">P&L réalisé par journée sur la sélection.</p></div>
          <div className="flex items-center gap-2"><button onClick={() => setViewDate(new Date(viewDate.getFullYear(),viewDate.getMonth()-1,1))} className="calBtn"><ChevronLeft size={15}/></button><div className="min-w-[145px] text-center text-xs font-semibold capitalize text-[color:var(--gold)]">{monthLabel(viewDate)}</div><button onClick={() => setViewDate(new Date(viewDate.getFullYear(),viewDate.getMonth()+1,1))} className="calBtn"><ChevronRight size={15}/></button></div>
        </div>
        <div className="mt-5 overflow-x-auto pb-1"><div className="min-w-[680px]"><div className="grid grid-cols-7 gap-2 text-center text-[9px] uppercase text-white/25">{["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map((x)=><div key={x}>{x}</div>)}</div><div className="mt-2 space-y-2">{weeks.map((week,wi)=><div key={wi} className="grid grid-cols-7 gap-2">{week.map((day)=>{const inMonth=day.date.getMonth()===viewDate.getMonth();return <div key={day.key} className={`min-h-[82px] rounded-xl border p-2 ${day.pnl>0?"border-emerald-500/15 bg-emerald-500/[.07]":day.pnl<0?"border-red-500/15 bg-red-500/[.07]":"border-white/[.05] bg-black/20"} ${inMonth?"":"opacity-25"}`}><div className="text-[9px] text-white/40">{day.date.getDate()}</div>{day.count>0?<><div className={`mt-3 text-[11px] font-semibold ${day.pnl>0?"text-emerald-400":day.pnl<0?"text-red-400":"text-white"}`}>{mixedCurrencies?`${day.count} trades`:signedMoney(day.pnl,currency)}</div><div className="mt-1 text-[8px] text-white/25">{day.count} trade{day.count>1?"s":""}</div></>:null}</div>})}</div>)}</div></div></div>
      </section>
    </div>
  );
}

const inputClass = "h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[color:var(--gold-border)]";

function Kpi({icon,label,value,sub,tone="neutral"}:{icon:React.ReactNode;label:string;value:string;sub?:string;tone?:"neutral"|"gold"|"success"|"danger"}) {
  const vc = tone==="success"?"text-emerald-400":tone==="danger"?"text-red-400":tone==="gold"?"text-[color:var(--gold)]":"text-white";
  return <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4"><div className="flex items-center gap-2 text-[color:var(--gold)]">{icon}<span className="text-[9px] text-[color:var(--muted)]">{label}</span></div><div className={`mt-3 truncate text-lg font-semibold ${vc}`}>{value}</div>{sub?<div className="mt-1 text-[9px] text-white/25">{sub}</div>:null}</div>;
}

function Mini({label,value,gold=false}:{label:string;value:string;gold?:boolean}) {return <div className="rounded-xl border border-white/[.06] bg-black/20 p-3"><div className="text-[8px] text-[color:var(--muted)]">{label}</div><div className={`mt-1 truncate text-xs font-semibold ${gold?"text-[color:var(--gold)]":"text-white"}`}>{value}</div></div>}

function Advanced({title,value,subtitle,tone,icon}:{title:string;value:string;subtitle:string;tone:"success"|"danger"|"gold";icon:React.ReactNode}) {
 const vc=tone==="success"?"text-emerald-400":tone==="danger"?"text-red-400":"text-[color:var(--gold)]";
 return <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">{icon}</div><div className="min-w-0"><div className="text-[9px] text-[color:var(--muted)]">{title}</div><div className={`mt-1 truncate text-lg font-semibold ${vc}`}>{value}</div></div></div><div className="mt-4 text-[9px] text-white/30">{subtitle}</div></div>;
}

function ResultDonut({wins,losses,bes}:{wins:number;losses:number;bes:number}) {
 const total=wins+losses+bes; const winPct=total?safePct(wins,total):0; const lossPct=total?safePct(losses,total):0;
 return <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5"><div className="text-sm font-semibold text-white">Répartition des résultats</div><div className="mt-4 flex items-center gap-5"><div className="relative h-28 w-28 shrink-0 rounded-full" style={{background:`conic-gradient(rgb(52 211 153) 0 ${winPct}%, rgb(248 113 113) ${winPct}% ${winPct+lossPct}%, rgba(255,255,255,.16) ${winPct+lossPct}% 100%)`}}><div className="absolute inset-[11px] flex flex-col items-center justify-center rounded-full bg-[#0d0d10]"><div className="text-lg font-semibold text-white">{total}</div><div className="text-[8px] text-white/30">trades</div></div></div><div className="space-y-2 text-[10px]"><div className="text-emerald-400">● {wins} gagnants</div><div className="text-red-400">● {losses} perdants</div><div className="text-white/40">● {bes} break-even</div></div></div></div>;
}

function Breakdown({title,rows,currency,moneyDisabled}:{title:string;rows:BreakdownRow[];currency:string;moneyDisabled:boolean}) {
 const maxAbs=Math.max(1,...rows.map(r=>Math.abs(r.pnl)));
 return <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5"><div className="text-sm font-semibold text-white">{title}</div><div className="mt-4 space-y-2">{rows.length===0?<div className="rounded-xl border border-dashed border-white/[.07] bg-black/20 p-5 text-center text-[10px] text-[color:var(--muted)]">Pas assez de données.</div>:rows.slice(0,8).map(row=><div key={row.label} className="rounded-xl border border-white/[.05] bg-black/20 px-3 py-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-[10px] font-semibold capitalize text-white">{row.label}</div><div className="mt-1 text-[8px] text-white/25">{row.count} trade{row.count>1?"s":""} • {pct(row.winrate)} WR</div></div><div className={`text-[10px] font-semibold ${row.pnl>0?"text-emerald-400":row.pnl<0?"text-red-400":"text-white/40"}`}>{moneyDisabled?`${row.pnl>0?"+":""}${nfmt(row.pnl)}`:signedMoney(row.pnl,currency)}</div></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5"><div className={`h-full rounded-full ${row.pnl>=0?"bg-emerald-400/70":"bg-red-400/70"}`} style={{width:`${Math.max(3,Math.abs(row.pnl)/maxAbs*100)}%`}}/></div></div>)}</div></div>;
}
