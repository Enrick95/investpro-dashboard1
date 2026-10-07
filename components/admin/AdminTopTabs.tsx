"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Overview", href: "/dashboard/admin" },
  { label: "Finance", href: "/dashboard/admin/finance" },
  { label: "Utilisateurs", href: "/dashboard/admin/utilisateurs" },
  { label: "Modération", href: "/dashboard/admin/moderation" },
  { label: "Inbox", href: "/dashboard/admin/inbox" },
  { label: "Serveurs MT4 / MT5", href: "/dashboard/admin/serveurs" },
  { label: "Système", href: "/dashboard/admin/systeme" },
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
          pathname === tab.href ||
          (tab.href !== "/dashboard/admin" && pathname.startsWith(tab.href));

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
