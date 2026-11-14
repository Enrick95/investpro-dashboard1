"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import styles from "./clip.module.css";
import ClipLogin from "./ClipLogin";
import { ClipApiError, clipApi, clipSignOut } from "@/lib/clip/client";
import {
  ENRICK_TIKTOK_HANDLE,
  ENRICK_TIKTOK_URL,
  ENRICK_YOUTUBE_HANDLE,
  ENRICK_YOUTUBE_URL,
  NETWORKS_TEXT,
  ENRICK_WHATSAPP_LABEL,
  MIN_PAYOUT,
  PAYOUT_HINT,
  PAYOUT_LABEL,
  PAYOUT_METHODS,
  PLATFORM_LABEL,
  PLATFORM_SHORT,
  REFERRAL_BONUS,
  REFERRAL_CLIPS,
  clipState,
  clipValue,
  clipViewsOf,
  cycleProgress,
  daysUntil,
  candidateWhatsAppText,
  enrickWhatsApp,
  formatEuro,
  formatInt,
  num,
  platformFromUrl,
  referralDue,
  referralLink,
  summarize,
  tiktokHandleFromUrl,
  trackedLink,
  type CampaignRow,
  type ClipPlatform,
  type ClipRow,
  type PayoutMethod,
  type PayoutRow,
} from "@/lib/clip/rules";
import { clipPathNow, useClipPath } from "./views/clipPath";
import { ClipperRanking, type RankingRow } from "./views/clipper/Ranking";
import { dayIso, dayNumber, viewGains, type ViewSnapshot } from "@/lib/clip/stats";
import { ago, compact, dateRange, dayMonth, firstNameOf, initialsOf, longDay, maskDetails, monthName, ordinal, pct, plural, rankLabel, shortDay } from "@/lib/clip/format";
import { ClipperShell, type ClipperTab } from "./views/clipper/Shell";
import { ClipTicker } from "./views/clipper/Ticker";
import { clipPushForget, useClipPush } from "./views/clipPush";
import { openClipInstall } from "./views/InstallClip";
import { ClipperHome, type HomeTodo } from "./views/clipper/Home";
import { ClipperCampaigns, type CampaignCard, type CampaignFilter } from "./views/clipper/Campaigns";
import { ClipperSubmit } from "./views/clipper/Submit";
import { ClipperClips, type ClipChipState, type ClipItem } from "./views/clipper/Clips";
import { ClipperPayments, type PayStep } from "./views/clipper/Payments";
import { ClipperProfile } from "./views/clipper/Profile";
import { ClipperCharter } from "./views/clipper/Charter";
import { StartPopup, StartSlides, startSlides } from "./views/clipper/StartSlides";
import { ClipBackdrop } from "./views/clipper/ClipHero";

type Clipper = {
  id: string;
  ref: string;
  display_name: string;
  whatsapp: string | null;
  telegram: string | null;
  tracking_code: string;
  status: "test" | "active" | "paused";
  payout_method: PayoutMethod | null;
  payout_details: string | null;
  /** E-mail à chaque nouvelle vidéo (activé par défaut). */
  notify_email?: boolean;
  created_at: string;
};
type Account = { id: string; platform: ClipPlatform; handle: string; followers: number | null; verified: boolean; created_at: string };
type Candidate = { id: string; status: "new" | "accepted" | "refused"; display_name?: string; created_at: string };
export type Me = {
  email: string | null;
  owner: boolean;
  clipper: Clipper | null;
  candidate?: Candidate | null;
  accounts?: Account[];
  campaigns?: CampaignRow[];
  clips?: ClipRow[];
  payouts?: PayoutRow[];
  rank?: { position: number; total: number; views: number };
  ranking?: { top: { position: number; name: string; views: number; clips: number; me: boolean }[]; ahead: { name: string; gap: number } | null; clips: number };
  viewSnapshots?: ViewSnapshot[];
  clicks?: { total: number; last30: number };
  videos?: { id: string; title: string; note: string | null; url: string; campaign_id: string | null; created_at: string }[];
  referrals?: { name: string; approved: number; paid: boolean; joined: string }[];
};
type LoadState = { phase: "loading" } | { phase: "guest" } | { phase: "error"; message: string } | { phase: "ready"; me: Me };

const HASH: Record<ClipperTab, string> = { home: "#accueil", campaigns: "#campagnes", submit: "#soumettre", clips: "#clips", ranking: "#classement", payments: "#paiements", profile: "#profil", charter: "#charte" };
const SEEN_KEY = "investpro-clip-seen";
const CHECKS = ["Sous-titres et accroche dans les 2 premières secondes", "Aucune promesse de gains ni montant gagné", "Mon lien traqué est dans ma bio"];

function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function euroShort(value: number): string {
  return formatEuro(value).replace(/,00\s/, " ");
}

function inDays(days: number): string {
  return days === 0 ? "aujourd'hui" : days === 1 ? "demain" : `dans ${days} jours`;
}

function campaignState(campaign: CampaignRow, today: string): CampaignFilter {
  if (campaign.status === "ended" || campaign.ends_on < today) return "ended";
  if (campaign.starts_on > today) return "soon";
  return "live";
}

function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" rx="9" fill="none" stroke="#F0C575" strokeWidth="1.6" />
      <path d="M12.5 9.5v11l8.5-5.5z" fill="#F0C575" />
    </svg>
  );
}

function Brand() {
  return (
    <span className={styles.brand}>
      <BrandMark />
      <span className={styles.brandName}>InvestPro</span>
      <span className={styles.brandPill}>CLIP</span>
    </span>
  );
}

