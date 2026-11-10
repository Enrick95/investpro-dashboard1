"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Check, ExternalLink, LayoutDashboard, Loader2, RefreshCw, ShieldCheck, Target, TrendingUp, UserPlus, Users, Wallet, X } from "lucide-react";
import styles from "../clip.module.css";
import ClipLogin from "../ClipLogin";
import { ClipApiError, clipApi, clipSignOut } from "@/lib/clip/client";
import {
  MIN_PAYOUT,
  PAYOUT_LABEL,
  PLATFORM_LABEL,
  PLATFORM_SHORT,
  clipAmount,
  clipState,
  cycleFor,
  formatDay,
  formatEuro,
  formatInt,
  freezeAt,
  num,
  round2,
  summarize,
  tiktokHandleFromUrl,
  type CampaignRow,
  type ClipPlatform,
  type ClipRow,
  type PayoutMethod,
  type PayoutRow,
} from "@/lib/clip/rules";

type Clipper = {
  id: string;
  user_id: string;
  ref: string;
  display_name: string;
  whatsapp: string | null;
  telegram: string | null;
  tracking_code: string;
  status: "test" | "active" | "paused";
  payout_method: PayoutMethod | null;
  payout_details: string | null;
  admin_note: string | null;
  created_at: string;
};
type Account = { id: string; clipper_id: string; platform: ClipPlatform; handle: string; followers: number | null; verified: boolean; created_at: string };
type Candidate = {
  id: string;
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
  created_at: string;
};
type Data = { campaigns: CampaignRow[]; clippers: Clipper[]; accounts: Account[]; clips: ClipRow[]; candidates: Candidate[]; payouts: PayoutRow[] };
type Section = "overview" | "review" | "clips" | "clippers" | "campaigns" | "payments" | "candidates";
type Act = (key: string, body: Record<string, unknown>, success: string) => Promise<boolean>;
type ClipperStats = { clipper: Clipper; accounts: Account[]; clips: ClipRow[]; views30: number; clips30: number; lastClip: string | null; acquired: number; acquiredClips: number; acquiredViews: number; review: number };

const DAY = 86_400_000;
const REASONS = ["Promesse de gains", "Hors brief de la campagne", "Qualité insuffisante", "Compte qui n'appartient pas au clippeur", "Clip déjà soumis (doublon)", "Vues suspectes"];

function clipViews(clip: ClipRow): number {
  return clip.frozen_views !== null && clip.frozen_views !== undefined ? num(clip.frozen_views) : num(clip.views);
}

function ago(iso: string, now: Date): string {
  const hours = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 3_600_000));
  if (hours < 1) return "à l'instant";
  if (hours < 48) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

