"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Trade, loadTrades } from "../../../lib/tradesStore";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthLabel(d: Date) {
  return d.toLocaleString("fr-FR", { month: "long", year: "numeric" });
}

export default function RapportsPage() {
  const [trades] = useState<Trade[]>(() => loadTrades());
  const [startBalance, setStartBalance] = useState("10000");

  const start = Number(startBalance) || 0;

  // KPIs
  const kpi = useMemo(() => {
    const total = trades.length;
    const pnl = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);

    const wins = trades.filter((t) => t.result === "WIN").length;
    const losses = trades.filter((t) => t.result === "LOSS").length;

    const winrate = total > 0 ? (wins / total) * 100 : 0;

    const avgWin = wins > 0 ? trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / wins : 0;
    const avgLoss = losses > 0 ? trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0) / losses : 0;

    const grossProfit = trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLossAbs = Math.abs(trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : grossProfit > 0 ? 999 : 0;

    return { total, pnl, wins, losses, winrate, avgWin, avgLoss, profitFactor };
  }, [trades]);

  // Calendar month
  const [viewDate, setViewDate] = useState(() => new Date());

  const calendar = useMemo(() => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const firstDay = new Date(d);
    const startWeekday = (firstDay.getDay() + 6) % 7; // Monday=0

    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - startWeekday);

    const days: { date: Date; key: string; pnl: number; count: number }[] = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + i);
      const key = ymd(day);

      const dayTrades = trades.filter((t) => t.date === key);
      const pnl = dayTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);

      days.push({ date: day, key, pnl, count: dayTrades.length });
    }
    return days;
  }, [viewDate, trades]);

  const monthPnl = useMemo(() => {
    const ym = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`;
    return trades
      .filter((t) => t.date.startsWith(ym))
      .reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  }, [viewDate, trades]);

  // Equity curve (simple daily)
  const equityPoints = useMemo(() => {
    // group pnl by day, then cumulate
    const map = new Map<string, number>();
    for (const t of trades) {
      map.set(t.date, (map.get(t.date) ?? 0) + (Number(t.pnl) || 0));
    }
    const dates = Array.from(map.keys()).sort();
    let bal = start;
    const pts = dates.map((d) => {
      bal += map.get(d) ?? 0;
      return { d, bal };
    });
    return pts;
  }, [trades, start]);

  // svg line
  const svg = useMemo(() => {
    if (equityPoints.length < 2) return null;

    const w = 900, h = 220, pad = 20;
    const ys = equityPoints.map((p) => p.bal);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(1, maxY - minY);

    const xs = equityPoints.map((_, i) => pad + (i * (w - pad * 2)) / (equityPoints.length - 1));
    const y = (v: number) => pad + (h - pad * 2) * (1 - (v - minY) / span);

    const d = equityPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${xs[i]} ${y(p.bal)}`).join(" ");

    return { w, h, d, minY, maxY };
  }, [equityPoints]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Rapports <span className="text-[color:var(--gold)]">de performance</span>
          </h1>
          <p className="text-[color:var(--muted)] mt-1">
            
          </p>
        </div>

        <div className="flex items-end gap-3">
          <label className="block">
            <div className="text-xs text-white/70 mb-1">Start balance</div>
            <input
              value={startBalance}
              onChange={(e) => setStartBalance(e.target.value)}
              className="px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)] text-white
                         outline-none focus:border-[color:var(--gold-border)]
                         focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
            />
          </label>

          <Button
            variant="secondary"
            onClick={() => setViewDate(new Date())}
          >
            Today
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Total P&L</div>
          <div className={["mt-2 text-xl font-bold", kpi.pnl >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"].join(" ")}>
            {fmt(kpi.pnl)}
          </div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Trades</div>
          <div className="mt-2 text-xl font-bold text-white">{kpi.total}</div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Winrate</div>
          <div className="mt-2 text-xl font-bold text-white">{fmt(kpi.winrate)}%</div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Profit Factor</div>
          <div className="mt-2 text-xl font-bold text-white">{fmt(kpi.profitFactor)}</div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Avg Win</div>
          <div className="mt-2 text-xl font-bold text-[color:var(--success)]">{fmt(kpi.avgWin)}</div>
        </CardSubCard>

        <CardSubCard>
          <div className="text-xs text-[color:var(--muted)]">Avg Loss</div>
          <div className="mt-2 text-xl font-bold text-[color:var(--danger)]">{fmt(kpi.avgLoss)}</div>
        </CardSubCard>
      </div>

      {/* Calendar */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">
              Calendrier P&L — <span className="text-[color:var(--gold)]">{monthLabel(viewDate)}</span>
            </div>
            <div className="text-sm text-[color:var(--muted)]">
              Monthly P/L:{" "}
              <span className={monthPnl >= 0 ? "text-[color:var(--success)] font-semibold" : "text-[color:var(--danger)] font-semibold"}>
                {fmt(monthPnl)}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2 text-xs text-[color:var(--muted)]">
            {["Lu","Ma","Me","Je","Ve","Sa","Di"].map((d) => (
              <div key={d} className="px-2">{d}</div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2">
            {calendar.map((c) => {
              const inMonth = c.date.getMonth() === viewDate.getMonth();
              const bg =
                c.pnl > 0
                  ? "bg-[color:var(--success)]/12 border-[color:var(--success)]/25"
                  : c.pnl < 0
                  ? "bg-[color:var(--danger)]/12 border-[color:var(--danger)]/25"
                  : "bg-black/20 border-[color:var(--border)]";

              return (
                <div
                  key={c.key}
                  className={[
                    "min-h-[78px] rounded-2xl border p-2",
                    bg,
                    inMonth ? "" : "opacity-40",
                  ].join(" ")}
                >
                  <div className="text-xs text-white/70">{c.date.getDate()}</div>
                  <div className={["mt-2 text-sm font-semibold", c.pnl >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"].join(" ")}>
                    {c.count ? fmt(c.pnl) : ""}
                  </div>
                  <div className="text-[11px] text-[color:var(--muted)]">
                    {c.count ? `${c.count} trades` : ""}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex gap-3">
            <Button
              variant="secondary"
              onClick={() =>
                setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
              }
            >
              ← Mois précédent
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
              }
            >
              Mois suivant →
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Equity */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Equity curve</div>
            <div className="text-xs text-[color:var(--muted)]">
              Points: {equityPoints.length}
            </div>
          </div>

          <div className="mt-4">
            {svg ? (
              <div className="rounded-2xl border border-[color:var(--border)] bg-black/20 p-3 overflow-x-auto">
                <svg width={svg.w} height={svg.h}>
                  <path d={svg.d} fill="none" stroke="rgba(214,179,95,.9)" strokeWidth="2" />
                </svg>
              </div>
            ) : (
              <div className="text-sm text-[color:var(--muted)]">
                Ajoute des trades dans le journal pour voir la courbe.
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
