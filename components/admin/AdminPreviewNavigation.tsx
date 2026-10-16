"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

type AdminPreviewNavigation = {
  onNavigate: (path: string) => void;
  memberId?: string;
  vipView?: "members" | "requests" | "subscriptions" | "affiliation" | "settings";
};

const AdminPreviewNavigationContext = createContext<AdminPreviewNavigation | null>(null);

export function AdminPreviewNavigationProvider({
  onNavigate,
  memberId,
  vipView,
  children,
}: AdminPreviewNavigation & { children: ReactNode }) {
  const value = useMemo(() => ({ onNavigate, memberId, vipView }), [onNavigate, memberId, vipView]);

  return (
    <AdminPreviewNavigationContext.Provider value={value}>
      {children}
    </AdminPreviewNavigationContext.Provider>
  );
}

export function useAdminPreviewNavigation() {
  return useContext(AdminPreviewNavigationContext);
}
