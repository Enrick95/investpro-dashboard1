"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Overview", href: "/dashboard/admin", enabled: true },
  { label: "Serveurs MT4 / MT5", href: "/dashboard/admin/serveurs", enabled: true },
  { label: "Finance", href: "#", enabled: false },
  { label: "Utilisateurs", href: "/dashboard/admin/utilisateurs", enabled: true },
  { label: "Modération", href: "#", enabled: false },
  { label: "Inbox", href: "#", enabled: false },
  { label: "Système", href: "#", enabled: false },
];

export default function AdminTopTabs({
  onRevoke,
}: {
  onRevoke?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active =
          tab.enabled &&
          (pathname === tab.href ||
            (tab.href !== "/dashboard/admin" && pathname.startsWith(tab.href)));

        if (!tab.enabled) {
          return (
            <button
              key={tab.label}
              type="button"
              disabled
              title="Bientôt disponible"
              className="rounded-xl border px-4 py-2 text-sm opacity-45 cursor-not-allowed"
              style={{
                borderColor: "rgba(255,255,255,.08)",
                background: "rgba(255,255,255,.025)",
                color: "var(--muted)",
              }}
            >
              {tab.label}
            </button>
          );
        }

        return (
          <Link
            key={tab.label}
            href={tab.href}
            className="rounded-xl border px-4 py-2 text-sm font-medium no-underline transition"
            style={{
              borderColor: active
                ? "var(--gold-border)"
                : "rgba(255,255,255,.08)",
              background: active
                ? "var(--gold-soft)"
                : "rgba(255,255,255,.025)",
              color: active ? "var(--gold)" : "var(--text)",
            }}
          >
            {tab.label}
          </Link>
        );
      })}

      {onRevoke ? (
        <button
          type="button"
          onClick={onRevoke}
          className="ml-auto rounded-xl border px-4 py-2 text-sm"
          style={{
            borderColor: "rgba(255,255,255,.08)",
            background: "rgba(255,255,255,.025)",
            color: "var(--muted)",
          }}
        >
          Quitter admin
        </button>
      ) : null}
    </div>
  );
}
