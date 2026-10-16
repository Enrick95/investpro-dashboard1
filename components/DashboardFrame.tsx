"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import InvestProHelpCenter from "@/components/InvestProHelpCenter";
import Breadcrumb from "@/components/aura/Breadcrumb";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ToastHub from "@/components/ToastHub";
import Mt5Notifs from "@/components/Mt5Notifs";
import InvestProCommandPalette from "@/components/ux/InvestProCommandPalette";
import InvestProGlobalUX from "@/components/ux/InvestProGlobalUX";
import NavigationVisibilityGuard from "@/components/NavigationVisibilityGuard";

export default function DashboardFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname === "/dashboard/admin" || pathname.startsWith("/dashboard/admin/");
  const shared = <><ToastHub /><Mt5Notifs /><InvestProGlobalUX /><InvestProCommandPalette /><InvestProHelpCenter /></>;
  if (isAdmin) return <>{shared}{children}</>;
  return <div className="aura-app"><Sidebar /><div className="aura-main"><div className="aura-topbar"><Breadcrumb /><Header /></div>{shared}<main className="aura-content"><div className="aura-content-inner"><NavigationVisibilityGuard>{children}</NavigationVisibilityGuard></div></main></div></div>;
}
