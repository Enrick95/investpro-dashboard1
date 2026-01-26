"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardSubCard } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

type Market = "forex" | "indices" | "commodities" | "crypto";
type RiskMode = "percent" | "amount";
type Side = "BUY" | "SELL";

function Input({
  label,
  suffix,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm text-white/70 mb-2">{label}</div>
      <div className="relative">
        <input
          {...props}
          className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                     text-white placeholder:text-white/30 outline-none
                     focus:border-[color:var(--gold-border)]
                     focus:ring-2 focus:ring-[color:var(--gold-soft)]
                     transition pr-16"
        />
        {suffix ? (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[color:var(--muted)]">
            {suffix}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function Select({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-sm text-white/70 mb-2">{label}</div>
      <select
        {...props}
        className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                   text-white outline-none
                   focus:border-[color:var(--gold-border)]
                   focus:ring-2 focus:ring-[color:var(--gold-soft)]
                   transition"
      >
        {children}
      </select>
    </label>
  );
}

function fmt(n: number, max = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: max });
}

type SymbolPreset = {
  label: string;
  symbol: string;
  market: Market;

  // interne (caché du visuel)
  pointSize: number;         // taille d’un point en prix
  valuePerPoint: number;     // valeur d’1 point pour 1 lot (approx V1)

  // stop loss "facile"
  defaultSLPoints: number;

  // prix V1
  priceProvider: "binance" | "demo";
  priceSymbol?: string;      // ex: BTCUSDT
  demoPrice: number;
};

const SYMBOLS: Record<Market, SymbolPreset[]> = {
  crypto: [
    {
      label: "BTCUSD",
      symbol: "BTCUSD",
      market: "crypto",
      pointSize: 1,
      valuePerPoint: 1,
      defaultSLPoints: 1500,
      priceProvider: "binance",
      priceSymbol: "BTCUSDT",
      demoPrice: 94600,
    },
    {
      label: "ETHUSD",
      symbol: "ETHUSD",
      market: "crypto",
      pointSize: 1,
      valuePerPoint: 1,
      defaultSLPoints: 120,
      priceProvider: "binance",
      priceSymbol: "ETHUSDT",
      demoPrice: 3500,
    },
  ],
  commodities: [
    {
      label: "XAUUSD (Gold)",
      symbol: "XAUUSD",
      market: "commodities",
      pointSize: 1,
      valuePerPoint: 1,
      defaultSLPoints: 100,
      priceProvider: "demo",
      demoPrice: 4578,
    },
    {
      label: "USOIL (WTI)",
      symbol: "USOIL",
      market: "commodities",
      pointSize: 0.01,
      valuePerPoint: 1,
      defaultSLPoints: 100,
      priceProvider: "demo",
      demoPrice: 78.35,
    },
  ],
  indices: [
    {
      label: "NAS100",
      symbol: "NAS100",
      market: "indices",
      pointSize: 1,
      valuePerPoint: 1,
      defaultSLPoints: 100,
      priceProvider: "demo",
      demoPrice: 18000,
    },
    {
      label: "GER40",
      symbol: "GER40",
      market: "indices",
      pointSize: 1,
      valuePerPoint: 1,
      defaultSLPoints: 80,
      priceProvider: "demo",
      demoPrice: 17000,
    },
  ],
  forex: [
    {
      label: "EURUSD",
      symbol: "EURUSD",
      market: "forex",
      pointSize: 0.0001,
      valuePerPoint: 10,
      defaultSLPoints: 20,
      priceProvider: "demo",
      demoPrice: 1.1,
    },
    {
      label: "GBPUSD",
      symbol: "GBPUSD",
      market: "forex",
      pointSize: 0.0001,
      valuePerPoint: 10,
      defaultSLPoints: 25,
      priceProvider: "demo",
      demoPrice: 1.27,
    },
  ],
};

async function fetchBinancePrice(binanceSymbol: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(binanceSymbol)}`,
      { cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const p = Number(j?.price);
    return Number.isFinite(p) ? p : null;
  } catch {
    return null;
  }
}

export default function SimulateurRisquePage() {
  const [currency, setCurrency] = useState("USD");
  const [balance, setBalance] = useState("1000");

  const [market, setMarket] = useState<Market>("crypto");
  const presets = useMemo(() => SYMBOLS[market], [market]);

  const [symbol, setSymbol] = useState(presets[0].symbol);
  const preset = useMemo(
    () => presets.find((p) => p.symbol === symbol) ?? presets[0],
    [presets, symbol]
  );

  // reset symbol when market changes
  const [marketKey, setMarketKey] = useState<Market>(market);
  if (marketKey !== market) {
    setMarketKey(market);
    setSymbol(SYMBOLS[market][0].symbol);
  }

  const [side, setSide] = useState<Side>("BUY");

  // Auto inputs
  const [entry, setEntry] = useState(String(preset.demoPrice));
  const [slPoints, setSlPoints] = useState(String(preset.defaultSLPoints));
  const [stopLoss, setStopLoss] = useState(String(preset.demoPrice - preset.defaultSLPoints * preset.pointSize));

  // Internal (hidden) specs
  const pointSize = preset.pointSize;
  const valuePerPoint = preset.valuePerPoint;

  // when symbol changes, reset defaults
  const [symbolKey, setSymbolKey] = useState(symbol);
  if (symbolKey !== symbol) {
    setSymbolKey(symbol);
    setEntry(String(preset.demoPrice));
    setSlPoints(String(preset.defaultSLPoints));
    const e = preset.demoPrice;
    const sl = side === "BUY" ? e - preset.defaultSLPoints * pointSize : e + preset.defaultSLPoints * pointSize;
    setStopLoss(String(sl));
  }

  // auto SL price from entry + slPoints
  useEffect(() => {
    const e = Number(entry);
    const pts = Number(slPoints);
    if (!Number.isFinite(e) || !Number.isFinite(pts)) return;

    const sl = side === "BUY" ? e - pts * pointSize : e + pts * pointSize;
    setStopLoss(String(sl));
  }, [entry, slPoints, side, pointSize]);

  // Risk
  const [riskMode, setRiskMode] = useState<RiskMode>("percent");
  const [riskPercent, setRiskPercent] = useState("1");
  const [riskAmount, setRiskAmount] = useState("10");

  // RR
  const [rr, setRr] = useState("2");

  // Price status
  const [priceStatus, setPriceStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");

  async function refreshPrice() {
    setPriceStatus("loading");

    if (preset.priceProvider === "binance" && preset.priceSymbol) {
      const p = await fetchBinancePrice(preset.priceSymbol);
      if (p !== null) {
        setEntry(String(p));
        setPriceStatus("ok");
        return;
      }
      setPriceStatus("fail");
      return;
    }

    // demo fallback
    setEntry(String(preset.demoPrice));
    setPriceStatus("ok");
  }

  const computed = useMemo(() => {
    const bal = Number(balance) || 0;
    const e = Number(entry);
    const sl = Number(stopLoss);

    const pts = Math.abs(e - sl) / (pointSize > 0 ? pointSize : 1);

    const riskMoney =
      riskMode === "percent"
        ? bal * ((Number(riskPercent) || 0) / 100)
        : Number(riskAmount) || 0;

    const riskPerLot = pts * valuePerPoint;
    const lot = riskPerLot > 0 ? riskMoney / riskPerLot : 0;

    const rrNum = Number(rr) || 0;
    const tpDistance = Math.abs(e - sl) * rrNum;
    const tp = rrNum > 0 ? (side === "BUY" ? e + tpDistance : e - tpDistance) : NaN;

    const profitIfTP = (pts * rrNum) * valuePerPoint * lot;

    return { pts, riskMoney, lot, tp, profitIfTP };
  }, [balance, entry, stopLoss, riskMode, riskPercent, riskAmount, rr, side, pointSize, valuePerPoint]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Simulateur <span className="text-[color:var(--gold)]">de risque</span>
          </h1>
          <p className="text-[color:var(--muted)] mt-1">
            Calcule le risque, la taille de position et les objectifs basés sur tes paramètres.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={refreshPrice}>
            Rafraîchir prix
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setCurrency("USD");
              setBalance("1000");
              setMarket("crypto");
              setSide("BUY");
              setRiskMode("percent");
              setRiskPercent("1");
              setRiskAmount("10");
              setRr("2");
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardBody>
            <div className="flex items-center justify-between gap-4">
              <div className="text-lg font-semibold">Paramètres</div>
              <div className="text-xs text-[color:var(--muted)]">
                Prix:{" "}
                {priceStatus === "loading"
                  ? "chargement..."
                  : priceStatus === "ok"
                  ? "OK"
                  : priceStatus === "fail"
                  ? "échec (fallback démo)"
                  : "—"}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Balance" value={balance} onChange={(e) => setBalance(e.target.value)} suffix={currency} />
              <Select label="Devise" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </Select>

              <Select label="Marché" value={market} onChange={(e) => setMarket(e.target.value as Market)}>
                <option value="crypto">Crypto</option>
                <option value="commodities">Matières premières</option>
                <option value="indices">Indices</option>
                <option value="forex">Forex</option>
              </Select>

              <Select label="Symbole" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {presets.map((p) => (
                  <option key={p.symbol} value={p.symbol}>
                    {p.label}
                  </option>
                ))}
              </Select>

              <Select label="Sens" value={side} onChange={(e) => setSide(e.target.value as Side)}>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </Select>

              <Input label="Prix d’entrée (auto)" value={entry} onChange={(e) => setEntry(e.target.value)} />

              <Input label="Stop Loss (points)" value={slPoints} onChange={(e) => setSlPoints(e.target.value)} suffix="pts" />

              <Input label="Stop Loss (prix) auto" value={stopLoss} readOnly />

              <Select label="Risque" value={riskMode} onChange={(e) => setRiskMode(e.target.value as RiskMode)}>
                <option value="percent">En % de la balance</option>
                <option value="amount">Montant fixe</option>
              </Select>

              {riskMode === "percent" ? (
                <Input label="Risque (%)" value={riskPercent} onChange={(e) => setRiskPercent(e.target.value)} suffix="%" />
              ) : (
                <Input label={`Risque (${currency})`} value={riskAmount} onChange={(e) => setRiskAmount(e.target.value)} suffix={currency} />
              )}

              <Input label="RR (Risk:Reward)" value={rr} onChange={(e) => setRr(e.target.value)} suffix="x" />
            </div>

            <div className="mt-4 text-xs text-[color:var(--muted)]">
              * BTC/ETH utilisent un prix réel (Binance). Le reste est en “démo” jusqu’au branchement API/MT5.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-lg font-semibold">Résultats</div>

            <div className="mt-4 space-y-3">
              <CardSubCard>
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Distance SL</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {fmt(computed.pts, 2)} points
                </div>
              </CardSubCard>

              <CardSubCard>
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Montant risqué</div>
                <div className="mt-2 text-2xl font-bold text-[color:var(--danger)]">
                  {fmt(computed.riskMoney, 2)} {currency}
                </div>
              </CardSubCard>

              <CardSubCard>
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Lot/Contrat conseillé</div>
                <div className="mt-2 text-2xl font-bold text-[color:var(--gold)]">
                  {fmt(computed.lot, 4)}
                </div>
              </CardSubCard>

              <CardSubCard>
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">TP estimé (prix)</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {Number.isFinite(computed.tp) ? fmt(computed.tp, 5) : "—"}
                </div>
              </CardSubCard>

              <CardSubCard>
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Gain si TP</div>
                <div className="mt-2 text-xl font-bold text-[color:var(--success)]">
                  {fmt(computed.profitIfTP, 2)} {currency}
                </div>
              </CardSubCard>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
