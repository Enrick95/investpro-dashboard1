"use client";

import { Activity, Clock3, TrendingUp, Wallet } from "lucide-react";
import { aggregateCopierPnl, type CopierAccountMetric } from "@/lib/copier/account-metrics";
import { aggregateCopierDayResult, type CopierDaySnapshot } from "@/lib/copier/day-result";

type Props = {
  metrics: readonly CopierAccountMetric[];
  now: number;
  translate: (message: string) => string;
  locale?: "fr" | "en";
  refreshing?: boolean;
  dailySnapshot?: CopierDaySnapshot | null;
  dailyReadFailed?: boolean;
};

export default function CopierPnlSummary({ metrics, now, translate, locale = "fr", refreshing = false, dailySnapshot = null, dailyReadFailed = false }: Props) {
  const total = aggregateCopierPnl(metrics);
  const daily = aggregateCopierDayResult(metrics, dailySnapshot, now);
  const dailyComplete = daily.totalCount > 0 && daily.coveredCount === daily.totalCount;
  const dailyDate = new Date(`${daily.day}T12:00:00Z`);
  const dateLocale = locale === "en" ? "en-US" : "fr-FR";
  const oldest = total.oldestObservedAt ? new Date(total.oldestObservedAt) : null;
  const ageSeconds = oldest && Number.isFinite(now) ? Math.max(0, Math.floor((now - oldest.getTime()) / 1000)) : null;
  const complete = total.totalCount > 0 && total.coveredCount === total.totalCount;
  const money = (value: number, currency: string) => new Intl.NumberFormat(dateLocale, {
    style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero",
  }).format(value);

  return (
    <section aria-label={translate("Résultats des comptes receveurs")} className="min-w-0 rounded-2xl border border-[color:var(--gold-border)] bg-black/20 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"><TrendingUp size={20} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-6 text-white">{translate("Résultat des trades clôturés aujourd’hui")}</h2>
            <p className="mt-0.5 text-[11px] leading-5 text-white/45">{translate("Tous les receveurs")}{now > 0 ? <> · {dailyDate.toLocaleDateString(dateLocale, { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Paris" })} · {translate("Heure de Paris")}</> : null}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-medium ${dailyComplete && daily.snapshotCurrent && !dailyReadFailed ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-200" : "border-amber-500/20 bg-amber-500/[0.05] text-amber-200"}`}>
          {daily.coveredCount}/{daily.totalCount} {translate("comptes inclus")}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
        {daily.currencies.length ? daily.currencies.map((entry) => (
          <div key={entry.currency} className="min-w-0">
            <p className={`break-words text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl ${entry.pnl > 0 ? "text-emerald-400" : entry.pnl < 0 ? "text-red-400" : "text-white"}`}>{money(entry.pnl, entry.currency)}</p>
            <p className="mt-1 text-[10px] text-white/40">{entry.accountCount} {translate("compte(s)")} · {entry.currency}</p>
          </div>
        )) : <div><p className="text-3xl font-semibold text-white/40">—</p><p className="mt-1 text-[11px] text-white/50">{translate("En attente de l’historique synchronisé du jour.")}</p></div>}
        {daily.coveredCount > 0 ? <p className="pb-1 text-[11px] text-white/50">{daily.tradeCount} {translate("trade(s) clôturé(s)")}</p> : null}
      </div>
      {!dailyComplete && daily.missingAliases.length ? <p className="mt-3 break-words text-[10px] leading-5 text-amber-200/80">{translate("Total partiel · données à actualiser pour")} : {daily.missingAliases.join(", ")}</p> : null}
      {dailyReadFailed ? <p role="status" className="mt-2 text-[10px] leading-5 text-amber-200/80">{translate(daily.currencies.length ? "Actualisation du résultat du jour indisponible · dernière lecture conservée." : "Actualisation du résultat du jour indisponible. Réessaie dans quelques instants.")}</p> : !daily.snapshotCurrent && daily.currencies.length ? <p role="status" className="mt-2 text-[10px] leading-5 text-amber-200/80">{translate("Dernière lecture conservée · résultat du jour à actualiser.")}</p> : null}
      {daily.currencies.length > 1 ? <p className="mt-2 text-[10px] leading-5 text-white/40">{translate("Chaque devise est affichée séparément.")}</p> : null}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-t border-white/[0.07] pt-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"><Wallet size={20} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-6 text-white">{translate("P&L en cours · Tous les receveurs")}</h3>
            <p className="mt-0.5 text-[11px] leading-5 text-white/45">{translate("Résultat flottant des positions ouvertes")}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-medium ${complete ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-200" : "border-amber-500/20 bg-amber-500/[0.05] text-amber-200"}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${complete ? "bg-emerald-400" : "bg-amber-300"}`} />
          {total.coveredCount}/{total.totalCount} {translate("comptes actualisés")}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
        {total.currencies.length ? total.currencies.map((entry) => (
          <div key={entry.currency} className="min-w-0">
            <p className={`break-words text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl ${entry.pnl > 0 ? "text-emerald-400" : entry.pnl < 0 ? "text-red-400" : "text-white"}`}>{money(entry.pnl, entry.currency)}</p>
            <p className="mt-1 text-[10px] text-white/40">{entry.accountCount} {translate("compte(s)")} · {entry.currency}</p>
          </div>
        )) : (
          <div><p className="text-3xl font-semibold text-white/40">—</p><p className="mt-1 text-[11px] text-white/50">{translate("En attente des données MetaSync")}</p></div>
        )}
        <div className="flex items-center gap-2 pb-1 text-[11px] text-white/50"><Activity size={14} aria-hidden="true" /><span>{translate("Positions ouvertes")} : <span className="font-semibold text-white/80">{total.openPositions === null ? "—" : total.openPositions}</span></span></div>
      </div>

      {total.openPositions === 0 && total.currencies.length > 0 && total.currencies.every(entry => entry.pnl === 0) ? <p className="mt-3 text-[11px] leading-5 text-white/50">{translate("Aucune position ouverte : le P&L en cours est à zéro. Les trades clôturés restent comptés dans le résultat du jour.")}</p> : null}

      <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-t border-white/[0.07] pt-4 text-[10px] leading-5 text-white/40">
        <div className="flex min-w-0 items-start gap-2"><Clock3 size={12} aria-hidden="true" className="mt-1 shrink-0" /><span>{translate("Lecture automatique toutes les 15 s")}{oldest ? <> · <time dateTime={oldest.toISOString()}>{oldest.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>{ageSeconds !== null ? ` (${ageSeconds} s)` : ""}</> : null}</span></div>
        <span>{refreshing ? translate("Actualisation…") : translate("Selon la dernière synchronisation du connecteur")}</span>
      </div>
      {!complete && total.missingAliases.length ? <p className="mt-2 break-words text-[10px] leading-5 text-amber-200/80">{translate("Total partiel · données à actualiser pour")} : {total.missingAliases.join(", ")}</p> : null}
      {total.currencies.length > 1 ? <p className="mt-2 text-[10px] leading-5 text-white/40">{translate("Chaque devise est affichée séparément.")}</p> : null}
    </section>
  );
}
