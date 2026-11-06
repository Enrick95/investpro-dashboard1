"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, Sparkles, ArrowRight, Bell, Bot, CalendarClock, ChevronRight, Flame, Send, UserPlus, CircleHelp, Copy, CreditCard, Crown, FileText, Handshake, LayoutDashboard, Mail, MessageCircle, Megaphone, Menu, Server, Settings2, ShieldCheck, TrendingUp, Users, Wallet, X, type LucideIcon } from "lucide-react";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { useLocale } from "@/components/i18n/LocaleProvider";
import AdminToolWorkspace, { preloadAdminTool, preloadAllAdminTools } from "@/app/admin-preview/AdminToolWorkspace";
import { adminToolPreviewHref, parseAdminToolQuery, parseCurrentAdminPath, type AdminToolId, type AdminToolTarget, type VipAdminView } from "@/app/admin-preview/admin-tool-access";
import s from "./AdminWorkspace.module.css";
import { useAdminInboxCount } from "./useAdminInboxCount";

type Translate = (fr: string, en: string) => string;
type Entry = { tool: AdminToolId; view?: VipAdminView; fr: string; en: string; Icon: LucideIcon };
type Tone = "gold" | "teal" | "tg" | "rose" | "grey";
const GROUPS: { fr: string; en: string; tone: Tone; items: Entry[] }[] = [
  { fr: "Pilotage", en: "Overview & insights", tone: "gold", items: [
    { tool: "overview-current", fr: "Vue d’ensemble", en: "Overview", Icon: LayoutDashboard },
    { tool: "finance", fr: "Finance", en: "Finance", Icon: Wallet },
    { tool: "analytics", fr: "Statistiques", en: "Statistics", Icon: TrendingUp },
    { tool: "feedback", fr: "Retours", en: "Feedback", Icon: CircleHelp },
  ] },
  { fr: "Membres & accès", en: "Members & access", tone: "teal", items: [
    { tool: "vip", view: "members", fr: "Membres VIP", en: "VIP members", Icon: Users },
    { tool: "utilisateurs", fr: "Utilisateurs", en: "Users", Icon: Users },
    { tool: "vip", view: "requests", fr: "Demandes VIP", en: "VIP requests", Icon: ShieldCheck },
    { tool: "essai-vip", fr: "Essais VIP · Prospects", en: "VIP trials · Leads", Icon: MessageCircle },
    { tool: "vip", view: "subscriptions", fr: "Abonnements", en: "Subscriptions", Icon: CreditCard },
    { tool: "vip", view: "affiliation", fr: "Affiliation & Copy", en: "Affiliation & Copy", Icon: Handshake },
    { tool: "copieur", fr: "InvestPro Copier", en: "InvestPro Copier", Icon: Copy },
  ] },
  { fr: "Mon canal Telegram", en: "My Telegram channel", tone: "tg", items: [
    { tool: "telegram", view: "overview", fr: "Vue d’ensemble Telegram", en: "Telegram overview", Icon: Send },
    { tool: "telegram", view: "new", fr: "Nouveaux membres", en: "New members", Icon: UserPlus },
    { tool: "telegram", view: "members", fr: "Membres du canal", en: "Channel members", Icon: Users },
    { tool: "telegram", view: "subscriptions", fr: "Abonnements & échéances", en: "Subscriptions & renewals", Icon: CalendarClock },
    { tool: "telegram", view: "relances", fr: "Relances & prospects", en: "Follow-ups & leads", Icon: Flame },
    { tool: "telegram", view: "agent", fr: "Agent Telegram", en: "Telegram agent", Icon: Sparkles },
    { tool: "telegram", view: "activity", fr: "Activité du canal", en: "Channel activity", Icon: Activity },
    { tool: "telegram", view: "bot", fr: "Réglages du bot", en: "Bot settings", Icon: Bot },
  ] },
  { fr: "Contenu & échanges", en: "Content & communication", tone: "rose", items: [
    { tool: "vip-publications", fr: "Publications VIP", en: "VIP posts", Icon: FileText },
    { tool: "moderation", fr: "Modération", en: "Moderation", Icon: ShieldCheck },
    { tool: "inbox", fr: "Inbox", en: "Inbox", Icon: Mail },
    { tool: "annonces", fr: "Annonces", en: "Announcements", Icon: Megaphone },
  ] },
  { fr: "Plateforme & réglages", en: "Platform & settings", tone: "grey", items: [
    { tool: "vip", view: "settings", fr: "Réglages VIP", en: "VIP settings", Icon: Settings2 },
    { tool: "systeme", fr: "Système", en: "System", Icon: Settings2 },
    { tool: "navigation", fr: "Navigation", en: "Navigation", Icon: Menu },
    { tool: "staff", fr: "Équipe", en: "Team", Icon: Users },
    { tool: "serveurs", fr: "Serveurs", en: "Servers", Icon: Server },
    { tool: "backoffice", fr: "Backoffice", en: "Backoffice", Icon: LayoutDashboard },
  ] },
];

