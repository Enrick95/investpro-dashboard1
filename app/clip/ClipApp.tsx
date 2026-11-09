"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronRight, Clock, ExternalLink, LayoutDashboard, Loader2, Plus, Target, Trash2, TrendingUp, Wallet, X } from "lucide-react";
import styles from "./clip.module.css";
import { ClipApiError, clipApi, clipSignOut } from "@/lib/clip/client";
import {
  CLIP_PLATFORMS,
  MIN_PAYOUT,
  PAYOUT_HINT,
  PAYOUT_LABEL,
  PAYOUT_METHODS,
  PLATFORM_LABEL,
  PLATFORM_SHORT,
  clipAmount,
  clipState,
  cycleProgress,
  daysUntil,
  formatDay,
  formatEuro,
  formatInt,
  freezeAt,
  num,
  platformFromUrl,
  summarize,
  type CampaignRow,
  type ClipPlatform,
  type ClipRow,
  type ClipState,
  type MoneySummary,
  type PayoutMethod,
  type PayoutRow,
} from "@/lib/clip/rules";

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
type Me = {
  email: string | null;
  owner: boolean;
  clipper: Clipper | null;
  candidate?: Candidate | null;
  accounts?: Account[];
  campaigns?: CampaignRow[];
  clips?: ClipRow[];
  payouts?: PayoutRow[];
};
type Tab = "home" | "campaigns" | "submit" | "clips" | "payments" | "profile";
type LoadState = { phase: "loading" } | { phase: "guest" } | { phase: "error"; message: string } | { phase: "ready"; me: Me };

function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function isOpen(campaign: CampaignRow, today: string): boolean {
  return campaign.status === "active" && campaign.ends_on >= today;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "C";
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
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
      <span className={styles.brandName}>Enrick95</span>
      <span className={styles.brandPill}>CLIPS</span>
    </span>
  );
}

function StateChip({ state }: { state: ClipState }) {
  if (state === "review") return <span className={`${styles.chip} ${styles.chipNeutral}`}>En revue</span>;
  if (state === "counting") return <span className={`${styles.chip} ${styles.chipWarn}`}><Clock size={12} aria-hidden="true" />Vues en cours</span>;
  if (state === "frozen") return <span className={`${styles.chip} ${styles.chipOk}`}><Check size={12} aria-hidden="true" />Figé</span>;
  if (state === "paid") return <span className={`${styles.chip} ${styles.chipGold}`}><Check size={12} aria-hidden="true" />Payé</span>;
  return <span className={`${styles.chip} ${styles.chipBad}`}><X size={12} aria-hidden="true" />Refusé</span>;
}