function whatsappLink(phone: string | null, message?: string): string | null {
  if (!phone) return null;
  return `https://wa.me/${phone.replace(/^\+/, "")}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/** Adresse du site actuel (l'espace admin ne s'affiche que dans le navigateur). */
function siteOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function JoinLinkCard() {
  const [copied, setCopied] = useState(false);
  const url = `${siteOrigin()}/clip/rejoindre`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className={styles.card} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
      <span className={`${styles.small} ${styles.muted}`} style={{ fontWeight: 600 }}>Lien de candidature à partager</span>
      <span className={styles.small} style={{ fontWeight: 700, wordBreak: "break-all" }}>{url.replace(/^https?:\/\//, "")}</span>
      <button type="button" className={styles.btnGhost} style={{ minHeight: 40, fontSize: 13 }} onClick={() => void copy()}>{copied ? "Lien copié" : "Copier le lien"}</button>
    </div>
  );
}

export default function ClipAdmin() {
  const [state, setState] = useState<{ phase: "loading" } | { phase: "denied"; message: string; login: boolean } | { phase: "error"; message: string } | { phase: "ready"; data: Data }>({ phase: "loading" });
  const [section, setSection] = useState<Section>("overview");
  const [flash, setFlash] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await clipApi<Data>("/api/clip/admin");
      setState({ phase: "ready", data });
    } catch (error) {
      if (error instanceof ClipApiError && (error.status === 401 || error.status === 403)) setState({ phase: "denied", message: error.message, login: error.status === 401 });
      else setState({ phase: "error", message: error instanceof Error ? error.message : "Chargement impossible." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback<Act>(async (key, body, success) => {
    setBusy(key);
    setFlash(null);
    try {
      await clipApi("/api/clip/admin", { method: "POST", body });
      setFlash({ kind: "ok", text: success });
      await load();
      return true;
    } catch (error) {
      setFlash({ kind: "error", text: error instanceof Error ? error.message : "Action impossible." });
      return false;
    } finally {
      setBusy(null);
    }
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
  return <AdminSpace data={state.data} section={section} setSection={setSection} flash={flash} busy={busy} act={act} reload={load} />;
}

function AdminSpace({ data, section, setSection, flash, busy, act, reload }: { data: Data; section: Section; setSection: (section: Section) => void; flash: { kind: "ok" | "error"; text: string } | null; busy: string | null; act: Act; reload: () => Promise<void> }) {
  const now = useMemo(() => new Date(), []);
  const campaignsById = useMemo(() => new Map<string, CampaignRow>(data.campaigns.map((campaign): [string, CampaignRow] => [campaign.id, campaign])), [data.campaigns]);
  const stats = useMemo<ClipperStats[]>(() => {
    const since = now.getTime() - 30 * DAY;
    return data.clippers.map((clipper) => {
      const clips = data.clips.filter((clip) => clip.clipper_id === clipper.id);
      const recent = clips.filter((clip) => clip.status !== "rejected" && new Date(clip.published_at).getTime() >= since);
      const summary = summarize(clips, data.campaigns, now);
      const lastClip = clips.reduce<string | null>((latest, clip) => (!latest || clip.published_at > latest ? clip.published_at : latest), null);
      return {
        clipper,
        accounts: data.accounts.filter((account) => account.clipper_id === clipper.id),
        clips,
        views30: recent.reduce((sum, clip) => sum + clipViews(clip), 0),
        clips30: recent.length,
        lastClip,
        acquired: summary.acquired,
        acquiredClips: summary.acquiredClips,
        acquiredViews: summary.acquiredViews,
        review: summary.review,
      };
    });
  }, [data, now]);
  const reviewClips = data.clips.filter((clip) => clip.status === "review").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const newCandidates = data.candidates.filter((candidate) => candidate.status === "new");

  const menu: { key: Section; label: string; icon: ReactNode; count?: number }[] = [
    { key: "overview", label: "Vue d'ensemble", icon: <LayoutDashboard size={18} aria-hidden="true" /> },
    { key: "review", label: "Clips à valider", icon: <ShieldCheck size={18} aria-hidden="true" />, count: reviewClips.length },
    { key: "clips", label: "Vues des clips", icon: <TrendingUp size={18} aria-hidden="true" /> },
    { key: "clippers", label: "Clippeurs", icon: <Users size={18} aria-hidden="true" /> },
    { key: "campaigns", label: "Campagnes", icon: <Target size={18} aria-hidden="true" /> },
    { key: "payments", label: "Paiements", icon: <Wallet size={18} aria-hidden="true" /> },
    { key: "candidates", label: "Candidatures", icon: <UserPlus size={18} aria-hidden="true" />, count: newCandidates.length },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.admin}>
        <nav className={styles.side} aria-label="Menu admin">
          <Link href="/clip" className={styles.brand} style={{ padding: "0 8px 18px" }}>
            <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect x="1" y="1" width="28" height="28" rx="9" fill="none" stroke="#F0C575" strokeWidth="1.6" /><path d="M12.5 9.5v11l8.5-5.5z" fill="#F0C575" /></svg>
            <span className={styles.brandName}>InvestPro</span>
            <span className={styles.brandPill}>CLIP</span>
          </Link>
          {menu.map((item) => (
            <button key={item.key} type="button" aria-current={section === item.key ? "page" : undefined} className={`${styles.sideItem} ${section === item.key ? styles.sideItemOn : ""}`} onClick={() => setSection(item.key)}>
              {item.icon}
              {item.label}
              {item.count ? <span className={styles.sideCount}>{item.count}</span> : null}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <JoinLinkCard />
        </nav>
        <main className={styles.content}>
          <div className={styles.row} style={{ flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className={`${styles.small} ${styles.muted}`}>{formatDay(now.toISOString())} · cycle du {formatDay(cycleFor(now).start, false)} au {formatDay(cycleFor(now).end, false)}, versement le {formatDay(cycleFor(now).payDate, false)}</span>
              <h1 className={styles.h1} style={{ fontSize: 28 }}>{menu.find((item) => item.key === section)?.label}</h1>
            </div>
            <div className={styles.rowStart}>
              <Link href="/clip" className={styles.btnGhost}>Voir comme un clippeur</Link>
              <button type="button" className={styles.btnGhost} onClick={() => void reload()} aria-label="Actualiser"><RefreshCw size={16} aria-hidden="true" />Actualiser</button>
            </div>
          </div>
          {flash ? <p className={flash.kind === "ok" ? styles.success : styles.error} role="status">{flash.text}</p> : null}
          {section === "overview" ? <Overview data={data} stats={stats} reviewCount={reviewClips.length} newCandidates={newCandidates.length} now={now} go={setSection} /> : null}
          {section === "review" ? <Review clips={reviewClips} stats={stats} campaignsById={campaignsById} busy={busy} act={act} now={now} /> : null}
          {section === "clips" ? <ClipViews data={data} stats={stats} campaignsById={campaignsById} busy={busy} act={act} /> : null}
          {section === "clippers" ? <Clippers stats={stats} busy={busy} act={act} now={now} /> : null}
          {section === "campaigns" ? <Campaigns campaigns={data.campaigns} clips={data.clips} busy={busy} act={act} /> : null}
          {section === "payments" ? <Payments stats={stats} payouts={data.payouts} clippers={data.clippers} busy={busy} act={act} now={now} /> : null}
          {section === "candidates" ? <Candidates candidates={data.candidates} busy={busy} act={act} now={now} /> : null}
        </main>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, gold }: { label: string; value: string; sub?: string; gold?: boolean }) {
  return (
    <div className={styles.kpi} style={gold ? { borderColor: "rgba(240,197,117,0.45)", background: "#15170f" } : undefined}>
      <span className={`${styles.small} ${styles.muted}`} style={{ fontWeight: 600 }}>{label}</span>
      <span className={styles.kpiValue} style={gold ? { color: "#F0C575" } : undefined}>{value}</span>
      {sub ? <span className={`${styles.small} ${styles.muted}`}>{sub}</span> : null}
    </div>
  );
}

function StatusChip({ status }: { status: Clipper["status"] }) {
  if (status === "active") return <span className={`${styles.chip} ${styles.chipOk}`}>Actif</span>;
  if (status === "test") return <span className={`${styles.chip} ${styles.chipNeutral}`}>En test</span>;
  return <span className={`${styles.chip} ${styles.chipBad}`}>En pause</span>;
}

function Overview({ data, stats, reviewCount, newCandidates, now, go }: { data: Data; stats: ClipperStats[]; reviewCount: number; newCandidates: number; now: Date; go: (section: Section) => void }) {
  const active = stats.filter((item) => item.clipper.status === "active").length;
  const testing = stats.filter((item) => item.clipper.status === "test").length;
  const views30 = stats.reduce((sum, item) => sum + item.views30, 0);
  const clips30 = stats.reduce((sum, item) => sum + item.clips30, 0);
  const toPay = round2(stats.reduce((sum, item) => sum + item.acquired, 0));
  const payable = stats.filter((item) => item.acquired > 0).length;
  const unverified = data.accounts.filter((account) => !account.verified).length;
  const idle = stats.filter((item) => item.clipper.status === "active" && (!item.lastClip || now.getTime() - new Date(item.lastClip).getTime() > 6 * DAY));
  const ranking = [...stats].filter((item) => item.clipper.status !== "paused").sort((a, b) => b.views30 - a.views30).slice(0, 10);
  const alerts: { key: string; text: string; target: Section; tone: "warn" | "bad" | "ok" }[] = [];
  if (reviewCount) alerts.push({ key: "review", text: `${reviewCount} clip${reviewCount > 1 ? "s" : ""} à valider`, target: "review", tone: "warn" });
  if (newCandidates) alerts.push({ key: "cand", text: `${newCandidates} nouvelle${newCandidates > 1 ? "s" : ""} candidature${newCandidates > 1 ? "s" : ""}`, target: "candidates", tone: "ok" });
  if (unverified) alerts.push({ key: "acc", text: `${unverified} compte${unverified > 1 ? "s" : ""} à vérifier`, target: "clippers", tone: "warn" });
  if (idle.length) alerts.push({ key: "idle", text: `Sans clip depuis 6 jours : ${idle.map((item) => item.clipper.display_name).join(", ")}`, target: "clippers", tone: "bad" });
  if (payable) alerts.push({ key: "pay", text: `${payable} clippeur${payable > 1 ? "s" : ""} à payer (${formatEuro(toPay)})`, target: "payments", tone: "ok" });

  return (
    <>
      <section className={styles.kpis} aria-label="Chiffres clés">
        <Kpi label="Vues · 30 jours" value={formatInt(views30)} sub={`${clips30} clips publiés`} />
        <Kpi label="Clippeurs" value={`${active}`} sub={`actifs · ${testing} en test`} />
        <Kpi label="Comptes suivis" value={`${data.accounts.length}`} sub={`${unverified} à vérifier`} />
        <Kpi label="Campagnes ouvertes" value={`${data.campaigns.filter((campaign) => campaign.status === "active").length}`} />
        <Kpi label={`À payer le ${formatDay(cycleFor(now).payDate, false)}`} value={formatEuro(toPay)} sub={`${payable} clippeur${payable > 1 ? "s" : ""}`} gold />
      </section>
      <section className={styles.card} aria-labelledby="t-alerts" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id="t-alerts" className={styles.h2} style={{ marginBottom: 6 }}>À surveiller</h2>
        {!alerts.length ? <p className={`${styles.small} ${styles.muted}`}>Rien à signaler.</p> : null}
        {alerts.map((alert) => (
          <div key={alert.key} className={styles.item}>
            <span className={styles.thumb} style={{ color: alert.tone === "bad" ? "#FF6F91" : alert.tone === "warn" ? "#F2B45A" : "#91D6D0" }}>{alert.tone === "ok" ? <Check size={17} aria-hidden="true" /> : <AlertTriangle size={17} aria-hidden="true" />}</span>
            <span className={styles.grow} style={{ fontWeight: 700 }}>{alert.text}</span>
            <button type="button" className={styles.btnGhost} onClick={() => go(alert.target)}>Ouvrir</button>
          </div>
        ))}
      </section>
      <section aria-labelledby="t-rank" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 id="t-rank" className={styles.h2}>Classement · 30 derniers jours</h2>
        {!ranking.length ? <p className={styles.notice}>Pas encore de clippeur. Accepte une candidature pour commencer.</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>#</th><th>Clippeur</th><th>Statut</th><th>Comptes</th><th>Clips</th><th>Vues</th><th>Dernier clip</th><th>Acquis</th></tr></thead>
              <tbody>
                {ranking.map((item, index) => (
                  <tr key={item.clipper.id}>
                    <td className={styles.muted}>{index + 1}</td>
                    <td><b>{item.clipper.display_name}</b> <span className={`${styles.small} ${styles.muted}`}>{item.clipper.ref}</span></td>
                    <td><StatusChip status={item.clipper.status} /></td>
                    <td>{item.accounts.length} · {item.accounts.filter((account) => account.verified).length} vérifié{item.accounts.filter((account) => account.verified).length > 1 ? "s" : ""}</td>
                    <td>{item.clips30}</td>
                    <td><b>{formatInt(item.views30)}</b></td>
                    <td className={styles.muted}>{item.lastClip ? ago(item.lastClip, now) : "aucun"}</td>
                    <td><b>{formatEuro(item.acquired)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Review({ clips, stats, campaignsById, busy, act, now }: { clips: ClipRow[]; stats: ClipperStats[]; campaignsById: Map<string, CampaignRow>; busy: string | null; act: Act; now: Date }) {
  if (!clips.length) return <p className={styles.notice}>Aucun clip en attente. Les nouveaux clips soumis arrivent ici.</p>;
  return (
    <div className={styles.stackLg}>
      <p className={`${styles.small} ${styles.muted}`}>Un clip validé compte ses vues pendant 7 jours, puis entre dans le paiement. Un clip refusé ne rapporte rien et le clippeur voit le motif.</p>
      {clips.map((clip) => <ReviewCard key={clip.id} clip={clip} stats={stats.find((item) => item.clipper.id === clip.clipper_id)} campaign={campaignsById.get(clip.campaign_id)} busy={busy} act={act} now={now} />)}
    </div>
  );
}

function ReviewCard({ clip, stats, campaign, busy, act, now }: { clip: ClipRow; stats?: ClipperStats; campaign?: CampaignRow; busy: string | null; act: Act; now: Date }) {
  const [reason, setReason] = useState(REASONS[0]);
  const day = clip.published_at.slice(0, 10);
  const handles = (stats?.accounts ?? []).filter((account) => account.platform === clip.platform);
  const tiktokHandle = clip.platform === "tiktok" ? tiktokHandleFromUrl(clip.url) : null;
  const checks: { ok: boolean; label: string }[] = [
    { ok: handles.length > 0, label: handles.length ? `Comptes ${PLATFORM_LABEL[clip.platform]} du clippeur : ${handles.map((account) => `@${account.handle}${account.verified ? "" : " (à vérifier)"}`).join(", ")}` : `Aucun compte ${PLATFORM_LABEL[clip.platform]} dans son profil` },
    { ok: Boolean(campaign && day >= campaign.starts_on && day <= campaign.ends_on), label: "Publié pendant la campagne" },
  ];
  if (tiktokHandle) checks.push({ ok: handles.some((account) => account.handle === tiktokHandle), label: `Lien publié par @${tiktokHandle}` });
  const others = (stats?.clips ?? []).filter((item) => item.id !== clip.id && item.status === "rejected").length;
  return (
    <article className={styles.card} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className={styles.row} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <h3 className={styles.h2} style={{ fontSize: 17 }}>{clip.title}</h3>
          <span className={`${styles.small} ${styles.muted}`}>{clip.ref} · {stats ? `${stats.clipper.display_name} (${stats.clipper.ref})` : "clippeur"} · {PLATFORM_LABEL[clip.platform]} · {campaign?.title ?? "campagne"} · publié le {formatDay(day, false)} · soumis {ago(clip.created_at, now)}</span>
        </div>
        <a href={clip.url} target="_blank" rel="noopener noreferrer" className={styles.btnGhost}>Ouvrir le clip<ExternalLink size={15} aria-hidden="true" /></a>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {checks.map((check) => (
          <span key={check.label} className={styles.small} style={{ display: "flex", alignItems: "center", gap: 8, color: check.ok ? "#C4C8BD" : "#F2B45A", fontWeight: check.ok ? 500 : 700 }}>
            {check.ok ? <Check size={15} color="#91D6D0" aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}{check.label}
          </span>
        ))}
        {others ? <span className={`${styles.small} ${styles.warn}`}>{others} clip{others > 1 ? "s" : ""} déjà refusé{others > 1 ? "s" : ""} pour ce clippeur</span> : null}
        <span className={`${styles.small} ${styles.muted}`}>À vérifier à l&apos;écoute : aucune promesse de gains, sous-titres lisibles, respect du brief.</span>
      </div>
      <div className={styles.rowStart} style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
        <div className={styles.field} style={{ minWidth: 240 }}>
          <label htmlFor={`reason-${clip.id}`} className={`${styles.small} ${styles.muted}`} style={{ fontWeight: 700 }}>Motif si tu refuses</label>
          <select id={`reason-${clip.id}`} className={styles.select} value={reason} onChange={(event) => setReason(event.target.value)}>
            {REASONS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className={styles.rowStart}>
          <button type="button" className={styles.btnDanger} disabled={busy !== null} onClick={() => void act(`rej-${clip.id}`, { action: "review_clip", id: clip.id, decision: "rejected", reason }, `Clip ${clip.ref} refusé.`)}><X size={15} aria-hidden="true" />Refuser</button>
          <button type="button" className={styles.btn} disabled={busy !== null} onClick={() => void act(`ok-${clip.id}`, { action: "review_clip", id: clip.id, decision: "approved" }, `Clip ${clip.ref} validé.`)}><Check size={16} aria-hidden="true" />Valider le clip</button>
        </div>
      </div>
    </article>
  );
}

function ClipViews({ data, stats, campaignsById, busy, act }: { data: Data; stats: ClipperStats[]; campaignsById: Map<string, CampaignRow>; busy: string | null; act: Act }) {
  const [showAll, setShowAll] = useState(false);
  const names = new Map(stats.map((item): [string, string] => [item.clipper.id, item.clipper.display_name]));
  const rows = data.clips
    .filter((clip) => clip.status === "approved" && !clip.payout_id)
    .filter((clip) => showAll || clipState(clip) === "counting")
    .sort((a, b) => a.published_at.localeCompare(b.published_at));
  return (
    <div className={styles.stackLg}>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <p className={`${styles.small} ${styles.muted}`} style={{ margin: 0, maxWidth: 640 }}>Pour l&apos;instant, tu mets à jour les vues à la main (relève-les sur le clip). Elles sont figées automatiquement 7 jours après la publication. La synchronisation automatique viendra avec la connexion TikTok, Instagram et YouTube.</p>
        <div className={styles.chips}>
          <button type="button" className={`${styles.filter} ${!showAll ? styles.filterOn : ""}`} aria-pressed={!showAll} onClick={() => setShowAll(false)}>Vues en cours</button>
          <button type="button" className={`${styles.filter} ${showAll ? styles.filterOn : ""}`} aria-pressed={showAll} onClick={() => setShowAll(true)}>Tous les clips non payés</button>
        </div>
      </div>
      {!rows.length ? <p className={styles.notice}>Aucun clip à mettre à jour.</p> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Clip</th><th>Clippeur</th><th>Publié</th><th>État</th><th>Vues</th><th>Montant</th></tr></thead>
            <tbody>
              {rows.map((clip) => <ViewRow key={clip.id} clip={clip} name={names.get(clip.clipper_id ?? "") ?? ""} campaign={campaignsById.get(clip.campaign_id)} busy={busy} act={act} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ViewRow({ clip, name, campaign, busy, act }: { clip: ClipRow; name: string; campaign?: CampaignRow; busy: string | null; act: Act }) {
  const [views, setViews] = useState(String(clipViews(clip)));
  const state = clipState(clip);
  const value = Number(views.replace(/\s/g, "")) || 0;
  const amount = campaign ? clipAmount(value, campaign) : 0;
  return (
    <tr>
      <td><a href={clip.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: "#F3EFE6", textDecoration: "none" }}>{clip.title}</a><div className={`${styles.small} ${styles.muted}`}>{clip.ref} · {PLATFORM_SHORT[clip.platform]} · {campaign?.title ?? ""}</div></td>
      <td>{name}</td>
      <td className={styles.muted}>{formatDay(clip.published_at.slice(0, 10), false)}</td>
      <td>{state === "frozen" ? <span className={`${styles.chip} ${styles.chipOk}`}>Figé</span> : <span className={`${styles.chip} ${styles.chipWarn}`}>Figé le {formatDay(freezeAt(clip.published_at).toISOString(), false)}</span>}</td>
      <td>
        <form className={styles.rowStart} style={{ flexWrap: "nowrap" }} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void act(`views-${clip.id}`, { action: "set_views", id: clip.id, views: value }, `Vues de ${clip.ref} enregistrées.`); }}>
          <label htmlFor={`v-${clip.id}`} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Vues de {clip.ref}</label>
          <input id={`v-${clip.id}`} className={`${styles.input} ${styles.inputSmall}`} inputMode="numeric" value={views} onChange={(event) => setViews(event.target.value.replace(/[^0-9]/g, ""))} />
          <button type="submit" className={styles.btnGhost} disabled={busy !== null}>OK</button>
        </form>
      </td>
      <td><b>{formatEuro(amount)}</b>{campaign && value < campaign.min_views ? <div className={`${styles.small} ${styles.warn}`}>sous {formatInt(campaign.min_views)} vues</div> : null}</td>
    </tr>
  );
}

function Clippers({ stats, busy, act, now }: { stats: ClipperStats[]; busy: string | null; act: Act; now: Date }) {
  if (!stats.length) return <p className={styles.notice}>Pas encore de clippeur. Les candidatures acceptées apparaissent ici.</p>;
  return (
    <div className={styles.stackLg}>
      {stats.map((item) => <ClipperCard key={item.clipper.id} item={item} busy={busy} act={act} now={now} />)}
    </div>
  );
}

function ClipperCard({ item, busy, act, now }: { item: ClipperStats; busy: string | null; act: Act; now: Date }) {
  const { clipper } = item;
  const [note, setNote] = useState(clipper.admin_note ?? "");
  const wa = whatsappLink(clipper.whatsapp);
  return (
    <article className={styles.card} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className={styles.row} style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className={styles.avatar}>{clipper.display_name.slice(0, 2).toUpperCase()}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className={styles.rowStart} style={{ gap: 8 }}><b style={{ fontSize: 16 }}>{clipper.display_name}</b><StatusChip status={clipper.status} /></span>
            <span className={`${styles.small} ${styles.muted}`}>{clipper.ref} · depuis le {formatDay(clipper.created_at.slice(0, 10), false)}{clipper.whatsapp ? ` · ${clipper.whatsapp}` : ""}{clipper.telegram ? ` · @${clipper.telegram}` : ""}</span>
          </div>
        </div>
        <div className={styles.rowStart}>
          {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className={styles.btn} style={{ minHeight: 44, fontSize: 13 }}>WhatsApp</a> : null}
          <label htmlFor={`st-${clipper.id}`} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Statut de {clipper.display_name}</label>
          <select id={`st-${clipper.id}`} className={styles.select} style={{ width: 160, minHeight: 44 }} value={clipper.status} disabled={busy !== null} onChange={(event) => void act(`st-${clipper.id}`, { action: "update_clipper", id: clipper.id, status: event.target.value }, "Statut mis à jour.")}>
            <option value="test">En test</option>
            <option value="active">Actif</option>
            <option value="paused">En pause</option>
          </select>
        </div>
      </div>
      <div className={styles.grid3} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
        <div className={styles.mini} style={{ background: "#181c16" }}><span className={styles.value}>{formatInt(item.views30)}</span><span className={`${styles.small} ${styles.muted}`}>vues · 30 j</span></div>
        <div className={styles.mini} style={{ background: "#181c16" }}><span className={styles.value}>{item.clips30}</span><span className={`${styles.small} ${styles.muted}`}>clips · 30 j</span></div>
        <div className={styles.mini} style={{ background: "#181c16" }}><span className={styles.value}>{item.lastClip ? ago(item.lastClip, now) : "—"}</span><span className={`${styles.small} ${styles.muted}`}>dernier clip</span></div>
        <div className={styles.mini} style={{ background: "#181c16" }}><span className={`${styles.value} ${styles.gold}`}>{formatEuro(item.acquired)}</span><span className={`${styles.small} ${styles.muted}`}>acquis</span></div>
      </div>
      <div className={styles.list}>
        {!item.accounts.length ? <span className={`${styles.small} ${styles.warn}`}>Aucun compte ajouté pour l&apos;instant.</span> : null}
        {item.accounts.map((account) => (
          <div key={account.id} className={styles.item}>
            <span className={styles.thumb}>{PLATFORM_SHORT[account.platform]}</span>
            <span className={styles.grow} style={{ display: "flex", flexDirection: "column" }}>
              <a href={account.platform === "tiktok" ? `https://www.tiktok.com/@${account.handle}` : account.platform === "instagram" ? `https://www.instagram.com/${account.handle}` : `https://www.youtube.com/@${account.handle}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: "#F3EFE6", textDecoration: "none" }}>@{account.handle}</a>
              <span className={`${styles.small} ${styles.muted}`}>{PLATFORM_LABEL[account.platform]}{account.followers !== null ? ` · ${formatInt(account.followers)} abonnés` : ""}</span>
            </span>
            {account.verified ? <span className={`${styles.chip} ${styles.chipOk}`}>Vérifié</span> : <span className={`${styles.chip} ${styles.chipWarn}`}>À vérifier</span>}
            <button type="button" className={styles.btnGhost} disabled={busy !== null} onClick={() => void act(`acc-${account.id}`, { action: "verify_account", id: account.id, verified: !account.verified }, account.verified ? "Vérification retirée." : `@${account.handle} vérifié.`)}>{account.verified ? "Annuler" : "Vérifier"}</button>
          </div>
        ))}
      </div>
      <div className={styles.field}>
        <label htmlFor={`note-${clipper.id}`} className={`${styles.small} ${styles.muted}`} style={{ fontWeight: 700 }}>Note interne (visible par toi seul)</label>
        <textarea id={`note-${clipper.id}`} className={styles.textarea} style={{ minHeight: 70 }} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
        <div className={styles.rowStart} style={{ justifyContent: "space-between" }}>
          <span className={`${styles.small} ${styles.muted}`}>Paiement : {clipper.payout_method ? `${PAYOUT_LABEL[clipper.payout_method]}${clipper.payout_details ? ` · ${clipper.payout_details}` : ""}` : "pas encore choisi"}</span>
          <button type="button" className={styles.btnGhost} disabled={busy !== null || note === (clipper.admin_note ?? "")} onClick={() => void act(`note-${clipper.id}`, { action: "update_clipper", id: clipper.id, admin_note: note }, "Note enregistrée.")}>Enregistrer la note</button>
        </div>
      </div>
      <TemporaryPassword clipperId={clipper.id} name={clipper.display_name} phone={clipper.whatsapp} />
    </article>
  );
}

