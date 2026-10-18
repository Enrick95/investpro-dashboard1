"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { adminToolPreviewHref, parseCurrentAdminPath } from "@/app/admin-preview/admin-tool-access";

function LegacyAdminRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams();
  useEffect(() => {
    const target = parseCurrentAdminPath(pathname + "?" + query.toString()) || { tool: "overview-current" as const };
    router.replace(adminToolPreviewHref(target.tool, target.memberId, "/dashboard/admin", target.vipView));
  }, [pathname, query, router]);
  return <div role="status" style={{ minHeight: "100dvh", padding: 32, background: "#080908", color: "#b0b1a6" }}>InvestPro · Administration…</div>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/dashboard/admin") return children;
  // Legacy children remain unmounted; the selected workspace tool performs its own server-verified permission check.
  return <Suspense fallback={null}><LegacyAdminRedirect /></Suspense>;
}
