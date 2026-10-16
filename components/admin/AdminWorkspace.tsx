"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Bell, ChevronRight, CircleHelp, Copy, CreditCard, Crown, FileText, Handshake, LayoutDashboard, Mail, Megaphone, Menu, Server, Settings2, ShieldCheck, TrendingUp, Users, Wallet, X, type LucideIcon } from "lucide-react";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { useLocale } from "@/components/i18n/LocaleProvider";
import AdminToolWorkspace from "@/app/admin-preview/AdminToolWorkspace";
import { adminToolPreviewHref, parseAdminToolQuery, parseCurrentAdminPath, type AdminToolId, type AdminToolTarget, type VipAdminView } from "@/app/admin-preview/admin-tool-access";
import s from "./AdminWorkspace.module.css";

type Translate = (fr: string, en: string) => string;
type Entry = { tool: AdminToolId; view?: VipAdminView; fr: string; en: string; Icon: LucideIcon };
const GROUPS: { fr: string; en: string; items: Entry[] }[] = [
  { fr: "Pilotage", en: "Overview & insights", items: [
    { tool: "overview-current", fr: "Vue d’ensemble", en: "Overview", Icon: LayoutDashboard },
    { tool: "finance", fr: "Finance", en: "Finance", Icon: Wallet },
    { tool: "analytics", fr: "Statistiques", en: "Statistics", Icon: TrendingUp },
    { tool: "feedback", fr: "Retours", en: "Feedback", Icon: CircleHelp },
  ] },
  { fr: "Membres & accès", en: "Members & access", items: [
    { tool: "vip", view: "members", fr: "Membres VIP", en: "VIP members", Icon: Users },
    { tool: "utilisateurs", fr: "Utilisateurs", en: "Users", Icon: Users },
    { tool: "vip", view: "requests", fr: "Demandes VIP", en: "VIP requests", Icon: ShieldCheck },
    { tool: "vip", view: "subscriptions", fr: "Abonnements", en: "Subscriptions", Icon: CreditCard },
    { tool: "vip", view: "affiliation", fr: "Affiliation & Copy", en: "Affiliation & Copy", Icon: Handshake },
    { tool: "copieur", fr: "InvestPro Copier", en: "InvestPro Copier", Icon: Copy },
  ] },
  { fr: "Contenu & échanges", en: "Content & communication", items: [
    { tool: "vip-publications", fr: "Publications VIP", en: "VIP posts", Icon: FileText },
    { tool: "moderation", fr: "Modération", en: "Moderation", Icon: ShieldCheck },
    { tool: "inbox", fr: "Inbox", en: "Inbox", Icon: Mail },
    { tool: "annonces", fr: "Annonces", en: "Announcements", Icon: Megaphone },
  ] },
  { fr: "Plateforme & réglages", en: "Platform & settings", items: [
    { tool: "vip", view: "settings", fr: "Réglages VIP", en: "VIP settings", Icon: Settings2 },
    { tool: "systeme", fr: "Système", en: "System", Icon: Settings2 },
    { tool: "navigation", fr: "Navigation", en: "Navigation", Icon: Menu },
    { tool: "staff", fr: "Équipe", en: "Team", Icon: Users },
    { tool: "serveurs", fr: "Serveurs", en: "Servers", Icon: Server },
    { tool: "backoffice", fr: "Backoffice", en: "Backoffice", Icon: LayoutDashboard },
  ] },
];

function Navigation({ target, navigate, tr }: { target: AdminToolTarget; navigate: (target: AdminToolTarget) => void; tr: Translate }) {
  function activate(event: MouseEvent<HTMLAnchorElement>, next: AdminToolTarget) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(next);
  }
  return <nav className={s.navigation} aria-label={tr("Rubriques administration", "Administration sections")}>
    {GROUPS.map(group => <div className={s.navGroup} key={group.fr} role="group" aria-label={tr(group.fr, group.en)}><h2>{tr(group.fr, group.en)}</h2><div className={s.navItems}>
      {group.items.map(({ tool, view, fr, en, Icon }) => {
        const active = target.tool === tool && (tool !== "vip" || (target.vipView || "members") === view);
        const next = { tool, ...(view ? { vipView: view } : {}) };
        return <Link href={adminToolPreviewHref(tool, undefined, "/dashboard/admin", view)} prefetch={false} key={tool + ":" + (view || "default")} onClick={event => activate(event, next)} aria-current={active ? "page" : undefined}><Icon size={18} aria-hidden="true" /><span>{tr(fr, en)}</span><ChevronRight size={13} className={s.openToolIcon} aria-hidden="true" /></Link>;
      })}
    </div></div>)}
  </nav>;
}