/** Mot de passe oublié : l'admin crée un mot de passe provisoire et l'envoie sur WhatsApp. */
function TemporaryPassword({ clipperId, name, phone }: { clipperId: string; name: string; phone: string | null }) {
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setStep("busy");
    setError(null);
    try {
      const result = await clipApi<{ password: string }>("/api/clip/admin", { method: "POST", body: { action: "reset_password", clipper_id: clipperId } });
      setPassword(result.password);
      setStep("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de créer un mot de passe provisoire.");
      setStep("idle");
    }
  }

  const firstName = name.split(/\s+/)[0] ?? name;
  const wa = password ? whatsappLink(phone, `Salut ${firstName} ! Voici ton mot de passe provisoire pour l'espace clippeurs : ${password}\nConnecte-toi sur ${siteOrigin()}/clip puis change-le dans ton profil.`) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      {password ? (
        <div className={styles.notice} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span>Mot de passe provisoire : <b style={{ color: "#F3EFE6", letterSpacing: "0.04em" }}>{password}</b></span>
          <span className={styles.small}>L&apos;ancien mot de passe ne marche plus. Envoie celui-ci au clippeur : il pourra le changer dans son profil.</span>
          {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className={styles.btn} style={{ alignSelf: "flex-start", minHeight: 44, fontSize: 13 }}>Envoyer sur WhatsApp</a> : null}
        </div>
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {step === "confirm" ? (
        <div className={styles.rowStart}>
          <span className={`${styles.small} ${styles.warn}`}>Son mot de passe actuel ne marchera plus.</span>
          <button type="button" className={styles.btnDanger} onClick={() => void create()}>Confirmer</button>
          <button type="button" className={styles.btnGhost} onClick={() => setStep("idle")}>Annuler</button>
        </div>
      ) : (
        <button type="button" className={styles.linkBtn} style={{ alignSelf: "flex-start" }} disabled={step === "busy"} onClick={() => { setPassword(null); setStep("confirm"); }}>
          {step === "busy" ? "Création…" : "Mot de passe oublié : créer un mot de passe provisoire"}
        </button>
      )}
    </div>
  );
}

