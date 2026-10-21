"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, Check, ChevronLeft, ChevronRight, Globe2, Minus, RefreshCw, Target, Trophy } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { tradeDay } from "@/lib/performance";
import { buildVipPerformanceReport, type ReportTrade } from "@/lib/vip/performance-report";
import { containsReportDay, reportPeriodRange, type ReportPeriod } from "@/lib/vip/performance-report-period";
import type { PublicVipPerformanceTrade } from "@/lib/vip/public-performance";
import s from "./PublicVipPerformance.module.css";

const PAGE_SIZE = 20;

function validTrade(value: unknown): value is PublicVipPerformanceTrade {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PublicVipPerformanceTrade>;
  return typeof row.id === "number" && Number.isSafeInteger(row.id)
    && (row.source === "telegram" || row.source === "manual")
    && typeof row.trade_date === "string" && typeof row.symbol === "string"
    && (row.direction === "buy" || row.direction === "sell")
    && (row.status === "win" || row.status === "loss" || row.status === "breakeven")
    && (row.result_r === null || typeof row.result_r === "number" && Number.isFinite(row.result_r))
    && typeof row.pips === "number" && Number.isFinite(row.pips)
    && (row.target === null || typeof row.target === "number" && Number.isInteger(row.target));
}

export default function PublicVipPerformance() {
  const { locale } = useLocale();
  const en = locale === "en";
  const [trades, setTrades] = useState<PublicVipPerformanceTrade[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [page, setPage] = useState(1);
  const gradientId = useId().replaceAll(":", "");

  useEffect(() => {
    let stopped = false;
    let pending: AbortController | null = null;
    async function load() {
      if (pending) return;
      const controller = new AbortController();
      pending = controller;
      const timeout = setTimeout(() => controller.abort(), 20000);
      setRefreshing(true);
      try {
        const response = await fetch("/api/vip/performance", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw Error("Performance unavailable");
        const body: unknown = await response.json();
        if (!body || typeof body !== "object" || !("trades" in body)
          || !Array.isArray(body.trades) || !body.trades.every(validTrade)) throw Error("Invalid performance response");
        if (!stopped) {
          setTrades(body.trades);
          setError(false);
          setCheckedAt(new Date());
        }
      } catch {
        if (!stopped) setError(true);
      } finally {
        clearTimeout(timeout);
        pending = null;
        if (!stopped) setRefreshing(false);
      }
    }
    // Initial load and background refresh share the same cancellable request.
    void load();
    const interval = setInterval(() => { void load(); }, 30000);
    return () => { stopped = true; clearInterval(interval); pending?.abort(); };
  }, [refreshVersion]);

  const range = useMemo(() => reportPeriodRange(period, checkedAt ?? new Date()), [period, checkedAt]);
  const filtered = useMemo(() => (trades ?? []).filter(trade => containsReportDay(trade.trade_date, range)), [trades, range]);
  const report = useMemo(() => buildVipPerformanceReport(filtered.map<ReportTrade>(trade => ({
    id: `${trade.source}:${trade.id}`, date: tradeDay(trade.trade_date), symbol: trade.symbol,
    direction: trade.direction, status: trade.status, resultR: trade.result_r,
    target: trade.target, source: trade.source,
  }))), [filtered]);
  const curve = useMemo(() => {
    if (report.totalR === null) return null;
    const sorted = [...report.closedRows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const values = [0];
    let low = 0, high = 0;
    for (const row of sorted) {
      const value = values[values.length - 1] + row.resultR!;
      values.push(value);
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    const magnitude = Math.max(Math.abs(low), Math.abs(high), 1);
    const span = high / magnitude - low / magnitude || 1;
    const y = (value: number) => 200 - (value / magnitude - low / magnitude) / span * 168;
    return {
      points: values.map((value, index) => `${(index / Math.max(1, values.length - 1) * 860 + 20).toFixed(2)},${y(value).toFixed(2)}`).join(" "),
      zero: y(0), low, high, firstDay: sorted[0].date, lastDay: sorted[sorted.length - 1].date,
    };
  }, [report]);
  const number = (value: number, digits = 2) => new Intl.NumberFormat(en ? "en-US" : "fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
  const rValue = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${number(value)} R`;
  const dateLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(en ? "en-GB" : "fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric" });
  const pages = Math.max(1, Math.ceil(report.closedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const rows = report.closedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const periods: { key: ReportPeriod; label: string }[] = [
    { key: "7d", label: en ? "Last 7 days" : "7 jours" },
    { key: "month", label: en ? "This month" : "Ce mois" },
    { key: "3m", label: en ? "3 months" : "3 mois" },
    { key: "year", label: en ? "This year" : "Cette année" },
    { key: "all", label: en ? "All history" : "Tout l’historique" },
  ];
  const periodText = `${range.start ? `${dateLabel(range.start)} → ` : ""}${dateLabel(range.end)}`;
  const retry = () => setRefreshVersion(value => value + 1);

  return <section className={s.page} aria-labelledby="public-vip-title">
    <header className={s.header}>
      <div><span className={s.eyebrow}><Globe2 size={13} aria-hidden="true" />{en ? "PUBLIC VIP TRACK RECORD" : "LE SUIVI PUBLIC DU VIP"}</span>
        <h1 id="public-vip-title">{en ? "VIP performance" : "Performances VIP"}<span>.</span></h1>
        <p>{en ? "The group’s closed trades, results and history, in one place." : "Les trades clôturés du groupe, leurs résultats et leur historique, au même endroit."}</p>
      </div>
      <button type="button" className={s.refresh} onClick={retry} disabled={refreshing} aria-label={en ? "Refresh VIP performance" : "Actualiser les performances VIP"}>
        <RefreshCw size={16} className={refreshing ? s.spinning : undefined} aria-hidden="true" />{en ? "Refresh" : "Actualiser"}
      </button>
    </header>

    <div className={s.filters}>
      <div className={s.periods} role="group" aria-label={en ? "Performance period" : "Période des performances"}>
        {periods.map(item => <button type="button" key={item.key} aria-pressed={period === item.key} className={period === item.key ? s.selected : ""} onClick={() => { setPeriod(item.key); setPage(1); }}>{item.label}</button>)}
      </div>
      <p>{periodText}<span>{en ? "Paris time" : "Heure de Paris"}</span></p>
    </div>

    {error ? <div role="alert" className={s.error}>
      <p>{trades === null
        ? en ? "Performance could not be loaded. Please try again." : "Les performances n’ont pas pu être chargées. Réessayez."
        : en ? "The refresh failed. The last successfully loaded results are shown below." : "L’actualisation a échoué. Les derniers résultats chargés restent affichés ci-dessous."}</p>
      <button type="button" disabled={refreshing} onClick={retry}>{en ? "Try again" : "Réessayer"}</button>
    </div> : null}

    {trades === null ? <div className={s.empty} role="status">{refreshing ? en ? "Loading VIP performance…" : "Chargement des performances VIP…" : en ? "Statistics are currently unavailable." : "Les statistiques sont momentanément indisponibles."}</div> : <>
      <div className={s.metrics}>
        {[
          { label: en ? "Closed trades" : "Trades clôturés", value: String(report.counts.closed), Icon: BarChart3 },
          { label: "Wins", value: String(report.counts.wins), Icon: ArrowUpRight, tone: s.positive },
          { label: "Losses", value: String(report.counts.losses), Icon: ArrowDownRight, tone: s.negative },
          { label: "BE", value: String(report.counts.breakevens), Icon: Minus },
          { label: en ? "Win rate excluding BE" : "Winrate hors BE", value: report.winrate === null ? "—" : `${number(report.winrate, 1)} %`, Icon: Target },
          { label: en ? "Result" : "Résultat", value: rValue(report.totalR), Icon: Trophy, tone: report.totalR === null || report.totalR === 0 ? undefined : report.totalR > 0 ? s.positive : s.negative, detail: report.totalR === null && report.counts.closed > 0 ? en ? "R data incomplete" : "Données en R incomplètes" : report.rewardRiskRatio === null ? undefined : `${en ? "Average R/R" : "R/R moyen"} : ${number(report.rewardRiskRatio)}` },
        ].map(({ label, value, Icon, tone, detail }) => <div key={label} className={s.metric}><span className={s.metricIcon}><Icon size={18} aria-hidden="true" /></span><div><p>{label}</p><strong className={tone}>{value}</strong>{detail ? <small>{detail}</small> : null}</div></div>)}
      </div>

      <div className={s.chart}>
        <div className={s.sectionHeading}><div><span className={s.eyebrow}>{en ? "THE PERIOD AT A GLANCE" : "LA PÉRIODE EN UN REGARD"}</span><h2>{en ? "Cumulative result" : "Résultat cumulé"}</h2></div><strong className={report.totalR !== null && report.totalR < 0 ? s.negative : s.gold}>{rValue(report.totalR)}</strong></div>
        {curve ? <>
          <div className={s.chartScale}><span>{number(curve.high)} R</span><span>{number(curve.low)} R</span></div>
          <svg className={s.plot} viewBox="0 0 900 220" preserveAspectRatio="none" role="img" aria-label={en ? `Cumulative result: ${rValue(report.totalR)}` : `Résultat cumulé : ${rValue(report.totalR)}`}>
            <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ffc867" stopOpacity=".2" /><stop offset="100%" stopColor="#ffc867" stopOpacity="0" /></linearGradient></defs>
            {[32, 88, 144, 200].map(y => <line key={y} x1="20" x2="880" y1={y} y2={y} stroke="#ffffff0b" />)}
            <line x1="20" x2="880" y1={curve.zero} y2={curve.zero} stroke="#ffffff30" strokeDasharray="5 7" />
            <polygon points={`20,220 ${curve.points} 880,220`} fill={`url(#${gradientId})`} />
            <polyline points={curve.points} stroke="#ffc867" fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          <div className={s.chartDates}><span>{dateLabel(curve.firstDay)}</span><span>{dateLabel(curve.lastDay)}</span></div>
        </> : <div className={s.chartEmpty}>{report.counts.closed === 0 ? en ? "No closed trades for this period." : "Aucun trade clôturé sur cette période." : en ? "The curve will be available once all closed trades have a known R result." : "La courbe sera disponible lorsque le résultat en R de chaque trade clôturé sera connu."}</div>}
      </div>

      <section className={s.history} aria-labelledby="public-vip-history">
        <div className={s.historyHead}><div><span className={s.eyebrow}>{en ? "A TRANSPARENT TRACK RECORD" : "UN HISTORIQUE TRANSPARENT"}</span><h2 id="public-vip-history">{en ? "Closed trades" : "Les trades clôturés"}</h2></div><span className={s.count}>{report.counts.closed} trades</span></div>
        {rows.length > 0 ? <>
          <div className={s.tableScroll}><table><caption className={s.srOnly}>{en ? "Closed VIP trade results" : "Résultats des trades VIP clôturés"}</caption><thead><tr><th scope="col">Date</th><th scope="col">{en ? "Instrument" : "Actif"}</th><th scope="col">Direction</th><th scope="col">{en ? "Outcome" : "Résultat"}</th><th scope="col">R</th><th scope="col">Source</th></tr></thead><tbody>
            {rows.map(row => <tr key={row.id}><td>{dateLabel(row.date)}</td><td className={s.symbol}>{row.symbol}</td><td><span className={row.direction === "buy" ? s.buy : s.sell}>{row.direction === "buy" ? <ArrowUpRight size={13} aria-hidden="true" /> : <ArrowDownRight size={13} aria-hidden="true" />}{row.direction.toUpperCase()}</span></td><td><span className={`${s.outcome} ${row.status === "win" ? s.positive : row.status === "loss" ? s.negative : s.gold}`}>{row.status === "win" ? <Check size={12} aria-hidden="true" /> : null}{row.outcome}</span></td><td className={row.resultR === null || row.resultR === 0 ? undefined : row.resultR > 0 ? s.positive : s.negative}>{rValue(row.resultR)}</td><td className={s.source}>{row.source === "telegram" ? "Telegram" : en ? "Manual" : "Manuel"}</td></tr>)}
          </tbody></table></div>
          <nav className={s.pagination} aria-label={en ? "Trade history pages" : "Pages de l’historique des trades"}><span>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, report.closedRows.length)} / {report.closedRows.length}</span><div><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label={en ? "Previous page" : "Page précédente"}><ChevronLeft size={17} aria-hidden="true" /></button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)} aria-label={en ? "Next page" : "Page suivante"}><ChevronRight size={17} aria-hidden="true" /></button></div></nav>
        </> : <p className={s.noTrades}>{en ? "No closed trades for this period. Choose another period to explore the history." : "Aucun trade clôturé sur cette période. Choisissez une autre période pour consulter l’historique."}</p>}
      </section>

      <footer className={s.footer}><p>{en ? "Telegram R reflects the best announced TP. BE trades are excluded from the win rate. Results do not represent members’ actual P&L. Past performance does not guarantee future results." : "Le résultat Telegram en R suit le meilleur TP annoncé. Les BE sont exclus du winrate. Ces chiffres ne représentent pas le P&L réel des membres. Les performances passées ne préjugent pas des résultats futurs."}</p>{checkedAt ? <p>{en ? "Last updated" : "Dernière actualisation"} : {checkedAt.toLocaleTimeString(en ? "en-GB" : "fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })} · {en ? "Paris time" : "Heure de Paris"}</p> : null}<Link href="/vip/rejoindre">{en ? "Discover InvestPro VIP" : "Découvrir InvestPro VIP"}<ArrowUpRight size={16} aria-hidden="true" /></Link></footer>
    </>}
  </section>;
}
