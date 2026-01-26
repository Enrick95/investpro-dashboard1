"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import GoldSelect from "../../../components/ui/GoldSelect";
import { getPlan, hasTradingTerminalAccess } from "../../../lib/subscriptionStore";
import { loadMt5Accounts, Mt5Account } from "../../../lib/mt5Store";
import { syncMt5HistoryToTrades } from "../../../lib/mt5sync";

type Mode3 = "" | "MARKET" | "LIMIT" | "STOP_LIMIT";
type Side = "BUY" | "SELL";
type SymbolCat = "all" | "forex" | "crypto" | "indices" | "metals" | "other";

type SymbolInfo = {
  ok: true;
  name: string;
  tick_size: number; // price increment
  tick_value: number; // money per tick for 1 lot
  digits: number;
  min_lot?: number;
  lot_step?: number;
};

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
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

/** fetch JSON robuste */
async function fetchJson(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const ct = r.headers.get("content-type") || "";
  const text = await r.text();

  if (!ct.includes("application/json")) {
    throw new Error(`API non-JSON (${r.status}) : ${text.slice(0, 140)}`);
  }

  const j = JSON.parse(text);
  if (!r.ok || !j?.ok) throw new Error(j?.error || `API error (${r.status})`);
  return j;
}

/* ✅ petit Input UI */
function InputField({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
  listId,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  listId?: string;
}) {
  return (
    <div className="w-full">
      <div className="text-xs text-white/70 mb-1">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        list={listId}
        className="w-full h-11 px-4 rounded-2xl bg-black/20 border border-[color:var(--border)]
                   text-white placeholder:text-white/30 outline-none hover:bg-white/5 transition"
      />
    </div>
  );
}

function letter(idx: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return alphabet[idx] ?? String(idx + 1);
}