const MOBILE_SHORTCUTS: (Entry & { shortFr: string; shortEn: string })[] = [
  { tool: "overview-current", fr: "Vue d’ensemble", en: "Overview", shortFr: "Accueil", shortEn: "Home", Icon: LayoutDashboard },
  { tool: "inbox", fr: "Inbox", en: "Inbox", shortFr: "Inbox", shortEn: "Inbox", Icon: Mail },
  { tool: "vip", view: "members", fr: "Membres VIP", en: "VIP members", shortFr: "Membres", shortEn: "Members", Icon: Users },
  { tool: "vip", view: "requests", fr: "Demandes VIP", en: "VIP requests", shortFr: "Demandes", shortEn: "Requests", Icon: ShieldCheck },
  { tool: "vip-publications", fr: "Publications VIP", en: "VIP posts", shortFr: "Posts VIP", shortEn: "VIP posts", Icon: FileText },
  { tool: "finance", fr: "Finance", en: "Finance", shortFr: "Finance", shortEn: "Finance", Icon: Wallet },
  { tool: "analytics", fr: "Statistiques", en: "Statistics", shortFr: "Stats", shortEn: "Stats", Icon: TrendingUp },
  { tool: "staff", fr: "Équipe", en: "Team", shortFr: "Équipe", shortEn: "Team", Icon: Users },
];

const DEFAULT_VIEW: Partial<Record<AdminToolId, VipAdminView>> = { vip: "members", telegram: "overview" };
function isCurrent(target: AdminToolTarget, item: Entry) {
  const fallback = DEFAULT_VIEW[item.tool];
  return target.tool === item.tool && (!fallback || (target.vipView || fallback) === item.view);
}

function pendingInboxLabel(count: number, tr: Translate) {
  return tr(`${count} demande${count === 1 ? "" : "s"} à traiter`, `${count} pending request${count === 1 ? "" : "s"}`);
}

function InboxBadge({ count, tr }: { count: number | null; tr: Translate }) {
  if (count === null || count === 0) return null;
  return <b className={s.inboxBadge} aria-label={pendingInboxLabel(count, tr)}>{count > 99 ? "99+" : count}</b>;
}

function MobileRail({ target, navigate, tr, drawerOpen, openDrawer, inboxCount }: { target: AdminToolTarget; navigate: (target: AdminToolTarget) => void; tr: Translate; drawerOpen: boolean; openDrawer: () => void; inboxCount: number | null }) {
  return <nav className={s.mobileRail} aria-label={tr("Raccourcis administration", "Administration shortcuts")}>
    {MOBILE_SHORTCUTS.map(item => <Link key={item.tool + ":" + (item.view || "default")} href={adminToolPreviewHref(item.tool, undefined, "/dashboard/admin", item.view)} prefetch={false} aria-label={item.tool === "inbox" && inboxCount ? `Inbox, ${pendingInboxLabel(inboxCount, tr)}` : tr(item.fr, item.en)} aria-current={isCurrent(target, item) ? "page" : undefined} onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); navigate({ tool: item.tool, ...(item.view ? { vipView: item.view } : {}) });
    }}><item.Icon size={21} aria-hidden="true" /><span>{tr(item.shortFr, item.shortEn)}</span>{item.tool === "inbox" && <InboxBadge count={inboxCount} tr={tr} />}</Link>)}
    <button type="button" onClick={openDrawer} aria-label={tr("Ouvrir toutes les rubriques", "Open all sections")} aria-controls="admin-navigation-drawer" aria-expanded={drawerOpen} data-active={!MOBILE_SHORTCUTS.some(item => isCurrent(target, item)) || undefined}><Menu size={22} aria-hidden="true" /><span>{tr("Tout", "All")}</span></button>
  </nav>;
}

