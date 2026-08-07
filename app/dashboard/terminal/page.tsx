"use client";

import { useEffect, useMemo, useState, useId } from "react";

import { Card, CardBody } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import GoldSelect from "../../../components/ui/GoldSelect";

import { getPlan, hasTradingTerminalAccess } from "../../../lib/subscriptionStore";
import { loadMt5Accounts, Mt5Account } from "../../../lib/mt5Store";
import { syncMt5HistoryToTrades } from "../../../lib/mt5sync";
import { loadTrades } from "../../../lib/tradesStore";
import { pushNotif } from "../../../lib/notifyStore";

import MaintenanceModal from "../../../components/ui/MaintenanceModal";
import { useMaintenance } from "../../../lib/adminStore";

import { usePrefs, lockTrading, unlockTrading, isTradeLocked } from "../../../lib/prefsStore";

import { Lock, ShieldAlert } from "lucide-react";

/* -------------------------------- Types -------------------------------- */
type Mode3 = "" | "MARKET" | "LIMIT" | "STOP_LIMIT";
type Side = "NONE" | "BUY" | "SELL";
type SymbolCat = "all" | "forex" | "crypto" | "indices" | "metals" | "other";

type SymbolInfo = {
  ok: true;
  name: string;
  tick_size: number;
  tick_value: number;
  digits: number;
  min_lot?: number;
  lot_step?: number;
};

type Tick = {
  symbol: string;
  bid: number;
  ask: number;
  digits: number;
  time?: number;
};

type Ordre = {
  id: string; // "A","B","C"...
  entry: string;
  sl: string;
  tp: string;
  enabled: boolean;
};

