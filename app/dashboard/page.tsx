"use client";

import { useEffect } from "react";

export default function DashboardIndex() {
  useEffect(() => {
    window.location.href = "/dashboard/comptes";
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-[color:var(--muted)]">Redirection…</div>
    </div>
  );
}
