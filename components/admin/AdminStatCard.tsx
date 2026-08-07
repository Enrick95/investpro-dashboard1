"use client";

import React from "react";

export default function AdminStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl border px-5 py-4"
      style={{
        borderColor: "rgba(255,255,255,.08)",
        background: "rgba(255,255,255,.03)",
      }}
    >
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}
