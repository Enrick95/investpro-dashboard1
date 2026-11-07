"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bell, Bookmark, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { vipRequest } from "@/lib/vip/client";
import { buildVipPerformanceReport, type ReportRow, type ReportTrade } from "@/lib/vip/performance-report";
import { vipSignalOrder } from "@/lib/vip/publication-notice";
import { riskSignalHref } from "@/lib/vip/signal-risk-preset";
import type { VipMembership, VipPost, VipPostCategory, VipPostReactions, VipReaction } from "@/lib/vip/types";
import type { PublicVipPerformanceTrade } from "@/lib/vip/public-performance";
import s from "./VipEspace.module.css";

/** Every place a member can open in the space. `all` is the default feed. */
export type VipChannel = "all" | "signal" | "analysis" | "followup" | "performance" | "partnership" | "telegram" | "chat" | "favorites" | "risk" | "training";
type EspaceTab = "fil" | "salle" | "telephone";
type SalleFilter = "all" | "followup" | "analysis" | "performance";
type Lang = "fr" | "en";
type Translate = (message: string) => string;
type Perf = { status: "loading" | "ready" | "error"; trades: PublicVipPerformanceTrade[] };
type Side = "buy" | "sell" | null | undefined;

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
  /** Account tools, shown at the foot of the presentation that is open. */
  accountTools?: ReactNode;
  /** Chat, favourites and Telegram, rendered by the portal under its own access rules. */
  channelContent: ReactNode;
  /** The language switch of the portal, kept in the top bar of the space. */
  languageControl?: ReactNode;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RENEWAL_NOTICE_MS = 30 * DAY_MS;
