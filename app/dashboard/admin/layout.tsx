"use client";

import React, { useMemo, useState } from "react";
import AdminTopTabs from "../../../components/admin/AdminTopTabs";
import AdminCodeModal from "../../../components/admin/AdminCodeModal";
import { useAdminSession } from "../../../lib/adminClient";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = useAdminSession();
  const [openCode, setOpenCode] = useState(false);

  const subtitle = useMemo(() => {
    return isAdmin ? "vue globale — session admin active" : "vue globale";
  }, [isAdmin]);

  return (
    <div className="min-h-[calc(100vh-64px)] px-6 py-6">
      <div className="w-full max-w-[1600px] mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-3xl font-bold" style={{ color: "var(--text)" }}>
              Admin — Overview
            </div>
            <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              InvestPro (local) — {subtitle}
            </div>
          </div>

          {!isAdmin ? (
            <button
              onClick={() => setOpenCode(true)}
              className="rounded-xl px-4 py-2 border"
              style={{
                borderColor: "rgba(255,255,255,.08)",
                background: "rgba(255,255,255,.04)",
                color: "var(--text)",
              }}
            >
              Activer admin
            </button>
          ) : (
            <div
              className="rounded-xl px-3 py-2 border text-sm"
              style={{
                borderColor: "rgba(255,255,255,.08)",
                background: "rgba(255,255,255,.04)",
                color: "var(--muted)",
              }}
            >
              ✅ Session admin locale active
            </div>
          )}
        </div>

        <div className="mt-4">
          <AdminTopTabs />
        </div>

        <div className="mt-5">{children}</div>
      </div>

      <AdminCodeModal open={openCode} onClose={() => setOpenCode(false)} />
    </div>
  );
}