function Navigation({ target, navigate, tr, inboxCount }: { target: AdminToolTarget; navigate: (target: AdminToolTarget) => void; tr: Translate; inboxCount: number | null }) {
  function activate(event: MouseEvent<HTMLAnchorElement>, next: AdminToolTarget) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(next);
  }
  return <nav className={s.navigation} aria-label={tr("Rubriques administration", "Administration sections")}>
    {GROUPS.map(group => <div className={s.navGroup} data-tone={group.tone} key={group.fr} role="group" aria-label={tr(group.fr, group.en)}><h2><i aria-hidden="true" />{tr(group.fr, group.en)}</h2><div className={s.navItems}>
      {group.items.map(({ tool, view, fr, en, Icon }) => {
        const active = isCurrent(target, { tool, view, fr, en, Icon });
        const next = { tool, ...(view ? { vipView: view } : {}) };
        return <Link href={adminToolPreviewHref(tool, undefined, "/dashboard/admin", view)} prefetch={false} key={tool + ":" + (view || "default")} onClick={event => activate(event, next)} onMouseEnter={() => preloadAdminTool(tool)} onFocus={() => preloadAdminTool(tool)} aria-current={active ? "page" : undefined}><span className={s.navTile}><Icon size={16} aria-hidden="true" /></span><span>{tr(fr, en)}</span>{tool === "inbox" && <InboxBadge count={inboxCount} tr={tr} />}<ChevronRight size={13} className={s.openToolIcon} aria-hidden="true" /></Link>;
      })}
    </div></div>)}
  </nav>;
}

