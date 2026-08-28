"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  loadSidebarExpanded,
  saveSidebarExpanded,
} from "../lib/uiStore";

import {
  LayoutDashboard,
  GraduationCap,
  Library,
  TrendingUp,
  WalletCards,
  BarChart3,
  CalendarDays,
  BookOpen,
  Calculator,
  Repeat2,
  Monitor,
  Trophy,
  Target,
  Users,
  User,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Grid2X2,
  X,
  Settings,
} from "lucide-react";

type IconKey =
  | "dashboard"
  | "academy"
  | "library"
  | "progress"
  | "accounts"
  | "tradingview"
  | "calendar"
  | "journal"
  | "plan"
  | "risk"
  | "ranking"
  | "vipperformance"
  | "challenges"
  | "members"
  | "copier"
  | "terminal"
  | "reports"
  | "profile"
  | "support"
  | "settings";

const HIDE_SCROLLBAR =
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function Icon({
  name,
  className = "h-[18px] w-[18px]",
}: {
  name: IconKey;
  className?: string;
}) {
  const map: Record<IconKey, React.ElementType> = {
    dashboard: LayoutDashboard,

    academy: GraduationCap,
    library: Library,
    progress: TrendingUp,

    accounts: WalletCards,
    tradingview: BarChart3,
    calendar: CalendarDays,
    journal: BookOpen,
    plan: ClipboardCheck,
    risk: Calculator,

    ranking: Trophy,
    vipperformance: BarChart3,
    challenges: Target,
    members: Users,

    copier: Repeat2,
    terminal: Monitor,
    reports: BarChart3,

    profile: User,
    support: LifeBuoy,
    settings: Settings,
  };

  const Comp = map[name];

  return <Comp className={className} />;
}

function NavItem({
  href,
  label,
  icon,
  badge,
  open,
}: {
  href: string;
  label: string;
  icon: IconKey;
  badge?: string;
  open: boolean;
}) {
  const pathname = usePathname();

  const active =
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={[
        "group flex items-center rounded-xl transition border no-underline",
        open ? "gap-3 px-3 py-2" : "justify-center p-3",
        active
          ? "bg-[color:var(--gold-soft)] border-[color:var(--gold-border)] text-white"
          : "border-transparent text-[color:var(--muted)] hover:bg-white/5 hover:text-white",
      ].join(" ")}
      title={!open ? label : undefined}
    >
      <span
        className={[
          "shrink-0 transition",
          active
            ? "text-[color:var(--gold)]"
            : "text-white/70 group-hover:text-white",
        ].join(" ")}
      >
        <Icon name={icon} />
      </span>

      {open ? (
        <>
          <span className="text-sm font-medium truncate">{label}</span>

          <span className="ml-auto flex items-center gap-1.5">
            {badge ? (
              <span
                className="
                  text-[9px] px-2 py-0.5 rounded-full
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  text-[color:var(--gold)]
                  font-bold uppercase
                "
              >
                {badge}
              </span>
            ) : null}
          </span>
        </>
      ) : null}
    </Link>
  );
}

function SectionTitle({
  title,
  open,
}: {
  title: string;
  open: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="
        px-3 pt-5 pb-2
        text-[10px] font-semibold uppercase
        tracking-[0.18em] text-white/30
      "
    >
      {title}
    </div>
  );
}

function MobileTab({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "relative min-w-0 flex-1 h-[62px] rounded-2xl",
        "flex flex-col items-center justify-center gap-1",
        "transition no-underline",
        active
          ? "text-[color:var(--gold)] bg-[color:var(--gold-soft)]"
          : "text-white/55",
      ].join(" ")}
    >
      {icon}
      <span className="text-[10px] font-medium truncate">{label}</span>
    </Link>
  );
}