/* -------------------------------- Helpers -------------------------------- */
function fmt(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}
function fmt2(n: number) {
  if (!Number.isFinite(n)) return "—";
  return Number(n).toFixed(2);
}
function toNum(v: string) {
  if (v == null) return NaN;
  const s = String(v).trim().replace(",", ".");
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/* -------------------- Time helpers (Paris) -------------------- */
function parisYMD(d: Date) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const da = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${da}`;
}

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hh > 0) return `${hh}h ${pad(mm)}m`;
  return `${mm}m ${pad(ss)}s`;
}

function validateLevels(side: Side, entry: number, sl?: number, tp?: number) {
  if (!Number.isFinite(entry) || entry <= 0) return { ok: true as const };

  const hasSL = Number.isFinite(sl as number) && (sl as number) > 0;
  const hasTP = Number.isFinite(tp as number) && (tp as number) > 0;

  if (side === "NONE") return { ok: true as const };

  if (side === "BUY") {
    if (hasSL && (sl as number) >= entry) {
      return { ok: false as const, error: "BUY: le Stop Loss doit être en dessous du prix d’entrée." };
    }
    if (hasTP && (tp as number) <= entry) {
      return { ok: false as const, error: "BUY: le Take Profit doit être au dessus du prix d’entrée." };
    }
  }

  if (side === "SELL") {
    if (hasSL && (sl as number) <= entry) {
      return { ok: false as const, error: "SELL: le Stop Loss doit être au dessus du prix d’entrée." };
    }
    if (hasTP && (tp as number) >= entry) {
      return { ok: false as const, error: "SELL: le Take Profit doit être en dessous du prix d’entrée." };
    }
  }

  return { ok: true as const };
}

async function fetchJson(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const ct = r.headers.get("content-type") || "";
  const text = await r.text();

  if (!ct.includes("application/json")) {
    throw new Error(`API non-JSON (${r.status}) : ${text.slice(0, 200)}`);
  }

  const j = JSON.parse(text);
  if (!r.ok || !j?.ok) throw new Error(j?.error || `API error (${r.status})`);
  return j;
}

function InputCompact({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  readOnly,
  listId,
  inputMode = "decimal",
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  listId?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <div className="w-full">
      <div className="text-[11px] text-white/60 mb-1">{label}</div>
      <input
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        readOnly={readOnly}
        list={listId}
        className={[
          "w-full h-9 px-3 rounded-xl",
          "bg-black/25 border border-white/10",
          "text-white placeholder:text-white/25 outline-none",
          "focus:border-[color:var(--gold-border)] focus:ring-2 focus:ring-[color:var(--gold-soft)] transition",
          readOnly ? "opacity-80 cursor-not-allowed" : "",
        ].join(" ")}
      />
    </div>
  );
}

function orderTypeLabel(type: number) {
  if (type === 0) return "BUY";
  if (type === 1) return "SELL";
  return String(type);
}
function pendingTypeLabel(type: number) {
  if (type === 2) return "BUY LIMIT";
  if (type === 3) return "SELL LIMIT";
  if (type === 4) return "BUY STOP";
  if (type === 5) return "SELL STOP";
  return `TYPE ${type}`;
}

/** ✅ Estimation PnL (USD) via tick_value/tick_size */
function pnlBetweenUSD(priceA: number, priceB: number, lots: number, info: SymbolInfo | null): number | null {
  if (!info) return null;
  const tickSize = Number(info.tick_size || 0);
  const tickVal = Number(info.tick_value || 0);
  if (!Number.isFinite(tickSize) || tickSize <= 0) return null;
  if (!Number.isFinite(tickVal) || tickVal <= 0) return null;

  const dist = Math.abs(priceA - priceB);
  const ticksN = dist / tickSize;
  if (!Number.isFinite(ticksN) || ticksN < 0) return null;

  const mag = ticksN * tickVal * lots;
  return Number.isFinite(mag) ? mag : null;
}

/* ------------------------ Lock modal (Terminal) ------------------------ */
function LockModal(props: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={props.open}
      title="Bloquer le compte"
      onClose={props.onClose}
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" onClick={props.onClose}>
            Annuler
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-[color:var(--muted)]">Bloque le trading depuis InvestPro (anti revenge trade).</div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              lockTrading("15m", "Blocage terminal");
              props.onClose();
              pushNotif({ kind: "warning", title: "Blocage", message: "Compte bloqué 15 minutes." });
            }}
          >
            15 min
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              lockTrading("30m", "Blocage terminal");
              props.onClose();
              pushNotif({ kind: "warning", title: "Blocage", message: "Compte bloqué 30 minutes." });
            }}
          >
            30 min
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              lockTrading("1h", "Blocage terminal");
              props.onClose();
              pushNotif({ kind: "warning", title: "Blocage", message: "Compte bloqué 1 heure." });
            }}
          >
            1h
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              lockTrading("eod", "Blocage terminal");
              props.onClose();
              pushNotif({ kind: "warning", title: "Blocage", message: "Compte bloqué jusqu’à 00:00 (FR)." });
            }}
            title="Jusqu’à demain 00:00 (heure FR)"
          >
            Fin journée
          </Button>
        </div>

        <div className="text-[11px] text-[color:var(--muted)]">
          Le blocage s’applique à l’interface InvestPro (pas à MT5 directement).
        </div>
      </div>
    </Modal>
  );
}

/* -------------------- TradingView API widget (NO iframe) -------------------- */
let __tvScriptPromise: Promise<void> | null = null;

function loadTradingViewScript() {
  if (__tvScriptPromise) return __tvScriptPromise;

  __tvScriptPromise = new Promise<void>((resolve) => {
    if ((window as any).TradingView?.widget) {
      resolve();
      return;
    }

    const existing = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]') as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      window.setTimeout(() => resolve(), 300);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });

  return __tvScriptPromise;
}

function TradingViewApiChart(props: { symbol: string }) {
  const { symbol } = props;

  // ✅ FIX HYDRATION : ID stable server/client
  const rid = useId();
  const containerId = useMemo(() => `tv_${rid.replace(/:/g, "")}`, [rid]);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      await loadTradingViewScript();
      if (cancelled) return;

      const tv = (window as any).TradingView;
      if (!tv?.widget) return;

      const el = document.getElementById(containerId);
      if (el) el.innerHTML = "";

      // eslint-disable-next-line no-new
      new tv.widget({
        autosize: true,
        symbol: symbol || "BTCUSD",
        interval: "15",
        timezone: "Europe/Paris",
        theme: "dark",
        style: "1",
        locale: "fr",
        toolbar_bg: "rgba(0,0,0,0)",
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        save_image: false,
        calendar: true,
        container_id: containerId,
      });
    }

    mount();
    return () => {
      cancelled = true;
      const el = document.getElementById(containerId);
      if (el) el.innerHTML = "";
    };
  }, [containerId, symbol]);

  return <div id={containerId} className="w-full h-[700px]" />;
}

/* -------------------- Mini progress bars (Daily Loss / Profit) -------------------- */
function MiniProgress({
  label,
  left,
  right,
  valuePct,
}: {
  label: string;
  left: string;
  right: string;
  valuePct: number; // 0..100
}) {
  const pct = Number.isFinite(valuePct) ? clamp(valuePct, 0, 100) : 0;
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="flex items-center justify-between text-xs text-white/80">
        <span className="font-semibold">{label}</span>
        <span className="text-white/60">{right}</span>
      </div>

      <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, rgba(214,179,95,.55), rgba(245,230,168,.9), rgba(214,179,95,.55))",
            boxShadow: pct > 0 ? "0 0 10px rgba(214,179,95,.55)" : "none",
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-white/55">
        <span>{left}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

/* -------------------------------- Page -------------------------------- */
export default function TerminalPage() {
  const { rules, lock } = usePrefs();

  // ✅ Maintenance flag
  const [maintenanceTerminal, setMaintenanceTerminal] = useState(false);

  // ✅ FIX: on récupère la maintenance via le hook (plus de getAdminStatus undefined)
  const maint = useMaintenance();
  useEffect(() => {
    const v =
      typeof maint === "boolean"
        ? maint
        : Boolean(
            (maint as any)?.terminal ??
              (maint as any)?.maintTerminal ??
              (maint as any)?.maintenanceTerminal ??
              (maint as any)?.targets?.terminal
          );
    setMaintenanceTerminal(v);
  }, [maint]);

  const [accounts, setAccounts] = useState<Mt5Account[]>([]);
  const connectedAccounts = useMemo(() => accounts.filter((a) => a.status === "CONNECTED"), [accounts]);

  const [selectedId, setSelectedId] = useState<string>("");
  const selectedAccount = useMemo(
    () => connectedAccounts.find((a) => a.id === selectedId) ?? null,
    [connectedAccounts, selectedId]
  );

  const [openAccountsModal, setOpenAccountsModal] = useState(false);
  const [openGateModal, setOpenGateModal] = useState(false);
  const [gateReason, setGateReason] = useState<"noPlan" | "noAccounts" | null>(null);

  const [category, setCategory] = useState<SymbolCat>("all");
  const [symbols, setSymbols] = useState<{ name: string; category: SymbolCat; path?: string }[]>([]);
  const [symbolsLoaded, setSymbolsLoaded] = useState(false);

  const filteredSymbols = useMemo(
    () => (category === "all" ? symbols : symbols.filter((s) => s.category === category)),
    [symbols, category]
  );

  const [symbol, setSymbol] = useState("");
  const [mode, setMode] = useState<Mode3>("");
  const [side, setSide] = useState<Side>("NONE");

  const [ordres, setOrdres] = useState<Ordre[]>([{ id: "A", entry: "", sl: "", tp: "", enabled: true }]);
  const [ordreActifId, setOrdreActifId] = useState<string>("A");
  const ordreActif = useMemo(() => ordres.find((o) => o.id === ordreActifId) ?? ordres[0], [ordres, ordreActifId]);
  const ordresON = useMemo(() => ordres.filter((o) => o.enabled), [ordres]);

  const [stopPrice, setStopPrice] = useState("");

  const [capitalUsd, setCapitalUsd] = useState("0");
  // ✅ on autorise vide pendant la saisie, et on clamp au blur
  const [riskPct, setRiskPct] = useState("1.00");
  const [riskUsd, setRiskUsd] = useState("0");
  const [calcBase, setCalcBase] = useState<"BALANCE" | "EQUITY">("BALANCE");

  const [deductCommission, setDeductCommission] = useState(false);
  const [commissionPerLot, setCommissionPerLot] = useState("0");

  const [symbolInfo, setSymbolInfo] = useState<SymbolInfo | null>(null);
  const [symbolInfoMap, setSymbolInfoMap] = useState<Record<string, SymbolInfo>>({});

  const [tick, setTick] = useState<Tick | null>(null);

  // ✅ Prix global
  const priceBid = useMemo(() => (tick ? Number(tick.bid) : NaN), [tick]);
  const priceAsk = useMemo(() => (tick ? Number(tick.ask) : NaN), [tick]);
  const marketStr = useMemo(() => (Number.isFinite(priceBid) ? fmt2(priceBid) : "—"), [priceBid]);
  const askStr = useMemo(() => (Number.isFinite(priceAsk) ? fmt2(priceAsk) : "—"), [priceAsk]);
  const spreadStr = useMemo(() => {
    if (!Number.isFinite(priceBid) || !Number.isFinite(priceAsk)) return "—";
    return fmt2(Math.abs(priceAsk - priceBid));
  }, [priceBid, priceAsk]);

  const [positions, setPositions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [showPositions, setShowPositions] = useState(true);
  const [showOrders, setShowOrders] = useState(true);

  const [ticksMapLive, setTicksMapLive] = useState<Record<string, { bid: number; ask: number; digits?: number }>>({});

  const symbolsToWatch = useMemo(() => {
    const set = new Set<string>();
    positions.forEach((p: any) => p?.symbol && set.add(String(p.symbol)));
    orders.forEach((o: any) => o?.symbol && set.add(String(o.symbol)));
    if (symbol) set.add(symbol);
    return Array.from(set);
  }, [positions, orders, symbol]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ✅ Progress
  const progressPct = useMemo(() => {
    const symOk = symbol.trim().length > 0;
    const modeOk = mode !== "";
    const sideOk = side !== "NONE";
    const entryOk = toNum(ordreActif?.entry) > 0;
    const slOk = toNum(ordreActif?.sl) > 0;
    const riskOk = toNum(riskUsd) > 0;

    if (!symOk && !modeOk && !sideOk && !entryOk && !slOk && !riskOk) return 0;

    const checks = [symOk, modeOk, sideOk, entryOk, slOk, riskOk];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }, [symbol, mode, side, ordreActif?.entry, ordreActif?.sl, riskUsd]);

  // ✅ Lock countdown
  const [openLockModal, setOpenLockModal] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const locked = lock.active && lock.untilMs > nowMs;
  const lockRemaining = locked ? lock.untilMs - nowMs : 0;

  // ✅ KPIs today
  const todayYMD = useMemo(() => parisYMD(new Date()), []);
  const tradesClosedToday = useMemo(() => {
    const all = loadTrades();
    const list = Array.isArray(all) ? all : [];
    return list.filter((t: any) => {
      const ts = t?.closedAt || t?.closedTime || t?.date || t?.time || t?.createdAt;
      if (!ts) return false;
      const d = new Date(ts);
      if (String(d) === "Invalid Date") return false;
      return parisYMD(d) === todayYMD;
    });
  }, [busy, todayYMD]);

  const realizedToday = useMemo(
    () => tradesClosedToday.reduce((sum: number, t: any) => sum + Number(t?.pnl ?? t?.profit ?? 0), 0),
    [tradesClosedToday]
  );

  // ✅ (on garde le calcul pour tes règles internes)
  const slCountToday = useMemo(() => {
    return tradesClosedToday.reduce((n: number, t: any) => {
      const res = String(t?.result ?? "").toUpperCase();
      const pnl = Number(t?.pnl ?? t?.profit ?? 0);
      const isLoss = res === "LOSS" || (res === "" && Number.isFinite(pnl) && pnl < 0);
      return n + (isLoss ? 1 : 0);
    }, 0);
  }, [tradesClosedToday]);

  const unrealizedNow = useMemo(() => positions.reduce((acc, p) => acc + Number(p?.profit ?? 0), 0), [positions]);

  const ruleAlerts = useMemo(() => {
    const a: string[] = [];
    if (!rules?.enabled) return a;

    if (rules.maxSLPerDay > 0 && slCountToday >= rules.maxSLPerDay) {
      a.push(`⚠️ Limite SL atteinte : ${slCountToday}/${rules.maxSLPerDay}`);
    }
    if (rules.dailyLossMax > 0 && realizedToday <= -Math.abs(rules.dailyLossMax)) {
      a.push(`⛔ Daily loss atteint : ${fmt(realizedToday)}$ (max -${rules.dailyLossMax}$)`);
    }
    if (rules.dailyProfitTarget > 0 && realizedToday >= rules.dailyProfitTarget) {
      a.push(`✅ Objectif atteint : +${fmt(realizedToday)}$ (target +${rules.dailyProfitTarget}$)`);
    }
    return a;
  }, [rules?.enabled, rules?.maxSLPerDay, rules?.dailyLossMax, rules?.dailyProfitTarget, slCountToday, realizedToday]);

  // ✅ barres PDDL/PDPT (comme ton screen)
  const dailyLossMax = useMemo(() => Math.max(0, Number(rules?.dailyLossMax ?? 0)), [rules?.dailyLossMax]);
  const dailyProfitTarget = useMemo(() => Math.max(0, Number(rules?.dailyProfitTarget ?? 0)), [rules?.dailyProfitTarget]);

  const pddlUsed = useMemo(() => (realizedToday < 0 ? Math.abs(realizedToday) : 0), [realizedToday]);
  const pdptDone = useMemo(() => (realizedToday > 0 ? realizedToday : 0), [realizedToday]);

  const pddlPct = useMemo(() => {
    if (!dailyLossMax) return 0;
    return (pddlUsed / dailyLossMax) * 100;
  }, [pddlUsed, dailyLossMax]);

  const pdptPct = useMemo(() => {
    if (!dailyProfitTarget) return 0;
    return (pdptDone / dailyProfitTarget) * 100;
  }, [pdptDone, dailyProfitTarget]);

  const needsStop = useMemo(() => mode === "STOP_LIMIT", [mode]);

  // ✅ Total PnL (positions ouvertes)
  const totalPnl = useMemo(() => {
    const sum = positions.reduce((acc, p) => acc + Number(p?.profit ?? 0), 0);
    return Number.isFinite(sum) ? sum : 0;
  }, [positions]);
  const totalPnlStr = useMemo(() => fmt(totalPnl), [totalPnl]);

  /* =========================
     Init comptes
     ========================= */
  useEffect(() => {
    const list = loadMt5Accounts();
    setAccounts(list);
    const first = list.find((x) => x.status === "CONNECTED");
    if (first) setSelectedId(first.id);
  }, []);

    /* =========================
     API helpers
     ========================= */
  async function syncCapital() {
    if (!selectedAccount) return;
    const j = await fetchJson("/api/mt5/test", {
      broker: selectedAccount.broker,
      server: selectedAccount.server,
      login: selectedAccount.login,
      password: (selectedAccount as any).password ?? "",
    });

    const bal = Number(j.snapshot?.balance ?? 0);
    const eq = Number(j.snapshot?.equity ?? 0);
    const base = calcBase === "EQUITY" ? eq : bal;
    if (Number.isFinite(base) && base > 0) setCapitalUsd(String(base));
  }

  async function syncTodayHistory() {
    if (!selectedAccount) return;
    try {
      const to = Math.floor(Date.now() / 1000);
      const from = to - 48 * 3600;
      await syncMt5HistoryToTrades({
        broker: selectedAccount.broker,
        server: selectedAccount.server,
        login: selectedAccount.login,
        password: (selectedAccount as any).password ?? "",
        from_ts: from,
        to_ts: to,
      });
    } catch {}
  }

  async function syncSymbols() {
    if (!selectedAccount) throw new Error("Choisis un compte.");
    const j = await fetchJson("/api/mt5/symbols", {
      broker: selectedAccount.broker,
      server: selectedAccount.server,
      login: selectedAccount.login,
      password: (selectedAccount as any).password ?? "",
      category,
    });

    const list = Array.isArray(j.symbols) ? j.symbols : [];
    setSymbols(list);
    setSymbolsLoaded(true);

    if (symbol && !list.some((s: any) => s.name === symbol)) {
      const found =
        list.find((s: any) => s.name.startsWith(symbol + ".")) ||
        list.find((s: any) => String(s.name).toLowerCase().startsWith(symbol.toLowerCase()));
      if (found) setSymbol(found.name);
    }
  }

  async function loadSymbolInfo(sym: string) {
    if (!selectedAccount) return;
    const s = String(sym || "").trim();
    if (!s) return;

    const j = await fetchJson("/api/mt5/symbol_info", {
      broker: selectedAccount.broker,
      server: selectedAccount.server,
      login: selectedAccount.login,
      password: (selectedAccount as any).password ?? "",
      symbol: s,
    });

    const info = j.info as SymbolInfo;
    setSymbolInfo(info);
    setSymbolInfoMap((p) => ({ ...p, [s]: info }));
  }

  async function loadTick(sym: string) {
    if (!selectedAccount) return;
    const s = String(sym || "").trim();
    if (!s) return;

    const j = await fetchJson("/api/mt5/tick", {
      broker: selectedAccount.broker,
      server: selectedAccount.server,
      login: selectedAccount.login,
      password: (selectedAccount as any).password ?? "",
      symbol: s,
    });
    setTick(j.tick as Tick);
  }

  async function refreshPositions() {
    if (!selectedAccount) return;
    const j = await fetchJson("/api/mt5/positions", {
      broker: selectedAccount.broker,
      server: selectedAccount.server,
      login: selectedAccount.login,
      password: (selectedAccount as any).password ?? "",
    });
    setPositions(Array.isArray(j.positions) ? j.positions : []);
  }

  async function refreshOrders() {
    if (!selectedAccount) return;
    const j = await fetchJson("/api/mt5/orders", {
      broker: selectedAccount.broker,
      server: selectedAccount.server,
      login: selectedAccount.login,
      password: (selectedAccount as any).password ?? "",
    });
    setOrders(Array.isArray(j.orders) ? j.orders : []);
  }

  async function refreshTicks() {
    if (!selectedAccount) return;
    if (symbolsToWatch.length === 0) return;

    const j = await fetchJson("/api/mt5/ticks", {
      broker: selectedAccount.broker,
      server: selectedAccount.server,
      login: selectedAccount.login,
      password: (selectedAccount as any).password ?? "",
      symbols: symbolsToWatch,
    });

    const next: Record<string, { bid: number; ask: number; digits?: number }> = {};
    for (const [sym, v] of Object.entries(j.ticks || {})) {
      const vv: any = v;
      if (vv?.ok && Number.isFinite(vv.bid) && Number.isFinite(vv.ask)) {
        next[String(sym)] = { bid: Number(vv.bid), ask: Number(vv.ask), digits: Number(vv.digits ?? 0) };
      }
    }
    setTicksMapLive((prev) => ({ ...prev, ...next }));
  }

  async function ensureSymbolInfo(sym: string): Promise<SymbolInfo | null> {
    const s = String(sym || "").trim();
    if (!s || !selectedAccount) return null;

    if (symbolInfoMap[s]) return symbolInfoMap[s];

    try {
      const j = await fetchJson("/api/mt5/symbol_info", {
        broker: selectedAccount.broker,
        server: selectedAccount.server,
        login: selectedAccount.login,
        password: (selectedAccount as any).password ?? "",
        symbol: s,
      });

      const info = j.info as SymbolInfo;
      setSymbolInfoMap((p) => ({ ...p, [s]: info }));
      return info;
    } catch {
      return null;
    }
  }

  /* =========================
     Loops
     ========================= */
  useEffect(() => {
    if (!selectedAccount) return;
    refreshTicks().catch(() => {});
    const t = window.setInterval(() => refreshTicks().catch(() => {}), 2500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount?.id, symbolsToWatch.join("|")]);

  useEffect(() => {
    if (!selectedAccount) return;

    refreshPositions().catch(() => {});
    refreshOrders().catch(() => {});
    syncCapital().catch(() => {});

    const t = window.setInterval(() => {
      refreshPositions().catch(() => {});
      refreshOrders().catch(() => {});
      if (symbol.trim()) loadTick(symbol.trim()).catch(() => {});
    }, 3000);

    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount?.id, symbol, calcBase]);

  useEffect(() => {
    if (!selectedAccount) return;
    if (!symbol.trim()) return;

    const tt = window.setTimeout(async () => {
      try {
        await loadSymbolInfo(symbol.trim());
      } catch (e: any) {
        setSymbolInfo(null);
        setMsg("❌ symbol_info: " + String(e?.message ?? e));
        pushNotif({ kind: "error", title: "Erreur", message: "symbol_info impossible", ttlMs: 8000 });
      }
      try {
        await loadTick(symbol.trim());
      } catch {
        setTick(null);
      }
    }, 250);

    return () => window.clearTimeout(tt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, selectedAccount?.id]);

  useEffect(() => {
    if (mode === "MARKET") setStopPrice("");
  }, [mode]);

  // ✅ Market => auto-fill entry
  useEffect(() => {
    if (!tick) return;
    if (mode !== "MARKET") return;
    if (side === "NONE") return;

    const px = side === "BUY" ? Number(tick.ask) : Number(tick.bid);
    if (!Number.isFinite(px) || px <= 0) return;

    const s = px.toFixed(2);
    setOrdres((prev) => prev.map((o) => ({ ...o, entry: s })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick?.bid, tick?.ask, mode, side]);

  // ✅ Limit/StopLimit => prefill entry A once if empty
  useEffect(() => {
    if (!tick) return;
    if (!(mode === "LIMIT" || mode === "STOP_LIMIT")) return;
    if (side === "NONE") return;

    const entryA = ordres.find((o) => o.id === "A")?.entry ?? "";
    if (entryA.trim()) return;

    const px = side === "BUY" ? Number(tick.ask) : Number(tick.bid);
    if (!Number.isFinite(px) || px <= 0) return;

    setOrdres((prev) => prev.map((o) => (o.id === "A" ? { ...o, entry: px.toFixed(2) } : o)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick?.bid, tick?.ask, mode, side]);

  /* =========================
     Risk clamp + sync
     ========================= */
  function onChangeRiskUsd(v: string) {
    setRiskUsd(v);
    const cap = toNum(capitalUsd);
    const raw = toNum(v);
    if (!Number.isFinite(cap) || cap <= 0) return;
    if (!Number.isFinite(raw) || raw < 0) return;
    setRiskPct(((raw / cap) * 100).toFixed(2));
  }

  function onBlurRiskUsd() {
    const raw = toNum(riskUsd);
    if (!Number.isFinite(raw)) return;
    const next = Math.max(0, raw);
    setRiskUsd(next.toFixed(2));
  }

  function onChangeRiskPct(v: string) {
    setRiskPct(v);
    const cap = toNum(capitalUsd);
    const rp = toNum(v);
    if (!Number.isFinite(cap) || cap <= 0) return;
    if (!Number.isFinite(rp)) return;

    const rpClamped = clamp(rp, 0.01, 100);
    const usd = (cap * rpClamped) / 100;
    setRiskUsd(usd.toFixed(2));
  }

  function onBlurRiskPct() {
    const rp = toNum(riskPct);
    if (!Number.isFinite(rp)) {
      setRiskPct("0.01");
      return;
    }
    const rpClamped = clamp(rp, 0.01, 100);
    setRiskPct(rpClamped.toFixed(2));

    const cap = toNum(capitalUsd);
    if (Number.isFinite(cap) && cap > 0) {
      const usd = (cap * rpClamped) / 100;
      setRiskUsd(usd.toFixed(2));
    }
  }

  useEffect(() => {
    const cap = toNum(capitalUsd);
    const rp = toNum(riskPct);
    if (!Number.isFinite(cap) || cap <= 0) return;
    if (!Number.isFinite(rp) || rp < 0) return;
    const rpClamped = clamp(rp, 0.01, 100);
    const usd = (cap * rpClamped) / 100;
    setRiskUsd(usd.toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capitalUsd]);

  /* =========================
     Ordres helpers
     ========================= */
  function nextOrdreId(cur: Ordre[]) {
    const alpha = "ABCDEFGHIJ";
    const used = new Set(cur.map((x) => x.id));
    for (const ch of alpha) if (!used.has(ch)) return ch;
    return null;
  }

  function addOrdre() {
    setOrdres((prev) => {
      const id = nextOrdreId(prev);
      if (!id) {
        pushNotif({ kind: "warning", title: "Limite atteinte", message: "Maximum 10 ordres.", ttlMs: 7000 });
        return prev;
      }
      return [...prev, { id, entry: "", sl: "", tp: "", enabled: true }];
    });
  }

  function removeOrdre() {
    setOrdres((prev) => {
      if (prev.length <= 1) return prev;
      const out = prev.slice(0, -1);
      setOrdreActifId(out[out.length - 1]?.id ?? "A");
      return out;
    });
  }

  function setOrdreField(id: string, field: "entry" | "sl" | "tp", value: string) {
    setOrdres((prev) => prev.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
  }

  function toggleOrdre(id: string) {
    setOrdres((prev) => prev.map((o) => (o.id === id ? { ...o, enabled: !o.enabled } : o)));
  }

  const riskMoneyTotal = useMemo(() => {
    const ru = toNum(riskUsd);
    return Number.isFinite(ru) && ru > 0 ? ru : 0;
  }, [riskUsd]);

  const riskMoneyPerOrdre = useMemo(() => {
    const n = Math.max(1, ordresON.length);
    return riskMoneyTotal / n;
  }, [riskMoneyTotal, ordresON.length]);

  function lotsForOrdre(o: Ordre) {
    const entry = toNum(o.entry);
    const sl = toNum(o.sl);

    if (!symbolInfo) return { lots: 0, reason: "sync_symbol" as const };
    if (!Number.isFinite(entry) || entry <= 0) return { lots: 0, reason: "entry" as const };
    if (!Number.isFinite(sl) || sl <= 0) return { lots: 0, reason: "sl" as const };

    const tickSize = Number(symbolInfo.tick_size || 0);
    const tickVal = Number(symbolInfo.tick_value || 0);
    if (!tickSize) return { lots: 0, reason: "tick_size" as const };
    if (!tickVal) return { lots: 0, reason: "tick_value" as const };

    const dist = Math.abs(entry - sl);
    if (dist <= 0) return { lots: 0, reason: "sl_dist" as const };

    const ticksN = dist / tickSize;
    const riskPerLot = ticksN * tickVal;
    if (!riskPerLot) return { lots: 0, reason: "risk_per_lot" as const };

    const comm = toNum(commissionPerLot);
    const commEff = deductCommission && Number.isFinite(comm) && comm > 0 ? comm : 0;
    const usable = Math.max(0, riskMoneyPerOrdre - commEff);

    let lots = usable / riskPerLot;

    const step = symbolInfo.lot_step ?? 0.01;
    const min = symbolInfo.min_lot ?? step;

    lots = Math.floor(lots / step) * step;
    lots = Number(lots.toFixed(4));
    if (lots < min) lots = 0;

    return { lots, reason: "ok" as const };
  }

  const lotsActif = useMemo(
    () => lotsForOrdre(ordreActif),
    [ordreActif, symbolInfo, riskMoneyPerOrdre, commissionPerLot, deductCommission]
  );

  const expRewardActif = useMemo(() => {
    const r = lotsForOrdre(ordreActif);
    if (r.reason !== "ok" || r.lots <= 0 || !symbolInfo) return 0;

    const tp = toNum(ordreActif.tp);
    const entry = toNum(ordreActif.entry);
    if (!Number.isFinite(tp) || tp <= 0 || !Number.isFinite(entry) || entry <= 0) return 0;

    const tickSize = Number(symbolInfo.tick_size || 0);
    const tickVal = Number(symbolInfo.tick_value || 0);
    if (!tickSize || !tickVal) return 0;

    const dist = Math.abs(tp - entry);
    const ticksN = dist / tickSize;
    return ticksN * tickVal * r.lots;
  }, [ordreActif, symbolInfo, riskMoneyPerOrdre, commissionPerLot, deductCommission]);

  const rrActif = useMemo(() => {
    if (!riskMoneyPerOrdre || !expRewardActif) return 0;
    return expRewardActif / riskMoneyPerOrdre;
  }, [riskMoneyPerOrdre, expRewardActif]);

  /* =========================
     Actions
     ========================= */
  async function syncAll() {
    if (!selectedAccount) return;

    try {
      setBusy(true);

      const to = Math.floor(Date.now() / 1000);
      const from = to - 7 * 24 * 3600;

      const added = await syncMt5HistoryToTrades({
        broker: selectedAccount.broker,
        server: selectedAccount.server,
        login: selectedAccount.login,
        password: (selectedAccount as any).password ?? "",
        from_ts: from,
        to_ts: to,
      });

      await syncCapital();
      await syncSymbols();

      if (symbol.trim()) {
        await loadSymbolInfo(symbol.trim());
        await loadTick(symbol.trim());
      }

      pushNotif({ kind: "success", title: "Sync terminé", message: `+${added} trade(s)`, ttlMs: 8000 });
      setMsg(`✅ Sync OK : +${added} trades • symboles OK`);
    } catch (e: any) {
      pushNotif({ kind: "error", title: "Erreur Sync", message: String(e?.message ?? e), ttlMs: 12000 });
      setMsg("❌ Sync: " + String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function placeAllOrdres() {
    setMsg(null);

    if (isTradeLocked()) {
      pushNotif({
        kind: "warning",
        title: "Compte bloqué",
        message: `Impossible de prendre un trade. Temps restant: ${fmtCountdown(lockRemaining)}.`,
        ttlMs: 9000,
      });
      return;
    }

    if (!selectedAccount) return setMsg("Choisis un compte.");
    if (!symbol.trim()) return setMsg("Choisis un symbol.");
    if (!mode) return setMsg("Choisis un type d’ordre.");
    if (side === "NONE") return setMsg("Choisis BUY ou SELL.");
    if (!symbolInfo) return setMsg("Clique Sync pour charger symbol info.");
    if (ordresON.length === 0) return setMsg("Aucun ordre activé.");

    if (mode === "STOP_LIMIT") {
      const sp = toNum(stopPrice);
      if (!Number.isFinite(sp) || sp <= 0) return setMsg("Stop requis (Stop-Limit).");
    }

    try {
      setBusy(true);

      for (const o of ordresON) {
        const entry = toNum(o.entry);
        const sl = toNum(o.sl);
        const tp = toNum(o.tp);

        if (!Number.isFinite(entry) || entry <= 0) throw new Error(`Entrée invalide (Ordre ${o.id})`);
        if (!Number.isFinite(sl) || sl <= 0) throw new Error(`SL invalide (Ordre ${o.id})`);

        const lots = lotsForOrdre(o);
        if (lots.reason !== "ok" || lots.lots <= 0) throw new Error(`Lots = 0 (Ordre ${o.id})`);

        const v = validateLevels(side, entry, Number.isFinite(sl) ? sl : undefined, Number.isFinite(tp) ? tp : undefined);
        if (!v.ok) throw new Error(`${v.error} (Ordre ${o.id})`);

        const orderMode = (() => {
          if (mode === "MARKET") return side === "BUY" ? "MARKET_BUY" : "MARKET_SELL";
          if (mode === "LIMIT") return side === "BUY" ? "BUY_LIMIT" : "SELL_LIMIT";
          return side === "BUY" ? "BUY_STOP" : "SELL_STOP";
        })();

        const entryPrice = mode === "MARKET" ? undefined : mode === "LIMIT" ? entry : toNum(stopPrice);

        await fetchJson("/api/mt5/order", {
          broker: selectedAccount.broker,
          server: selectedAccount.server,
          login: selectedAccount.login,
          password: (selectedAccount as any).password ?? "",
          symbol: symbol.trim(),
          volume: lots.lots,
          orderMode,
          entryPrice,
          limitPrice: mode === "STOP_LIMIT" ? entry : undefined,
          sl,
          tp: Number.isFinite(tp) && tp > 0 ? tp : undefined,
          comment: `InvestPro Ordre ${o.id}`,
        });
      }

      pushNotif({ kind: "success", title: "Ordres envoyés", message: `${ordresON.length} ordre(s)`, ttlMs: 8000 });
      setMsg(`✅ ${ordresON.length} ordre(s) envoyé(s).`);

      await refreshPositions();
      await refreshOrders();
    } catch (e: any) {
      pushNotif({ kind: "error", title: "Erreur ordre", message: String(e?.message ?? e), ttlMs: 12000 });
      setMsg("❌ " + String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelPending(ticket: number) {
    if (!selectedAccount) return;

    if (!Number.isFinite(ticket) || ticket <= 0) {
      pushNotif({ kind: "error", title: "Annulation", message: "Ticket invalide.", ttlMs: 8000 });
      return;
    }

    try {
      setBusy(true);

      await fetchJson("/api/mt5/order_cancel", {
        broker: selectedAccount.broker,
        server: selectedAccount.server,
        login: selectedAccount.login,
        password: (selectedAccount as any).password ?? "",
        order: ticket,
      });

      pushNotif({ kind: "success", title: "Ordre annulé", message: `Ticket ${ticket}`, ttlMs: 8000 });
      await refreshOrders();
    } catch (e: any) {
      pushNotif({ kind: "error", title: "Erreur annulation", message: String(e?.message ?? e), ttlMs: 12000 });
    } finally {
      setBusy(false);
    }
  }
  /* =========================
     Modals state + handlers
     ========================= */
  const [openModify, setOpenModify] = useState(false);
  const [modTicket, setModTicket] = useState<number | null>(null);
  const [modSymbol, setModSymbol] = useState("");
  const [modEntry, setModEntry] = useState<number>(0);
  const [modLots, setModLots] = useState<number>(0);
  const [modType, setModType] = useState<0 | 1>(0);
  const [modSl, setModSl] = useState("");
  const [modTp, setModTp] = useState("");

  const [openCloseModal, setOpenCloseModal] = useState(false);
  const [closeTicket, setCloseTicket] = useState<number | null>(null);
  const [closeSymbol, setCloseSymbol] = useState("");
  const [closeType, setCloseType] = useState<0 | 1>(0);
  const [closeEntry, setCloseEntry] = useState<number>(0);
  const [closeLotsTotal, setCloseLotsTotal] = useState<number>(0);
  const [closeLots, setCloseLots] = useState<string>("");

  const [openCloseAll, setOpenCloseAll] = useState(false);
  const [openCancelAll, setOpenCancelAll] = useState(false);

  function openModifyPosition(p: any) {
    const t = Number(p.ticket);
    const ty = Number(p.type);
    const lots = Number(p.volume ?? 0);
    const entry = Number(p.price_open ?? 0);

    const sym = String(p.symbol ?? "");
    setModTicket(Number.isFinite(t) ? t : null);
    setModSymbol(sym);
    setModType(ty === 1 ? 1 : 0);
    setModLots(Number.isFinite(lots) ? lots : 0);
    setModEntry(Number.isFinite(entry) ? entry : 0);

    setModSl(p.sl ? String(p.sl) : "");
    setModTp(p.tp ? String(p.tp) : "");

    ensureSymbolInfo(sym).then((info) => {
      if (info) setSymbolInfo(info);
    });

    setOpenModify(true);
  }

  const modPxNow = useMemo(() => {
    const t = ticksMapLive?.[modSymbol];
    if (!t) return NaN;
    const px = modType === 0 ? Number(t.bid) : Number(t.ask);
    return Number.isFinite(px) ? px : NaN;
  }, [ticksMapLive, modSymbol, modType]);

  const modInfo = useMemo(() => {
    const s = modSymbol.trim();
    return s && symbolInfoMap[s] ? symbolInfoMap[s] : symbolInfo;
  }, [modSymbol, symbolInfoMap, symbolInfo]);

  const modLossUsd = useMemo(() => {
    const sl = toNum(modSl);
    if (!Number.isFinite(sl) || sl <= 0) return null;
    if (!Number.isFinite(modEntry) || modEntry <= 0) return null;
    const mag = pnlBetweenUSD(modEntry, sl, modLots, modInfo ?? null);
    if (mag == null) return null;
    return -Math.abs(mag);
  }, [modSl, modEntry, modLots, modInfo]);

  const modGainUsd = useMemo(() => {
    const tp = toNum(modTp);
    if (!Number.isFinite(tp) || tp <= 0) return null;
    if (!Number.isFinite(modEntry) || modEntry <= 0) return null;
    const mag = pnlBetweenUSD(modEntry, tp, modLots, modInfo ?? null);
    if (mag == null) return null;
    return Math.abs(mag);
  }, [modTp, modEntry, modLots, modInfo]);

  const modRR = useMemo(() => {
    if (modGainUsd == null || modLossUsd == null) return null;
    const r = Math.abs(modLossUsd);
    if (r <= 0) return null;
    return modGainUsd / r;
  }, [modGainUsd, modLossUsd]);

  async function saveModify() {
    if (!selectedAccount || !modTicket) return;

    try {
      setBusy(true);

      await fetchJson("/api/mt5/modify_sltp", {
        broker: selectedAccount.broker,
        server: selectedAccount.server,
        login: selectedAccount.login,
        password: (selectedAccount as any).password ?? "",
        ticket: modTicket,
        sl: modSl ? toNum(modSl) : null,
        tp: modTp ? toNum(modTp) : null,
      });

      pushNotif({ kind: "success", title: "SL/TP modifiés", message: modSymbol, ttlMs: 7000 });
      setOpenModify(false);
      await refreshPositions();
    } catch (e: any) {
      pushNotif({ kind: "error", title: "Erreur SL/TP", message: String(e?.message ?? e), ttlMs: 12000 });
    } finally {
      setBusy(false);
    }
  }

  function setBreakEven() {
    if (!Number.isFinite(modEntry) || modEntry <= 0) return;
    setModSl(modEntry.toFixed(2));
    pushNotif({ kind: "be", title: "B/E", message: "SL mis au prix d’entrée", ttlMs: 5000 });
  }

  function openClosePosition(p: any) {
    const t = Number(p.ticket);
    const sym = String(p.symbol ?? "");

    setCloseTicket(Number.isFinite(t) ? t : null);
    setCloseSymbol(sym);
    setCloseType(Number(p.type) === 1 ? 1 : 0);
    setCloseEntry(Number(p.price_open ?? 0) || 0);
    setCloseLotsTotal(Number(p.volume ?? 0) || 0);
    setCloseLots("");

    ensureSymbolInfo(sym).then((info) => {
      if (info) setSymbolInfo(info);
    });

    setOpenCloseModal(true);
  }

  const closeLotsNum = useMemo(() => {
    const v = toNum(closeLots);
    if (!closeLots.trim()) return closeLotsTotal;
    return Number.isFinite(v) ? v : NaN;
  }, [closeLots, closeLotsTotal]);

  const closeTooHigh = useMemo(() => {
    if (!closeLots.trim()) return false;
    const v = toNum(closeLots);
    return Number.isFinite(v) && v > closeLotsTotal;
  }, [closeLots, closeLotsTotal]);

  const closePxNow = useMemo(() => {
    const t = ticksMapLive?.[closeSymbol];
    if (!t) return NaN;
    const px = closeType === 0 ? Number(t.bid) : Number(t.ask);
    return Number.isFinite(px) ? px : NaN;
  }, [ticksMapLive, closeSymbol, closeType]);

  const closeInfo = useMemo(() => {
    const s = closeSymbol.trim();
    return s && symbolInfoMap[s] ? symbolInfoMap[s] : symbolInfo;
  }, [closeSymbol, symbolInfoMap, symbolInfo]);

  const closeEstPnl = useMemo(() => {
    if (!Number.isFinite(closeEntry) || closeEntry <= 0) return null;
    if (!Number.isFinite(closePxNow) || closePxNow <= 0) return null;
    if (!Number.isFinite(closeLotsNum) || closeLotsNum <= 0) return null;

    const mag = pnlBetweenUSD(closeEntry, closePxNow, closeLotsNum, closeInfo ?? null);
    if (mag == null) return null;

    const signed = closeType === 0 ? closePxNow - closeEntry : closeEntry - closePxNow;
    const sign = signed >= 0 ? 1 : -1;
    return sign * Math.abs(mag);
  }, [closeEntry, closePxNow, closeLotsNum, closeInfo, closeType]);

  async function confirmClosePartial() {
    if (!selectedAccount || !closeTicket) return;

    if (closeTooHigh) {
      pushNotif({ kind: "error", title: "Volume invalide", message: `Max = ${fmt2(closeLotsTotal)} lots`, ttlMs: 9000 });
      return;
    }

    const v = closeLots.trim() ? toNum(closeLots) : undefined;
    if (closeLots.trim() && (!Number.isFinite(toNum(closeLots)) || toNum(closeLots) <= 0)) {
      pushNotif({ kind: "error", title: "Volume invalide", message: "Entre un volume correct.", ttlMs: 8000 });
      return;
    }

    try {
      setBusy(true);

      await fetchJson("/api/mt5/close", {
        broker: selectedAccount.broker,
        server: selectedAccount.server,
        login: selectedAccount.login,
        password: (selectedAccount as any).password ?? "",
        ticket: closeTicket,
        volume: v,
      });

      pushNotif({
        kind: "success",
        title: v ? "Clôture partielle envoyée" : "Position clôturée",
        message: `${closeSymbol}`,
        ttlMs: 9000,
      });

      setOpenCloseModal(false);
      setCloseLots("");
      await refreshPositions();
      await syncTodayHistory();
    } catch (e: any) {
      pushNotif({ kind: "error", title: "Erreur clôture", message: String(e?.message ?? e), ttlMs: 12000 });
    } finally {
      setBusy(false);
    }
  }

  function fillMaxCloseLots() {
    setCloseLots(fmt2(closeLotsTotal));
    pushNotif({ kind: "info", title: "Max", message: "Volume mis au max.", ttlMs: 5000 });
  }

  async function confirmCloseAll() {
    if (!selectedAccount) return;
    if (!positions.length) return setOpenCloseAll(false);

    try {
      setBusy(true);
      for (const p of positions) {
        const t = Number(p.ticket);
        if (!Number.isFinite(t)) continue;

        await fetchJson("/api/mt5/close", {
          broker: selectedAccount.broker,
          server: selectedAccount.server,
          login: selectedAccount.login,
          password: (selectedAccount as any).password ?? "",
          ticket: t,
        });
      }
      setOpenCloseAll(false);
      pushNotif({ kind: "success", title: "Tout clôturé", message: `${positions.length} position(s)`, ttlMs: 9000 });
      await refreshPositions();
      await syncTodayHistory();
    } catch (e: any) {
      pushNotif({ kind: "error", title: "Erreur", message: String(e?.message ?? e), ttlMs: 12000 });
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancelAll() {
    if (!selectedAccount) return;
    if (!orders.length) return setOpenCancelAll(false);

    try {
      setBusy(true);
      for (const o of orders) {
        const t = Number(o.ticket);
        if (!Number.isFinite(t)) continue;

        await fetchJson("/api/mt5/order_cancel", {
          broker: selectedAccount.broker,
          server: selectedAccount.server,
          login: selectedAccount.login,
          password: (selectedAccount as any).password ?? "",
          order: t,
        });
      }
      setOpenCancelAll(false);
      pushNotif({ kind: "success", title: "Tout annulé", message: `${orders.length} ordre(s)`, ttlMs: 9000 });
      await refreshOrders();
    } catch (e: any) {
      pushNotif({ kind: "error", title: "Erreur", message: String(e?.message ?? e), ttlMs: 12000 });
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     UI click: accounts
     ========================= */
  function clickAccounts() {
    setMsg(null);

    if (!hasTradingTerminalAccess()) {
      setGateReason("noPlan");
      setOpenGateModal(true);
      return;
    }
    if (connectedAccounts.length === 0) {
      setGateReason("noAccounts");
      setOpenGateModal(true);
      return;
    }
    setOpenAccountsModal(true);
  }

  // =========================
  // RETURN
  // =========================
  return (
    <>
      <MaintenanceModal open={maintenanceTerminal} target="terminal" />

      <div className={maintenanceTerminal ? "pointer-events-none select-none" : ""}>
        <div className="space-y-6">
          {/* Title */}
          <div>
            <h1 className="text-3xl font-semibold">
              Terminal <span className="text-[color:var(--gold)]">de trading</span>
            </h1>
            <p className="text-[color:var(--muted)] mt-1">
              Market: <span className="text-white/90">{marketStr}</span> • Ask:{" "}
              <span className="text-white/90">{askStr}</span> • Spread:{" "}
              <span className="text-white/90">{spreadStr}</span>
            </p>
          </div>

          {/* ✅ PDDL / PDPT */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniProgress
              label="PDDL"
              left={`$${fmt(pddlUsed)}`}
              right={`$${fmt(dailyLossMax || 0)}`}
              valuePct={dailyLossMax ? pddlPct : 0}
            />
            <MiniProgress
              label="PDPT"
              left={`$${fmt(pdptDone)}`}
              right={`$${fmt(dailyProfitTarget || 0)}`}
              valuePct={dailyProfitTarget ? pdptPct : 0}
            />
          </div>

          {/* Discipline bar */}
          <Card>
            <CardBody>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="px-3 py-2 rounded-2xl border border-[color:var(--border)] bg-black/20">
                      <div className="text-[10px] text-white/50 uppercase tracking-wide">Gain du jour</div>
                      <div
                        className={
                          realizedToday >= 0
                            ? "text-[color:var(--success)] font-semibold"
                            : "text-[color:var(--danger)] font-semibold"
                        }
                      >
                        {fmt(realizedToday)} $
                      </div>
                    </div>

                    <div className="px-3 py-2 rounded-2xl border border-[color:var(--border)] bg-black/20">
                      <div className="text-[10px] text-white/50 uppercase tracking-wide">Gain en cours</div>
                      <div
                        className={
                          unrealizedNow >= 0
                            ? "text-[color:var(--success)] font-semibold"
                            : "text-[color:var(--danger)] font-semibold"
                        }
                      >
                        {fmt(unrealizedNow)} $
                      </div>
                    </div>

                    {locked ? (
                      <div className="px-3 py-2 rounded-2xl border border-rose-500/25 bg-rose-500/10">
                        <div className="text-[10px] text-rose-200/70 uppercase tracking-wide flex items-center gap-2">
                          <Lock size={12} /> Compte bloqué
                        </div>
                        <div className="text-sm font-semibold text-rose-200">{fmtCountdown(lockRemaining)}</div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={locked ? "danger" : "secondary"}
                      onClick={() => (locked ? unlockTrading() : setOpenLockModal(true))}
                    >
                      {locked ? "Débloquer" : "Bloquer"}
                    </Button>
                  </div>
                </div>

                {ruleAlerts.length ? (
                  <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3">
                    <div className="flex items-center gap-2 text-amber-200 text-sm font-semibold">
                      <ShieldAlert size={16} />
                      Discipline
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-amber-100/90">
                      {ruleAlerts.map((x, i) => (
                        <div key={i}>{x}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <LockModal open={openLockModal} onClose={() => setOpenLockModal(false)} />

          {/* HEADER */}
          <Card>
            <CardBody>
              {/* Compte */}
              <div className="w-full">
                <div className="text-xs text-white/70 mb-1">Compte</div>
                <button
                  type="button"
                  onClick={clickAccounts}
                  className="w-full h-11 px-4 rounded-2xl bg-black/20 border border-[color:var(--border)]
                        text-white/90 flex items-center justify-between gap-3 hover:bg-white/5 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      🏦
                    </span>
                    <div className="text-sm text-white/80 truncate">
                      {selectedAccount ? selectedAccount.label : "Choisir…"}
                    </div>
                  </div>
                  <span className="text-white/40">▾</span>
                </button>
              </div>

              {/* ✅ GOLDSELECT : catégorie / ordre / sens */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <GoldSelect
                  value={category}
                  onChange={(v) => setCategory(v as SymbolCat)}
                  options={[
                    { value: "all", label: "Tous" },
                    { value: "forex", label: "Forex" },
                    { value: "crypto", label: "Cryptomonnaie" },
                    { value: "indices", label: "Indices" },
                    { value: "metals", label: "Métaux" },
                    { value: "other", label: "Autres" },
                  ]}
                />

                <GoldSelect
                  value={mode}
                  onChange={(v) => setMode(v as Mode3)}
                  options={[
                    { value: "", label: "N/A" },
                    { value: "MARKET", label: "Market" },
                    { value: "LIMIT", label: "Limit" },
                    { value: "STOP_LIMIT", label: "Stop-Limit" },
                  ]}
                />

                <GoldSelect
                  value={side}
                  onChange={(v) => setSide(v as Side)}
                  options={[
                    { value: "NONE", label: "None" },
                    { value: "BUY", label: "BUY" },
                    { value: "SELL", label: "SELL" },
                  ]}
                />
              </div>

              {/* Symbol */}
              <div className="mt-4 flex justify-center">
                <div className="w-full md:w-[560px]">
                  <InputCompact
                    label={`Symbol ${symbolsLoaded ? `(${filteredSymbols.length})` : "(clique Sync)"}`}
                    value={symbol}
                    onChange={setSymbol}
                    placeholder="Ex: BTCUSD.pi"
                    listId="mt5-symbols"
                  />
                  <datalist id="mt5-symbols">
                    {filteredSymbols.map((s) => (
                      <option key={s.name} value={s.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Buttons */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button onClick={placeAllOrdres} disabled={busy || mode === "" || side === "NONE"} className="w-full h-12 justify-center">
                  {busy ? "..." : locked ? "Bloqué" : "Envoyer"}
                </Button>

                <Button variant="secondary" onClick={syncAll} disabled={busy} className="w-full h-12 justify-center">
                  Sync
                </Button>
              </div>

              {/* Progress */}
              <div className="mt-5">
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${progressPct}%`,
                      background: "linear-gradient(90deg, #d6b35f, #f5e6a8, #d6b35f)",
                      boxShadow: progressPct > 0 ? "0 0 14px rgba(214,179,95,.70)" : "none",
                      transition: "width .35s ease, box-shadow .35s ease",
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-[color:var(--muted)]">
                  <span>{progressPct === 0 ? "En attente de configuration" : "Configuration en cours"}</span>
                  <span>{progressPct}%</span>
                </div>
              </div>

              {msg ? (
                <div className="mt-4 text-sm rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)] p-3">
                  {msg}
                </div>
              ) : null}
            </CardBody>
          </Card>

          {/* Layout dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* LEFT */}
            <div className="lg:col-span-8 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Position */}
                <Card className="min-h-[320px]">
                  <CardBody className="p-5">
                    <div className="text-lg font-semibold">Réglages de votre position</div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {ordres.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => setOrdreActifId(o.id)}
                          className={[
                            "px-3 py-1.5 rounded-xl border text-sm transition",
                            o.id === ordreActifId
                              ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                              : "border-white/10 bg-black/20 text-white/70 hover:bg-white/5",
                          ].join(" ")}
                          type="button"
                        >
                          Ordre {o.id} {o.enabled ? "" : "(off)"}
                        </button>
                      ))}

                      <div className="ml-auto flex gap-2">
                        <button
                          onClick={addOrdre}
                          className="px-3 py-1.5 rounded-xl border border-white/10 bg-black/20 hover:bg-white/5 transition text-sm"
                          type="button"
                        >
                          + Ordre
                        </button>
                        <button
                          onClick={removeOrdre}
                          className="px-3 py-1.5 rounded-xl border border-white/10 bg-black/10 hover:bg-white/5 transition text-sm"
                          type="button"
                          disabled={ordres.length <= 1}
                        >
                          − Ordre
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <InputCompact
                            label={
                              mode === "MARKET"
                                ? `Entrée (Market • auto • ${side === "BUY" ? "Ask" : side === "SELL" ? "Bid" : "-"})`
                                : `Entrée ${ordreActifId}`
                            }
                            value={ordreActif.entry}
                            onChange={mode === "MARKET" ? undefined : (v) => setOrdreField(ordreActifId, "entry", v)}
                            readOnly={mode === "MARKET"}
                            placeholder="Ex: 91000.00"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleOrdre(ordreActifId)}
                          className={[
                            "h-9 px-3 rounded-xl border text-sm transition",
                            ordreActif.enabled
                              ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                              : "border-white/10 bg-black/20 text-white/60 hover:bg-white/5",
                          ].join(" ")}
                        >
                          {ordreActif.enabled ? "ON" : "OFF"}
                        </button>
                      </div>

                      <InputCompact
                        label={`Stop Loss ${ordreActifId}`}
                        value={ordreActif.sl}
                        onChange={(v) => setOrdreField(ordreActifId, "sl", v)}
                        placeholder="Ex: 90000.00"
                      />

                      <InputCompact
                        label={`Take Profit ${ordreActifId}`}
                        value={ordreActif.tp}
                        onChange={(v) => setOrdreField(ordreActifId, "tp", v)}
                        placeholder="Ex: 101000.00"
                      />

                      {needsStop ? (
                        <InputCompact
                          label="Stop (trigger) • Stop-Limit"
                          value={stopPrice}
                          onChange={setStopPrice}
                          placeholder="Ex: 91500.00"
                        />
                      ) : null}

                      {(() => {
                        const entry = toNum(ordreActif.entry);
                        const sl = toNum(ordreActif.sl);
                        const tp = toNum(ordreActif.tp);
                        const v = validateLevels(side, entry, sl, tp);
                        if (v.ok) return null;
                        return (
                          <div className="text-sm rounded-2xl border border-[color:var(--danger)]/25 bg-[color:var(--danger)]/10 text-[color:var(--danger)] p-3">
                            {v.error}
                          </div>
                        );
                      })()}

                      <div className="text-xs text-[color:var(--muted)]">* Ordre B/C = position différente.</div>
                    </div>
                  </CardBody>
                </Card>

                {/* Risk */}
                <Card className="min-h-[320px]">
                  <CardBody className="p-5">
                    <div className="text-lg font-semibold">Réglages de votre risque</div>

                    <div className="mt-4 space-y-3">
                      <InputCompact
                        label="Risque (%) (0.01 → 100)"
                        value={riskPct}
                        onChange={onChangeRiskPct}
                        onBlur={onBlurRiskPct}
                        placeholder="1.00"
                      />
                      <InputCompact
                        label="Risque (USD)"
                        value={riskUsd}
                        onChange={onChangeRiskUsd}
                        onBlur={onBlurRiskUsd}
                        placeholder="100"
                      />
                      <InputCompact label="Capital (USD)" value={capitalUsd} readOnly />

                      <div className="grid grid-cols-2 gap-3">
                        <InputCompact
                          label="Commission estimée (USD/lot)"
                          value={commissionPerLot}
                          onChange={setCommissionPerLot}
                          placeholder="ex: 7"
                        />
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                          <div className="text-xs text-white/60 mb-1">Risque / Ordre</div>
                          <div className="text-white font-semibold">{fmt(riskMoneyPerOrdre)} USD</div>
                          <div className="text-[11px] text-white/40 mt-1">({ordresON.length} ordre(s) ON)</div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDeductCommission(true)}
                          className={[
                            "px-4 h-9 rounded-2xl border transition text-sm",
                            deductCommission
                              ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                              : "border-white/10 bg-black/20 text-white/70 hover:bg-white/5",
                          ].join(" ")}
                        >
                          Déduire commissions: Oui
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeductCommission(false)}
                          className={[
                            "px-4 h-9 rounded-2xl border transition text-sm",
                            !deductCommission
                              ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                              : "border-white/10 bg-black/20 text-white/70 hover:bg-white/5",
                          ].join(" ")}
                        >
                          Non
                        </button>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Lots (Ordre {ordreActifId})</span>
                          <span className="font-semibold text-[color:var(--gold)]">
                            {lotsActif.reason === "ok" ? lotsActif.lots.toFixed(2) : "N/A"}
                          </span>
                        </div>

                        <div className="flex justify-between text-sm mt-2">
                          <span className="text-white/60">R:R estimé</span>
                          <span className="text-white font-semibold">{rrActif > 0 ? rrActif.toFixed(2) : "N/A"}</span>
                        </div>

                        <div className="mt-2 text-xs text-[color:var(--muted)]">
                          Market: <span className="text-white/80">{marketStr}</span> • Ask:{" "}
                          <span className="text-white/80">{askStr}</span> • Spread:{" "}
                          <span className="text-white/80">{spreadStr}</span>
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </div>

              {/* Résumé */}
              <Card className="min-h-[220px]">
                <CardBody className="p-5">
                  <div className="text-lg font-semibold mb-3">Résumé</div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-xs text-white/60">Ordres ON</div>
                      <div className="mt-1 font-semibold text-white">{ordresON.length}</div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-xs text-white/60">Risque total</div>
                      <div className="mt-1 font-semibold text-[color:var(--gold)]">{fmt(riskMoneyTotal)} USD</div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-xs text-white/60">Actif</div>
                      <div className="mt-1 font-semibold text-white">Ordre {ordreActifId}</div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-xs text-white/60">Market</div>
                      <div className="mt-1 font-semibold text-white">{marketStr}</div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-xs text-white/60">Reward (actif)</div>
                      <div className="mt-1 font-semibold text-[color:var(--success)]">
                        {expRewardActif > 0 ? `${fmt(expRewardActif)} USD` : "0.00 USD"}
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* RIGHT: TradingView */}
            <Card className="lg:col-span-4 min-h-[560px]">
              <CardBody className="p-5">
                <div className="text-lg font-semibold mb-3">Graphique TradingView</div>
                <div className="text-xs text-[color:var(--muted)] mb-3">
                  TradingView API (tv.js) • Symbol: {symbol ? symbol : "BTCUSD"}
                </div>

                <div className="rounded-2xl border border-white/10 overflow-hidden bg-black/20">
                  <TradingViewApiChart symbol={symbol?.trim() || "BTCUSD"} />
                </div>

                <div className="mt-3 text-xs text-[color:var(--muted)] flex justify-between">
                  <span>Market: {marketStr}</span>
                  <span>Ask: {askStr}</span>
                  <span>Spread: {spreadStr}</span>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Tables toggles */}
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => setShowPositions((v) => !v)}
              className={[
                "px-4 py-2 rounded-2xl border transition text-sm",
                showPositions
                  ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                  : "border-[color:var(--border)] bg-black/20 text-white/70 hover:bg-white/5",
              ].join(" ")}
              type="button"
            >
              Positions ouvertes
            </button>

            <button
              onClick={() => setShowOrders((v) => !v)}
              className={[
                "px-4 py-2 rounded-2xl border transition text-sm",
                showOrders
                  ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                  : "border-[color:var(--border)] bg-black/20 text-white/70 hover:bg-white/5",
              ].join(" ")}
              type="button"
            >
              Ordres en attente
            </button>

            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={() => refreshPositions().catch(() => {})} disabled={busy}>
                Refresh Positions
              </Button>
              <Button variant="secondary" onClick={() => refreshOrders().catch(() => {})} disabled={busy}>
                Refresh Pending
              </Button>
            </div>
          </div>

          {/* Positions */}
          {showPositions ? (
            <Card>
              <CardBody>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Positions ouvertes</div>
                    <div className="text-xs text-[color:var(--muted)] mt-1">
                      PnL total:{" "}
                      <span
                        className={
                          totalPnl >= 0
                            ? "text-[color:var(--success)] font-semibold"
                            : "text-[color:var(--danger)] font-semibold"
                        }
                      >
                        {totalPnlStr} $
                      </span>
                    </div>
                  </div>

                  <Button variant="danger" onClick={() => setOpenCloseAll(true)} disabled={busy || positions.length === 0}>
                    Tout clôturer
                  </Button>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-white/70">
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3">Ticket</th>
                        <th className="text-left py-3">Symbol</th>
                        <th className="text-left py-3">Type</th>
                        <th className="text-left py-3">Lots</th>
                        <th className="text-left py-3">Entry</th>
                        <th className="text-left py-3">Prix actuel</th>
                        <th className="text-left py-3">SL</th>
                        <th className="text-left py-3">TP</th>
                        <th className="text-left py-3">Profit</th>
                        <th className="text-left py-3"></th>
                      </tr>
                    </thead>

                    <tbody>
                      {positions.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-10 text-center text-[color:var(--muted)]">
                            Aucune position ouverte.
                          </td>
                        </tr>
                      ) : (
                        positions.map((p) => {
                          const sym = String(p.symbol ?? "");
                          const t = ticksMapLive[sym];
                          const isBuy = Number(p.type) === 0;
                          const pxNow = t ? (isBuy ? t.bid : t.ask) : NaN;

                          return (
                            <tr key={p.ticket} className="border-b border-white/5">
                              <td className="py-3">{p.ticket}</td>
                              <td className="py-3">{p.symbol}</td>
                              <td className="py-3">{orderTypeLabel(Number(p.type))}</td>
                              <td className="py-3">{p.volume}</td>
                              <td className="py-3">{p.price_open}</td>
                              <td className="py-3">{Number.isFinite(pxNow) ? fmt2(pxNow) : "—"}</td>
                              <td className="py-3">{p.sl}</td>
                              <td className="py-3">{p.tp}</td>
                              <td
                                className={
                                  Number(p.profit ?? 0) >= 0
                                    ? "py-3 text-[color:var(--success)]"
                                    : "py-3 text-[color:var(--danger)]"
                                }
                              >
                                {fmt(Number(p.profit ?? 0))}
                              </td>
                              <td className="py-3 flex gap-2">
                                <Button variant="secondary" onClick={() => openModifyPosition(p)} disabled={busy}>
                                  Modifier
                                </Button>
                                <Button variant="danger" onClick={() => openClosePosition(p)} disabled={busy}>
                                  Clôturer
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {/* Pending */}
          {showOrders ? (
            <Card>
              <CardBody>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Ordres en attente</div>
                  </div>

                  <Button variant="secondary" onClick={() => setOpenCancelAll(true)} disabled={busy || orders.length === 0}>
                    Tout annuler
                  </Button>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-white/70">
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3">Order</th>
                        <th className="text-left py-3">Symbol</th>
                        <th className="text-left py-3">Type</th>
                        <th className="text-left py-3">Volume</th>
                        <th className="text-left py-3">Prix</th>
                        <th className="text-left py-3">Prix actuel</th>
                        <th className="text-left py-3">SL</th>
                        <th className="text-left py-3">TP</th>
                        <th className="text-left py-3">Comment</th>
                        <th className="text-left py-3"></th>
                      </tr>
                    </thead>

                    <tbody>
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-10 text-center text-[color:var(--muted)]">
                            Aucun ordre en attente.
                          </td>
                        </tr>
                      ) : (
                        orders.map((o) => {
                          const t = ticksMapLive[String(o.symbol)];
                          const cur = t ? `${fmt2(t.bid)} / ${fmt2(t.ask)}` : "—";

                          return (
                            <tr key={o.ticket} className="border-b border-white/5">
                              <td className="py-3">{o.ticket}</td>
                              <td className="py-3">{o.symbol}</td>
                              <td className="py-3">{pendingTypeLabel(Number(o.type))}</td>
                              <td className="py-3">{o.volume_current}</td>
                              <td className="py-3">{o.price_open}</td>
                              <td className="py-3">{cur}</td>
                              <td className="py-3">{o.sl}</td>
                              <td className="py-3">{o.tp}</td>
                              <td className="py-3 text-white/60">{o.comment}</td>
                              <td className="py-3">
                                <Button variant="danger" onClick={() => cancelPending(Number(o.ticket))} disabled={busy}>
                                  Annuler
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {/* Accounts modal */}
          <Modal
            open={openAccountsModal}
            title="Choisir le compte MT5"
            onClose={() => setOpenAccountsModal(false)}
            footer={
              <div className="flex items-center justify-end gap-3 w-full">
                <Button variant="secondary" onClick={() => setOpenAccountsModal(false)}>
                  Fermer
                </Button>
              </div>
            }
          >
            <div className="space-y-2">
              {connectedAccounts.map((a) => {
                const active = a.id === selectedId;
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedId(a.id);
                      setOpenAccountsModal(false);
                    }}
                    className={[
                      "w-full text-left px-4 py-3 rounded-2xl border transition flex items-center justify-between gap-3",
                      active
                        ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-white"
                        : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
                    ].join(" ")}
                    type="button"
                  >
                    <div>
                      <div className="font-semibold">{a.label}</div>
                      <div className="text-xs text-white/50">
                        {a.broker} • {a.server}
                      </div>
                    </div>
                    <div className="text-lg">{active ? "✅" : "⬜"}</div>
                  </button>
                );
              })}
            </div>
          </Modal>

          {/* ✅ MODIFY modal */}
          <Modal
            open={openModify}
            title={`Modifier SL/TP • Ticket ${modTicket ?? ""}`}
            onClose={() => setOpenModify(false)}
            footer={
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={setBreakEven} disabled={!Number.isFinite(modEntry) || modEntry <= 0}>
                    B/E
                  </Button>

                  <div className="hidden sm:flex items-center px-3 py-2 rounded-2xl border border-white/10 bg-black/20 text-xs text-white/70">
                    Entry: <span className="ml-1 text-white/90">{Number.isFinite(modEntry) ? fmt2(modEntry) : "—"}</span>
                    <span className="mx-2 text-white/20">•</span>
                    Now: <span className="ml-1 text-white/90">{Number.isFinite(modPxNow) ? fmt2(modPxNow) : "—"}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setOpenModify(false)}>
                    Annuler
                  </Button>
                  <Button onClick={saveModify} disabled={busy}>
                    {busy ? "..." : "Enregistrer"}
                  </Button>
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="text-sm text-[color:var(--muted)]">
                {modSymbol} • Lots:{" "}
                <span className="text-[color:var(--gold)] font-semibold">{Number.isFinite(modLots) ? fmt2(modLots) : "—"}</span>{" "}
                • Type: <span className="text-white/90 font-semibold">{modType === 0 ? "BUY" : "SELL"}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputCompact label="Stop Loss (prix)" value={modSl} onChange={setModSl} placeholder="Ex: 90000.00" />
                <InputCompact label="Take Profit (prix)" value={modTp} onChange={setModTp} placeholder="Ex: 101000.00" />
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-white/60">Perte au SL (est.)</div>
                    <div className="mt-1 font-semibold text-[color:var(--danger)]">
                      {modLossUsd == null ? "—" : `${fmt(modLossUsd)} $`}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-white/60">Gain au TP (est.)</div>
                    <div className="mt-1 font-semibold text-[color:var(--success)]">
                      {modGainUsd == null ? "—" : `${fmt(modGainUsd)} $`}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-white/60">R:R</div>
                    <div className="mt-1 font-semibold text-[color:var(--gold)]">{modRR == null ? "—" : modRR.toFixed(2)}</div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-[color:var(--muted)]">* Estimations via tick_value/tick_size.</div>
              </div>
            </div>
          </Modal>

          {/* ✅ CLOSE modal */}
          <Modal
            open={openCloseModal}
            title={`Clôturer • Ticket ${closeTicket ?? ""}`}
            onClose={() => setOpenCloseModal(false)}
            footer={
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="text-xs text-white/60">
                  Lots total:{" "}
                  <span className="text-[color:var(--gold)] font-semibold">
                    {Number.isFinite(closeLotsTotal) ? fmt2(closeLotsTotal) : "—"}
                  </span>
                </div>

                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setOpenCloseModal(false)}>
                    Annuler
                  </Button>
                  <Button variant="danger" onClick={confirmClosePartial} disabled={busy}>
                    {busy ? "..." : "Clôturer"}
                  </Button>
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="text-sm text-[color:var(--muted)]">
                {closeSymbol} • {closeType === 0 ? "BUY" : "SELL"} • Entry{" "}
                <span className="text-white/90">{Number.isFinite(closeEntry) ? fmt2(closeEntry) : "—"}</span>
                {"  "}• Now{" "}
                <span className="text-white/90">{Number.isFinite(closePxNow) ? fmt2(closePxNow) : "—"}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <InputCompact
                  label="Lots à clôturer (vide = tout)"
                  value={closeLots}
                  onChange={setCloseLots}
                  placeholder={fmt2(closeLotsTotal)}
                />

                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-white/60">Prévisualisation PnL (est.)</div>
                    <div
                      className={[
                        "text-sm font-semibold",
                        closeEstPnl == null
                          ? "text-white/70"
                          : closeEstPnl >= 0
                          ? "text-[color:var(--success)]"
                          : "text-[color:var(--danger)]",
                      ].join(" ")}
                    >
                      {closeEstPnl == null ? "—" : `${fmt(closeEstPnl)} $`}
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-white/40">* Estimation sur le prix actuel et le lot saisi.</div>
                </div>
              </div>

              {closeTooHigh ? (
                <div className="text-sm rounded-2xl border border-[color:var(--danger)]/25 bg-[color:var(--danger)]/10 text-[color:var(--danger)] p-3">
                  Volume trop élevé. Max = <b>{fmt2(closeLotsTotal)}</b> lots.
                  <div className="mt-2">
                    <Button variant="secondary" onClick={fillMaxCloseLots}>
                      Mettre le max
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <Button
                    variant="secondary"
                    onClick={fillMaxCloseLots}
                    disabled={!Number.isFinite(closeLotsTotal) || closeLotsTotal <= 0}
                  >
                    Max
                  </Button>
                  <div className="text-xs text-white/40">
                    Si tu mets un lot, ça fera une <b>clôture partielle</b>.
                  </div>
                </div>
              )}
            </div>
          </Modal>

          {/* ✅ BULK CLOSE ALL */}
          <Modal
            open={openCloseAll}
            title="Clôturer toutes les positions ?"
            onClose={() => setOpenCloseAll(false)}
            footer={
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setOpenCloseAll(false)}>
                  Annuler
                </Button>
                <Button variant="danger" onClick={confirmCloseAll} disabled={busy}>
                  {busy ? "..." : "Confirmer"}
                </Button>
              </div>
            }
          >
            <div className="text-sm text-[color:var(--muted)]">
              Tu es sur le point de clôturer <b>{positions.length}</b> position(s). Action irréversible.
            </div>
          </Modal>

          {/* ✅ BULK CANCEL ALL */}
          <Modal
            open={openCancelAll}
            title="Annuler tous les ordres en attente ?"
            onClose={() => setOpenCancelAll(false)}
            footer={
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setOpenCancelAll(false)}>
                  Annuler
                </Button>
                <Button variant="secondary" onClick={confirmCancelAll} disabled={busy}>
                  {busy ? "..." : "Confirmer"}
                </Button>
              </div>
            }
          >
            <div className="text-sm text-[color:var(--muted)]">
              Tu es sur le point d’annuler <b>{orders.length}</b> ordre(s) en attente.
            </div>
          </Modal>

          {/* Gate modal */}
          <Modal
            open={openGateModal}
            title="Accès requis"
            onClose={() => setOpenGateModal(false)}
            footer={
              <div className="flex items-center justify-end gap-3">
                <Button variant="ghost" onClick={() => setOpenGateModal(false)}>
                  Fermer
                </Button>
                {gateReason === "noPlan" ? (
                  <Button onClick={() => (window.location.href = "/dashboard/abonnement")}>Voir abonnement</Button>
                ) : (
                  <Button onClick={() => (window.location.href = "/dashboard/comptes")}>Ajouter un compte</Button>
                )}
              </div>
            }
          >
            {gateReason === "noPlan" ? (
              <div className="text-sm text-[color:var(--muted)]">
                L’accès au terminal nécessite un abonnement.
                <div className="mt-3 rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3 text-[color:var(--gold)]">
                  Plan actuel : <b>{getPlan()}</b>
                </div>
              </div>
            ) : (
              <div className="text-sm text-[color:var(--muted)]">
                Aucun compte MT5 connecté. Va sur Comptes et clique “Tester”.
              </div>
            )}
          </Modal>
        </div>
      </div>
    </>
  );
}