export default function AdminWorkspace() {
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inboxCount = useAdminInboxCount();
  const target = parseAdminToolQuery(new URLSearchParams(searchParams.toString())) || { tool: "overview-current" as const };
  const tr: Translate = (fr, en) => locale === "en" ? en : fr;
  const current = GROUPS.flatMap(group => group.items).find(item => isCurrent(target, item)) || GROUPS[0].items[0];
  const currentGroup = GROUPS.find(group => group.items.includes(current)) || GROUPS[0];
  const navDialog = useRef<HTMLDialogElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const key = target.tool + ":" + (target.memberId || "list") + ":" + (target.vipView || "default");
  const previousKey = useRef(key);
  function openDrawer() {
    if (!navDialog.current || navDialog.current.open) return;
    navDialog.current.showModal();
    setDrawerOpen(true);
    navDialog.current.scrollTop = 0;
  }
  useEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    heading.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [key]);
  function navigate(next: AdminToolTarget) {
    // Changement de rubrique côté navigateur, sans aller-retour serveur : l’adresse est mise à jour
    // et Next.js synchronise useSearchParams. Le serveur ne sert ici que les données de la rubrique.
    const href = adminToolPreviewHref(next.tool, next.memberId, "/dashboard/admin", next.vipView);
    if (typeof window !== "undefined" && window.history?.pushState) window.history.pushState(null, "", href);
    else router.push(href, { scroll: false });
    navDialog.current?.close();
  }
  useEffect(() => {
    // Une fois l’admin affiché, on précharge le code de toutes les rubriques pendant que le navigateur est libre.
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const timer = window.setTimeout(() => { if (idle) idle(preloadAllAdminTools); else preloadAllAdminTools(); }, 1500);
    return () => window.clearTimeout(timer);
  }, []);
  function navigatePath(path: string) {
    const next = parseCurrentAdminPath(path);
    if (next) navigate(next);
  }
  return <main className={s.page}>
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <Link href="/dashboard" prefetch={false} className={s.brand}><span><Crown size={24} aria-hidden="true" /></span><div>InvestPro <b>Admin</b><small>{tr("VOTRE ESPACE DE GESTION", "YOUR MANAGEMENT SPACE")}</small></div></Link>
        <Navigation target={target} navigate={navigate} tr={tr} inboxCount={inboxCount} />
        <div className={s.sidebarFooter}><span><ShieldCheck size={15} aria-hidden="true" />{tr("Administration InvestPro", "InvestPro administration")}</span><p>{tr("Vos membres, vos contenus et vos outils au même endroit.", "Your members, content and tools in one place.")}</p><Link href="/dashboard" prefetch={false}>{tr("Retour à InvestPro", "Back to InvestPro")}<ArrowRight size={14} aria-hidden="true" /></Link></div>
      </aside>
      <MobileRail target={target} navigate={navigate} tr={tr} drawerOpen={drawerOpen} openDrawer={openDrawer} inboxCount={inboxCount} />
      <div className={s.workspace}>
        <header className={s.topbar}><div className={s.topbarLeft}><button type="button" className={s.menuToggle} aria-label={tr("Ouvrir le menu administration", "Open administration menu")} aria-controls="admin-navigation-drawer" aria-expanded={drawerOpen} onClick={openDrawer}><Menu size={20} aria-hidden="true" /><span>{tr("Rubriques", "Sections")}</span></button><span className={s.mobileBrand}><span>InvestPro</span><b>Admin</b></span><span className={s.breadcrumb}>{tr("Administration", "Administration")}<ChevronRight size={12} aria-hidden="true" /><b>{tr(current.fr, current.en)}</b></span></div><div className={s.headerActions}>{inboxCount !== null && inboxCount > 0 && <button type="button" className={`${s.iconButton} ${s.inboxShortcut}`} title={`Inbox · ${pendingInboxLabel(inboxCount, tr)}`} aria-label={`${tr("Ouvrir Inbox", "Open Inbox")}, ${pendingInboxLabel(inboxCount, tr)}`} onClick={() => navigate({ tool: "inbox" })}><Mail size={20} aria-hidden="true" /><InboxBadge count={inboxCount} tr={tr} /></button>}<button type="button" className={s.iconButton} aria-label={tr("Voir les demandes VIP à vérifier", "View VIP applications to review")} onClick={() => navigate({ tool: "vip", vipView: "requests" })}><Bell size={20} aria-hidden="true" /></button><LanguageSwitcher /></div></header>
        <div className={s.content}><div className={s.sectionHeader} data-tone={currentGroup.tone}><span className={s.headerTile} aria-hidden="true"><current.Icon size={24} /></span><span className={s.eyebrow}>{tr(currentGroup.fr, currentGroup.en)}</span><h1 ref={heading} tabIndex={-1}>{tr(current.fr, current.en)}{target.memberId && (" · " + tr("Dossier membre", "Member details"))}</h1><p>{tr("Vos outils et vos données, dans le même espace de travail.", "Your tools and data, in the same workspace.")}</p></div><AdminToolWorkspace key={key} tool={target.tool} memberId={target.memberId} vipView={target.vipView} basePath="/dashboard/admin" onNavigate={navigatePath} /></div>
      </div>
    </div>
    <dialog id="admin-navigation-drawer" ref={navDialog} className={s.navDrawer} aria-label={tr("Menu administration", "Administration menu")} onClose={() => setDrawerOpen(false)} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) navDialog.current?.close();
    }}><div className={s.drawerHeader}><div><span className={s.drawerKicker}>INVESTPRO ADMIN</span><h2>{tr("Toutes les rubriques", "All sections")}</h2></div><button type="button" className={s.iconButton} onClick={() => navDialog.current?.close()} aria-label={tr("Fermer le menu", "Close menu")}><X size={20} aria-hidden="true" /></button></div><Navigation target={target} navigate={navigate} tr={tr} inboxCount={inboxCount} /><Link className={s.drawerFooter} href="/dashboard/contact" prefetch={false}>{tr("Aide & support", "Help & support")}<CircleHelp size={16} aria-hidden="true" /></Link><Link className={s.drawerFooter} href="/dashboard" prefetch={false}>{tr("Retour à InvestPro", "Back to InvestPro")}<ArrowRight size={15} aria-hidden="true" /></Link></dialog>
  </main>;
}