export default function ClipApp() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [tab, setTab] = useState<Tab>("home");
  const [preselect, setPreselect] = useState<string | null>(null);

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

  const goto = useCallback((next: Tab) => {
    setTab(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

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
        <div className={styles.center}>
          <BrandMark size={48} />
          <h1 className={styles.h1}>Espace clippeurs</h1>
          <p className={styles.soft}>Tu clippes le contenu d&apos;Enrick, tu publies sur tes comptes et tu es payé selon tes vues. Connecte-toi pour retrouver ton espace.</p>
          <Link href="/login?next=/clip" className={`${styles.btn} ${styles.btnBlock}`}>Me connecter</Link>
          <Link href="/clip/rejoindre" className={`${styles.btnGhost} ${styles.btnBlock}`}>Devenir clippeur</Link>
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

  return (
    <ClipperSpace
      me={me}
      clipper={me.clipper}
      tab={tab}
      goto={goto}
      preselect={preselect}
      openSubmit={(campaignId) => { setPreselect(campaignId); goto("submit"); }}
      reload={load}
    />
  );
}

function ClipperSpace({ me, clipper, tab, goto, preselect, openSubmit, reload }: {
  me: Me;
  clipper: Clipper;
  tab: Tab;
  goto: (tab: Tab) => void;
  preselect: string | null;
  openSubmit: (campaignId: string | null) => void;
  reload: () => Promise<void>;
}) {
  const campaigns = useMemo(() => me.campaigns ?? [], [me.campaigns]);
  const clips = useMemo(() => me.clips ?? [], [me.clips]);
  const accounts = me.accounts ?? [];
  const payouts = me.payouts ?? [];
  const now = useMemo(() => new Date(), []);
  const summary = useMemo(() => summarize(clips, campaigns, now), [clips, campaigns, now]);

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "home", label: "Accueil", icon: <LayoutDashboard size={22} aria-hidden="true" /> },
    { key: "campaigns", label: "Campagnes", icon: <Target size={22} aria-hidden="true" /> },
    { key: "submit", label: "Soumettre", icon: <span className={styles.plus}><Plus size={22} aria-hidden="true" /></span> },
    { key: "clips", label: "Clips", icon: <TrendingUp size={22} aria-hidden="true" /> },
    { key: "payments", label: "Paiements", icon: <Wallet size={22} aria-hidden="true" /> },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.app}>
        <header className={styles.topbar}>
          <button type="button" className={styles.brand} style={{ background: "none", border: 0, padding: 0 }} onClick={() => goto("home")} aria-label="Accueil">
            <Brand />
          </button>
          <button type="button" aria-label="Mon profil" className={`${styles.avatar} ${tab === "profile" ? styles.avatarActive : ""}`} onClick={() => goto("profile")}>
            {initials(clipper.display_name)}
          </button>
        </header>
        <main className={styles.main}>
          {clipper.status === "paused" ? <p className={styles.error}>Ton compte clippeur est en pause. Écris à Enrick sur WhatsApp pour en savoir plus.</p> : null}
          {tab === "home" ? <Home me={me} clipper={clipper} summary={summary} now={now} goto={goto} /> : null}
          {tab === "campaigns" ? <Campaigns campaigns={campaigns} clips={clips} openSubmit={openSubmit} /> : null}
          {tab === "submit" ? <Submit campaigns={campaigns} accounts={accounts} preselect={preselect} goto={goto} reload={reload} /> : null}
          {tab === "clips" ? <Clips clips={clips} campaigns={campaigns} /> : null}
          {tab === "payments" ? <Payments clipper={clipper} campaigns={campaigns} payouts={payouts} summary={summary} now={now} goto={goto} /> : null}
          {tab === "profile" ? <Profile me={me} clipper={clipper} accounts={accounts} reload={reload} /> : null}
        </main>
        <nav className={styles.tabbar} aria-label="Navigation">
          {tabs.map((item) => (
            <button key={item.key} type="button" className={`${styles.tab} ${tab === item.key ? styles.tabOn : ""}`} aria-current={tab === item.key ? "page" : undefined} onClick={() => (item.key === "submit" ? openSubmit(null) : goto(item.key))}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function PaymentHero({ clipper, summary, now, onClick, cta }: { clipper: Clipper; summary: MoneySummary; now: Date; onClick?: () => void; cta: string }) {
  const progress = cycleProgress(summary.cycle, now);
  const days = daysUntil(summary.cycle.payDate, now);
  const method = clipper.payout_method ? PAYOUT_LABEL[clipper.payout_method] : null;
  const content = (
    <>
      <span className={styles.row}>
        <span className={`${styles.small} ${styles.soft}`} style={{ fontWeight: 700 }}>Prochain paiement</span>
        <span className={`${styles.chip} ${styles.chipGold}`}><CalendarDays size={13} aria-hidden="true" />{formatDay(summary.cycle.payDate)}</span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className={styles.amount}>{formatEuro(summary.acquired)}</span>
        <span className={styles.soft} style={{ fontSize: 13.5 }}>
          déjà acquis
          {summary.pending > 0 ? <> · <span className={styles.warn} style={{ fontWeight: 700 }}>+ environ {formatEuro(summary.pending)} en cours</span></> : null}
          {" · "}{days === 0 ? "aujourd'hui" : `dans ${plural(days, "jour")}`}
        </span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className={`${styles.row} ${styles.small} ${styles.muted}`}>
          <span>Cycle du {formatDay(summary.cycle.start, false)} au {formatDay(summary.cycle.end, false)}</span>
          <span>jour {progress.day} sur {progress.length}</span>
        </span>
        <span className={styles.bar} role="progressbar" aria-label="Avancement du cycle" aria-valuenow={progress.day} aria-valuemin={0} aria-valuemax={progress.length}>
          <span className={styles.barFill} style={{ width: `${Math.round((progress.day / progress.length) * 100)}%` }} />
        </span>
      </span>
      <span className={styles.row} style={{ paddingTop: 12, borderTop: "1px solid rgba(240,197,117,0.2)", fontSize: 13 }}>
        <span className={method ? styles.soft : styles.warn}>{method ? `Versement en ${method}` : "Choisis ton moyen de paiement"}</span>
        {onClick ? <span className={styles.gold} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800 }}>{cta}<ChevronRight size={15} aria-hidden="true" /></span> : null}
      </span>
    </>
  );
  if (!onClick) return <section className={styles.cardGold} style={{ display: "flex", flexDirection: "column", gap: 14 }}>{content}</section>;
  return (
    <button type="button" className={styles.cardGold} onClick={onClick} style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "left", width: "100%", color: "inherit" }}>
      {content}
    </button>
  );
}

function campaignProgress(campaign: CampaignRow, clips: ClipRow[]): number {
  return clips.filter((clip) => clip.campaign_id === campaign.id && clip.status !== "rejected").length;
}

