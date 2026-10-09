"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const tabs = [
  { label: "Overview", href: "/dashboard/admin" },
  { label: "Finance", href: "/dashboard/admin/finance" },
  { label: "Utilisateurs", href: "/dashboard/admin/utilisateurs" },
  { label: "Modération", href: "/dashboard/admin/moderation" },
  { label: "Inbox", href: "/dashboard/admin/inbox" },
  { label: "InvestPro Copier", href: "/dashboard/admin/copieur" },
  { label: "Système", href: "/dashboard/admin/systeme" },
  { label: "Navigation", href: "/dashboard/admin/navigation" },
  { label: "Équipe", href: "/dashboard/admin/staff" },
];

export default function AdminTopTabs({
  onRevoke, permissions,
}: {
  onRevoke?: () => void; permissions?: string[];
}) {
  const pathname = usePathname();
  const tabsAllowed = tabs.filter(t=>!permissions||permissions.includes(({Overview:"overview",Finance:"finance",Utilisateurs:"users",Modération:"moderation",Inbox:"inbox","InvestPro Copier":"copier",Système:"system",Navigation:"navigation",Équipe:"staff"} as Record<string,string>)[t.label]));
  const supabase = useMemo(() => createClient(), []);
  const [inboxCount, setInboxCount] = useState(0);
  const [copierCount, setCopierCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refreshInboxCount() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token || cancelled) return;

        const response = await fetch("/api/admin/inbox", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = await response.json();
        const count =
          Number(data?.stats?.open_support || 0) +
          Number(data?.stats?.open_bugs || 0) +
          Number(data?.stats?.pending_deletions || 0);

        if (!cancelled) {
          setInboxCount(count);
        }

        const copierResponse = await fetch("/api/admin/copier-requests", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        let copierPending = 0;
        if (copierResponse.ok) {
          const copierData = await copierResponse.json();
          copierPending += Number(copierData?.pending_count || 0);
        }

        const configResponse = await fetch("/api/admin/copier-config-requests", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });
        if (configResponse.ok) {
          const configData = await configResponse.json();
          copierPending += Number(configData?.pending_count || 0);
        }

        if (!cancelled) setCopierCount(copierPending);
      } catch {
        // Le badge ne doit jamais bloquer le back-office.
      }
    }

    void refreshInboxCount();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshInboxCount();
      }
    }, 20_000);

    const onFocus = () => {
      void refreshInboxCount();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [supabase]);

  return (
    <div className="flex flex-wrap gap-2">
      {tabsAllowed.map((tab) => {
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
            <span className="inline-flex items-center gap-2">
              {tab.label}
              {tab.label === "Inbox" && inboxCount > 0 ? (
                <span
                  className="inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                  style={{
                    background: "var(--gold)",
                    color: "#090909",
                  }}
                >
                  {inboxCount > 99 ? "99+" : inboxCount}
                </span>
              ) : null}
              {tab.label === "InvestPro Copier" && copierCount > 0 ? (
                <span
                  className="inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                  style={{
                    background: "var(--gold)",
                    color: "#090909",
                  }}
                >
                  {copierCount > 99 ? "99+" : copierCount}
                </span>
              ) : null}
            </span>
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
