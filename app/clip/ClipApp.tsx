"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import styles from "./clip.module.css";
import ClipLogin from "./ClipLogin";
import { ClipApiError, clipApi, clipSignOut } from "@/lib/clip/client";
import {
  ENRICK_WHATSAPP_LABEL,
  MIN_PAYOUT,
  PAYOUT_HINT,
  PAYOUT_LABEL,
  PAYOUT_METHODS,
  PLATFORM_LABEL,
  PLATFORM_SHORT,
  clipAmount,
  clipState,
  cycleFor,
  cycleProgress,
  daysUntil,
  enrickWhatsApp,
  formatEuro,
  formatInt,
  freezeAt,
  num,
  platformFromUrl,
  summarize,
  tiktokHandleFromUrl,
  trackedLink,
  type CampaignRow,
  type ClipPlatform,
  type ClipRow,
  type PayoutMethod,
  type PayoutRow,
} from "@/lib/clip/rules";
import { ago, compact, dateRange, dayMonth, firstNameOf, initialsOf, longDay, maskDetails, monthName, ordinal, pct, plural, rankLabel, shortDay } from "@/lib/clip/format";
import { ClipperShell, type ClipperTab } from "./views/clipper/Shell";
import { ClipperHome, type HomeTodo } from "./views/clipper/Home";
import { ClipperCampaigns, type CampaignCard, type CampaignFilter } from "./views/clipper/Campaigns";
import { ClipperSubmit } from "./views/clipper/Submit";
import { ClipperClips, type ClipChipState, type ClipItem } from "./views/clipper/Clips";
import { ClipperPayments, type PayStep } from "./views/clipper/Payments";
import { ClipperProfile } from "./views/clipper/Profile";
import { ClipperCharter } from "./views/clipper/Charter";

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
  created_at: string;
};
type Account = { id: string; platform: ClipPlatform; handle: string; followers: number | null; verified: boolean; created_at: string };
type Candidate = { id: string; status: "new" | "accepted" | "refused"; created_at: string };
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
  clicks?: { total: number; last30: number };
};
type LoadState = { phase: "loading" } | { phase: "guest" } | { phase: "error"; message: string } | { phase: "ready"; me: Me };