function Home({ me, clipper, summary, now, goto }: { me: Me; clipper: Clipper; summary: MoneySummary; now: Date; goto: (tab: Tab) => void }) {
  const today = todayIso();
  const clips = me.clips ?? [];
  const open = (me.campaigns ?? []).filter((campaign) => isOpen(campaign, today));
  const firstName = clipper.display_name.split(/\s+/)[0] || clipper.display_name;
  const todo: { key: string; title: string; text: string; tab: Tab; cta: string; warn: boolean }[] = [];
  if (!(me.accounts ?? []).length) todo.push({ key: "accounts", title: "Ajoute tes comptes", text: "TikTok, Instagram ou YouTube : sans eux, tes clips ne peuvent pas être validés.", tab: "profile", cta: "Ajouter", warn: true });
  if (!clipper.payout_method) todo.push({ key: "payout", title: "Choisis comment être payé", text: "USDT, Wise, PayPal ou virement.", tab: "profile", cta: "Choisir", warn: true });
  for (const campaign of open.slice(0, 2)) {
    const remaining = campaign.quota_per_clipper - campaignProgress(campaign, clips);
    if (remaining > 0) todo.push({ key: campaign.id, title: `Plus que ${plural(remaining, "clip")} pour « ${campaign.title} »`, text: `Fin de la campagne le ${formatDay(campaign.ends_on, false)}`, tab: "campaigns", cta: "Voir", warn: false });
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className={styles.h1}>Salut {firstName}</h1>
        <span className={`${styles.small} ${styles.muted}`}>Réf. {clipper.ref}{clipper.status === "test" ? " · période de test" : ""}</span>
      </div>
      <PaymentHero clipper={clipper} summary={summary} now={now} onClick={() => goto("payments")} cta="Voir le détail" />
      <section aria-label="Où en est ton argent" className={styles.grid3}>
        <div className={styles.mini}>
          <span className={`${styles.small} ${styles.teal}`} style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><span className={styles.dot} style={{ background: "#91D6D0" }} />Acquis</span>
          <span className={styles.value}>{formatEuro(summary.acquired)}</span>
          <span className={`${styles.small} ${styles.muted}`}>{plural(summary.acquiredClips, "clip")} figé{summary.acquiredClips > 1 ? "s" : ""}</span>
        </div>
        <div className={styles.mini}>
          <span className={`${styles.small} ${styles.warn}`} style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><span className={styles.dot} style={{ background: "#F2B45A" }} />En cours</span>
          <span className={styles.value}>≈ {formatEuro(summary.pending)}</span>
          <span className={`${styles.small} ${styles.muted}`}>{plural(summary.pendingClips, "clip")}, figés d&apos;ici le {formatDay(summary.cycle.end, false)}</span>
        </div>
        <div className={styles.mini}>
          <span className={`${styles.small} ${styles.soft}`} style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><span className={styles.dot} style={{ background: "#C4C8BD" }} />En revue</span>
          <span className={styles.value}>{plural(summary.review, "clip")}</span>
          <span className={`${styles.small} ${styles.muted}`}>réponse sous 24 h</span>
        </div>
      </section>
      {todo.length ? (
        <section aria-labelledby="t-todo" className={styles.cardWarn}>
          <h2 id="t-todo" className={styles.h3} style={{ marginBottom: 6 }}>À faire</h2>
          <div className={styles.list}>
            {todo.map((item) => (
              <div key={item.key} className={styles.item}>
                <span className={styles.thumb} style={{ color: item.warn ? "#F2B45A" : "#91D6D0" }}>{item.warn ? <AlertTriangle size={17} aria-hidden="true" /> : <Target size={17} aria-hidden="true" />}</span>
                <span className={styles.grow} style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 700 }}>{item.title}</span>
                  <span className={`${styles.small} ${styles.muted}`}>{item.text}</span>
                </span>
                <button type="button" className={item.warn ? styles.btn : styles.btnGhost} style={item.warn ? { minHeight: 44, padding: "0 14px", fontSize: 13 } : undefined} onClick={() => goto(item.tab)}>{item.cta}</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section aria-labelledby="t-camp" className={styles.list}>
        <div className={styles.row}>
          <h2 id="t-camp" className={styles.h2}>Mes campagnes</h2>
          <button type="button" className={styles.linkBtn} onClick={() => goto("campaigns")}>Tout voir</button>
        </div>
        {open.length ? open.map((campaign) => {
          const done = campaignProgress(campaign, clips);
          const pct = Math.min(100, Math.round((done / Math.max(1, campaign.quota_per_clipper)) * 100));
          return (
            <button key={campaign.id} type="button" className={styles.item} style={{ flexDirection: "column", alignItems: "stretch", gap: 8, background: "none", border: 0, borderTop: "1px solid rgba(255,255,255,0.06)", textAlign: "left", color: "inherit", width: "100%" }} onClick={() => goto("campaigns")}>
              <span className={styles.row}><span style={{ fontWeight: 700 }}>{campaign.title}</span><span className={`${styles.small} ${styles.soft}`}>{done} / {campaign.quota_per_clipper} clips</span></span>
              <span className={styles.bar}><span className={styles.barFill} style={{ width: `${pct}%` }} /></span>
              <span className={`${styles.small} ${styles.muted}`}>{campaign.platforms} · fin le {formatDay(campaign.ends_on, false)}</span>
            </button>
          );
        }) : <p className={styles.notice}>Aucune campagne ouverte pour le moment. Tu seras prévenu dès qu&apos;une nouvelle arrive.</p>}
      </section>
    </>
  );
}

function Campaigns({ campaigns, clips, openSubmit }: { campaigns: CampaignRow[]; clips: ClipRow[]; openSubmit: (campaignId: string | null) => void }) {
  const today = todayIso();
  const open = campaigns.filter((campaign) => isOpen(campaign, today));
  const past = campaigns.filter((campaign) => !isOpen(campaign, today));
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className={styles.h1}>Campagnes</h1>
        <span className={`${styles.small} ${styles.muted}`}>Les briefs d&apos;Enrick et ce que chaque clip te rapporte.</span>
      </div>
      {!open.length ? <p className={styles.notice}>Aucune campagne ouverte pour le moment.</p> : null}
      {open.map((campaign) => {
        const done = campaignProgress(campaign, clips);
        const pct = Math.min(100, Math.round((done / Math.max(1, campaign.quota_per_clipper)) * 100));
        const lines = campaign.brief.split("\n").map((line) => line.trim()).filter(Boolean);
        return (
          <article key={campaign.id} className={styles.cardGold} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className={styles.row}>
              <span className={`${styles.small} ${styles.muted}`} style={{ fontWeight: 700 }}>{campaign.platforms}</span>
              <span className={`${styles.chip} ${styles.chipOk}`}>En cours</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 className={styles.h2} style={{ fontSize: 19 }}>{campaign.title}</h2>
              <span className={`${styles.small} ${styles.muted}`}>Du {formatDay(campaign.starts_on, false)} au {formatDay(campaign.ends_on, false)} · {campaign.quota_per_clipper} clips par clippeur</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className={styles.row} style={{ fontSize: 13 }}><span style={{ fontWeight: 700 }}>Toi : {done} / {campaign.quota_per_clipper} clips</span><span className={styles.muted}>{done >= campaign.quota_per_clipper ? "objectif atteint" : `encore ${campaign.quota_per_clipper - done}`}</span></div>
              <span className={styles.bar}><span className={styles.barFill} style={{ width: `${pct}%` }} /></span>
            </div>
            <div className={styles.grid2}>
              <div className={styles.mini} style={{ background: "#181c16" }}><span className={`${styles.value} ${styles.gold}`} style={{ fontSize: 15 }}>{formatEuro(num(campaign.rate_per_1000))} / 1 000 vues</span><span className={`${styles.small} ${styles.muted}`}>vues figées 7 jours après la publication</span></div>
              <div className={styles.mini} style={{ background: "#181c16" }}><span className={`${styles.value} ${styles.gold}`} style={{ fontSize: 15 }}>+{formatEuro(num(campaign.vip_bonus))} / VIP</span><span className={`${styles.small} ${styles.muted}`}>ramené par ton lien</span></div>
            </div>
            <span className={`${styles.small} ${styles.muted}`}>Rien sous {formatInt(campaign.min_views)} vues · {formatEuro(num(campaign.max_per_clip))} maximum par clip</span>
            {lines.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <h3 className={styles.h3} style={{ fontSize: 13 }}>Le brief</h3>
                <ul className={styles.bullets}>
                  {lines.map((line, index) => <li key={index}><Check size={16} color="#91D6D0" aria-hidden="true" style={{ marginTop: 2 }} />{line}</li>)}
                </ul>
              </div>
            ) : null}
            {campaign.forbidden ? (
              <div style={{ display: "flex", gap: 10, padding: 12, borderRadius: 14, background: "rgba(255,111,145,0.08)", border: "1px solid rgba(255,111,145,0.25)" }}>
                <X size={16} color="#FF6F91" aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
                <span className={`${styles.small} ${styles.soft}`}><b className={styles.bad}>Interdit :</b> {campaign.forbidden}</span>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10 }}>
              {campaign.rushes_url ? <a href={campaign.rushes_url} target="_blank" rel="noopener noreferrer" className={styles.btnGhost} style={{ flex: "1 1 0" }}>Rushs<ExternalLink size={15} aria-hidden="true" /></a> : null}
              <button type="button" className={styles.btn} style={{ flex: "1.4 1 0" }} onClick={() => openSubmit(campaign.id)}><Plus size={17} aria-hidden="true" />Soumettre un clip</button>
            </div>
          </article>
        );
      })}
      {past.length ? (
        <section className={styles.list} aria-label="Campagnes terminées">
          <h2 className={styles.h3}>Terminées</h2>
          {past.map((campaign) => (
            <div key={campaign.id} className={styles.item}>
              <span className={styles.grow} style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 700 }}>{campaign.title}</span>
                <span className={`${styles.small} ${styles.muted}`}>Fin le {formatDay(campaign.ends_on, false)} · toi : {campaignProgress(campaign, clips)} clips</span>
              </span>
              <span className={`${styles.chip} ${styles.chipNeutral}`}>Terminée</span>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

const CHARTER = [
  "Sous-titres et accroche dans les 2 premières secondes",
  "Aucune promesse de gains ni montant gagné",
  "Le clip respecte le brief de la campagne",
];

function Submit({ campaigns, accounts, preselect, goto, reload }: { campaigns: CampaignRow[]; accounts: Account[]; preselect: string | null; goto: (tab: Tab) => void; reload: () => Promise<void> }) {
  const today = todayIso();
  const open = campaigns.filter((campaign) => isOpen(campaign, today));
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(today);
  const [campaignId, setCampaignId] = useState(() => (preselect && open.some((campaign) => campaign.id === preselect) ? preselect : open[0]?.id ?? ""));
  const [checks, setChecks] = useState<boolean[]>([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const platform = url.trim() ? platformFromUrl(url) : null;
  const hasAccount = platform ? accounts.some((account) => account.platform === platform) : true;
  const ready = Boolean(platform && title.trim().length >= 2 && day && campaignId && checks.every(Boolean) && hasAccount);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await clipApi<{ clip: { ref: string } }>("/api/clip/clips", { method: "POST", body: { url: url.trim(), title: title.trim(), published_on: day, campaign_id: campaignId, checks } });
      setSent(result.clip.ref);
      setUrl("");
      setTitle("");
      setChecks([false, false, false]);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <>
        <h1 className={styles.h1}>Clip envoyé</h1>
        <div className={styles.success} role="status">Ton clip {sent} est en revue. Enrick te répond sous 24 h, ici et sur WhatsApp.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className={styles.btnGhost} style={{ flex: "1 1 0" }} onClick={() => setSent(null)}>Soumettre un autre</button>
          <button type="button" className={styles.btn} style={{ flex: "1 1 0" }} onClick={() => goto("clips")}>Voir mes clips</button>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={submit} className={styles.stackLg}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className={styles.h1}>Soumettre un clip</h1>
        <span className={`${styles.small} ${styles.muted}`}>Publie d&apos;abord ton clip, puis colle son lien ici.</span>
      </div>
      {!open.length ? <p className={styles.notice}>Aucune campagne ouverte pour le moment : tu ne peux pas soumettre de clip.</p> : null}
      {!accounts.length ? (
        <div className={styles.cardWarn} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontWeight: 700 }}>Ajoute d&apos;abord tes comptes</span>
          <span className={`${styles.small} ${styles.muted}`}>On vérifie que le clip est publié sur un compte à toi.</span>
          <button type="button" className={styles.btn} onClick={() => goto("profile")}>Ajouter mes comptes</button>
        </div>
      ) : null}
      <div className={styles.field}>
        <label htmlFor="clip-url" className={styles.label}>Lien du clip</label>
        <input id="clip-url" className={styles.input} type="url" inputMode="url" placeholder="https://www.tiktok.com/@ton.compte/video/…" value={url} onChange={(event) => setUrl(event.target.value)} />
        {url.trim() ? (
          platform ? (
            <span className={`${styles.small} ${hasAccount ? styles.teal : styles.warn}`} style={{ fontWeight: 700 }}>
              {hasAccount ? `Lien ${PLATFORM_LABEL[platform]} reconnu` : `Ajoute ton compte ${PLATFORM_LABEL[platform]} dans ton profil avant d'envoyer`}
            </span>
          ) : <span className={`${styles.small} ${styles.warn}`} style={{ fontWeight: 700 }}>Lien non reconnu : TikTok, Instagram ou YouTube uniquement</span>
        ) : null}
      </div>
      <div className={styles.field}>
        <label htmlFor="clip-title" className={styles.label}>Titre du clip</label>
        <input id="clip-title" className={styles.input} maxLength={120} placeholder="Ex. Le trade Gold du 8 nov. en 40 s" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className={styles.field}>
        <label htmlFor="clip-day" className={styles.label}>Date de publication</label>
        <input id="clip-day" className={styles.input} type="date" max={today} value={day} onChange={(event) => setDay(event.target.value)} />
      </div>
      {open.length ? (
        <fieldset style={{ margin: 0, padding: 0, border: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <legend className={styles.label} style={{ padding: 0, marginBottom: 8 }}>Campagne</legend>
          {open.map((campaign) => (
            <button key={campaign.id} type="button" aria-pressed={campaignId === campaign.id} className={`${styles.option} ${campaignId === campaign.id ? styles.optionOn : ""}`} onClick={() => setCampaignId(campaign.id)}>
              <span className={`${styles.radio} ${campaignId === campaign.id ? styles.radioOn : ""}`} aria-hidden="true" />
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 800 }}>{campaign.title}</span>
                <span className={`${styles.small} ${styles.muted}`}>{campaign.platforms} · fin le {formatDay(campaign.ends_on, false)}</span>
              </span>
            </button>
          ))}
        </fieldset>
      ) : null}
      <section aria-labelledby="t-charter" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 id="t-charter" className={styles.label} style={{ margin: 0 }}>Avant d&apos;envoyer</h2>
        {CHARTER.map((label, index) => (
          <button key={label} type="button" aria-pressed={checks[index]} className={styles.option} style={{ minHeight: 50 }} onClick={() => setChecks((current) => current.map((value, i) => (i === index ? !value : value)))}>
            <span className={`${styles.check} ${checks[index] ? styles.checkOn : ""}`} aria-hidden="true">{checks[index] ? <Check size={14} strokeWidth={3} /> : null}</span>
            <span style={{ fontSize: 13.5 }}>{label}</span>
          </button>
        ))}
      </section>
      <div className={styles.notice} style={{ display: "flex", gap: 10 }}>
        <Clock size={16} color="#F0C575" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Une fois validé, ton clip compte ses vues pendant 7 jours. Ensuite le chiffre est figé et payé au versement suivant (le 1er ou le 16).</span>
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button type="submit" className={`${styles.btn} ${styles.btnBlock}`} disabled={!ready || busy}>
        {busy ? <Loader2 size={17} className={styles.spin} aria-hidden="true" /> : null}
        {ready ? "Envoyer pour validation" : "Complète le formulaire et coche les 3 points"}
      </button>
    </form>
  );
}

const FILTERS: { key: "all" | ClipState; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "review", label: "En revue" },
  { key: "counting", label: "En cours" },
  { key: "frozen", label: "Figés" },
  { key: "paid", label: "Payés" },
  { key: "rejected", label: "Refusés" },
];

function Clips({ clips, campaigns }: { clips: ClipRow[]; campaigns: CampaignRow[] }) {
  const [filter, setFilter] = useState<"all" | ClipState>("all");
  const byId = useMemo(() => new Map<string, CampaignRow>(campaigns.map((campaign): [string, CampaignRow] => [campaign.id, campaign])), [campaigns]);
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: clips.length };
    for (const clip of clips) {
      const key = clipState(clip);
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  }, [clips]);
  const visible = clips.filter((clip) => filter === "all" || clipState(clip) === filter);
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className={styles.h1}>Mes clips</h1>
        <span className={`${styles.small} ${styles.muted}`}>{plural(clips.length, "clip")} soumis · les vues sont mises à jour par Enrick</span>
      </div>
      <div className={styles.chips} role="group" aria-label="Filtrer mes clips">
        {FILTERS.filter((item) => item.key === "all" || (counts[item.key] ?? 0) > 0).map((item) => (
          <button key={item.key} type="button" aria-pressed={filter === item.key} className={`${styles.filter} ${filter === item.key ? styles.filterOn : ""}`} onClick={() => setFilter(item.key)}>
            {item.label} · {counts[item.key] ?? 0}
          </button>
        ))}
      </div>
      <section className={styles.list} aria-label="Liste des clips">
        {!visible.length ? <p className={styles.notice}>Aucun clip ici pour l&apos;instant.</p> : null}
        {visible.map((clip) => {
          const state = clipState(clip);
          const campaign = byId.get(clip.campaign_id);
          const views = state === "frozen" || state === "paid" ? num(clip.frozen_views ?? clip.views) : num(clip.views);
          const amount = campaign ? clipAmount(views, campaign) : 0;
          const under = campaign && state !== "review" && state !== "rejected" && views < campaign.min_views;
          let note = "";
          if (state === "review") note = "en attente de validation";
          else if (state === "counting") note = `vues figées le ${formatDay(freezeAt(clip.published_at).toISOString(), false)}`;
          else if (state === "frozen") note = "payé au prochain versement";
          else if (state === "paid") note = "versé";
          else note = clip.reject_reason ?? "refusé";
          return (
            <div key={clip.id} className={`${styles.item} ${styles.itemTop}`}>
              <span className={styles.thumb} style={{ width: 44, height: 58 }}>{PLATFORM_SHORT[clip.platform]}</span>
              <span className={styles.grow} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <a href={clip.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: "#F3EFE6", textDecoration: "none" }}>{clip.title}</a>
                <span className={`${styles.small} ${styles.muted}`}>{clip.ref} · {PLATFORM_LABEL[clip.platform]}{campaign ? ` · ${campaign.title}` : ""}</span>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px" }}>
                  <StateChip state={state} />
                  <span className={`${styles.small} ${styles.muted}`}>{note}</span>
                </span>
                {under && campaign ? <span className={`${styles.small} ${styles.warn}`}>Sous le minimum de {formatInt(campaign.min_views)} vues pour l&apos;instant</span> : null}
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, textAlign: "right", flexShrink: 0 }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>{state === "review" || state === "rejected" ? "—" : formatInt(views)}</span>
                <span className={`${styles.small} ${styles.muted}`}>{state === "rejected" ? "0 €" : state === "review" ? "" : `${state === "counting" ? "≈ " : ""}${formatEuro(amount)}`}</span>
              </span>
            </div>
          );
        })}
      </section>
    </>
  );
}