/** Channels whose publications the space draws itself; the portal only supplies the other channels. */
export const feedChannels: VipChannel[] = ["all", "signal", "analysis", "followup", "performance", "partnership"];
const railChannels: { channel: VipChannel; label: string }[] = [
  { channel: "all", label: "Tout le canal" },
  { channel: "signal", label: "Signaux" },
  { channel: "analysis", label: "Analyses" },
  { channel: "followup", label: "Suivi des trades" },
  { channel: "performance", label: "Bilans" },
  { channel: "partnership", label: "Partenariats" },
  { channel: "chat", label: "Discussion" },
];
const tabs: { key: EspaceTab; label: string }[] = [
  { key: "fil", label: "Le fil" },
  { key: "salle", label: "La salle des signaux" },
  { key: "telephone", label: "Le téléphone" },
];
const salleFilters: { key: SalleFilter; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "followup", label: "Suivi" },
  { key: "analysis", label: "Analyse" },
  { key: "performance", label: "Bilan" },
];
const channelTitles: Record<VipChannel, string> = {
  all: "Tout le canal", signal: "Signaux", analysis: "Analyses", followup: "Suivi des trades", performance: "Bilans",
  partnership: "Partenariats", telegram: "Telegram", chat: "Discussion", favorites: "Mes favoris", risk: "Calculer mon lot", training: "Formation & coaching",
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
const emptyTitles: Partial<Record<VipChannel, string>> = {
  all: "Les premières publications apparaîtront ici.",
  analysis: "Vos prochaines analyses apparaîtront ici.",
  signal: "Vos prochains signaux apparaîtront ici.",
  performance: "Vos prochains bilans apparaîtront ici.",
  followup: "Les prochaines mises à jour apparaîtront ici.",
  partnership: "Les prochains partenariats apparaîtront ici.",
};
const categoryNames: Record<VipPostCategory, string> = { signal: "Signal", analysis: "Analyse", performance: "Bilan", followup: "Suivi", partnership: "Partenariat" };
const categoryTone: Record<VipPostCategory, string> = { signal: "tagSignal", analysis: "tagAnalysis", performance: "tagPerformance", followup: "tagFollowup", partnership: "tagPartnership" };
const reactionLabels: Record<VipReaction, string> = { like: "J’aime", fire: "Flamme", heart: "Cœur" };
const reactionEmoji: Record<VipReaction, string> = { like: "👍", fire: "🔥", heart: "❤️" };
const noReactions: VipPostReactions = { counts: { like: 0, fire: 0, heart: 0 }, mine: null };

function isRecent(post: VipPost, now: number): boolean {
  const created = Date.parse(post.created_at);
  return Number.isFinite(created) && now - created < DAY_MS;
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
  // Prices keep the dot and two decimals of the maquettes, whatever the interface language.
  const price = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
  const clock = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" });
  const weekday = new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "Europe/Paris" });
  const long = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  const valid = (value: string) => Number.isFinite(Date.parse(value));
  return {
    clock: (value: string) => valid(value) ? clock.format(new Date(value)) : "—",
    day: (value: string) => valid(value) ? weekday.format(new Date(value)) : "—",
    dateTime: (value: string) => valid(value) ? `${weekday.format(new Date(value))} ${clock.format(new Date(value))}` : "—",
    long: (value: number) => long.format(new Date(value)),
    price: (value: number) => price.format(value).replace(/,/g, " "),
    r: (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${ratio.format(value)} R`,
    pct: (value: number | null) => value === null ? "—" : `${Math.round(value)}${lang === "en" ? "%" : " %"}`,
  };
}
type Formatters = ReturnType<typeof formatters>;

/** A list row: today's publications show their time, older ones their day. */
function stamp(post: VipPost, now: number, fmt: Formatters): string {
  return isRecent(post, now) ? fmt.clock(post.created_at) : fmt.day(post.created_at);
}

/** A card: today's publications show their time, older ones their day and time. */
function when(post: VipPost, now: number, fmt: Formatters): string {
  return isRecent(post, now) ? fmt.clock(post.created_at) : fmt.dateTime(post.created_at);
}

function pillTone(side: Side): string {
  return side === "sell" ? "sell" : side === "buy" ? "buy" : "neutral";
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
  accountTools: ReactNode;
  actions: Actions;
};

/** Three presentations of one space, drawn from the validated maquettes. Only the portal decides what each channel may show. */
export default function VipEspace(props: VipEspaceProps) {
  const { view, onSelect, posts, membership, alertsOn, alertsAvailable, onEnableAlerts, busy, onRenew, refreshKey, loading, onRefresh, onFavoriteChange, accountTools, channelContent, languageControl } = props;
  const { t, locale } = useLocale();
  const lang: Lang = locale === "en" ? "en" : "fr";
  const [tab, setTab] = useState<EspaceTab>("fil");
  const [perf, setPerf] = useState<Perf>({ status: "loading", trades: [] });
  const [reactionOverrides, setReactionOverrides] = useState<Record<string, { source: VipPostReactions | undefined; value: VipPostReactions }>>({});
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, { source: VipPost; value: boolean }>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
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
  const actions: Actions = {
    reactions: reactionsOf, favorite: favoriteOf, pending: post => Boolean(pending[post.id]), react, toggleFavorite,
  };
  const ctx: Ctx = {
    t, fmt: formatters(lang), now, view, onSelect, onTab: setTab, posts,
    stats: computeStats(posts, perf.trades, now), perf, note: membershipNote(membership, now),
    firstName: membership?.first_name?.trim() ?? "", busy, onRenew, alertsOn, alertsAvailable, onEnableAlerts,
    channelContent, accountTools, actions,
  };

  return <div className={s.espace}>
    <div className={s.topbar}>
      <div className={s.tabs} role="group" aria-label={t("Présentation de l’espace VIP")}>
        {tabs.map(item => <button key={item.key} type="button" aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>{t(item.label)}</button>)}
      </div>
      <div className={s.topActions}>
        {languageControl}
        <button type="button" className={s.refresh} onClick={onRefresh} disabled={loading} aria-label={t("Actualiser mon accès et les publications")} title={t("Actualiser")}><RefreshCw size={17} aria-hidden="true" /></button>
      </div>
    </div>
    {notice ? <p className={s.notice} role="alert">{t(notice)}</p> : null}
    <div className={tab === "salle" ? s.panel : `${s.panel} ${s.panelFixed}`} ref={panel}>
      {tab === "fil" ? <Fil ctx={ctx} /> : tab === "salle" ? <Salle ctx={ctx} /> : <Telephone ctx={ctx} />}
    </div>
    {tab === "telephone" ? null : <PersonalNav ctx={ctx} className={s.mobileNav} />}
  </div>;
}

/* A · Le fil: the channel rail, the feed of the chosen channel, and the figures of the last 24 hours and of the month. */
function Fil({ ctx }: { ctx: Ctx }) {
  const { t, view, posts, now, channelContent, alertsOn, alertsAvailable, onEnableAlerts, accountTools } = ctx;
  const recentFor = (channel: VipChannel) => posts.filter(post => isRecent(post, now) && (channel === "all" || post.category === channel)).length;
  const feedOpen = feedChannels.includes(view);
  const fresh = view === "all" ? recentFor("all") : 0;
  return <div className={s.fil}>
    <nav className={s.rail} aria-label={t("Salons VIP")}>
      <div className={s.brand}>
        <span className={s.mark} aria-hidden="true">IP</span>
        <div><b>VIP InvestPro</b><small><span aria-hidden="true">● </span>{t("Canal privé")}</small></div>
      </div>
      <div className={s.channels}>
        {railChannels.map(item => <ChannelRow key={item.channel} ctx={ctx} channel={item.channel} label={item.label} marker="#" count={item.channel === "chat" ? 0 : recentFor(item.channel)} />)}
      </div>
      <div className={s.spacer} aria-hidden="true" />
      <div className={s.tools}>
        <ChannelRow ctx={ctx} channel="favorites" label="Mes favoris" marker="★" />
        <ChannelRow ctx={ctx} channel="telegram" label="Telegram" />
        <Link className={s.toolLink} href="/dashboard/simulateur">{t("Calculer mon lot")}</Link>
        {alertsOn ? <p className={s.alertsOn}>{t("Alertes activées sur ce téléphone")} <span className={s.green}>✓</span></p>
          : alertsAvailable ? <button type="button" className={s.alertsButton} onClick={onEnableAlerts}><Bell size={15} aria-hidden="true" />{t("Activer les alertes")}</button> : null}
      </div>
      <RailLinks ctx={ctx} />
    </nav>
    <main className={s.feed} aria-labelledby="vip-espace-channel">
      <header className={s.feedHead}>
        <h1 id="vip-espace-channel"><span aria-hidden="true">#</span> {t(channelTitles[view])}</h1>
        <p>{t(feedOpen ? "Seule l’équipe publie · réagis avec 👍 🔥" : channelIntros[view])}</p>
      </header>
      <div className={s.feedBody}>
        {fresh > 0 ? <p className={s.banner}>{`${fresh} ${t(fresh > 1 ? "nouvelles publications" : "nouvelle publication")}`}</p> : null}
        {feedOpen ? <FeedStream ctx={ctx} /> : channelContent ?? <p className={s.empty}>{t("Cette rubrique n’est pas disponible.")}</p>}
        <AccountSlot tools={accountTools} />
      </div>
    </main>
    <aside className={s.side} aria-label={t("Repères")}>
      <SideSignals ctx={ctx} />
      <SideMonth ctx={ctx} />
      <div className={s.spacer} aria-hidden="true" />
      <SideRenewal ctx={ctx} />
    </aside>
  </div>;
}

function ChannelRow({ ctx, channel, label, marker, count = 0 }: { ctx: Ctx; channel: VipChannel; label: string; marker?: string; count?: number }) {
  const on = ctx.view === channel;
  return <div className={on ? `${s.channelRow} ${s.channelOn}` : s.channelRow}>
    <button type="button" className={s.channelButton} aria-pressed={on} onClick={() => ctx.onSelect(channel)}>
      {marker ? <span className={s.marker} aria-hidden="true">{marker} </span> : null}{ctx.t(label)}
    </button>
    {count > 0 ? <span className={channel === "followup" ? `${s.badge} ${s.badgeDark}` : s.badge}>{count}</span> : null}
  </div>;
}

function RailLinks({ ctx }: { ctx: Ctx }) {
  const { t } = ctx;
  return <div className={s.railLinks} role="group" aria-label={t("Mes outils InvestPro")}>
    <Link href="/dashboard">{t("Tableau de bord")}</Link>
    <Link href="/dashboard/journal">{t("Journal")}</Link>
    <Link href="/dashboard/comptes">{t("Comptes")}</Link>
    <Link href="/dashboard/profil">{t("Profil")}</Link>
  </div>;
}

function SideSignals({ ctx }: { ctx: Ctx }) {
  const { t, fmt, stats } = ctx;
  const recent = stats.recentSignals.slice(0, 3);
  return <section className={s.card} aria-labelledby="vip-espace-side-signals">
    <h2 id="vip-espace-side-signals">{t("Signaux des 24 dernières heures")}</h2>
    {recent.length ? recent.map(post => {
      const order = vipSignalOrder(post);
      return <article key={post.id} className={s.sideItem}>
        <div className={s.sideHead}><b>{post.symbol || t("Signal")}{order?.label ? ` · ${order.label}` : ""}</b><time>{fmt.clock(post.created_at)}</time></div>
        <span className={s.sideSub}>{levelPairs(post).slice(0, 2).map(([label, value]) => `${t(label)} ${fmt.price(value)}`).join(" · ")}</span>
      </article>;
    }) : <p className={s.muted}>{t("Aucun signal publié ces dernières 24 heures.")}</p>}
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
    <Link className={s.link} href="/dashboard/performances-vip">{t("Voir toutes les performances")} →</Link>
  </section>;
}

function SideRenewal({ ctx }: { ctx: Ctx }) {
  const { t, fmt, note, busy, onRenew } = ctx;
  if (!note) return null;
  return <section className={s.renewal} aria-label={t("Renouvellement")}>
    <p>{t("Votre accès se termine le")} <b>{fmt.long(note.expires)}</b>.</p>
    {note.requested ? <p className={s.renewalNote}>{t("Renouvellement demandé · en attente de vérification par l’équipe.")}</p>
      : note.canRequest ? <button type="button" className={s.renewButton} onClick={onRenew} disabled={busy}>{t("Demander mon renouvellement")}</button> : null}
  </section>;
}

function FeedStream({ ctx }: { ctx: Ctx }) {
  const { t, view, posts } = ctx;
  const visible = feedPosts(view, posts);
  if (!visible.length) return <p className={s.empty}>{t(emptyTitles[view] ?? "Les publications de l’équipe apparaîtront ici.")}</p>;
  return <>{visible.map(post => <FeedCard key={post.id} ctx={ctx} post={post} />)}</>;
}

function FeedCard({ ctx, post }: { ctx: Ctx; post: VipPost }) {
  if (post.category === "signal") return <SignalArticle ctx={ctx} post={post} />;
  if (post.category === "followup") return <FollowupArticle ctx={ctx} post={post} />;
  return <ArticleCard ctx={ctx} post={post} />;
}

function SignalArticle({ ctx, post }: { ctx: Ctx; post: VipPost }) {
  const { t, fmt, now } = ctx;
  const order = vipSignalOrder(post);
  const levels = levelPairs(post);
  return <article className={s.signal} id={`publication-${post.id}`}>
    <div className={s.byline}><span className={s.avatar} aria-hidden="true">IP</span><b>InvestPro</b><small>· {t("Signal")} · {when(post, now, fmt)}</small></div>
    <div className={s.orderRow}>
      <b className={s.symbol}>{post.symbol || post.title || t("Signal")}</b>
      {order ? <span className={`${s.pill} ${s[pillTone(order.side)]}`}>{order.label}</span> : null}
    </div>
    {levels.length ? <dl className={s.levels} style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }}>
      {levels.map(([label, value]) => <div key={label} className={label === "Stop" ? s.levelStop : undefined}><dt>{t(label)}</dt><dd>{fmt.price(value)}</dd></div>)}
    </dl> : null}
    {post.body ? <p className={s.note}>{post.body}</p> : null}
    <div className={s.actions}>
      <Reactions ctx={ctx} post={post} />
      <Favorite ctx={ctx} post={post} />
      <Link className={s.calc} href={riskSignalHref(post.id)}>{t("Calculer mon lot")} →</Link>
    </div>
  </article>;
}

function ArticleCard({ ctx, post }: { ctx: Ctx; post: VipPost }) {
  const { t, fmt, now } = ctx;
  const image = safeImage(post.image_url);
  return <article className={s.article} id={`publication-${post.id}`}>
    <div className={s.byline}><span className={s.avatar} aria-hidden="true">IP</span><b>InvestPro</b><small>· {t(categoryNames[post.category])} · {when(post, now, fmt)}</small></div>
    <h2 className={s.articleTitle}>{post.title}</h2>
    {image ? <a className={s.chart} href={image} target="_blank" rel="noopener noreferrer" aria-label={t("Ouvrir le graphique dans un nouvel onglet")}><img src={image} alt={post.title} loading="lazy" referrerPolicy="no-referrer" /></a> : null}
    {post.body ? <p className={s.body}>{post.body}</p> : null}
    <div className={s.actions}><Reactions ctx={ctx} post={post} /><Favorite ctx={ctx} post={post} /></div>
  </article>;
}

function FollowupArticle({ ctx, post }: { ctx: Ctx; post: VipPost }) {
  const { fmt, now } = ctx;
  return <article className={s.article} id={`publication-${post.id}`}>
    <div className={s.followHead}><h2 className={s.articleTitle}>{post.title}</h2><small>{when(post, now, fmt)}</small></div>
    {post.body ? <div className={s.timeline}><span>{fmt.clock(post.created_at)}</span><span>{post.body}</span></div> : null}
    <div className={s.actions}><Reactions ctx={ctx} post={post} /><Favorite ctx={ctx} post={post} /></div>
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

/* B · La salle des signaux: greeting, four figures, the two latest signals, the recent publications and the closed trades. */
function Salle({ ctx }: { ctx: Ctx }) {
  const { t, fmt, now, posts, stats, perf, firstName, onSelect, onTab, accountTools } = ctx;
  const [filter, setFilter] = useState<SalleFilter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const latestSignals = newestFirst(posts).filter(post => post.category === "signal").slice(0, 2);
  const rows = newestFirst(posts).filter(post => post.category !== "signal" && (filter === "all" || post.category === filter)).slice(0, 4);
  const closed = stats.closed.slice(0, 5);
  const count = stats.recentSignals.length;
  const unavailable = perf.status === "error" && perf.trades.length === 0;
  const figure = (value: string) => perf.status === "loading" ? "…" : value;
  return <div className={s.salle}>
    <header className={s.salleHead}>
      <div>
        <span className={s.eyebrow}>{t("Salle des signaux · VIP")}</span>
        <h1>{firstName ? `${t("Bonjour")} ${firstName}.` : t("Bienvenue dans le cercle.")}</h1>
      </div>
      <div className={s.headActions}>
        <button type="button" className={s.secondary} onClick={() => { onTab("fil"); onSelect("chat"); }}>{t("Discussion")}</button>
        <Link className={s.primary} href="/dashboard/simulateur">{t("Calculer mon lot")}</Link>
      </div>
    </header>
    <div className={s.kpis}>
      <Kpi label={t("Signaux (24 h)")} value={String(count)} tone={s.blue} />
      <Kpi label={t("Résultat du mois")} value={figure(fmt.r(stats.monthTotalR))} tone={s.green} />
      <Kpi label={t("Taux de réussite")} value={figure(fmt.pct(stats.monthWinrate))} tone={s.gold} />
      <Kpi label={t("Signaux ce mois")} value={String(stats.signalsThisMonth)} />
    </div>
    {latestSignals.length ? <div className={s.signals}>
      {latestSignals.map(post => <SalleSignal key={post.id} ctx={ctx} post={post} expanded={Boolean(open[post.id])} onToggle={() => setOpen(current => ({ ...current, [post.id]: !current[post.id] }))} />)}
    </div> : <p className={s.empty}>{t("Les signaux publiés par l’équipe apparaîtront ici.")}</p>}
    <div className={s.bottom}>
      <section className={s.box} aria-labelledby="vip-espace-latest">
        <div className={s.boxHead}>
          <h2 id="vip-espace-latest">{t("Dernières publications")}</h2>
          <div className={s.filters} role="group" aria-label={t("Filtrer les publications")}>
            {salleFilters.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{t(item.label)}</button>)}
          </div>
        </div>
        {rows.length ? <ul className={s.rows}>
          {rows.map(post => <li key={post.id} className={s.row}>
            <span className={`${s.tag} ${s[categoryTone[post.category]]}`}>{t(categoryNames[post.category])}</span>
            <span className={s.rowText}>{post.title || post.body.slice(0, 90)}</span>
            <time className={s.rowTime}>{stamp(post, now, fmt)}</time>
          </li>)}
        </ul> : <p className={s.muted}>{t("Les publications de l’équipe apparaîtront ici.")}</p>}
      </section>
      <section className={s.box} aria-labelledby="vip-espace-closed">
        <h2 id="vip-espace-closed">{t("Trades clôturés")}</h2>
        {unavailable ? <p className={s.muted}>{t("Performances indisponibles pour le moment.")}</p>
          : closed.length ? <ul className={s.list}>
            {closed.map(row => <li key={row.id} className={s.closed}>
              <span>{row.symbol} · {row.direction === "buy" ? "BUY" : "SELL"}</span>
              <ClosedOutcome row={row} ctx={ctx} />
            </li>)}
          </ul> : <p className={s.muted}>{t("Les trades clôturés apparaîtront ici.")}</p>}
        <Link className={s.link} href="/dashboard/performances-vip">{t("Voir toutes les performances")} →</Link>
      </section>
    </div>
    <AccountSlot tools={accountTools} />
  </div>;
}

function ClosedOutcome({ row, ctx }: { row: ReportRow; ctx: Ctx }) {
  const { t, fmt } = ctx;
  const target = row.outcome.startsWith("TP");
  const label = target ? `${row.outcome} ✓` : row.outcome === "WIN" ? t("Gain") : row.outcome === "LOSS" ? t("Stop") : "BE";
  const tone = row.outcome === "LOSS" ? s.loss : row.outcome === "BE" ? s.be : s.win;
  return <span className={s.outcome}>
    <b className={tone}>{label}</b>
    {row.resultR !== null ? <small>{fmt.r(row.resultR)}</small> : null}
  </span>;
}

function SalleSignal({ ctx, post, expanded, onToggle }: { ctx: Ctx; post: VipPost; expanded: boolean; onToggle: () => void }) {
  const { t, fmt, now } = ctx;
  const order = vipSignalOrder(post);
  const tone = order?.side === "sell" ? s.sigCardSell : order?.side === "buy" ? s.sigCardBuy : s.sigCardNone;
  const levels = levelPairs(post);
  const entry = levels.find(([label]) => label === "Entrée");
  const stop = levels.find(([label]) => label === "Stop");
  const targets = levels.filter(([label]) => label.startsWith("TP"));
  return <article className={`${s.sigCard} ${tone}`}>
    <div className={s.sigCardHead}>
      <div className={s.sigCardTitle}>
        <b className={s.sigCardSymbol}>{post.symbol || t("Signal")}</b>
        {order ? <span className={`${s.pill} ${s[pillTone(order.side)]}`}>{order.label}</span> : null}
      </div>
      <time className={s.sigCardTime}>{isRecent(post, now) ? `${t("publié à")} ${fmt.clock(post.created_at)}` : `${t("publié")} ${fmt.dateTime(post.created_at)}`}</time>
    </div>
    {entry || stop ? <div className={s.sigCardLevels}>
      {entry ? <span>{t("Entrée")} <b>{fmt.price(entry[1])}</b></span> : null}
      {stop ? <span>{t("Stop")} <b className={s.red}>{fmt.price(stop[1])}</b></span> : null}
    </div> : null}
    {targets.length ? <div className={s.sigCardTargets}>{targets.map(([label, value]) => <span key={label}>{label} {fmt.price(value)}</span>)}</div> : null}
    {expanded ? <div className={s.sigCardDetail}>
      {post.body ? <p>{post.body}</p> : null}
      <Link className={s.calc} href={riskSignalHref(post.id)}>{t("Calculer mon lot")} →</Link>
    </div> : null}
    <div>
      <button type="button" className={s.sigCardToggle} aria-expanded={expanded} onClick={onToggle}>{expanded ? t("Masquer le détail") : t("Voir le détail")}</button>
    </div>
  </article>;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={s.kpi}><span>{label}</span><b className={tone}>{value}</b></div>;
}

/* C · Le téléphone: one column of the same publications, the channel chips, and the personal navigation below. */
function Telephone({ ctx }: { ctx: Ctx }) {
  const { t, view, posts, onSelect, stats, alertsOn, alertsAvailable, onEnableAlerts, channelContent, accountTools } = ctx;
  const count = stats.recentSignals.length;
  const chips: { channel: VipChannel; label: string }[] = [
    { channel: "all", label: t("Tout") },
    { channel: "signal", label: count ? `${t("Signaux")} · ${count}` : t("Signaux") },
    { channel: "analysis", label: t("Analyses") },
    { channel: "performance", label: t("Bilans") },
    { channel: "followup", label: t("Suivi des trades") },
    { channel: "partnership", label: t("Partenariats") },
    { channel: "chat", label: t("Discussion") },
    { channel: "favorites", label: t("Mes favoris") },
    { channel: "telegram", label: t("Telegram") },
  ];
  const feedOpen = feedChannels.includes(view);
  const visible = feedPosts(view, posts);
  const newestSignal = newestFirst(posts).find(post => post.category === "signal");
  return <div className={s.phone}>
    <header className={s.phoneHead}>
      <span className={s.mark} aria-hidden="true">IP</span>
      <div className={s.phoneTitle}>
        <h1>{t("Canal VIP")}</h1>
        <small><span aria-hidden="true">● </span>{count ? `${count} ${t(count > 1 ? "signaux ces 24 dernières heures" : "signal ces 24 dernières heures")}` : t("Aucun signal ces 24 dernières heures")}</small>
      </div>
      {alertsAvailable && !alertsOn ? <button type="button" className={s.bell} onClick={onEnableAlerts} aria-label={t("Activer les alertes")} title={t("Activer les alertes")}><Bell size={18} aria-hidden="true" /></button> : null}
    </header>
    <div className={s.phoneChips} role="group" aria-label={t("Rubriques")}>
      {chips.map(item => <button key={item.channel} type="button" aria-pressed={view === item.channel} onClick={() => onSelect(item.channel)}>{item.label}</button>)}
    </div>
    <div className={s.phoneBody}>
      {feedOpen ? (visible.length
        ? <div className={s.phoneStack}>{visible.map(post => <PhoneCard key={post.id} ctx={ctx} post={post} highlighted={post.id === newestSignal?.id} />)}</div>
        : <p className={s.empty}>{t(emptyTitles[view] ?? "Les publications de l’équipe apparaîtront ici.")}</p>) : channelContent ?? <p className={s.empty}>{t("Cette rubrique n’est pas disponible.")}</p>}
      <AccountSlot tools={accountTools} />
    </div>
    <PersonalNav ctx={ctx} className={s.phoneNav} />
  </div>;
}

function PhoneCard({ ctx, post, highlighted }: { ctx: Ctx; post: VipPost; highlighted: boolean }) {
  const { t, fmt, now } = ctx;
  if (post.category !== "signal") {
    return <article className={s.phoneCard} id={`publication-${post.id}`}>
      <div className={`${s.kicker} ${s[categoryTone[post.category]]}`}>{t(categoryNames[post.category])} · {stamp(post, now, fmt)}</div>
      <h2 className={s.phoneHeading}>{post.title}</h2>
      {post.body ? <p className={s.phoneBodyText}>{post.body}</p> : null}
      <div className={s.phoneActions}><Reactions ctx={ctx} post={post} /><Favorite ctx={ctx} post={post} /></div>
    </article>;
  }
  const order = vipSignalOrder(post);
  const levels = levelPairs(post);
  return <article className={highlighted ? `${s.phoneCard} ${s.phoneCardHi}` : s.phoneCard} id={`publication-${post.id}`}>
    <div className={s.phoneRow}>
      <b className={highlighted ? s.phoneSymbol : s.phoneSymbolSmall}>{post.symbol || t("Signal")}</b>
      {order ? <span className={`${s.pill} ${s[pillTone(order.side)]}`}>{order.label}</span> : null}
      <time className={s.phoneTime}>{when(post, now, fmt)}</time>
    </div>
    {levels.length ? <dl className={s.cells} style={{ gridTemplateColumns: `repeat(${levels.length <= 3 ? levels.length : 2}, minmax(0, 1fr))` }}>
      {levels.map(([label, value]) => <div key={label} className={label === "Stop" ? s.levelStop : undefined}><dt>{t(label)}</dt><dd>{fmt.price(value)}</dd></div>)}
    </dl> : null}
    {post.body ? <p className={s.phoneNote}>{post.body}</p> : null}
    <div className={s.phoneActions}>
      <Reactions ctx={ctx} post={post} />
      <Favorite ctx={ctx} post={post} />
      <Link className={s.phoneCalc} href={riskSignalHref(post.id)}>{t("Calculer mon lot")}</Link>
    </div>
  </article>;
}

/** The personal navigation of the maquettes: the space itself, then the member's own pages. */
function PersonalNav({ ctx, className }: { ctx: Ctx; className: string }) {
  const { t, onSelect } = ctx;
  return <nav className={className} aria-label={t("Navigation")}>
    <button type="button" aria-current="page" onClick={() => onSelect("all")}>{t("Canal VIP")}</button>
    <Link href="/dashboard/journal">{t("Journal")}</Link>
    <Link href="/dashboard/comptes">{t("Comptes")}</Link>
    <Link href="/dashboard/profil">{t("Profil")}</Link>
  </nav>;
}

/** Account tools sit at the foot of the presentation that is open, in one block. */
function AccountSlot({ tools }: { tools: ReactNode }) {
  return tools ? <div className={s.account}>{tools}</div> : null;
}
