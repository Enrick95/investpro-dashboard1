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
  | "support";


const HIDE_SCROLLBAR =
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function Icon({
  name,
}: {
  name: IconKey;
}) {
  const map: Record<
    IconKey,
    React.ElementType
  > = {
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
  };

  const Comp = map[name];

  return (
    <Comp className="h-[18px] w-[18px]" />
  );
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
  const pathname =
    usePathname();

  const active =
    pathname === href ||
    (href !== "/dashboard" &&
      pathname.startsWith(
        `${href}/`
      ));

  const content = (
    <>
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
          <span className="text-sm font-medium truncate">
            {label}
          </span>

          <span className="ml-auto flex items-center gap-1.5">
            {badge ? (
              <span
                className="
                  text-[9px]
                  px-2 py-0.5
                  rounded-full
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  text-[color:var(--gold)]
                  font-bold
                  uppercase
                "
              >
                {badge}
              </span>
            ) : null}
          </span>
        </>
      ) : null}
    </>
  );

  return (
    <Link
      href={href}
      className={[
        "group flex items-center rounded-xl transition border no-underline",

        open
          ? "gap-3 px-3 py-2"
          : "justify-center p-3",

        active
          ? "bg-[color:var(--gold-soft)] border-[color:var(--gold-border)] text-white"
          : "border-transparent text-[color:var(--muted)] hover:bg-white/5 hover:text-white",
      ].join(" ")}
      title={
        !open
          ? label
          : undefined
      }
    >
      {content}
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
  if (!open) {
    return null;
  }

  return (
    <div
      className="
        px-3
        pt-5 pb-2
        text-[10px]
        font-semibold
        uppercase
        tracking-[0.18em]
        text-white/30
      "
    >
      {title}
    </div>
  );
}

export default function Sidebar() {
  const [
    pinned,
    setPinned,
  ] = useState(false);

  const [
    hovered,
    setHovered,
  ] = useState(false);

  useEffect(() => {
    setPinned(
      loadSidebarExpanded()
    );
  }, []);

  const open =
    pinned || hovered;

  const width =
    open ? 280 : 88;

  function togglePin() {
    setPinned(
      (current) => {
        const next =
          !current;

        saveSidebarExpanded(
          next
        );

        return next;
      }
    );
  }

  return (
    <aside
      onMouseEnter={() =>
        setHovered(true)
      }
      onMouseLeave={() =>
        setHovered(false)
      }
      className="
        fixed
        left-0 top-0
        z-[999]
        h-screen
        bg-black/70
        backdrop-blur-xl
        border-r border-[color:var(--border)]
        px-3 py-5
        flex flex-col
        transition-[width]
        duration-200
        ease-out
      "
      style={{
        width,
      }}
    >
      {/* =====================================================
          LOGO
      ===================================================== */}

      <button
        onClick={
          togglePin
        }
        className={[
          "flex items-center rounded-2xl",
          "border border-[color:var(--border)]",
          "bg-black/30 hover:bg-white/5 transition",

          open
            ? "gap-3 px-3 py-3"
            : "p-3 justify-center",
        ].join(" ")}
        title={
          pinned
            ? "Désépingler la barre"
            : "Épingler la barre"
        }
        type="button"
      >
        <div
          className="
            w-10 h-10
            rounded-xl
            border border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            flex items-center justify-center
            shrink-0
          "
        >
          <span className="text-sm font-bold text-[color:var(--gold)]">
            IP
          </span>
        </div>

        {open ? (
          <div className="text-left leading-tight min-w-0">
            <div className="font-semibold truncate">
              <span className="text-white">
                InvestPro
              </span>{" "}
              <span className="text-[color:var(--gold)]">
                Trading
              </span>
            </div>

            <div className="text-[11px] text-[color:var(--muted)] mt-1">
              Academy & Trading Hub
            </div>
          </div>
        ) : null}
      </button>

      {/* =====================================================
          MENU
      ===================================================== */}

      <nav
        className={[
          "mt-3 flex-1 overflow-y-auto pr-1",
          HIDE_SCROLLBAR,
        ].join(" ")}
      >
        {/* ACCUEIL */}

        <SectionTitle
          title="Accueil"
          open={open}
        />

        <div className="space-y-1">
          <NavItem
            open={open}
            href="/dashboard"
            label="Dashboard"
            icon="dashboard"
          />
        </div>

        {/* =================================================
            ACADEMY
        ================================================= */}

        <SectionTitle
          title="Academy"
          open={open}
        />

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

        {/* =================================================
            TRADING
        ================================================= */}

        <SectionTitle
          title="Trading"
          open={open}
        />

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

          {/* NOUVEAU */}

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

        {/* =================================================
            COMMUNAUTÉ
        ================================================= */}

        <SectionTitle
          title="Communauté"
          open={open}
        />

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

        {/* =================================================
            AUTOMATISATION
        ================================================= */}

        <SectionTitle
          title="Automatisation"
          open={open}
        />

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

        {/* =================================================
            COMPTE
        ================================================= */}

        <SectionTitle
          title="Compte"
          open={open}
        />

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

      {/* =====================================================
          PIN
      ===================================================== */}

      <button
        onClick={
          togglePin
        }
        className={[
          "rounded-2xl",
          "border border-[color:var(--border)]",
          "bg-black/20 hover:bg-white/5",
          "transition shrink-0",

          open
            ? "px-3 py-3 flex items-center justify-between"
            : "p-3 flex items-center justify-center",
        ].join(" ")}
        title={
          pinned
            ? "Désépingler"
            : "Épingler"
        }
        type="button"
      >
        {open ? (
          <>
            <span className="text-sm text-[color:var(--muted)]">
              {pinned
                ? "Réduire"
                : "Épingler"}
            </span>

            <ChevronLeft className="h-5 w-5 text-white/70" />
          </>
        ) : (
          <ChevronRight className="h-5 w-5 text-white/70" />
        )}
      </button>
    </aside>
  );
}