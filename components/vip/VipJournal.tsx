"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { createClient } from "@/lib/supabase/client";
import { loadJournal } from "@/lib/metasync/loadJournal";
import { vipSignalOrder } from "@/lib/vip/publication-notice";
import { sameInstrument } from "@/lib/vip/signal-risk-preset";
import type { VipPost } from "@/lib/vip/types";
import type { ReportRow } from "@/lib/vip/performance-report";
import s from "./VipEspace.module.css";

/**
 * A trade of the member’s journal. A trade synced from MetaTrader has its result in money but often no initial stop,
 * so no R: it is still a closed trade, counted and shown with its amount.
 */
type Row = { id: string; date: string; symbol: string; direction: "buy" | "sell"; status: string; closed: boolean; resultR: number | null; amount: number | null; accountId: number | null };
type Load = { status: "loading" | "ready" | "error" | "signedOut"; rows: Row[] };
/** The member’s trading accounts, for the currency of each trade’s amount. */
type AccountCurrency = { id: number; currency: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED = new Set(["win", "loss", "breakeven"]);
/** Trades listed before « Voir les autres trades ». */
const LIST_LIMIT = 12;

/** A number from the database; a missing value stays missing (Number(null) would read 0). */
function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parisDay(value: number): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Paris" }).format(new Date(value));
}

function dayNumber(value: string): number {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function readRow(value: Record<string, unknown>): Row | null {
  const date = typeof value.trade_date === "string" ? value.trade_date.slice(0, 10) : "";
  const direction = value.direction === "sell" ? "sell" : value.direction === "buy" ? "buy" : null;
  const status = typeof value.status === "string" ? value.status : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !direction || status === "cancelled") return null;
  const closed = CLOSED.has(status);
  return {
    id: String(value.id ?? `${date}-${value.symbol}`),
    date,
    symbol: String(value.symbol ?? "").trim().toUpperCase(),
    direction,
    status,
    closed,
    resultR: closed ? finite(value.result_r) : null,
    amount: closed ? finite(value.result_amount) : null,
    accountId: finite(value.account_id),
  };
}

/**
 * A member’s trade follows a team signal of the same instrument and side published the same day or the day before or after.
 * The instrument is compared by its equivalents: GOLD in the signal is XAUUSD or XAUUSD.r on the member’s MetaTrader.
 */
function followed(row: Row, signals: VipPost[]): VipPost | undefined {
  return signals.find(post => {
    const side = vipSignalOrder(post)?.side;
    const created = Date.parse(post.created_at);
    return side === row.direction && sameInstrument(post.symbol, row.symbol)
      && Number.isFinite(created) && Math.abs(dayNumber(parisDay(created)) - dayNumber(row.date)) <= 1;
  });
}

/** The member took this VIP trade: a trade of theirs on the same instrument and side, the same day or the day before or after. */
function taken(trade: ReportRow, rows: Row[]): boolean {
  return rows.some(row => row.direction === trade.direction && sameInstrument(trade.symbol, row.symbol)
    && Math.abs(dayNumber(trade.date) - dayNumber(row.date)) <= 1);
}

/** How a VIP trade ended, as the channel names it. */
function outcomeLabel(trade: ReportRow): string {
  if (/^TP\d+$/.test(trade.outcome)) return trade.outcome;
  return trade.outcome === "LOSS" ? "SL" : trade.outcome === "BE" ? "BE" : trade.outcome === "WIN" ? "Gain" : trade.outcome;
}

type Props = {
  banner: ReactNode;
  posts: VipPost[];
  /** The month’s result of the team’s signals, once the public figures have one. */
  signalsMonthR: number | null;
  /** The VIP’s closed trades from the public figures, every month; null while they load or when they are unavailable. */
  channelRows?: ReportRow[] | null;
  /** The member’s accounts, for the currency of each amount, and the reference rates to add up several currencies. */
  accounts?: AccountCurrency[];
  rates?: Record<string, number> | null;
  onOpenCompte: () => void;
};

