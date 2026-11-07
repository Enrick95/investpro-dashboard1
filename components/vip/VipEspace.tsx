"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Bell, Calculator, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { buildVipPerformanceReport, type ReportRow, type ReportTrade } from "@/lib/vip/performance-report";
import { vipSignalOrder } from "@/lib/vip/publication-notice";
import { riskSignalHref } from "@/lib/vip/signal-risk-preset";
import type { VipMembership, VipPost, VipPostCategory } from "@/lib/vip/types";
import type { PublicVipPerformanceTrade } from "@/lib/vip/public-performance";
import s from "./VipEspace.module.css";

/** Every place a member can open in the space. `all` is the default feed. */
export type VipChannel = "all" | "signal" | "analysis" | "followup" | "performance" | "partnership" | "telegram" | "chat" | "favorites" | "risk" | "training";
type EspaceTab = "fil" | "salle" | "telephone";
type Lang = "fr" | "en";
type Translate = (message: string) => string;
type Perf = { status: "loading" | "ready" | "error"; trades: PublicVipPerformanceTrade[] };

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
  accountTools?: ReactNode;
  /** The channel content (feed, chat, favourites…), rendered by the portal under its own access rules. */
  channelContent: ReactNode;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RENEWAL_NOTICE_MS = 30 * DAY_MS;
const feedChannels: VipChannel[] = ["all", "signal", "analysis", "followup", "performance", "partnership"];
const toolChannels: VipChannel[] = ["chat", "favorites", "telegram"];
const tabs: { key: EspaceTab; label: string }[] = [
  { key: "fil", label: "Le fil" },
  { key: "salle", label: "La salle des signaux" },
  { key: "telephone", label: "Le téléphone" },
];
const channelTitles: Record<VipChannel, string> = {
  all: "Tout le canal", signal: "Signaux", analysis: "Analyses", followup: "Suivi des trades", performance: "Bilans",
  partnership: "Partenariats", telegram: "Telegram", chat: "Chat", favorites: "Favoris", risk: "Calculer mon lot", training: "Formation & coaching",
};
const channelIntros: Record<VipChannel, string> = {
  all: "Seule l’équipe publie. Les membres peuvent réagir.",
  signal: "Les idées structurées de l’équipe.",
  analysis: "Le contexte, les zones et les graphiques.",
  followup: "Les mises à jour des idées partagées.",
  performance: "Le récapitulatif partagé avec le groupe.",
  partnership: "Les présentations et avantages des partenaires.",
  telegram: "Le lien avec ton canal privé.",
  chat: "Les échanges entre membres du VIP.",
  favorites: "Vos analyses, signaux et publications enregistrés.",
  risk: "Préparer son lot avant la prise de position.",
  training: "Les prochaines expériences du cercle.",
};
const categoryNames: Record<VipPostCategory, string> = { signal: "Signal", analysis: "Analyse", performance: "Bilan", followup: "Suivi", partnership: "Partenariat" };
const categoryClasses: Record<VipPostCategory, string> = { signal: "tagSignal", analysis: "tagAnalysis", performance: "tagPerformance", followup: "tagFollowup", partnership: "tagPartnership" };

function isRecent(post: VipPost, now: number): boolean {
  const created = Date.parse(post.created_at);
  return Number.isFinite(created) && now - created < DAY_MS;
}

