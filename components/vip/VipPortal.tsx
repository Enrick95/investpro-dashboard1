"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Activity, ArrowRight, ArrowUpRight, Bell, BookOpen, Calculator, ChartNoAxesCombined, ChevronDown, Crown, GitBranch, GraduationCap, Handshake, LockKeyhole, MessageCircle, Radio, RefreshCw, Send, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { safeHttps, VipApiError, vipDate, vipRequest, type VipAccess, type VipPost } from "@/lib/vip/client";
import s from "./VipPortal.module.css";

const views = [
  { key: "analysis", label: "Analyses", Icon: ChartNoAxesCombined },
  { key: "signal", label: "Signaux", Icon: Radio },
  { key: "performance", label: "Bilan", Icon: Activity },
  { key: "followup", label: "Suivi", Icon: GitBranch },
  { key: "risk", label: "Simulateur", Icon: Calculator },
  { key: "training", label: "Bientôt", Icon: GraduationCap },
  { key: "partnership", label: "Partenariats", Icon: Handshake },
  { key: "telegram", label: "Telegram", Icon: Send },
] as const;
type View = typeof views[number]["key"];
const headings: Record<View, [string, string]> = {
  analysis: ["Analyses.", "Le contexte, les zones et les graphiques."],
  signal: ["Signaux.", "Les idées structurées de l’équipe."],
  followup: ["Suivi.", "Les mises à jour des scénarios partagés."],
  risk: ["Simulateur de risque.", "Préparez votre lot avant la prise de position."],
  partnership: ["Vos partenariats.", "Les présentations, les conditions et les nouveautés du cercle."], performance: ["Performances VIP.", "Le bilan du groupe, au même endroit."],
  training: ["Formation & coaching.", "Le prochain chapitre de votre progression."], telegram: ["Votre communauté Telegram.", "Retrouvez InvestPro Trading VIP ™ et l’équipe."],
};
const categoryLabels: Record<string, string> = { signal: "Signal", analysis: "Analyse", followup: "Suivi", partnership: "Partenariat" };

function PostCard({ post }: { post: VipPost }) {
  const { t, locale } = useLocale();
  const image = safeHttps(post.image_url);
  const levels = [["Entrée", post.levels?.entry], ["Stop loss", post.levels?.stopLoss], ["Objectif 1", post.levels?.takeProfit], ["Objectif 2", post.levels?.takeProfit2]] as const;
  const availableLevels = levels.filter(([, value]) => typeof value === "number" && Number.isFinite(value));
  return <article className={s.post} id={`publication-${post.id}`}>
    <div className={s.postMeta}><span className={s.avatar}>{t("IP")}</span><div><b>{t("InvestPro")}</b><small>{vipDate(post.created_at, locale)}</small></div><span className={s.postTag}>{t(categoryLabels[post.category] || "Publication")}</span></div>
    {post.category === "signal" && <div className={s.signalLabel}><span className={s.signalDot} aria-hidden="true" />{t("Signal de l’équipe")}</div>}
    <h2>{post.title}</h2>{post.symbol && <div className={s.symbol}>{post.symbol}{post.direction && <span className={post.direction === "buy" ? s.buy : s.sell}>{post.direction === "buy" ? t("Achat") : t("Vente")}</span>}</div>}
    {post.body && <p className={s.postBody}>{post.body}</p>}
    {availableLevels.length > 0 && <dl className={s.levels}>{availableLevels.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value?.toLocaleString("fr-FR", { maximumFractionDigits: 8 })}</dd></div>)}</dl>}
    {image && <a className={s.imageLink} href={image} target="_blank" rel="noopener noreferrer">
      <Image src={image} alt={`${t("Illustration de la publication :")} ${post.title}`} width={1200} height={800} unoptimized loading="lazy" referrerPolicy="no-referrer" />
    </a>}
    {post.category === "signal" && <>
      <p className={s.riskReminder}>{t("⚠️ Respectez votre gestion du risque.")}</p>
      <Link className={s.riskLink} href="/dashboard/simulateur"><Calculator size={18} aria-hidden="true" /><span><strong>{t("Calculer mon lot")}</strong><small>{t("Préparer mon risque avant la prise de position.")}</small></span><ArrowUpRight size={15} aria-hidden="true" /></Link>
    </>}
  </article>;
}

