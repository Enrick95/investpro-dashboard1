"use client";

import React from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";

const tabs = [
  { key: "overview", label: "Overview", href: "/dashboard/admin" },
  { key: "finance", label: "Finance", href: "/dashboard/admin/finance" },
  { key: "users", label: "Utilisateurs", href: "/dashboard/admin/users" },
  { key: "moderation", label: "Modération", href: "/dashboard/admin/moderation" },
  { key: "inbox", label: "Inbox", href: "/dashboard/admin/inbox" },
  { key: "system", label: "Système", href: "/dashboard/admin/system" },
] as const;

export default function AdminTabs({ active }: { active: (typeof tabs)[number]["key"] }) {
 const { t: tr } = useLocale();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => (window.location.href = t.href)}
          className={[
            "h-10 px-4 rounded-2xl border text-sm font-semibold transition",
            t.key === active
              ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
              : "border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--muted)] hover:bg-[color:var(--panel-2)]",
          ].join(" ")}
          type="button"
        >
          {tr(t.label)}
        </button>
      ))}
    </div>
  );
}
