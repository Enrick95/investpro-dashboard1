"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import styles from "../clip.module.css";
import ClipLogin from "../ClipLogin";
import { ClipApiError, clipApi, clipSignOut } from "@/lib/clip/client";
import {
  CLIP_PUBLIC_URL,
  ENRICK_WHATSAPP_LABEL,
  MIN_PAYOUT,
  PAYOUT_LABEL,
  PAYOUT_METHODS,
  PLATFORM_LABEL,
  PLATFORM_SHORT,
  TRACKED_LINK_TARGET,
  clipAmount,
  clipState,
  cycleFor,
  daysUntil,
  formatEuro,
  formatInt,
  freezeAt,
  num,
  round2,
  summarize,
  tiktokHandleFromUrl,
  trackedLink,
  type CampaignRow,
  type ClipPlatform,
  type ClipRow,
  type MoneySummary,
  type PayoutMethod,
  type PayoutRow,
} from "@/lib/clip/rules";
import { ago, compact, dateRange, dayMonth, firstNameOf, initialsOf, longDay, maskDetails, maskPhone, monthName, ordinal, pct, plural, shortDay } from "@/lib/clip/format";
import { AdminShell, type AdminSection, type NavCounts } from "../views/admin/Shell";
import { Flash } from "../views/admin/kit";
import { AdminOverview, type AlertRow, type CampaignCardData, type ChartData, type OverviewVals } from "../views/admin/Overview";
import { AdminClippers, type ClipperFilter, type ClipperStatus, type ClippersVals, type FicheData, type StatusChip } from "../views/admin/Clippers";
import { AdminAccounts, type AccountFilter, type AccountsVals } from "../views/admin/Accounts";
import { AdminReview, type ReviewCurrent, type ReviewTab, type ReviewVals } from "../views/admin/Review";
import { AdminCampaigns, type AdminCampaignFilter, type AdminCampaignsVals, type CampaignFormData } from "../views/admin/Campaigns";
import { AdminCandidates, type CandDecision, type CandTab, type CandidatesVals } from "../views/admin/Candidates";
import { AdminPayments, type PayFilter, type PayRowData, type PaymentsVals } from "../views/admin/Payments";
import { AdminRules, AdminSettings, AdminWhatsApp, type RulesVals, type SettingsVals, type WhatsAppVals } from "../views/admin/More";

type Clipper = {
  id: string;
  user_id: string;
  ref: string;
  display_name: string;
  whatsapp: string | null;
  telegram: string | null;
  tracking_code: string;
  status: ClipperStatus;
  payout_method: PayoutMethod | null;
  payout_details: string | null;
  admin_note: string | null;
  created_at: string;
};
type Account = { id: string; clipper_id: string; platform: ClipPlatform; handle: string; followers: number | null; verified: boolean; created_at: string };
type Candidate = {
  id: string;
  user_id: string | null;
  email: string | null;
  display_name: string;
  whatsapp: string;
  telegram: string | null;
  accounts: string;
  availability: string;
  sample_url: string | null;
  message: string | null;
  source: string;
  status: "new" | "accepted" | "refused";
  reviewed_at: string | null;
  created_at: string;
};
type Snapshot = { clip_id: string; views: number | string; recorded_at: string };
type ClickStat = { clipper_id: string; total: number | string; last30: number | string };
type Data = { campaigns: CampaignRow[]; clippers: Clipper[]; accounts: Account[]; clips: ClipRow[]; candidates: Candidate[]; payouts: PayoutRow[]; snapshots: Snapshot[]; clicks: ClickStat[] };
type LoadState = { phase: "loading" } | { phase: "denied"; message: string; login: boolean } | { phase: "error"; message: string } | { phase: "ready"; data: Data };
type FlashState = { kind: "ok" | "error"; text: string } | null;
type Phase = "live" | "soon" | "ended" | "draft";
type Stat = {
  c: Clipper;
  accounts: Account[];
  clips: ClipRow[];
  live: ClipRow[];
  views30: number;
  viewsP: number;
  clips30: number;
  clipsP: number;
  lastAt: string | null;
  idleDays: number;
  idle: boolean;
  refused30: ClipRow[];
  review: number;
  money: MoneySummary;
  projected: number;
  clicks: { total: number; last30: number };
  chip: StatusChip;
  mainHandle: string | null;
};

const DAY = 86_400_000;
const IDLE_DAYS = 6;
const SECTIONS: AdminSection[] = ["overview", "clippers", "accounts", "review", "campaigns", "candidates", "payments", "whatsapp", "rules", "settings"];
const REASONS = ["Promesse de gains", "Hors brief de la campagne", "Qualité insuffisante", "Compte qui n'appartient pas au clippeur", "Clip déjà soumis (doublon)", "Vues suspectes"];
const DEFAULT_RULES = { rate_per_1000: 1, min_views: 8000, max_per_clip: 150, vip_bonus: 20 };

function sectionFromHash(): AdminSection {
  const key = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  return (SECTIONS as string[]).includes(key) ? (key as AdminSection) : "overview";
}

function clipViews(clip: ClipRow): number {
  return clip.frozen_views !== null && clip.frozen_views !== undefined ? num(clip.frozen_views) : num(clip.views);
}

