"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Overview", href: "/dashboard/admin" },
  { label: "Finance", href: "/dashboard/admin/finance" },
  { label: "Utilisateurs", href: "/dashboard/admin/users" },
  { label: "Modération", href: "/dashboard/admin/moderation" },
  { label: "Inbox", href: "/dashboard/admin/inbox" },
  { label: "Système", href: "/dashboard/admin/system" },
];

type AdminTopTabsProps = {
  onRevoke?: () => void;
};

export default function AdminTopTabs({
  onRevoke,
}: AdminTopTabsProps) {
  const pathname = usePathname();

  function handleRefresh() {
    if (onRevoke) {
      onRevoke();
      return;
    }

    window.location.reload();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tabs.map((t) => {
        const active = pathname === t.href;

        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-4 py-2 rounded-xl border text-sm"
            style={{
              borderColor: "rgba(255,255,255,.08)",
              background: active
                ? "rgba(212,175,55,.16)"
                : "rgba(255,255,255,.03)",
              color: active ? "var(--gold)" : "var(--text)",
            }}
          >
            {t.label}
          </Link>
        );
      })}

      <div className="flex-1" />

      <button
        type="button"
        onClick={handleRefresh}
        className="px-4 py-2 rounded-xl border text-sm"
        style={{
          borderColor: "rgba(212,175,55,.25)",
          background: "rgba(212,175,55,.12)",
          color: "var(--gold)",
        }}
      >
        Rafraîchir
      </button>
    </div>
  );
}