const HASH: Record<ClipperTab, string> = { home: "#accueil", campaigns: "#campagnes", submit: "#soumettre", clips: "#clips", payments: "#paiements", profile: "#profil", charter: "#charte" };
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
        <div className={styles.app}>
          <header className={styles.topbar}><Brand /></header>
          <main className={styles.main} style={{ paddingBottom: 48 }}>
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h1 className={styles.h1}>Espace clippeurs</h1>
              <p className={styles.soft} style={{ margin: 0 }}>Tu clippes le contenu d&apos;Enrick, tu publies sur tes comptes et tu es payé selon tes vues. Connecte-toi pour retrouver tes clips et tes paiements.</p>
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
        <div className={styles.center}>
          <BrandMark size={48} />
          {candidate?.status === "new" ? (
            <>
              <h1 className={styles.h1}>Candidature envoyée</h1>
              <p className={styles.soft}>Enrick regarde ta candidature. Tu reçois la réponse sous 48 h sur WhatsApp, et ton espace s&apos;ouvre ici dès qu&apos;elle est acceptée.</p>
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
              <Link href="/clip/rejoindre" className={`${styles.btn} ${styles.btnBlock}`}>Envoyer ma candidature</Link>
            </>
          )}
          {me.owner ? <Link href="/clip/admin" className={`${styles.btnGhost} ${styles.btnBlock}`}>Ouvrir l&apos;espace admin</Link> : null}
          <button type="button" className={styles.linkBtn} onClick={async () => { await clipSignOut(); window.location.href = "/clip"; }}>Changer de compte</button>
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
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      if (!preview) setSeenAt(window.localStorage.getItem(SEEN_KEY));
    } catch {
      setSeenAt(null);
    }
    const fromHash = (Object.entries(HASH) as [ClipperTab, string][]).find(([, hash]) => hash === window.location.hash)?.[0];
    if (fromHash) setTabState(fromHash);
  }, []);

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
  const summary = useMemo(() => summarize(clips, campaigns, now), [clips, campaigns, now]);
  const cycle = summary.cycle;
  const progress = cycleProgress(cycle, now);
  const payIn = daysUntil(cycle.payDate, now);
  const mineIn = (campaignId: string) => clips.filter((clip) => clip.campaign_id === campaignId && clip.status !== "rejected").length;
  const live = campaigns.filter((campaign) => campaignState(campaign, today) === "live").sort((a, b) => a.ends_on.localeCompare(b.ends_on));
  const reference = live[0] ?? campaigns[0] ?? null;
  const rate = reference ? euroShort(num(reference.rate_per_1000)) : "1 €";
  const vip = reference ? euroShort(num(reference.vip_bonus)) : "20 €";
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

  function startSubmit(campaignId: string | null) {
    setSubmitCampaign(campaignId);
    setSent(false);
    setSubmitError(null);
    setTab("submit");
  }

  let screen: ReactNode = null;

  if (tab === "home") {
    const todos: HomeTodo[] = [];
    if (!accounts.length) todos.push({ key: "accounts", icon: "alert", tone: "warn", title: "Ajoute tes comptes", sub: "TikTok, Instagram ou YouTube : sans eux, tes clips ne peuvent pas être validés.", cta: "Ajouter", primary: true, onClick: () => setTab("profile") });
    const unverified = accounts.filter((account) => !account.verified);
    if (accounts.length && unverified.length) todos.push({ key: "verify", icon: "link", tone: "warn", title: unverified.length > 1 ? `${unverified.length} comptes en vérification` : `@${unverified[0].handle} en vérification`, sub: "Enrick vérifie qu'ils t'appartiennent avant de compter tes vues.", cta: "Voir", primary: false, onClick: () => setTab("profile") });
    if (!clipper.payout_method) todos.push({ key: "payout", icon: "wallet", tone: "warn", title: "Choisis comment être payé", sub: "USDT, Wise, PayPal ou virement.", cta: "Choisir", primary: true, onClick: () => setTab("profile") });
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
        acquired: formatEuro(summary.acquired),
        pendingText: summary.pending > 0 ? `+ environ ${euroShort(Math.round(summary.pending))} en cours` : null,
        inDays: inDays(payIn),
        cycleLabel: `Cycle du ${dateRange(cycle.start, cycle.end).replace(/^Du /, "")}`,
        cycleDay: progress.day,
        cycleLength: progress.length,
        methodLine: methodLabel ? `Versement en ${methodLabel}` : "Choisis ton moyen de paiement",
        methodMissing: !methodLabel,
        acquiredClips: summary.acquiredClips ? plural(summary.acquiredClips, "clip figé", "clips figés") : "aucun clip figé",
        pending: summary.pending ? `≈ ${euroShort(Math.round(summary.pending))}` : "0 €",
        pendingNote: summary.pendingClips ? `${plural(summary.pendingClips, "clip")}, figé${summary.pendingClips > 1 ? "s" : ""} d'ici le ${ordinal(Number(cycle.end.slice(8, 10)))}` : "aucun clip en cours",
        review: plural(summary.review, "clip"),
        reviewNote: "réponse sous 24 h",
        todos,
        campaigns: live.map((campaign) => {
          const mine = mineIn(campaign.id);
          return { id: campaign.id, title: campaign.title, progress: `${mine} / ${campaign.quota_per_clipper} clips`, pct: pct(mine, campaign.quota_per_clipper), meta: `${campaign.platforms} · fin le ${dayMonth(campaign.ends_on)}` };
        }),
        linkLabel: trackUrl.replace(/^https?:\/\//, "") || "Chargement…",
        linkStats: `${formatInt(me.clicks?.total ?? 0)} clic${(me.clicks?.total ?? 0) > 1 ? "s" : ""} · VIP ramenés : bientôt`,
        copied,
        onCopyLink: () => void copyLink(),
        onPayments: () => setTab("payments"),
        onCampaigns: () => setTab("campaigns"),
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
        rate: `${euroShort(num(campaign.rate_per_1000))} / 1 000 vues`,
        rateNote: `vues figées à J+7 · dès ${compact(campaign.min_views)} vues`,
        vip: `+${euroShort(num(campaign.vip_bonus))} / VIP`,
        brief: campaign.brief.split("\n").map((line) => line.trim()).filter(Boolean),
        forbidden: campaign.forbidden,
        rushesUrl: campaign.rushes_url,
        open: campaign.id === openId,
      };
    });
    screen = <ClipperCampaigns v={{ filter: campaignFilter, counts, cards, setFilter: setCampaignFilter, openCard: setOpenCampaign, submitFor: (id) => startSubmit(id) }} />;
  }

  if (tab === "submit") {
    const platform = link.trim() ? platformFromUrl(link) : null;
    const onPlatform = platform ? accounts.filter((account) => account.platform === platform) : [];
    const handle = platform === "tiktok" ? tiktokHandleFromUrl(link) : null;
    const ok = platform ? onPlatform.length > 0 && (!handle || onPlatform.some((account) => account.handle === handle)) : false;
    const selected = submitCampaign && live.some((campaign) => campaign.id === submitCampaign) ? submitCampaign : live.length === 1 ? live[0].id : null;
    const freeze = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(new Date(`${day}T12:00:00Z`).getTime() + 7 * 86_400_000) : null;
    const allChecked = checks.every(Boolean);
    const missing = !link.trim() ? "Colle le lien de ton clip" : !platform ? "Lien TikTok, Instagram ou YouTube attendu" : !selected ? "Choisis une campagne" : !allChecked ? "Coche les 3 points pour envoyer" : "";
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
          views: "Enrick met à jour les vues jusqu'au gel, 7 jours après la publication",
        } : null,
        linkError: link.trim() && !platform ? "Colle le lien complet d'une vidéo TikTok, Instagram ou YouTube (https://…)." : null,
        campaigns: live.map((campaign) => {
          const mine = mineIn(campaign.id);
          const quota = campaign.quota_per_clipper;
          const note = mine >= quota ? `objectif atteint (${mine} / ${quota}), tu peux continuer` : mine + 1 === quota ? `ton ${mine + 1}e et dernier clip de la campagne` : `ton ${rankLabel(mine + 1)} clip sur ${quota}`;
          return { id: campaign.id, title: campaign.title, note, selected: campaign.id === selected };
        }),
        pick: (id) => setSubmitCampaign(id),
        checks: CHECKS.map((label, index) => ({ label, on: checks[index], toggle: () => setChecks((current) => current.map((value, i) => (i === index ? !value : value))) })),
        freezeNote: freeze ? `Vues figées le ${dayMonth(freeze.toISOString())} (7 jours après la publication), payées le ${dayMonth(cycleFor(freeze).payDate)}` : "Vues figées 7 jours après la publication.",
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
      { key: "counting", label: "Vues en cours" },
      { key: "frozen", label: "Figés" },
      { key: "paid", label: "Payés" },
      { key: "rejected", label: "Refusés" },
    ];
    const toItem = ({ clip, state: itemState }: { clip: ClipRow; state: ClipChipState }): ClipItem => {
      const campaign = byId.get(clip.campaign_id);
      const views = itemState === "frozen" || itemState === "paid" ? num(clip.frozen_views) : num(clip.views);
      const amount = campaign ? clipAmount(views, campaign) : 0;
      const under = campaign && views < campaign.min_views && itemState !== "review" && itemState !== "rejected";
      const note = itemState === "review" ? "réponse sous 24 h" : itemState === "rejected" ? clip.reject_reason ?? "" : itemState === "counting" ? `figé le ${dayMonth(freezeAt(clip.published_at).toISOString())}` : itemState === "frozen" ? (under ? `sous ${compact(campaign?.min_views ?? 0)} vues` : "acquis") : "versé";
      return {
        id: clip.id,
        title: clip.title,
        meta: `${PLATFORM_LABEL[clip.platform]} · ${campaign?.title ?? "campagne"} · ${dayMonth(clip.published_at)}`,
        state: itemState,
        note,
        views: itemState === "review" ? "—" : `${compact(views)} vues`,
        money: itemState === "review" ? "en revue" : itemState === "rejected" ? "0 €" : itemState === "counting" ? `≈ ${formatEuro(amount)}` : formatEuro(amount),
        url: clip.url,
      };
    };
    screen = (
      <ClipperClips v={{
        subline: `${plural(inCycle, "clip")} ce cycle · ${latest ? `vues mises à jour ${ago(latest, now)}` : "vues mises à jour par Enrick"}`,
        chips: chipDefs.filter((chip) => chip.key === "all" || counts.get(chip.key)).map((chip) => ({ key: chip.key, label: `${chip.label} · ${chip.key === "all" ? items.length : counts.get(chip.key) ?? 0}`, on: clipFilter === chip.key, pick: () => { setClipFilter(chip.key); setShowAll(false); } })),
        clips: shown.map(toItem),
        more: rest.length ? { label: `+ ${plural(rest.length, "autre clip", "autres clips")} · ${compact(rest.reduce((sum, item) => sum + (item.state === "frozen" || item.state === "paid" ? num(item.clip.frozen_views) : num(item.clip.views)), 0))} vues`, show: () => setShowAll(true) } : null,
        emptyLabel: items.length ? "Aucun clip dans ce filtre." : "Pas encore de clip : publie ta première vidéo puis colle son lien dans « Soumettre ».",
      }} />
    );
  }

  if (tab === "payments") {
    const steps: PayStep[] = [
      { title: `${dayMonth(cycle.start)} · début du cycle`, sub: "Tes clips figés s'ajoutent au fur et à mesure", state: "done" },
      { title: `${dayMonth(cycle.end)} à 23 h 59 · clôture`, sub: `Le montant est figé · ${inDays(daysUntil(cycle.end, now))}`, state: "current" },
      { title: `${shortDay(cycle.payDate)} · versement`, sub: methodLabel ? `Sur ton compte ${methodLabel}` : "Choisis d'abord ton moyen de paiement", state: "todo" },
      { title: "Juste après · la preuve", sub: "Le reçu arrive ici, avec la référence du virement", state: "todo" },
    ];
    screen = (
      <ClipperPayments v={{
        cycleChip: `Cycle ${dayMonth(cycle.start)}–${dayMonth(cycle.end)}`,
        acquired: formatEuro(summary.acquired),
        pendingText: summary.pending > 0 ? `+ environ ${euroShort(Math.round(summary.pending))} en cours` : null,
        pendingUntil: `d'ici le ${dayMonth(cycle.end)}`,
        payDateLong: `${longDay(cycle.payDate)} · ${inDays(payIn)}`,
        methodLine: methodLabel ? `${methodLabel}${clipper.payout_details ? ` · ${maskDetails(clipper.payout_details)}` : ""}` : "Pas encore choisi",
        methodMissing: !methodLabel,
        calc: [
          { label: `${summary.acquiredClips ? plural(summary.acquiredClips, "clip figé", "clips figés") : "Aucun clip figé"} · ${formatInt(summary.acquiredViews)} vues`, value: formatEuro(summary.acquired) },
          { label: "Bonus VIP · bientôt", value: formatEuro(0) },
          { label: "Retenue", value: formatEuro(0) },
        ],
        total: formatEuro(summary.acquired),
        scale: `Barème : ${rate} pour 1 000 vues figées, +${vip} par VIP ramené avec ton lien. Versement dès ${euroShort(MIN_PAYOUT)} acquis.`,
        steps,
        history: payouts.map((payout) => ({
          id: payout.id,
          title: `${payout.ref} · ${shortDay(payout.paid_at)}`,
          sub: `Cycle ${dayMonth(payout.cycle_start)}–${dayMonth(payout.cycle_end)} · ${plural(payout.clips_count, "clip")}${payout.proof ? ` · ${maskDetails(payout.proof)}` : ""}`,
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
        onCharter: () => setTab("charter"),
        onPayments: () => setTab("payments"),
        signOut: () => {
          if (preview) {
            window.location.href = preview.backHref;
            return;
          }
          void clipSignOut().then(() => { window.location.href = "/clip"; });
        },
      }} />
    );
  }

  if (tab === "charter") {
    screen = (
      <ClipperCharter v={{
        rate,
        minViews: formatInt(reference?.min_views ?? 8000),
        cap: euroShort(num(reference?.max_per_clip ?? 150)),
        vip,
        minPayout: euroShort(MIN_PAYOUT),
        onBack: () => setTab("profile"),
      }} />
    );
  }

  return (
    <ClipperShell initials={initialsOf(clipper.display_name)} active={tab} onTab={(next) => (next === "submit" ? startSubmit(submitCampaign) : setTab(next))} bellDot={Boolean(bellDot)} onBell={openBell}>
      {preview ? (
        <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "8px 8px 8px 12px", borderRadius: "14px", background: "rgba(145,214,208,0.08)", border: "1px solid rgba(145,214,208,0.35)", fontSize: "12.5px", color: "#C4C8BD" }}>
          <span><b style={{ color: "#91D6D0" }}>Aperçu</b> · espace de {preview.name}, en lecture seule</span>
          <a href={preview.backHref} style={{ flexShrink: 0, display: "flex", alignItems: "center", minHeight: "40px", padding: "0 10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.18)", color: "#F3EFE6", fontSize: "12.5px", fontWeight: 800, textDecoration: "none" }}>Retour admin</a>
        </div>
      ) : null}
      {screen}
    </ClipperShell>
  );
}