/** The member’s own journal inside the VIP: the month, a calendar coloured by day, and the trades set against the team’s signals. */
export default function VipJournal({ banner, posts, signalsMonthR, channelRows = null, accounts = [], rates = null, onOpenCompte }: Props) {
  const { t, locale } = useLocale();
  const en = locale === "en";
  const tag = en ? "en-US" : "fr-FR";
  const [load, setLoad] = useState<Load>({ status: "loading", rows: [] });
  const [month, setMonth] = useState(() => parisDay(Date.now()).slice(0, 7));
  const [view, setView] = useState<"mine" | "vip">("mine");
  /** The month whose whole list of trades is open. */
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const db = createClient();
        const { data } = await db.auth.getUser();
        if (!data.user) { if (live) setLoad({ status: "signedOut", rows: [] }); return; }
        const result = await loadJournal(db, data.user.id);
        if (result.error || !result.data) throw result.error ?? Error("Journal unavailable");
        const rows = (result.data as Record<string, unknown>[]).map(readRow).filter((row): row is Row => row !== null);
        if (live) setLoad({ status: "ready", rows });
      } catch {
        if (live) setLoad({ status: "error", rows: [] });
      }
    })();
    return () => { live = false; };
  }, []);

  const ratio = new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const r = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${ratio.format(Math.abs(value))} R`;
  const short = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${ratio.format(Math.abs(value))}`;
  const monthName = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const today = parisDay(Date.now());
  const signals = posts.filter(post => post.category === "signal");
  const monthRows = load.rows.filter(row => row.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const closed = monthRows.filter(row => row.closed);
  const wins = closed.filter(row => row.status === "win").length;
  // In R when every closed trade of the month has one; otherwise in money, as MetaTrader gives it.
  const inR = closed.length > 0 && closed.every(row => row.resultR !== null);
  const currencyOf = new Map(accounts.map(account => [account.id, (account.currency || "").toUpperCase()]));
  const currency = (row: Row) => (row.accountId !== null ? currencyOf.get(row.accountId) : undefined) || null;
  // The month is added up in the currency most of its trades are in; another currency is converted with the reference rates.
  const tally = new Map<string, number>();
  for (const row of closed) { const code = currency(row); if (code && row.amount !== null) tally.set(code, (tally.get(code) ?? 0) + 1); }
  const monthCurrency = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const inMonthCurrency = (row: Row): number | null => {
    const code = currency(row);
    if (row.amount === null || !code || !monthCurrency) return null;
    if (code === monthCurrency) return row.amount;
    const from = rates?.[code], to = rates?.[monthCurrency];
    return from && to && from > 0 && to > 0 ? row.amount * to / from : null;
  };
  const measure = (row: Row) => inR ? row.resultR : inMonthCurrency(row);
  const counted = closed.filter(row => measure(row) !== null);
  const total = counted.reduce((sum, row) => sum + (measure(row) ?? 0), 0);
  const money = (amount: number, code: string, digits = Math.abs(amount) < 10 ? 2 : 0) => {
    try {
      return new Intl.NumberFormat(tag, { style: "currency", currency: code, currencyDisplay: "narrowSymbol", signDisplay: "exceptZero", minimumFractionDigits: digits, maximumFractionDigits: digits })
        .format(amount).replace("-", "−");
    } catch { return `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${Math.abs(amount).toFixed(digits)} ${code}`; }
  };
  // A day of the calendar is narrow: 412, 1,2k.
  const compactMoney = (amount: number) => {
    const size = Math.abs(amount);
    const body = size >= 1000 ? `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(size / 1000)}k` : String(Math.round(size));
    return `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${body}`;
  };
  const listed = expanded === month ? monthRows : monthRows.slice(0, LIST_LIMIT);
  const rowResult = (row: Row): string => {
    if (!row.closed) return t("En cours");
    if (row.resultR !== null) return r(row.resultR);
    const code = currency(row);
    // With its cents, like MetaTrader’s profit column.
    if (row.amount !== null && code) return money(row.amount, code, 2);
    return t(row.status === "win" ? "Gain" : row.status === "loss" ? "Perte" : "BE");
  };
  const rowTone = (row: Row) => {
    const value = row.resultR ?? row.amount;
    return !row.closed ? s.gold : value === null ? (row.status === "loss" ? s.loss : row.status === "win" ? s.gain : undefined) : value < 0 ? s.loss : value > 0 ? s.gain : undefined;
  };
  const monthSignals = signals.filter(post => parisDay(Date.parse(post.created_at)).startsWith(month));
  const takenSignals = monthSignals.filter(post => monthRows.some(row => followed(row, [post]))).length;
  // The VIP side: the trades the channel closed this month, and which of them the member took.
  const vipRows = (channelRows ?? []).filter(trade => trade.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const vipKnown = vipRows.filter(trade => trade.resultR !== null);
  const vipTotal = vipRows.length && vipKnown.length === vipRows.length ? vipKnown.reduce((sum, trade) => sum + (trade.resultR ?? 0), 0) : null;
  const vipWins = vipRows.filter(trade => trade.status === "win").length;
  const vipTaken = vipRows.filter(trade => taken(trade, load.rows)).length;

  // Monday-first calendar of the month, with each week’s total.
  const [year, index] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, index - 1, 1)).getUTCDay() + 6) % 7;
  const byDay = new Map<string, number>();
  if (view === "vip") { for (const trade of vipKnown) byDay.set(trade.date, (byDay.get(trade.date) ?? 0) + (trade.resultR ?? 0)); }
  else for (const row of counted) byDay.set(row.date, (byDay.get(row.date) ?? 0) + (measure(row) ?? 0));
  // The calendar counts in R, or in money when the member’s trades have no R; a « strong » day is over 1 R.
  const calendarInR = view === "vip" || inR;
  const dayText = (value: number) => calendarInR ? short(value) : compactMoney(value);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, day) => `${month}-${String(day + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  const weekdays = locale === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["L", "M", "M", "J", "V", "S", "D"];

  return <div className={s.page}>
    <header className={s.head}>
      <h1 className={s.pageTitle}>{t("Journal")}</h1>
      <div className={s.monthSwitch}>
        <button type="button" className={s.iconButton} onClick={() => setMonth(current => shiftMonth(current, -1))} aria-label={t("Mois précédent")}><ChevronLeft size={18} aria-hidden="true" /></button>
        <span className={s.monthName}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</span>
        <button type="button" className={s.iconButton} onClick={() => setMonth(current => shiftMonth(current, 1))} disabled={month >= today.slice(0, 7)} aria-label={t("Mois suivant")}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
    </header>
    {banner}
    <div className={s.chips} role="group" aria-label={t("Afficher")}>
      <button type="button" className={view === "mine" ? s.chipOn : s.chip} aria-pressed={view === "mine"} onClick={() => setView("mine")}>{t("Mes trades")}</button>
      <button type="button" className={view === "vip" ? s.chipOn : s.chip} aria-pressed={view === "vip"} onClick={() => setView("vip")}>{t("Trades du VIP")}</button>
    </div>
    {load.status === "loading" ? <p className={s.emptyCard} role="status">{t("Chargement de ton journal…")}</p>
      : load.status === "signedOut" ? <p className={s.emptyCard}>{t("Connecte-toi pour retrouver ton journal.")}</p>
        : load.status === "error" ? <p className={s.emptyCard} role="alert">{t("Ton journal est indisponible pour le moment. Réessaie dans un instant.")}</p>
          : <>
            {view === "vip" ? <article className={s.compare}>
              <h2 className={s.compareTitle}>{t("Le VIP ce mois-ci")}</h2>
              <div className={s.stats}>
                <div className={s.stat}><span>{t("Résultat du VIP")}</span><b className={vipTotal === null ? undefined : vipTotal < 0 ? s.loss : s.gold}>{vipTotal === null ? "—" : r(vipTotal)}</b></div>
                <div className={s.stat}><span>{t("Réussite")}</span><b>{vipRows.length ? `${Math.round((vipWins / vipRows.length) * 100)} %` : "—"}</b></div>
                <div className={s.stat}><span>{t("Tu as suivi")}</span><b>{vipRows.length ? `${vipTaken} / ${vipRows.length}` : "—"}</b></div>
              </div>
              <p className={s.small}>{channelRows === null ? t("Les trades du VIP sont indisponibles pour le moment.") : vipRows.length ? `${vipRows.length} ${t(vipRows.length > 1 ? "trades clôturés" : "trade clôturé")} ${t("dans le canal")}` : t("Aucun trade du VIP clôturé ce mois-ci.")}</p>
            </article> : <article className={s.compare}>
              <h2 className={s.compareTitle}>{t("Toi face aux signaux")}</h2>
              <div className={s.stats}>
                <div className={s.stat}><span>{t("Ton résultat")}</span><b className={`${counted.length ? (total < 0 ? s.loss : s.gain) : ""} ${counted.length && !inR ? s.statMoney : ""}`}>{!counted.length ? "—" : inR ? r(total) : monthCurrency ? money(total, monthCurrency, 0) : "—"}</b></div>
                <div className={s.stat}><span>{t("Les signaux")}</span><b className={s.gold}>{signalsMonthR === null ? "—" : r(signalsMonthR)}</b></div>
                <div className={s.stat}><span>{t("Suivis")}</span><b>{monthSignals.length ? `${takenSignals} / ${monthSignals.length}` : "—"}</b></div>
              </div>
              <p className={s.small}>
                {closed.length ? `${closed.length} ${t(closed.length > 1 ? "trades clôturés" : "trade clôturé")} · ${t("réussite")} ${Math.round((wins / closed.length) * 100)}${en ? "%" : " %"}` : t("Aucun trade clôturé ce mois-ci.")}
                {inR && signalsMonthR !== null ? ` · ${t("écart")} ${r(total - signalsMonthR)}` : ""}
              </p>
              {closed.length && !inR ? <p className={s.small}>{t("Sans stop de départ dans MetaTrader, tes trades sont comptés en argent, pas en R.")}</p> : null}
            </article>}
            <div className={s.calendar} role="table" aria-label={t("Calendrier du mois")}>
              <div className={s.calHead} role="row">{weekdays.map((day, position) => <span key={position} role="columnheader">{day}</span>)}<span role="columnheader">{t("Sem.")}</span></div>
              {weeks.map((week, row) => {
                const sum = week.reduce((acc, date) => acc + (date ? byDay.get(date) ?? 0 : 0), 0);
                const traded = week.some(date => date && byDay.has(date));
                return <div key={row} className={s.calRow} role="row">
                  {week.map((date, position) => {
                    if (!date) return <span key={position} className={s.dayEmpty} role="cell" />;
                    const value = byDay.get(date);
                    const tone = value === undefined ? "" : calendarInR && value > 1 ? s.dayStrong : value > 0 ? s.dayGain : value < 0 ? s.dayLoss : s.dayFlat;
                    return <span key={position} role="cell" className={`${s.day} ${tone} ${date === today ? s.dayToday : ""}`}>
                      {Number(date.slice(8))}{value !== undefined ? <b>{dayText(value)}</b> : null}
                    </span>;
                  })}
                  <span role="cell" className={`${s.week} ${traded ? (sum < 0 ? s.loss : s.gain) : ""}`}>{traded ? dayText(sum) : "—"}</span>
                </div>;
              })}
            </div>
            {view === "vip" ? <section className={s.section} aria-labelledby="vip-journal-channel">
              <h2 id="vip-journal-channel" className={s.sectionTitle}>{t("Trades du VIP ce mois-ci")}</h2>
              {vipRows.length ? <ul className={s.rows}>
                {vipRows.slice(0, 20).map(trade => <li key={trade.id} className={s.row}>
                  <span><b>{trade.symbol}</b> <span className={s.muted}>{t(trade.direction === "sell" ? "Vente" : "Achat")} · {t(outcomeLabel(trade))} · {t(taken(trade, load.rows) ? "suivi" : "pas suivi")}</span></span>
                  <b className={`${s.num} ${trade.resultR === null ? s.gold : trade.resultR < 0 ? s.loss : s.gain}`}>{trade.resultR === null ? "—" : r(trade.resultR)}</b>
                </li>)}
              </ul> : <p className={s.emptyCard}>{channelRows === null ? t("Les trades du VIP sont indisponibles pour le moment.") : t("Aucun trade du VIP clôturé ce mois-ci.")}</p>}
            </section> : <section className={s.section} aria-labelledby="vip-journal-trades">
              <h2 id="vip-journal-trades" className={s.sectionTitle}>{t("Trades du mois")}{monthRows.length ? ` · ${monthRows.length}` : ""}</h2>
              {monthRows.length ? <>
                <ul className={s.rows}>
                  {listed.map(row => <li key={row.id} className={s.row}>
                    <span><b>{row.symbol}</b> <span className={s.muted}>{t(row.direction === "sell" ? "Vente" : "Achat")} · {t(followed(row, signals) ? "signal suivi" : "perso")}</span><span className={s.rowSub}>{new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${row.date}T12:00:00Z`))}</span></span>
                    <b className={`${s.num} ${rowTone(row) ?? ""}`}>{rowResult(row)}</b>
                  </li>)}
                </ul>
                {listed.length < monthRows.length ? <button type="button" className={s.textButton} onClick={() => setExpanded(month)}>
                  {en ? `See the ${monthRows.length - listed.length} other trades` : `Voir les ${monthRows.length - listed.length} autres trades`}
                </button> : null}
              </> : <div className={s.emptyCard}>
                <p>{t("Aucun trade dans ton journal ce mois-ci.")}</p>
                <button type="button" className={s.textButton} onClick={onOpenCompte}>{t("Connecter un compte MetaTrader pour le remplir automatiquement")}</button>
              </div>}
            </section>}
          </>}
  </div>;
}
