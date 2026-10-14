"use client";

import { useEffect, useMemo, useState } from "react";
import { ACCOUNT_CURRENCIES, MARKETS, SUGGESTED_ASSETS, calculatePosition, getInstrument, parseDecimal, resolveConversion, type AssetMarket } from "@/lib/risk-simulator";

import {
  AlertTriangle,
  Calculator,
  RotateCcw,
} from "lucide-react";

type RiskMode = "percent" | "amount";

const safeNumber = parseDecimal;

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export default function SimulateurRisquePage() {
  const [currency, setCurrency] = useState("EUR");

  const [balance, setBalance] = useState("10000");

  const [riskMode, setRiskMode] =
    useState<RiskMode>("percent");

  const [riskPercent, setRiskPercent] =
    useState("1");

  const [riskAmount, setRiskAmount] =
    useState("100");

  const [entryPrice, setEntryPrice] =
    useState("");

  const [stopLossPrice, setStopLossPrice] =
    useState("");

  const [valuePerPoint, setValuePerPoint] =
    useState("");

  const [rr, setRr] = useState("2");


  const [brokerOpen, setBrokerOpen] = useState(false);
  const [market, setMarket] = useState<AssetMarket | "all">("all");
  const [symbol, setSymbol] = useState("");
  const [profitCurrency, setProfitCurrency] = useState("");
  const [specMode, setSpecMode] = useState<"contract" | "ticks">("contract");
  const [tickSize, setTickSize] = useState("");
  const [tickValue, setTickValue] = useState("");
  const [minLot, setMinLot] = useState("0.01");
  const [lotStep, setLotStep] = useState("0.01");
  const [maxLot, setMaxLot] = useState("");
  const [manualRate, setManualRate] = useState("");
  const [rateData, setRateData] = useState<{ base: string; rates: Record<string, number>; dates: Record<string, string> } | null>(null);
  const [rateLoading, setRateLoading] = useState(true);
  const instrument = getInstrument(symbol, market === "all" ? "custom" : market);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/risk-rates", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("rates");
        return response.json() as Promise<{ base: string; rates: Record<string, number>; dates: Record<string, string> }>;
      })
      .then(data => {
        if (!controller.signal.aborted && data.base === "EUR" && data.rates && data.dates) setRateData(data);
      })
      .catch(() => { /* Manual conversion is available when reference rates cannot load. */ })
      .finally(() => { if (!controller.signal.aborted) setRateLoading(false); });
    return () => controller.abort();
  }, []);

  function chooseSymbol(value: string, hint: AssetMarket | "all" = market) {
    const next = getInstrument(value, hint === "all" ? "custom" : hint);
    setSymbol(value.toUpperCase());
    if (next.profitCurrency) setMarket(next.market);
    setValuePerPoint(next.contractSize ? String(next.contractSize) : "");
    setProfitCurrency(next.profitCurrency);
    setBrokerOpen(Boolean(value) && !next.contractSize);
    setEntryPrice(""); setStopLossPrice(""); setManualRate("");
    setTickSize(""); setTickValue(""); setSpecMode("contract");
    setMinLot("0.01"); setLotStep("0.01"); setMaxLot("");
  }


  const calculated = useMemo(() => {
    const capital = safeNumber(balance);
    const entry = safeNumber(entryPrice), stopLoss = safeNumber(stopLossPrice);
    const targetRR = safeNumber(rr);
    const stopDistance = Math.abs(entry - stopLoss);
    const isBuy = stopLoss < entry;
    const takeProfit = isBuy ? entry + stopDistance * targetRR : entry - stopDistance * targetRR;
    const riskMoney = riskMode === "percent" ? capital * safeNumber(riskPercent) / 100 : safeNumber(riskAmount);
    const effectiveRiskPercent = capital > 0 ? riskMoney / capital * 100 : NaN;
    const conversion = resolveConversion({
      profitCurrency, accountCurrency: currency,
      baseCurrency: profitCurrency === instrument.profitCurrency ? instrument.baseCurrency : undefined,
      stop: stopLoss, target: takeProfit, manualRate: manualRate.trim() ? safeNumber(manualRate) : undefined,
      rates: rateData?.rates,
    });
    const result = calculatePosition({
      symbol, balance: capital, budget: riskMoney, entry, stop: stopLoss, rr: targetRR,
      mode: specMode, contractSize: safeNumber(valuePerPoint), lossRate: conversion.lossRate, gainRate: conversion.gainRate,
      tickSize: safeNumber(tickSize), tickValue: safeNumber(tickValue), minLot: safeNumber(minLot), lotStep: safeNumber(lotStep),
      maxLot: maxLot.trim() ? safeNumber(maxLot) : undefined,
    });
    return {
      ...result, conversion, capital, entry, stopLoss, stopDistance, isBuy, takeProfit, riskMoney,
      effectiveRiskPercent, lotSize: result.lots, targetRR,
      potentialGain: result.gain, capitalAfterLoss: capital - result.actualRisk,
      capitalAfterWin: capital + result.gain,
    };
  }, [balance, entryPrice, stopLossPrice, rr, riskMode, riskPercent, riskAmount, profitCurrency,
    currency, instrument.profitCurrency, instrument.baseCurrency, manualRate, rateData,
    symbol, specMode, valuePerPoint, tickSize, tickValue, minLot, lotStep, maxLot]);

  function resetSimulator() {
    setCurrency("EUR");

    setBalance("10000");

    setRiskMode("percent");

    setRiskPercent("1");

    setRiskAmount("100");

    setMarket("all");
    chooseSymbol("", "all");
    setEntryPrice("");

    setStopLossPrice("");

    setValuePerPoint("");

    setRr("2");
  }

  function selectRisk(value: string) {
    setRiskMode("percent");

    setRiskPercent(value);
  }


  const valid = !calculated.error;
  const money = (value: number) => formatNumber(value) + " " + currency;
  const rateDate = [rateData?.dates[profitCurrency], rateData?.dates[currency]].filter(Boolean).sort()[0];
  const suggestions = SUGGESTED_ASSETS.filter(item => market === "all" || item.market === market);
  return (
    <div className="investpro-mobile-page space-y-5 pb-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--gold)]">Préparer mon trade</div>
          <h1 className="text-2xl font-semibold text-white">Simulateur de <span className="text-[color:var(--gold)]">risque</span></h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">Choisis un actif et ton risque maximum. Tes prix d’entrée et de Stop Loss déterminent la taille de position.</p>
        </div>
        <button type="button" onClick={resetSimulator} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-[color:var(--border)] px-4 text-xs text-white/60"><RotateCcw size={14} />Réinitialiser</button>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <Step number="01" title="Quel actif veux-tu trader ?" description="Recherche une paire Forex, le gold, un indice ou le symbole de ton broker.">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Marché" value={market} onChange={value => { setMarket(value as AssetMarket | "all"); chooseSymbol("", value as AssetMarket | "all"); }}>
                <option value="all">Tous les marchés</option>{MARKETS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </SelectField>
              <label className="block"><span className="mb-2 block text-xs text-white/60">Actif / paire de devises</span>
                <input className={inputClass} list="risk-assets" value={symbol} onChange={event => chooseSymbol(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Ex. EURUSD, GOLD, NAS100…" />
                <datalist id="risk-assets">{suggestions.map(item => <option key={item.symbol} value={item.symbol}>{item.label}</option>)}</datalist>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{["EURUSD", "GBPJPY", "XAUUSD", "NAS100", "GER40"].map(value => <button type="button" key={value} aria-pressed={instrument.symbol === value} onClick={() => chooseSymbol(value, "all")} className={"min-h-9 rounded-lg border px-3 text-xs transition " + (instrument.symbol === value ? activeClass : inactiveClass)}>{value === "XAUUSD" ? "Gold · XAUUSD" : value}</button>)}</div>
            {symbol ? <p className="mt-4 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 py-3 text-xs leading-5 text-white/65">
              <strong className="text-[color:var(--gold)]">{instrument.label}</strong>
              {instrument.contractSize ? " · Contrat standard indicatif de " + formatNumber(instrument.contractSize, 0) + (instrument.market === "metals" ? " onces par lot." : " unités par lot.") : " · Renseigne la valeur du contrat dans les paramètres du broker ci-dessous."}
            </p> : <p className="mt-3 text-xs leading-5 text-white/35">Les suggestions ne limitent pas le choix : tu peux saisir un autre symbole. GOLD est reconnu comme XAUUSD.</p>}
          </Step>

          <Step number="02" title="Combien acceptes-tu de risquer ?" description="Le budget est calculé dans la devise de ton compte.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Capital du compte" value={balance} onChange={setBalance} suffix={currency} placeholder="10000" />
              <SelectField label="Devise du compte" value={currency} onChange={value => { setCurrency(value); setManualRate(""); if (specMode === "ticks") setTickValue(""); }}>{ACCOUNT_CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}</SelectField>
              <SelectField label="Exprimer mon risque en" value={riskMode} onChange={value => setRiskMode(value as RiskMode)}><option value="percent">Pourcentage du capital</option><option value="amount">Montant fixe</option></SelectField>
              {riskMode === "percent" ? <Field label="Risque maximum" value={riskPercent} onChange={setRiskPercent} suffix="%" /> : <Field label="Montant maximum à risquer" value={riskAmount} onChange={setRiskAmount} suffix={currency} />}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-white/35">Accès rapide</span>{["0.5", "1", "1.5", "2"].map(value => <button type="button" key={value} onClick={() => selectRisk(value)} aria-pressed={riskMode === "percent" && riskPercent === value} className={"min-h-9 rounded-lg border px-3 text-xs " + (riskMode === "percent" && riskPercent === value ? activeClass : inactiveClass)}>{value.replace(".", ",")} %</button>)}</div>
          </Step>

          <Step number="03" title="Où sont ton entrée et ton Stop Loss ?" description="Le sens du trade est déduit de la position du Stop Loss.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prix d’entrée" value={entryPrice} onChange={setEntryPrice} placeholder={instrument.market === "forex" ? "Ex. 1,10000" : "Prix de l’actif"} />
              <Field label="Stop Loss" value={stopLossPrice} onChange={setStopLossPrice} placeholder={instrument.market === "forex" ? "Ex. 1,09500" : "Prix du Stop Loss"} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Ratio de prix visé" value={rr} onChange={setRr} suffix="R" />
              <div className="rounded-xl border border-white/5 bg-black/20 p-3"><span className="text-xs text-white/45">Distance entrée → SL</span><div className="mt-2 text-sm font-semibold text-[color:var(--gold)]">{formatNumber(calculated.stopDistance, 8)}{instrument.pipSize && Number.isFinite(calculated.stopDistance) ? <span className="ml-2 text-xs font-normal text-white/45">({formatNumber(calculated.stopDistance / instrument.pipSize)} pips)</span> : null}</div></div>
            </div>
            {Number.isFinite(calculated.stopDistance) && calculated.stopDistance > 0 && <p className="mt-4 text-xs text-white/45">Sens estimé : <strong className={calculated.isBuy ? "text-emerald-400" : "text-red-400"}>{calculated.isBuy ? "ACHAT" : "VENTE"}</strong> · Objectif de prix {formatNumber(calculated.targetRR)}R</p>}
          </Step>

          {symbol && <details id="risk-broker-settings" className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4 sm:p-5" open={brokerOpen} onToggle={event => setBrokerOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer text-sm font-semibold text-white">Paramètres du broker <span className="ml-2 text-xs font-normal text-white/40">{instrument.contractSize ? "Contrat standard · modifiable" : "À compléter pour cet actif"}</span></summary>
            <p className="mt-3 text-xs leading-5 text-white/45">Dans MetaTrader : clic droit sur le symbole → Spécification. Le contrat, le minimum et le pas de volume peuvent varier selon le compte.</p>
            <div className="mt-4"><SelectField label="Méthode de calcul" value={specMode} onChange={value => setSpecMode(value as "contract" | "ticks")}><option value="contract">Taille du contrat / valeur d’un point</option><option value="ticks">Taille et valeur du tick du broker</option></SelectField></div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">{specMode === "contract" ? <>
              <Field label={instrument.market === "forex" ? "Unités par lot" : instrument.market === "metals" ? "Onces par lot" : "Valeur d’un mouvement de prix de 1 pour 1 lot"} value={valuePerPoint} onChange={setValuePerPoint} suffix={instrument.market === "forex" || instrument.market === "metals" ? undefined : profitCurrency} placeholder="Valeur indiquée par le broker" />
              <SelectField label="Devise du profit du contrat" value={profitCurrency} onChange={value => { setProfitCurrency(value); setManualRate(""); }}><option value="">Choisir la devise</option>{ACCOUNT_CURRENCIES.map(code => <option key={code}>{code}</option>)}</SelectField>
            </> : <>
              <Field label="Taille du tick (variation de prix)" value={tickSize} onChange={setTickSize} placeholder="Ex. 0,00001 ou 0,01" />
              <Field label="Valeur du tick de perte pour 1 lot" value={tickValue} onChange={setTickValue} suffix={currency} placeholder="Dans la devise du compte" />
              <p className="text-xs leading-5 text-white/40 sm:col-span-2">Valeur du tick dans la devise de ton compte ({currency}). Le gain est estimé avec la même valeur ; il peut différer de la valeur du tick de profit.</p>
            </>}</div>
            {specMode === "contract" && profitCurrency && profitCurrency !== currency && <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/65">Conversion : 1 {profitCurrency} = {formatNumber(calculated.conversion.lossRate, 8)} {currency}</div>
              <p className="mt-2 text-xs leading-5 text-white/40">{calculated.conversion.source === "pair" ? "Taux déduit de la paire au prix du SL. Le gain est converti au prix du TP." : calculated.conversion.source === "manual" ? "Taux personnalisé utilisé pour la simulation." : calculated.conversion.source === "reference" ? "Taux de référence Frankfurter du " + (rateDate || "dernier jour disponible") + ", indicatif et non temps réel." : rateLoading ? "Chargement du taux de référence…" : "Taux automatique indisponible : renseigne la conversion ci-dessous."}</p>
              <div className="mt-3"><Field label={"Taux personnalisé · 1 " + profitCurrency + " en " + currency} value={manualRate} onChange={setManualRate} placeholder={Number.isFinite(calculated.conversion.lossRate) ? formatNumber(calculated.conversion.lossRate, 8) : "Taux nécessaire au calcul"} /></div>
            </div>}
            <div className="mt-4 grid gap-4 sm:grid-cols-3"><Field label="Volume minimum" value={minLot} onChange={setMinLot} suffix="lot" /><Field label="Pas de volume" value={lotStep} onChange={setLotStep} suffix="lot" /><Field label="Volume maximum (facultatif)" value={maxLot} onChange={setMaxLot} suffix="lots" placeholder="Non renseigné" /></div>
            <p className="mt-3 text-xs leading-5 text-white/40">Les volumes 0,01 sont indicatifs. Adapte-les aux spécifications du broker ; le volume calculé est arrondi vers le bas.</p>
          </details>}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:col-span-4">
          <section className="rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5">
            <div className="flex items-center gap-2 text-[color:var(--gold)]"><Calculator size={18} /><h2 className="text-sm font-semibold text-white">Ma taille de position</h2></div>
            <div aria-live="polite" className="mt-6"><div className="text-4xl font-semibold text-[color:var(--gold)]">{valid ? formatNumber(calculated.lotSize, 8) : "—"}{valid && <span className="ml-2 text-base font-normal text-white/50">lot{calculated.lotSize > 1 ? "s" : ""}</span>}</div>
              <p className="mt-2 text-xs text-white/40">{valid ? symbol + " · " + (calculated.isBuy ? "Achat" : "Vente") + " · volume arrondi au pas de " + lotStep : "Complète les trois étapes pour obtenir ton volume."}</p>
              {!valid && <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200">{calculated.error}</div>}
            </div>
            <div className="mt-6 space-y-2">
              <ResultRow label="Budget de risque maximum" value={money(calculated.riskMoney)} />
              <ResultRow label="Perte estimée au SL" value={valid ? "−" + money(calculated.actualRisk) : "—"} type="loss" />
              <ResultRow label="Gain potentiel estimé au TP" value={valid ? "+" + money(calculated.potentialGain) : "—"} type="win" />
              <ResultRow label="Take Profit estimé" value={valid ? formatNumber(calculated.takeProfit, 8) : "—"} />
            </div>
            {valid && <p className="mt-4 text-xs leading-5 text-white/40">Risque après arrondi : {formatNumber(calculated.actualRisk / calculated.capital * 100)} % du capital. {calculated.capped ? "Volume limité au maximum renseigné." : ""}</p>}
            {specMode === "contract" && profitCurrency && profitCurrency !== currency && <p className="mt-3 text-xs leading-5 text-white/40">{calculated.conversion.source === "reference" ? "Converti en " + currency + " · taux de référence du " + rateDate : calculated.conversion.source === "pair" ? "Conversion calculée au prix du SL / TP." : calculated.conversion.source === "manual" ? "Conversion selon ton taux personnalisé." : rateLoading ? "Conversion en cours…" : "Conversion à renseigner dans les paramètres du broker."}</p>}
            {symbol && <button type="button" onClick={() => setBrokerOpen(true)} className="mt-4 min-h-10 text-xs font-medium text-[color:var(--gold)] underline underline-offset-4">Vérifier les paramètres du broker</button>}
            {calculated.effectiveRiskPercent > 2 && <p className="mt-4 flex gap-2 rounded-xl bg-red-500/5 p-3 text-xs leading-5 text-red-300"><AlertTriangle size={16} className="mt-0.5 shrink-0" />Ton budget dépasse 2 % du capital. Compare-le aux limites de ton plan.</p>}
          </section>
          <details className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <summary className="cursor-pointer text-xs font-semibold text-white/65">Comprendre mon résultat</summary>
            <div className="mt-4 space-y-3 text-xs leading-5 text-white/45">
              <p>Le volume est calculé à partir de ton budget et de la perte pour 1 lot au Stop Loss, puis arrondi vers le bas pour respecter le pas du broker.</p>
              {valid && <><ResultRow label="Perte estimée pour 1 lot" value={money(calculated.lossPerLot)} /><ResultRow label="Volume avant arrondi" value={formatNumber(calculated.theoretical, 8) + " lots"} /><ResultRow label="RR monétaire estimé" value={"1:" + formatNumber(calculated.effectiveRR)} /><ResultRow label="Capital après un SL" value={money(calculated.capitalAfterLoss)} /><ResultRow label="Capital après le TP" value={money(calculated.capitalAfterWin)} /></>}
              <p>Le ratio de prix peut différer légèrement du ratio monétaire lorsque la conversion de devise dépend du prix de sortie.</p>
            </div>
          </details>
          <p className="px-1 text-xs leading-5 text-white/35">Simulation uniquement, sans envoi d’ordre. Vérifie le contrat et les volumes auprès de ton broker. Résultats estimatifs, hors commissions, spread et slippage.</p>
        </aside>
      </div>
    </div>
  );
}

const inputClass = "h-11 w-full rounded-xl border border-[color:var(--border)] bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[color:var(--gold-border)]";
const activeClass = "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]";
const inactiveClass = "border-white/10 bg-black/10 text-white/50 hover:text-white";
function Step({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 sm:p-5">
    <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--gold-soft)] text-xs text-[color:var(--gold)]">{number}</span><div><h2 className="text-sm font-semibold text-white">{title}</h2><p className="mt-1 text-xs leading-5 text-white/40">{description}</p></div></div>
    <div className="mt-5">{children}</div>
  </section>;
}
function Field({ label, value, onChange, suffix, placeholder }: { label: string; value: string; onChange: (value: string) => void; suffix?: string; placeholder?: string }) {
  return <label className="block"><span className="mb-2 block text-xs leading-5 text-white/60">{label}</span><div className="relative"><input className={inputClass + (suffix ? " pr-16" : "")} inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />{suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/35">{suffix}</span>}</div></label>;
}
function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs leading-5 text-white/60">{label}</span><select className={inputClass} value={value} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}
function ResultRow({ label, value, type }: { label: string; value: string; type?: "win" | "loss" }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-3 text-xs"><span className="text-white/45">{label}</span><strong className={"text-right " + (type === "win" ? "text-emerald-400" : type === "loss" ? "text-red-400" : "text-white")}>{value}</strong></div>;
}