function newestFirst(posts: VipPost[]): VipPost[] {
  return [...posts].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** Calendar month in Paris, as YYYY-MM, matching the day strings of the public performance API. */
function parisMonth(value: number): string {
  if (!Number.isFinite(value)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).formatToParts(new Date(value));
  const year = parts.find(part => part.type === "year")?.value ?? "";
  const month = parts.find(part => part.type === "month")?.value ?? "";
  return year && month ? `${year}-${month}` : "";
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

/** Same figures as the Bilan page: the report helper decides what counts as a win, a loss and a known R. */
function computeStats(posts: VipPost[], trades: PublicVipPerformanceTrade[], now: number) {
  const month = parisMonth(now);
  const signals = newestFirst(posts).filter(post => post.category === "signal");
  const reportTrades: ReportTrade[] = trades.map(trade => ({
    id: `${trade.source}:${trade.id}`,
    date: trade.trade_date,
    symbol: trade.symbol,
    direction: trade.direction,
    status: trade.status,
    resultR: trade.result_r,
    target: trade.target,
    source: trade.source,
  }));
  const all = buildVipPerformanceReport(reportTrades);
  const current = buildVipPerformanceReport(reportTrades.filter(trade => trade.date.startsWith(month)));
  return {
    recentSignals: signals.filter(post => isRecent(post, now)),
    signalsThisMonth: signals.filter(post => parisMonth(Date.parse(post.created_at)) === month).length,
    monthTotalR: current.totalR,
    monthWinrate: current.winrate,
    monthClosed: current.counts.closed,
    closed: [...all.closedRows].sort((a, b) => b.date.localeCompare(a.date)),
  };
}
type Stats = ReturnType<typeof computeStats>;

/** Renewal is only offered close to the end of access, or once it has been requested. */
function membershipNote(membership: VipMembership | null, now: number) {
  const expires = membership?.expires_at ? Date.parse(membership.expires_at) : Number.NaN;
  if (!Number.isFinite(expires)) return null;
  const requested = Boolean(membership?.renewal_requested_at);
  if (!requested && expires - now >= RENEWAL_NOTICE_MS) return null;
  return { expires, requested, canRequest: membership?.type === "abonnement" && !requested };
}

function levelPairs(post: VipPost): [string, number][] {
  const levels = post.levels ?? {};
  const pairs: [string, number | undefined][] = [["Entrée", levels.entry], ["Stop", levels.stopLoss], ["TP1", levels.takeProfit], ["TP2", levels.takeProfit2]];
  return pairs.filter((pair): pair is [string, number] => typeof pair[1] === "number" && Number.isFinite(pair[1]));
}

function formatters(lang: Lang) {
  const tag = lang === "en" ? "en-US" : "fr-FR";
  const decimal = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const clock = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const long = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  return {
    clock: (value: string) => Number.isFinite(Date.parse(value)) ? clock.format(new Date(value)) : "—",
    long: (value: number) => long.format(new Date(value)),
    price: (value: number) => value.toLocaleString(tag, { maximumFractionDigits: 8 }),
    r: (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${decimal.format(value)} R`,
    pct: (value: number | null) => value === null ? "—" : lang === "en" ? `${Math.round(value)}%` : `${Math.round(value)} %`,
  };
}
type Formatters = ReturnType<typeof formatters>;

type Ctx = {
  t: Translate;
  lang: Lang;
  fmt: Formatters;
  now: number;
  view: VipChannel;
  onSelect: (channel: VipChannel) => void;
  onTab: (tab: EspaceTab) => void;
  posts: VipPost[];
  stats: Stats;
  perf: Perf;
  note: ReturnType<typeof membershipNote>;
  firstName: string;
  busy: boolean;
  onRenew: () => void;
  alertsOn: boolean;
  alertsAvailable: boolean;
  onEnableAlerts: () => void;
  channelContent: ReactNode;
};

/** Three presentations of one space. Only the portal decides what each channel may show. */
export default function VipEspace(props: VipEspaceProps) {
  const { view, onSelect, posts, membership, alertsOn, alertsAvailable, onEnableAlerts, busy, onRenew, refreshKey, loading, onRefresh, accountTools, channelContent } = props;
  const { t, locale } = useLocale();
  const lang: Lang = locale === "en" ? "en" : "fr";
  const [tab, setTab] = useState<EspaceTab>("fil");
  const [perf, setPerf] = useState<Perf>({ status: "loading", trades: [] });
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

  useEffect(() => { panel.current?.scrollTo({ top: 0 }); }, [view, tab]);

  const now = Date.now();
  const ctx: Ctx = {
    t, lang, fmt: formatters(lang), now, view, onSelect, onTab: setTab, posts,
    stats: computeStats(posts, perf.trades, now), perf, note: membershipNote(membership, now),
    firstName: membership?.first_name?.trim() ?? "", busy, onRenew, alertsOn, alertsAvailable, onEnableAlerts, channelContent,
  };

  return <div className={s.espace}>
    <div className={s.topbar}>
      <div className={s.tabs} role="group" aria-label={t("Présentation de l’espace VIP")}>
        {tabs.map(item => <button key={item.key} type="button" aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>{t(item.label)}</button>)}
      </div>
      <button type="button" className={s.refresh} onClick={onRefresh} disabled={loading} aria-label={t("Actualiser mon accès et les publications")} title={t("Actualiser")}><RefreshCw size={17} aria-hidden="true" /></button>
    </div>
    {accountTools ? <div className={s.account}>{accountTools}</div> : null}
    <div className={s.panel} ref={panel}>
      {tab === "fil" ? <Fil ctx={ctx} /> : tab === "salle" ? <Salle ctx={ctx} /> : <Telephone ctx={ctx} />}
    </div>
  </div>;
}

/* A · Le fil : channel list, feed, and the 24-hour and monthly reference points. */
function Fil({ ctx }: { ctx: Ctx }) {
  const { t, view, posts, now, channelContent, alertsOn } = ctx;
  const recentFor = (channel: VipChannel) => posts.filter(post => isRecent(post, now) && (channel === "all" || post.category === channel)).length;
  const fresh = feedChannels.includes(view) ? recentFor(view) : 0;
  return <div className={s.fil}>
    <nav className={s.channels} aria-label={t("Canaux de l’espace VIP")}>
      {feedChannels.map(channel => <ChannelButton key={channel} channel={channel} ctx={ctx} count={recentFor(channel)} />)}
      <span className={s.divider} aria-hidden="true" />
      {toolChannels.map(channel => <ChannelButton key={channel} channel={channel} ctx={ctx} count={0} />)}
      <Link className={s.toolLink} href="/dashboard/simulateur"><Calculator size={16} aria-hidden="true" />{t("Calculer mon lot")}</Link>
      {alertsOn ? <p className={s.alertsOn}><ShieldCheck size={14} aria-hidden="true" />{t("Alertes activées sur ce téléphone")}</p> : null}
    </nav>
    <section className={s.feed} aria-labelledby="vip-espace-channel">
      <header className={s.feedHead}>
        <h1 id="vip-espace-channel">{t(channelTitles[view])}</h1>
        <p>{t(channelIntros[view])}</p>
      </header>
      {fresh > 0 ? <p className={s.banner}>{`${fresh} ${t(fresh > 1 ? "nouvelles publications ces 24 dernières heures" : "nouvelle publication ces 24 dernières heures")}`}</p> : null}
      {channelContent}
    </section>
    <aside className={s.side} aria-label={t("Repères")}>
      <SideSignals ctx={ctx} />
      <SideMonth ctx={ctx} />
      <SideRenewal ctx={ctx} />
    </aside>
  </div>;
}

function ChannelButton({ channel, ctx, count }: { channel: VipChannel; ctx: Ctx; count: number }) {
  return <div className={s.channelRow}>
    <button type="button" aria-pressed={ctx.view === channel} onClick={() => ctx.onSelect(channel)}>{ctx.t(channelTitles[channel])}</button>
    {count > 0 ? <span className={s.count}>{count}</span> : null}
  </div>;
}

function SideBadge({ post }: { post: VipPost }) {
  const order = vipSignalOrder(post);
  const label = order?.label || post.direction?.toUpperCase() || "";
  if (!label) return null;
  return <span className={`${s.badge} ${order?.side === "sell" ? s.sell : order?.side === "buy" ? s.buy : ""}`}>{label}</span>;
}

function SideSignals({ ctx }: { ctx: Ctx }) {
  const { t, fmt, stats } = ctx;
  const recent = stats.recentSignals.slice(0, 3);
  return <section className={s.card} aria-labelledby="vip-espace-side-signals">
    <h2 id="vip-espace-side-signals">{t("Signaux des 24 dernières heures")}</h2>
    {recent.length ? <ul className={s.list}>
      {recent.map(post => <li key={post.id} className={s.sigRow}>
        <SideBadge post={post} />
        <b>{post.symbol || t("Signal")}</b>
        <span className={s.sigLevels}>{levelPairs(post).slice(0, 2).map(([label, value]) => `${t(label)} ${fmt.price(value)}`).join(" · ")}</span>
        <time>{fmt.clock(post.created_at)}</time>
      </li>)}
    </ul> : <p className={s.muted}>{t("Aucun signal publié ces dernières 24 heures.")}</p>}
  </section>;
}

function SideMonth({ ctx }: { ctx: Ctx }) {
  const { t, fmt, stats, perf } = ctx;
  const unavailable = perf.status === "error" && perf.trades.length === 0;
  return <section className={s.card} aria-labelledby="vip-espace-side-month">
    <h2 id="vip-espace-side-month">{t("Ce mois-ci")}</h2>
    {unavailable ? <p className={s.muted}>{t("Performances indisponibles pour le moment.")}</p> : <>
      <div className={s.tiles}>
        <div className={s.tile}><span>{t("Résultat")}</span><b className={s.green}>{perf.status === "loading" ? "…" : fmt.r(stats.monthTotalR)}</b></div>
        <div className={s.tile}><span>{t("Réussite")}</span><b className={s.gold}>{perf.status === "loading" ? "…" : fmt.pct(stats.monthWinrate)}</b></div>
      </div>
      {perf.status === "ready" && stats.monthClosed === 0 ? <p className={s.muted}>{t("Aucun trade clôturé ce mois-ci.")}</p> : null}
    </>}
    <Link className={s.link} href="/dashboard/performances-vip"><span>{t("Voir toutes les performances")}</span><ArrowUpRight size={14} aria-hidden="true" /></Link>
  </section>;
}

function SideRenewal({ ctx }: { ctx: Ctx }) {
  const { t, fmt, note, busy, onRenew } = ctx;
  if (!note) return null;
  return <section className={s.card} aria-labelledby="vip-espace-renewal">
    <h2 id="vip-espace-renewal">{t("Renouvellement")}</h2>
    <p className={s.muted}>{t("Votre accès se termine le")} <b>{fmt.long(note.expires)}</b>.</p>
    {note.requested ? <p className={s.muted}>{t("Renouvellement demandé · en attente de vérification par l’équipe.")}</p>
      : note.canRequest ? <button type="button" className={s.primary} onClick={onRenew} disabled={busy}>{t("Demander mon renouvellement")}</button> : null}
  </section>;
}

/* B · La salle des signaux: greeting, four figures, the latest signals, and the recent publications and closed trades. */
function Salle({ ctx }: { ctx: Ctx }) {
  const { t, fmt, posts, stats, perf, firstName, onSelect, onTab } = ctx;
  const latestSignals = newestFirst(posts).filter(post => post.category === "signal").slice(0, 2);
  const latest = newestFirst(posts).slice(0, 4);
  const closed = stats.closed.slice(0, 4);
  const count = stats.recentSignals.length;
  const unavailable = perf.status === "error" && perf.trades.length === 0;
  const figure = (value: string) => perf.status === "loading" ? "…" : value;
  return <div className={s.salle}>
    <header className={s.salleHead}>
      <div>
        <span className={s.eyebrow}>{t("Salle des signaux · VIP")}</span>
        <h1>{firstName ? `${t("Bonjour")} ${firstName}.` : t("Bienvenue dans le cercle.")}</h1>
        <p>{count === 0 ? t("Aucun signal publié ces dernières 24 heures.") : `${count} ${t(count > 1 ? "signaux publiés ces dernières 24 heures." : "signal publié ces dernières 24 heures.")}`}</p>
      </div>
      <div className={s.headActions}>
        <button type="button" className={s.secondary} onClick={() => { onTab("fil"); onSelect("chat"); }}>{t("Chat")}</button>
        <Link className={s.primary} href="/dashboard/simulateur"><Calculator size={15} aria-hidden="true" />{t("Calculer mon lot")}</Link>
      </div>
    </header>
    <div className={s.kpis}>
      <Kpi label={t("Signaux (24 h)")} value={String(count)} tone={s.blue} />
      <Kpi label={t("Résultat du mois")} value={figure(fmt.r(stats.monthTotalR))} tone={s.green} />
      <Kpi label={t("Taux de réussite")} value={figure(fmt.pct(stats.monthWinrate))} tone={s.gold} />
      <Kpi label={t("Signaux ce mois")} value={String(stats.signalsThisMonth)} />
    </div>
    <h2 className={s.sectionTitle}>{t("Derniers signaux")}</h2>
    {latestSignals.length ? <div className={s.signals}>
      {latestSignals.map(post => <SignalTile key={post.id} ctx={ctx} post={post} />)}
    </div> : <Empty>{t("Les signaux publiés par l’équipe apparaîtront ici.")}</Empty>}
    <div className={s.twoCols}>
      <section className={s.box} aria-labelledby="vip-espace-latest">
        <h2 id="vip-espace-latest">{t("Dernières publications")}</h2>
        {latest.length ? <ul className={s.list}>
          {latest.map(post => <li key={post.id} className={s.row}>
            <span className={`${s.tag} ${s[categoryClasses[post.category]]}`}>{t(categoryNames[post.category])}</span>
            <span className={s.rowText}>{post.title || post.body.slice(0, 90)}</span>
            <time className={s.rowTime}>{fmt.clock(post.created_at)}</time>
          </li>)}
        </ul> : <p className={s.muted}>{t("Les publications de l’équipe apparaîtront ici.")}</p>}
      </section>
      <section className={s.box} aria-labelledby="vip-espace-closed">
        <h2 id="vip-espace-closed">{t("Trades clôturés")}</h2>
        {unavailable ? <p className={s.muted}>{t("Performances indisponibles pour le moment.")}</p>
          : closed.length ? <ul className={s.list}>
            {closed.map(row => <li key={row.id} className={s.closedRow}>
              <span>{row.symbol} · {t(row.direction === "buy" ? "Achat" : "Vente")}</span>
              <ClosedOutcome row={row} ctx={ctx} />
            </li>)}
          </ul> : <p className={s.muted}>{t("Les trades clôturés apparaîtront ici.")}</p>}
        <Link className={s.link} href="/dashboard/performances-vip"><span>{t("Voir toutes les performances")}</span><ArrowUpRight size={14} aria-hidden="true" /></Link>
      </section>
    </div>
  </div>;
}

function ClosedOutcome({ row, ctx }: { row: ReportRow; ctx: Ctx }) {
  const { t, fmt } = ctx;
  const won = row.status === "win";
  const label = row.outcome.startsWith("TP") ? `${row.outcome} ✓` : won ? t("Gain") : row.status === "loss" ? t("Stop") : "BE";
  const tone = won ? s.win : row.status === "loss" ? s.loss : s.be;
  return <b className={tone}>{label}{row.resultR !== null && row.status !== "breakeven" ? ` · ${fmt.r(row.resultR)}` : ""}</b>;
}

function SignalTile({ ctx, post }: { ctx: Ctx; post: VipPost }) {
  const { t, fmt } = ctx;
  const sell = vipSignalOrder(post)?.side === "sell";
  const levels = levelPairs(post);
  return <article className={`${s.signalTile} ${sell ? s.sellTile : ""}`}>
    <div className={s.signalHead}>
      <b className={s.symbol}>{post.symbol || t("Signal")}</b>
      <SideBadge post={post} />
      <time className={s.signalTime}>{t("publié à")} {fmt.clock(post.created_at)}</time>
    </div>
    {levels.length ? <dl className={s.levelRow}>
      {levels.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{fmt.price(value)}</dd></div>)}
    </dl> : <p className={s.muted}>{t("Niveaux à consulter dans le fil.")}</p>}
    <Link className={s.riskLink} href={riskSignalHref(post.id)}><Calculator size={14} aria-hidden="true" />{t("Calculer mon lot")}</Link>
  </article>;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={s.kpi}><span>{label}</span><b className={tone}>{value}</b></div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className={s.empty}><MessageCircle size={20} aria-hidden="true" /><p>{children}</p></div>;
}

/* C · Le téléphone: one column, filter chips, the same feed, and the portal's personal navigation below. */
function Telephone({ ctx }: { ctx: Ctx }) {
  const { t, view, onSelect, stats, alertsOn, alertsAvailable, onEnableAlerts, channelContent } = ctx;
  const count = stats.recentSignals.length;
  const chips: { channel: VipChannel; label: string }[] = [
    { channel: "all", label: t("Tout") },
    { channel: "signal", label: count ? `${t("Signaux")} · ${count}` : t("Signaux") },
    { channel: "analysis", label: t("Analyses") },
    { channel: "performance", label: t("Bilans") },
    { channel: "followup", label: t("Suivi des trades") },
    { channel: "partnership", label: t("Partenariats") },
    { channel: "chat", label: t("Chat") },
    { channel: "favorites", label: t("Favoris") },
    { channel: "telegram", label: t("Telegram") },
  ];
  return <div className={s.phone}>
    <header className={s.phoneHead}>
      <span className={s.mark} aria-hidden="true">IP</span>
      <div className={s.phoneTitle}>
        <b>{t("Canal VIP")}</b>
        <small><span aria-hidden="true">● </span>{count ? `${count} ${t(count > 1 ? "signaux ces 24 dernières heures" : "signal ces 24 dernières heures")}` : t("Aucun signal ces 24 dernières heures")}</small>
      </div>
      {alertsAvailable && !alertsOn ? <button type="button" className={s.iconButton} onClick={onEnableAlerts} aria-label={t("Activer les alertes")} title={t("Activer les alertes")}><Bell size={18} aria-hidden="true" /></button> : null}
    </header>
    <div className={s.chips} role="group" aria-label={t("Rubriques")}>
      {chips.map(item => <button key={item.channel} type="button" aria-pressed={view === item.channel} onClick={() => onSelect(item.channel)}>{item.label}</button>)}
    </div>
    <div className={s.phoneBody}>{channelContent}</div>
  </div>;
}
