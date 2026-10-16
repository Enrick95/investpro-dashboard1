"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowRight, Loader2, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { AdminPreviewNavigationProvider } from "@/components/admin/AdminPreviewNavigation";
import AdminPhoneAlerts from "@/components/admin/AdminPhoneAlerts";
import AdminActivityBell from "@/components/admin/AdminActivityBell";
import { adminToolPreviewHref, checkAdminToolAccess, parseCurrentAdminPath, type AdminToolCheck, type AdminToolId, type AdminWorkspacePath, type VipAdminView } from "./admin-tool-access";
import s from "./admin-tool-workspace.module.css";

function LoadingTool() {
  const { locale } = useLocale();
  return <div className={s.loading} role="status"><Loader2 size={20} aria-hidden="true" /><span>{locale === "en" ? "Loading the current tool…" : "Chargement de l’outil actuel…"}</span></div>;
}

// Import functions are declared statically, but a module is rendered and loaded only after the targeted server permission check succeeds.
const TOOLS = {
  analytics: dynamic(() => import("@/app/dashboard/admin/analytics/page"), { ssr: false, loading: LoadingTool }),
  annonces: dynamic(() => import("@/app/dashboard/admin/annonces/page"), { ssr: false, loading: LoadingTool }),
  backoffice: dynamic(() => import("@/app/dashboard/admin/backoffice/page"), { ssr: false, loading: LoadingTool }),
  copieur: dynamic(() => import("@/app/dashboard/admin/copieur/page"), { ssr: false, loading: LoadingTool }),
  feedback: dynamic(() => import("@/app/dashboard/admin/feedback/page"), { ssr: false, loading: LoadingTool }),
  finance: dynamic(() => import("@/app/dashboard/admin/finance/page"), { ssr: false, loading: LoadingTool }),
  inbox: dynamic(() => import("@/app/dashboard/admin/inbox/page"), { ssr: false, loading: LoadingTool }),
  moderation: dynamic(() => import("@/app/dashboard/admin/moderation/page"), { ssr: false, loading: LoadingTool }),
  navigation: dynamic(() => import("@/app/dashboard/admin/navigation/page"), { ssr: false, loading: LoadingTool }),
  "overview-current": dynamic(() => import("@/components/admin/AdminOverview"), { ssr: false, loading: LoadingTool }),
  serveurs: dynamic(() => import("@/app/dashboard/admin/serveurs/page"), { ssr: false, loading: LoadingTool }),
  staff: dynamic(() => import("@/app/dashboard/admin/staff/page"), { ssr: false, loading: LoadingTool }),
  systeme: dynamic(() => import("@/app/dashboard/admin/systeme/page"), { ssr: false, loading: LoadingTool }),
  utilisateurs: dynamic(() => import("@/app/dashboard/admin/utilisateurs/page"), { ssr: false, loading: LoadingTool }),
  vip: dynamic(() => import("@/app/dashboard/admin/vip/page"), { ssr: false, loading: LoadingTool }),
  "vip-publications": dynamic(() => import("./CurrentVipPostsTool"), { ssr: false, loading: LoadingTool }),
};
const CurrentMember = dynamic(() => import("@/app/dashboard/admin/utilisateurs/[id]/page"), { ssr: false, loading: LoadingTool });

type Props = { tool: AdminToolId; memberId?: string; vipView?: VipAdminView; basePath?: AdminWorkspacePath; onNavigate: (path: string) => void };
type Gate = { key: string } & (AdminToolCheck | { status: "checking" });

class ToolBoundary extends Component<{ children: ReactNode; retry: () => void; english: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className={s.gatePanel} role="alert"><h2>{this.props.english ? "This tool could not be displayed." : "Cet outil n’a pas pu être affiché."}</h2><p>{this.props.english ? "Retry loading it. Your administration menu remains available." : "Réessayez de le charger. Votre menu d’administration reste disponible."}</p><button type="button" onClick={this.props.retry} className={s.action}><RefreshCw size={16} aria-hidden="true" />{this.props.english ? "Retry" : "Réessayer"}</button></div>;
  }
}

