"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

function Item({
  href,
  label,
  badge,
}: {
  href: string;
  label: string;
  badge?: string;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "flex items-center justify-between px-4 py-2.5 rounded-xl transition border",
        active
          ? "bg-[color:var(--gold-soft)] text-white border-[color:var(--gold-border)]"
          : "text-[color:var(--muted)] border-transparent hover:bg-white/5 hover:text-white",
      ].join(" ")}
    >
      <span className="text-sm font-medium">{label}</span>
      {badge ? (
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[color:var(--muted)]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div className="mt-7 mb-2 text-[11px] tracking-wide uppercase text-[color:var(--muted)]">
      {title}
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="w-[280px] min-h-screen bg-black/35 backdrop-blur border-r border-[color:var(--border)] px-4 py-6">
      <div className="flex items-center gap-3 px-2">
        <div className="w-11 h-11 rounded-2xl bg-[color:var(--panel-2)] border border-[color:var(--gold-border)] flex items-center justify-center overflow-hidden">
          <Image
            src="/logo.webp"
            alt="Logo"
            width={44}
            height={44}
            className="object-cover"
            priority
          />
        </div>

        <div className="leading-tight">
          <div className="font-semibold tracking-wide">
            <span className="text-white">InvestPro</span>{" "}
            <span className="text-[color:var(--gold)]">Trading</span>
          </div>
          <div className="text-xs text-[color:var(--muted)]">Dashboard</div>
        </div>
      </div>

      <nav className="mt-8">
        <Section title="Général" />
        <div className="space-y-1">
          <Item href="/dashboard/profil" label="Profil" />
          <Item href="/dashboard/comptes" label="Comptes" />
          <Item href="/dashboard/classement" label="Classement" />
        </div>

        <Section title="Outils" />
        <div className="space-y-1">
          <Item href="/dashboard/tradingview" label="TradingView" />
          <Item href="/dashboard/calendrier" label="Calendrier économique" />
          <Item href="/dashboard/journal" label="Journal de trading" />
          <Item href="/dashboard/simulateur" label="Simulateur de risque" badge="BETA" />
        </div>

        <Section title="Terminal" />
        <div className="space-y-1">
          <Item href="/dashboard/copieur" label="Copieur de positions" badge="BETA" />
          <Item href="/dashboard/terminal" label="Terminal de trading" badge="BETA" />
        </div>

        <Section title="Support" />
        <div className="space-y-1">
          <Item href="/dashboard/abonnement" label="Abonnement" />
          <Item href="/dashboard/rapports" label="Rapports" />
          <Item href="/dashboard/bug" label="Reporter un bug" />
          <Item href="/dashboard/contact" label="Nous contacter" />
        </div>
      </nav>
    </aside>
  );
}
