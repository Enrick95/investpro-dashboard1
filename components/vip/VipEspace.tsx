"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Bell, BellRing, Bookmark, CalendarDays, ChevronLeft, ChevronRight, Copy, MessageSquare, TrendingUp, UserRound } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { vipRequest } from "@/lib/vip/client";
import { buildVipPerformanceReport, type ReportRow, type ReportTrade, type VipPerformanceReport } from "@/lib/vip/performance-report";
import { signalFreeText, signalTakeProfit3, vipSignalOrder } from "@/lib/vip/publication-notice";
import { riskSignalHref, sameInstrument } from "@/lib/vip/signal-risk-preset";
import type { VipMembership, VipPost, VipPostCategory, VipPostReactions, VipReaction } from "@/lib/vip/types";
import type { PublicVipPerformanceTrade } from "@/lib/vip/public-performance";
import VipJournal from "./VipJournal";
import VipCompte from "./VipCompte";
import { sizeSignal, useVipMember, type SignalSize, type VipMember } from "./vipMember";
import { espaceFont } from "./espaceFont";
import s from "./VipEspace.module.css";

/** Every place a member can open in the space. `all` is the default feed. */
export type VipChannel = "all" | "signal" | "analysis" | "followup" | "performance" | "partnership" | "telegram" | "chat" | "favorites" | "risk" | "training";
/** The four sections of the VIP application, in the order of the bottom bar. */
export type EspaceSection = "signaux" | "canal" | "journal" | "compte";
type Lang = "fr" | "en";
type Translate = (message: string) => string;
type Perf = { status: "loading" | "ready" | "error"; trades: PublicVipPerformanceTrade[] };
type Side = "buy" | "sell" | null | undefined;
/** The state of a signal or of a closed trade, as the public figures show it. */
type Tone = "open" | "win" | "loss" | "be";