export default function AdminToolWorkspace({ tool, memberId, vipView, basePath = "/admin-preview", onNavigate }: Props) {
  const { locale } = useLocale();
  const english = locale === "en";
  const tr = (fr: string, en: string) => english ? en : fr;
  const key = `${tool}:${memberId || "list"}:${vipView || "default"}`;
  const [attempt, setAttempt] = useState(0);
  const [gate, setGate] = useState<Gate>({ key, status: "checking" });

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let lastToken: string | null = null;
    let unsubscribe: (() => void) | undefined;
    async function verify() {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        if (disposed) return;
        const supabase = createClient();
        const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
          if (disposed || event === "INITIAL_SESSION") return;
          if (event === "SIGNED_OUT" || !session?.access_token) {
            controller.abort();
            setGate({ key, status: "signedOut" });
          } else if (event === "USER_UPDATED" || session.access_token !== lastToken) {
            controller.abort();
            setGate({ key, status: "checking" });
            setAttempt(value => value + 1);
          }
        });
        unsubscribe = () => subscription.subscription.unsubscribe();
        const result = await checkAdminToolAccess({ tool, memberId, signal: controller.signal, getToken: async () => {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          lastToken = data.session?.access_token || null;
          return lastToken;
        } });
        if (!disposed && !controller.signal.aborted && result.status !== "aborted") setGate({ key, ...result });
      } catch {
        if (!disposed) setGate({ key, status: "unavailable" });
      }
    }
    void verify();
    return () => { disposed = true; controller.abort(); unsubscribe?.(); };
  }, [attempt, key, memberId, tool]);

  const status = gate.key === key ? gate.status : "checking";
  const retry = () => { setGate({ key, status: "checking" }); setAttempt(value => value + 1); };
  if (status !== "allowed") return <section className={s.gatePanel} aria-live="polite">
    <span className={s.gateIcon}>{status === "checking" ? <Loader2 size={25} className={s.spinner} aria-hidden="true" /> : <LockKeyhole size={25} aria-hidden="true" />}</span>
    <span className={s.kicker}>{tr("OUTIL ACTUEL · ACCÈS ADMINISTRATEUR", "CURRENT TOOL · ADMINISTRATOR ACCESS")}</span>
    <h2>{status === "checking" ? tr("Vérification de votre accès…", "Checking your access…") : status === "signedOut" ? tr("Connectez-vous pour ouvrir cet outil.", "Sign in to open this tool.") : status === "denied" ? tr("Cet outil demande des droits spécifiques.", "This tool requires specific permissions.") : tr("La vérification est momentanément indisponible.", "Access verification is temporarily unavailable.")}</h2>
    <p>{status === "signedOut" ? tr("Le menu reste disponible. Les données de l’outil ne seront chargées qu’après vérification de votre compte administrateur.", "The menu remains available. Tool data will load only after your administrator account has been verified.") : status === "denied" ? tr("Votre compte n’est pas autorisé à utiliser cette rubrique. Les mêmes permissions que dans l’administration actuelle s’appliquent.", "Your account is not authorized to use this section. The same permissions as the current administration apply.") : status === "checking" ? tr("L’autorisation est vérifiée par le serveur avant le chargement de la rubrique.", "The server verifies permission before loading this section.") : tr("Aucune donnée de cet outil n’a été chargée. Vous pouvez réessayer depuis cet espace.", "No data from this tool has been loaded. You can retry from this workspace.")}</p>
    {status === "signedOut" ? <Link href={`/login?next=${encodeURIComponent(adminToolPreviewHref(tool, memberId, basePath, vipView))}`} prefetch={false} className={s.action}>{tr("Me connecter", "Sign in")}<ArrowRight size={17} aria-hidden="true" /></Link> : status !== "checking" && <button type="button" className={s.action} onClick={retry}><RefreshCw size={16} aria-hidden="true" />{tr("Réessayer", "Retry")}</button>}
  </section>;

  const CurrentTool = tool === "utilisateurs" && memberId ? CurrentMember : TOOLS[tool];
  function captureAdminLink(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(target instanceof HTMLAnchorElement) || target.hasAttribute("download") || (target.target && target.target.toLowerCase() !== "_self")) return;
    const url = new URL(target.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    const path = `${url.pathname}${url.search}`;
    if (parseCurrentAdminPath(path) === null) return;
    event.preventDefault();
    event.stopPropagation();
    onNavigate(path);
  }
  return <section className={s.toolSection}>
    {basePath === "/dashboard/admin" && <div className="mb-5 flex flex-wrap items-start gap-3"><AdminActivityBell onNavigate={onNavigate} /><AdminPhoneAlerts /></div>}
    <div className={s.liveNotice}><ShieldCheck size={19} aria-hidden="true" /><div><b>{tr("Outil actuel · données et actions réelles", "Current tool · real data and actions")}</b><span>{basePath === "/dashboard/admin" ? tr("Votre compte et vos permissions sont vérifiés avant le chargement de cette rubrique.", "Your account and permissions are verified before this section loads.") : tr("Cette rubrique conserve vos droits et son fonctionnement actuel. Les vues d’exemple restent séparées dans le menu.", "This section keeps your permissions and its existing behavior. Example views remain separate in the menu.")}</span></div></div>
    <ToolBoundary key={`${key}:${attempt}`} retry={retry} english={english}><AdminPreviewNavigationProvider onNavigate={onNavigate} memberId={memberId} vipView={vipView}><div className={s.currentTool} data-current-admin-tool={tool} onClickCapture={captureAdminLink}><CurrentTool key={`${key}:${attempt}`} /></div></AdminPreviewNavigationProvider></ToolBoundary>
  </section>;
}