function Payments({ clipper, campaigns, payouts, summary, now, goto }: { clipper: Clipper; campaigns: CampaignRow[]; payouts: PayoutRow[]; summary: MoneySummary; now: Date; goto: (tab: Tab) => void }) {
  const reference = campaigns.find((campaign) => campaign.status === "active") ?? campaigns[0];
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className={styles.h1}>Paiements</h1>
        <span className={`${styles.small} ${styles.muted}`}>Versements le 1er et le 16 de chaque mois</span>
      </div>
      <PaymentHero clipper={clipper} summary={summary} now={now} onClick={() => goto("profile")} cta="Modifier" />
      <section className={styles.card} aria-labelledby="t-calc" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 id="t-calc" className={styles.h3}>Le calcul</h2>
        <div className={styles.row} style={{ fontSize: 13.5 }}><span className={styles.soft}>{plural(summary.acquiredClips, "clip")} figé{summary.acquiredClips > 1 ? "s" : ""} · {formatInt(summary.acquiredViews)} vues</span><b>{formatEuro(summary.acquired)}</b></div>
        <div className={styles.row} style={{ fontSize: 13.5 }}><span className={styles.soft}>En cours, figé d&apos;ici le {formatDay(summary.cycle.end, false)}</span><b>≈ {formatEuro(summary.pending)}</b></div>
        <div className={styles.row} style={{ fontSize: 13.5 }}><span className={styles.soft}>Pour le versement suivant</span><b>≈ {formatEuro(summary.later)}</b></div>
        <div className={styles.row} style={{ fontSize: 13.5 }}><span className={styles.soft}>Bonus VIP</span><span className={styles.muted}>ajouté au versement</span></div>
        {reference ? (
          <span className={`${styles.small} ${styles.muted}`}>
            Barème : {formatEuro(num(reference.rate_per_1000))} pour 1 000 vues figées, rien sous {formatInt(reference.min_views)} vues, {formatEuro(num(reference.max_per_clip))} maximum par clip, +{formatEuro(num(reference.vip_bonus))} par VIP ramené. Versement à partir de {formatEuro(MIN_PAYOUT)}, sinon reporté.
          </span>
        ) : null}
      </section>
      <section className={styles.list} aria-labelledby="t-history">
        <div className={styles.row}><h2 id="t-history" className={styles.h2}>Historique</h2></div>
        {!payouts.length ? <p className={styles.notice}>Pas encore de versement. Ton premier arrive après tes premiers clips figés.</p> : null}
        {payouts.map((payout) => (
          <div key={payout.id} className={styles.item}>
            <span className={styles.grow} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: 700 }}>{payout.ref} · {formatDay(payout.paid_at.slice(0, 10), false)}</span>
              <span className={`${styles.small} ${styles.muted} ${styles.ellipsis}`}>{payout.method ?? "Versement"}{payout.proof ? ` · preuve : ${payout.proof}` : ""}</span>
            </span>
            <b>{formatEuro(num(payout.total))}</b>
            <span className={`${styles.chip} ${styles.chipOk}`}><Check size={12} aria-hidden="true" />Payé</span>
          </div>
        ))}
      </section>
    </>
  );
}