export type VipEspaceProps = {
  view: VipChannel;
  onSelect: (channel: VipChannel) => void;
  posts: VipPost[];
  membership: VipMembership | null;
  alertsOn: boolean;
  alertsAvailable: boolean;
  onEnableAlerts: () => void;
  busy: boolean;
  onRenew: () => void;
  /** Changes when the member asks for a refresh; the public performance figures are reloaded then. */
  refreshKey: number;
  loading: boolean;
  onRefresh: () => void;
  /** Keeps the portal's own copy of the posts in step when a favourite changes. */
  onFavoriteChange?: (postId: string, favorite: boolean) => void;
  /** Installation help and support, shown in the Compte section. */
  accountTools?: ReactNode;
  /** Chat, favourites and Telegram, rendered by the portal under its own access rules. */
  channelContent: ReactNode;
  /** The language switch of the portal, shown in the Compte section. */
  languageControl?: ReactNode;
  /** The section the application opens on; Signaux, or Canal when a channel is already open. */
  initialSection?: EspaceSection;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RENEWAL_NOTICE_MS = 30 * DAY_MS;
/** A signal stays open for two weeks unless a trade of the same instrument and side closes it in the public figures. */
const OPEN_WINDOW_MS = 14 * DAY_MS;
/** The only page outside the application: the full lot calculator. */
const CALCULATOR_HREF = "/dashboard/simulateur";
/** An update that asks to move the stop to the entry. */
const BREAKEVEN = /\bBE\b|break[\s-]?even|point d[’']entr[ée]e/i;
/** The update that cancels a signal’s order, as the Telegram import titles it in the signal’s own thread. */
const CANCELLATION = /·\s*Ordre annulé$/;
/** Channels whose publications the space draws itself; the portal only supplies the other channels. */
export const feedChannels: VipChannel[] = ["all", "signal", "analysis", "followup", "performance", "partnership"];

const sections: { key: EspaceSection; label: string }[] = [
  { key: "signaux", label: "Signaux" },
  { key: "canal", label: "Canal" },
  { key: "journal", label: "Journal" },
  { key: "compte", label: "Compte" },
];
const sectionIcons: Record<EspaceSection, typeof TrendingUp> = { signaux: TrendingUp, canal: MessageSquare, journal: CalendarDays, compte: UserRound };
const emptyTitles: Partial<Record<VipChannel, string>> = {
  all: "Les publications de l’équipe apparaîtront ici.",
  analysis: "Les prochaines analyses apparaîtront ici.",
  signal: "Les prochains signaux apparaîtront ici.",
  performance: "Les prochains bilans apparaîtront ici.",
  followup: "Les prochaines mises à jour apparaîtront ici.",
  partnership: "Les prochains partenariats apparaîtront ici.",
};
const categoryNames: Record<VipPostCategory, string> = { signal: "Signal", analysis: "Analyse", performance: "Bilan", followup: "Suivi", partnership: "Partenariat" };
const categoryTone: Record<VipPostCategory, string> = { signal: "kSignal", analysis: "kAnalysis", performance: "kPerformance", followup: "kFollowup", partnership: "kPartnership" };
const reactionLabels: Record<VipReaction, string> = { like: "J’aime", fire: "Flamme", heart: "Cœur" };
const reactionEmoji: Record<VipReaction, string> = { like: "👍", fire: "🔥", heart: "❤️" };
const noReactions: VipPostReactions = { counts: { like: 0, fire: 0, heart: 0 }, mine: null };
const toneClass: Record<Tone, string> = { open: "gold", win: "gain", loss: "loss", be: "muted" };

/** Within the span before now. A post or a signal dated in the future counts as just published. */
function isWithin(post: VipPost, now: number, span: number): boolean {
  const created = Date.parse(post.created_at);
  return Number.isFinite(created) && now - created < span;
}

function isRecent(post: VipPost, now: number): boolean {
  return isWithin(post, now, DAY_MS);
}

function newestFirst(posts: VipPost[]): VipPost[] {
  return [...posts].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

function feedPosts(channel: VipChannel, posts: VipPost[]): VipPost[] {
  return newestFirst(posts).filter(post => channel === "all" || post.category === channel);
}

/** Calendar month in Paris, as YYYY-MM, matching the day strings of the public performance API. */
function parisMonth(value: number): string {
  if (!Number.isFinite(value)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).formatToParts(new Date(value));
  const year = parts.find(part => part.type === "year")?.value ?? "";
  const month = parts.find(part => part.type === "month")?.value ?? "";
  return year && month ? `${year}-${month}` : "";
}

/** Calendar day in Paris, as YYYY-MM-DD. */
function parisDay(value: number): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

/** Day number of a YYYY-MM-DD string, so that two days can be compared. NaN when the string is not a date. */
function dayNumber(value: string): number {
  const parts = value.split("-").map(Number);
  if (parts.length < 3 || parts.some(part => !Number.isFinite(part))) return Number.NaN;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]) / DAY_MS;
}

function isPublicTrade(value: unknown): value is PublicVipPerformanceTrade {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PublicVipPerformanceTrade>;
  return typeof row.id === "number" && typeof row.trade_date === "string" && typeof row.symbol === "string"
    && (row.source === "telegram" || row.source === "manual")
    && (row.direction === "buy" || row.direction === "sell")
    && (row.status === "win" || row.status === "loss" || row.status === "breakeven")
    && (row.result_r === null || typeof row.result_r === "number")
    && (row.target === null || typeof row.target === "number");
}

function readPublicTrades(body: unknown): PublicVipPerformanceTrade[] {
  if (!body || typeof body !== "object" || !("trades" in body) || !Array.isArray(body.trades)) throw Error("Invalid performance response");
  return body.trades.filter(isPublicTrade);
}

/** The closing row of a signal: a trade of the same instrument and side dated within a day of it. */
function closureOf(post: VipPost, closed: ReportRow[]): ReportRow | undefined {
  const side = vipSignalOrder(post)?.side;
  const symbol = (post.symbol || "").trim().toUpperCase();
  const created = Date.parse(post.created_at);
  if (!side || !symbol || !Number.isFinite(created)) return undefined;
  const day = dayNumber(parisDay(created));
  let match: ReportRow | undefined;
  let gap = Number.POSITIVE_INFINITY;
  for (const row of closed) {
    if (row.direction !== side || !sameInstrument(row.symbol, symbol)) continue;
    const distance = Math.abs(dayNumber(row.date) - day);
    if (distance <= 1 && distance < gap) { match = row; gap = distance; }
  }
  return match;
}

/** The team cancelled the signal’s order: a reply on Telegram, linked to this very signal. */
function isCancelled(post: VipPost, posts: VipPost[]): boolean {
  return posts.some(other => other.category === "followup" && other.thread_post_id === post.id && CANCELLATION.test(other.title));
}

/** A public trade in the shape of the report helper, as the Bilan page reads it. */
function toReportTrade(trade: PublicVipPerformanceTrade): ReportTrade {
  return {
    id: `${trade.source}:${trade.id}`,
    date: trade.trade_date,
    symbol: trade.symbol,
    direction: trade.direction,
    status: trade.status,
    resultR: trade.result_r,
    target: trade.target,
    source: trade.source,
  };
}

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Every month from the first closed trade to the current one, each with the Bilan page’s own figures. */
function monthlyHistory(trades: PublicVipPerformanceTrade[], now: number): { months: { key: string; report: VipPerformanceReport }[]; all: VipPerformanceReport } {
  const reportTrades = trades.map(toReportTrade);
  const current = parisMonth(now);
  let first = current;
  for (const trade of reportTrades) {
    const key = trade.date.slice(0, 7);
    if (MONTH_KEY.test(key) && key < first) first = key;
  }
  const keys: string[] = [];
  let [year, month] = first.split("-").map(Number);
  // Ten years at most: a malformed date can never make the list endless.
  while (keys.length < 120) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    keys.push(key);
    if (key >= current) break;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return {
    months: keys.map(key => ({ key, report: buildVipPerformanceReport(reportTrades.filter(trade => trade.date.startsWith(`${key}-`))) })),
    all: buildVipPerformanceReport(reportTrades),
  };
}

/** Same figures as the Bilan page: the report helper decides what counts as a win, a loss and a known R. */
function computeStats(posts: VipPost[], trades: PublicVipPerformanceTrade[], now: number) {
  const month = parisMonth(now);
  const signals = newestFirst(posts).filter(post => post.category === "signal");
  const reportTrades: ReportTrade[] = trades.map(toReportTrade);
  const all = buildVipPerformanceReport(reportTrades);
  const current = buildVipPerformanceReport(reportTrades.filter(trade => trade.date.startsWith(month)));
  const closed = [...all.closedRows].sort((a, b) => b.date.localeCompare(a.date));
  return {
    recentSignals: signals.filter(post => isRecent(post, now)),
    openSignals: signals.filter(post => isWithin(post, now, OPEN_WINDOW_MS) && !closureOf(post, closed) && !isCancelled(post, posts)),
    signalsThisMonth: signals.filter(post => parisMonth(Date.parse(post.created_at)) === month).length,
    monthTotalR: current.totalR,
    monthWinrate: current.winrate,
    monthClosed: current.counts.closed,
    closed,
  };
}
type Stats = ReturnType<typeof computeStats>;

/** Renewal is only offered close to the end of access, or once it has been requested. */
function membershipNote(membership: VipMembership | null, now: number) {
  const expires = membership?.expires_at ? Date.parse(membership.expires_at) : Number.NaN;
  if (!Number.isFinite(expires)) return null;
  const requested = Boolean(membership?.renewal_requested_at);
  if (!requested && expires - now >= RENEWAL_NOTICE_MS) return null;
  const subscription = membership?.type === "abonnement";
  return { expires, requested, subscription, canRequest: subscription && !requested };
}

/** Price levels in reading order. TP3 is read from the signal template; the other levels are stored fields. */
function levelPairs(post: VipPost): [string, number][] {
  const levels = post.levels ?? {};
  const pairs: [string, number | null | undefined][] = [
    ["Entrée", levels.entry], ["Stop", levels.stopLoss], ["TP1", levels.takeProfit], ["TP2", levels.takeProfit2], ["TP3", signalTakeProfit3(post.body || "")],
  ];
  return pairs.filter((pair): pair is [string, number] => typeof pair[1] === "number" && Number.isFinite(pair[1]));
}

function levelOf(post: VipPost, label: string): number | undefined {
  return levelPairs(post).find(([name]) => name === label)?.[1];
}

function outcomeLabel(row: ReportRow, t: Translate): string {
  if (row.outcome.startsWith("TP")) return row.outcome;
  if (row.outcome === "WIN") return t("Gain");
  if (row.outcome === "LOSS") return t("Stop");
  return "BE";
}

function outcomeTone(row: ReportRow): Tone {
  if (row.outcome.startsWith("TP") || row.outcome === "WIN") return "win";
  return row.outcome === "LOSS" ? "loss" : "be";
}

/** A signal shows its closing outcome when the public figures have one, and is in progress for two weeks otherwise. */
function signalState(post: VipPost, closure: ReportRow | undefined, now: number, t: Translate, cancelled = false): { label: string; tone: Tone } | null {
  if (closure) return { label: outcomeLabel(closure, t), tone: outcomeTone(closure) };
  if (cancelled) return { label: t("Annulé"), tone: "be" };
  return isWithin(post, now, OPEN_WINDOW_MS) ? { label: t("En cours"), tone: "open" } : null;
}

function safeImage(value?: string | null): string | null {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatters(lang: Lang) {
  const tag = lang === "en" ? "en-US" : "fr-FR";
  const ratio = new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  // Prices keep the dot of the signals whatever the interface language; whole prices have no decimals.
  const decimals = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
  const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const clock = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" });
  const weekday = new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "Europe/Paris" });
  const today = new Intl.DateTimeFormat(tag, { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
  const long = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  const valid = (value: string) => Number.isFinite(Date.parse(value));
  const monthLong = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" });
  const monthShort = new Intl.DateTimeFormat(tag, { month: "short", timeZone: "UTC" });
  const dayMonth = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: "UTC" });
  const compact = new Intl.NumberFormat(tag, { maximumFractionDigits: 1 });
  // "2026-10" or "2026-10-31", read at noon UTC so that no time zone moves the day.
  const fromKey = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(Date.UTC(year, (month || 1) - 1, day || 15, 12));
    return Number.isFinite(date.getTime()) ? date : null;
  };
  return {
    tag,
    clock: (value: string) => valid(value) ? clock.format(new Date(value)) : "—",
    dateTime: (value: string) => valid(value) ? `${weekday.format(new Date(value))} ${clock.format(new Date(value))}` : "—",
    today: (value: number) => { const text = today.format(new Date(value)); return text.charAt(0).toUpperCase() + text.slice(1); },
    long: (value: number) => long.format(new Date(value)),
    price: (value: number) => (Number.isInteger(value) ? whole.format(value) : decimals.format(value)).replace(/,/g, " "),
    r: (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${ratio.format(Math.abs(value))} R`,
    pct: (value: number | null) => value === null ? "—" : `${Math.round(value)}${lang === "en" ? "%" : " %"}`,
    rShort: (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${compact.format(Math.abs(value))}`,
    /** « Octobre 2026 » as a title; inside a sentence the language’s own case (« depuis août 2026 »). */
    month: (key: string, inline = false) => {
      const date = fromKey(key);
      const text = date ? monthLong.format(date) : key;
      return inline ? text : text.charAt(0).toUpperCase() + text.slice(1);
    },
    monthShort: (key: string) => { const date = fromKey(key); return date ? monthShort.format(date).replace(/\.$/, "") : key; },
    day: (value: string) => { const date = fromKey(value); return date ? dayMonth.format(date) : value; },
    money: (value: number, currency: string) => {
      try { return new Intl.NumberFormat(tag, { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
      catch { return `${Math.round(value)} ${currency}`; }
    },
  };
}
type Formatters = ReturnType<typeof formatters>;

/** A card: today’s publications show their time, older ones their day and time. */
function when(post: VipPost, now: number, fmt: Formatters): string {
  return isRecent(post, now) ? fmt.clock(post.created_at) : fmt.dateTime(post.created_at);
}

/** How long ago a signal was published, for the head of a trade. */
function since(post: VipPost, now: number, fmt: Formatters, t: Translate): string {
  const created = Date.parse(post.created_at);
  const minutes = Math.max(0, Math.round((now - created) / 60000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return t("publié à l’instant");
  if (minutes < 60) return `${t("publié il y a")} ${minutes} min`;
  if (minutes < 24 * 60) return `${t("publié il y a")} ${Math.floor(minutes / 60)} h`;
  return `${t("publié")} ${fmt.dateTime(post.created_at)}`;
}

function sideLabel(side: Side, t: Translate): string {
  return side === "sell" ? t("Vente") : side === "buy" ? t("Achat") : "";
}

/** The order the member places, as the signal says it: « Achat limite », « Vente stop », or just the side. */
function orderLabel(post: VipPost, t: Translate): string {
  const order = vipSignalOrder(post);
  const side = sideLabel(order?.side, t);
  if (!order || !side) return side;
  const type = /STOP LIMIT$/.test(order.label) ? t("stop limite") : /LIMIT$/.test(order.label) ? t("limite") : /STOP$/.test(order.label) ? t("stop") : "";
  return type ? `${side} ${type}` : side;
}

/** The levels of a signal in the order MetaTrader asks for them, ready to paste. */
function levelsText(post: VipPost): string {
  const order = vipSignalOrder(post);
  const parts = [post.symbol || post.title || "", order?.side === "sell" ? "SELL" : order?.side === "buy" ? "BUY" : ""];
  for (const [label, value] of levelPairs(post)) parts.push(label === "Entrée" ? String(value) : `${label === "Stop" ? "SL" : label} ${value}`);
  return parts.filter(Boolean).join(" ");
}

/** Where the London and New York sessions stand, in Paris time. */
function zoned(now: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function marketLine(now: number, t: Translate) {
  const paris = zoned(now, "Europe/Paris");
  const read = (zone: string, open: number, close: number) => {
    const local = zoned(now, zone);
    // How far Paris is ahead of this exchange, between −12 h and +12 h.
    const shift = ((paris.minutes - local.minutes) % 1440 + 1440 + 720) % 1440 - 720;
    const weekday = local.day >= 1 && local.day <= 5;
    return { weekday, open: weekday && local.minutes >= open && local.minutes < close, before: weekday && local.minutes < open, from: open + shift, to: close + shift };
  };
  const london = read("Europe/London", 8 * 60, 16 * 60 + 30);
  const newYork = read("America/New_York", 9 * 60 + 30, 16 * 60);
  const clock = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  let text: string;
  if (!london.weekday && !newYork.weekday) text = t("Week-end · marchés fermés");
  else if (london.open && newYork.open) text = t("Londres et New York ouvertes");
  else if (newYork.open) text = t("New York ouverte");
  else if (london.open) text = `${t("Londres ouverte")} · ${t("New York à")} ${clock(newYork.from)}`;
  else if (london.before) text = `${t("Londres ouvre à")} ${clock(london.from)}`;
  else text = t("Séances de Londres et New York terminées");
  return { text, london: [london.from, london.to], newYork: [newYork.from, newYork.to], now: paris.minutes };
}

type Rung = { label: string; price: number; r: number | null; kind: "target" | "entry" | "stop"; y: number };

/** The levels of a trade placed at their real price, highest at the top, with what each is worth in R. */
function ladder(post: VipPost, area: number, top: number): { rungs: Rung[]; height: number; profit?: [number, number]; risk?: [number, number] } | null {
  const levels = levelPairs(post);
  const entry = levelOf(post, "Entrée");
  const stop = levelOf(post, "Stop");
  if (entry === undefined || levels.length < 2) return null;
  const side = vipSignalOrder(post)?.side;
  const risk = stop === undefined ? 0 : Math.abs(entry - stop);
  const direction = side === "sell" ? -1 : 1;
  const prices = levels.map(([, price]) => price);
  const highest = Math.max(...prices), lowest = Math.min(...prices);
  const span = highest - lowest || 1;
  const placed = levels.map(([label, price]): Rung => ({
    label, price,
    r: label === "Entrée" || !risk ? null : ((price - entry) / risk) * direction,
    kind: label === "Entrée" ? "entry" : label === "Stop" ? "stop" : "target",
    y: top + ((highest - price) / span) * area,
  })).sort((a, b) => a.y - b.y);
  // Two levels close in price still get their own line and their own price tag.
  for (let index = 1; index < placed.length; index += 1) placed[index].y = Math.max(placed[index].y, placed[index - 1].y + 28);
  const yOf = (kind: Rung["kind"]) => placed.filter(rung => rung.kind === kind).map(rung => rung.y);
  const entryY = yOf("entry")[0];
  const targets = yOf("target");
  const stops = yOf("stop");
  const farTarget = targets.length ? (side === "sell" ? Math.max(...targets) : Math.min(...targets)) : undefined;
  return {
    rungs: placed,
    height: placed[placed.length - 1].y + 16,
    profit: farTarget === undefined ? undefined : [Math.min(entryY, farTarget), Math.max(entryY, farTarget)],
    risk: stops.length ? [Math.min(entryY, stops[0]), Math.max(entryY, stops[0])] : undefined,
  };
}

/**
 * Updates of a signal: the team’s note in the signal itself, then its follow-ups. A reply posted on Telegram belongs to its own
 * signal only; other follow-ups are matched by instrument over the two weeks after the signal.
 */
function threadUpdates(post: VipPost, posts: VipPost[]): { id: string; at: number; title: string; text: string }[] {
  const symbol = (post.symbol || "").trim().toUpperCase();
  const created = Date.parse(post.created_at);
  const items: { id: string; at: number; title: string; text: string }[] = [];
  const note = signalFreeText(post.body || "");
  if (note) items.push({ id: `${post.id}:note`, at: created, title: "Note de l’équipe", text: note });
  // Inside the thread the instrument is already the heading: « XAUUSD · TP1 touché » reads « TP1 touché ».
  const prefix = symbol ? `${symbol} · ` : "";
  const add = (other: VipPost, at: number) => {
    const title = prefix && other.title.toUpperCase().startsWith(prefix) ? other.title.slice(prefix.length) : other.title;
    items.push({ id: other.id, at, title: title || "Mise à jour", text: other.body });
  };
  for (const other of posts) {
    if (other.category !== "followup") continue;
    const at = Date.parse(other.created_at);
    if (!Number.isFinite(at)) continue;
    if (other.thread_post_id) {
      if (other.thread_post_id === post.id) add(other, at);
      continue;
    }
    if (!symbol || !Number.isFinite(created) || at < created || at - created > OPEN_WINDOW_MS) continue;
    if (sameInstrument(other.symbol, symbol) || `${other.title} ${other.body}`.toUpperCase().includes(symbol)) add(other, at);
  }
  return items.sort((a, b) => a.at - b.at);
}

type Actions = {
  reactions: (post: VipPost) => VipPostReactions;
  favorite: (post: VipPost) => boolean;
  pending: (post: VipPost) => boolean;
  react: (post: VipPost, reaction: VipReaction) => Promise<void>;
  toggleFavorite: (post: VipPost) => Promise<void>;
};

type Ctx = {
  t: Translate;
  fmt: Formatters;
  now: number;
  view: VipChannel;
  onSelect: (channel: VipChannel) => void;
  go: (section: EspaceSection, channel?: VipChannel, postId?: string) => void;
  openThread: (postId: string | null) => void;
  openHistory: (open: boolean) => void;
  copyLevels: (post: VipPost) => void;
  posts: VipPost[];
  stats: Stats;
  perf: Perf;
  member: VipMember;
  note: ReturnType<typeof membershipNote>;
  busy: boolean;
  onRenew: () => void;
  alertsOn: boolean;
  alertsAvailable: boolean;
  onEnableAlerts: () => void;
  channelContent: ReactNode;
  banner: ReactNode;
  actions: Actions;
};

/** The VIP application: Signaux, Canal, Journal and Compte, everything inside the space. Only the full lot calculator opens elsewhere. */
export default function VipEspace(props: VipEspaceProps) {
  const { view, onSelect, posts, membership, alertsOn, alertsAvailable, onEnableAlerts, busy, onRenew, refreshKey, onFavoriteChange, accountTools, channelContent, languageControl, initialSection } = props;
  const { t, locale } = useLocale();
  const lang: Lang = locale === "en" ? "en" : "fr";
  const member = useVipMember();
  // A member who was in a channel (the chat, say) when the space reloads finds Canal again; everyone else starts on Signaux.
  const [section, setSection] = useState<EspaceSection>(initialSection ?? (view === "all" ? "signaux" : "canal"));
  const [thread, setThread] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [focusPost, setFocusPost] = useState<string | null>(null);
  const [perf, setPerf] = useState<Perf>({ status: "loading", trades: [] });
  const [reactionOverrides, setReactionOverrides] = useState<Record<string, { source: VipPostReactions | undefined; value: VipPostReactions }>>({});
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, { source: VipPost; value: boolean }>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const [flash, setFlash] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  // Public figures only: no member token is sent, and nothing private is read here.
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/vip/performance", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw Error("Performance unavailable");
        const trades = readPublicTrades(await response.json());
        if (!controller.signal.aborted) setPerf({ status: "ready", trades });
      } catch {
        if (!controller.signal.aborted) setPerf(previous => ({ status: "error", trades: previous.trades }));
      }
    }
    void load();
    return () => controller.abort();
  }, [refreshKey]);

  // A new section, channel or trade starts at the top, unless a publication was asked for.
  useEffect(() => {
    if (focusPost && typeof document !== "undefined") {
      document.getElementById?.(`publication-${focusPost}`)?.scrollIntoView({ block: "start" });
      return;
    }
    panel.current?.scrollTo?.({ top: 0 });
  }, [view, section, thread, history, focusPost]);

  // A confirmation fades after a few seconds.
  useEffect(() => {
    if (!flash || typeof setTimeout !== "function") return;
    const timer = setTimeout(() => setFlash(""), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  function go(next: EspaceSection, channel?: VipChannel, postId?: string) {
    setSection(next);
    setThread(null);
    setHistory(false);
    setFocusPost(postId ?? null);
    if (channel) onSelect(channel);
  }
  function openThread(postId: string | null) {
    setSection("signaux");
    setFocusPost(null);
    setHistory(false);
    setThread(postId);
  }
  function openHistory(open: boolean) {
    setSection("signaux");
    setFocusPost(null);
    setThread(null);
    setHistory(open);
  }
  async function copyLevels(post: VipPost) {
    const text = levelsText(post);
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) throw Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setFlash(`${t("Niveaux copiés")} · ${text}`);
    } catch {
      setFlash(`${t("Copie ces niveaux :")} ${text}`);
    }
  }

  // A reaction or favourite the member just saved stays visible until the portal reloads the posts.
  function reactionsOf(post: VipPost): VipPostReactions {
    const override = reactionOverrides[post.id];
    return override && override.source === post.reactions ? override.value : post.reactions ?? noReactions;
  }
  function favoriteOf(post: VipPost): boolean {
    const override = favoriteOverrides[post.id];
    return override && override.source === post ? override.value : post.favorite === true;
  }
  function markPending(postId: string, busyNow: boolean) {
    setPending(current => {
      const next = { ...current };
      if (busyNow) next[postId] = true;
      else delete next[postId];
      return next;
    });
  }
  async function react(post: VipPost, reaction: VipReaction) {
    if (pending[post.id]) return;
    const current = reactionsOf(post);
    markPending(post.id, true); setNotice("");
    try {
      const result = await vipRequest<{ postId: string; reactions: VipPostReactions }>(`/api/vip/posts/${encodeURIComponent(post.id)}/reaction`, {
        method: "PUT", body: JSON.stringify({ reaction: current.mine === reaction ? null : reaction }),
      });
      setReactionOverrides(previous => ({ ...previous, [post.id]: { source: post.reactions, value: result.reactions } }));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Impossible d’enregistrer votre réaction.");
    } finally { markPending(post.id, false); }
  }
  async function toggleFavorite(post: VipPost) {
    if (pending[post.id]) return;
    const next = !favoriteOf(post);
    markPending(post.id, true); setNotice("");
    try {
      const result = await vipRequest<{ postId: string; favorite: boolean }>(`/api/vip/posts/${encodeURIComponent(post.id)}/favorite`, {
        method: "PUT", body: JSON.stringify({ favorite: next }),
      });
      if (result.postId !== post.id || typeof result.favorite !== "boolean") throw new Error("Impossible d’enregistrer votre favori.");
      setFavoriteOverrides(previous => ({ ...previous, [post.id]: { source: post, value: result.favorite } }));
      onFavoriteChange?.(post.id, result.favorite);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Impossible d’enregistrer votre favori.");
    } finally { markPending(post.id, false); }
  }

  const now = Date.now();
  const fmt = formatters(lang);
  const stats = computeStats(posts, perf.trades, now);
  const openCount = stats.openSignals.length;
  const banner = openCount > 0 ? <LiveBanner t={t} count={openCount} post={stats.openSignals[0]} onOpen={() => go("signaux")} /> : null;
  const actions: Actions = {
    reactions: reactionsOf, favorite: favoriteOf, pending: post => Boolean(pending[post.id]), react, toggleFavorite,
  };
  const ctx: Ctx = {
    t, fmt, now, view, onSelect, go, openThread, openHistory, copyLevels: post => void copyLevels(post), posts, stats, perf, member,
    note: membershipNote(membership, now), busy, onRenew, alertsOn, alertsAvailable, onEnableAlerts, channelContent, banner, actions,
  };
  const threadPost = thread ? posts.find(post => post.id === thread && post.category === "signal") : undefined;

  return <div className={`${s.espace} ${espaceFont}`}>
    <div className={s.column}>
      <div className={s.panel} ref={panel}>
        {section === "signaux" ? (threadPost ? <Thread ctx={ctx} post={threadPost} /> : history ? <History ctx={ctx} /> : <Signaux ctx={ctx} />)
          : section === "canal" ? <Canal ctx={ctx} />
            : section === "journal" ? <VipJournal banner={banner} posts={posts} signalsMonthR={perf.status === "ready" && stats.monthClosed > 0 ? stats.monthTotalR : null} onOpenCompte={() => go("compte")} />
              : <VipCompte banner={banner} membership={membership} member={member} alertsOn={alertsOn} alertsAvailable={alertsAvailable} onEnableAlerts={onEnableAlerts} busy={busy} onRenew={onRenew} languageControl={languageControl} accountTools={accountTools} onTelegram={() => go("canal", "telegram")} />}
      </div>
      {notice ? <div className={s.toast} role="alert"><span>{t(notice)}</span><button type="button" onClick={() => setNotice("")}>{t("Fermer")}</button></div>
        : flash ? <div className={s.toast} role="status"><span>{flash}</span><button type="button" onClick={() => setFlash("")}>{t("Fermer")}</button></div> : null}
      <nav className={s.nav} aria-label={t("Navigation de l’espace VIP")}>
        {sections.map(item => {
          const Icon = sectionIcons[item.key];
          return <button key={item.key} type="button" className={section === item.key ? s.navOn : undefined} aria-current={section === item.key ? "page" : undefined} onClick={() => go(item.key, item.key === "canal" && !feedChannels.includes(view) && view !== "chat" ? "all" : undefined)}>
            <span className={s.navIcon}><Icon size={22} aria-hidden="true" />{item.key === "signaux" && openCount > 0 ? <span className={s.navBadge} aria-label={`${openCount} ${t(openCount > 1 ? "trades en cours" : "trade en cours")}`}>{openCount}</span> : null}</span>
            {t(item.label)}
          </button>;
        })}
      </nav>
    </div>
  </div>;
}

/** Shown on every section but Signaux while a trade is in progress, so nobody misses it. */
function LiveBanner({ t, count, post, onOpen }: { t: Translate; count: number; post?: VipPost; onOpen: () => void }) {
  const detail = count === 1 && post ? [post.symbol, orderLabel(post, t)].filter(Boolean).join(" · ") : "";
  return <button type="button" className={s.live} onClick={onOpen}>
    <span className={s.dot} aria-hidden="true" />
    <b>{count === 1 ? t("1 trade en cours") : `${count} ${t("trades en cours")}`}</b>
    {detail ? <span className={s.liveDetail}>{detail}</span> : null}
    <span className={s.liveGo} aria-hidden="true">›</span>
  </button>;
}

function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return <header className={s.head}><h1 className={s.pageTitle}>{title}</h1>{children}</header>;
}

function Sessions({ ctx }: { ctx: Ctx }) {
  const market = marketLine(ctx.now, ctx.t);
  const at = (minutes: number) => `${Math.min(100, Math.max(0, (minutes / 1440) * 100))}%`;
  const width = ([from, to]: number[]) => `${Math.max(0, ((to - from) / 1440) * 100)}%`;
  return <span className={s.session}>
    <span className={s.sesBar} aria-hidden="true">
      <i className={s.sesLondon} style={{ left: at(market.london[0]), width: width(market.london) }} />
      <i className={s.sesNewYork} style={{ left: at(market.newYork[0]), width: width(market.newYork) }} />
      <b style={{ left: at(market.now) }} />
    </span>
    {market.text}
  </span>;
}

/* Signaux: the trade first. Drawn like on the chart, the member’s lot ready, the levels to copy. */
function Signaux({ ctx }: { ctx: Ctx }) {
  const { t, fmt, stats, perf, alertsOn, alertsAvailable, onEnableAlerts, go, posts, openHistory } = ctx;
  const open = stats.openSignals.slice(0, 4);
  const count = stats.openSignals.length;
  const unavailable = perf.status === "error" && perf.trades.length === 0;
  const status = count === 0 ? t("Aucun trade en cours") : count === 1 ? t("Trade en cours") : `${count} ${t("trades en cours")}`;
  const latestAnalysis = newestFirst(posts).find(post => post.category === "analysis");
  return <div className={s.page}>
    <div className={s.topline}>
      <Sessions ctx={ctx} />
      {alertsOn ? <span className={s.iconButton} title={t("Alertes activées sur ce téléphone")} aria-label={t("Alertes activées sur ce téléphone")}><BellRing size={19} aria-hidden="true" /></span>
        : alertsAvailable ? <button type="button" className={s.iconButton} onClick={onEnableAlerts} aria-label={t("Activer les alertes")} title={t("Activer les alertes")}><Bell size={19} aria-hidden="true" /></button> : null}
    </div>
    <h1 className={s.bigTitle}>{status}</h1>
    {open.length ? open.map(post => <TradeBlock key={post.id} ctx={ctx} post={post} />)
      : <article className={s.waiting}>
        <p className={s.waitingText}>{t("Tu seras prévenu dès que l’équipe publie un signal.")}</p>
        {alertsOn ? <p className={s.small}>{t("Alertes activées sur ce téléphone.")}</p>
          : alertsAvailable ? <button type="button" className={s.textButton} onClick={onEnableAlerts}>{t("Activer les alertes sur ce téléphone")}</button> : null}
        <div className={s.buttons}>
          <Link className={s.primary} href={CALCULATOR_HREF}>{t("Calculer mon lot")} <ArrowUpRight size={15} aria-hidden="true" /></Link>
          {latestAnalysis ? <button type="button" className={s.secondary} onClick={() => go("canal", "analysis", latestAnalysis.id)}>{t("Dernière analyse")}</button> : null}
        </div>
      </article>}
    <div className={s.mini}>
      <span className={s.stat}>{t("Ce mois")}<b className={monthTone(ctx)}>{monthFigure(ctx, (figures, format) => format.r(figures.monthTotalR))}</b></span>
      <span className={s.stat}>{t("Réussite")}<b className={s.gold}>{monthFigure(ctx, (figures, format) => format.pct(figures.monthWinrate))}</b></span>
      <span className={s.stat}>{t("Signaux")}<b>{stats.signalsThisMonth}</b></span>
    </div>
    <button type="button" className={s.textButton} onClick={() => openHistory(true)}>{t("Historique mois par mois")} ›</button>
    <Renewal ctx={ctx} />
    <section className={s.section} aria-labelledby="vip-closed">
      <h2 id="vip-closed" className={s.sectionTitle}>{t("Derniers clôturés")}</h2>
      {unavailable ? <p className={s.small}>{t("Performances indisponibles pour le moment.")}</p>
        : stats.closed.length ? <ul className={s.rows}>
          {stats.closed.slice(0, 4).map(row => <li key={row.id} className={s.row}>
            <span><b>{row.symbol}</b> <span className={s.muted}>{sideLabel(row.direction, t)} · {outcomeLabel(row, t)}</span></span>
            <b className={`${s.num} ${s[toneClass[outcomeTone(row)]]}`}>{row.resultR === null ? outcomeLabel(row, t) : fmt.r(row.resultR)}</b>
          </li>)}
        </ul> : <p className={s.small}>{t("Les trades clôturés apparaîtront ici.")}</p>}
    </section>
  </div>;
}

/** The month’s result takes the loss colour when it is negative, and no colour while there is no figure. */
function monthTone(ctx: Ctx): string | undefined {
  const total = ctx.stats.monthTotalR;
  if (ctx.perf.status === "loading" || ctx.stats.monthClosed === 0 || total === null) return undefined;
  return total < 0 ? s.loss : s.gain;
}

/** The month’s figures appear once the public figures are read and a trade has closed this month; a dash otherwise. */
function monthFigure(ctx: Ctx, read: (stats: Stats, fmt: Formatters) => string): string {
  if (ctx.perf.status === "loading") return "…";
  return ctx.stats.monthClosed === 0 ? "—" : read(ctx.stats, ctx.fmt);
}

function Renewal({ ctx }: { ctx: Ctx }) {
  const { t, fmt, note, busy, onRenew } = ctx;
  if (!note) return null;
  return <section className={s.renewal} aria-label={t("Renouvellement")}>
    <p>{t(note.subscription ? "Ton abonnement se termine le" : "Ton accès se termine le")} <b>{fmt.long(note.expires)}</b>.</p>
    {note.canRequest ? <button type="button" className={s.primary} onClick={onRenew} disabled={busy}>{t("Renouveler")}</button> : null}
    {note.requested ? <p className={s.small}>{t("Renouvellement demandé · en attente de vérification par l’équipe.")}</p> : null}
  </section>;
}

/** Height of the bars’ area, in pixels. */
const HISTORY_PLOT = 112;

/* Performances: every month since the first signal, so a member who just joined sees what happened before. */
function History({ ctx }: { ctx: Ctx }) {
  const { t, fmt, now, perf, openHistory } = ctx;
  const [picked, setPicked] = useState<string | null>(null);
  const { months, all } = monthlyHistory(perf.trades, now);
  // Until the member picks a month, the latest month with a closed trade is shown.
  const latest = [...months].reverse().find(month => month.report.counts.closed > 0) ?? months[months.length - 1];
  const index = Math.max(0, months.findIndex(month => month.key === (picked ?? latest.key)));
  const selected = months[index];
  const report = selected.report;
  const end = months.length <= 12 ? months.length - 1 : Math.min(months.length - 1, Math.max(index + 3, 11));
  const shown = months.slice(Math.max(0, end - 11), end + 1);
  const value = (month: (typeof months)[number]) => month.report.counts.closed ? month.report.totalR ?? month.report.knownRSubtotal ?? 0 : 0;
  const top = Math.max(0, ...shown.map(value));
  const bottom = Math.max(0, ...shown.map(month => -value(month)));
  const span = top + bottom || 1;
  const zero = top + bottom === 0 ? HISTORY_PLOT : (top / span) * HISTORY_PLOT;
  const firstTraded = months.find(month => month.report.counts.closed > 0);
  const rows = [...report.closedRows].sort((a, b) => b.date.localeCompare(a.date));
  const waiting = perf.status === "loading" && perf.trades.length === 0;
  const unavailable = perf.status === "error" && perf.trades.length === 0;
  const resultTone = report.counts.closed && report.totalR !== null ? (report.totalR < 0 ? s.loss : s.gain) : undefined;
  return <div className={s.page}>
    <div className={s.topline}>
      <button type="button" className={s.back} onClick={() => openHistory(false)}><ChevronLeft size={18} aria-hidden="true" />{t("Signaux")}</button>
    </div>
    <div className={s.section}>
      <h1 className={s.pageTitle}>{t("Performances")}</h1>
      {firstTraded ? <p className={s.small}>{`${t("Depuis")} ${fmt.month(firstTraded.key, true)} · ${all.totalR === null ? "" : `${fmt.r(all.totalR)} · `}${all.counts.closed} ${t(all.counts.closed > 1 ? "trades clôturés" : "trade clôturé")}`}</p> : null}
    </div>
    {waiting ? <p className={s.small} role="status">{t("Chargement des performances…")}</p>
      : unavailable ? <p className={s.small} role="alert">{t("Performances indisponibles pour le moment.")}</p>
        : <>
          <div className={s.historyBars} role="group" aria-label={t("Résultat par mois")}>
            {shown.map(month => {
              const on = month.key === selected.key;
              const closed = month.report.counts.closed;
              const result = value(month);
              const height = closed ? Math.max(3, (Math.abs(result) / span) * HISTORY_PLOT) : 0;
              const figure = closed ? (month.report.totalR === null ? `${closed} trades` : fmt.r(month.report.totalR)) : t("aucun trade clôturé");
              return <button key={month.key} type="button" className={on ? s.historyMonthOn : s.historyMonth} aria-pressed={on} aria-label={`${fmt.month(month.key)} · ${figure}`} onClick={() => setPicked(month.key)}>
                <span className={s.historyPlot} style={{ height: HISTORY_PLOT }} aria-hidden="true">
                  <i className={s.historyZero} style={{ top: zero }} />
                  {height ? <i className={result < 0 ? s.historyBarLoss : s.historyBar} style={{ top: result < 0 ? zero : zero - height, height }} /> : null}
                </span>
                <span className={s.historyLabel} aria-hidden="true">{fmt.monthShort(month.key)}</span>
                {shown.length <= 6 ? <span className={`${s.historyValue} ${s.num}`} aria-hidden="true">{closed && month.report.totalR !== null ? fmt.rShort(month.report.totalR) : "—"}</span> : null}
              </button>;
            })}
          </div>
          <div className={s.historySwitch}>
            <button type="button" className={s.iconButton} onClick={() => setPicked(months[index - 1].key)} disabled={index === 0} aria-label={t("Mois précédent")}><ChevronLeft size={18} aria-hidden="true" /></button>
            <h2 className={s.historyTitle} aria-live="polite">{fmt.month(selected.key)}</h2>
            <button type="button" className={s.iconButton} onClick={() => setPicked(months[index + 1].key)} disabled={index === months.length - 1} aria-label={t("Mois suivant")}><ChevronRight size={18} aria-hidden="true" /></button>
          </div>
          <div className={s.stats}>
            <div className={s.stat}><span>{t("Résultat")}</span><b className={resultTone}>{report.counts.closed ? fmt.r(report.totalR) : "—"}</b></div>
            <div className={s.stat}><span>{t("Réussite")}</span><b className={report.winrate === null ? undefined : s.gold}>{fmt.pct(report.winrate)}</b></div>
            <div className={s.stat}><span>{t("Trades")}</span><b>{report.counts.closed}</b></div>
          </div>
          {report.counts.closed ? <p className={s.small}>{`${report.counts.wins} ${t(report.counts.wins > 1 ? "gagnants" : "gagnant")} · ${report.counts.losses} ${t(report.counts.losses > 1 ? "stops" : "stop")} · ${report.counts.breakevens} BE`}</p> : null}
          <section className={s.section} aria-labelledby="vip-month-trades">
            <h2 id="vip-month-trades" className={s.sectionTitle}>{t("Trades clôturés")}</h2>
            {rows.length ? <ul className={s.rows}>
              {rows.map(row => <li key={row.id} className={s.row}>
                <span><b>{row.symbol}</b> <span className={s.muted}>{sideLabel(row.direction, t)} · {outcomeLabel(row, t)}</span><span className={s.rowSub}>{fmt.day(row.date)}</span></span>
                <b className={`${s.num} ${s[toneClass[outcomeTone(row)]]}`}>{row.resultR === null ? outcomeLabel(row, t) : fmt.r(row.resultR)}</b>
              </li>)}
            </ul> : <p className={s.small}>{t("Aucun trade clôturé ce mois-ci.")}</p>}
          </section>
          <p className={s.small}>{t("Le résultat en R suit le meilleur TP annoncé. Les BE sont exclus de la réussite. Ces chiffres ne représentent pas le P&L réel des membres.")}</p>
        </>}
  </div>;
}

/** The levels drawn across the screen like lines on a chart: R on the left, the price tag on the right. */
function Chart({ ctx, post, area, top, labels }: { ctx: Ctx; post: VipPost; area: number; top: number; labels?: Partial<Record<string, string>> }) {
  const { t, fmt } = ctx;
  const drawn = ladder(post, area, top);
  if (!drawn) return <p className={s.small}>{levelPairs(post).map(([label, value]) => `${t(label)} ${fmt.price(value)}`).join(" · ")}</p>;
  return <div className={s.chart} style={{ height: drawn.height }} role="img" aria-label={drawn.rungs.map(rung => `${t(rung.label)} ${fmt.price(rung.price)}`).join(", ")}>
    {drawn.profit ? <span className={s.zoneProfit} style={{ top: drawn.profit[0], height: drawn.profit[1] - drawn.profit[0] }} /> : null}
    {drawn.risk ? <span className={s.zoneRisk} style={{ top: drawn.risk[0], height: drawn.risk[1] - drawn.risk[0] }} /> : null}
    {drawn.rungs.map(rung => <div key={rung.label} className={`${s.level} ${s[`level_${rung.kind}`]}`} style={{ top: rung.y }}>
      <span className={s.levelName}>{labels?.[rung.label] ?? t(rung.label)}{rung.r === null ? null : <b> {fmt.r(Math.round(rung.r * 10) / 10)}</b>}</span>
      <span className={s.levelTag}>{fmt.price(rung.price)}</span>
    </div>)}
  </div>;
}

/** Rounded down to four significant digits: 0.29485267 BTC reads 0.2948, never more than the risk allows. */
function readableUnits(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return value;
  const power = 10 ** (4 - Math.ceil(Math.log10(value)));
  return Math.floor(value * power + 1e-9) / power;
}

function volumeText(size: Extract<SignalSize, { ok: true }>, fmt: Formatters): string {
  // Lots and amounts per point keep their two decimals; a quantity of crypto shows four significant digits, not eight decimals.
  const fine = size.step < 0.01;
  const volume = new Intl.NumberFormat(fmt.tag, { minimumFractionDigits: fine ? 0 : 2, maximumFractionDigits: fine ? 8 : 2 }).format(fine ? readableUnits(size.volume) : size.volume);
  if (size.kind === "standard_lot") return `${volume} ${size.volume >= 2 ? "lots" : "lot"}`;
  return `${volume} ${size.unit}`;
}

const sizeProblems: Record<Exclude<SignalSize, { ok: true }>["reason"], string> = {
  loading: "Calcul de ton lot…",
  account: "Ajoute ton compte de trading pour voir ton lot sur chaque signal.",
  balance: "Le solde de ton compte n’est pas encore connu.",
  levels: "Il manque l’entrée ou le stop pour calculer le lot.",
  instrument: "Le lot de cet actif se calcule dans le calculateur complet.",
  rate: "Taux de change indisponible pour le moment.",
  budget: "Ton risque est trop faible pour le lot minimum.",
};

function TradeBlock({ ctx, post }: { ctx: Ctx; post: VipPost }) {
  const { t, fmt, now, member, go, openThread, copyLevels } = ctx;
  const size = sizeSignal(member, post.symbol || "", levelOf(post, "Entrée"), levelOf(post, "Stop"));
  return <article className={s.trade}>
    <div className={s.tradeHead}>
      <p className={s.sub}><b className={s.gold}>{[post.symbol || post.title || t("Signal"), orderLabel(post, t)].filter(Boolean).join(" · ")}</b> · {since(post, now, fmt, t)}</p>
      <span className={s.pill}><span className={s.dot} aria-hidden="true" />{t("En cours")}</span>
    </div>
    <Chart ctx={ctx} post={post} area={170} top={24} />
    <div className={s.lot}>
      {size.ok ? <>
        <div className={s.lotRow}>
          <div><span className={s.small}>{t(size.kind === "point_value" ? "Ton volume" : "Ton lot")}</span><b className={s.lotBig}>{volumeText(size, fmt)}</b></div>
          <div className={s.lotMeta}><b>≈ {fmt.money(size.risk, size.currency)} {t("de risque")}</b><span>{`${new Intl.NumberFormat(fmt.tag).format(member.risk)} % · ${size.account.name}`}</span></div>
        </div>
        <ol className={s.steps}>
          <li><b>1</b>{t("Copie les niveaux")}</li>
          <li><b>2</b>{t("Ouvre MetaTrader")}</li>
          <li><b>3</b>{`${t("Place l’ordre à")} ${volumeText(size, fmt)}`}</li>
        </ol>
      </> : <div className={s.lotProblem}>
        <p className={s.small}>{t(sizeProblems[size.reason])}</p>
        {size.reason === "account" || size.reason === "balance" ? <button type="button" className={s.textButton} onClick={() => go("compte")}>{t(size.reason === "account" ? "Ajouter mon compte" : "Voir mes comptes")}</button>
          : size.reason !== "loading" ? <Link className={s.textButton} href={riskSignalHref(post.id)}>{t("Ouvrir le calculateur")} <ArrowUpRight size={14} aria-hidden="true" /></Link> : null}
      </div>}
      <div className={s.buttons}>
        <button type="button" className={s.primary} onClick={() => copyLevels(post)}><Copy size={16} aria-hidden="true" />{t("Copier les niveaux")}</button>
        <button type="button" className={s.secondary} onClick={() => openThread(post.id)}>{t("Le fil du trade")}</button>
      </div>
    </div>
  </article>;
}

/* Le fil du trade: the signal, the team’s updates, the member’s position on MetaTrader, and what to do next. */
function Thread({ ctx, post }: { ctx: Ctx; post: VipPost }) {
  const { t, fmt, now, stats, member, go, openThread, copyLevels, posts } = ctx;
  const order = vipSignalOrder(post);
  const side = order?.side;
  const symbol = (post.symbol || "").trim().toUpperCase();
  const closure = closureOf(post, stats.closed);
  const cancelled = !closure && isCancelled(post, posts);
  const state = signalState(post, closure, now, t, cancelled);
  const updates = threadUpdates(post, posts);
  const created = Date.parse(post.created_at);
  // GOLD on Telegram is XAUUSD (or XAUUSD.r) on the member’s MetaTrader.
  const position = member.openTrades.find(trade => sameInstrument(trade.symbol, symbol) && trade.direction === side
    && Math.abs(dayNumber(trade.date.slice(0, 10)) - dayNumber(parisDay(created))) <= 1);
  const accountName = position ? member.accounts.find(account => account.id === position.accountId)?.name : undefined;
  // The team moved the stop to the entry, but the member’s stop is still on the risk side of the entry.
  const stopBehind = Boolean(position && position.entry !== null && position.stop !== null && !closure && !cancelled
    && updates.some(update => BREAKEVEN.test(`${update.title} ${update.text}`))
    && (side === "sell" ? position.stop > position.entry : position.stop < position.entry));
  const targets = levelPairs(post).filter(([label]) => label.startsWith("TP"));
  return <div className={s.page}>
    <div className={s.topline}>
      <button type="button" className={s.back} onClick={() => openThread(null)}><ChevronLeft size={18} aria-hidden="true" />{t("Signaux")}</button>
      {state ? <span className={s.pill}>{state.tone === "open" ? <span className={s.dot} aria-hidden="true" /> : null}{state.label}</span> : null}
    </div>
    <h1 className={s.pageTitle}>{[post.symbol || post.title || t("Signal"), orderLabel(post, t)].filter(Boolean).join(" · ")}</h1>
    <Chart ctx={ctx} post={post} area={110} top={22} />
    {position ? <div className={s.position}>
      <div><span className={s.small}>{t("Ta position · détectée sur MetaTrader")}</span><b>{position.entry !== null ? <><span className={s.nowrap}>{`${t("entrée")} ${fmt.price(position.entry)}`}</span> · </> : null}<span className={s.nowrap}>{position.stop !== null ? `${t("stop")} ${fmt.price(position.stop)}` : t("sans stop")}</span></b></div>
      {accountName ? <span className={s.tag}>{accountName}</span> : null}
    </div> : member.status === "ready" && member.accounts.length ? <p className={s.small}>{t("Aucune position ouverte sur ce trade dans tes comptes connectés.")}</p> : null}
    <ol className={s.timeline}>
      <li><time>{fmt.clock(post.created_at)}</time><span className={`${s.node} ${s.nodeGold}`} /><div><b>{t("Signal publié")}</b><span>{levelPairs(post).map(([label, value]) => `${t(label)} ${fmt.price(value)}`).join(" · ")}</span></div></li>
      {position ? <li><time>{t("toi")}</time><span className={s.node} /><div><b>{t("Tu es en position")}</b><span>{position.entry !== null ? `${t("Entrée à")} ${fmt.price(position.entry)}` : t("Position ouverte sur ton compte")}</span></div></li> : null}
      {updates.map(update => <li key={update.id}><time>{update.id.endsWith(":note") ? "" : fmt.clock(new Date(update.at).toISOString())}</time><span className={`${s.node} ${s.nodeGain}`} /><div><b>{t(update.title)}</b>{update.text ? <span>{update.text}</span> : null}</div></li>)}
      {stopBehind && position ? <li className={s.warn}><time>{t("à faire")}</time><span className={`${s.node} ${s.nodeLoss}`} /><div><b>{`${t("Ton stop est encore à")} ${fmt.price(position.stop ?? 0)}`}</b><span>{`${t("Remonte-le à ton point d’entrée")} (${fmt.price(position.entry ?? 0)}) ${t("pour être sans risque.")}`}</span></div></li> : null}
      {closure ? <li><time>{t("fin")}</time><span className={`${s.node} ${closure.outcome === "LOSS" ? s.nodeLoss : s.nodeGain}`} /><div><b>{`${t("Clôturé")} · ${outcomeLabel(closure, t)}`}</b>{closure.resultR !== null ? <span>{fmt.r(closure.resultR)}</span> : null}</div></li>
        : !cancelled && targets.length ? <li className={s.next}><time /><span className={`${s.node} ${s.nodeOpen}`} /><div><b>{t("Objectifs en attente")}</b><span>{targets.map(([label, value]) => `${label} ${fmt.price(value)}`).join(" · ")}</span></div></li> : null}
    </ol>
    <div className={s.buttons}>
      <button type="button" className={s.primary} onClick={() => copyLevels(post)}><Copy size={16} aria-hidden="true" />{t("Copier les niveaux")}</button>
      <button type="button" className={s.secondary} onClick={() => go("canal", "chat")}>{t("Discuter de ce trade")}</button>
    </div>
  </div>;
}

/* Canal: Le fil and Le téléphone in one feed, filtered by chips. */
function Canal({ ctx }: { ctx: Ctx }) {
  const { t, view, onSelect, stats, channelContent, banner } = ctx;
  const recent = stats.recentSignals.length;
  const chips: { channel: VipChannel; label: string }[] = [
    { channel: "all", label: t("Tout") },
    { channel: "signal", label: recent ? `${t("Signaux")} · ${recent}` : t("Signaux") },
    { channel: "analysis", label: t("Analyses") },
    { channel: "chat", label: t("Discussion") },
  ];
  const feedOpen = feedChannels.includes(view);
  return <div className={s.page}>
    <PageHead title={view === "favorites" ? t("Mes favoris") : view === "telegram" ? "Telegram" : t("Canal")}>
      <button type="button" className={s.iconButton} aria-pressed={view === "favorites"} aria-label={t("Mes favoris")} title={t("Mes favoris")} onClick={() => onSelect(view === "favorites" ? "all" : "favorites")}>
        <Bookmark size={19} fill={view === "favorites" ? "currentColor" : "none"} aria-hidden="true" />
      </button>
    </PageHead>
    {banner}
    <div className={s.chips} role="group" aria-label={t("Rubriques du canal")}>
      {chips.map(item => <button key={item.channel} type="button" className={view === item.channel ? s.chipOn : s.chip} aria-pressed={view === item.channel} onClick={() => onSelect(item.channel)}>{item.label}</button>)}
    </div>
    <div className={s.stack}>
      {feedOpen ? <FeedStream ctx={ctx} /> : channelContent ?? <p className={s.small}>{t("Cette rubrique n’est pas disponible.")}</p>}
    </div>
  </div>;
}

function FeedStream({ ctx }: { ctx: Ctx }) {
  const { t, view, posts } = ctx;
  const visible = feedPosts(view, posts);
  if (!visible.length) return <p className={s.emptyCard}>{t(emptyTitles[view] ?? "Les publications de l’équipe apparaîtront ici.")}</p>;
  return <>{visible.map(post => <PostCard key={post.id} ctx={ctx} post={post} />)}</>;
}

function PostCard({ ctx, post }: { ctx: Ctx; post: VipPost }) {
  const { t, fmt, now, stats, openThread, posts } = ctx;
  const image = safeImage(post.image_url);
  const signal = post.category === "signal";
  // An update posted as a reply on Telegram leads to its trade.
  const threadSignal = post.category === "followup" && post.thread_post_id ? posts.find(other => other.id === post.thread_post_id && other.category === "signal") : undefined;
  const order = signal ? vipSignalOrder(post) : null;
  const levels = signal ? levelPairs(post) : [];
  const entry = levels.find(([label]) => label === "Entrée");
  const others = levels.filter(([label]) => label !== "Entrée");
  const state = signal ? signalState(post, closureOf(post, stats.closed), now, t, isCancelled(post, posts)) : null;
  const note = signal ? signalFreeText(post.body || "") : "";
  const heading = signal
    ? [post.symbol || post.title || t("Signal"), order?.side ? `${orderLabel(post, t)}${entry ? ` ${t("à")} ${fmt.price(entry[1])}` : ""}` : ""].filter(Boolean).join(" · ")
    : post.title;
  return <article className={s.card} id={`publication-${post.id}`}>
    <div className={s.kicker}>
      <span className={s[categoryTone[post.category]]}>{t(categoryNames[post.category])}</span>
      {state ? <span className={`${s.state} ${s[toneClass[state.tone]]}`}>{state.tone === "open" ? <span className={s.dot} aria-hidden="true" /> : null}{state.label}</span> : null}
      <time className={s.time}>{when(post, now, fmt)}</time>
    </div>
    <h2 className={s.cardTitle}>{heading}</h2>
    {others.length ? <p className={`${s.levelsLine} ${s.num}`}>{others.map(([label, value]) => `${t(label)} ${fmt.price(value)}`).join(" · ")}</p> : null}
    {image ? <a className={s.chartImage} href={image} target="_blank" rel="noopener noreferrer" aria-label={t("Ouvrir le graphique en grand")}><img src={image} alt={post.title} loading="lazy" referrerPolicy="no-referrer" /></a> : null}
    {signal ? (note ? <p className={s.body}>{note}</p> : null) : post.body ? <p className={s.body}>{post.body}</p> : null}
    <div className={s.cardActions}>
      <Reactions ctx={ctx} post={post} />
      <Favorite ctx={ctx} post={post} />
      {signal && state?.tone === "open" ? <button type="button" className={s.cardLink} onClick={() => openThread(post.id)}>{t("Le fil du trade")} ›</button>
        : threadSignal ? <button type="button" className={s.cardLink} onClick={() => openThread(threadSignal.id)}>{t("Le fil du trade")} ›</button> : null}
    </div>
  </article>;
}

function Reactions({ ctx, post }: { ctx: Ctx; post: VipPost }) {
  const { t, actions } = ctx;
  const state = actions.reactions(post);
  const busyNow = actions.pending(post);
  const keys: VipReaction[] = state.counts.heart > 0 || state.mine === "heart" ? ["like", "fire", "heart"] : ["like", "fire"];
  return <div className={s.reactions} role="group" aria-label={t("Réagir à la publication")}>
    {keys.map(key => <button key={key} type="button" className={s.reaction} aria-pressed={state.mine === key} aria-label={`${t(reactionLabels[key])} · ${state.counts[key]}`} disabled={busyNow} onClick={() => void actions.react(post, key)}>
      <span aria-hidden="true">{reactionEmoji[key]}</span> {state.counts[key]}
    </button>)}
  </div>;
}

function Favorite({ ctx, post }: { ctx: Ctx; post: VipPost }) {
  const { t, actions } = ctx;
  const saved = actions.favorite(post);
  const label = t(saved ? "Retirer des favoris" : "Ajouter aux favoris");
  return <button type="button" className={s.bookmark} aria-pressed={saved} aria-label={label} title={label} disabled={actions.pending(post)} onClick={() => void actions.toggleFavorite(post)}>
    <Bookmark size={17} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
  </button>;
}