export default function TerminalPage() {
  const [accounts, setAccounts] = useState<Mt5Account[]>([]);
  const connectedAccounts = useMemo(
    () => accounts.filter((a) => a.status === "CONNECTED"),
    [accounts]
  );

  // multi comptes sélectionnés (envoi ordre)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openAccountsModal, setOpenAccountsModal] = useState(false);

  const selectedAccounts = useMemo(
    () => connectedAccounts.filter((a) => selectedIds.includes(a.id)),
    [connectedAccounts, selectedIds]
  );
  const readerAcc = selectedAccounts[0] ?? null;

  // gate modal
  const [openGateModal, setOpenGateModal] = useState(false);
  const [gateReason, setGateReason] = useState<"noPlan" | "noAccounts" | null>(null);

  // symbols scan
  const [category, setCategory] = useState<SymbolCat>("all");
  const [symbols, setSymbols] = useState<{ name: string; category: SymbolCat; path?: string }[]>([]);
  const [symbolsLoaded, setSymbolsLoaded] = useState(false);

  // ordre (nouveau modèle)
  const [symbol, setSymbol] = useState("");
  const [mode, setMode] = useState<Mode3>(""); // N/A
  const [side, setSide] = useState<Side>("BUY");

  // position settings (multi A/B/C…)
  const [entries, setEntries] = useState<string[]>([""]); // entrée A (limit/stop-limit)
  const [stopPrice, setStopPrice] = useState(""); // stop (stop-limit)
  const [sls, setSls] = useState<string[]>([""]); // SL A, SL B ...
  const [tps, setTps] = useState<string[]>([""]); // TP A, TP B ...

  // risk settings (remplace volume)
  const [riskPct, setRiskPct] = useState("1"); // %
  const [balance, setBalance] = useState("0"); // USD
  const [calcBase, setCalcBase] = useState<"BALANCE" | "EQUITY">("BALANCE");
  const [deductCommission, setDeductCommission] = useState(false);

  const [symbolInfo, setSymbolInfo] = useState<SymbolInfo | null>(null);

  // tables show
  const [showPositions, setShowPositions] = useState(true);
  const [showOrders, setShowOrders] = useState(true);
  const [positions, setPositions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // modify modal
  const [openModify, setOpenModify] = useState(false);
  const [modTicket, setModTicket] = useState<number | null>(null);
  const [modSymbol, setModSymbol] = useState<string>("");
  const [modSl, setModSl] = useState<string>("");
  const [modTp, setModTp] = useState<string>("");
  const [modCloseVol, setModCloseVol] = useState<string>("");

  useEffect(() => {
    const list = loadMt5Accounts();
    setAccounts(list);

    const connected = list.filter((x) => x.status === "CONNECTED");
    if (connected.length > 0) setSelectedIds([connected[0].id]);
  }, []);

  // reset champs quand on change de mode
  useEffect(() => {
    setMsg(null);

    // reset UI "position"
    setEntries([""]);
    setStopPrice("");
    setSls([""]);
    setTps([""]);

    // reset symbol info
    setSymbolInfo(null);
  }, [mode]);

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

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function selectAll() {
    setSelectedIds(connectedAccounts.map((a) => a.id));
  }
  function selectNone() {
    setSelectedIds([]);
  }

  const filteredSymbols = useMemo(() => {
    if (category === "all") return symbols;
    return symbols.filter((s) => s.category === category);
  }, [symbols, category]);

  const needsEntry = useMemo(() => mode === "LIMIT" || mode === "STOP_LIMIT", [mode]);
  const needsStop = useMemo(() => mode === "STOP_LIMIT", [mode]);

  // ✅ progress basé sur les vrais champs requis (N/A => 0)
  const progressPct = useMemo(() => {
    const checks: boolean[] = [];

    // compte(s)
    checks.push(selectedIds.length > 0);

    // symbol
    checks.push(symbol.trim().length > 0);

    // mode
    checks.push(mode !== "");

    // side
    checks.push(side === "BUY" || side === "SELL");

    // entry si needed (entrée A au minimum)
    if (needsEntry) {
      const ep = Number(entries[0]);
      checks.push(Number.isFinite(ep) && ep > 0);
    }

    // stop si stop-limit
    if (needsStop) {
      const sp = Number(stopPrice);
      checks.push(Number.isFinite(sp) && sp > 0);
    }

    // SL A obligatoire pour risk calc (sinon lot = 0)
    const slA = Number(sls[0]);
    checks.push(Number.isFinite(slA) && slA > 0);

    // balance et risk ok
    const bal = Number(balance);
    const rp = Number(riskPct);
    checks.push(Number.isFinite(bal) && bal > 0);
    checks.push(Number.isFinite(rp) && rp > 0);

    const done = checks.filter(Boolean).length;
    return checks.length ? Math.round((done / checks.length) * 100) : 0;
  }, [selectedIds, symbol, mode, side, needsEntry, entries, needsStop, stopPrice, sls, balance, riskPct]);

  async function syncSymbols() {
    if (!readerAcc) throw new Error("Choisis un compte (au moins 1).");

    const j = await fetchJson("/api/mt5/symbols", {
      broker: readerAcc.broker,
      server: readerAcc.server,
      login: readerAcc.login,
      password: readerAcc.password ?? "",
      category,
    });

    const list = Array.isArray(j.symbols) ? j.symbols : [];
    const normalized = list.map((x: any) => ({
      name: String(x.name ?? ""),
      category: (String(x.category ?? "other") as SymbolCat) || "other",
      path: String(x.path ?? ""),
    }));

    setSymbols(normalized);
    setSymbolsLoaded(true);

    if (symbol && !normalized.some((s: any) => s.name === symbol)) {
      const found =
        normalized.find((s: any) => s.name.startsWith(symbol + ".")) ||
        normalized.find((s: any) => s.name.toLowerCase().startsWith(symbol.toLowerCase()));
      if (found) setSymbol(found.name);
    }
  }

  async function loadSymbolInfo(sym: string) {
    if (!readerAcc) return;
    if (!sym.trim()) return;

    try {
      const j = await fetchJson("/api/mt5/symbol_info", {
        broker: readerAcc.broker,
        server: readerAcc.server,
        login: readerAcc.login,
        password: readerAcc.password ?? "",
        symbol: sym.trim(),
      });
      setSymbolInfo(j.info as SymbolInfo);
    } catch (e: any) {
      setSymbolInfo(null);
      setMsg("❌ symbol_info: " + String(e?.message ?? e));
    }
  }

  // refresh positions/orders
  async function refreshPositions() {
    if (!readerAcc) return;
    try {
      const j = await fetchJson("/api/mt5/positions", {
        broker: readerAcc.broker,
        server: readerAcc.server,
        login: readerAcc.login,
        password: readerAcc.password ?? "",
      });
      setPositions(Array.isArray(j.positions) ? j.positions : []);
    } catch (e: any) {
      setMsg("❌ Positions: " + String(e?.message ?? e));
    }
  }

  async function refreshOrders() {
    if (!readerAcc) return;
    try {
      const j = await fetchJson("/api/mt5/orders", {
        broker: readerAcc.broker,
        server: readerAcc.server,
        login: readerAcc.login,
        password: readerAcc.password ?? "",
      });
      setOrders(Array.isArray(j.orders) ? j.orders : []);
    } catch (e: any) {
      setMsg("❌ Pending: " + String(e?.message ?? e));
    }
  }

  useEffect(() => {
    if (!readerAcc) return;
    refreshPositions();
    refreshOrders();
    const t = setInterval(() => {
      refreshPositions();
      refreshOrders();
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerAcc?.id]);

  // ✅ lots calculator (simple & robuste)
  const lotCalc = useMemo(() => {
    const rp = Number(riskPct);
    const bal = Number(balance);
    const slA = Number(sls[0]);

    if (!symbolInfo) return { lots: 0, reason: "sync_symbol" as const };
    if (!Number.isFinite(rp) || rp <= 0) return { lots: 0, reason: "risk" as const };
    if (!Number.isFinite(bal) || bal <= 0) return { lots: 0, reason: "balance" as const };
    if (!Number.isFinite(slA) || slA <= 0) return { lots: 0, reason: "sl" as const };

    // entry reference:
    // - MARKET: pas d’entrée => on ne connait pas le prix exact -> on calcule avec "entry A" si saisi, sinon 0 => lots 0
    // - LIMIT/STOP_LIMIT: entrée A obligatoire
    const entryRef = (() => {
      const e0 = Number(entries[0]);
      if (needsEntry && (!Number.isFinite(e0) || e0 <= 0)) return 0;
      if (needsEntry) return e0;

      // market: si user a saisi entrée A, on l’utilise, sinon on ne calcule pas
      if (Number.isFinite(e0) && e0 > 0) return e0;
      return 0;
    })();

    if (entryRef <= 0) return { lots: 0, reason: "entry" as const };

    // distance SL en prix
    const dist = Math.abs(entryRef - slA);
    if (dist <= 0) return { lots: 0, reason: "sl_dist" as const };

    // ticks count = dist / tick_size
    const ticks = dist / (symbolInfo.tick_size || 0);
    if (!Number.isFinite(ticks) || ticks <= 0) return { lots: 0, reason: "ticks" as const };

    // risk money
    const riskMoney = (bal * rp) / 100;

    // risk per 1 lot = ticks * tick_value
    const riskPerLot = ticks * (symbolInfo.tick_value || 0);
    if (!Number.isFinite(riskPerLot) || riskPerLot <= 0) return { lots: 0, reason: "tick_value" as const };

    let lots = riskMoney / riskPerLot;

    // clamp to lot step & min
    const step = symbolInfo.lot_step ?? 0.01;
    const min = symbolInfo.min_lot ?? step;

    if (Number.isFinite(step) && step > 0) {
      lots = Math.floor(lots / step) * step;
      lots = Number(lots.toFixed(4));
    }

    if (lots < min) lots = 0;

    return { lots, reason: "ok" as const };
  }, [riskPct, balance, sls, entries, symbolInfo, needsEntry]);

  function addEntry() {
    setEntries((prev) => [...prev, ""]);
  }
  function addSl() {
    setSls((prev) => [...prev, ""]);
  }
  function addTp() {
    setTps((prev) => [...prev, ""]);
  }

  function setArrAt(setter: (fn: any) => void, idx: number, v: string) {
    setter((prev: string[]) => prev.map((x, i) => (i === idx ? v : x)));
  }

  // ✅ place order(s) (MVP)
  // MT5 ne supporte pas "multi TP" natif => ici on envoie TP A/SL A seulement.
  // Les TP B/C... seront gérés plus tard via logique auto (EA/bridge scheduler).
  async function placeOrder() {
    setMsg(null);

    if (selectedAccounts.length === 0) return setMsg("Choisis au moins 1 compte.");
    if (!symbol.trim()) return setMsg("Choisis un symbol.");
    if (!mode) return setMsg("Choisis un type d’ordre.");

    // needs symbol info for lot calc
    if (!symbolInfo) return setMsg("Clique sur Sync ou saisis un symbol puis attend le scan.");

    // entry A check if needed
    const entryA = Number(entries[0]);
    if ((mode === "LIMIT" || mode === "STOP_LIMIT") && (!Number.isFinite(entryA) || entryA <= 0)) {
      return setMsg("Entrée A requise pour LIMIT / STOP-LIMIT.");
    }

    if (mode === "MARKET" && (!Number.isFinite(entryA) || entryA <= 0)) {
      return setMsg("Pour MARKET, mets une Entrée A (prix actuel approx) pour calculer le lot.");
    }

    // stop limit needs stop
    const sp = Number(stopPrice);
    if (mode === "STOP_LIMIT" && (!Number.isFinite(sp) || sp <= 0)) {
      return setMsg("Stop requis pour STOP-LIMIT.");
    }

    const slA = Number(sls[0]);
    if (!Number.isFinite(slA) || slA <= 0) return setMsg("Stop Loss A requis pour calculer le risque.");

    const tpA = Number(tps[0]);
    const lots = lotCalc.lots;
    if (!Number.isFinite(lots) || lots <= 0) return setMsg("Lots calculés = 0. Ajuste risque/SL/entrée.");

    // map vers ton API existante /api/mt5/order (qui attend orderMode)
    // On convertit : Market => MARKET_BUY/SELL
    // Limit => BUY_LIMIT / SELL_LIMIT
    // Stop-Limit => (MT5 n'a pas un vrai stop-limit comme crypto),
    // on place un STOP (BUY_STOP / SELL_STOP) à stopPrice, avec entryPrice = stopPrice (MVP).
    // Si tu veux un vrai “stop-limit”, il faudra une logique 2 étapes (order stop -> pending limit).
    const orderMode = (() => {
      if (mode === "MARKET") return side === "BUY" ? "MARKET_BUY" : "MARKET_SELL";
      if (mode === "LIMIT") return side === "BUY" ? "BUY_LIMIT" : "SELL_LIMIT";
      // STOP_LIMIT => pending stop (MVP)
      return side === "BUY" ? "BUY_STOP" : "SELL_STOP";
    })();

    const entryPrice = mode === "MARKET" ? undefined : mode === "LIMIT" ? entryA : sp; // stoplimit => stop price
    const useSl = slA ? slA : undefined;
    const useTp = Number.isFinite(tpA) && tpA > 0 ? tpA : undefined;

    try {
      setBusy(true);

      for (const a of selectedAccounts) {
        await fetchJson("/api/mt5/order", {
          broker: a.broker,
          server: a.server,
          login: a.login,
          password: a.password ?? "",
          symbol: symbol.trim(),
          volume: lots,
          orderMode,
          entryPrice,
          sl: useSl,
          tp: useTp,
          comment: "InvestPro",
        });
      }

      setMsg(`✅ Ordre envoyé (${mode} ${side}) • ${lots} lot(s) • ${selectedAccounts.length} compte(s).`);
      await refreshPositions();
      await refreshOrders();
    } catch (e: any) {
      setMsg("❌ " + String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelPending(orderTicket: number) {
    setMsg(null);
    if (!readerAcc) return;
    try {
      setBusy(true);
      await fetchJson("/api/mt5/order_cancel", {
        broker: readerAcc.broker,
        server: readerAcc.server,
        login: readerAcc.login,
        password: readerAcc.password ?? "",
        order: orderTicket,
      });
      setMsg("✅ Ordre en attente annulé.");
      await refreshOrders();
    } catch (e: any) {
      setMsg("❌ " + String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function openModifyPosition(p: any) {
    setModTicket(Number(p.ticket));
    setModSymbol(String(p.symbol));
    setModSl(String(p.sl ?? ""));
    setModTp(String(p.tp ?? ""));
    setModCloseVol("");
    setOpenModify(true);
  }

  async function saveModify() {
    setMsg(null);
    if (!readerAcc || !modTicket) return;

    try {
      setBusy(true);

      await fetchJson("/api/mt5/modify_sltp", {
        broker: readerAcc.broker,
        server: readerAcc.server,
        login: readerAcc.login,
        password: readerAcc.password ?? "",
        ticket: modTicket,
        sl: modSl ? Number(modSl) : null,
        tp: modTp ? Number(modTp) : null,
      });

      if (modCloseVol.trim()) {
        const v = Number(modCloseVol);
        if (Number.isFinite(v) && v > 0) {
          await fetchJson("/api/mt5/close", {
            broker: readerAcc.broker,
            server: readerAcc.server,
            login: readerAcc.login,
            password: readerAcc.password ?? "",
            ticket: modTicket,
            volume: v,
          });
        }
      }

      setOpenModify(false);
      setMsg("✅ Position mise à jour.");
      await refreshPositions();
    } catch (e: any) {
      setMsg("❌ " + String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    setMsg(null);
    if (!readerAcc) return setMsg("Choisis un compte (au moins 1).");

    try {
      setBusy(true);

      const to = Math.floor(Date.now() / 1000);
      const from = to - 7 * 24 * 3600;

      const added = await syncMt5HistoryToTrades({
        broker: readerAcc.broker,
        server: readerAcc.server,
        login: readerAcc.login,
        password: readerAcc.password ?? "",
        from_ts: from,
        to_ts: to,
      });

      await syncSymbols();

      // refresh symbol info after sync if symbol already chosen
      if (symbol.trim()) await loadSymbolInfo(symbol.trim());

      setMsg(`✅ Sync OK : +${added} trades • symboles mis à jour`);
    } catch (e: any) {
      setMsg("❌ Sync: " + String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  // auto load symbol info when symbol changes (debounced simple)
  useEffect(() => {
    if (!readerAcc) return;
    if (!symbol.trim()) return;

    const t = setTimeout(() => loadSymbolInfo(symbol.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, readerAcc?.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">
          Terminal <span className="text-[color:var(--gold)]">de trading</span>
        </h1>
        <p className="text-[color:var(--muted)] mt-1">
          Ordre = N/A par défaut • 3 modes (Market / Limit / Stop-Limit) • Risque = calcule les lots.
        </p>
      </div>

      {/* HEADER CARD */}
      <Card>
        <CardBody>
          <div className="grid grid-cols-1 lg:grid-cols-7 gap-4 items-end">
            {/* Comptes */}
            <div className="w-full">
              <div className="text-xs text-white/70 mb-1">Comptes</div>
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
                    {selectedAccounts.length === 0
                      ? "Compte…"
                      : selectedAccounts.length === 1
                      ? selectedAccounts[0].label
                      : `${selectedAccounts.length} comptes sélectionnés`}
                  </div>
                </div>
                <span className="text-white/40">▾</span>
              </button>
            </div>

            <GoldSelect
              label="Catégorie"
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
              searchable={false}
              maxMenuHeight={320}
            />

            <InputField
              label={`Symbol ${symbolsLoaded ? `(${filteredSymbols.length})` : "(non sync)"}`}
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

            <GoldSelect
              label="Ordre"
              value={mode}
              onChange={(v) => setMode(v as Mode3)}
              searchable={false}
              maxMenuHeight={260}
              options={[
                { value: "", label: "N/A (Choisir…)" },
                { value: "MARKET", label: "Market" },
                { value: "LIMIT", label: "Limit" },
                { value: "STOP_LIMIT", label: "Stop-Limit" },
              ]}
            />

            <GoldSelect
              label="Sens"
              value={side}
              onChange={(v) => setSide(v as Side)}
              searchable={false}
              maxMenuHeight={200}
              options={[
                { value: "BUY", label: "BUY" },
                { value: "SELL", label: "SELL" },
              ]}
            />

            <div className="flex gap-3 justify-end">
              <Button onClick={placeOrder} disabled={busy || mode === ""}>
                {busy ? "..." : "Envoyer"}
              </Button>
              <Button variant="secondary" onClick={syncAll} disabled={busy}>
                Sync
              </Button>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-4">
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
            <div className="mt-2 text-right text-xs text-[color:var(--muted)]">{progressPct}% complété</div>
          </div>

          {/* Message */}
          {msg ? (
            <div className="mt-4 text-sm rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)] p-3">
              {msg}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* MAIN GRID (Position / Risk / Recap) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Position settings */}
        <Card>
          <CardBody>
            <div className="text-lg font-semibold">Réglages de votre position</div>
            <div className="mt-4 space-y-4">
              {/* STOP-LIMIT : Stop */}
              {needsStop ? (
                <InputField
                  label="Stop"
                  value={stopPrice}
                  onChange={setStopPrice}
                  placeholder="Ex: 1,2345"
                />
              ) : null}

              {/* LIMIT / STOP-LIMIT : Entrée A (+) */}
              {needsEntry ? (
                <div className="space-y-2">
                  {entries.map((v, i) => (
                    <div key={i} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <InputField
                          label={`Entrée ${letter(i)}`}
                          value={v}
                          onChange={(nv) => setArrAt(setEntries, i, nv)}
                          placeholder="Ex: 1,2345"
                        />
                      </div>
                      {i === entries.length - 1 ? (
                        <button
                          type="button"
                          onClick={addEntry}
                          className="w-11 h-11 rounded-2xl border border-[color:var(--border)] bg-black/20 hover:bg-white/5 transition"
                          title="Ajouter une entrée"
                        >
                          +
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <div className="text-[11px] text-[color:var(--muted)]">
                    Entrée B/C… = ordres différents (comme tu as dit).
                  </div>
                </div>
              ) : null}

              {/* MARKET : pas d’entrée (UI identique à ton screen simple) */}
              {!needsEntry ? (
                <div className="text-[11px] text-[color:var(--muted)]">
                  Market : pas d’entrée obligatoire. (Pour calculer le lot, tu peux saisir une Entrée A dans Limit
                  puis repasser en Market si tu veux, ou on ajoutera plus tard le prix live.)
                </div>
              ) : null}

              {/* SLs */}
              <div className="space-y-2">
                {sls.map((v, i) => (
                  <div key={i} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <InputField
                        label={`Stop Loss ${letter(i)}`}
                        value={v}
                        onChange={(nv) => setArrAt(setSls, i, nv)}
                        placeholder="Ex: 1,2345"
                      />
                    </div>
                    {i === sls.length - 1 ? (
                      <button
                        type="button"
                        onClick={addSl}
                        className="w-11 h-11 rounded-2xl border border-[color:var(--border)] bg-black/20 hover:bg-white/5 transition"
                        title="Ajouter un Stop Loss"
                      >
                        +
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* TPs */}
              <div className="space-y-2">
                {tps.map((v, i) => (
                  <div key={i} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <InputField
                        label={`Take Profit ${letter(i)}`}
                        value={v}
                        onChange={(nv) => setArrAt(setTps, i, nv)}
                        placeholder="Ex: 1,2345"
                      />
                    </div>
                    {i === tps.length - 1 ? (
                      <button
                        type="button"
                        onClick={addTp}
                        className="w-11 h-11 rounded-2xl border border-[color:var(--border)] bg-black/20 hover:bg-white/5 transition"
                        title="Ajouter un Take Profit"
                      >
                        +
                      </button>
                    ) : null}
                  </div>
                ))}
                <div className="text-[11px] text-[color:var(--muted)]">
                  MT5 gère 1 TP natif. Les TP B/C… = mode avancé (auto/EA) qu’on fera après.
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Risk settings */}
        <Card>
          <CardBody>
            <div className="text-lg font-semibold">Réglages de votre risque</div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <InputField label="Risque (%)" value={riskPct} onChange={setRiskPct} placeholder="1" />
              <InputField label="Balance (USD)" value={balance} onChange={setBalance} placeholder="1000" />
              <InputField
                label="Exp. Reward"
                value={"N/A"}
                readOnly
                placeholder="N/A"
              />
            </div>

            <div className="mt-5">
              <div className="text-xs text-white/70 mb-2">Calcul du risque</div>
              <div className="grid grid-cols-2 gap-3">
                <GoldSelect
                  label="Base"
                  value={calcBase}
                  onChange={(v) => setCalcBase(v as any)}
                  searchable={false}
                  maxMenuHeight={160}
                  options={[
                    { value: "BALANCE", label: "Balance" },
                    { value: "EQUITY", label: "Equity" },
                  ]}
                />

                <div className="rounded-2xl border border-[color:var(--border)] bg-black/20 h-11 px-4 flex items-center justify-between">
                  <div className="text-xs text-white/70">Lots</div>
                  <div className="text-sm font-semibold text-white">
                    {lotCalc.reason === "ok" ? lotCalc.lots.toFixed(2) : "N/A"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="text-xs text-white/70 mb-2">Déduire les commissions du risque ?</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeductCommission(true)}
                  className={[
                    "px-4 h-10 rounded-2xl border transition text-sm",
                    deductCommission
                      ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                      : "border-[color:var(--border)] bg-black/20 text-white/70 hover:bg-white/5",
                  ].join(" ")}
                >
                  Oui
                </button>
                <button
                  type="button"
                  onClick={() => setDeductCommission(false)}
                  className={[
                    "px-4 h-10 rounded-2xl border transition text-sm",
                    !deductCommission
                      ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                      : "border-[color:var(--border)] bg-black/20 text-white/70 hover:bg-white/5",
                  ].join(" ")}
                >
                  Non
                </button>
                <div className="ml-auto text-xs text-[color:var(--muted)] flex items-center">
                  {symbolInfo ? `tick=${symbolInfo.tick_value}/${symbolInfo.tick_size}` : "symbol_info: N/A"}
                </div>
              </div>

              {lotCalc.reason !== "ok" ? (
                <div className="mt-3 text-xs text-[color:var(--muted)]">
                  {lotCalc.reason === "sync_symbol" ? "Clique Sync pour charger le symbol info." : null}
                  {lotCalc.reason === "entry" ? "Entrée A requise pour calculer." : null}
                  {lotCalc.reason === "sl" ? "Stop Loss A requis pour calculer." : null}
                  {lotCalc.reason === "balance" ? "Balance requise." : null}
                  {lotCalc.reason === "risk" ? "Risque (%) requis." : null}
                  {lotCalc.reason === "tick_value" ? "tick_value invalide (broker)." : null}
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>

        {/* Recap */}
        <Card>
          <CardBody>
            <div className="text-lg font-semibold">Récapitulatif de la position</div>
            <div className="mt-4 text-sm space-y-2">
              <div className="flex justify-between text-white/80">
                <span>Mode</span>
                <span className="text-white">{mode || "N/A"}</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>Sens</span>
                <span className="text-white">{side}</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>Symbol</span>
                <span className="text-white">{symbol || "—"}</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>Lots</span>
                <span className="text-white">{lotCalc.reason === "ok" ? lotCalc.lots.toFixed(2) : "N/A"}</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>SL A</span>
                <span className="text-white">{sls[0] || "—"}</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>TP A</span>
                <span className="text-white">{tps[0] || "—"}</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* TABLE TOGGLES */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setShowPositions((v) => !v)}
          className={[
            "px-4 py-2 rounded-2xl border transition text-sm",
            showPositions
              ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
              : "border-[color:var(--border)] bg-black/20 text-white/70 hover:bg-white/5",
          ].join(" ")}
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
        >
          Ordres en attente
        </button>

        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={refreshPositions} disabled={busy}>
            Refresh Positions
          </Button>
          <Button variant="secondary" onClick={refreshOrders} disabled={busy}>
            Refresh Pending
          </Button>
        </div>
      </div>

      {/* POSITIONS */}
      {showPositions ? (
        <Card>
          <CardBody>
            <div className="text-lg font-semibold">Positions ouvertes</div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3">Ticket</th>
                    <th className="text-left py-3">Symbol</th>
                    <th className="text-left py-3">Type</th>
                    <th className="text-left py-3">Volume</th>
                    <th className="text-left py-3">Entry</th>
                    <th className="text-left py-3">SL</th>
                    <th className="text-left py-3">TP</th>
                    <th className="text-left py-3">Profit</th>
                    <th className="text-left py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-[color:var(--muted)]">
                        Aucune position ouverte.
                      </td>
                    </tr>
                  ) : (
                    positions.map((p) => (
                      <tr key={p.ticket} className="border-b border-white/5">
                        <td className="py-3">{p.ticket}</td>
                        <td className="py-3">{p.symbol}</td>
                        <td className="py-3">{orderTypeLabel(Number(p.type))}</td>
                        <td className="py-3">{p.volume}</td>
                        <td className="py-3">{p.price_open}</td>
                        <td className="py-3">{p.sl}</td>
                        <td className="py-3">{p.tp}</td>
                        <td className={p.profit >= 0 ? "py-3 text-[color:var(--success)]" : "py-3 text-[color:var(--danger)]"}>
                          {fmt(Number(p.profit ?? 0))}
                        </td>
                        <td className="py-3">
                          <Button variant="secondary" onClick={() => openModifyPosition(p)} disabled={busy}>
                            Modifier
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-xs text-[color:var(--muted)]">
              * Auto refresh toutes les 3 secondes (lecture via le 1er compte sélectionné).
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* PENDING */}
      {showOrders ? (
        <Card>
          <CardBody>
            <div className="text-lg font-semibold">Ordres en attente</div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3">Order</th>
                    <th className="text-left py-3">Symbol</th>
                    <th className="text-left py-3">Type</th>
                    <th className="text-left py-3">Volume</th>
                    <th className="text-left py-3">Prix</th>
                    <th className="text-left py-3">SL</th>
                    <th className="text-left py-3">TP</th>
                    <th className="text-left py-3">Comment</th>
                    <th className="text-left py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-[color:var(--muted)]">
                        Aucun ordre en attente.
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.ticket} className="border-b border-white/5">
                        <td className="py-3">{o.ticket}</td>
                        <td className="py-3">{o.symbol}</td>
                        <td className="py-3">{pendingTypeLabel(Number(o.type))}</td>
                        <td className="py-3">{o.volume_current}</td>
                        <td className="py-3">{o.price_open}</td>
                        <td className="py-3">{o.sl}</td>
                        <td className="py-3">{o.tp}</td>
                        <td className="py-3 text-white/60">{o.comment}</td>
                        <td className="py-3">
                          <Button variant="danger" onClick={() => cancelPending(o.ticket)} disabled={busy}>
                            Annuler
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-xs text-[color:var(--muted)]">
              * Auto refresh toutes les 3 secondes.
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* Accounts modal */}
      <Modal
        open={openAccountsModal}
        title="Choisir les comptes MT5"
        onClose={() => setOpenAccountsModal(false)}
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="flex gap-2">
              <Button variant="secondary" onClick={selectAll}>Tout</Button>
              <Button variant="secondary" onClick={selectNone}>Aucun</Button>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setOpenAccountsModal(false)}>Fermer</Button>
              <Button onClick={() => (window.location.href = "/dashboard/comptes")}>Gérer mes comptes</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-[color:var(--muted)]">
            Sélectionne 1 ou plusieurs comptes. L’ordre sera envoyé sur tous.
          </div>

          <div className="space-y-2">
            {connectedAccounts.map((a) => (
              <button
                key={a.id}
                onClick={() => toggleSelected(a.id)}
                className={[
                  "w-full text-left px-4 py-3 rounded-2xl border transition flex items-center justify-between gap-3",
                  selectedIds.includes(a.id)
                    ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
                    : "border-[color:var(--border)] bg-black/20 hover:bg-white/5",
                ].join(" ")}
              >
                <div>
                  <div className="font-semibold text-white">{a.label}</div>
                  <div className="text-xs text-[color:var(--muted)]">{a.broker} • {a.server}</div>
                </div>
                <div className="text-lg">{selectedIds.includes(a.id) ? "✅" : "⬜"}</div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* Modify modal */}
      <Modal
        open={openModify}
        title={`Modifier position ${modTicket ?? ""}`}
        onClose={() => setOpenModify(false)}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpenModify(false)}>Annuler</Button>
            <Button onClick={saveModify} disabled={busy}>{busy ? "..." : "Enregistrer"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-[color:var(--muted)]">{modSymbol}</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="SL (prix)" value={modSl} onChange={setModSl} placeholder="laisser vide pour garder" />
            <InputField label="TP (prix)" value={modTp} onChange={setModTp} placeholder="laisser vide pour garder" />
          </div>

          <InputField label="Clôture partielle (volume)" value={modCloseVol} onChange={setModCloseVol} placeholder="Ex: 0.05 (optionnel)" />

          <div className="text-xs text-[color:var(--muted)]">
            * Si tu mets un volume, ça fermera cette partie de la position après mise à jour SL/TP.
          </div>
        </div>
      </Modal>

      {/* Gate modal */}
      <Modal
        open={openGateModal}
        title="Choisissez vos comptes"
        onClose={() => setOpenGateModal(false)}
        footer={
          <div className="flex items-center justify-end gap-3">
            {gateReason === "noPlan" ? (
              <>
                <Button variant="ghost" onClick={() => setOpenGateModal(false)}>Annuler</Button>
                <Button onClick={() => (window.location.href = "/dashboard/abonnement")}>Voir abonnement</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => (window.location.href = "/dashboard/comptes")}>Gérer mes comptes</Button>
                <Button onClick={() => (window.location.href = "/dashboard/comptes")}>Ajouter un compte</Button>
              </>
            )}
          </div>
        }
      >
        {gateReason === "noPlan" ? (
          <div className="space-y-3">
            <div className="text-sm text-[color:var(--muted)]">L’accès au terminal nécessite un abonnement.</div>
            <div className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-3 text-sm text-[color:var(--gold)]">
              Plan actuel : <b>{getPlan()}</b>
            </div>
          </div>
        ) : (
          <div className="text-sm text-[color:var(--muted)]">
            Vous n’avez pas de comptes connectés (MT5). Va sur Comptes et clique “Tester”.
          </div>
        )}
      </Modal>
    </div>
  );
}