export default function AdminWorkspace() {
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = parseAdminToolQuery(new URLSearchParams(searchParams.toString())) || { tool: "overview-current" as const };
  const tr: Translate = (fr, en) => locale === "en" ? en : fr;
  const current = GROUPS.flatMap(group => group.items).find(item => item.tool === target.tool && (item.tool !== "vip" || item.view === (target.vipView || "members")))!;
  const navDialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const key = target.tool + ":" + (target.memberId || "list") + ":" + (target.vipView || "default");
  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    heading.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [key]);
  function navigate(next: AdminToolTarget) {
    router.push(adminToolPreviewHref(next.tool, next.memberId, "/dashboard/admin", next.vipView), { scroll: false });
    navDialog.current?.close();
  }
  function navigatePath(path: string) {
    const next = parseCurrentAdminPath(path);
    if (next) navigate(next);
  }
  return <main className={s.page}>
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <Link href="/dashboard" prefetch={false} className={s.brand}><span><Crown size={24} aria-hidden="true" /></span><div>InvestPro <b>Admin</b><small>{tr("VOTRE ESPACE DE GESTION", "YOUR MANAGEMENT SPACE")}</small></div></Link>
        <Navigation target={target} navigate={navigate} tr={tr} />
        <div className={s.sidebarFooter}><span><ShieldCheck size={15} aria-hidden="true" />{tr("Administration InvestPro", "InvestPro administration")}</span><p>{tr("Vos membres, vos contenus et vos outils au même endroit.", "Your members, content and tools in one place.")}</p><Link href="/dashboard" prefetch={false}>{tr("Retour à InvestPro", "Back to InvestPro")}<ArrowRight size={14} aria-hidden="true" /></Link></div>
      </aside>
      <div className={s.workspace}>
        <header className={s.topbar}><div className={s.topbarLeft}><button type="button" className={s.iconButton + " " + s.burger} aria-label={tr("Ouvrir le menu administration", "Open administration menu")} onClick={() => navDialog.current?.showModal()}><Menu size={21} aria-hidden="true" /></button><span className={s.breadcrumb}>{tr("Administration", "Administration")}<ChevronRight size={12} aria-hidden="true" /><b>{tr(current.fr, current.en)}</b></span></div><div className={s.headerActions}><button type="button" className={s.iconButton} aria-label={tr("Voir les demandes VIP à vérifier", "View VIP applications to review")} onClick={() => navigate({ tool: "vip", vipView: "requests" })}><Bell size={20} aria-hidden="true" /></button><LanguageSwitcher /></div></header>
        <div className={s.content}><div className={s.sectionHeader}><span className={s.eyebrow}>INVESTPRO · {tr("ADMINISTRATION", "ADMINISTRATION")}</span><h1 ref={heading} tabIndex={-1}>{tr(current.fr, current.en)}{target.memberId && (" · " + tr("Dossier membre", "Member details"))}</h1><p>{tr("Vos outils et vos données, dans le même espace de travail.", "Your tools and data, in the same workspace.")}</p></div><AdminToolWorkspace key={key} tool={target.tool} memberId={target.memberId} vipView={target.vipView} basePath="/dashboard/admin" onNavigate={navigatePath} /></div>
      </div>
    </div>
    <dialog ref={navDialog} className={s.navDrawer} aria-label={tr("Menu administration", "Administration menu")} onClick={event => { if (event.target === event.currentTarget) navDialog.current?.close(); }}><div className={s.drawerHeader}><b>InvestPro <span>Admin</span></b><button type="button" className={s.iconButton} onClick={() => navDialog.current?.close()} aria-label={tr("Fermer le menu", "Close menu")}><X size={20} aria-hidden="true" /></button></div><Navigation target={target} navigate={navigate} tr={tr} /><Link className={s.drawerFooter} href="/dashboard" prefetch={false}>{tr("Retour à InvestPro", "Back to InvestPro")}<ArrowRight size={15} aria-hidden="true" /></Link></dialog>
  </main>;
}
