"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { loadSidebarExpanded, saveSidebarExpanded } from "../lib/uiStore";

import {
  User,
  FileText,
  Trophy,
  CalendarDays,
  BookOpen,
  Calculator,
  Repeat2,
  Monitor,
  CreditCard,
  BarChart3,
  Bug,
  Mail,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type IconKey =
  | "profile"
  | "accounts"
  | "rank"
  | "tv"
  | "cal"
  | "journal"
  | "risk"
  | "copier"
  | "terminal"
  | "sub"
  | "reports"
  | "bug"
  | "contact";

/** ✅ scrollbar invisible (plus de "molette" jaune) */
const HIDE_SCROLLBAR =
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** ✅ Ton logo TradingView: tu remplaceras ce composant par ton Image depuis /public/icons */
function TvIcon() {
  return (
    <span className="relative inline-block h-5 w-5">
      <Image
        src="/icons/tradingview.webp"
        alt="TradingView"
        fill
        className="object-contain brightness-0 invert opacity-80"
      />
    </span>
  );
}

function Icon({ name }: { name: IconKey }) {
  const map: Record<Exclude<IconKey, "tv">, React.ElementType> = {
    profile: User,
    accounts: FileText,
    rank: Trophy,
    cal: CalendarDays,
    journal: BookOpen,
    risk: Calculator,
    copier: Repeat2,
    terminal: Monitor,
    sub: CreditCard,
    reports: BarChart3,
    bug: Bug,
    contact: Mail,
  };

  if (name === "tv") return <TvIcon />;

  const Comp = map[name as Exclude<IconKey, "tv">];
  return <Comp className="h-5 w-5" />;
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
  const active = pathname === href;

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
      {/* ✅ Couleur icône identique aux autres */}
      <span
        className={[
          "shrink-0",
          active ? "text-[color:var(--gold)]" : "text-white/70 group-hover:text-white",
        ].join(" ")}
      >
        <Icon name={icon} />
      </span>

      {/* ✅ Texte seulement si ouvert */}
      {open ? (
        <>
          <span className="text-sm font-medium">{label}</span>
          <span className="ml-auto">
            {badge ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
                {badge}
              </span>
            ) : null}
          </span>
        </>
      ) : null}
    </Link>
  );
}

function SectionTitle({ title, open }: { title: string; open: boolean }) {
  if (!open) return null;
  return (
    <div className="mt-6 mb-2 text-[11px] tracking-widest uppercase text-[color:var(--muted)] px-2">
      {title}
    </div>
  );
}

export default function Sidebar() {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setPinned(loadSidebarExpanded());
  }, []);

  const open = pinned || hovered;
  const width = open ? 280 : 88;

  function togglePin() {
    setPinned((v) => {
      const next = !v;
      saveSidebarExpanded(next);
      return next;
    });
  }

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={[
        // ✅ AU-DESSUS DU HEADER
        "fixed left-0 top-0 z-[999] h-screen",
        "bg-black/40 backdrop-blur border-r border-[color:var(--border)] px-3 py-5 flex flex-col",
        "transition-[width] duration-200 ease-out",
      ].join(" ")}
      style={{ width }}
    >
      <div className="h-full flex flex-col overflow-hidden">
        {/* Logo (clic = pin) */}
        <button
          onClick={togglePin}
          className={[
            "flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-black/20 hover:bg-white/5 transition",
            open ? "px-3 py-3" : "p-3 justify-center",
          ].join(" ")}
          title={pinned ? "Désépingler" : "Épingler"}
        >
          <div className="w-11 h-11 rounded-2xl bg-[color:var(--panel-2)] border border-[color:var(--gold-border)] overflow-hidden flex items-center justify-center">
            <Image src="/logo.webp" alt="InvestPro" width={44} height={44} className="object-cover" />
          </div>

          {open ? (
            <div className="text-left leading-tight">
              <div className="font-semibold">
                <span className="text-white">InvestPro</span>{" "}
                <span className="text-[color:var(--gold)]">Trading</span>
              </div>
              <div className="text-xs text-[color:var(--muted)]">Dashboard</div>
            </div>
          ) : null}
        </button>

        {/* Menu (scroll sans scrollbar visible) */}
        <nav className={["mt-5 flex-1 overflow-y-auto pr-1", HIDE_SCROLLBAR].join(" ")}>
          <SectionTitle title="Général" open={open} />
          <div className="space-y-1">
            <NavItem open={open} href="/dashboard/profil" label="Profil" icon="profile" />
            <NavItem open={open} href="/dashboard/comptes" label="Comptes" icon="accounts" />
            <NavItem open={open} href="/dashboard/classement" label="Classement" icon="rank" />
          </div>

          <SectionTitle title="Outils" open={open} />
          <div className="space-y-1">
            <NavItem open={open} href="/dashboard/tradingview" label="TradingView" icon="tv" />
            <NavItem open={open} href="/dashboard/calendrier" label="Calendrier éco" icon="cal" />
            <NavItem open={open} href="/dashboard/journal" label="Journal" icon="journal" />
            <NavItem open={open} href="/dashboard/simulateur" label="Simulateur risque" icon="risk" badge="BETA" />
          </div>

          <SectionTitle title="Terminal" open={open} />
          <div className="space-y-1">
            <NavItem open={open} href="/dashboard/copieur" label="Copieur" icon="copier" badge="BETA" />
            <NavItem open={open} href="/dashboard/terminal" label="Terminal de Trading" icon="terminal" badge="BETA" />
          </div>

          <SectionTitle title="Support" open={open} />
          <div className="space-y-1">
            <NavItem open={open} href="/dashboard/abonnement" label="Abonnement" icon="sub" />
            <NavItem open={open} href="/dashboard/rapports" label="Rapports" icon="reports" />
            <NavItem open={open} href="/dashboard/bug" label="Reporter un bug" icon="bug" />
            <NavItem open={open} href="/dashboard/contact" label="Contact" icon="contact" />
          </div>
        </nav>

        {/* Bas (pin) */}
        <button
          onClick={togglePin}
          className={[
            "mt-3 rounded-2xl border border-[color:var(--border)] bg-black/20 hover:bg-white/5 transition shrink-0",
            open ? "px-3 py-3 flex items-center justify-between" : "p-3 flex items-center justify-center",
          ].join(" ")}
          title={pinned ? "Désépingler" : "Épingler"}
        >
          {open ? (
            <>
              <span className="text-sm text-[color:var(--muted)]">{pinned ? "Réduire" : "Épingler"}</span>
              <ChevronLeft className="h-5 w-5 text-white/70" />
            </>
          ) : (
            <ChevronRight className="h-5 w-5 text-white/70" />
          )}
        </button>
      </div>
    </aside>
  );
}