function MobileMenuLink({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  icon: IconKey;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="
        h-14 px-3 rounded-2xl
        border border-[color:var(--border)]
        bg-white/[0.025]
        flex items-center gap-3
        no-underline text-[color:var(--text)]
        active:scale-[0.99] transition
      "
    >
      <span
        className="
          w-9 h-9 rounded-xl
          border border-[color:var(--gold-border)]
          bg-[color:var(--gold-soft)]
          flex items-center justify-center
          text-[color:var(--gold)] shrink-0
        "
      >
        <Icon name={icon} />
      </span>

      <span className="text-sm font-medium truncate">{label}</span>

      {badge ? (
        <span
          className="
            ml-auto text-[9px] px-2 py-1 rounded-full
            border border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            text-[color:var(--gold)]
            font-bold uppercase
          "
        >
          {badge}
        </span>
      ) : (
        <ChevronRight className="ml-auto h-4 w-4 text-white/30" />
      )}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // On décide explicitement si on est en mode desktop ou mobile.
  // Comme ça, la grosse sidebar desktop n'est même PAS rendue sur téléphone.
  const [viewportReady, setViewportReady] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // Desktop uniquement si :
    // 1) l'écran fait au moins 1024px
    // 2) l'appareil possède un vrai pointeur souris / trackpad
    //
    // Ça évite que Chrome DevTools en mode iPhone affiche encore
    // la grosse sidebar desktop au milieu de l'écran.
    const desktopMedia = window.matchMedia(
      "(min-width: 1024px) and (hover: hover) and (pointer: fine)"
    );

    const updateViewport = () => {
      const desktop =
        window.innerWidth >= 1024 &&
        desktopMedia.matches;

      setIsDesktop(desktop);
      setViewportReady(true);
    };

    updateViewport();

    desktopMedia.addEventListener?.("change", updateViewport);
    window.addEventListener("resize", updateViewport);

    return () => {
      desktopMedia.removeEventListener?.("change", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    setPinned(loadSidebarExpanded());
  }, []);

  useEffect(() => {
    setMobileMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMoreOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMoreOpen]);

  const open = pinned || hovered;
  const width = open ? 280 : 88;

  function togglePin() {
    setPinned((current) => {
      const next = !current;
      saveSidebarExpanded(next);
      return next;
    });
  }

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  const statsActive =
    isActive("/dashboard/rapports") ||
    isActive("/dashboard/performances-vip");

  const academyActive = pathname.startsWith("/dashboard/academy");

  const moreActive =
    isActive("/dashboard/profil") ||
    isActive("/dashboard/comptes") ||
    isActive("/dashboard/tradingview") ||
    isActive("/dashboard/calendrier") ||
    isActive("/dashboard/plan") ||
    isActive("/dashboard/simulateur") ||
    isActive("/dashboard/classement") ||
    isActive("/dashboard/challenges") ||
    isActive("/dashboard/membres") ||
    isActive("/dashboard/copieur") ||
    isActive("/dashboard/terminal") ||
    isActive("/dashboard/contact") ||
    isActive("/dashboard/parametres");

  return (
    <>
      {/* =====================================================
          DESKTOP SIDEBAR
          IMPORTANT : elle n'est jamais rendue sous 1024px.
      ===================================================== */}
      {viewportReady && isDesktop ? (
      <aside
        data-investpro-desktop-sidebar="true"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="
          flex
          fixed left-0 top-0 z-[999]
          h-screen
          bg-black/70 backdrop-blur-xl
          border-r border-[color:var(--border)]
          px-3 py-5
          flex-col
          transition-[width] duration-200 ease-out
        "
        style={{ width }}
      >
        <button
          onClick={togglePin}
          className={[
            "flex items-center rounded-2xl",
            "border border-[color:var(--border)]",
            "bg-black/30 hover:bg-white/5 transition",
            open ? "gap-3 px-3 py-3" : "p-3 justify-center",
          ].join(" ")}
          title={pinned ? "Désépingler la barre" : "Épingler la barre"}
          type="button"
        >
          <div
            className="
              w-10 h-10 rounded-xl
              border border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)]
              flex items-center justify-center shrink-0
            "
          >
            <span className="text-sm font-bold text-[color:var(--gold)]">
              IP
            </span>
          </div>

          {open ? (
            <div className="text-left leading-tight min-w-0">
              <div className="font-semibold truncate">
                <span className="text-white">InvestPro</span>{" "}
                <span className="text-[color:var(--gold)]">Trading</span>
              </div>

              <div className="text-[11px] text-[color:var(--muted)] mt-1">
                Academy & Trading Hub
              </div>
            </div>
          ) : null}
        </button>

        <nav
          className={[
            "mt-3 flex-1 overflow-y-auto pr-1",
            HIDE_SCROLLBAR,
          ].join(" ")}
        >
          <SectionTitle title="Accueil" open={open} />

          <div className="space-y-1">
            <NavItem
              open={open}
              href="/dashboard"
              label="Dashboard"
              icon="dashboard"
            />
          </div>

          <SectionTitle title="Academy" open={open} />

          <div className="space-y-1">
            <NavItem
              open={open}
              href="/dashboard/academy"
              label="Mes formations"
              icon="academy"
              badge="BIENTÔT"
            />

            <NavItem
              open={open}
              href="/dashboard/academy/bibliotheque"
              label="Bibliothèque"
              icon="library"
              badge="BIENTÔT"
            />

            <NavItem
              open={open}
              href="/dashboard/academy/progression"
              label="Progression"
              icon="progress"
              badge="BIENTÔT"
            />
          </div>

          <SectionTitle title="Trading" open={open} />

          <div className="space-y-1">
            <NavItem
              open={open}
              href="/dashboard/comptes"
              label="Mes comptes"
              icon="accounts"
            />

            <NavItem
              open={open}
              href="/dashboard/tradingview"
              label="TradingView"
              icon="tradingview"
            />

            <NavItem
              open={open}
              href="/dashboard/calendrier"
              label="Calendrier éco"
              icon="calendar"
            />

            <NavItem
              open={open}
              href="/dashboard/journal"
              label="Journal"
              icon="journal"
            />

            <NavItem
              open={open}
              href="/dashboard/plan"
              label="Plan de trading"
              icon="plan"
            />

            <NavItem
              open={open}
              href="/dashboard/simulateur"
              label="Simulateur risque"
              icon="risk"
            />

            <NavItem
              open={open}
              href="/dashboard/rapports"
              label="Rapports"
              icon="reports"
            />
          </div>

          <SectionTitle title="Communauté" open={open} />

          <div className="space-y-1">
            <NavItem
              open={open}
              href="/dashboard/classement"
              label="Classement"
              icon="ranking"
            />

            <NavItem
              open={open}
              href="/dashboard/performances-vip"
              label="Performances VIP"
              icon="vipperformance"
            />

            <NavItem
              open={open}
              href="/dashboard/challenges"
              label="Challenges"
              icon="challenges"
            />

            <NavItem
              open={open}
              href="/dashboard/membres"
              label="Membres"
              icon="members"
            />
          </div>

          <SectionTitle title="Automatisation" open={open} />

          <div className="space-y-1">
            <NavItem
              open={open}
              href="/dashboard/copieur"
              label="Copieur"
              icon="copier"
              badge="BIENTÔT"
            />

            <NavItem
              open={open}
              href="/dashboard/terminal"
              label="Terminal"
              icon="terminal"
              badge="BIENTÔT"
            />
          </div>

          <SectionTitle title="Compte" open={open} />

          <div className="space-y-1">
            <NavItem
              open={open}
              href="/dashboard/profil"
              label="Profil"
              icon="profile"
            />

            <NavItem
              open={open}
              href="/dashboard/contact"
              label="Support"
              icon="support"
            />
          </div>

          <div className="h-4" />
        </nav>

        <button
          onClick={togglePin}
          className={[
            "rounded-2xl",
            "border border-[color:var(--border)]",
            "bg-black/20 hover:bg-white/5",
            "transition shrink-0",
            open
              ? "px-3 py-3 flex items-center justify-between"
              : "p-3 flex items-center justify-center",
          ].join(" ")}
          title={pinned ? "Désépingler" : "Épingler"}
          type="button"
        >
          {open ? (
            <>
              <span className="text-sm text-[color:var(--muted)]">
                {pinned ? "Réduire" : "Épingler"}
              </span>

              <ChevronLeft className="h-5 w-5 text-white/70" />
            </>
          ) : (
            <ChevronRight className="h-5 w-5 text-white/70" />
          )}
        </button>
      </aside>
      ) : null}

      {/* =====================================================
          MOBILE BOTTOM NAV
          Visible uniquement sous 1024px.
      ===================================================== */}
      {viewportReady && !isDesktop ? (
      <div
        data-investpro-mobile-nav="true"
        className="
          fixed left-0 right-0 bottom-0 z-[999]
          px-3 pt-2
          pb-[max(8px,env(safe-area-inset-bottom))]
          bg-black/80 backdrop-blur-2xl
          border-t border-white/10
        "
      >
        <div
          className="
            max-w-[560px] mx-auto
            rounded-[24px]
            border border-white/10
            bg-[#0c0d10]/95
            shadow-[0_-12px_40px_rgba(0,0,0,.35)]
            p-1.5
            flex items-center gap-1
          "
        >
          <MobileTab
            href="/dashboard"
            label="Accueil"
            active={pathname === "/dashboard"}
            icon={<LayoutDashboard className="h-[20px] w-[20px]" />}
          />

          <MobileTab
            href="/dashboard/journal"
            label="Journal"
            active={isActive("/dashboard/journal")}
            icon={<BookOpen className="h-[20px] w-[20px]" />}
          />

          <MobileTab
            href="/dashboard/rapports"
            label="Stats"
            active={statsActive}
            icon={<BarChart3 className="h-[20px] w-[20px]" />}
          />

          <MobileTab
            href="/dashboard/academy"
            label="Academy"
            active={academyActive}
            icon={<GraduationCap className="h-[20px] w-[20px]" />}
          />

          <button
            type="button"
            onClick={() => setMobileMoreOpen(true)}
            className={[
              "relative min-w-0 flex-1 h-[62px] rounded-2xl",
              "flex flex-col items-center justify-center gap-1 transition",
              moreActive || mobileMoreOpen
                ? "text-[color:var(--gold)] bg-[color:var(--gold-soft)]"
                : "text-white/55",
            ].join(" ")}
          >
            <Grid2X2 className="h-[20px] w-[20px]" />
            <span className="text-[10px] font-medium">Plus</span>
          </button>
        </div>
      </div>
      ) : null}


      {/* =====================================================
          MOBILE PLUS SHEET
      ===================================================== */}
      {viewportReady && !isDesktop && mobileMoreOpen ? (
        <div className="fixed inset-0 z-[1200]">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setMobileMoreOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <div
            className="
              absolute left-0 right-0 bottom-0
              max-h-[82vh]
              rounded-t-[30px]
              border-t border-white/10
              bg-[#0a0b0d]
              shadow-2xl
              overflow-hidden
            "
          >
            <div className="px-5 pt-4 pb-3 border-b border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white">
                    Plus
                  </div>
                  <div className="text-xs text-white/45 mt-0.5">
                    Tous les outils InvestPro
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileMoreOpen(false)}
                  className="
                    w-10 h-10 rounded-2xl
                    border border-white/10
                    bg-white/5
                    flex items-center justify-center
                    text-white/70
                  "
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div
              className={[
                "px-4 pt-4 pb-28 overflow-y-auto max-h-[calc(82vh-72px)]",
                HIDE_SCROLLBAR,
              ].join(" ")}
            >
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/30 px-1 mb-2">
                Trading
              </div>

              <div className="grid grid-cols-1 gap-2">
                <MobileMenuLink
                  href="/dashboard/comptes"
                  label="Mes comptes"
                  icon="accounts"
                />
                <MobileMenuLink
                  href="/dashboard/tradingview"
                  label="TradingView"
                  icon="tradingview"
                />
                <MobileMenuLink
                  href="/dashboard/calendrier"
                  label="Calendrier éco"
                  icon="calendar"
                />
                <MobileMenuLink
                  href="/dashboard/plan"
                  label="Plan de trading"
                  icon="plan"
                />
                <MobileMenuLink
                  href="/dashboard/simulateur"
                  label="Simulateur risque"
                  icon="risk"
                />
              </div>

              <div className="text-[10px] uppercase tracking-[0.18em] text-white/30 px-1 mt-6 mb-2">
                Communauté
              </div>

              <div className="grid grid-cols-1 gap-2">
                <MobileMenuLink
                  href="/dashboard/performances-vip"
                  label="Performances VIP"
                  icon="vipperformance"
                />
                <MobileMenuLink
                  href="/dashboard/classement"
                  label="Classement"
                  icon="ranking"
                />
                <MobileMenuLink
                  href="/dashboard/challenges"
                  label="Challenges"
                  icon="challenges"
                />
                <MobileMenuLink
                  href="/dashboard/membres"
                  label="Membres"
                  icon="members"
                />
              </div>

              <div className="text-[10px] uppercase tracking-[0.18em] text-white/30 px-1 mt-6 mb-2">
                Compte & outils
              </div>

              <div className="grid grid-cols-1 gap-2">
                <MobileMenuLink
                  href="/dashboard/profil"
                  label="Profil"
                  icon="profile"
                />
                <MobileMenuLink
                  href="/dashboard/parametres"
                  label="Paramètres"
                  icon="settings"
                />
                <MobileMenuLink
                  href="/dashboard/contact"
                  label="Support"
                  icon="support"
                />
                <MobileMenuLink
                  href="/dashboard/copieur"
                  label="Copieur"
                  icon="copier"
                  badge="Bientôt"
                />
                <MobileMenuLink
                  href="/dashboard/terminal"
                  label="Terminal"
                  icon="terminal"
                  badge="Bientôt"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