type CampaignForm = {
  id: string | null;
  title: string;
  platforms: string;
  starts_on: string;
  ends_on: string;
  quota_per_clipper: string;
  rate_per_1000: string;
  min_views: string;
  max_per_clip: string;
  vip_bonus: string;
  status: CampaignRow["status"];
  rushes_url: string;
  brief: string;
  forbidden: string;
};

function emptyForm(): CampaignForm {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  return { id: null, title: "", platforms: "TikTok · Shorts · Reels", starts_on: today, ends_on: end, quota_per_clipper: "10", rate_per_1000: "1", min_views: "8000", max_per_clip: "150", vip_bonus: "20", status: "active", rushes_url: "", brief: "", forbidden: "Promesses de gains, montants gagnés en accroche, logos d'autres créateurs." };
}

function Campaigns({ campaigns, clips, busy, act }: { campaigns: CampaignRow[]; clips: ClipRow[]; busy: string | null; act: Act }) {
  const [form, setForm] = useState<CampaignForm | null>(null);
  const set = (key: keyof CampaignForm, value: string) => setForm((current) => (current ? { ...current, [key]: value } : current));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const ok = await act("campaign", { action: "save_campaign", ...form, id: form.id ?? undefined }, form.id ? "Campagne mise à jour." : "Campagne créée.");
    if (ok) setForm(null);
  }
  return (
    <div className={styles.stackLg}>
      {!form ? <button type="button" className={styles.btn} style={{ alignSelf: "flex-start" }} onClick={() => setForm(emptyForm())}>Nouvelle campagne</button> : null}
      {form ? (
        <form onSubmit={save} className={styles.cardGold} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className={styles.h2}>{form.id ? "Modifier la campagne" : "Nouvelle campagne"}</h2>
          <div className={styles.formGrid}>
            <div className={styles.field}><label htmlFor="c-title" className={styles.label}>Titre</label><input id="c-title" className={styles.input} maxLength={80} value={form.title} onChange={(event) => set("title", event.target.value)} required /></div>
            <div className={styles.field}><label htmlFor="c-platforms" className={styles.label}>Plateformes</label><input id="c-platforms" className={styles.input} maxLength={80} value={form.platforms} onChange={(event) => set("platforms", event.target.value)} /></div>
            <div className={styles.field}><label htmlFor="c-start" className={styles.label}>Début</label><input id="c-start" className={styles.input} type="date" value={form.starts_on} onChange={(event) => set("starts_on", event.target.value)} required /></div>
            <div className={styles.field}><label htmlFor="c-end" className={styles.label}>Fin</label><input id="c-end" className={styles.input} type="date" value={form.ends_on} onChange={(event) => set("ends_on", event.target.value)} required /></div>
            <div className={styles.field}><label htmlFor="c-quota" className={styles.label}>Clips par clippeur</label><input id="c-quota" className={styles.input} inputMode="numeric" value={form.quota_per_clipper} onChange={(event) => set("quota_per_clipper", event.target.value)} /></div>
            <div className={styles.field}><label htmlFor="c-rate" className={styles.label}>€ pour 1 000 vues</label><input id="c-rate" className={styles.input} inputMode="decimal" value={form.rate_per_1000} onChange={(event) => set("rate_per_1000", event.target.value)} /></div>
            <div className={styles.field}><label htmlFor="c-min" className={styles.label}>Minimum de vues par clip</label><input id="c-min" className={styles.input} inputMode="numeric" value={form.min_views} onChange={(event) => set("min_views", event.target.value)} /></div>
            <div className={styles.field}><label htmlFor="c-max" className={styles.label}>Plafond par clip (€)</label><input id="c-max" className={styles.input} inputMode="decimal" value={form.max_per_clip} onChange={(event) => set("max_per_clip", event.target.value)} /></div>
            <div className={styles.field}><label htmlFor="c-vip" className={styles.label}>Bonus par VIP (€)</label><input id="c-vip" className={styles.input} inputMode="decimal" value={form.vip_bonus} onChange={(event) => set("vip_bonus", event.target.value)} /></div>
            <div className={styles.field}><label htmlFor="c-status" className={styles.label}>Statut</label><select id="c-status" className={styles.select} value={form.status} onChange={(event) => set("status", event.target.value)}><option value="active">Ouverte</option><option value="draft">Brouillon</option><option value="ended">Terminée</option></select></div>
          </div>
          <div className={styles.field}><label htmlFor="c-rushes" className={styles.label}>Lien des rushs (Drive, Dropbox…)</label><input id="c-rushes" className={styles.input} type="url" placeholder="https://…" value={form.rushes_url} onChange={(event) => set("rushes_url", event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="c-brief" className={styles.label}>Brief (une consigne par ligne)</label><textarea id="c-brief" className={styles.textarea} maxLength={2000} value={form.brief} onChange={(event) => set("brief", event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="c-forbidden" className={styles.label}>Interdits</label><textarea id="c-forbidden" className={styles.textarea} style={{ minHeight: 70 }} maxLength={600} value={form.forbidden} onChange={(event) => set("forbidden", event.target.value)} /></div>
          <div className={styles.rowStart}>
            <button type="submit" className={styles.btn} disabled={busy !== null}>{form.id ? "Enregistrer" : "Créer la campagne"}</button>
            <button type="button" className={styles.btnGhost} onClick={() => setForm(null)}>Annuler</button>
          </div>
        </form>
      ) : null}
      {!campaigns.length ? <p className={styles.notice}>Aucune campagne pour l&apos;instant.</p> : null}
      <div className={styles.panels}>
        {campaigns.map((campaign) => {
          const count = clips.filter((clip) => clip.campaign_id === campaign.id && clip.status !== "rejected").length;
          const views = clips.filter((clip) => clip.campaign_id === campaign.id && clip.status === "approved").reduce((sum, clip) => sum + clipViews(clip), 0);
          return (
            <article key={campaign.id} className={`${styles.card} ${styles.panel}`} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className={styles.row}><span className={`${styles.small} ${styles.muted}`} style={{ fontWeight: 700 }}>{campaign.platforms} · {formatDay(campaign.starts_on, false)} → {formatDay(campaign.ends_on, false)}</span><span className={`${styles.chip} ${campaign.status === "active" ? styles.chipOk : styles.chipNeutral}`}>{campaign.status === "active" ? "Ouverte" : campaign.status === "draft" ? "Brouillon" : "Terminée"}</span></div>
              <h3 className={styles.h3} style={{ fontSize: 16 }}>{campaign.title}</h3>
              <span className={`${styles.small} ${styles.soft}`}>{count} clips soumis · {formatInt(views)} vues · {formatEuro(num(campaign.rate_per_1000))} / 1 000 vues · min. {formatInt(campaign.min_views)} vues · max {formatEuro(num(campaign.max_per_clip))} / clip · +{formatEuro(num(campaign.vip_bonus))} / VIP</span>
              <button type="button" className={styles.btnGhost} style={{ alignSelf: "flex-start" }} onClick={() => setForm({ id: campaign.id, title: campaign.title, platforms: campaign.platforms, starts_on: campaign.starts_on, ends_on: campaign.ends_on, quota_per_clipper: String(campaign.quota_per_clipper), rate_per_1000: String(num(campaign.rate_per_1000)), min_views: String(campaign.min_views), max_per_clip: String(num(campaign.max_per_clip)), vip_bonus: String(num(campaign.vip_bonus)), status: campaign.status, rushes_url: campaign.rushes_url ?? "", brief: campaign.brief, forbidden: campaign.forbidden })}>Modifier</button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Payments({ stats, payouts, clippers, busy, act, now }: { stats: ClipperStats[]; payouts: PayoutRow[]; clippers: Clipper[]; busy: string | null; act: Act; now: Date }) {
  const due = stats.filter((item) => item.acquired > 0).sort((a, b) => b.acquired - a.acquired);
  const names = new Map(clippers.map((clipper): [string, string] => [clipper.id, `${clipper.display_name} (${clipper.ref})`]));
  const cycle = cycleFor(now);
  return (
    <div className={styles.stackLg}>
      <div className={styles.cardGold} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className={styles.h3}>Cycle du {formatDay(cycle.start, false)} au {formatDay(cycle.end, false)} · versement le {formatDay(cycle.payDate)}</span>
        <span className={`${styles.small} ${styles.soft}`}>Ici apparaissent les clips validés dont les vues sont figées (7 jours après publication) et pas encore payés. Fais le virement, colle la preuve, puis marque comme payé : le clippeur le voit tout de suite dans son espace.</span>
      </div>
      {!due.length ? <p className={styles.notice}>Personne à payer pour l&apos;instant.</p> : null}
      {due.map((item) => <PayCard key={item.clipper.id} item={item} busy={busy} act={act} />)}
      <section aria-labelledby="t-paid" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 id="t-paid" className={styles.h2}>Historique des versements</h2>
        {!payouts.length ? <p className={styles.notice}>Aucun versement enregistré.</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Réf.</th><th>Clippeur</th><th>Date</th><th>Clips</th><th>Vues</th><th>Bonus</th><th>Retenue</th><th>Total</th><th>Moyen</th><th>Preuve</th></tr></thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td><b>{payout.ref}</b></td>
                    <td>{names.get(payout.clipper_id ?? "") ?? ""}</td>
                    <td className={styles.muted}>{formatDay(payout.paid_at.slice(0, 10), false)}</td>
                    <td>{payout.clips_count}</td>
                    <td>{formatInt(num(payout.views_total))}</td>
                    <td>{formatEuro(num(payout.bonus_amount))}</td>
                    <td>{formatEuro(num(payout.deduction_amount))}</td>
                    <td><b>{formatEuro(num(payout.total))}</b></td>
                    <td>{payout.method ?? "—"}</td>
                    <td className={`${styles.small} ${styles.muted}`} style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{payout.proof ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PayCard({ item, busy, act }: { item: ClipperStats; busy: string | null; act: Act }) {
  const [bonus, setBonus] = useState("");
  const [deduction, setDeduction] = useState("");
  const [proof, setProof] = useState("");
  const { clipper } = item;
  const total = Math.max(0, round2(item.acquired + (Number(bonus.replace(",", ".")) || 0) - (Number(deduction.replace(",", ".")) || 0)));
  return (
    <article className={styles.card} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <b style={{ fontSize: 16 }}>{clipper.display_name} <span className={`${styles.small} ${styles.muted}`}>{clipper.ref}</span></b>
          <span className={`${styles.small} ${styles.muted}`}>{item.acquiredClips} clip{item.acquiredClips > 1 ? "s" : ""} figé{item.acquiredClips > 1 ? "s" : ""} · {formatInt(item.acquiredViews)} vues · base {formatEuro(item.acquired)}</span>
          <span className={`${styles.small} ${clipper.payout_method ? styles.soft : styles.warn}`}>{clipper.payout_method ? `${PAYOUT_LABEL[clipper.payout_method]}${clipper.payout_details ? ` · ${clipper.payout_details}` : ""}` : "Le clippeur n'a pas encore choisi son moyen de paiement"}</span>
        </div>
        <span className={styles.amount} style={{ fontSize: 28 }}>{formatEuro(total)}</span>
      </div>
      <div className={styles.formGrid}>
        <div className={styles.field}><label htmlFor={`b-${clipper.id}`} className={`${styles.small} ${styles.muted}`} style={{ fontWeight: 700 }}>Bonus VIP (€)</label><input id={`b-${clipper.id}`} className={styles.input} inputMode="decimal" placeholder="0" value={bonus} onChange={(event) => setBonus(event.target.value)} /></div>
        <div className={styles.field}><label htmlFor={`d-${clipper.id}`} className={`${styles.small} ${styles.muted}`} style={{ fontWeight: 700 }}>Retenue (€)</label><input id={`d-${clipper.id}`} className={styles.input} inputMode="decimal" placeholder="0" value={deduction} onChange={(event) => setDeduction(event.target.value)} /></div>
        <div className={styles.field}><label htmlFor={`p-${clipper.id}`} className={`${styles.small} ${styles.muted}`} style={{ fontWeight: 700 }}>Preuve (hash, référence)</label><input id={`p-${clipper.id}`} className={styles.input} maxLength={300} value={proof} onChange={(event) => setProof(event.target.value)} /></div>
      </div>
      <div className={styles.rowStart} style={{ justifyContent: "space-between" }}>
        <span className={`${styles.small} ${total < MIN_PAYOUT ? styles.warn : styles.muted}`}>{total < MIN_PAYOUT ? `Sous le seuil de ${formatEuro(MIN_PAYOUT)} : tu peux reporter au prochain cycle.` : "Fais le virement, puis marque comme payé."}</span>
        <button type="button" className={styles.btn} disabled={busy !== null} onClick={() => void act(`pay-${clipper.id}`, { action: "pay", clipper_id: clipper.id, bonus: bonus || 0, deduction: deduction || 0, proof }, `Versement enregistré pour ${clipper.display_name}.`)}><Wallet size={16} aria-hidden="true" />Marquer comme payé</button>
      </div>
    </article>
  );
}

function Candidates({ candidates, busy, act, now }: { candidates: Candidate[]; busy: string | null; act: Act; now: Date }) {
  const fresh = candidates.filter((candidate) => candidate.status === "new");
  const done = candidates.filter((candidate) => candidate.status !== "new").slice(0, 30);
  return (
    <div className={styles.stackLg}>
      <p className={`${styles.small} ${styles.muted}`} style={{ margin: 0 }}>Les candidatures arrivent par le formulaire {`${siteOrigin()}/clip/rejoindre`.replace(/^https?:\/\//, "")} : la personne y crée son compte et postule en même temps. Quand WhatsApp sera branché, les messages « clip » arriveront ici aussi.</p>
      {!fresh.length ? <p className={styles.notice}>Aucune nouvelle candidature.</p> : null}
      {fresh.map((candidate) => {
        const wa = whatsappLink(candidate.whatsapp);
        return (
          <article key={candidate.id} className={styles.card} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className={styles.row} style={{ flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <b style={{ fontSize: 16 }}>{candidate.display_name}</b>
                <span className={`${styles.small} ${styles.muted}`}>{candidate.whatsapp}{candidate.telegram ? ` · @${candidate.telegram}` : ""}{candidate.email ? ` · ${candidate.email}` : ""} · {ago(candidate.created_at, now)}</span>
              </div>
              {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className={styles.btnGhost}>Écrire sur WhatsApp<ExternalLink size={15} aria-hidden="true" /></a> : null}
            </div>
            <div className={styles.notice} style={{ whiteSpace: "pre-wrap" }}>{candidate.accounts}</div>
            <span className={`${styles.small} ${styles.soft}`}>Disponibilité : {candidate.availability}{candidate.sample_url ? " · " : ""}{candidate.sample_url ? <a href={candidate.sample_url} target="_blank" rel="noopener noreferrer">voir l&apos;exemple de montage</a> : null}</span>
            {candidate.message ? <span className={`${styles.small} ${styles.soft}`} style={{ whiteSpace: "pre-wrap" }}>« {candidate.message} »</span> : null}
            <div className={styles.rowStart}>
              <button type="button" className={styles.btn} disabled={busy !== null} onClick={() => void act(`acc-${candidate.id}`, { action: "accept_candidate", id: candidate.id, status: "test" }, `${candidate.display_name} est accepté en période de test.`)}><Check size={16} aria-hidden="true" />Accepter en test</button>
              <button type="button" className={styles.btnGhost} disabled={busy !== null} onClick={() => void act(`act-${candidate.id}`, { action: "accept_candidate", id: candidate.id, status: "active" }, `${candidate.display_name} est accepté.`)}>Accepter directement</button>
              <button type="button" className={styles.btnDanger} disabled={busy !== null} onClick={() => void act(`ref-${candidate.id}`, { action: "refuse_candidate", id: candidate.id }, "Candidature refusée.")}>Refuser</button>
            </div>
          </article>
        );
      })}
      {done.length ? (
        <section className={styles.list} aria-label="Candidatures traitées">
          <h2 className={styles.h3}>Déjà traitées</h2>
          {done.map((candidate) => (
            <div key={candidate.id} className={styles.item}>
              <span className={styles.grow}><b>{candidate.display_name}</b> <span className={`${styles.small} ${styles.muted}`}>{candidate.whatsapp} · {ago(candidate.created_at, now)}</span></span>
              <span className={`${styles.chip} ${candidate.status === "accepted" ? styles.chipOk : styles.chipNeutral}`}>{candidate.status === "accepted" ? "Acceptée" : "Refusée"}</span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
