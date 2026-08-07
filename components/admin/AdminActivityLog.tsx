"use client";

import React, { useMemo } from "react";
import { useAdminAudit } from "../../lib/adminClient";

export default function AdminActivityLog() {
  const logs = useAdminAudit();

  const items = useMemo(() => logs.slice(0, 8), [logs]);

  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)" }}
    >
      <div className="font-semibold" style={{ color: "var(--text)" }}>
        Logs admin / modération
      </div>
      <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        Dernières actions (local)
      </div>

      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            — Aucun log pour l’instant
          </div>
        ) : (
          items.map((l) => (
            <div
              key={l.id}
              className="rounded-xl border px-3 py-2 text-sm flex items-center justify-between gap-3"
              style={{ borderColor: "rgba(255,255,255,.08)", background: "rgba(0,0,0,.18)" }}
            >
              <div>
                <div style={{ color: "var(--text)" }}>
                  <span style={{ color: "var(--gold)" }}>{l.by}</span> • {l.action}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  {new Date(l.at).toLocaleString("fr-FR")}
                </div>
              </div>

              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {l.meta?.message ? `“${l.meta.message}”` : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
