"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import VipPostCard from "./VipPostCard";
import VipPublicationsEditor from "./VipPublicationsEditor";
import VipChat from "./VipChat";
import { createClient } from "@/lib/supabase/client";
import "./VipPortalShell.css";
import { Activity, ArrowRight, ArrowUpRight, Bell, BookOpen, Calculator, ChartColumn, ChartNoAxesCombined, ChevronDown, Crown, GitBranch, GraduationCap, Handshake, LockKeyhole, MessageCircle, PenLine, Radio, RefreshCw, Send, Settings, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { safeHttps, VipApiError, vipDate, vipRequest, type VipAccess, type VipPost } from "@/lib/vip/client";
import s from "./VipPortal.module.css";
import { activateConfiguredPush } from "@/lib/push/activation-client";
import { PushSetupError, pushSetupErrorText } from "@/lib/push/setup";

const views = [
  { key: "analysis", label: "Analyses", Icon: ChartNoAxesCombined },
  { key: "signal", label: "Signaux", Icon: Radio },
  { key: "performance", label: "Bilan", Icon: ChartColumn },
  { key: "followup", label: "Suivi", Icon: GitBranch },
  { key: "risk", label: "Simulateur", Icon: Calculator },
  { key: "training", label: "Bientôt", Icon: GraduationCap },
  { key: "partnership", label: "Partenariats", Icon: Handshake },
  { key: "telegram", label: "Telegram", Icon: Send },
  { key: "chat", label: "Chat", Icon: MessageCircle },
] as const;
export type VipView = typeof views[number]["key"];
const headings: Record<VipView, [string, string]> = {
  analysis: ["Analyses.", "Le contexte, les zones et les graphiques."],
  signal: ["Signaux.", "Les idées structurées de l’équipe."],
  followup: ["Suivi.", "Les mises à jour des idées partagées."],
  risk: ["Simulateur de risque.", "Préparer son lot avant la prise de position."],
  partnership: ["Partenariats.", "Les présentations et avantages des partenaires."], performance: ["Bilan.", "Le récapitulatif partagé avec le groupe."],
  training: ["Formation & coaching.", "Les prochaines expériences du cercle."], telegram: ["Telegram.", "Le lien avec ton canal privé."],
  chat: ["Chat.", "Les échanges entre membres du VIP."],
};
export default function VipPortal({ initialAdminMode = false }: { initialAdminMode?: boolean }) {
  const { t, locale } = useLocale();
  const [access, setAccess] = useState<VipAccess | null>(null);
  const [posts, setPosts] = useState<VipPost[]>([]);
  const [view, setView] = useState<VipView>("analysis");
  // A URL can select a view, never grant access. The API's verified admin role gates the editor.
  const [adminMode, setAdminMode] = useState(initialAdminMode);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [alertsOn, setAlertsOn] = useState(false);
  const requestVersion = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    try {
      const result = await vipRequest<VipAccess>("/api/vip/access", { signal });
      if (signal?.aborted || version !== requestVersion.current) return;
      setError(""); setAccess(result);
      if (result.active) {
        const [publications, push] = await Promise.all([
          vipRequest<{ posts: VipPost[] }>("/api/vip/posts", { signal }),
          vipRequest<{ publicKey?: string | null }>("/api/vip/push", { signal }).catch(() => null),
        ]);
        if (signal?.aborted || version !== requestVersion.current) return;
        setPosts(publications.posts || []); setPublicKey(push?.publicKey || null);
      } else { setPosts([]); setPublicKey(null); }
    } catch (cause) {
      if (signal?.aborted || version !== requestVersion.current) return;
      if (cause instanceof VipApiError && cause.status === 401) setAccess(null);
      setPosts([]); setError(cause instanceof Error ? cause.message : "Impossible de charger votre espace.");
    } finally { if (!signal?.aborted && version === requestVersion.current) setLoading(false); }
  }, []);
  // The initial authenticated fetch updates state after network I/O, with cancellation on unmount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  useEffect(() => {
    let currentUser: string | null | undefined;
    let pending: number | undefined;
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user.id ?? null;
      if (currentUser === undefined) { currentUser = nextUser; return; }
      if (nextUser === currentUser) return;
      currentUser = nextUser;
      ++requestVersion.current;
      setAccess(null); setPosts([]); setPublicKey(null); setAlertsOn(false);
      setMessage(""); setError(""); setLoading(Boolean(nextUser));
      window.clearTimeout(pending);
      // Keep authenticated network calls outside Supabase's auth callback.
      if (nextUser) pending = window.setTimeout(() => { void refresh(); }, 0);
    });
    return () => { data.subscription.unsubscribe(); window.clearTimeout(pending); };
  }, [refresh]);
  useEffect(() => {
    let lastRefresh = 0;
    const onFocus = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 1000) return;
      lastRefresh = Date.now(); void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const interval = window.setInterval(onFocus, 30000);
    const expiry = access?.membership?.expires_at ? new Date(access.membership.expires_at).getTime() : null;
    let timer: number | null = null;
    function scheduleExpiry() {
      if (expiry === null || !Number.isFinite(expiry)) return;
      const remaining = expiry - Date.now();
      if (remaining <= 0) { onFocus(); return; }
      timer = window.setTimeout(scheduleExpiry, Math.min(remaining + 500, 2147483647));
    }
    if (access?.active && expiry !== null) scheduleExpiry();
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); window.clearInterval(interval); if (timer !== null) window.clearTimeout(timer); };
  }, [access?.membership?.expires_at, access?.active, refresh]);
  async function renewal() {
    setBusy(true); setMessage("");
    try { await vipRequest("/api/vip/renewal", { method: "POST", body: "{}" }); setMessage("Votre demande de renouvellement a été transmise. L’équipe vérifiera votre règlement manuellement."); await refresh(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Impossible d’envoyer votre demande."); }
    finally { setBusy(false); }
  }
  async function enableAlerts() {
    setMessage("");
    if (!publicKey || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) { setMessage("Les alertes ne sont pas disponibles dans ce navigateur. Essayez depuis l’application ajoutée à votre écran d’accueil."); return; }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (ios && !window.matchMedia("(display-mode: standalone)").matches && !(navigator as Navigator & { standalone?: boolean }).standalone) { setMessage("Sur iPhone, ajoutez InvestPro à l’écran d’accueil puis ouvrez son icône pour activer les alertes."); return; }
    setBusy(true);
    try {
      const permission = Notification.requestPermission();
      if (await permission !== "granted") throw new Error("Les notifications ne sont pas autorisées. Vous pouvez modifier ce choix dans les réglages du téléphone.");
      const setup = await activateConfiguredPush();
      if (!setup.channels.includes("vip")) throw new PushSetupError("unavailable");
      setAlertsOn(true); setMessage("Les alertes VIP sont activées sur cet appareil.");
    } catch (cause) { setMessage(cause instanceof PushSetupError ? pushSetupErrorText(cause, locale === "en") : cause instanceof Error ? cause.message : "Impossible d’activer les alertes."); }
    finally { setBusy(false); }
  }
  const membership = access?.membership;
  const effectiveAdminMode = adminMode && access?.admin === true;
  const telegramUrl = access?.active ? safeHttps(access.telegramUrl) : null;
  const membershipCard = membership && <div className={s.membership}>
    <div><b>{membership.type === "abonnement" ? t("Abonnement") : t("Affiliation")} · {membership.email}</b>
      <p>{t("Activation :")}{" "}{vipDate(membership.started_at, locale)} · {membership.expires_at ? `${t("Fin d’accès :")} ${vipDate(membership.expires_at, locale)}` : t("Sans échéance automatique")}</p>
      {membership.renewal_requested_at && <small>{t("Renouvellement demandé · en attente de vérification par l’équipe.")}</small>}
    </div>
    {membership.type === "abonnement" && <button type="button" className={s.secondary} onClick={renewal} disabled={busy || Boolean(membership.renewal_requested_at)}>{membership.renewal_requested_at ? t("Demande transmise") : t("Demander mon renouvellement")}</button>}
  </div>;

  return <VipPortalFrame view={view} onSelect={setView} admin={access?.admin === true} adminMode={effectiveAdminMode} onModeChange={setAdminMode} onRefresh={() => void refresh()} loading={loading} editor={access?.admin === true ? <VipPublicationsEditor active={adminMode} embedded onPublished={() => void refresh()} /> : undefined}>
        {loading ? <div className={s.empty} role="status">{t("Chargement de votre espace privé…")}</div> : <>
          {error && <div className={s.notice} role="alert">{t(error)}{!access && <Link href="/login?next=%2Fdashboard%2Fvip">{t("Me connecter")}{" "}<ArrowRight size={15} /></Link>}</div>}
          {message && <p className={s.notice} role="status">{t(message)}</p>}
          {!access?.active ? <>
            {membershipCard}
            <section className={s.locked}><LockKeyhole size={30} /><h2>{membership?.status === "suspended" ? t("Votre accès VIP est suspendu.") : membership ? t("Votre abonnement est arrivé à échéance.") : t("Votre invitation vous ouvre le cercle.")}</h2><p>{membership ? t("Contactez l’équipe pour réactiver votre accès privé. Votre journal et vos rapports restent disponibles.") : t("Activez l’invitation personnelle remise par l’équipe après validation de votre adhésion.")}</p><Link className={s.primary} href="/vip">{t("Retrouver mon invitation")}{" "}<ArrowRight size={16} /></Link></section>
          </> : <>
            <details className={s.accountTools}>
              <summary><ShieldCheck size={15} aria-hidden="true" /><span>{t("Mon accès & application")}</span><ChevronDown size={15} aria-hidden="true" /></summary>
              <div className={s.accountPanel}>
                {membershipCard}
                <section className={s.mobileStart}>
                  <div><Smartphone size={21} aria-hidden="true" /><div><b>{t("Votre VIP, aussi sur téléphone.")}</b><p>{t("iPhone, Android et Samsung : votre espace vous accompagne.")}</p></div></div>
                  <button className={s.secondary} type="button" onClick={enableAlerts} disabled={busy || alertsOn || !publicKey}>{alertsOn ? <ShieldCheck size={16} /> : <Bell size={16} />}{alertsOn ? t("Alertes activées") : t("Activer les alertes")}</button>
                  <details><summary>{t("Installer InvestPro et recevoir les alertes")}</summary><p><b>{t("iPhone · Safari :")}</b> {t("Partager → Sur l’écran d’accueil → Ouvrir comme app web si proposé → Ajouter. iOS 16.4 minimum pour les alertes.")}</p><p><b>{t("Android et Samsung · Chrome :")}</b> {t("menu ⋮ → Installer et créer un raccourci, ou Installer l’application → Installer. Sur Samsung Internet, utilisez l’icône d’installation si elle apparaît.")}</p><p>{t("Ouvrez l’icône InvestPro et autorisez les notifications. Une connexion Internet est nécessaire.")}{!publicKey && t(" Les alertes seront proposées dès leur activation par l’équipe.")}</p></details>
                </section>
                <Link className={s.helpLink} href="/dashboard/contact"><MessageCircle size={15} aria-hidden="true" />{t("Contacter le support")}</Link>
              </div>
            </details>
            {view === "chat" ? !effectiveAdminMode && <VipChat key={access.user.id} userId={access.user.id} admin={access.admin} locale={locale === "en" ? "en" : "fr"} /> : <VipViewContent view={view} posts={posts} telegramUrl={telegramUrl} />}
          </>}
        </>}
  </VipPortalFrame>;
}

type VipPortalFrameProps = {
  view: VipView;
  onSelect: (view: VipView) => void;
  admin?: boolean;
  adminMode?: boolean;
  onModeChange?: (admin: boolean) => void;
  editor?: ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
  children: ReactNode;
};

function VipPortalFrame({ view, onSelect, admin = false, adminMode = false, onModeChange, editor, onRefresh, loading = false, children }: VipPortalFrameProps) {
  const { t } = useLocale();
  const content = useRef<HTMLDivElement>(null);
  function select(next: VipView) {
    onSelect(next);
    content.current?.scrollTo({ top: 0 });
  }
  return <div className={s.portal} data-investpro-vip-portal="true">
    <header className={s.portalHeader}>
      <div className={s.portalBrand}><span className={s.brandIcon}><Crown size={19} aria-hidden="true" /></span><div><b>InvestPro <span>VIP</span></b><small>{t(adminMode ? "Espace de publication" : "Le cercle privé")}</small></div></div>
      <div className={s.headerActions}><span className={s.privateLabel}><LockKeyhole size={12} aria-hidden="true" /><span>{t("Privé")}</span></span><LanguageSwitcher /></div>
    </header>
    {admin && <nav className={s.modeSwitch} aria-label={t("Vue de l’espace VIP")}>
      <button type="button" aria-pressed={!adminMode} onClick={() => onModeChange?.(false)}><UserRound size={16} aria-hidden="true" />{t("Membre")}</button>
      <button type="button" aria-pressed={adminMode} onClick={() => onModeChange?.(true)}><PenLine size={16} aria-hidden="true" />{t("Administrateur")}</button>
      <Link className={s.accessSettings} href="/dashboard/admin/vip" aria-label={t("Membres et réglages VIP")} title={t("Membres et réglages VIP")}><Settings size={18} aria-hidden="true" /></Link>
    </nav>}
    <div className={s.workspace} hidden={adminMode}>
      <nav className={s.navigation} aria-label={t("Rubriques de l’espace VIP")}>
        {views.map(({ key, label, Icon }) => <button className={s.railButton} type="button" key={key} onClick={() => select(key)} aria-pressed={view === key} data-coming-soon={key === "training" ? "true" : undefined} aria-label={key === "training" ? t("Formation & coaching · Bientôt") : t(label)}><Icon size={19} aria-hidden="true" /><span>{t(label)}</span></button>)}
      </nav>
      <div className={s.content} ref={content}>
        <header className={s.heading}><div><span className={s.eyebrow}>{t("Le cercle privé")}</span><h1>{t(headings[view][0])}</h1><p>{t(headings[view][1])}</p></div>{onRefresh && <button className={s.refresh} type="button" onClick={onRefresh} aria-label={t("Actualiser mon accès et les publications")} disabled={loading}><RefreshCw size={17} aria-hidden="true" /></button>}</header>
        {children}
      </div>
    </div>
    {admin && <div className={s.editorWorkspace} hidden={!adminMode}>{editor}</div>}
    <nav className={s.personalNav} aria-label={t("Mes outils InvestPro")}>
      <Link href="/dashboard/journal"><BookOpen size={18} aria-hidden="true" />{t("Journal")}</Link>
      <Link href="/dashboard/rapports"><ChartNoAxesCombined size={18} aria-hidden="true" />{t("Rapports")}</Link>
      <Link href="/dashboard/vip" aria-current="page"><Crown size={18} aria-hidden="true" />{t("VIP")}</Link>
      <Link href="/dashboard/profil"><UserRound size={18} aria-hidden="true" />{t("Profil")}</Link>
    </nav>
  </div>;
}

function VipViewContent({ view, posts, telegramUrl, preview = false }: { view: VipView; posts: VipPost[]; telegramUrl: string | null; preview?: boolean }) {
  const { t } = useLocale();
  const isFeed = view === "analysis" || view === "signal" || view === "performance" || view === "followup" || view === "partnership";
  const visible = isFeed ? posts.filter(post => post.category === view) : [];
  const emptyTitles: Partial<Record<VipView, string>> = {
    analysis: "Vos prochaines analyses apparaîtront ici.", signal: "Vos prochains signaux apparaîtront ici.", performance: "Vos prochains bilans apparaîtront ici.", followup: "Les prochaines mises à jour apparaîtront ici.", partnership: "Les prochains partenariats apparaîtront ici.",
  };
  return <>
    {isFeed && <div className={s.posts} aria-label={t("Publications") + " · " + t(headings[view][0])}>
      {visible.length ? <><div className={s.feedLabel}>{t("Publications")}</div>{visible.map(post => <VipPostCard key={post.id} post={post} preview={preview} />)}<p className={s.feedNote}><ShieldCheck size={13} aria-hidden="true" />{t("Seule l’équipe publie. Les membres peuvent réagir.")}</p></> : <div className={s.empty}><MessageCircle size={25} aria-hidden="true" /><h2>{t(emptyTitles[view] || "Les publications de l’équipe seront disponibles dans cette rubrique.")}</h2><p>{t("Les publications de l’équipe seront disponibles dans cette rubrique.")}</p></div>}
    </div>}
    {view === "performance" && <Link className={s.performanceLink} href="/dashboard/performances-vip"><Activity size={16} aria-hidden="true" />{t("Voir les performances VIP")}<ArrowUpRight size={14} aria-hidden="true" /></Link>}
    {view === "risk" && <section className={s.feature}><span className={s.trainingIcon}><Calculator size={20} aria-hidden="true" /></span><h2>{t("Calculer mon lot.")}</h2><p>{t("Retrouve le simulateur InvestPro pour préparer ton risque avant de prendre position.")}</p><Link className={s.primary} href="/dashboard/simulateur"><Calculator size={15} aria-hidden="true" />{t("Ouvrir le simulateur")}{" "}<ArrowUpRight size={16} /></Link></section>}
    {view === "training" && <section className={`${s.feature} ${s.trainingFeature}`}><span className={s.trainingIcon}><GraduationCap size={20} aria-hidden="true" /></span><span className={s.trainingSoon}>{t("Bientôt")}</span><h2>{t("Formation & coaching")}</h2><p>{t("Un nouvel espace pour apprendre et progresser avec le cercle privé.")}</p></section>}
    {view === "telegram" && <section className={s.feature}><Send size={31} /><h2>{t("Retrouvez votre communauté.")}</h2><p>{t("Votre espace InvestPro est actif. Demandez à rejoindre InvestPro Trading VIP ™ ; l’équipe vérifie et valide votre entrée manuellement.")}</p>{telegramUrl ? <a className={s.primary} href={telegramUrl} target="_blank" rel="noopener noreferrer">{t("Rejoindre Telegram")}{" "}<ArrowUpRight size={16} /></a> : <p className={s.notice}>{t("Le lien du canal sera disponible ici dès sa configuration par l’équipe.")}</p>}<small>{t("L’adhésion au canal et son renouvellement restent gérés par l’équipe sur Telegram.")}</small></section>}
    {view === "chat" && preview && <section className={s.feature}><MessageCircle size={30} /><h2>{t("Le chat des membres VIP.")}</h2><p>{t("Un espace pour échanger avec la communauté depuis InvestPro.")}</p><small>{t("Aperçu en lecture seule · les messages sont réservés aux membres connectés.")}</small></section>}
  </>;
}

/** Read-only presentation for an isolated preview route. No account/API access or mutations. */
export function VipPortalPreview({ posts, initialView = "analysis", adminPreview = false }: { posts: VipPost[]; initialView?: VipView; adminPreview?: boolean }) {
  const [view, setView] = useState<VipView>(initialView);
  const [adminMode, setAdminMode] = useState(false);
  return <VipPortalFrame view={view} onSelect={setView} admin={adminPreview} adminMode={adminPreview && adminMode} onModeChange={setAdminMode} editor={adminPreview ? <VipPublicationsEditor active={adminMode} embedded readOnlyPreview initialPosts={posts} /> : undefined}><VipViewContent view={view} posts={posts} telegramUrl={null} preview /></VipPortalFrame>;
}