export default function VipPortal() {
  const { t, locale } = useLocale();
  const [access, setAccess] = useState<VipAccess | null>(null);
  const [posts, setPosts] = useState<VipPost[]>([]);
  const [view, setView] = useState<View>("analysis");
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
      const registration = await navigator.serviceWorker.getRegistration("/") || await navigator.serviceWorker.register("/sw.js");
      const ready = registration.active ? registration : await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("L’application prépare les alertes. Réessayez dans un instant.")), 10000))]);
      const padding = "=".repeat((4 - publicKey.length % 4) % 4);
      const raw = atob((publicKey + padding).replace(/-/g, "+").replace(/_/g, "/"));
      const key = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      const subscription = await ready.pushManager.getSubscription() || await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await vipRequest("/api/vip/push", { method: "POST", body: JSON.stringify({ subscription: subscription.toJSON() }) });
      setAlertsOn(true); setMessage("Les alertes VIP sont activées sur cet appareil.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Impossible d’activer les alertes."); }
    finally { setBusy(false); }
  }
  const membership = access?.membership;
  const telegramUrl = access?.active ? safeHttps(access.telegramUrl) : null;
  const isFeed = view === "analysis" || view === "signal" || view === "followup" || view === "partnership";
  const visiblePosts = isFeed ? posts.filter((post) => post.category === view) : [];
  const membershipCard = membership && <div className={s.membership}>
    <div><b>{membership.type === "abonnement" ? t("Abonnement") : t("Affiliation")} · {membership.email}</b>
      <p>{t("Activation :")}{" "}{vipDate(membership.started_at, locale)} · {membership.expires_at ? `${t("Fin d’accès :")} ${vipDate(membership.expires_at, locale)}` : t("Sans échéance automatique")}</p>
      {membership.renewal_requested_at && <small>{t("Renouvellement demandé · en attente de vérification par l’équipe.")}</small>}
    </div>
    {membership.type === "abonnement" && <button type="button" className={s.secondary} onClick={renewal} disabled={busy || Boolean(membership.renewal_requested_at)}>{membership.renewal_requested_at ? t("Demande transmise") : t("Demander mon renouvellement")}</button>}
  </div>;

  return <div className={s.portal}>
    <header className={s.portalHeader}>
      <div className={s.portalBrand}><span className={s.brandIcon}><Crown size={19} aria-hidden="true" /></span><div><b>{t("InvestPro")}{" "}<span>{t("VIP")}</span></b><small>{t("Le cercle privé")}</small></div></div>
      {access?.admin ? <Link className={s.adminLink} href="/dashboard/admin/vip">{t("Gérer le VIP")}{" "}<ArrowUpRight size={15} aria-hidden="true" /></Link> : <span className={s.privateLabel}><LockKeyhole size={13} aria-hidden="true" /> {t("Privé")}</span>}
    </header>
    <div className={s.workspace}>
      <nav className={s.navigation} aria-label={t("Rubriques de l’espace VIP")}>
        <span className={s.railLabel}>{t("CERCLE PRIVÉ")}</span>
        <div className={s.privateNav}>{views.map(({ key, label, Icon }) => <button className={s.railButton} type="button" key={key} onClick={() => setView(key)} aria-pressed={view === key} aria-label={key === "training" ? t("Formation & coaching · Bientôt") : t(label)}>
          <Icon size={19} aria-hidden="true" /><span className={s.railText}>{t(label)}{key === "training" && <small>{t("Formation & coaching")}</small>}</span>
        </button>)}</div>
      </nav>
      <div className={s.content}>
        <header className={s.heading}>
          <div><span className={s.eyebrow}>{t("INVESTPRO TRADING VIP ™")}</span><h1>{t(headings[view][0])}</h1><p>{t(headings[view][1])}</p></div>
          <button className={s.refresh} type="button" onClick={() => void refresh()} aria-label={t("Actualiser mon accès et les publications")} disabled={loading}><RefreshCw size={17} /></button>
        </header>
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
              </div>
            </details>
            {isFeed && <div className={s.posts} aria-label={`${t("Publications")} · ${t(headings[view][0])}`}>
              {visiblePosts.length ? visiblePosts.map((post) => <PostCard post={post} key={post.id} />) : <div className={s.empty}><MessageCircle size={25} aria-hidden="true" /><h2>{view === "analysis" ? t("Vos prochaines analyses apparaîtront ici.") : view === "signal" ? t("Vos prochains signaux apparaîtront ici.") : view === "followup" ? t("Les prochaines mises à jour apparaîtront ici.") : t("Les prochains partenariats apparaîtront ici.")}</h2><p>{t("Les publications de l’équipe seront disponibles dans cette rubrique.")}</p></div>}
            </div>}
            {view === "performance" && <section className={s.feature}><Activity size={31} /><h2>{t("Le bilan du groupe, en toute clarté.")}</h2><p>{t("Retrouvez les trades clôturés, les résultats en R, les gains, les pertes et l’historique dans la page Performances VIP.")}</p><Link className={s.primary} href="/dashboard/performances-vip">{t("Voir les performances VIP")}{" "}<ArrowUpRight size={16} /></Link><small>{t("Ce bilan collectif reste distinct de vos résultats personnels.")}</small></section>}
            {view === "risk" && <section className={s.feature}><Calculator size={31} /><h2>{t("Préparez votre risque.")}</h2><p>{t("Choisissez votre actif, votre entrée, votre stop loss et votre risque dans le simulateur pour préparer votre volume.")}</p><Link className={s.primary} href="/dashboard/simulateur">{t("Ouvrir le simulateur")}{" "}<ArrowUpRight size={16} /></Link></section>}
            {view === "training" && <section className={s.feature}><GraduationCap size={33} /><span className={s.soon}>{t("Bientôt")}</span><h2>{t("Formation & coaching.")}</h2><p>{t("Les formations et l’accompagnement se préparent. Le programme, les modalités d’accès et la date d’ouverture seront annoncés ici.")}</p><div className={s.topics}><span>{t("Formation")}</span><span>{t("Coaching")}</span><span>{t("Progression")}</span></div></section>}
            {view === "telegram" && <section className={s.feature}><Send size={31} /><h2>{t("Retrouvez votre communauté.")}</h2><p>{t("Votre espace InvestPro est actif. Demandez à rejoindre InvestPro Trading VIP ™ ; l’équipe vérifie et valide votre entrée manuellement.")}</p>{telegramUrl ? <a className={s.primary} href={telegramUrl} target="_blank" rel="noopener noreferrer">{t("Rejoindre Telegram")}{" "}<ArrowUpRight size={16} /></a> : <p className={s.notice}>{t("Le lien du canal sera disponible ici dès sa configuration par l’équipe.")}</p>}<small>{t("L’adhésion au canal et son renouvellement restent gérés par l’équipe sur Telegram.")}</small></section>}
          </>}
        </>}
      </div>
    </div>
    <nav className={s.personalNav} aria-label={t("Mes outils InvestPro")}>
      <Link href="/dashboard/journal"><BookOpen size={17} aria-hidden="true" />{t("Journal")}</Link>
      <Link href="/dashboard/rapports"><ChartNoAxesCombined size={17} aria-hidden="true" />{t("Rapports")}</Link>
      <Link href="/dashboard/vip" aria-current="page"><Crown size={17} aria-hidden="true" />{t("VIP")}</Link>
      <Link href="/dashboard/profil"><UserRound size={17} aria-hidden="true" />{t("Profil")}</Link>
    </nav>
  </div>;
}
