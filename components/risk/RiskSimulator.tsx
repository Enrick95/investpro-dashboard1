"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Calculator, Check, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { ACCOUNT_CURRENCIES, SUGGESTED_ASSETS, calculatePosition, getInstrument, parseDecimal, resolveConversion } from "@/lib/risk-simulator";
import { VipApiError, vipRequest } from "@/lib/vip/client";
import { createClient } from "@/lib/supabase/client";
import type { VipSignalRiskData } from "@/lib/vip/signal-risk";
import { resolveRiskAsset, signalDirectionError, signalRiskPreset } from "@/lib/vip/signal-risk-preset";

type Rates = { base: string; rates: Record<string, number>; dates: Record<string, string> };
type BrokerSpec = { symbol: string; contract: string; minimum: string; step: string; profit: string; mode: "contract" | "ticks"; tickSize: string; tickValue: string };
const inputClass = "h-12 w-full min-w-0 rounded-xl border border-[color:var(--border)] bg-black/20 px-4 text-base text-white outline-none placeholder:text-white/25 focus:border-[color:var(--gold-border)]";

export default function RiskSimulator({ signalId, invalidSignal = false }: { signalId?: string; invalidSignal?: boolean }) {
  const { t, locale } = useLocale();
  const tr = (fr: string, en: string) => locale === "en" ? en : fr;
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"buy" | "sell" | "">("");
  const [currency, setCurrency] = useState("EUR");
  const [balance, setBalance] = useState("");
  const [riskMode, setRiskMode] = useState<"percent" | "amount">("percent");
  const [riskPercent, setRiskPercent] = useState("1");
  const [riskAmount, setRiskAmount] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [rates, setRates] = useState<Rates | null>(null);
  const [loadingRates, setLoadingRates] = useState(true);
  const [retry, setRetry] = useState(0);
  const [signal, setSignal] = useState<VipSignalRiskData | null>(null);
  const [signalStatus, setSignalStatus] = useState<"loading" | "ready" | "error">(signalId ? "loading" : "ready");
  const [signalError, setSignalError] = useState(0);
  const [signalRetry, setSignalRetry] = useState(0);
  const [authRevision, setAuthRevision] = useState(0);
  const signalRequest = useRef<AbortController | null>(null);
  const [brokerSpec, setBrokerSpec] = useState<BrokerSpec | null>(null);
  const [showBroker, setShowBroker] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/risk-rates", { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("rates"); return response.json() as Promise<Rates>; })
      .then(data => { if (!controller.signal.aborted && data.base === "EUR") setRates(data); })
      .catch(() => { /* Never substitute parity for an unavailable conversion. */ })
      .finally(() => { if (!controller.signal.aborted) setLoadingRates(false); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!signalId) return;
    let previousUser: string | null | undefined;
    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event, session) => {
      const user = session?.user.id ?? null;
      if (previousUser !== undefined && previousUser !== user) {
        signalRequest.current?.abort();
        setSignal(null); setSymbol(""); setDirection(""); setEntryPrice(""); setStopPrice(""); setBrokerSpec(null);
        setBalance(""); setRiskAmount(""); setSignalStatus("loading"); setAuthRevision(value => value + 1);
      }
      previousUser = user;
    });
    return () => subscription.unsubscribe();
  }, [signalId]);

  useEffect(() => {
    if (!signalId) return;
    const controller = new AbortController();
    signalRequest.current = controller;
    vipRequest<VipSignalRiskData>(`/api/vip/posts/${encodeURIComponent(signalId)}/risk`, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        if (data.postId !== signalId) throw new Error("signal mismatch");
        const preset = signalRiskPreset(data);
        setSignal(data); setSymbol(preset.symbol); setDirection(preset.direction);
        setEntryPrice(preset.entry); setStopPrice(preset.stop); setBrokerSpec(null); setSignalStatus("ready");
      })
      .catch(cause => {
        if (!controller.signal.aborted) { setSignalError(cause instanceof VipApiError ? cause.status : 503); setSignalStatus("error"); }
      });
    return () => { controller.abort(); if (signalRequest.current === controller) signalRequest.current = null; };
  }, [signalId, signalRetry, authRevision]);

  const asset = resolveRiskAsset(symbol);
  // A composite label must never inherit the first ticker's contract.
  const instrument = /^[A-Z0-9#._]+$/i.test(asset) ? getInstrument(asset) : { symbol: asset, label: asset, market: "custom" as const, profitCurrency: "", contractSize: undefined, baseCurrency: undefined };
  const defaults: BrokerSpec = { symbol: asset, contract: instrument.contractSize ? String(instrument.contractSize) : "", minimum: instrument.contractSize ? "0.01" : "", step: instrument.contractSize ? "0.01" : "", profit: instrument.profitCurrency, mode: "contract", tickSize: "", tickValue: "" };
  const spec = brokerSpec?.symbol === asset ? brokerSpec : defaults;
  const customContract = Boolean(asset) && !instrument.contractSize;
  const capital = parseDecimal(balance), entry = parseDecimal(entryPrice), stop = parseDecimal(stopPrice);
  const budget = riskMode === "percent" ? capital * parseDecimal(riskPercent) / 100 : parseDecimal(riskAmount);
  const conversion = resolveConversion({ profitCurrency: spec.profit, accountCurrency: currency, baseCurrency: spec.profit === instrument.profitCurrency ? instrument.baseCurrency : undefined, stop, target: NaN, rates: rates?.rates });
  const calculated = calculatePosition({ symbol: asset, balance: capital, budget, entry, stop, mode: spec.mode, contractSize: parseDecimal(spec.contract), lossRate: conversion.lossRate, gainRate: NaN, tickSize: parseDecimal(spec.tickSize), tickValue: parseDecimal(spec.tickValue), minLot: parseDecimal(spec.minimum), lotStep: parseDecimal(spec.step) });
  const wrongSide = signalDirectionError(direction, entry, stop);
  const missingConversion = spec.mode === "contract" && Boolean(spec.profit) && !Number.isFinite(conversion.lossRate);
  const blocked = invalidSignal || Boolean(signalId && signalStatus !== "ready");
  const error = blocked ? tr("Le signal doit être chargé avant de calculer.", "Load the signal before calculating.")
    : !symbol.trim() ? t("Choisis ton actif pour commencer.")
    : !balance.trim() ? tr("Renseigne ton capital pour calculer ton lot.", "Enter your account balance to calculate your lot size.")
    : signalId && !direction ? tr("Confirme le sens du signal : BUY ou SELL.", "Confirm the signal direction: BUY or SELL.")
    : wrongSide ? tr(direction === "buy" ? "Pour un BUY, le Stop Loss doit être sous l’entrée." : "Pour un SELL, le Stop Loss doit être au-dessus de l’entrée.", direction === "buy" ? "For a BUY, the Stop Loss must be below the entry." : "For a SELL, the Stop Loss must be above the entry.")
    : missingConversion && calculated.error === "Renseigne le taux de conversion dans la devise du compte."
      ? tr(loadingRates ? "Calcul de la conversion…" : "Conversion momentanément indisponible. Réessaie dans un instant.", loadingRates ? "Loading the conversion…" : "Conversion is temporarily unavailable. Please try again.")
      : t(calculated.error);
  const valid = !error;
  const number = (value: number, digits = 2) => Number.isFinite(value) ? value.toLocaleString(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: digits }) : "—";
  const money = (value: number) => Number.isFinite(value) ? number(value) + " " + currency : "—";
  const preset = signal ? signalRiskPreset(signal) : null;

  function updateSpec(patch: Partial<BrokerSpec>) { setBrokerSpec({ ...spec, ...patch }); }
  function chooseSymbol(value: string) { setSymbol(value.toUpperCase()); setEntryPrice(""); setStopPrice(""); setBrokerSpec(null); }
  function reset() {
    setSymbol(preset?.symbol || ""); setDirection(preset?.direction || ""); setEntryPrice(preset?.entry || ""); setStopPrice(preset?.stop || "");
    setCurrency("EUR"); setBalance(""); setRiskMode("percent"); setRiskPercent("1"); setRiskAmount(""); setBrokerSpec(null); setShowBroker(false);
  }
  function retrySignal() { setSignalStatus("loading"); setSignal(null); setSymbol(""); setEntryPrice(""); setStopPrice(""); setSignalRetry(value => value + 1); }

  return <div className="investpro-mobile-page min-w-0 space-y-5 pb-8">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-semibold text-white">{t("Simulateur de risque")}</h1><p className="mt-2 text-sm text-[color:var(--muted)]">{tr("Les prix du signal. Ton capital. Ton risque.", "Signal prices. Your balance. Your risk.")}</p></div>
      <button type="button" onClick={reset} disabled={blocked} className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-[color:var(--border)] px-4 text-xs text-white/55 disabled:opacity-40"><RotateCcw size={14} />{t("Réinitialiser")}</button>
    </header>
    {(signalId || invalidSignal) && <section aria-live="polite" className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4 sm:p-5">
      <Link href="/dashboard/vip" className="mb-3 inline-flex min-h-9 items-center gap-2 text-xs text-[color:var(--gold)]"><ArrowLeft size={14} />{tr("Retour au VIP", "Back to VIP")}</Link>
      {signalStatus === "loading" && <p role="status" className="text-sm text-white/75">{tr("Récupération des prix de ce signal…", "Loading this signal’s prices…")}</p>}
      {signalStatus === "ready" && signal && <>
        <div className="flex flex-wrap items-center gap-2"><Check size={16} className="text-emerald-400" /><strong className="text-sm text-white">{tr("Signal prérempli", "Signal prefilled")}</strong><span className="rounded-lg bg-black/20 px-2 py-1 text-xs text-[color:var(--gold)]">{preset?.symbol || tr("Actif à préciser", "Asset required")}{signal.direction && ` · ${signal.direction.toUpperCase()}`}</span></div>
        <p className="mt-2 break-words text-sm text-white/65">{signal.title}</p>
        {signal.entryRange && <p className="mt-2 text-xs leading-5 text-white/65">{tr("Zone d’entrée", "Entry range")} : {number(signal.entryRange.min, 8)} – {number(signal.entryRange.max, 8)}. {preset?.rangeApplied ? tr("L’entrée est préremplie au prix le plus éloigné du SL, par prudence. Ajuste-la à ton prix réel d’exécution.", "The entry is prefilled with the price furthest from the SL as a precaution. Adjust it to your actual execution price.") : tr("Précise ton entrée et vérifie le sens et le SL avant de calculer.", "Enter your entry price and check the direction and SL before calculating.")}</p>}
        {signal.issues.length > 0 && <p className="mt-2 text-xs leading-5 text-[color:var(--gold)]">{tr("Certaines informations du signal sont manquantes ou à vérifier. Complète les champs ci-dessous.", "Some signal details are missing or need checking. Complete the fields below.")}</p>}
      </>}
      {(signalStatus === "error" || invalidSignal) && <div role="alert"><strong className="text-sm text-white">{tr("Signal indisponible", "Signal unavailable")}</strong><p className="mt-2 text-sm leading-6 text-white/65">{invalidSignal ? tr("Ce lien est invalide. Reviens au post et utilise « Calculer mon lot ».", "This link is invalid. Return to the post and use its lot calculator button.") : signalError === 401 ? tr("Connecte-toi avec ton compte VIP pour récupérer les prix de ce signal.", "Sign in with your VIP account to load this signal’s prices.") : signalError === 403 ? tr("Un accès VIP actif est nécessaire pour récupérer ce signal.", "An active VIP membership is required to load this signal.") : signalError === 404 ? tr("Ce signal n’est plus disponible. Reviens au canal VIP.", "This signal is no longer available. Return to the VIP channel.") : tr("Impossible de récupérer ce signal pour le moment. Réessaie dans un instant.", "This signal could not be loaded. Please try again.")}</p>
        <div className="mt-3 flex flex-wrap gap-3">{signalError === 401 && signalId && <Link className="inline-flex min-h-11 items-center text-sm text-[color:var(--gold)]" href={`/login?next=${encodeURIComponent(`/dashboard/simulateur?signal=${signalId}`)}`}>{tr("Me connecter", "Sign in")}</Link>}{!invalidSignal && <button type="button" onClick={retrySignal} className="min-h-11 text-sm text-[color:var(--gold)]">{tr("Réessayer", "Try again")}</button>}<Link className="inline-flex min-h-11 items-center text-sm text-white/65" href="/dashboard/simulateur">{tr("Ouvrir le calculateur manuel", "Open the manual calculator")}</Link></div>
      </div>}
    </section>}
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-12">
      <section className="min-w-0 rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 sm:p-6 lg:col-span-8">
        <fieldset disabled={blocked} className="min-w-0 disabled:opacity-40"><div className="grid gap-4 sm:grid-cols-[1fr_150px]">
          <label className="block min-w-0"><span className="mb-2 block text-xs text-white/60">{t("Actif")}</span><input className={inputClass} list="risk-assets" value={symbol} onChange={event => chooseSymbol(event.target.value)} autoComplete="off" spellCheck={false} placeholder="EURUSD, Gold, BTCUSD…" /><datalist id="risk-assets">{SUGGESTED_ASSETS.map(item => <option key={item.symbol} value={item.symbol}>{t(item.label)}</option>)}</datalist></label>
          <label className="block"><span className="mb-2 block text-xs text-white/60">{tr("Sens", "Direction")}</span><select className={inputClass} value={direction} onChange={event => setDirection(event.target.value as typeof direction)}><option value="">{tr("À préciser", "Select")}</option><option value="buy">BUY</option><option value="sell">SELL</option></select></label>
        </div>{!signalId && <div className="mt-3 flex flex-wrap gap-2">{["EURUSD", "XAUUSD", "BTCUSD", "NAS100", "GER40"].map(value => <button key={value} type="button" onClick={() => chooseSymbol(value)} aria-pressed={asset === value} className={"min-h-10 rounded-lg border px-3 text-xs " + (asset === value ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]" : "border-white/10 text-white/45")}>{value === "XAUUSD" ? "Gold" : value}</button>)}</div>}</fieldset>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label={t("Capital du compte")} value={balance} onChange={setBalance} suffix={currency} placeholder={tr("Ton capital actuel", "Your current balance")} /><label className="block"><span className="mb-2 block text-xs text-white/60">{t("Devise du compte")}</span><select className={inputClass} value={currency} onChange={event => { setCurrency(event.target.value); if (spec.tickValue) updateSpec({ tickValue: "" }); }}>{ACCOUNT_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></label></div>
        <div className="mt-5"><div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="risk-value" className="text-xs text-white/60">{t("Risque maximum")}</label><button type="button" onClick={() => setRiskMode(riskMode === "percent" ? "amount" : "percent")} className="min-h-10 text-xs text-[color:var(--gold)]">{riskMode === "percent" ? t("Saisir un montant") : t("Saisir un pourcentage")}</button></div><div className="relative"><input id="risk-value" className={inputClass + " pr-16"} inputMode="decimal" value={riskMode === "percent" ? riskPercent : riskAmount} onChange={event => riskMode === "percent" ? setRiskPercent(event.target.value) : setRiskAmount(event.target.value)} /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40">{riskMode === "percent" ? "%" : currency}</span></div><div className="mt-3 flex flex-wrap gap-2">{["0.5", "1", "2"].map(value => <button type="button" key={value} onClick={() => { setRiskMode("percent"); setRiskPercent(value); }} aria-pressed={riskMode === "percent" && riskPercent === value} className={"min-h-10 rounded-lg border px-4 text-xs " + (riskMode === "percent" && riskPercent === value ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]" : "border-white/10 text-white/45")}>{number(Number(value))} %</button>)}</div></div>
        <fieldset disabled={blocked} className="mt-6 grid min-w-0 gap-4 border-t border-white/5 pt-6 disabled:opacity-40 sm:grid-cols-2"><Field label={t("Prix d’entrée")} value={entryPrice} onChange={setEntryPrice} /><Field label={t("Stop Loss")} value={stopPrice} onChange={setStopPrice} /></fieldset>
        <div className="mt-6 border-t border-white/5 pt-4"><button type="button" disabled={customContract || blocked} aria-expanded={customContract || showBroker} onClick={() => setShowBroker(value => !value)} className="flex min-h-11 w-full items-center gap-2 text-left text-sm text-[color:var(--gold)]"><SlidersHorizontal size={16} />{tr("Paramètres du broker", "Broker settings")}</button>
          {(customContract || showBroker) && <div className="mt-3 space-y-4"><p className="text-xs leading-5 text-white/55">{tr("Reprends les spécifications de cet actif dans MetaTrader ou chez ton broker. Elles peuvent varier, notamment pour le BTC et les indices.", "Use this asset’s specifications from MetaTrader or your broker. They can vary, especially for BTC and indices.")}</p>
            <label className="block"><span className="mb-2 block text-xs text-white/60">{tr("Méthode de calcul", "Calculation method")}</span><select className={inputClass} value={spec.mode} onChange={event => updateSpec({ mode: event.target.value as BrokerSpec["mode"] })}><option value="contract">{tr("Taille du contrat / valeur d’un point", "Contract size / value per point")}</option><option value="ticks">{tr("Taille et valeur du tick", "Tick size and value")}</option></select></label>
            <div className="grid gap-4 sm:grid-cols-2">{spec.mode === "contract" ? <><Field label={tr("Unités pour 1 lot / valeur d’un point", "Units per lot / value per point")} value={spec.contract} onChange={value => updateSpec({ contract: value })} /><label className="block"><span className="mb-2 block text-xs text-white/60">{tr("Devise de profit du contrat", "Contract profit currency")}</span><select className={inputClass} value={spec.profit} onChange={event => updateSpec({ profit: event.target.value })}><option value="">{tr("Choisir", "Select")}</option>{ACCOUNT_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></label></> : <><Field label={tr("Taille du tick", "Tick size")} value={spec.tickSize} onChange={value => updateSpec({ tickSize: value })} /><Field label={tr("Valeur de perte d’un tick pour 1 lot", "Loss value per tick for 1 lot")} value={spec.tickValue} suffix={currency} onChange={value => updateSpec({ tickValue: value })} /></>}
              <Field label={tr("Volume minimum du broker", "Broker minimum volume")} value={spec.minimum} onChange={value => updateSpec({ minimum: value })} /><Field label={tr("Pas de volume du broker", "Broker volume step")} value={spec.step} onChange={value => updateSpec({ step: value })} />
            </div>
          </div>}
          {Boolean(asset) && !customContract && !showBroker && spec.mode === "contract" && <p className="text-xs leading-5 text-white/40">{tr("Contrat standard prérempli", "Standard contract prefilled")} : {number(parseDecimal(spec.contract), 8)} · {tr("minimum / pas", "minimum / step")} {number(parseDecimal(spec.minimum), 8)} / {number(parseDecimal(spec.step), 8)}. {tr("À vérifier avec ton broker.", "Check against your broker’s specifications.")}</p>}
        </div>
      </section>
      <aside className="min-w-0 rounded-[22px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 sm:p-6 lg:sticky lg:top-5 lg:col-span-4"><div className="flex items-center gap-2 text-[color:var(--gold)]"><Calculator size={18} /><h2 className="text-sm font-semibold text-white">{t("Taille de position")}</h2></div>
        <div aria-live="polite" className="mt-7"><div className="break-words text-5xl font-semibold text-[color:var(--gold)]">{valid ? number(calculated.lots, 8) : "—"}{valid && <span className="ml-2 text-base font-normal text-white/45">{calculated.lots > 1 ? "lots" : "lot"}</span>}</div><p className="mt-3 text-xs leading-5 text-white/55">{valid ? `${asset} · ${calculated.isBuy ? "BUY" : "SELL"}` : error}</p></div>
        <div className="mt-6 space-y-3 border-t border-white/5 pt-5"><div className="flex justify-between gap-3 text-xs"><span className="text-white/45">{t("Budget de risque")}</span><strong className="text-white">{money(budget)}</strong></div><div className="flex justify-between gap-3 text-xs"><span className="text-white/45">{t("Perte estimée au SL")}</span><strong className="text-red-400">{valid ? "−" + money(calculated.actualRisk) : "—"}</strong></div></div>
        {missingConversion && !loadingRates && <button type="button" onClick={() => { setLoadingRates(true); setRetry(value => value + 1); }} className="mt-4 min-h-11 text-xs text-[color:var(--gold)]">{t("Réessayer le calcul")}</button>}
        <p className="mt-5 text-xs leading-5 text-white/40">{tr("Volume arrondi vers le bas au pas du broker. Estimation hors frais, spread et glissement. Vérifie les prix d’exécution et les spécifications de ton compte.", "Volume rounded down to the broker’s step. Estimate excludes fees, spread and slippage. Check execution prices and your account’s specifications.")}</p>
      </aside>
    </div>
  </div>;
}

function Field({ label, value, onChange, suffix, placeholder }: { label: string; value: string; onChange: (value: string) => void; suffix?: string; placeholder?: string }) {
  return <label className="block min-w-0"><span className="mb-2 block text-xs text-white/60">{label}</span><div className="relative"><input className={inputClass + (suffix ? " pr-16" : "")} inputMode="decimal" autoComplete="off" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />{suffix && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/35">{suffix}</span>}</div></label>;
}
