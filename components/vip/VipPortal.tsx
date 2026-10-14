"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Activity, ArrowRight, ArrowUpRight, Bell, BookOpen, ChartNoAxesCombined, Crown, GraduationCap, Handshake, LockKeyhole, MessageCircle, RefreshCw, Send, ShieldCheck, Smartphone } from "lucide-react";
import { safeHttps, VipApiError, vipDate, vipRequest, type VipAccess, type VipPost } from "@/lib/vip/client";
import s from "./VipPortal.module.css";

const views = [
  { key: "canal", label: "Canal VIP", Icon: Crown }, { key: "analysis", label: "Analyses", Icon: ChartNoAxesCombined },
  { key: "partnership", label: "Partenariats", Icon: Handshake }, { key: "performance", label: "Performances VIP", Icon: Activity },
  { key: "training", label: "Formation & coaching", Icon: GraduationCap }, { key: "telegram", label: "Telegram", Icon: Send },
] as const;
type View = typeof views[number]["key"];
const headings: Record<View, [string, string]> = {
  canal: ["Votre canal privé.", "Le contexte avant le trade. Le suivi après."], analysis: ["Vos analyses privées.", "Les scénarios et leur contexte, au même endroit."],
  partnership: ["Vos partenariats.", "Les présentations, les conditions et les nouveautés du cercle."], performance: ["Performances VIP.", "Le bilan du groupe, au même endroit."],
  training: ["Formation & coaching.", "Le prochain chapitre de votre progression."], telegram: ["Votre communauté Telegram.", "Retrouvez InvestPro Trading VIP ™ et l’équipe."],
};
const categoryLabels: Record<string, string> = { signal: "Signal", analysis: "Analyse", followup: "Suivi", partnership: "Partenariat" };

function PostCard({ post }: { post: VipPost }) {
  const image = safeHttps(post.image_url);
  const levels = [["Entrée", post.levels?.entry], ["Stop loss", post.levels?.stopLoss], ["Objectif 1", post.levels?.takeProfit], ["Objectif 2", post.levels?.takeProfit2]] as const;
  const availableLevels = levels.filter(([, value]) => typeof value === "number" && Number.isFinite(value));
  return <article className={s.post} id={`publication-${post.id}`}>
    <div className={s.postMeta}><span className={s.avatar}>IP</span><div><b>InvestPro</b><small>{vipDate(post.created_at)}</small></div><span className={s.postTag}>{categoryLabels[post.category] || "Publication"}</span></div>
    <h2>{post.title}</h2>{post.symbol && <div className={s.symbol}>{post.symbol}{post.direction && <span className={post.direction === "buy" ? s.buy : s.sell}>{post.direction === "buy" ? "Achat" : "Vente"}</span>}</div>}
    {post.body && <p className={s.postBody}>{post.body}</p>}
    {availableLevels.length > 0 && <dl className={s.levels}>{availableLevels.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value?.toLocaleString("fr-FR", { maximumFractionDigits: 8 })}</dd></div>)}</dl>}
    {image && <a className={s.imageLink} href={image} target="_blank" rel="noopener noreferrer">
      <Image src={image} alt={`Illustration de la publication : ${post.title}`} width={1200} height={800} unoptimized loading="lazy" referrerPolicy="no-referrer" />
    </a>}
  </article>;
}

