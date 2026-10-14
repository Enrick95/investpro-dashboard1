"use client";

import { useEffect, useState } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { ACCOUNT_CURRENCIES, SIMPLE_ASSETS, calculatePosition, getSimpleInstrument, parseDecimal, resolveConversion } from "@/lib/risk-simulator";

type Rates = { base: string; rates: Record<string, number>; dates: Record<string, string> };
const inputClass = "h-12 w-full rounded-xl border border-[color:var(--border)] bg-black/20 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-[color:var(--gold-border)]";
function number(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString("fr-FR", { maximumFractionDigits: digits }) : "—";
}

export default function SimulateurRisquePage() {
  const [symbol, setSymbol] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [balance, setBalance] = useState("10000");
  const [riskMode, setRiskMode] = useState<"percent" | "amount">("percent");
  const [riskPercent, setRiskPercent] = useState("1");
  const [riskAmount, setRiskAmount] = useState("100");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [rates, setRates] = useState<Rates | null>(null);
  const [loadingRates, setLoadingRates] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/risk-rates", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("rates");
        return response.json() as Promise<Rates>;
      })
      .then(data => { if (!controller.signal.aborted && data.base === "EUR") setRates(data); })
      .catch(() => { /* Do not substitute parity for an unavailable conversion. */ })
      .finally(() => { if (!controller.signal.aborted) setLoadingRates(false); });
    return () => controller.abort();
  }, [retry]);

  const instrument = getSimpleInstrument(symbol);
  const capital = parseDecimal(balance);
  const entry = parseDecimal(entryPrice);
  const stop = parseDecimal(stopPrice);
  const budget = riskMode === "percent" ? capital * parseDecimal(riskPercent) / 100 : parseDecimal(riskAmount);
  const conversion = resolveConversion({
    profitCurrency: instrument?.profitCurrency || "", accountCurrency: currency,
    baseCurrency: instrument?.baseCurrency, stop, target: NaN, rates: rates?.rates,
  });
  const calculated = calculatePosition({
    symbol, balance: capital, budget, entry, stop, mode: "contract",
    contractSize: instrument?.contractSize ?? NaN, lossRate: conversion.lossRate,
    gainRate: NaN, tickSize: NaN, tickValue: NaN, minLot: 0.01, lotStep: 0.01,
  });
  const missingConversion = Boolean(instrument && !Number.isFinite(conversion.lossRate));
  const error = !symbol.trim() ? "Choisis ton actif pour commencer."
    : !instrument ? "Choisis un actif pris en charge dans la liste."
    : calculated.error === "Renseigne le taux de conversion dans la devise du compte." && missingConversion
      ? loadingRates ? "Calcul de la conversion…" : "Conversion momentanément indisponible. Réessaie dans un instant."
      : calculated.error === "Le volume minimum du broker dépasserait ton budget de risque." ? "Ton risque correspond à moins de 0,01 lot." : calculated.error;
  const valid = !error;
  const money = (value: number) => number(value) + " " + currency;

  function chooseSymbol(value: string) {
    setSymbol(value.toUpperCase());
    setEntryPrice(""); setStopPrice("");
  }
  function reset() {
    setSymbol(""); setCurrency("EUR"); setBalance("10000");
    setRiskMode("percent"); setRiskPercent("1"); setRiskAmount("100");
    setEntryPrice(""); setStopPrice("");
  }

  return <div className="investpro-mobile-page space-y-5 pb-8">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-semibold text-white">Simulateur de <span className="text-[color:var(--gold)]">risque</span></h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Ton actif, ton risque, tes prix. Obtiens directement tes lots.</p></div>
      <button type="button" onClick={reset} className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-[color:var(--border)] px-4 text-xs text-white/55"><RotateCcw size={14} />Réinitialiser</button>
    </header>
    <div className="grid items-start gap-5 lg:grid-cols-12">
      <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 sm:p-6 lg:col-span-8">
        <label className="block"><span className="mb-2 block text-xs text-white/60">Actif</span>
          <input className={inputClass} list="risk-assets" value={symbol} onChange={event => chooseSymbol(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Choisir : EURUSD, Gold, NAS100…" />
          <datalist id="risk-assets">{SIMPLE_ASSETS.map(item => <option key={item.symbol} value={item.symbol}>{item.label}</option>)}</datalist>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">{["EURUSD", "GBPJPY", "XAUUSD", "NAS100", "GER40"].map(value => <button key={value} type="button" onClick={() => chooseSymbol(value)} aria-pressed={instrument?.symbol === value} className={"min-h-9 rounded-lg border px-3 text-xs " + (instrument?.symbol === value ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]" : "border-white/10 text-white/45")}>{value === "XAUUSD" ? "Gold" : value}</button>)}</div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Capital du compte" value={balance} onChange={setBalance} suffix={currency} />
          <label className="block"><span className="mb-2 block text-xs text-white/60">Devise du compte</span><select className={inputClass} value={currency} onChange={event => setCurrency(event.target.value)}>{ACCOUNT_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></label>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="risk-value" className="text-xs text-white/60">Risque maximum</label><button type="button" onClick={() => setRiskMode(riskMode === "percent" ? "amount" : "percent")} className="min-h-8 text-xs text-[color:var(--gold)]">{riskMode === "percent" ? "Saisir un montant" : "Saisir un pourcentage"}</button></div>
          <div className="relative"><input id="risk-value" className={inputClass + " pr-16"} inputMode="decimal" value={riskMode === "percent" ? riskPercent : riskAmount} onChange={event => riskMode === "percent" ? setRiskPercent(event.target.value) : setRiskAmount(event.target.value)} /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40">{riskMode === "percent" ? "%" : currency}</span></div>
          <div className="mt-3 flex flex-wrap gap-2">{["0.5", "1", "2"].map(value => <button type="button" key={value} onClick={() => { setRiskMode("percent"); setRiskPercent(value); }} aria-pressed={riskMode === "percent" && riskPercent === value} className={"min-h-9 rounded-lg border px-4 text-xs " + (riskMode === "percent" && riskPercent === value ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]" : "border-white/10 text-white/45")}>{value.replace(".", ",")} %</button>)}</div>
        </div>
        <div className="mt-6 grid gap-4 border-t border-white/5 pt-6 sm:grid-cols-2">
          <Field label="Prix d’entrée" value={entryPrice} onChange={setEntryPrice} placeholder={instrument?.market === "forex" ? "Ex. 1,10000" : "Prix d’entrée"} />
          <Field label="Stop Loss" value={stopPrice} onChange={setStopPrice} placeholder={instrument?.market === "forex" ? "Ex. 1,09500" : "Prix du Stop Loss"} />
        </div>
      </section>
      <aside className="rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 sm:p-6 lg:sticky lg:top-5 lg:col-span-4">
        <div className="flex items-center gap-2 text-[color:var(--gold)]"><Calculator size={18} /><h2 className="text-sm font-semibold text-white">Taille de position</h2></div>
        <div aria-live="polite" className="mt-7"><div className="text-5xl font-semibold text-[color:var(--gold)]">{valid ? number(calculated.lots, 2) : "—"}{valid && <span className="ml-2 text-base font-normal text-white/45">lot{calculated.lots > 1 ? "s" : ""}</span>}</div>
          <p className="mt-3 text-xs leading-5 text-white/45">{valid ? symbol + " · " + (calculated.isBuy ? "Achat" : "Vente") : error}</p>
        </div>
        <div className="mt-6 space-y-3 border-t border-white/5 pt-5">
          <div className="flex justify-between gap-3 text-xs"><span className="text-white/45">Budget de risque</span><strong className="text-white">{money(budget)}</strong></div>
          <div className="flex justify-between gap-3 text-xs"><span className="text-white/45">Perte estimée au SL</span><strong className="text-red-400">{valid ? "−" + money(calculated.actualRisk) : "—"}</strong></div>
        </div>
        {missingConversion && !loadingRates && <button type="button" onClick={() => { setLoadingRates(true); setRetry(value => value + 1); }} className="mt-4 min-h-10 text-xs text-[color:var(--gold)]">Réessayer le calcul</button>}
        {valid && instrument?.indexConvention && <p className="mt-5 text-[11px] leading-5 text-white/40">Estimation indice : 1 {instrument.profitCurrency} par point et par lot.</p>}
        <p className="mt-5 text-[11px] leading-5 text-white/30">Volume indicatif, hors frais. Les contrats peuvent varier selon le broker.</p>
      </aside>
    </div>
  </div>;
}

function Field({ label, value, onChange, suffix, placeholder }: { label: string; value: string; onChange: (value: string) => void; suffix?: string; placeholder?: string }) {
  return <label className="block"><span className="mb-2 block text-xs text-white/60">{label}</span><div className="relative"><input className={inputClass + (suffix ? " pr-16" : "")} inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />{suffix && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/35">{suffix}</span>}</div></label>;
}