export default function ClipApp() {
  const to = useClipPath();
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  const load = useCallback(async () => {
    try {
      const me = await clipApi<Me>("/api/clip/me");
      setState({ phase: "ready", me });
    } catch (error) {
      if (error instanceof ClipApiError && error.status === 401) setState({ phase: "guest" });
      else setState({ phase: "error", message: error instanceof Error ? error.message : "Erreur de chargement." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Retour dans l'app (notification touchée, onglet rouvert) : l'espace se met à jour sans écran de chargement.
  const refresh = useCallback(async () => {
    try {
      const me = await clipApi<Me>("/api/clip/me");
      setState((current) => (current.phase === "ready" ? { phase: "ready", me } : current));
    } catch {
      // on garde l'écran actuel ; la prochaine ouverture réessaiera
    }
  }, []);

  useEffect(() => {
    let last = Date.now();
    const onShow = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      void refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [refresh]);

  if (state.phase === "loading") {
    return (
      <div className={styles.page}>
        <div className={styles.center}>
          <Loader2 size={28} className={styles.spin} aria-hidden="true" />
          <span className={styles.muted}>Chargement de ton espace…</span>
        </div>
      </div>
    );
  }

  if (state.phase === "guest") {
    return (
      <div className={styles.page}>
        <ClipBackdrop />
        <div className={styles.app} style={{ position: "relative", zIndex: 1 }}>
          <header className={styles.topbar}><Brand /></header>
          <main className={styles.main} style={{ paddingBottom: 48 }}>
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h1 className={styles.h1}>Espace clippeurs</h1>
              <p className={styles.soft} style={{ margin: 0 }}>Tu clippes le contenu d&apos;Enrick, tu publies sur tes comptes et chaque clip validé te rapporte. Connecte-toi pour retrouver tes clips et tes paiements.</p>
            </section>
            <ClipLogin onDone={() => { setState({ phase: "loading" }); void load(); }} />
          </main>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className={styles.page}>
        <div className={styles.center}>
          <p className={styles.error}>{state.message}</p>
          <button type="button" className={styles.btnGhost} onClick={() => { setState({ phase: "loading" }); void load(); }}>Réessayer</button>
        </div>
      </div>
    );
  }

  const me = state.me;
  if (!me.clipper) {
    const candidate = me.candidate;
    return (
      <div className={styles.page}>
        <ClipBackdrop />
        <div className={styles.center} style={{ position: "relative", zIndex: 1 }}>
          <BrandMark size={48} />
          {candidate?.status === "new" ? (
            <>
              <h1 className={styles.h1}>Candidature envoyée</h1>
              <p className={styles.soft}>Préviens Enrick sur WhatsApp avec le message tout prêt : dès qu&apos;il accepte ta demande, ton espace s&apos;ouvre ici.</p>
              <a href={enrickWhatsApp(candidateWhatsAppText(candidate.display_name))} target="_blank" rel="noopener noreferrer" className={`${styles.btn} ${styles.btnBlock}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.5-4.3a8.4 8.4 0 1 1 15.5-4.6z" /></svg>
                Prévenir Enrick sur WhatsApp
              </a>
              <button type="button" className={`${styles.btnGhost} ${styles.btnBlock}`} onClick={() => { setState({ phase: "loading" }); void load(); }}>Ma demande est acceptée ? Actualiser</button>
              <h2 className={styles.h3} style={{ alignSelf: "stretch", textAlign: "left", marginTop: 10 }}>En attendant, tu peux déjà commencer</h2>
              <StartSlides slides={startSlides("join")} label="En attendant, tu peux déjà commencer" />
            </>
          ) : candidate?.status === "refused" ? (
            <>
              <h1 className={styles.h1}>Pas pour cette fois</h1>
              <p className={styles.soft}>Ta candidature n&apos;a pas été retenue pour le moment. Tu seras recontacté si une place se libère.</p>
            </>
          ) : (
            <>
              <h1 className={styles.h1}>Rejoins les clippeurs</h1>
              <p className={styles.soft}>Ton compte n&apos;a pas encore d&apos;espace clippeur. Envoie ta candidature en 2 minutes.</p>
              <Link href={to("/clip")} className={`${styles.btn} ${styles.btnBlock}`}>Envoyer ma candidature</Link>
            </>
          )}
          {me.owner ? <Link href={to("/clip/admin")} className={`${styles.btnGhost} ${styles.btnBlock}`}>Ouvrir l&apos;espace admin</Link> : null}
          <button type="button" className={styles.linkBtn} onClick={async () => { await clipSignOut(); window.location.href = clipPathNow("/clip/login"); }}>Changer de compte</button>
        </div>
      </div>
    );
  }

  return <ClipperSpace me={me} clipper={me.clipper} reload={load} />;
}

export type ClipPreview = { name: string; backHref: string };

/** Espace d'un clippeur. En aperçu (admin), rien n'est envoyé ni enregistré. */
export function ClipperSpace({ me, clipper, reload, preview = null }: { me: Me; clipper: Clipper; reload: () => Promise<void>; preview?: ClipPreview | null }) {
  const [tab, setTabState] = useState<ClipperTab>("home");
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>("live");
  const [openCampaign, setOpenCampaign] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [day, setDay] = useState(todayIso());
  const [submitCampaign, setSubmitCampaign] = useState<string | null>(null);
  const [checks, setChecks] = useState<boolean[]>([false, false, false]);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [clipFilter, setClipFilter] = useState<"all" | ClipChipState>("all");
  const [showAll, setShowAll] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [refCopied, setRefCopied] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const startKey = `ipc-start-${clipper.id}`;
  // Bandeau « nouvelle vidéo » : affiché jusqu'à ce que le clippeur ouvre l'onglet Campagnes.
  const tickerKey = `ipc-ticker-${clipper.id}`;
  const [tickerSeen, setTickerSeen] = useState<number | null>(null);
  const [tickerReady, setTickerReady] = useState(false);
  const push = useClipPush(!preview);

  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      if (!preview) {
        setSeenAt(window.localStorage.getItem(SEEN_KEY));
        if (!window.localStorage.getItem(startKey)) setStartOpen(true);
        const seen = Number(window.localStorage.getItem(tickerKey));
        if (Number.isFinite(seen) && seen > 0) setTickerSeen(seen);
      }
    } catch {
      setSeenAt(null);
    }
    setTickerReady(true);
    const fromHash = (Object.entries(HASH) as [ClipperTab, string][]).find(([, hash]) => hash === window.location.hash)?.[0];
    if (fromHash) setTabState(fromHash);
  }, []);

  // Notification touchée alors que l'app est déjà ouverte : l'adresse passe à #campagnes, l'onglet suit.
  useEffect(() => {
    const onHash = () => {
      const fromHash = (Object.entries(HASH) as [ClipperTab, string][]).find(([, hash]) => hash === window.location.hash)?.[0];
      if (!fromHash) return;
      setTabState(fromHash);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Les nouveautés du bandeau sont vues dès que le clippeur ouvre l'onglet Campagnes.
  useEffect(() => {
    if (tab !== "campaigns" || preview) return;
    const stamp = Date.now();
    try {
      window.localStorage.setItem(tickerKey, String(stamp));
    } catch {
      // pas de mémoire locale : le bandeau reviendra à la prochaine visite
    }
    setTickerSeen(stamp);
  }, [tab, preview, tickerKey]);

  const setTab = useCallback((next: ClipperTab) => {
    setTabState(next);
    try {
      window.history.replaceState(null, "", HASH[next]);
    } catch {
      // la navigation reste possible sans l'adresse
    }
    window.scrollTo({ top: 0 });
  }, []);

  const now = useMemo(() => new Date(), [me]);
  const today = todayIso();
  const clips = useMemo(() => me.clips ?? [], [me.clips]);
  const campaigns = useMemo(() => me.campaigns ?? [], [me.campaigns]);
  const accounts = useMemo(() => me.accounts ?? [], [me.accounts]);
  const payouts = useMemo(() => me.payouts ?? [], [me.payouts]);
  const byId = useMemo(() => new Map<string, CampaignRow>(campaigns.map((campaign): [string, CampaignRow] => [campaign.id, campaign])), [campaigns]);
  const summary = useMemo(() => summarize(clips, now), [clips, now]);
  const referrals = useMemo(() => me.referrals ?? [], [me.referrals]);
  const referral = referralDue(referrals);
  // Vues gagnées par jour (même calcul que la courbe de l'admin) : les 30 derniers jours et les 30 d'avant.
  const statDay = dayNumber(now.getTime());
  const gains30 = useMemo(() => viewGains(clips, me.viewSnapshots ?? [], statDay - 29, 30), [clips, me.viewSnapshots, statDay]);
  const gainsBefore = useMemo(() => viewGains(clips, me.viewSnapshots ?? [], statDay - 59, 30), [clips, me.viewSnapshots, statDay]);
  const views30 = gains30.daily.reduce((sum, value) => sum + value, 0);
  const viewsBefore = gainsBefore.daily.reduce((sum, value) => sum + value, 0);
  const rankRows = (limit: number): RankingRow[] => {
    const top = me.ranking?.top ?? [];
    const rows = top.slice(0, limit).map((entry): RankingRow => ({ key: `${entry.position}-${entry.name}`, position: entry.position, initials: initialsOf(entry.name), name: entry.me ? `Toi · ${entry.name}` : entry.name, detail: plural(entry.clips, "clip"), views: compact(entry.views), me: entry.me }));
    const rankNow = me.rank;
    if (rankNow && rankNow.views > 0 && !rows.some((row) => row.me)) {
      rows.push({ key: "moi", position: rankNow.position, initials: initialsOf(clipper.display_name), name: "Toi", detail: plural(me.ranking?.clips ?? 0, "clip"), views: compact(rankNow.views), me: true });
    }
    return rows;
  };
  const rankEmpty = "Le classement démarre avec les premières vues relevées ce mois-ci. Envoie tes clips : leurs vues TikTok et YouTube sont relevées toutes seules et tu peux être en tête dès cette semaine.";
  const viewsLine = views30 > 0 ? `Tes vues sur 30 jours : ${compact(views30)}${viewsBefore > 0 ? ` (${views30 >= viewsBefore ? "+" : "−"}${Math.abs(Math.round((views30 / viewsBefore - 1) * 100))} %)` : ""}` : "Tes vues apparaîtront ici dès qu'elles seront relevées.";
  const acquiredTotal = summary.acquired + referral.amount;
  const received = payouts.reduce((sum, payout) => sum + num(payout.total), 0);
  const cycle = summary.cycle;
  const progress = cycleProgress(cycle, now);
  const payIn = daysUntil(cycle.payDate, now);
  const mineIn = (campaignId: string) => clips.filter((clip) => clip.campaign_id === campaignId && clip.status !== "rejected").length;
  const live = campaigns.filter((campaign) => campaignState(campaign, today) === "live").sort((a, b) => a.ends_on.localeCompare(b.ends_on));
  const methodLabel = clipper.payout_method ? PAYOUT_LABEL[clipper.payout_method] : null;
  const trackUrl = origin ? trackedLink(origin, clipper.tracking_code) : "";
  const bellDot = clips.some((clip) => clip.status !== "review" && clip.reviewed_at && (!seenAt || clip.reviewed_at > seenAt));

  async function profileAction(action: () => Promise<unknown>, success: string): Promise<boolean> {
    if (preview) {
      setProfileMessage({ kind: "error", text: "Aperçu : rien n'est enregistré, c'est l'écran de ton clippeur." });
      return false;
    }
    setProfileBusy(true);
    setProfileMessage(null);
    try {
      await action();
      setProfileMessage({ kind: "ok", text: success });
      await reload();
      return true;
    } catch (error) {
      setProfileMessage({ kind: "error", text: error instanceof Error ? error.message : "Enregistrement impossible." });
      return false;
    } finally {
      setProfileBusy(false);
    }
  }

  async function copyReferral() {
    const link = origin ? referralLink(origin, clipper.tracking_code) : "";
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setRefCopied(true);
      window.setTimeout(() => setRefCopied(false), 2000);
    } catch {
      setRefCopied(false);
    }
  }

  async function copyLink() {
    if (!trackUrl) return;
    try {
      await navigator.clipboard.writeText(trackUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function openBell() {
    const stamp = new Date().toISOString();
    try {
      if (!preview) window.localStorage.setItem(SEEN_KEY, stamp);
    } catch {
      // pas de mémoire locale : la pastille réapparaîtra
    }
    setSeenAt(stamp);
    setTab("clips");
  }

  function closeStart() {
    setStartOpen(false);
    try {
      if (!preview) window.localStorage.setItem(startKey, new Date().toISOString());
    } catch {
      // pas de mémoire locale : la fenêtre se rouvrira à la prochaine visite
    }
  }

  function startSubmit(campaignId: string | null) {
    setSubmitCampaign(campaignId);
    setSent(false);
    setSubmitError(null);
    setTab("submit");
  }

  // Bandeau défilant : vidéos et campagnes publiées ces 3 derniers jours, pas encore vues.
  const tickerItems: string[] = [];
  if (tickerReady) {
    const unseen = (iso: string) => {
      const at = new Date(iso).getTime();
      return now.getTime() - at < 3 * 86_400_000 && (Boolean(preview) || tickerSeen === null || at > tickerSeen);
    };
    const newVideos = (me.videos ?? []).filter((video) => unseen(video.created_at));
    if (newVideos.length === 1) tickerItems.push(`🎬 Enrick a posté une nouvelle vidéo : « ${newVideos[0].title} », à toi de la clipper !`);
    else if (newVideos.length > 1) tickerItems.push(`🎬 Enrick a posté ${newVideos.length} nouvelles vidéos : ${newVideos.slice(0, 3).map((video) => `« ${video.title} »`).join(", ")}${newVideos.length > 3 ? "…" : "."} À toi de les clipper !`);
    for (const campaign of campaigns) {
      if (campaignState(campaign, today) === "live" && unseen(campaign.created_at)) tickerItems.push(`🚀 Nouvelle campagne : « ${campaign.title} »`);
    }
  }
  const openNews = () => {
    setCampaignFilter("live");
    setTab("campaigns");
  };

  let screen: ReactNode = null;

  if (tab === "home") {
    const todos: HomeTodo[] = [];
    if (!accounts.length) todos.push({ key: "accounts", icon: "alert", tone: "warn", title: "Ajoute tes comptes", sub: "TikTok, Instagram, YouTube, Facebook, Snapchat ou X : sans eux, tes clips ne peuvent pas être validés.", cta: "Ajouter", primary: true, onClick: () => setTab("profile") });
    const unverified = accounts.filter((account) => !account.verified);
    if (accounts.length && unverified.length) todos.push({ key: "verify", icon: "link", tone: "warn", title: unverified.length > 1 ? `${unverified.length} comptes en vérification` : `@${unverified[0].handle} en vérification`, sub: "Enrick vérifie qu'ils t'appartiennent avant de valider tes clips.", cta: "Voir", primary: false, onClick: () => setTab("profile") });
    if (!clipper.payout_method) todos.push({ key: "payout", icon: "wallet", tone: "warn", title: "Choisis comment être payé", sub: "Crypto, PayPal ou virement.", cta: "Choisir", primary: true, onClick: () => setTab("profile") });
    const freshVideos = (me.videos ?? []).filter((video) => now.getTime() - new Date(video.created_at).getTime() < 3 * 86_400_000);
    if (freshVideos.length) todos.push({ key: "videos", icon: "film", tone: "teal", title: freshVideos.length > 1 ? `${freshVideos.length} nouvelles vidéos à clipper` : `Nouvelle vidéo : ${freshVideos[0].title}`, sub: "Enrick vient de les poster, à toi de les couper.", cta: "Voir", primary: true, onClick: () => { setCampaignFilter("live"); setTab("campaigns"); } });
    if (push.state === "off") todos.push({ key: "notifs", icon: "bell", tone: "teal", title: "Active les notifications", sub: push.error ?? "Sois prévenu sur ton téléphone dès qu'Enrick publie une vidéo.", cta: push.busy ? "Patiente…" : "Activer", primary: false, onClick: () => { void push.enable(); } });
    if (!clips.length) todos.push({ key: "start", icon: "film", tone: "teal", title: "Commence avec mes vidéos TikTok", sub: "Coupe-les et republie-les sur tes comptes, en attendant les vidéos longues.", cta: "Comment ?", primary: false, onClick: () => setStartOpen(true) });
    for (const campaign of live.slice(0, 2)) {
      const left = campaign.quota_per_clipper - mineIn(campaign.id);
      if (left > 0) todos.push({ key: `c-${campaign.id}`, icon: "flag", tone: "teal", title: `Plus que ${plural(left, "clip")} pour « ${campaign.title} »`, sub: `Fin de la campagne le ${dayMonth(campaign.ends_on)}`, cta: "Voir", primary: false, onClick: () => { setOpenCampaign(campaign.id); setCampaignFilter("live"); setTab("campaigns"); } });
    }
    const rank = me.rank;
    screen = (
      <ClipperHome v={{
        firstName: firstNameOf(clipper.display_name),
        subline: rank && rank.total > 1 && rank.views > 0 ? `${rankLabel(rank.position)} sur ${rank.total} ce mois-ci · réf. ${clipper.ref}` : `Réf. ${clipper.ref} · ${clipper.status === "test" ? "période de test" : clipper.status === "paused" ? "compte en pause" : "clippeur actif"}`,
        payDateShort: shortDay(cycle.payDate),
        acquired: formatEuro(acquiredTotal),
        pendingText: null,
        inDays: inDays(payIn),
        cycleLabel: `Cycle du ${dateRange(cycle.start, cycle.end).replace(/^Du /, "")}`,
        cycleDay: progress.day,
        cycleLength: progress.length,
        methodLine: methodLabel ? `Versement : ${methodLabel}` : "Choisis ton moyen de paiement",
        methodMissing: !methodLabel,
        acquiredClips: summary.acquiredClips ? plural(summary.acquiredClips, "clip validé", "clips validés") : referral.count ? "prime de parrainage" : "aucun clip validé",
        received: euroShort(received),
        receivedNote: payouts.length ? plural(payouts.length, "versement") : "aucun versement",
        review: plural(summary.review, "clip"),
        reviewNote: "réponse sous 24 h",
        todos,
        campaigns: live.map((campaign) => {
          const mine = mineIn(campaign.id);
          return { id: campaign.id, title: campaign.title, progress: `${mine} / ${campaign.quota_per_clipper} clips`, pct: pct(mine, campaign.quota_per_clipper), meta: `${campaign.platforms} · fin le ${dayMonth(campaign.ends_on)}` };
        }),
        linkLabel: trackUrl.replace(/^https?:\/\//, "") || "Chargement…",
        linkStats: `${formatInt(me.clicks?.total ?? 0)} clic${(me.clicks?.total ?? 0) > 1 ? "s" : ""} sur ton lien`,
        copied,
        onCopyLink: () => void copyLink(),
        onPayments: () => setTab("payments"),
        onCampaigns: () => setTab("campaigns"),
        ranking: {
          place: rank && rank.views > 0 ? `${rankLabel(rank.position)} sur ${rank.total}` : "par vues",
          rows: rankRows(3),
          empty: rankEmpty,
          viewsLine,
          onOpen: () => setTab("ranking"),
        },
        referral: {
          link: origin ? referralLink(origin, clipper.tracking_code).replace(/^https?:\/\//, "") : "Chargement…",
          copied: refCopied,
          onCopy: () => void copyReferral(),
          pitch: `Invite un clippeur avec ce lien : quand il a ${REFERRAL_CLIPS} clips validés, tu touches ${euroShort(REFERRAL_BONUS)}.`,
          summary: referrals.length ? `${plural(referrals.length, "filleul")}${referral.amount ? ` · ${euroShort(referral.amount)} de primes à recevoir` : ""}` : "Pas encore de filleul.",
          list: referrals.slice(0, 5).map((item) => ({
            name: item.name,
            progress: `${Math.min(item.approved, REFERRAL_CLIPS)} / ${REFERRAL_CLIPS} clips validés`,
            status: item.paid ? "Prime versée" : item.approved >= REFERRAL_CLIPS ? `+${euroShort(REFERRAL_BONUS)} acquis` : "En cours",
            done: item.paid || item.approved >= REFERRAL_CLIPS,
          })),
        },
      }} />
    );
  }

  if (tab === "campaigns") {
    const all = campaigns.map((campaign) => ({ campaign, state: campaignState(campaign, today) }));
    const counts = { live: 0, soon: 0, ended: 0 } as Record<CampaignFilter, number>;
    for (const item of all) counts[item.state] += 1;
    const visible = all.filter((item) => item.state === campaignFilter).sort((a, b) => campaignFilter === "ended" ? b.campaign.ends_on.localeCompare(a.campaign.ends_on) : campaignFilter === "soon" ? a.campaign.starts_on.localeCompare(b.campaign.starts_on) : a.campaign.ends_on.localeCompare(b.campaign.ends_on));
    const openId = openCampaign && visible.some((item) => item.campaign.id === openCampaign) ? openCampaign : visible.find((item) => item.state === "live")?.campaign.id ?? null;
    const cards: CampaignCard[] = visible.map(({ campaign, state: cardState }) => {
      const startsIn = daysUntil(campaign.starts_on, now);
      return {
        id: campaign.id,
        platforms: campaign.platforms,
        state: cardState,
        stateLabel: cardState === "live" ? "En cours" : cardState === "ended" ? "Terminée" : startsIn <= 1 ? "Demain" : `Dans ${startsIn} j`,
        title: campaign.title,
        dates: `${dateRange(campaign.starts_on, campaign.ends_on)} · ${campaign.quota_per_clipper} clips par clippeur`,
        mine: mineIn(campaign.id),
        quota: campaign.quota_per_clipper,
        brief: campaign.brief.split("\n").map((line) => line.trim()).filter(Boolean),
        forbidden: campaign.forbidden,
        rushesUrl: campaign.rushes_url,
        open: campaign.id === openId,
      };
    });
    const videos = (me.videos ?? []).map((video) => {
      const campaign = video.campaign_id ? byId.get(video.campaign_id) : undefined;
      return {
        id: video.id,
        title: video.title,
        note: video.note,
        meta: `${campaign ? `${campaign.title} · ` : ""}posté ${ago(video.created_at, now)}`,
        url: video.url,
        isNew: now.getTime() - new Date(video.created_at).getTime() < 3 * 86_400_000,
      };
    });
    screen = <ClipperCampaigns v={{ filter: campaignFilter, counts, cards, videos, sources: [
      { key: "tiktok", title: "Toutes mes vidéos TikTok", sub: `${ENRICK_TIKTOK_HANDLE} : coupe-les et republie-les sur tes réseaux, dès maintenant.`, url: ENRICK_TIKTOK_URL },
      { key: "youtube", title: "Ma chaîne YouTube", sub: `${ENRICK_YOUTUBE_HANDLE} : mes vidéos longues et mes lives, à découper aussi.`, url: ENRICK_YOUTUBE_URL },
    ], setFilter: setCampaignFilter, openCard: setOpenCampaign, submitFor: (id) => startSubmit(id) }} />;
  }

  if (tab === "submit") {
    const platform = link.trim() ? platformFromUrl(link) : null;
    const onPlatform = platform ? accounts.filter((account) => account.platform === platform) : [];
    const handle = platform === "tiktok" ? tiktokHandleFromUrl(link) : null;
    const ok = platform ? onPlatform.length > 0 && (!handle || onPlatform.some((account) => account.handle === handle)) : false;
    const selected = submitCampaign && live.some((campaign) => campaign.id === submitCampaign) ? submitCampaign : live.length === 1 ? live[0].id : null;
    const allChecked = checks.every(Boolean);
    const missing = !link.trim() ? "Colle le lien de ton clip" : !platform ? "Colle le lien d'une vidéo publiée" : !selected ? "Choisis une campagne" : !allChecked ? "Coche les 3 points pour envoyer" : "";
    screen = (
      <ClipperSubmit v={{
        link,
        onLink: (event) => { setLink(event.target.value); setSubmitError(null); },
        day,
        maxDay: todayIso(),
        onDay: (event) => setDay(event.target.value),
        detected: platform ? {
          title: handle ? `@${handle} · ${PLATFORM_LABEL[platform]}` : PLATFORM_LABEL[platform],
          account: ok ? (handle ? "Compte de ton profil" : `Compte ${PLATFORM_LABEL[platform]} de ton profil : ${onPlatform.map((account) => `@${account.handle}`).join(", ")}`) : onPlatform.length ? `@${handle} n'est pas dans ton profil : ajoute-le d'abord` : `Ajoute ton compte ${PLATFORM_LABEL[platform]} dans ton profil`,
          ok,
          views: "Enrick regarde ton clip et le valide sous 24 h",
        } : null,
        linkError: link.trim() && !platform ? `Colle le lien complet de ta vidéo (${NETWORKS_TEXT}), qui commence par https://.` : null,
        campaigns: live.map((campaign) => {
          const mine = mineIn(campaign.id);
          const quota = campaign.quota_per_clipper;
          const note = mine >= quota ? `objectif atteint (${mine} / ${quota}), tu peux continuer` : mine + 1 === quota ? `ton ${mine + 1}e et dernier clip de la campagne` : `ton ${rankLabel(mine + 1)} clip sur ${quota}`;
          return { id: campaign.id, title: campaign.title, note, selected: campaign.id === selected };
        }),
        pick: (id) => setSubmitCampaign(id),
        checks: CHECKS.map((label, index) => ({ label, on: checks[index], toggle: () => setChecks((current) => current.map((value, i) => (i === index ? !value : value))) })),
        freezeNote: "Dès qu'Enrick le valide, il compte dans ton prochain versement.",
        canSend: !missing && !submitBusy,
        missing: missing || "Envoi…",
        busy: submitBusy,
        error: submitError,
        sent,
        send: async () => {
          if (missing || !selected) return;
          if (preview) {
            setSubmitError("Aperçu : l'envoi est désactivé, c'est l'écran de ton clippeur.");
            return;
          }
          setSubmitBusy(true);
          setSubmitError(null);
          try {
            await clipApi("/api/clip/clips", { method: "POST", body: { url: link.trim(), campaign_id: selected, published_on: day, checks: [true, true, true] } });
            setSent(true);
            setLink("");
            setChecks([false, false, false]);
            await reload();
          } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "Envoi impossible.");
          } finally {
            setSubmitBusy(false);
          }
        },
        again: () => { setSent(false); setDay(todayIso()); },
        onClips: () => setTab("clips"),
        onProfile: () => setTab("profile"),
        noAccounts: !accounts.length,
      }} />
    );
  }

  if (tab === "clips") {
    const items = [...clips].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((clip) => ({ clip, state: clipState(clip) }));
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.state, (counts.get(item.state) ?? 0) + 1);
    const filtered = items.filter((item) => clipFilter === "all" || item.state === clipFilter);
    const limit = showAll ? filtered.length : 12;
    const shown = filtered.slice(0, limit);
    const rest = filtered.slice(limit);
    const latest = clips.reduce<string | null>((max, clip) => (clip.views_updated_at && (!max || clip.views_updated_at > max) ? clip.views_updated_at : max), null);
    const inCycle = clips.filter((clip) => clip.published_at.slice(0, 10) >= cycle.start && clip.published_at.slice(0, 10) <= cycle.end).length;
    const chipDefs: { key: "all" | ClipChipState; label: string }[] = [
      { key: "all", label: "Tous" },
      { key: "review", label: "En revue" },
      { key: "validated", label: "Validés" },
      { key: "paid", label: "Payés" },
      { key: "rejected", label: "Refusés" },
    ];
    const toItem = ({ clip, state: itemState }: { clip: ClipRow; state: ClipChipState }): ClipItem => {
      const campaign = byId.get(clip.campaign_id);
      const views = clipViewsOf(clip);
      const value = clipValue(clip);
      const bonus = num(clip.bonus);
      const note = itemState === "review" ? "réponse sous 24 h" : itemState === "rejected" ? clip.reject_reason ?? "" : itemState === "validated" ? (bonus > 0 ? `acquis, dont ${euroShort(bonus)} de bonus` : "acquis") : bonus > 0 ? `versé, dont ${euroShort(bonus)} de bonus` : "versé";
      return {
        id: clip.id,
        title: clip.title,
        meta: `${PLATFORM_LABEL[clip.platform]} · ${campaign?.title ?? "campagne"} · ${dayMonth(clip.published_at)}`,
        state: itemState,
        note,
        views: views > 0 ? `${compact(views)} vues` : "—",
        money: itemState === "review" ? "en revue" : itemState === "rejected" ? "0 €" : formatEuro(value),
        url: clip.url,
      };
    };
    screen = (
      <ClipperClips v={{
        subline: `${plural(inCycle, "clip")} ce cycle · ${latest ? `vues mises à jour ${ago(latest, now)}` : "vues TikTok et YouTube relevées toutes les 3 h"}`,
        chips: chipDefs.filter((chip) => chip.key === "all" || counts.get(chip.key)).map((chip) => ({ key: chip.key, label: `${chip.label} · ${chip.key === "all" ? items.length : counts.get(chip.key) ?? 0}`, on: clipFilter === chip.key, pick: () => { setClipFilter(chip.key); setShowAll(false); } })),
        clips: shown.map(toItem),
        more: rest.length ? { label: `+ ${plural(rest.length, "autre clip", "autres clips")}`, show: () => setShowAll(true) } : null,
        emptyLabel: items.length ? "Aucun clip dans ce filtre." : "Pas encore de clip : publie ta première vidéo puis colle son lien dans « Soumettre ».",
      }} />
    );
  }

  if (tab === "ranking") {
    const rankNow = me.rank;
    const ahead = me.ranking?.ahead ?? null;
    const placed = Boolean(rankNow && rankNow.views > 0);
    const rows = rankRows(10);
    const shown = rows.length;
    const byPlatform = new Map<ClipPlatform, number>();
    for (const [clipId, gained] of gains30.byClip) {
      const clip = clips.find((item) => item.id === clipId);
      if (clip) byPlatform.set(clip.platform, (byPlatform.get(clip.platform) ?? 0) + gained);
    }
    const delta = viewsBefore > 0 ? Math.round((views30 / viewsBefore - 1) * 100) : null;
    const monthLabel = monthName(today);
    screen = (
      <ClipperRanking v={{
        subline: `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} · classés par vues · repart à zéro le 1er du mois`,
        place: placed && rankNow ? {
          position: rankLabel(rankNow.position),
          context: `sur ${plural(rankNow.total, "clippeur")} · ${compact(rankNow.views)} vues`,
          ahead: ahead ? { text: `Pour dépasser ${ahead.name}`, gap: `encore ${compact(ahead.gap)} vues`, pct: Math.max(4, Math.min(100, Math.round((rankNow.views / (rankNow.views + ahead.gap)) * 100))) } : null,
          leader: rankNow.position === 1,
        } : null,
        noPlace: "Pas encore classé ce mois-ci : tes clips comptent dès l'envoi, avec leurs vues relevées automatiquement.",
        rows,
        others: rankNow && rankNow.total - shown - (rows.some((row) => row.me) ? 0 : 1) > 0 ? `+ ${plural(rankNow.total - shown - (rows.some((row) => row.me) ? 0 : 1), "autre clippeur", "autres clippeurs")}` : null,
        empty: rankEmpty,
        views: {
          total: `${compact(views30)} vues`,
          delta: delta === null || views30 <= 0 ? null : `${delta >= 0 ? "+" : "−"}${Math.abs(delta)} % vs les 30 jours d'avant`,
          up: (delta ?? 0) >= 0,
          daily: gains30.daily,
          labels: [dayMonth(dayIso(statDay - 29)), dayMonth(dayIso(statDay - 15)), dayMonth(dayIso(statDay))],
          platforms: [...byPlatform.entries()].filter(([, gained]) => gained > 0).sort((a, b) => b[1] - a[1]).map(([platform, gained]) => ({ label: PLATFORM_LABEL[platform], value: compact(gained), pct: views30 > 0 ? Math.round((gained / views30) * 100) : 0 })),
        },
      }} />
    );
  }

  if (tab === "payments") {
    const steps: PayStep[] = [
      { title: `${dayMonth(cycle.start)} · début du cycle`, sub: "Chaque clip validé s'ajoute au fur et à mesure", state: "done" },
      { title: `${dayMonth(cycle.end)} à 23 h 59 · clôture`, sub: `Le montant est arrêté · ${inDays(daysUntil(cycle.end, now))}`, state: "current" },
      { title: `${shortDay(cycle.payDate)} · versement`, sub: methodLabel ? `Paiement : ${methodLabel}` : "Choisis d'abord ton moyen de paiement", state: "todo" },
      { title: "Juste après · la preuve", sub: "Le reçu arrive ici, avec la référence du virement", state: "todo" },
    ];
    screen = (
      <ClipperPayments v={{
        cycleChip: `Cycle ${dayMonth(cycle.start)}–${dayMonth(cycle.end)}`,
        acquired: formatEuro(acquiredTotal),
        pendingText: summary.review ? `+ ${plural(summary.review, "clip")} en revue` : null,
        pendingUntil: "",
        payDateLong: `${longDay(cycle.payDate)} · ${inDays(payIn)}`,
        methodLine: methodLabel ? `${methodLabel}${clipper.payout_details ? ` · ${maskDetails(clipper.payout_details)}` : ""}` : "Pas encore choisi",
        methodMissing: !methodLabel,
        calc: [
          { label: summary.acquiredClips ? plural(summary.acquiredClips, "clip validé", "clips validés") : "Aucun clip validé", value: formatEuro(summary.acquired) },
          { label: referral.count ? `Parrainage · ${plural(referral.count, "filleul")}` : "Parrainage", value: formatEuro(referral.amount) },
        ],
        total: formatEuro(acquiredTotal),
        scale: `Chaque clip validé compte, bonus compris. Versement le 1er et le 16 du mois, dès ${euroShort(MIN_PAYOUT)} acquis : en dessous, ça passe au versement suivant.`,
        steps,
        history: payouts.map((payout) => ({
          id: payout.id,
          title: `${payout.ref} · ${shortDay(payout.paid_at)}`,
          sub: `Cycle ${dayMonth(payout.cycle_start)}–${dayMonth(payout.cycle_end)} · ${plural(payout.clips_count, "clip")}${num(payout.referral_amount) > 0 ? ` · parrainage ${euroShort(num(payout.referral_amount))}` : ""}${payout.proof ? ` · ${maskDetails(payout.proof)}` : ""}`,
          amount: formatEuro(num(payout.total)),
        })),
        onProfile: () => setTab("profile"),
      }} />
    );
  }

  if (tab === "profile") {
    screen = (
      <ClipperProfile v={{
        initials: initialsOf(clipper.display_name),
        name: clipper.display_name,
        refLine: `Réf. ${clipper.ref} · clippeur depuis ${monthName(clipper.created_at)}`,
        status: clipper.status,
        accounts: accounts.map((account) => ({ id: account.id, short: PLATFORM_SHORT[account.platform], handle: account.handle, sub: `${PLATFORM_LABEL[account.platform]}${account.followers !== null ? ` · ${compact(account.followers)} abonnés` : ""}`, verified: account.verified })),
        methods: PAYOUT_METHODS.map((key) => ({ key, name: PAYOUT_LABEL[key], detail: clipper.payout_method === key ? maskDetails(clipper.payout_details) || "à compléter" : PAYOUT_HINT[key], on: clipper.payout_method === key, hint: PAYOUT_HINT[key] })),
        payoutDetails: clipper.payout_details ?? "",
        infos: [
          { key: "display_name", label: "Nom affiché", value: clipper.display_name, placeholder: "Prénom et initiale" },
          { key: "whatsapp", label: "WhatsApp", value: clipper.whatsapp ?? "", placeholder: "+33612345678" },
          { key: "telegram", label: "Telegram (facultatif)", value: clipper.telegram ? `@${clipper.telegram}` : "", placeholder: "@pseudo" },
        ],
        payoutCount: payouts.length,
        owner: me.owner,
        message: profileMessage,
        busy: profileBusy,
        addAccount: (platform, handle, followers) => profileAction(() => clipApi("/api/clip/me", { method: "POST", body: { action: "add_account", platform, handle, followers: followers || null } }), "Compte ajouté : Enrick le vérifie."),
        removeAccount: (id) => profileAction(() => clipApi("/api/clip/me", { method: "POST", body: { action: "remove_account", id } }), "Compte retiré."),
        savePayout: (method, details) => profileAction(() => clipApi("/api/clip/me", { method: "PATCH", body: { payout_method: method, payout_details: details } }), "Moyen de paiement enregistré."),
        saveInfo: (key, value) => profileAction(() => clipApi("/api/clip/me", { method: "PATCH", body: { [key]: key === "telegram" ? value.replace(/^@/, "") : value } }), "Infos enregistrées."),
        changePassword: (current, next) => profileAction(() => clipApi("/api/clip/me", { method: "POST", body: { action: "change_password", current, next } }), "Mot de passe changé."),
        contact: { label: ENRICK_WHATSAPP_LABEL, href: enrickWhatsApp(`Salut Enrick, c'est ${clipper.display_name} (${clipper.ref}). `) },
        notifications: {
          push: preview ? "preview" : push.state,
          pushBusy: push.busy,
          pushError: push.error,
          enablePush: () => { void push.enable(); },
          disablePush: () => { void push.disable(); },
          installApp: openClipInstall,
          emailOn: clipper.notify_email !== false,
          emailAddress: me.email,
          toggleEmail: () => {
            const next = clipper.notify_email === false;
            void profileAction(() => clipApi("/api/clip/me", { method: "PATCH", body: { notify_email: next } }), next ? "E-mails des nouvelles vidéos réactivés." : "E-mails des nouvelles vidéos coupés.");
          },
        },
        onCharter: () => setTab("charter"),
        onPayments: () => setTab("payments"),
        signOut: () => {
          if (preview) {
            window.location.href = preview.backHref;
            return;
          }
          // Ce téléphone arrête de recevoir les notifications de ce compte.
          void clipPushForget().then(() => clipSignOut()).then(() => { window.location.href = clipPathNow("/clip/login"); });
        },
      }} />
    );
  }

  if (tab === "charter") {
    screen = (
      <ClipperCharter v={{
        minPayout: euroShort(MIN_PAYOUT),
        referral: `Parrainage : ${euroShort(REFERRAL_BONUS)} pour toi quand un clippeur invité avec ton lien a ${REFERRAL_CLIPS} clips validés.`,
        onBack: () => setTab("profile"),
      }} />
    );
  }

  return (
    <ClipperShell initials={initialsOf(clipper.display_name)} active={tab} onTab={(next) => (next === "submit" ? startSubmit(submitCampaign) : setTab(next))} bellDot={Boolean(bellDot)} onBell={openBell} ticker={tickerItems.length && tab !== "submit" ? <ClipTicker items={tickerItems} onOpen={openNews} /> : null}>
      {preview ? (
        <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "8px 8px 8px 12px", borderRadius: "14px", background: "rgba(145,214,208,0.08)", border: "1px solid rgba(145,214,208,0.35)", fontSize: "12.5px", color: "#C4C8BD" }}>
          <span><b style={{ color: "#91D6D0" }}>Aperçu</b> · espace de {preview.name}, en lecture seule</span>
          <a href={preview.backHref} style={{ flexShrink: 0, display: "flex", alignItems: "center", minHeight: "40px", padding: "0 10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.18)", color: "#F3EFE6", fontSize: "12.5px", fontWeight: 800, textDecoration: "none" }}>Retour admin</a>
        </div>
      ) : null}
      {screen}
      {startOpen ? <StartPopup slides={startSlides("space")} firstName={firstNameOf(clipper.display_name)} onClose={closeStart} /> : null}
    </ClipperShell>
  );
}
