"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardBody } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";

import { Trade, loadTrades } from "../../../lib/tradesStore";
import { loadMt5Accounts, Mt5Account } from "../../../lib/mt5Store";
import { syncMt5HistoryToTrades } from "../../../lib/mt5sync";
import { pushNotif } from "../../../lib/notifyStore";

/* -------------------------------- Helpers -------------------------------- */
function fmt(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v);
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
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180.0;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function radarPoint(
  cx: number,
  cy: number,
  r: number,
  axisIndex: number,
  axisCount: number,
  t01: number
) {
  const a = (360 / axisCount) * axisIndex - 90;
  return polarToCartesian(cx, cy, r * clamp(t01, 0, 1), a);
}
function relSince(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 0) return "à l’instant";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l’instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}
function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 rounded-full border-2 border-white/20 border-t-white/80 animate-spin"
      aria-label="Chargement"
    />
  );
}

/* ------------------------------ Widgets ------------------------------ */
function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "gold" | "success" | "danger";
}) {
  const vClass =
    tone === "success"
      ? "text-[color:var(--success)]"
      : tone === "danger"
      ? "text-[color:var(--danger)]"
      : tone === "gold"
      ? "text-[color:var(--gold)]"
      : "text-white";

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-black/20 p-3 min-w-0">
      <div className="text-xs text-[color:var(--muted)]">{label}</div>
      <div className={["mt-1 text-lg font-bold truncate", vClass].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function Ring({
  label,
  valueText,
  subLeft,
  subRight,
  fill01,
}: {
  label: string;
  valueText: string;
  subLeft?: string;
  subRight?: string;
  fill01: number;
}) {
  const cx = 44;
  const cy = 44;
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = clamp(fill01, 0, 1) * c;

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-black/20 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-[color:var(--muted)]">{label}</div>
          <div className="mt-1 text-2xl font-bold text-white">{valueText}</div>
          {(subLeft || subRight) && (
            <div className="mt-2 flex items-center gap-3 text-xs text-white/70">
              {subLeft ? (
                <span className="text-[color:var(--success)]">{subLeft}</span>
              ) : null}
              {subRight ? (
                <span className="text-[color:var(--danger)]">{subRight}</span>
              ) : null}
            </div>
          )}
        </div>

        <div className="shrink-0">
          <svg width="88" height="88" viewBox="0 0 88 88">
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.10)"
              strokeWidth="10"
            />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="rgba(214,179,95,0.95)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

function SemiGaugeCard({
  title,
  pct,
  subLeft,
  subRight,
}: {
  title: string;
  pct: number;
  subLeft?: string;
  subRight?: string;
}) {
  const cx = 180;
  const cy = 190;
  const r = 112;
  const semi = Math.PI * r;
  const filled = (semi * clamp(pct, 0, 100)) / 100;
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-[color:var(--muted)]">{title}</div>
            <div className="mt-1 text-2xl font-bold text-white">{fmt(pct)}%</div>
          </div>
          <div className="text-right text-xs text-white/70">
            {subLeft ? (
              <div className="text-[color:var(--success)]">{subLeft}</div>
            ) : null}
            {subRight ? (
              <div className="text-[color:var(--danger)]">{subRight}</div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 w-full max-w-[520px] aspect-[3/2] mx-auto rounded-2xl border border-[color:var(--border)] bg-black/20 p-3 flex items-center justify-center">
          <svg viewBox="0 0 360 240" className="w-full h-full block">
            <path
              d={d}
              fill="none"
              stroke="rgba(255,255,255,0.10)"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <path
              d={d}
              fill="none"
              stroke="rgba(214,179,95,0.95)"
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${semi}`}
            />
            <text
              x={cx}
              y={cy - 26}
              textAnchor="middle"
              fill="rgba(255,255,255,0.92)"
              fontSize="28"
              fontWeight="700"
            >
              {Math.round(pct)}%
            </text>
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              fill="rgba(255,255,255,0.45)"
              fontSize="12"
            >
              {title}
            </text>
          </svg>
        </div>
      </CardBody>
    </Card>
  );
}

function AvgBar({
  rrText,
  avgWin,
  avgLossAbs,
}: {
  rrText: string;
  avgWin: number;
  avgLossAbs: number;
}) {
  const sum = Math.max(1e-9, avgWin + avgLossAbs);
  const winW = clamp((avgWin / sum) * 100, 0, 100);

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-black/20 p-4">
      <div className="text-xs text-[color:var(--muted)]">Avg Win / Avg Loss</div>
      <div className="mt-1 text-2xl font-bold text-white">{rrText}</div>

      <div className="mt-3 h-3 rounded-full bg-white/10 overflow-hidden border border-[color:var(--border)] flex">
        <div
          className="h-full bg-[color:var(--success)]"
          style={{ width: `${winW}%` }}
        />
        <div
          className="h-full bg-[color:var(--danger)]"
          style={{ width: `${100 - winW}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <div className="font-semibold text-[color:var(--success)]">{fmt(avgWin)}</div>
        <div className="font-semibold text-[color:var(--danger)]">-{fmt(avgLossAbs)}</div>
      </div>
    </div>
  );
}

/* -------------------------------- Page -------------------------------- */
export default function RapportsPage() {
  const [accounts, setAccounts] = useState<Mt5Account[]>(() => loadMt5Accounts());
  const [openAccounts, setOpenAccounts] = useState(false);
  const [trades, setTrades] = useState<Trade[]>(() => loadTrades());

  const accountKey = (a: any) => safeStr(a.login ?? a.accountLogin ?? a.accountId ?? a.id);
  const accountLabel = (a: any) => {
    const k = accountKey(a);
    const server = safeStr(a.server ?? a.broker ?? "");
    return `${k}${server ? ` - ${server}` : ""}`.trim();
  };

  // ✅ pas de sélection auto : on garde seulement la dernière (si existe), sinon vide
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("investpro_selected_mt5_account") || "";
    return "";
  });

  // ✅ bouton Synchroniser + loader + badge
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingKey, setSyncingKey] = useState("");
  const [lastSyncMs, setLastSyncMs] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const v = Number(localStorage.getItem("investpro_mt5_last_sync_ms") || "0");
    return Number.isFinite(v) ? v : 0;
  });

  const selectedAccount = useMemo(() => {
    if (!selectedKey) return null;
    return (accounts as any[]).find((a) => accountKey(a) === selectedKey) ?? null;
  }, [accounts, selectedKey]);

  // start balance depuis le compte
  const start = useMemo(() => {
    const a: any = selectedAccount;
    if (!a) return 10000;
    const s = safeNum(a.startBalance ?? a.start ?? a.initialBalance);
    if (s > 0) return s;
    const b = safeNum(a.balance ?? a.equity ?? a.currentBalance);
    if (b > 0) return b;
    return 10000;
  }, [selectedAccount]);

  useEffect(() => {
    const a = loadMt5Accounts();
    setAccounts(a);
    setTrades(loadTrades());
    // ❌ plus d’auto-select du 1er compte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Sync uniquement via le bouton "Synchroniser"
  async function syncSelected() {
    const a: any = selectedAccount;
    if (!a) {
      pushNotif({
        kind: "warning",
        title: "Aucun compte",
        message: "Sélectionne un compte MT5 avant de synchroniser.",
        ttlMs: 2500,
      });
      return;
    }

    const broker = safeStr(a.broker ?? a.brokerName ?? a.company ?? "");
    const server = safeStr(a.server ?? a.serverName ?? "");
    const login = safeStr(a.login ?? a.accountLogin ?? "");
    const password = safeStr(a.password ?? a.pass ?? a.mt5Password ?? "");

    if (!broker || !server || !login || !password) {
      pushNotif({
        kind: "error",
        title: "Sync MT5 impossible",
        message: `Champs manquants: ${!broker ? "broker " : ""}${!server ? "server " : ""}${!login ? "login " : ""}${!password ? "password" : ""}`.trim(),
        ttlMs: 5000,
      });
      return;
    }

    const to_ts = Math.floor(Date.now() / 1000);
    const from_ts = to_ts - 365 * 24 * 60 * 60;

    setIsSyncing(true);
    setSyncingKey(accountKey(a));

    pushNotif({
      kind: "pending",
      title: "Synchronisation MT5",
      message: `Récupération de l'historique pour ${login}...`,
      ttlMs: 2500,
    });

    try {
      const added = await syncMt5HistoryToTrades({
        broker,
        server,
        login,
        password,
        from_ts,
        to_ts,
      });

      const next = loadTrades();
      setTrades(next);

      const now = Date.now();
      setLastSyncMs(now);
      try {
        localStorage.setItem("investpro_mt5_last_sync_ms", String(now));
      } catch {}

      pushNotif({
        kind: "success",
        title: "MT5 synchronisé",
        message: `Trades ajoutés: ${added} • Total: ${next.length}`,
        ttlMs: 3000,
      });
    } catch (e: any) {
      pushNotif({
        kind: "error",
        title: "Sync MT5 échouée",
        message: e?.message ? String(e.message) : "Impossible de synchroniser.",
        ttlMs: 4500,
      });
      setTrades(loadTrades());
    } finally {
      setIsSyncing(false);
      setSyncingKey("");
    }
  }

  // KPIs
  const kpi = useMemo(() => {
    const total = trades.length;
    const pnl = trades.reduce((s: number, t: any) => s + (Number(t.pnl) || 0), 0);

    const wins = trades.filter((t: any) => t.result === "WIN").length;
    const losses = trades.filter((t: any) => t.result === "LOSS").length;
    const winrate = total > 0 ? (wins / total) * 100 : 0;

    const grossProfit = trades.filter((t: any) => Number(t.pnl) > 0).reduce((s: number, t: any) => s + Number(t.pnl || 0), 0);
    const grossLossAbs = Math.abs(trades.filter((t: any) => Number(t.pnl) < 0).reduce((s: number, t: any) => s + Number(t.pnl || 0), 0));
    const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : grossProfit > 0 ? 999 : 0;

    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLossAbs = losses > 0 ? grossLossAbs / losses : 0;

    const dayMap = new Map<string, number>();
    for (const t of trades as any[]) {
      const d = safeStr(t.date);
      if (!d) continue;
      dayMap.set(d, (dayMap.get(d) ?? 0) + (Number(t.pnl) || 0));
    }
    const days = Array.from(dayMap.entries()).map(([d, dayPnl]) => ({ d, dayPnl }));
    const dayWins = days.filter((x) => x.dayPnl > 0).length;
    const dayLosses = days.filter((x) => x.dayPnl < 0).length;
    const dayTotal = days.length;
    const dayWinPct = dayTotal > 0 ? (dayWins / dayTotal) * 100 : 0;

    const posDays = days.filter((x) => x.dayPnl > 0);
    const totalPos = posDays.reduce((s, x) => s + x.dayPnl, 0);
    const bestDay = posDays.length ? posDays.reduce((a, b) => (b.dayPnl > a.dayPnl ? b : a), posDays[0]) : null;
    const bestDayPctOfProfit = totalPos > 0 && bestDay ? (bestDay.dayPnl / totalPos) * 100 : 0;

    return {
      total,
      pnl,
      wins,
      losses,
      winrate,
      grossProfit,
      grossLossAbs,
      profitFactor,
      avgWin,
      avgLossAbs,
      dayWins,
      dayLosses,
      dayWinPct,
      bestDay,
      bestDayPctOfProfit,
    };
  }, [trades]);

  // Social radar
  const social = useMemo(() => {
    const you = {
      winrate01: clamp(kpi.winrate / 100, 0, 1),
      pf01: clamp(kpi.profitFactor / 6, 0, 1),
      dd01: 0.55,
      pos01: clamp(kpi.total / 200, 0, 1),
      day01: clamp(kpi.dayWinPct / 100, 0, 1),
    };
    const avg = { winrate01: 0.52, pf01: 0.45, dd01: 0.55, pos01: 0.35, day01: 0.5 };
    return { you, avg };
  }, [kpi.winrate, kpi.profitFactor, kpi.total, kpi.dayWinPct]);

  const radarSvg = useMemo(() => {
    const w = 520;
    const h = 360;
    const cx = w / 2;
    const cy = 190;
    const r = 120;

    const axes = ["Winrate", "PF", "DD", "Positions", "Day%"];
    const axisCount = axes.length;
    const gridLevels = [0.2, 0.4, 0.6, 0.8, 1];

    const youVals = [social.you.winrate01, social.you.pf01, social.you.dd01, social.you.pos01, social.you.day01];
    const avgVals = [social.avg.winrate01, social.avg.pf01, social.avg.dd01, social.avg.pos01, social.avg.day01];

    const polyPath = (vals: number[]) => {
      const pts = vals.map((t, i) => radarPoint(cx, cy, r, i, axisCount, t));
      return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
    };

    const youPath = polyPath(youVals);
    const avgPath = polyPath(avgVals);

    const axisLines = axes.map((_, i) => {
      const p = radarPoint(cx, cy, r, i, axisCount, 1);
      return { x1: cx, y1: cy, x2: p.x, y2: p.y };
    });

    const labels = axes.map((name, i) => {
      const p = radarPoint(cx, cy, r + 36, i, axisCount, 1);
      let anchor: "start" | "middle" | "end" = "middle";
      if (p.x < cx - 16) anchor = "end";
      else if (p.x > cx + 16) anchor = "start";
      return { name, x: p.x, y: p.y, anchor };
    });

    return { w, h, cx, cy, r, gridLevels, axisLines, labels, youPath, avgPath };
  }, [social]);

  // Calendar + Σ semaine
  const [viewDate, setViewDate] = useState(() => new Date());

  const calendar = useMemo(() => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const firstDay = new Date(d);
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - startWeekday);

    const days: { date: Date; key: string; pnl: number; count: number }[] = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + i);
      const key = ymd(day);

      const dayTrades = trades.filter((t: any) => safeStr(t.date) === key);
      const pnl = dayTrades.reduce((s: number, t: any) => s + (Number(t.pnl) || 0), 0);

      days.push({ date: day, key, pnl, count: dayTrades.length });
    }
    return days;
  }, [viewDate, trades]);

  const weeks = useMemo(() => {
    const out: { date: Date; key: string; pnl: number; count: number }[][] = [];
    for (let w = 0; w < 6; w++) out.push(calendar.slice(w * 7, w * 7 + 7));
    return out;
  }, [calendar]);

  const weekTotals = useMemo(() => {
    return weeks.map((wk) => wk.reduce((s, d) => s + (Number(d.pnl) || 0), 0));
  }, [weeks]);

  const monthPnl = useMemo(() => {
    const ym = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`;
    return trades
      .filter((t: any) => safeStr(t.date).startsWith(ym))
      .reduce((s: number, t: any) => s + (Number(t.pnl) || 0), 0);
  }, [viewDate, trades]);

  const selectedLabel = selectedAccount ? accountLabel(selectedAccount) : "Choisir un compte MT5";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Rapports <span className="text-[color:var(--gold)]">de performance</span>
          </h1>
          <p className="text-[color:var(--muted)] mt-1">
            Sélectionne un compte, puis clique sur Synchroniser.
          </p>
        </div>

        {/* ✅ align fix : le bouton sync a un label/badge fantôme */}
        <div className="flex items-end gap-3">
          <div className="min-w-[320px]">
            <div className="text-xs text-white/70 mb-1">Compte (MT5)</div>
            <Button
              variant="secondary"
              className="w-full justify-between"
              onClick={() => setOpenAccounts(true)}
              disabled={isSyncing}
            >
              <span className="truncate">{selectedLabel}</span>
              <span className="text-white/60">▾</span>
            </Button>

            <div className="mt-1 text-[11px] text-[color:var(--muted)]">
              Dernière sync :{" "}
              <span className="text-white/70 font-semibold">
                {lastSyncMs ? relSince(lastSyncMs) : "jamais"}
              </span>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="text-xs text-white/70 mb-1 opacity-0 select-none">
              Compte (MT5)
            </div>

            <Button
              variant="secondary"
              onClick={syncSelected}
              disabled={!selectedAccount || isSyncing}
              className="self-end"
            >
              <span className="inline-flex items-center gap-2">
                {isSyncing ? <Spinner /> : null}
                Synchroniser
              </span>
            </Button>

            <div className="mt-1 text-[11px] opacity-0 select-none">
              Dernière sync : —
            </div>
          </div>
        </div>
      </div>

      {/* Modal compte (sélection manuelle, PAS de sync ici) */}
      <Modal
        open={openAccounts}
        onClose={() => (isSyncing ? null : setOpenAccounts(false))}
        title="Choisir le compte MT5"
      >
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <div className="text-sm text-[color:var(--muted)]">Aucun compte trouvé.</div>
          ) : (
            <div className="space-y-2">
              {accounts.map((a: any) => {
                const k = accountKey(a);
                const isOn = selectedAccount && accountKey(selectedAccount) === k;
                const isLoading = isSyncing && syncingKey === k;

                return (
                  <button
                    key={k || Math.random()}
                    onClick={() => {
                      setSelectedKey(k);
                      try {
                        localStorage.setItem("investpro_selected_mt5_account", k);
                      } catch {}
                      setOpenAccounts(false);
                    }}
                    disabled={isSyncing}
                    className={[
                      "w-full text-left rounded-2xl border p-4 transition flex items-center justify-between gap-4",
                      isOn
                        ? "border-[color:var(--gold-border)] bg-[color:var(--gold)]/12"
                        : "border-[color:var(--border)] bg-black/20 hover:bg-black/30",
                      isSyncing ? "opacity-80 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {accountLabel(a) || "Compte"}
                      </div>
                      <div className="text-xs text-[color:var(--muted)] truncate">
                        {safeStr(a.broker ?? a.server ?? "")}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {isLoading ? <Spinner /> : null}
                      <div
                        className={[
                          "h-6 w-6 rounded-md border flex items-center justify-center",
                          isOn
                            ? "border-[color:var(--gold-border)] bg-[color:var(--gold)]/20"
                            : "border-[color:var(--border)] bg-black/20",
                        ].join(" ")}
                      >
                        {isOn ? (
                          <span className="text-[color:var(--success)]">✓</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              variant="secondary"
              onClick={() => setOpenAccounts(false)}
              disabled={isSyncing}
            >
              Fermer
            </Button>
          </div>
        </div>
      </Modal>

      {/* LIGNE 1 : 3 cards */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* WINRATE */}
        <Card>
          <CardBody>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-[color:var(--muted)]">WINRATE %</div>
                <div className="mt-1 text-sm text-white/70">{kpi.total} positions</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-[color:var(--gold)]">
                  {fmt(kpi.winrate)}%
                </div>
                <div className="text-xs">
                  <span className="text-[color:var(--success)]">{kpi.wins} gagnantes</span>
                  <span className="text-white/40"> / </span>
                  <span className="text-[color:var(--danger)]">{kpi.losses} perdantes</span>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-[color:var(--border)] bg-black/20 p-3 flex items-center justify-center">
              <div className="w-full max-w-[520px] aspect-[3/2]">
                {(() => {
                  const cx = 180;
                  const cy = 190;
                  const r = 112;
                  const semi = Math.PI * r;
                  const pct = Math.max(0, Math.min(100, Math.round(kpi.winrate)));
                  const filled = (semi * pct) / 100;
                  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
                  return (
                    <svg viewBox="0 0 360 240" className="w-full h-full block">
                      <path d={d} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="18" strokeLinecap="round" />
                      <path d={d} fill="none" stroke="rgba(214,179,95,0.95)" strokeWidth="18" strokeLinecap="round" strokeDasharray={`${filled} ${semi}`} />
                      <text x={cx} y={cy - 26} textAnchor="middle" fill="rgba(255,255,255,0.92)" fontSize="28" fontWeight="700">
                        {pct}%
                      </text>
                      <text x={cx} y={cy - 6} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="12">
                        Winrate
                      </text>
                    </svg>
                  );
                })()}
              </div>
            </div>

            <div className="mt-3 text-[11px] text-[color:var(--muted)]">
              Compte:{" "}
              <span className="text-white/70">{selectedAccount ? accountKey(selectedAccount) : "—"}</span>{" "}
              • Trades: <span className="text-white/70">{trades.length}</span>
            </div>
          </CardBody>
        </Card>

        {/* DAY WIN */}
        <SemiGaugeCard
          title="Day Win %"
          pct={kpi.dayWinPct}
          subLeft={`${kpi.dayWins} jours +`}
          subRight={`${kpi.dayLosses} jours -`}
        />

        {/* HEXAGONE */}
        <Card>
          <CardBody>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Hexagone social</div>
                <div className="text-xs mt-1 text-white/70">Winrate / PF / Day% / Positions</div>
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                Start: <span className="text-white">{fmt(start)}</span>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-[color:var(--border)] bg-black/20 p-3 relative">
              <div className="w-full aspect-[4/3]">
                <svg viewBox={`0 0 ${radarSvg.w} ${radarSvg.h}`} className="w-full h-full block">
                  {radarSvg.gridLevels.map((lv) => {
                    const pts = Array.from({ length: 5 }).map((_, i) =>
                      radarPoint(radarSvg.cx, radarSvg.cy, radarSvg.r, i, 5, lv)
                    );
                    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
                    return <path key={lv} d={d} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />;
                  })}

                  {radarSvg.axisLines.map((l, i) => (
                    <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                  ))}

                  <path d={radarSvg.avgPath} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
                  <path d={radarSvg.youPath} fill="rgba(214,179,95,0.18)" stroke="rgba(214,179,95,0.95)" strokeWidth="2" />

                  {radarSvg.labels.map((lb) => (
                    <text key={lb.name} x={lb.x} y={lb.y} textAnchor={lb.anchor} dominantBaseline="middle" fill="rgba(255,255,255,0.78)" fontSize="12" fontWeight="600">
                      {lb.name}
                    </text>
                  ))}
                </svg>
              </div>

              <div className="absolute top-3 left-3 text-[11px] px-2 py-1 rounded-full border border-[color:var(--border)] bg-black/55 text-[color:var(--gold)]">
                WR: {fmt(kpi.winrate)}%
              </div>
              <div className="absolute top-3 right-3 text-[11px] px-2 py-1 rounded-full border border-[color:var(--border)] bg-black/55 text-[color:var(--gold)]">
                PF: {fmt(kpi.profitFactor)}
              </div>
              <div className="absolute bottom-3 left-3 text-[11px] px-2 py-1 rounded-full border border-[color:var(--border)] bg-black/55 text-[color:var(--gold)]">
                Day: {fmt(kpi.dayWinPct)}%
              </div>
              <div className="absolute bottom-3 right-3 text-[11px] px-2 py-1 rounded-full border border-[color:var(--border)] bg-black/55 text-[color:var(--gold)]">
                Pos: {kpi.total}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <MiniStat label="P&L" value={fmt(kpi.pnl)} tone={kpi.pnl >= 0 ? "success" : "danger"} />
              <MiniStat label="Best Day %" value={`${fmt(kpi.bestDayPctOfProfit)}%`} tone="gold" />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* LIGNE 2 : widgets */}
      <Card>
        <CardBody>
          <div className="text-lg font-semibold">Best Day % / Profit Factor / Avg Win / Avg Loss</div>
          <div className="text-xs text-[color:var(--muted)] mt-1">Bloc unique (compact, sans vide).</div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Ring
              label="Profit Factor"
              valueText={fmt(kpi.profitFactor)}
              subLeft={kpi.grossProfit ? `+${fmt(kpi.grossProfit)}` : undefined}
              subRight={kpi.grossLossAbs ? `-${fmt(kpi.grossLossAbs)}` : undefined}
              fill01={clamp(kpi.profitFactor / 5, 0, 1)}
            />

            <Ring
              label="Best Day % of Total Profit"
              valueText={`${fmt(kpi.bestDayPctOfProfit)}%`}
              subLeft={kpi.bestDay ? kpi.bestDay.d : undefined}
              subRight={kpi.bestDay ? `+${fmt(kpi.bestDay.dayPnl)}` : undefined}
              fill01={clamp(kpi.bestDayPctOfProfit / 100, 0, 1)}
            />

            <AvgBar
              rrText={kpi.avgLossAbs > 0 ? fmt(kpi.avgWin / kpi.avgLossAbs) : "—"}
              avgWin={kpi.avgWin}
              avgLossAbs={kpi.avgLossAbs}
            />
          </div>
        </CardBody>
      </Card>

      {/* LIGNE 3 : calendrier + total semaine */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">
              Calendrier P&L —{" "}
              <span className="text-[color:var(--gold)]">{monthLabel(viewDate)}</span>
            </div>
            <div className="text-sm text-[color:var(--muted)]">
              Monthly P/L:{" "}
              <span className={monthPnl >= 0 ? "text-[color:var(--success)] font-semibold" : "text-[color:var(--danger)] font-semibold"}>
                {fmt(monthPnl)}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-8 gap-2 text-xs text-[color:var(--muted)]">
            {["Lu","Ma","Me","Je","Ve","Sa","Di"].map((d) => (
              <div key={d} className="px-2">{d}</div>
            ))}
            <div className="px-2 text-right">Σ Semaine</div>
          </div>

          <div className="mt-2 space-y-2">
            {weeks.map((week, wi) => {
              const total = weekTotals[wi] ?? 0;
              const totalClass =
                total > 0 ? "text-[color:var(--success)]" : total < 0 ? "text-[color:var(--danger)]" : "text-white/60";

              return (
                <div key={wi} className="grid grid-cols-8 gap-2">
                  {week.map((c) => {
                    const inMonth = c.date.getMonth() === viewDate.getMonth();
                    const bg =
                      c.pnl > 0
                        ? "bg-[color:var(--success)]/12 border-[color:var(--success)]/25"
                        : c.pnl < 0
                        ? "bg-[color:var(--danger)]/12 border-[color:var(--danger)]/25"
                        : "bg-black/20 border-[color:var(--border)]";

                    return (
                      <div key={c.key} className={["min-h-[78px] rounded-2xl border p-2", bg, inMonth ? "" : "opacity-40"].join(" ")}>
                        <div className="text-xs text-white/70">{c.date.getDate()}</div>
                        <div className={["mt-2 text-sm font-semibold", c.pnl >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"].join(" ")}>
                          {c.count ? fmt(c.pnl) : ""}
                        </div>
                        <div className="text-[11px] text-[color:var(--muted)]">{c.count ? `${c.count} trades` : ""}</div>
                      </div>
                    );
                  })}

                  <div className="min-h-[78px] rounded-2xl border border-[color:var(--border)] bg-black/25 p-3 flex flex-col justify-between">
                    <div className="text-xs text-white/70 text-right">Total</div>
                    <div className={["text-lg font-bold text-right", totalClass].join(" ")}>{fmt(total)}</div>
                    <div className="text-[11px] text-[color:var(--muted)] text-right">S{wi + 1}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
            >
              ← Mois précédent
            </Button>
            <Button
              variant="secondary"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
            >
              Mois suivant →
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