function waLink(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Numéro du jour local (fuseau du navigateur). */
function dayNumber(time: number): number {
  const date = new Date(time);
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
}

function dayIso(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

function ageShort(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} j`;
}

function dayLabel(iso: string, now: Date): string {
  const diff = dayNumber(now.getTime()) - dayNumber(new Date(iso).getTime());
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  return dayMonth(dayIso(dayNumber(new Date(iso).getTime())));
}

function rangeShort(start: string, end: string): string {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${sameMonth ? ordinal(Number(start.slice(8, 10))) : dayMonth(start)} → ${dayMonth(end)}`;
}

function euro(value: number): string {
  return formatEuro(value);
}

function euroRound(value: number): string {
  return `${formatInt(value)} €`;
}

function trendOf(current: number, previous: number, period: number): { text: string; up: boolean } | null {
  if (previous <= 0) return null;
  const change = ((current - previous) / previous) * 100;
  return { text: `${change >= 0 ? "+" : "−"}${Math.round(Math.abs(change))} % vs ${period} j avant`, up: change >= 0 };
}

function niceStep(value: number): number {
  if (value <= 1) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return Math.max(1, step * exp);
}

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.hostname.replace(/^www\.|^m\.|^vm\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function profileUrl(account: Pick<Account, "platform" | "handle">): string {
  if (account.platform === "tiktok") return `https://www.tiktok.com/@${account.handle}`;
  if (account.platform === "instagram") return `https://www.instagram.com/${account.handle}`;
  return `https://www.youtube.com/@${account.handle}`;
}

function campaignPhase(campaign: CampaignRow, todayIso: string): Phase {
  if (campaign.status === "draft") return "draft";
  if (campaign.status === "ended" || campaign.ends_on < todayIso) return "ended";
  if (campaign.starts_on > todayIso) return "soon";
  return "live";
}

/**
 * Vues gagnées par jour à partir des relevés (clip_view_snapshots). Chaque hausse est répartie
 * entre le relevé précédent (ou la publication) et ce relevé ; une correction à la baisse
 * plafonne les relevés plus anciens.
 */
function viewGains(clips: ClipRow[], snapshots: Snapshot[], startDay: number, days: number): { daily: number[]; byClip: Map<string, number> } {
  const daily = new Array<number>(days).fill(0);
  const byClip = new Map<string, number>();
  const grouped = new Map<string, { time: number; views: number }[]>();
  for (const snapshot of snapshots) {
    const list = grouped.get(snapshot.clip_id) ?? [];
    list.push({ time: new Date(snapshot.recorded_at).getTime(), views: num(snapshot.views) });
    grouped.set(snapshot.clip_id, list);
  }
  const lastDay = startDay + days - 1;
  for (const clip of clips) {
    if (clip.status === "rejected") continue;
    let points = (grouped.get(clip.id) ?? []).sort((a, b) => a.time - b.time);
    if (!points.length) {
      const views = clipViews(clip);
      if (views <= 0) continue;
      points = [{ time: new Date(clip.views_updated_at ?? clip.published_at).getTime(), views }];
    }
    for (let index = points.length - 2; index >= 0; index -= 1) points[index] = { ...points[index], views: Math.min(points[index].views, points[index + 1].views) };
    let prevTime = new Date(clip.published_at).getTime();
    let prevViews = 0;
    let inWindow = 0;
    for (const point of points) {
      const delta = point.views - prevViews;
      if (delta > 0) {
        const from = dayNumber(Math.min(prevTime, point.time));
        const to = dayNumber(point.time);
        const share = delta / Math.max(1, to - from + 1);
        for (let day = Math.max(from, startDay); day <= Math.min(to, lastDay); day += 1) {
          daily[day - startDay] += share;
          inWindow += share;
        }
        prevViews = point.views;
      }
      prevTime = Math.max(prevTime, point.time);
    }
    if (inWindow > 0) byClip.set(clip.id, inWindow);
  }
  return { daily, byClip };
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function emptyForm(todayIso: string): CampaignFormData {
  const end = new Date(new Date(`${todayIso}T12:00:00Z`).getTime() + 29 * DAY).toISOString().slice(0, 10);
  return {
    id: null,
    title: "",
    platforms: "TikTok · Shorts · Reels",
    starts_on: todayIso,
    ends_on: end,
    quota_per_clipper: "10",
    rate_per_1000: String(DEFAULT_RULES.rate_per_1000),
    min_views: String(DEFAULT_RULES.min_views),
    max_per_clip: String(DEFAULT_RULES.max_per_clip),
    vip_bonus: String(DEFAULT_RULES.vip_bonus),
    status: "active",
    rushes_url: "",
    brief: "",
    forbidden: "Promesses de gains, montants gagnés en accroche, logos d'autres créateurs.",
  };
}

export default function ClipAdmin() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  const load = useCallback(async () => {
    try {
      const data = await clipApi<Data>("/api/clip/admin");
      setState({ phase: "ready", data: { ...data, snapshots: data.snapshots ?? [], clicks: data.clicks ?? [] } });
    } catch (error) {
      if (error instanceof ClipApiError && (error.status === 401 || error.status === 403)) setState({ phase: "denied", message: error.message, login: error.status === 401 });
      else setState({ phase: "error", message: error instanceof Error ? error.message : "Chargement impossible." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.phase === "loading") {
    return <div className={styles.page}><div className={styles.center}><Loader2 size={28} className={styles.spin} aria-hidden="true" /><span className={styles.muted}>Chargement de l&apos;espace admin…</span></div></div>;
  }
  if (state.phase === "denied") {
    const retry = () => { setState({ phase: "loading" }); void load(); };
    return (
      <div className={styles.page}>
        <div className={styles.app}>
          <main className={styles.main} style={{ paddingTop: 32, paddingBottom: 48 }}>
            <h1 className={styles.h1}>Admin InvestPro Clip</h1>
            {state.login ? (
              <ClipLogin title="Connexion admin" intro="Connecte-toi avec ton compte administrateur." joinLink={false} onDone={retry} />
            ) : (
              <div className={styles.card} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p className={styles.soft} style={{ margin: 0 }}>{state.message}</p>
                <button type="button" className={`${styles.btn} ${styles.btnBlock}`} onClick={async () => { await clipSignOut(); retry(); }}>Changer de compte</button>
                <Link href="/clip" className={`${styles.btnGhost} ${styles.btnBlock}`}>Retour à l&apos;espace clippeurs</Link>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }
  if (state.phase === "error") {
    return <div className={styles.page}><div className={styles.center}><p className={styles.error}>{state.message}</p><button type="button" className={styles.btnGhost} onClick={() => { setState({ phase: "loading" }); void load(); }}>Réessayer</button></div></div>;
  }
  return <AdminSpace data={state.data} reload={load} />;
}

export function AdminSpace({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [section, setSection] = useState<AdminSection>(sectionFromHash);
  const [flash, setFlash] = useState<FlashState>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [clipSearch, setClipSearch] = useState("");
  const [clipFilter, setClipFilter] = useState<ClipperFilter>("all");
  const [clipSel, setClipSel] = useState<string | null>(null);
  const [clipAll, setClipAll] = useState(false);
  const [accFilter, setAccFilter] = useState<AccountFilter | null>(null);
  const [accSearch, setAccSearch] = useState("");
  const [reviewTab, setReviewTab] = useState<ReviewTab>("queue");
  const [reviewSel, setReviewSel] = useState<string | null>(null);
  const [decided, setDecided] = useState<Record<string, "ok" | "ko">>({});
  const [viewsFilter, setViewsFilter] = useState<"counting" | "all">("counting");
  const [campFilter, setCampFilter] = useState<AdminCampaignFilter | null>(null);
  const [form, setForm] = useState<CampaignFormData | null>(null);
  const [candTab, setCandTab] = useState<CandTab>("new");
  const [candSel, setCandSel] = useState<string | null>(null);
  const [candDecided, setCandDecided] = useState<Record<string, Exclude<CandDecision, null>>>({});
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [payFocus, setPayFocus] = useState<string | null>(null);

  useEffect(() => {
    setSection(sectionFromHash());
    const sync = () => setSection(sectionFromHash());
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const navigate = useCallback((next: AdminSection) => {
    if (window.location.hash !== `#${next}`) window.history.pushState(null, "", `#${next}`);
    setSection(next);
    window.scrollTo({ top: 0 });
  }, []);

  const post = useCallback(async <T,>(body: Record<string, unknown>): Promise<T> => clipApi<T>("/api/clip/admin", { method: "POST", body }), []);

  const act = useCallback(async (body: Record<string, unknown>, success: string | null): Promise<boolean> => {
    setBusy(true);
    try {
      await post(body);
      if (success) setFlash({ kind: "ok", text: success });
      await reload();
      return true;
    } catch (error) {
      setFlash({ kind: "error", text: error instanceof Error ? error.message : "Action impossible." });
      return false;
    } finally {
      setBusy(false);
    }
  }, [post, reload]);

  const copy = useCallback(async (value: string, key: string) => {
    if (await copyText(value)) {
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 2200);
    } else {
      setFlash({ kind: "error", text: `Copie impossible sur cet appareil. À copier à la main : ${value}` });
    }
  }, []);

  const now = useMemo(() => new Date(), [data]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const host = origin.replace(/^https?:\/\//, "");
  const joinUrl = `${origin}/clip/rejoindre`;
  const today = dayNumber(now.getTime());
  const todayIso = dayIso(today);
  const cycle = cycleFor(now);

  const base = useMemo(() => {
    const campaignsById = new Map<string, CampaignRow>(data.campaigns.map((campaign): [string, CampaignRow] => [campaign.id, campaign]));
    const clippersById = new Map<string, Clipper>(data.clippers.map((clipper): [string, Clipper] => [clipper.id, clipper]));
    const clipsById = new Map<string, ClipRow>(data.clips.map((clip): [string, ClipRow] => [clip.id, clip]));
    const accountsBy = new Map<string, Account[]>();
    for (const account of data.accounts) accountsBy.set(account.clipper_id, [...(accountsBy.get(account.clipper_id) ?? []), account]);
    const clipsBy = new Map<string, ClipRow[]>();
    for (const clip of data.clips) if (clip.clipper_id) clipsBy.set(clip.clipper_id, [...(clipsBy.get(clip.clipper_id) ?? []), clip]);
    const clicksBy = new Map<string, { total: number; last30: number }>(data.clicks.map((row): [string, { total: number; last30: number }] => [row.clipper_id, { total: num(row.total), last30: num(row.last30) }]));
    const clipperByUser = new Map<string, Clipper>(data.clippers.map((clipper): [string, Clipper] => [clipper.user_id, clipper]));
    return { campaignsById, clippersById, clipsById, accountsBy, clipsBy, clicksBy, clipperByUser };
  }, [data]);

  const gains30 = useMemo(() => viewGains(data.clips, data.snapshots, today - 29, 30), [data, today]);
  const gainsP = useMemo(() => (period === 30 ? gains30 : viewGains(data.clips, data.snapshots, today - period + 1, period)), [data, today, period, gains30]);
  const gainsPrev = useMemo(() => viewGains(data.clips, data.snapshots, today - 2 * period + 1, period), [data, today, period]);

  const stats = useMemo<Stat[]>(() => {
    const sumBy = (gains: Map<string, number>, clips: ClipRow[]) => clips.reduce((sum, clip) => sum + (gains.get(clip.id) ?? 0), 0);
    return data.clippers.map((c) => {
      const accounts = base.accountsBy.get(c.id) ?? [];
      const clips = base.clipsBy.get(c.id) ?? [];
      const live = clips.filter((clip) => clip.status !== "rejected");
      const publishedSince = (days: number) => live.filter((clip) => dayNumber(new Date(clip.published_at).getTime()) > today - days).length;
      const lastAt = clips.reduce<string | null>((latest, clip) => (!latest || clip.created_at > latest ? clip.created_at : latest), null);
      const idleDays = Math.max(0, today - dayNumber(new Date(lastAt ?? c.created_at).getTime()));
      const idle = c.status === "active" && idleDays >= IDLE_DAYS;
      const refused30 = clips.filter((clip) => clip.status === "rejected" && now.getTime() - new Date(clip.reviewed_at ?? clip.created_at).getTime() <= 30 * DAY);
      const money = summarize(clips, data.campaigns, now);
      const main = [...accounts].sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1))[0];
      const chip: StatusChip = c.status === "paused"
        ? { tone: "bad", label: "En pause" }
        : c.status === "test"
          ? { tone: "neutral", label: `En test · ${plural(live.length, "clip")}` }
          : idle
            ? { tone: "warn", icon: "clock", label: `Inactif · ${idleDays} j` }
            : { tone: "ok", label: "Actif" };
      return {
        c,
        accounts,
        clips,
        live,
        views30: sumBy(gains30.byClip, clips),
        viewsP: sumBy(gainsP.byClip, clips),
        clips30: publishedSince(30),
        clipsP: publishedSince(period),
        lastAt,
        idleDays,
        idle,
        refused30,
        review: money.review,
        money,
        projected: round2(money.acquired + money.pending),
        clicks: base.clicksBy.get(c.id) ?? { total: 0, last30: 0 },
        chip,
        mainHandle: main ? main.handle : null,
      };
    });
  }, [data, base, gains30, gainsP, today, now, period]);

  const statById = useMemo(() => new Map<string, Stat>(stats.map((stat): [string, Stat] => [stat.c.id, stat])), [stats]);
  const reviewClips = useMemo(() => data.clips.filter((clip) => clip.status === "review").sort((a, b) => a.created_at.localeCompare(b.created_at)), [data.clips]);
  const newCandidates = data.candidates.filter((candidate) => candidate.status === "new");
  const liveCampaigns = data.campaigns.filter((campaign) => campaignPhase(campaign, todayIso) === "live").sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const mainCampaign = liveCampaigns[0] ?? data.campaigns[0] ?? null;
  const rules = mainCampaign
    ? { rate: num(mainCampaign.rate_per_1000), minViews: num(mainCampaign.min_views), cap: num(mainCampaign.max_per_clip), vip: num(mainCampaign.vip_bonus) }
    : { rate: DEFAULT_RULES.rate_per_1000, minViews: DEFAULT_RULES.min_views, cap: DEFAULT_RULES.max_per_clip, vip: DEFAULT_RULES.vip_bonus };
  const workforce = Math.max(1, data.clippers.filter((clipper) => clipper.status !== "paused").length);
  const countingClips = data.clips.filter((clip) => clip.status === "approved" && clipState(clip) === "counting");
  const staleViews = countingClips.filter((clip) => !clip.views_updated_at || now.getTime() - new Date(clip.views_updated_at).getTime() > DAY);
  const unverified = data.accounts.filter((account) => !account.verified);

  const msg = {
    welcome: (first: string) => `Salut ${first} ! Bienvenue dans l'équipe InvestPro Clip.\nTon espace clippeur : ${origin}/clip\nConnecte-toi avec l'e-mail et le mot de passe choisis à l'inscription, ajoute tes comptes et lis la charte avant ton premier clip.`,
    test: (first: string) => `Salut ${first} ! On démarre par une période de test : publie quelques clips sur la campagne en cours et je regarde ton montage.\nTon espace clippeur : ${origin}/clip (même e-mail et mot de passe qu'à l'inscription).`,
    refused: (first: string) => `Salut ${first}, merci pour ta candidature ! Je ne peux pas te prendre pour le moment, je te recontacte dès qu'une place se libère.`,
    example: (first: string) => `Salut ${first} ! Merci pour ta candidature. Tu peux m'envoyer un exemple de montage que tu as déjà fait ?`,
    link: (first: string) => `Salut ${first} ! Voici le lien pour t'inscrire comme clippeur : ${joinUrl}`,
    idle: (first: string, days: number) => `Salut ${first} ! Ça fait ${days} jours sans nouveau clip.${mainCampaign && campaignPhase(mainCampaign, todayIso) === "live" ? ` La campagne « ${mainCampaign.title} » est ouverte,` : ""} tu peux reprendre quand tu veux. Besoin d'un coup de main ?`,
    ok: (first: string, title: string, until: string) => `Salut ${first} ! Ton clip « ${title} » est validé. Ses vues comptent jusqu'au ${until}, ensuite il entre dans ton prochain paiement.`,
    ko: (first: string, title: string, reason: string) => `Salut ${first}, ton clip « ${title} » n'est pas validé : ${reason.toLowerCase()}. Tu peux en proposer un autre en suivant la charte.`,
    password: (first: string, password: string) => `Salut ${first} ! Voici ton mot de passe provisoire pour l'espace clippeurs : ${password}\nConnecte-toi sur ${origin}/clip puis change-le dans ton profil.`,
    method: (first: string, amount: string) => `Salut ${first} ! Tu as ${amount} acquis : ajoute ton moyen de paiement dans ton profil (${origin}/clip#profil) pour être payé le ${dayMonth(cycle.payDate)} !`,
  };

  function campaignCard(campaign: CampaignRow): CampaignCardData {
    const phase = campaignPhase(campaign, todayIso);
    const clips = data.clips.filter((clip) => clip.campaign_id === campaign.id && clip.status !== "rejected");
    const approved = clips.filter((clip) => clip.status === "approved");
    const participants = new Set(clips.map((clip) => clip.clipper_id)).size;
    const target = Math.max(1, campaign.quota_per_clipper * workforce);
    const views = approved.reduce((sum, clip) => sum + clipViews(clip), 0);
    const engaged = approved.reduce((sum, clip) => sum + clipAmount(clipViews(clip), campaign), 0);
    const startsIn = daysUntil(campaign.starts_on, now);
    const chip = phase === "live"
      ? { tone: "ok" as const, label: "En cours", dot: true }
      : phase === "soon"
        ? { tone: "neutral" as const, label: startsIn <= 1 ? "Demain" : `Le ${dayMonth(campaign.starts_on)}` }
        : phase === "draft"
          ? { tone: "warn" as const, label: "Brouillon" }
          : { tone: "neutral" as const, label: "Terminée" };
    return {
      id: campaign.id,
      meta: `${campaign.platforms} · ${rangeShort(campaign.starts_on, campaign.ends_on)}`,
      chip,
      title: campaign.title,
      left: `${clips.length} / ${target} clips`,
      right: `${pct(clips.length, target)} %`,
      pct: pct(clips.length, target),
      minis: [
        { value: compact(views), label: "vues" },
        { value: String(participants), label: participants > 1 ? "clippeurs" : "clippeur" },
        { value: `≈ ${euroRound(engaged)}`, label: "engagés" },
      ],
    };
  }

  function openCandidate(id: string) {
    setCandTab("new");
    setCandSel(id);
    navigate("candidates");
  }

  function openClipper(id: string) {
    setClipFilter("all");
    setClipSearch("");
    setClipSel(id);
    navigate("clippers");
  }

  async function decideCandidate(candidate: Candidate, decision: Exclude<CandDecision, null>) {
    const body = decision === "refused" ? { action: "refuse_candidate", id: candidate.id } : { action: "accept_candidate", id: candidate.id, status: decision };
    const ok = await act(body, decision === "refused" ? `Candidature de ${candidate.display_name} refusée.` : decision === "test" ? `${candidate.display_name} est en période de test.` : `${candidate.display_name} est accepté.`);
    if (ok) {
      setCandDecided((current) => ({ ...current, [candidate.id]: decision }));
      setCandSel(candidate.id);
    }
    return ok;
  }

  // ——— Vue d'ensemble ———
  function buildOverview(): OverviewVals {
    const startDay = today - period + 1;
    const points = gainsP.daily.map((value) => Math.round(value));
    const totalP = points.reduce((sum, value) => sum + value, 0);
    const totalPrev = gainsPrev.daily.reduce((sum, value) => sum + value, 0);
    const clipsIn = (from: number, to: number) => data.clips.filter((clip) => clip.status !== "rejected" && dayNumber(new Date(clip.published_at).getTime()) >= from && dayNumber(new Date(clip.published_at).getTime()) <= to).length;
    const clipsP = clipsIn(startDay, today);
    const clipsPrev = clipsIn(startDay - period, startDay - 1);
    const maxVal = Math.max(0, ...points);
    const step = niceStep(maxVal / 3);
    const peakIndex = maxVal > 0 ? points.indexOf(maxVal) : -1;
    const chart: ChartData = {
      points,
      labels: [0, 1, 2, 3, 4].map((i) => {
        const index = Math.round((i * (period - 1)) / 4);
        return { text: dayMonth(dayIso(startDay + index)), at: period > 1 ? (index / (period - 1)) * 100 : 0 };
      }),
      range: dateRange(dayIso(startDay), todayIso),
      peak: peakIndex >= 0 ? { index: peakIndex, value: `${compact(maxVal)} vues`, day: shortDay(dayIso(startDay + peakIndex)) } : null,
      ticks: [0, 1, 2, 3].map((i) => ({ label: compact(step * i), value: step * i })),
      scaleMax: step * 3.5,
    };
    const byPlatform: Record<ClipPlatform, number> = { tiktok: 0, instagram: 0, youtube: 0 };
    const clipsByPlatform: Record<ClipPlatform, number> = { tiktok: 0, instagram: 0, youtube: 0 };
    for (const [id, value] of gainsP.byClip) {
      const clip = base.clipsById.get(id);
      if (clip) byPlatform[clip.platform] += value;
    }
    for (const clip of data.clips) if (clip.status !== "rejected" && dayNumber(new Date(clip.published_at).getTime()) >= startDay) clipsByPlatform[clip.platform] += 1;
    const totalPlatforms = byPlatform.tiktok + byPlatform.instagram + byPlatform.youtube;
    const platforms = (([["tiktok", "TikTok"], ["youtube", "YouTube Shorts"], ["instagram", "Instagram Reels"]] as [ClipPlatform, string][])
      .map(([key, label]) => ({ label, value: `${compact(byPlatform[key])} vues · ${plural(clipsByPlatform[key], "clip")}`, pct: pct(byPlatform[key], totalPlatforms), raw: byPlatform[key] }))
      .sort((a, b) => b.raw - a.raw))
      .map(({ label, value, pct: share }) => ({ label, value, pct: share }));

    const active = data.clippers.filter((clipper) => clipper.status === "active").length;
    const testing = data.clippers.filter((clipper) => clipper.status === "test").length;
    const idleCount = stats.filter((stat) => stat.idle).length;
    const acquired = round2(stats.reduce((sum, stat) => sum + stat.money.acquired, 0));
    const projected = round2(stats.reduce((sum, stat) => sum + stat.projected, 0));
    const payable = stats.filter((stat) => stat.projected > 0).length;
    const lastUpdate = data.clips.reduce<string | null>((latest, clip) => (clip.views_updated_at && (!latest || clip.views_updated_at > latest) ? clip.views_updated_at : latest), null);

    const leaders = stats
      .filter((stat) => stat.c.status !== "paused")
      .sort((a, b) => b.viewsP - a.viewsP || b.clipsP - a.clipsP || a.c.created_at.localeCompare(b.c.created_at))
      .slice(0, 6)
      .map((stat, index) => ({
        id: stat.c.id,
        rank: index + 1,
        ini: initialsOf(stat.c.display_name),
        name: stat.c.display_name,
        handle: stat.mainHandle ? `@${stat.mainHandle}` : stat.c.ref,
        accounts: stat.accounts.length,
        clips: stat.clipsP,
        views: compact(stat.viewsP),
        eng: "—",
        last: stat.lastAt ? ago(stat.lastAt, now) : "aucun",
        due: euro(stat.projected),
        status: stat.chip,
      }));

    const alerts: AlertRow[] = [];
    if (reviewClips.length) {
      alerts.push({ key: "review", tone: "warn", icon: "film", title: `${plural(reviewClips.length, "clip")} à valider`, text: `Le plus ancien attend depuis ${ageShort(reviewClips[0].created_at, now)}. Ses vues ne comptent qu'une fois validé.`, cta: { label: "Valider", primary: true, onClick: () => { setReviewTab("queue"); navigate("review"); } } });
    }
    if (staleViews.length) {
      alerts.push({ key: "views", tone: "warn", icon: "eye", title: `${plural(staleViews.length, "clip")} sans vues à jour`, text: "Relève les vues sur TikTok, Instagram ou YouTube avant qu'elles soient figées à J+7.", cta: { label: "Saisir les vues", onClick: () => { setReviewTab("views"); setViewsFilter("counting"); navigate("review"); } } });
    }
    for (const stat of stats.filter((item) => item.idle).sort((a, b) => b.idleDays - a.idleDays).slice(0, 2)) {
      const first = firstNameOf(stat.c.display_name);
      const href = waLink(stat.c.whatsapp, msg.idle(first, stat.idleDays));
      alerts.push({ key: `idle-${stat.c.id}`, tone: "bad", icon: "clock", title: stat.lastAt ? `${stat.c.display_name} n'a rien publié depuis ${stat.idleDays} jours` : `${stat.c.display_name} n'a encore rien publié`, text: "Une relance sur WhatsApp suffit souvent.", cta: href ? { label: "Relancer", icon: "chat", href } : { label: "Voir", onClick: () => openClipper(stat.c.id) } });
    }
    if (unverified.length) {
      alerts.push({ key: "accounts", tone: "warn", icon: "shield", title: `${plural(unverified.length, "compte")} à vérifier`, text: "Vérifie que le lien traqué est bien en bio avant de valider leurs clips.", cta: { label: "Vérifier", onClick: () => { setAccFilter("todo"); navigate("accounts"); } } });
    }
    const noMethod = stats.filter((stat) => stat.money.acquired > 0 && !stat.c.payout_method);
    if (noMethod.length) {
      const one = noMethod.length === 1 ? noMethod[0] : null;
      const href = one ? waLink(one.c.whatsapp, msg.method(firstNameOf(one.c.display_name), euro(one.money.acquired))) : null;
      alerts.push({ key: "method", tone: "warn", icon: "wallet", title: one ? `${one.c.display_name} n'a pas de moyen de paiement` : `${noMethod.length} clippeurs sans moyen de paiement`, text: "Ils ont de l'argent acquis mais n'ont pas indiqué où être payés.", cta: href ? { label: "Prévenir", icon: "chat", href } : { label: "Voir", onClick: () => { setPayFilter("check"); navigate("payments"); } } });
    }
    if (newCandidates.length) {
      alerts.push({ key: "cands", tone: "ok", icon: "user", title: `${plural(newCandidates.length, "nouvelle candidature", "nouvelles candidatures")}`, text: "Accepte, mets en test ou refuse, puis envoie le message sur WhatsApp.", cta: { label: "Voir", onClick: () => { setCandTab("new"); navigate("candidates"); } } });
    }
    if (acquired > 0 && daysUntil(cycle.payDate, now) <= 2) {
      alerts.push({ key: "pay", tone: "ok", icon: "wallet", title: `Versement le ${dayMonth(cycle.payDate)}`, text: `${euro(acquired)} acquis à verser.`, cta: { label: "Préparer", primary: true, onClick: () => navigate("payments") } });
    }

    const campaigns = data.campaigns.filter((campaign) => ["live", "soon"].includes(campaignPhase(campaign, todayIso)));
    const shown = (campaigns.length ? campaigns : data.campaigns).slice(0, 3);

    return {
      dateLine: `${longDay(todayIso)} · ${lastUpdate ? `vues mises à jour ${ago(lastUpdate, now)}` : "aucune vue saisie pour l'instant"}`,
      clipperView: leaders[0] ? `/clip/apercu?c=${leaders[0].id}` : data.clippers[0] ? `/clip/apercu?c=${data.clippers[0].id}` : "/clip",
      period,
      setPeriod,
      kpis: {
        views: compact(totalP),
        viewsTrend: trendOf(totalP, totalPrev, period),
        viewsSub: totalP ? "vues gagnées sur la période" : "saisis les vues des clips validés",
        clips: formatInt(clipsP),
        clipsTrend: trendOf(clipsP, clipsPrev, period),
        clipsSub: `publiés sur ${period} jours`,
        active: String(active),
        activeTotal: ` / ${data.clippers.length}`,
        activeSub: `${testing} en test · ${idleCount} inactif${idleCount > 1 ? "s" : ""}`,
        accounts: String(data.accounts.length),
        accountsSub: unverified.length ? `${unverified.length} à vérifier` : data.accounts.length ? "tous vérifiés" : "aucun compte ajouté",
        toPayLabel: `À payer le ${dayMonth(cycle.payDate)}`,
        toPay: euro(projected),
        toPaySub: payable ? `${plural(payable, "clippeur")} · ${euro(acquired)} déjà acquis` : "rien à payer pour l'instant",
      },
      chart,
      platforms,
      clicks: formatInt(data.clicks.reduce((sum, row) => sum + num(row.last30), 0)),
      campaigns: shown.map(campaignCard),
      leaders,
      leadersSub: `Sur ${period} jours · trié par vues`,
      leadersMore: "Voir tous les clippeurs",
      alerts,
      candidates: newCandidates.slice(0, 4).map((candidate) => ({
        id: candidate.id,
        ini: initialsOf(candidate.display_name),
        name: candidate.display_name,
        phone: maskPhone(candidate.whatsapp),
        when: ago(candidate.created_at, now),
        msg: candidate.message ? `« ${candidate.message.slice(0, 90)}${candidate.message.length > 90 ? "…" : ""} »` : candidate.accounts.split("\n")[0].slice(0, 90),
        info: `Formulaire rempli · ${candidate.availability}`,
      })),
      candidatesNew: newCandidates.length,
      inviteCopied: copied === "join",
      busy,
      onInvite: () => void copy(joinUrl, "join"),
      onNewCampaign: () => { setForm(emptyForm(todayIso)); navigate("campaigns"); },
      onCampaign: (id) => {
        const campaign = base.campaignsById.get(id);
        if (campaign) setCampFilter(campaignPhase(campaign, todayIso));
        navigate("campaigns");
      },
      onClippers: () => navigate("clippers"),
      onCandidates: () => { setCandTab("new"); navigate("candidates"); },
      accept: (id) => {
        const candidate = data.candidates.find((item) => item.id === id);
        if (!candidate) return;
        void decideCandidate(candidate, "test").then((ok) => { if (ok) { setCandTab("new"); navigate("candidates"); } });
      },
      openCandidate,
    };
  }

  // ——— Clippeurs ———
  function buildFiche(stat: Stat): FicheData {
    const { c } = stat;
    const first = firstNameOf(c.display_name);
    const lastPayout = data.payouts.filter((payout) => payout.clipper_id === c.id).sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0];
    const lastRefusal = [...stat.refused30].sort((a, b) => (b.reviewed_at ?? b.created_at).localeCompare(a.reviewed_at ?? a.created_at))[0];
    const rhythm = stat.clips30 ? 30 / stat.clips30 : 0;
    return {
      id: c.id,
      ini: initialsOf(c.display_name),
      name: c.display_name,
      firstName: first,
      status: stat.chip,
      statusValue: c.status,
      meta: `Réf. ${c.ref} · depuis le ${dayMonth(c.created_at)}${c.whatsapp ? ` · ${maskPhone(c.whatsapp)}` : ""}${c.telegram ? ` · @${c.telegram}` : ""}`,
      wa: waLink(c.whatsapp),
      link: trackedLink(origin, c.tracking_code),
      previewHref: `/clip/apercu?c=${c.id}`,
      stats: [
        { value: compact(stat.views30), label: "vues · 30 j" },
        { value: String(stat.clips30), label: "clips · 30 j" },
        { value: formatInt(stat.clicks.last30), label: "clics · 30 j" },
        { value: euro(stat.projected), label: `prévu le ${dayMonth(cycle.payDate)}`, gold: true },
      ],
      accounts: stat.accounts.map((account) => {
        const followers = account.followers !== null ? `${compact(account.followers)} abonnés` : "abonnés non renseignés";
        return { id: account.id, badge: PLATFORM_SHORT[account.platform], handle: account.handle, url: profileUrl(account), sub: account.verified ? `${PLATFORM_LABEL[account.platform]} · ${followers}` : `${followers} · à vérifier`, verified: account.verified };
      }),
      campaigns: liveCampaigns.map((campaign) => {
        const done = stat.live.filter((clip) => clip.campaign_id === campaign.id).length;
        return { title: campaign.title, progress: `${done} / ${campaign.quota_per_clipper} clips`, pct: pct(done, campaign.quota_per_clipper) };
      }),
      serious: [
        stat.refused30.length
          ? { label: "Clips refusés sur 30 jours", value: `${stat.refused30.length}${lastRefusal?.reject_reason ? ` · ${lastRefusal.reject_reason.toLowerCase()}` : ""}`, tone: stat.refused30.length > 1 ? "warn" as const : undefined }
          : { label: "Clips refusés sur 30 jours", value: "aucun", tone: "ok" as const },
        { label: "Clips en attente", value: stat.review ? plural(stat.review, "clip") : "aucun" },
        stat.clips30
          ? { label: "Rythme", value: rhythm <= 1 ? "1 clip par jour ou plus" : `1 clip tous les ${rhythm.toFixed(1).replace(".", ",")} jours` }
          : { label: "Rythme", value: "aucun clip sur 30 jours", tone: "warn" as const },
        { label: "Dernier versement", value: lastPayout ? `${euro(num(lastPayout.total))} · ${dayMonth(lastPayout.paid_at)}${lastPayout.method ? ` · ${lastPayout.method}` : ""}` : "aucun" },
      ],
      note: c.admin_note ?? "",
      payout: c.payout_method ? `Paiement : ${PAYOUT_LABEL[c.payout_method]}${c.payout_details ? ` · ${maskDetails(c.payout_details)}` : ""}` : "Paiement : pas encore choisi par le clippeur",
    };
  }

  function buildClippers(): ClippersVals {
    const watch = (stat: Stat) => stat.refused30.length > 0 || !stat.accounts.length || stat.accounts.some((account) => !account.verified);
    const match = (stat: Stat, filter: ClipperFilter) =>
      filter === "all" ||
      (filter === "active" && stat.c.status === "active" && !stat.idle) ||
      (filter === "test" && stat.c.status === "test") ||
      (filter === "idle" && stat.idle) ||
      (filter === "paused" && stat.c.status === "paused") ||
      (filter === "watch" && watch(stat));
    const count = (filter: ClipperFilter) => stats.filter((stat) => match(stat, filter)).length;
    const query = clipSearch.trim().toLowerCase().replace(/^@/, "");
    const rows = stats
      .filter((stat) => match(stat, clipFilter))
      .filter((stat) => !query || [stat.c.display_name, stat.c.ref, stat.c.whatsapp ?? "", stat.c.telegram ?? "", ...stat.accounts.map((account) => account.handle)].some((value) => value.toLowerCase().includes(query)))
      .sort((a, b) => b.views30 - a.views30 || b.clips30 - a.clips30 || a.c.created_at.localeCompare(b.c.created_at));
    const selected = rows.find((stat) => stat.c.id === clipSel) ?? rows[0] ?? null;
    const selectedIndex = selected ? rows.indexOf(selected) : -1;
    const showAll = clipAll || selectedIndex >= 8;
    const visible = showAll ? rows : rows.slice(0, 8);
    const total = data.clippers.length;
    const paused = count("paused");
    return {
      subline: `${plural(total, "clippeur")} · ${count("active")} actif${count("active") > 1 ? "s" : ""} · ${count("test")} en test · ${count("idle")} inactif${count("idle") > 1 ? "s" : ""}${paused ? ` · ${paused} en pause` : ""}`,
      search: clipSearch,
      onSearch: setClipSearch,
      filter: clipFilter,
      filters: [
        { key: "all", label: `Tous · ${total}` },
        { key: "active", label: `Actifs · ${count("active")}` },
        { key: "test", label: `En test · ${count("test")}` },
        { key: "idle", label: `Inactifs · ${count("idle")}` },
        { key: "paused", label: `En pause · ${paused}` },
        { key: "watch", label: `À surveiller · ${count("watch")}` },
      ],
      setFilter: (key) => { setClipFilter(key); setClipAll(false); },
      rows: visible.map((stat) => ({
        id: stat.c.id,
        ini: initialsOf(stat.c.display_name),
        name: stat.c.display_name,
        sub: stat.mainHandle ? `${stat.c.ref} · @${stat.mainHandle}` : stat.c.ref,
        status: stat.chip,
        accounts: stat.accounts.length ? `${stat.accounts.length} · ${stat.accounts.filter((account) => account.verified).length} vérifié${stat.accounts.filter((account) => account.verified).length > 1 ? "s" : ""}` : "aucun",
        views: compact(stat.views30),
        clips: String(stat.clips30),
        refus: String(stat.refused30.length),
      })),
      selectedId: selected?.c.id ?? null,
      select: (id) => {
        setClipSel(id);
        if (window.innerWidth < 1300) window.setTimeout(() => document.getElementById("fiche")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      },
      hidden: showAll ? 0 : Math.max(0, rows.length - visible.length),
      showAll: () => setClipAll(true),
      fiche: selected ? buildFiche(selected) : null,
      emptyLabel: total ? "Aucun clippeur ne correspond." : "Pas encore de clippeur : accepte une candidature pour commencer.",
      busy,
      inviteCopied: copied === "join",
      onInvite: () => void copy(joinUrl, "join"),
      copiedLink: copied === `link-${selected?.c.id ?? ""}`,
      onCopyLink: (link) => void copy(link, `link-${selected?.c.id ?? ""}`),
      verify: (accountId, verified) => {
        const account = data.accounts.find((item) => item.id === accountId);
        void act({ action: "verify_account", id: accountId, verified }, verified ? `@${account?.handle ?? "compte"} vérifié.` : "Vérification retirée.");
      },
      setStatus: (id, status) => {
        const name = base.clippersById.get(id)?.display_name ?? "Le clippeur";
        void act({ action: "update_clipper", id, status }, status === "paused" ? `${name} est en pause.` : status === "test" ? `${name} est en test.` : `${name} est actif.`);
      },
      saveNote: (id, note) => act({ action: "update_clipper", id, admin_note: note }, "Note enregistrée."),
      resetPassword: async (id) => {
        const clipper = base.clippersById.get(id);
        try {
          const result = await post<{ password: string }>({ action: "reset_password", clipper_id: id });
          return { password: result.password, wa: clipper ? waLink(clipper.whatsapp, msg.password(firstNameOf(clipper.display_name), result.password)) : null };
        } catch (error) {
          setFlash({ kind: "error", text: error instanceof Error ? error.message : "Impossible de créer un mot de passe provisoire." });
          return null;
        }
      },
      onPayments: (id) => {
        setPayFocus(id);
        setPayFilter("all");
        navigate("payments");
      },
    };
  }

  // ——— Comptes ———
  function buildAccounts(): AccountsVals {
    const filter = accFilter ?? (unverified.length ? "todo" : "all");
    const query = accSearch.trim().toLowerCase().replace(/^@/, "");
    const rows = data.accounts
      .filter((account) => filter === "all" || (filter === "todo" ? !account.verified : account.verified))
      .filter((account) => !query || account.handle.toLowerCase().includes(query) || (base.clippersById.get(account.clipper_id)?.display_name ?? "").toLowerCase().includes(query))
      .sort((a, b) => Number(a.verified) - Number(b.verified) || b.created_at.localeCompare(a.created_at))
      .map((account) => {
        const stat = statById.get(account.clipper_id);
        const platformClips = (stat?.live ?? []).filter((clip) => clip.platform === account.platform);
        const views = platformClips.reduce((sum, clip) => sum + (gains30.byClip.get(clip.id) ?? 0), 0);
        return {
          id: account.id,
          badge: PLATFORM_SHORT[account.platform],
          handle: account.handle,
          url: profileUrl(account),
          network: PLATFORM_LABEL[account.platform],
          clipperId: account.clipper_id,
          clipper: stat?.c.display_name ?? "—",
          followers: account.followers !== null ? compact(account.followers) : "—",
          clips: String(platformClips.length),
          views: compact(views),
          added: dayMonth(account.created_at),
          verified: account.verified,
        };
      });
    const verifiedCount = data.accounts.length - unverified.length;
    const sample = data.clippers[0]?.tracking_code ?? "code";
    return {
      subline: `${plural(data.accounts.length, "compte")} · ${verifiedCount} vérifié${verifiedCount > 1 ? "s" : ""} · ${unverified.length} à vérifier`,
      filter,
      filters: [
        { key: "todo", label: `À vérifier · ${unverified.length}` },
        { key: "verified", label: `Vérifiés · ${verifiedCount}` },
        { key: "all", label: `Tous · ${data.accounts.length}` },
      ],
      setFilter: setAccFilter,
      search: accSearch,
      onSearch: setAccSearch,
      rows,
      emptyLabel: data.accounts.length ? (filter === "todo" ? "Tous les comptes sont vérifiés." : "Aucun compte ne correspond.") : "Les clippeurs ajoutent leurs comptes depuis leur profil : ils apparaîtront ici.",
      linkExample: `${host}/clip/l/${sample}`,
      busy,
      verify: (id, verified) => {
        const account = data.accounts.find((item) => item.id === id);
        void act({ action: "verify_account", id, verified }, verified ? `@${account?.handle ?? "compte"} vérifié.` : "Vérification retirée.");
      },
      openClipper,
    };
  }

  // ——— Clips à valider ———
  function buildReview(): ReviewVals {
    const queueClips = data.clips.filter((clip) => clip.status === "review" || decided[clip.id]).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const pending = queueClips.filter((clip) => !decided[clip.id] && clip.status === "review");
    const current = queueClips.find((clip) => clip.id === reviewSel) ?? pending[0] ?? queueClips[0] ?? null;
    const flagOf = (clip: ClipRow): string | null => {
      const stat = clip.clipper_id ? statById.get(clip.clipper_id) : undefined;
      if (!stat) return null;
      if (stat.refused30.length >= 2) return `${stat.refused30.length} clips refusés sur 30 jours pour ce clippeur.`;
      if (stat.c.status === "test") return "Clippeur en période de test : regarde le montage de près.";
      if (stat.c.status === "paused") return "Ce clippeur est en pause.";
      return null;
    };
    let cur: ReviewCurrent | null = null;
    if (current) {
      const stat = current.clipper_id ? statById.get(current.clipper_id) : undefined;
      const clipper = stat?.c;
      const campaign = base.campaignsById.get(current.campaign_id);
      const first = clipper ? firstNameOf(clipper.display_name) : "Le clippeur";
      const platformAccounts = (stat?.accounts ?? []).filter((account) => account.platform === current.platform);
      const urlHandle = current.platform === "tiktok" ? tiktokHandleFromUrl(current.url) : null;
      const matched = urlHandle ? platformAccounts.filter((account) => account.handle === urlHandle) : platformAccounts;
      const accountText = urlHandle
        ? `@${urlHandle} · ${matched.length ? (matched[0].verified ? "vérifié" : "à vérifier") : "pas dans ses comptes"}`
        : platformAccounts.length
          ? platformAccounts.map((account) => `@${account.handle}${account.verified ? "" : " (à vérifier)"}`).join(", ")
          : `aucun compte ${PLATFORM_LABEL[current.platform]}`;
      const position = (stat?.live ?? []).filter((clip) => clip.campaign_id === current.campaign_id && clip.created_at <= current.created_at).length;
      const publishedDay = current.published_at.slice(0, 10);
      const duplicate = data.clips.find((clip) => clip.id !== current.id && normalizeUrl(clip.url) === normalizeUrl(current.url));
      const until = dayMonth(freezeAt(current.published_at).toISOString());
      const decision = decided[current.id] ?? (current.status === "approved" ? "ok" : current.status === "rejected" ? "ko" : null);
      cur = {
        id: current.id,
        ini: clipper ? initialsOf(clipper.display_name) : "C",
        title: current.title,
        ref: `${current.ref} · soumis il y a ${ageShort(current.created_at, now)} par ${clipper?.display_name ?? "un clippeur"}`,
        url: current.url,
        open: `Ouvrir sur ${PLATFORM_LABEL[current.platform]}`,
        firstName: first,
        info: [
          { label: "Compte", value: accountText },
          { label: "Campagne", value: campaign ? `${campaign.title} · ${position}${position === 1 ? "er" : "e"} clip sur ${campaign.quota_per_clipper}` : "campagne supprimée" },
          { label: "Publié", value: dayLabel(current.published_at, now) },
          { label: "Vues", value: current.views_updated_at ? `${formatInt(clipViews(current))} · maj ${ago(current.views_updated_at, now)}` : "pas encore saisies" },
          { label: "Réseau", value: PLATFORM_LABEL[current.platform] },
        ],
        flagText: flagOf(current),
        checks: [
          urlHandle
            ? { ok: matched.length > 0, label: matched.length ? `Publié par @${urlHandle}, un de ses comptes` : `Publié par @${urlHandle}, pas dans ses comptes` }
            : { ok: platformAccounts.length > 0, label: platformAccounts.length ? `Compte ${PLATFORM_LABEL[current.platform]} dans son profil` : `Aucun compte ${PLATFORM_LABEL[current.platform]} dans son profil` },
          { ok: Boolean(campaign && publishedDay >= campaign.starts_on && publishedDay <= campaign.ends_on), label: campaign && publishedDay >= campaign.starts_on && publishedDay <= campaign.ends_on ? "Publié pendant la campagne" : "Publié hors des dates de la campagne" },
          { ok: !duplicate, label: duplicate ? `Déjà soumis : doublon de ${duplicate.ref}` : "Jamais soumis avant (pas de doublon)" },
          { ok: matched.some((account) => account.verified), label: matched.some((account) => account.verified) ? "Compte vérifié" : "Compte pas encore vérifié" },
        ],
        decision,
        reason: current.reject_reason,
        okNote: `${first} le voit dans son espace. Ses vues comptent jusqu'au ${until}, puis entrent dans le paiement.`,
        waOk: clipper ? waLink(clipper.whatsapp, msg.ok(first, current.title, until)) : null,
        waKo: clipper ? waLink(clipper.whatsapp, msg.ko(first, current.title, current.reject_reason ?? "il ne respecte pas la charte")) : null,
      };
    }
    const nextPending = pending.find((clip) => clip.id !== current?.id) ?? null;
    const unpaid = data.clips.filter((clip) => clip.status === "approved" && !clip.payout_id);
    const viewRows = (viewsFilter === "counting" ? unpaid.filter((clip) => clipState(clip) === "counting") : unpaid)
      .sort((a, b) => a.published_at.localeCompare(b.published_at))
      .map((clip) => {
        const campaign = base.campaignsById.get(clip.campaign_id);
        const frozen = clipState(clip) === "frozen";
        return {
          id: clip.id,
          title: clip.title,
          url: clip.url,
          meta: `${clip.ref} · ${PLATFORM_SHORT[clip.platform]} · ${campaign?.title ?? "campagne"} · ${clip.views_updated_at ? `maj ${ago(clip.views_updated_at, now)}` : "jamais saisies"}`,
          clipper: (clip.clipper_id ? base.clippersById.get(clip.clipper_id)?.display_name : null) ?? "—",
          published: dayMonth(clip.published_at),
          state: frozen ? { tone: "ok" as const, label: "Figées" } : { tone: "warn" as const, label: `Le ${dayMonth(freezeAt(clip.published_at).toISOString())}` },
          views: clipViews(clip),
          calc: (views: number) => {
            if (!campaign) return { amount: "—", note: null };
            const amount = clipAmount(views, campaign);
            const cap = num(campaign.max_per_clip);
            return { amount: euro(amount), note: views < num(campaign.min_views) ? `sous ${formatInt(num(campaign.min_views))} vues` : cap > 0 && amount >= cap ? "plafond atteint" : null };
          },
        };
      });
    const oldest = pending[0];
    return {
      tab: reviewTab,
      setTab: setReviewTab,
      pendingCount: pending.length,
      viewsCount: countingClips.length,
      subline: pending.length ? `${pending.length} en attente · le plus ancien attend depuis ${ageShort(oldest.created_at, now)}` : "Aucun clip en attente",
      queue: queueClips.map((clip) => {
        const clipper = clip.clipper_id ? base.clippersById.get(clip.clipper_id) : undefined;
        const campaign = base.campaignsById.get(clip.campaign_id);
        return {
          id: clip.id,
          ini: clipper ? initialsOf(clipper.display_name) : "C",
          who: `${clipper?.display_name ?? "Clippeur"} · ${clip.ref}`,
          title: clip.title,
          meta: `${PLATFORM_LABEL[clip.platform]} · ${campaign?.title ?? "campagne"}`,
          age: ageShort(clip.created_at, now),
          flag: Boolean(flagOf(clip)),
          decision: decided[clip.id] ?? null,
        };
      }),
      pick: setReviewSel,
      cur,
      reasons: REASONS,
      busy,
      validate: (id) => {
        void act({ action: "review_clip", id, decision: "approved" }, null).then((ok) => { if (ok) setDecided((current) => ({ ...current, [id]: "ok" })); });
      },
      refuse: (id, reason) => {
        void act({ action: "review_clip", id, decision: "rejected", reason }, null).then((ok) => { if (ok) setDecided((current) => ({ ...current, [id]: "ko" })); });
      },
      next: () => { if (nextPending) setReviewSel(nextPending.id); },
      hasNext: Boolean(nextPending),
      viewRows,
      viewsFilter,
      viewsFilters: [
        { key: "counting", label: `En cours · ${countingClips.length}` },
        { key: "all", label: `Tous les non payés · ${unpaid.length}` },
      ],
      setViewsFilter,
      saveViews: (id, views) => act({ action: "set_views", id, views }, "Vues enregistrées."),
    };
  }

  // ——— Campagnes ———
  function buildCampaigns(): AdminCampaignsVals {
    const count = (phase: Phase) => data.campaigns.filter((campaign) => campaignPhase(campaign, todayIso) === phase).length;
    const filter = campFilter ?? (count("live") ? "live" : count("soon") ? "soon" : count("draft") ? "draft" : "ended");
    const list = data.campaigns.filter((campaign) => campaignPhase(campaign, todayIso) === filter);
    return {
      subline: `${plural(count("live"), "campagne")} en cours · ${count("soon")} à venir · ${count("ended")} terminée${count("ended") > 1 ? "s" : ""}`,
      filter,
      filters: [
        { key: "live", label: `En cours · ${count("live")}` },
        { key: "soon", label: `À venir · ${count("soon")}` },
        { key: "ended", label: `Terminées · ${count("ended")}` },
        { key: "draft", label: `Brouillons · ${count("draft")}` },
      ],
      setFilter: setCampFilter,
      cards: list.map((campaign) => ({
        ...campaignCard(campaign),
        rules: `${euro(num(campaign.rate_per_1000))} / 1 000 vues · min. ${formatInt(num(campaign.min_views))} vues · max ${euroRound(num(campaign.max_per_clip))} / clip · +${euroRound(num(campaign.vip_bonus))} / VIP · objectif ${campaign.quota_per_clipper} clips / clippeur`,
        brief: campaign.brief.replace(/\s*\n\s*/g, " · ").trim(),
        rushes: campaign.rushes_url,
      })),
      emptyLabel: data.campaigns.length ? "Aucune campagne dans ce filtre." : "Aucune campagne pour l'instant : crée la première pour que les clippeurs puissent soumettre.",
      form,
      openNew: () => setForm(emptyForm(todayIso)),
      edit: (id) => {
        const campaign = base.campaignsById.get(id);
        if (!campaign) return;
        setForm({
          id: campaign.id,
          title: campaign.title,
          platforms: campaign.platforms,
          starts_on: campaign.starts_on,
          ends_on: campaign.ends_on,
          quota_per_clipper: String(campaign.quota_per_clipper),
          rate_per_1000: String(num(campaign.rate_per_1000)),
          min_views: String(num(campaign.min_views)),
          max_per_clip: String(num(campaign.max_per_clip)),
          vip_bonus: String(num(campaign.vip_bonus)),
          status: campaign.status,
          rushes_url: campaign.rushes_url ?? "",
          brief: campaign.brief,
          forbidden: campaign.forbidden,
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
      closeForm: () => setForm(null),
      setField: (key, value) => setForm((current) => (current ? { ...current, [key]: value } : current)),
      save: () => {
        if (!form) return;
        const status = form.status;
        void act({ action: "save_campaign", ...form, id: form.id ?? undefined }, form.id ? "Campagne mise à jour." : "Campagne créée.").then((ok) => {
          if (ok) {
            setForm(null);
            setCampFilter(status === "draft" ? "draft" : status === "ended" ? "ended" : form.starts_on > todayIso ? "soon" : "live");
          }
        });
      },
      busy,
    };
  }

  // ——— Candidatures ———
  function buildCandidates(): CandidatesVals {
    const statusOf = (candidate: Candidate): Exclude<CandDecision, null> | null => {
      if (candDecided[candidate.id]) return candDecided[candidate.id];
      if (candidate.status === "refused") return "refused";
      if (candidate.status === "accepted") return candidate.user_id && base.clipperByUser.get(candidate.user_id)?.status === "active" ? "active" : "test";
      return null;
    };
    const inTab = (candidate: Candidate, tab: CandTab) => tab === "new" ? candidate.status === "new" || Boolean(candDecided[candidate.id]) : candidate.status === (tab === "accepted" ? "accepted" : "refused");
    const list = data.candidates.filter((candidate) => inTab(candidate, candTab)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const current = list.find((candidate) => candidate.id === candSel) ?? list[0] ?? null;
    const tagOf = (candidate: Candidate): { tag: string; tone: "gold" | "ok" | "neutral" | "warn" | "bad" } => {
      const decision = statusOf(candidate);
      if (!decision) return { tag: "Formulaire reçu", tone: "gold" };
      if (decision === "refused") return { tag: "Refusée", tone: "neutral" };
      const clipper = candidate.user_id ? base.clipperByUser.get(candidate.user_id) : undefined;
      if (clipper?.status === "paused") return { tag: "En pause", tone: "bad" };
      return decision === "active" ? { tag: "Accepté", tone: "ok" } : { tag: "En test", tone: "ok" };
    };
    let cur: CandidatesVals["cur"] = null;
    if (current) {
      const first = firstNameOf(current.display_name);
      const decision = statusOf(current);
      const clipper = current.user_id ? base.clipperByUser.get(current.user_id) : undefined;
      const bubbles: NonNullable<CandidatesVals["cur"]>["bubbles"] = [
        { kind: "event", text: "compte créé, candidature envoyée", time: `${dayLabel(current.created_at, now)} ${new Date(current.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` },
        { kind: "in", text: `Mes comptes :\n${current.accounts}` },
        { kind: "in", text: `Dispo : ${current.availability}` },
      ];
      if (current.message) bubbles.push({ kind: "in", text: current.message });
      if (current.sample_url) bubbles.push({ kind: "link", text: "Exemple de montage", href: current.sample_url });
      if (decision) bubbles.push({ kind: "event", text: decision === "refused" ? "candidature refusée" : decision === "test" ? "mis en test, espace clippeur ouvert" : "accepté, espace clippeur ouvert", time: current.reviewed_at ? dayLabel(current.reviewed_at, now) : "à l'instant" });
      const waDecision = decision === "refused" ? waLink(current.whatsapp, msg.refused(first)) : decision === "test" ? waLink(current.whatsapp, msg.test(first)) : decision === "active" ? waLink(current.whatsapp, msg.welcome(first)) : null;
      const facts: { label: string; value: string; href?: string }[] = [
        { label: "WhatsApp", value: current.whatsapp, href: waLink(current.whatsapp) ?? undefined },
      ];
      if (current.telegram) facts.push({ label: "Telegram", value: `@${current.telegram}`, href: `https://t.me/${current.telegram}` });
      if (current.email) facts.push({ label: "E-mail", value: current.email });
      facts.push({ label: "Dispo", value: current.availability });
      if (current.sample_url) facts.push({ label: "Exemple", value: "voir le montage", href: current.sample_url });
      facts.push({ label: "Reçue", value: ago(current.created_at, now) });
      if (clipper) facts.push({ label: "Espace clippeur", value: `${clipper.ref} · ${clipper.status === "active" ? "actif" : clipper.status === "test" ? "en test" : "en pause"}` });
      cur = {
        id: current.id,
        ini: initialsOf(current.display_name),
        name: current.display_name,
        firstName: first,
        phone: maskPhone(current.whatsapp),
        source: current.source === "whatsapp" ? "venu de WhatsApp" : "via ton lien d'inscription",
        bubbles,
        steps: [
          { label: "Compte", done: true },
          { label: "Dossier", done: true },
          { label: "Décision", done: Boolean(decision) },
          { label: "Test", done: decision === "test" || decision === "active" },
          { label: "Accepté", done: decision === "active" },
        ],
        facts,
        pending: !decision,
        decision,
        statusText: decision === "refused" ? "Refusé." : decision === "test" ? "Mis en test." : decision === "active" ? "Accepté." : null,
        waDecision,
        quick: [
          { label: "Écrire sur WhatsApp", href: waLink(current.whatsapp) ?? "#" },
          { label: "Demander un exemple", href: waLink(current.whatsapp, msg.example(first)) ?? "#" },
          { label: "Renvoyer le lien", href: waLink(current.whatsapp, msg.link(first)) ?? "#" },
        ],
      };
    }
    const accepted = data.candidates.filter((candidate) => candidate.status === "accepted").length;
    const refused = data.candidates.filter((candidate) => candidate.status === "refused").length;
    const find = (id: string) => data.candidates.find((candidate) => candidate.id === id);
    return {
      subline: `${plural(newCandidates.length, "nouvelle", "nouvelles")} · elles arrivent par ton lien d'inscription`,
      tab: candTab,
      tabs: [
        { key: "new", label: "Nouvelles", count: newCandidates.length },
        { key: "accepted", label: "Acceptées", count: accepted },
        { key: "refused", label: "Refusées", count: refused },
      ],
      setTab: (tab) => { setCandTab(tab); setCandSel(null); },
      items: list.map((candidate) => {
        const tag = tagOf(candidate);
        return {
          id: candidate.id,
          ini: initialsOf(candidate.display_name),
          name: candidate.display_name,
          time: ageShort(candidate.created_at, now),
          last: candidate.message || candidate.accounts.split("\n")[0],
          tag: tag.tag,
          tagTone: tag.tone,
        };
      }),
      selectedId: current?.id ?? null,
      pick: setCandSel,
      cur,
      emptyLabel: candTab === "new" ? "Aucune nouvelle candidature. Partage ton lien d'inscription pour en recevoir." : "Rien ici pour l'instant.",
      busy,
      accept: (id) => { const candidate = find(id); if (candidate) void decideCandidate(candidate, "active"); },
      test: (id) => { const candidate = find(id); if (candidate) void decideCandidate(candidate, "test"); },
      refuse: (id) => { const candidate = find(id); if (candidate) void decideCandidate(candidate, "refused"); },
    };
  }

  // ——— Paiements ———
  function buildPayments(): PaymentsVals {
    const focus = payFocus ? statById.get(payFocus) ?? null : null;
    const scope = focus ? [focus] : stats;
    const rows: PayRowData[] = scope
      .filter((stat) => stat.money.acquired > 0)
      .sort((a, b) => b.money.acquired - a.money.acquired)
      .map((stat) => {
        const method = stat.c.payout_method;
        return {
          id: stat.c.id,
          ini: initialsOf(stat.c.display_name),
          name: stat.c.display_name,
          ref: stat.c.ref,
          handle: `${stat.c.ref} · ${plural(stat.money.acquiredClips, "clip figé", "clips figés")}`,
          clipsCount: stat.money.acquiredClips,
          views: stat.money.acquiredViews,
          viewsText: compact(stat.money.acquiredViews),
          base: stat.money.acquired,
          method: method ? PAYOUT_LABEL[method] : "Pas encore choisi",
          methodNote: method ? (stat.c.payout_details ? maskDetails(stat.c.payout_details) : "coordonnées à compléter") : "à renseigner dans son profil",
          details: stat.c.payout_details ?? "",
          status: !method ? "check" : stat.money.acquired < MIN_PAYOUT ? "later" : "ready",
        };
      });
    const pendingAmount = round2(scope.reduce((sum, stat) => sum + stat.money.pending, 0));
    const pendingClips = scope.reduce((sum, stat) => sum + stat.money.pendingClips, 0);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    const payouts = data.payouts.filter((payout) => !focus || payout.clipper_id === focus.c.id);
    const lastMonth = payouts.filter((payout) => {
      const date = new Date(payout.paid_at);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === prevKey;
    });
    const groups = new Map<string, PayoutRow[]>();
    for (const payout of payouts) {
      const key = dayIso(dayNumber(new Date(payout.paid_at).getTime()));
      groups.set(key, [...(groups.get(key) ?? []), payout]);
    }
    const history = [...groups.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([key, list]) => ({
        key,
        date: longDay(key),
        sub: focus
          ? `${list.map((payout) => payout.ref).join(", ")} · ${plural(list.reduce((sum, payout) => sum + payout.clips_count, 0), "clip")}${list[0].method ? ` · ${list[0].method}` : ""}`
          : `${dateRange(list[0].cycle_start, list[0].cycle_end)} · ${plural(list.length, "versement")}`,
        amount: euro(list.reduce((sum, payout) => sum + num(payout.total), 0)),
      }));
    const actives = data.clippers.filter((clipper) => clipper.status !== "paused");
    const methods = [...PAYOUT_METHODS.map((method) => ({ label: PAYOUT_LABEL[method], count: actives.filter((clipper) => clipper.payout_method === method).length })), { label: "Pas encore choisi", count: actives.filter((clipper) => !clipper.payout_method).length }]
      .map((method) => ({ ...method, pct: pct(method.count, actives.length) }));
    const closesIn = daysUntil(cycle.end, now);
    return {
      headline: `${dateRange(cycle.start, cycle.end).replace(/^Du/, "Cycle du")} · ${closesIn ? `clôture dans ${plural(closesIn, "jour")}` : "clôture aujourd'hui"} · versement le ${longDay(cycle.payDate).replace(/^./, (c) => c.toLowerCase())}`,
      paidLabel: `Versé en ${monthName(dayIso(dayNumber(prev.getTime())))}`,
      paid: euro(lastMonth.reduce((sum, payout) => sum + num(payout.total), 0)),
      paidSub: lastMonth.length ? plural(lastMonth.length, "versement") : "aucun versement",
      rules: {
        rate: `${euro(rules.rate)} / 1 000 vues`,
        rateSub: `dès ${formatInt(rules.minViews)} vues, max ${euroRound(rules.cap)} / clip`,
        freeze: "Vues figées à J+7",
        vip: `+${euroRound(rules.vip)} par VIP`,
        min: `Seuil de ${euroRound(MIN_PAYOUT)}`,
        minSub: "en dessous, reporté au cycle suivant",
      },
      onRules: () => navigate("campaigns"),
      filter: payFilter,
      setFilter: setPayFilter,
      rows,
      pendingNote: pendingAmount > 0 ? `+ ${euro(pendingAmount)} encore en comptage sur ce cycle (${plural(pendingClips, "clip")} figé${pendingClips > 1 ? "s" : ""} d'ici le ${dayMonth(cycle.end)}).` : null,
      focus: focus ? { name: focus.c.display_name, clear: () => setPayFocus(null) } : null,
      methods,
      methodsSub: `${plural(actives.length, "clippeur")} actif${actives.length > 1 ? "s" : ""}`,
      history,
      emptyLabel: focus ? `Rien d'acquis à payer pour ${focus.c.display_name} pour l'instant.` : "Personne à payer pour l'instant : les montants arrivent ici quand les vues sont figées (J+7).",
      minPayout: MIN_PAYOUT,
      busy,
      euro,
      copiedId: copied?.startsWith("pay-") ? copied.slice(4) : null,
      copyDetails: (id, details) => void copy(details, `pay-${id}`),
      pay: async (items) => {
        if (!items.length) return false;
        setBusy(true);
        let done = 0;
        const failed: string[] = [];
        for (const item of items) {
          try {
            await post({ action: "pay", clipper_id: item.id, bonus: item.bonus, deduction: item.deduction });
            done += 1;
          } catch (error) {
            failed.push(`${base.clippersById.get(item.id)?.display_name ?? "un clippeur"} (${error instanceof Error ? error.message : "erreur"})`);
          }
        }
        await reload();
        setBusy(false);
        setFlash(failed.length
          ? { kind: "error", text: `${plural(done, "versement enregistré", "versements enregistrés")}. Pas enregistré : ${failed.join(", ")}.` }
          : { kind: "ok", text: `${plural(done, "versement enregistré", "versements enregistrés")} : chacun voit « Payé » dans son espace.` });
        return failed.length === 0;
      },
    };
  }

  function buildWhatsApp(): WhatsAppVals {
    const join = `${CLIP_PUBLIC_URL}/rejoindre`;
    return {
      number: ENRICK_WHATSAPP_LABEL,
      greeting: `Salut 👋 Merci pour ton message, je te réponds dès que possible !\n\nTu veux devenir clippeur ? Inscris-toi ici en 2 minutes : ${join}`,
      quickReply: `Pour devenir clippeur, inscris-toi ici en 2 minutes : ${join}\nTu crées ton compte, tu postules, et je te réponds ici sur WhatsApp.`,
      copied: copied?.startsWith("wa-") ? copied : null,
      copy: (key, text) => void copy(text, key),
      onCandidates: () => navigate("candidates"),
    };
  }

  function buildRules(): RulesVals {
    return {
      rate: `${euro(rules.rate)} pour 1 000 vues`,
      rateSub: "vues vérifiées, tous réseaux",
      minViews: formatInt(rules.minViews),
      cap: euroRound(rules.cap),
      vip: `+${euroRound(rules.vip)} par VIP`,
      minPayout: euroRound(MIN_PAYOUT),
      reasons: REASONS,
      onCampaigns: () => navigate("campaigns"),
    };
  }

  function buildSettings(): SettingsVals {
    return {
      rows: [
        { label: "Adresse de l'espace clippeurs", value: `${host}/clip`, note: "Bientôt sur ton propre domaine (investproclip)", soon: true },
        { label: "Lien d'inscription", value: joinUrl.replace(/^https?:\/\//, ""), note: "À partager : le clippeur crée son compte et postule au même endroit", copy: () => void copy(joinUrl, "join-settings"), copied: copied === "join-settings" },
        { label: "Lien traqué des clippeurs", value: `${host}/clip/l/… → ${TRACKED_LINK_TARGET.replace(/^https?:\/\//, "")}`, note: "Chaque clic est compté pour le clippeur" },
        { label: "Cycles de paiement", value: "Du 1er au 15 (versé le 16) · du 16 à la fin du mois (versé le 1er)" },
        { label: "Seuil de versement", value: euroRound(MIN_PAYOUT), note: "En dessous, le montant passe au cycle suivant" },
        { label: "Vues figées", value: "7 jours après la publication" },
        { label: "Synchronisation des vues", value: "Saisie à la main", note: "TikTok, Instagram et YouTube reliés automatiquement : bientôt", soon: true },
        { label: "VIP ramenés par les clips", value: "Pas encore suivis", soon: true },
        { label: "WhatsApp", value: `${ENRICK_WHATSAPP_LABEL} · pas encore relié au site`, note: "Les messages partent déjà de ton WhatsApp en un clic ; le tri automatique viendra quand il sera relié", soon: true },
        { label: "Accès admin", value: "Toi seul (propriétaire du site)" },
      ],
    };
  }

  const counts: NavCounts = {
    clippers: data.clippers.length,
    accounts: data.accounts.length,
    review: reviewClips.length,
    campaigns: liveCampaigns.length,
    candidates: newCandidates.length,
  };

  return (
    <AdminShell active={section} onSection={navigate} counts={counts} joinLabel={joinUrl.replace(/^https?:\/\//, "")} copied={copied === "join"} onCopyJoin={() => void copy(joinUrl, "join")} onSignOut={() => { void clipSignOut().then(() => window.location.assign("/clip/admin")); }} gap={section === "overview" ? "24px" : "20px"}>
      <Flash flash={flash} />
      {section === "overview" ? <AdminOverview v={buildOverview()} /> : null}
      {section === "clippers" ? <AdminClippers v={buildClippers()} /> : null}
      {section === "accounts" ? <AdminAccounts v={buildAccounts()} /> : null}
      {section === "review" ? <AdminReview v={buildReview()} /> : null}
      {section === "campaigns" ? <AdminCampaigns v={buildCampaigns()} /> : null}
      {section === "candidates" ? <AdminCandidates v={buildCandidates()} /> : null}
      {section === "payments" ? <AdminPayments v={buildPayments()} /> : null}
      {section === "whatsapp" ? <AdminWhatsApp v={buildWhatsApp()} /> : null}
      {section === "rules" ? <AdminRules v={buildRules()} /> : null}
      {section === "settings" ? <AdminSettings v={buildSettings()} /> : null}
    </AdminShell>
  );
}
