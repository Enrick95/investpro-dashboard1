"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { createClient } from "@/lib/supabase/client";
import { loadJournal } from "@/lib/metasync/loadJournal";
import { vipSignalOrder } from "@/lib/vip/publication-notice";
import type { VipPost } from "@/lib/vip/types";
import s from "./VipEspace.module.css";

type Row = { id: string; date: string; symbol: string; direction: "buy" | "sell"; resultR: number | null; status: string };
type Load = { status: "loading" | "ready" | "error" | "signedOut"; rows: Row[] };

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED = new Set(["win", "loss", "breakeven"]);

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
  const r = Number(value.result_r);
  return {
    id: String(value.id ?? `${date}-${value.symbol}`),
    date,
    symbol: String(value.symbol ?? "").trim().toUpperCase(),
    direction,
    resultR: CLOSED.has(status) && Number.isFinite(r) ? r : null,
    status,
  };
}

/** A member’s trade follows a team signal of the same instrument and side published the same day or the day before or after. */
function followed(row: Row, signals: VipPost[]): VipPost | undefined {
  return signals.find(post => {
    const side = vipSignalOrder(post)?.side;
    const created = Date.parse(post.created_at);
    return side === row.direction && (post.symbol || "").trim().toUpperCase() === row.symbol
      && Number.isFinite(created) && Math.abs(dayNumber(parisDay(created)) - dayNumber(row.date)) <= 1;
  });
}

type Props = {
  banner: ReactNode;
  posts: VipPost[];
  /** The month’s result of the team’s signals, once the public figures have one. */
  signalsMonthR: number | null;
  onOpenCompte: () => void;
};

/** The member’s own journal inside the VIP: the month, a calendar coloured by day, and the trades set against the team’s signals. */
export default function VipJournal({ banner, posts, signalsMonthR, onOpenCompte }: Props) {
  const { t, locale } = useLocale();
  const tag = locale === "en" ? "en-US" : "fr-FR";
  const [load, setLoad] = useState<Load>({ status: "loading", rows: [] });
  const [month, setMonth] = useState(() => parisDay(Date.now()).slice(0, 7));

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
  const closed = monthRows.filter(row => row.resultR !== null);
  const total = closed.reduce((sum, row) => sum + (row.resultR ?? 0), 0);
  const wins = closed.filter(row => row.status === "win").length;
  const monthSignals = signals.filter(post => parisDay(Date.parse(post.created_at)).startsWith(month));
  const takenSignals = monthSignals.filter(post => monthRows.some(row => followed(row, [post]))).length;

  // Monday-first calendar of the month, with each week’s total.
  const [year, index] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, index - 1, 1)).getUTCDay() + 6) % 7;
  const byDay = new Map<string, number>();
  for (const row of closed) byDay.set(row.date, (byDay.get(row.date) ?? 0) + (row.resultR ?? 0));
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
    {load.status === "loading" ? <p className={s.emptyCard} role="status">{t("Chargement de ton journal…")}</p>
      : load.status === "signedOut" ? <p className={s.emptyCard}>{t("Connecte-toi pour retrouver ton journal.")}</p>
        : load.status === "error" ? <p className={s.emptyCard} role="alert">{t("Ton journal est indisponible pour le moment. Réessaie dans un instant.")}</p>
          : <>
            <article className={s.compare}>
              <h2 className={s.compareTitle}>{t("Toi face aux signaux")}</h2>
              <div className={s.stats}>
                <div className={s.stat}><span>{t("Ton résultat")}</span><b className={closed.length ? (total < 0 ? s.loss : s.gain) : undefined}>{closed.length ? r(total) : "—"}</b></div>
                <div className={s.stat}><span>{t("Les signaux")}</span><b className={s.gold}>{signalsMonthR === null ? "—" : r(signalsMonthR)}</b></div>
                <div className={s.stat}><span>{t("Suivis")}</span><b>{monthSignals.length ? `${takenSignals} / ${monthSignals.length}` : "—"}</b></div>
              </div>
              <p className={s.small}>
                {closed.length ? `${closed.length} ${t(closed.length > 1 ? "trades clôturés" : "trade clôturé")} · ${t("réussite")} ${Math.round((wins / closed.length) * 100)} %` : t("Aucun trade clôturé ce mois-ci.")}
                {closed.length && signalsMonthR !== null ? ` · ${t("écart")} ${r(total - signalsMonthR)}` : ""}
              </p>
            </article>
            <div className={s.calendar} role="table" aria-label={t("Calendrier du mois")}>
              <div className={s.calHead} role="row">{weekdays.map((day, position) => <span key={position} role="columnheader">{day}</span>)}<span role="columnheader">{t("Sem.")}</span></div>
              {weeks.map((week, row) => {
                const sum = week.reduce((acc, date) => acc + (date ? byDay.get(date) ?? 0 : 0), 0);
                const traded = week.some(date => date && byDay.has(date));
                return <div key={row} className={s.calRow} role="row">
                  {week.map((date, position) => {
                    if (!date) return <span key={position} className={s.dayEmpty} role="cell" />;
                    const value = byDay.get(date);
                    const tone = value === undefined ? "" : value > 1 ? s.dayStrong : value > 0 ? s.dayGain : value < 0 ? s.dayLoss : s.dayFlat;
                    return <span key={position} role="cell" className={`${s.day} ${tone} ${date === today ? s.dayToday : ""}`}>
                      {Number(date.slice(8))}{value !== undefined ? <b>{short(value)}</b> : null}
                    </span>;
                  })}
                  <span role="cell" className={`${s.week} ${traded ? (sum < 0 ? s.loss : s.gain) : ""}`}>{traded ? short(sum) : "—"}</span>
                </div>;
              })}
            </div>
            <section className={s.section} aria-labelledby="vip-journal-trades">
              <h2 id="vip-journal-trades" className={s.sectionTitle}>{t("Trades du mois")}</h2>
              {monthRows.length ? <ul className={s.rows}>
                {monthRows.slice(0, 12).map(row => <li key={row.id} className={s.row}>
                  <span><b>{row.symbol}</b> <span className={s.muted}>{t(row.direction === "sell" ? "Vente" : "Achat")} · {t(followed(row, signals) ? "signal suivi" : "perso")}</span></span>
                  <b className={`${s.num} ${row.resultR === null ? s.gold : row.resultR < 0 ? s.loss : s.gain}`}>{row.resultR === null ? t("En cours") : r(row.resultR)}</b>
                </li>)}
              </ul> : <div className={s.emptyCard}>
                <p>{t("Aucun trade dans ton journal ce mois-ci.")}</p>
                <button type="button" className={s.textButton} onClick={onOpenCompte}>{t("Connecter un compte MetaTrader pour le remplir automatiquement")}</button>
              </div>}
            </section>
          </>}
  </div>;
}