function Profile({ me, clipper, accounts, reload }: { me: Me; clipper: Clipper; accounts: Account[]; reload: () => Promise<void> }) {
  const [platform, setPlatform] = useState<ClipPlatform>("tiktok");
  const [handle, setHandle] = useState("");
  const [followers, setFollowers] = useState("");
  const [method, setMethod] = useState<PayoutMethod | null>(clipper.payout_method);
  const [details, setDetails] = useState(clipper.payout_details ?? "");
  const [whatsapp, setWhatsapp] = useState(clipper.whatsapp ?? "");
  const [telegram, setTelegram] = useState(clipper.telegram ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage({ kind: "ok", text: success });
      await reload();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Enregistrement impossible." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className={styles.avatar} style={{ width: 60, height: 60, fontSize: 18 }}>{initials(clipper.display_name)}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <h1 className={styles.h1} style={{ fontSize: 22 }}>{clipper.display_name}</h1>
          <span className={`${styles.small} ${styles.muted}`}>Réf. {clipper.ref} · {me.email ?? ""}</span>
          <span className={`${styles.chip} ${clipper.status === "active" ? styles.chipOk : clipper.status === "test" ? styles.chipNeutral : styles.chipBad}`} style={{ alignSelf: "flex-start" }}>{clipper.status === "active" ? "Actif" : clipper.status === "test" ? "Période de test" : "En pause"}</span>
        </div>
      </div>
      {message ? <p className={message.kind === "ok" ? styles.success : styles.error} role="status">{message.text}</p> : null}

      <section className={styles.card} aria-labelledby="t-accounts" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 id="t-accounts" className={styles.h3}>Mes comptes</h2>
        <span className={`${styles.small} ${styles.muted}`}>Les comptes sur lesquels tu publies tes clips. Enrick les vérifie avant de valider tes premiers clips.</span>
        <div className={styles.list}>
          {accounts.map((account) => (
            <div key={account.id} className={styles.item}>
              <span className={styles.thumb}>{PLATFORM_SHORT[account.platform]}</span>
              <span className={styles.grow} style={{ display: "flex", flexDirection: "column" }}>
                <span className={styles.ellipsis} style={{ fontWeight: 700 }}>@{account.handle}</span>
                <span className={`${styles.small} ${styles.muted}`}>{PLATFORM_LABEL[account.platform]}{account.followers !== null ? ` · ${formatInt(account.followers)} abonnés` : ""}</span>
              </span>
              <span className={`${styles.chip} ${account.verified ? styles.chipOk : styles.chipNeutral}`}>{account.verified ? "Vérifié" : "À vérifier"}</span>
              <button type="button" className={styles.iconBtn} style={{ background: "transparent", color: "#A8ADA3" }} aria-label={`Retirer @${account.handle}`} disabled={busy !== null} onClick={() => run(`rm-${account.id}`, () => clipApi("/api/clip/me", { method: "POST", body: { action: "remove_account", id: account.id } }), "Compte retiré.")}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <form
          style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}
          onSubmit={(event) => {
            event.preventDefault();
            void run("add", () => clipApi("/api/clip/me", { method: "POST", body: { action: "add_account", platform, handle, followers: followers || null } }), "Compte ajouté.").then(() => { setHandle(""); setFollowers(""); });
          }}
        >
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="acc-platform" className={styles.label}>Réseau</label>
              <select id="acc-platform" className={styles.select} value={platform} onChange={(event) => setPlatform(event.target.value as ClipPlatform)}>
                {CLIP_PLATFORMS.map((value) => <option key={value} value={value}>{PLATFORM_LABEL[value]}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="acc-followers" className={styles.label}>Abonnés</label>
              <input id="acc-followers" className={styles.input} inputMode="numeric" placeholder="Ex. 12400" value={followers} onChange={(event) => setFollowers(event.target.value.replace(/[^0-9]/g, ""))} />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="acc-handle" className={styles.label}>Nom du compte</label>
            <input id="acc-handle" className={styles.input} placeholder="@ton.compte" value={handle} onChange={(event) => setHandle(event.target.value)} />
          </div>
          <button type="submit" className={styles.btnGhost} disabled={!handle.trim() || busy !== null}><Plus size={15} aria-hidden="true" />Ajouter ce compte</button>
        </form>
      </section>

      <section className={styles.card} aria-labelledby="t-payout" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 id="t-payout" className={styles.h3}>Moyen de paiement</h2>
        <div className={styles.grid2} role="group" aria-label="Choisir mon moyen de paiement">
          {PAYOUT_METHODS.map((value) => (
            <button key={value} type="button" aria-pressed={method === value} className={`${styles.option} ${method === value ? styles.optionOn : ""}`} style={{ minHeight: 52 }} onClick={() => setMethod(value)}>
              <span style={{ fontWeight: 800, fontSize: 13.5 }}>{PAYOUT_LABEL[value]}</span>
            </button>
          ))}
        </div>
        {method ? (
          <div className={styles.field}>
            <label htmlFor="pay-details" className={styles.label}>{PAYOUT_HINT[method]}</label>
            <input id="pay-details" className={styles.input} maxLength={200} value={details} onChange={(event) => setDetails(event.target.value)} />
          </div>
        ) : null}
        <button type="button" className={styles.btn} disabled={!method || busy !== null} onClick={() => run("payout", () => clipApi("/api/clip/me", { method: "PATCH", body: { payout_method: method, payout_details: details } }), "Moyen de paiement enregistré.")}>Enregistrer</button>
      </section>

      <section className={styles.card} aria-labelledby="t-contact" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 id="t-contact" className={styles.h3}>Mes contacts</h2>
        <div className={styles.field}>
          <label htmlFor="ct-whatsapp" className={styles.label}>WhatsApp</label>
          <input id="ct-whatsapp" className={styles.input} inputMode="tel" placeholder="+33612345678" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="ct-telegram" className={styles.label}>Telegram</label>
          <input id="ct-telegram" className={styles.input} placeholder="@pseudo" value={telegram} onChange={(event) => setTelegram(event.target.value)} />
        </div>
        <button type="button" className={styles.btnGhost} disabled={busy !== null} onClick={() => run("contact", () => clipApi("/api/clip/me", { method: "PATCH", body: { whatsapp, telegram } }), "Contacts enregistrés.")}>Enregistrer mes contacts</button>
      </section>

      {me.owner ? <Link href="/clip/admin" className={`${styles.btnGhost} ${styles.btnBlock}`}>Ouvrir l&apos;espace admin</Link> : null}
      <button type="button" className={styles.linkBtn} style={{ alignSelf: "center" }} onClick={async () => { await clipSignOut(); window.location.href = "/clip"; }}>Se déconnecter</button>
    </>
  );
}