export default function VipPortal() {
  const [access, setAccess] = useState<VipAccess | null>(null);
  const [posts, setPosts] = useState<VipPost[]>([]);
  const [view, setView] = useState<View>("canal");
  const [filter, setFilter] = useState("all");
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
  const visiblePosts = posts.filter((post) => view === "analysis" ? post.category === "analysis" : view === "partnership" ? post.category === "partnership" : post.category !== "partnership" && (filter === "all" || post.category === filter));
  return <div className={s.portal}>
    <nav className={s.navigation} aria-label="Votre espace InvestPro"><div className={s.personalNav}><span>MON ESPACE</span><Link href="/dashboard/journal"><BookOpen size={16} /> Mon journal</Link><Link href="/dashboard/rapports"><ChartNoAxesCombined size={16} /> Mes rapports</Link>{access?.admin && <Link href="/dashboard/admin/vip">Gérer le VIP <ArrowUpRight size={15} /></Link>}</div>
      <label className={s.mobileNav}>CERCLE PRIVÉ<select value={view} onChange={(event) => setView(event.target.value as View)}>{views.map((item) => <option key={item.key} value={item.key}>{item.key === "training" ? "Formation · Bientôt" : item.label}</option>)}</select></label>
      <div className={s.privateNav}><span>CERCLE PRIVÉ</span>{views.map(({ key, label, Icon }) => <button type="button" key={key} onClick={() => setView(key)} aria-pressed={view === key}><Icon size={16} />{label}{key === "training" && <small>Bientôt</small>}</button>)}</div>
    </nav>
    <div className={s.content}>
      <header className={s.heading}><div><span className={s.eyebrow}>INVESTPRO TRADING VIP ™</span><h1>{headings[view][0]}</h1><p>{headings[view][1]}</p></div><button className={s.refresh} type="button" onClick={() => void refresh()} aria-label="Actualiser mon accès et les publications" disabled={loading}><RefreshCw size={17} /></button></header>
      {loading ? <div className={s.empty} role="status">Chargement de votre espace privé…</div> : <>
        {error && <div className={s.notice} role="alert">{error}{!access && <Link href="/login?next=%2Fdashboard%2Fvip">Me connecter <ArrowRight size={15} /></Link>}</div>}
        {membership && <div className={s.membership}><div><b>{membership.type === "abonnement" ? "Abonnement" : "Affiliation"} · {membership.email}</b><p>Activation : {vipDate(membership.started_at)} · {membership.expires_at ? `Fin d’accès : ${vipDate(membership.expires_at)}` : "Sans échéance automatique"}</p>{membership.renewal_requested_at && <small>Renouvellement demandé · en attente de vérification par l’équipe.</small>}</div>{membership.type === "abonnement" && <button type="button" className={s.secondary} onClick={renewal} disabled={busy || Boolean(membership.renewal_requested_at)}>{membership.renewal_requested_at ? "Demande transmise" : "Demander mon renouvellement"}</button>}</div>}
        {message && <p className={s.notice} role="status">{message}</p>}
        {!access?.active ? <section className={s.locked}><LockKeyhole size={30} /><h2>{membership?.status === "suspended" ? "Votre accès VIP est suspendu." : membership ? "Votre abonnement est arrivé à échéance." : "Votre invitation vous ouvre le cercle."}</h2><p>{membership ? "Contactez l’équipe pour réactiver votre accès privé. Votre journal et vos rapports restent disponibles." : "Activez l’invitation personnelle remise par l’équipe après validation de votre adhésion."}</p><Link className={s.primary} href="/vip">Retrouver mon invitation <ArrowRight size={16} /></Link></section> : <>
          {view === "canal" && <section className={s.mobileStart}><div><Smartphone size={21} /><div><b>Votre VIP, aussi sur téléphone.</b><p>iPhone, Android et Samsung : votre espace vous accompagne.</p></div></div><button className={s.secondary} type="button" onClick={enableAlerts} disabled={busy || alertsOn || !publicKey}>{alertsOn ? <ShieldCheck size={16} /> : <Bell size={16} />}{alertsOn ? "Alertes activées" : "Activer les alertes"}</button><details><summary>Installer InvestPro et recevoir les alertes</summary><p><b>iPhone · Safari :</b> Partager → Sur l’écran d’accueil → Ouvrir comme app web si proposé → Ajouter. iOS 16.4 minimum pour les alertes.</p><p><b>Android et Samsung · Chrome :</b> menu ⋮ → Installer et créer un raccourci, ou Installer l’application → Installer. Sur Samsung Internet, utilisez l’icône d’installation si elle apparaît.</p><p>Ouvrez l’icône InvestPro et autorisez les notifications. Une connexion Internet est nécessaire.{!publicKey && " Les alertes seront proposées dès leur activation par l’équipe."}</p></details></section>}
          {(view === "canal" || view === "analysis" || view === "partnership") && <>{view === "canal" && <div className={s.filters} aria-label="Filtrer les publications">{[["all", "Tout"], ["signal", "Signaux"], ["analysis", "Analyses"], ["followup", "Suivi"]].map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>}<div className={s.posts}>{visiblePosts.length ? visiblePosts.map((post) => <PostCard post={post} key={post.id} />) : <div className={s.empty}><MessageCircle size={25} /><h2>{view === "analysis" ? "Vos prochaines analyses apparaîtront ici." : view === "partnership" ? "Les prochains partenariats apparaîtront ici." : "Bienvenue dans votre canal privé."}</h2><p>Les publications de l’équipe seront disponibles dans cet espace.</p></div>}</div></>}
          {view === "performance" && <section className={s.feature}><Activity size={31} /><h2>Le bilan du groupe, en toute clarté.</h2><p>Retrouvez les trades clôturés, les résultats en R, les gains, les pertes et l’historique dans la page Performances VIP.</p><Link className={s.primary} href="/dashboard/performances-vip">Voir les performances VIP <ArrowUpRight size={16} /></Link><small>Ce bilan collectif reste distinct de vos résultats personnels.</small></section>}
          {view === "training" && <section className={s.feature}><GraduationCap size={33} /><span className={s.soon}>Bientôt</span><h2>Votre progression prend une nouvelle dimension.</h2><p>Les formations et l’accompagnement se préparent. Le programme, les modalités d’accès et la date d’ouverture seront annoncés ici.</p><div className={s.topics}><span>Formation</span><span>Coaching</span><span>Progression</span></div></section>}
          {view === "telegram" && <section className={s.feature}><Send size={31} /><h2>Retrouvez votre communauté.</h2><p>Votre espace InvestPro est actif. Demandez à rejoindre InvestPro Trading VIP ™ ; l’équipe vérifie et valide votre entrée manuellement.</p>{telegramUrl ? <a className={s.primary} href={telegramUrl} target="_blank" rel="noopener noreferrer">Rejoindre Telegram <ArrowUpRight size={16} /></a> : <p className={s.notice}>Le lien du canal sera disponible ici dès sa configuration par l’équipe.</p>}<small>L’adhésion au canal et son renouvellement restent gérés par l’équipe sur Telegram.</small></section>}
        </>}
      </>}
    </div>
  </div>;
}
