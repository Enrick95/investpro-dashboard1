"use client";

import React from "react";

export default function HoverTooltip(props: {
  show: boolean;
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string }[];
}) {
  if (!props.show) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: props.x,
        top: props.y,
        zIndex: 999999,
        pointerEvents: "none",
        transform: "translate(12px, 12px)",
        maxWidth: 260,
      }}
      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] shadow-2xl overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-[color:var(--border)]">
        <div className="text-sm font-semibold text-[color:var(--text)]">
          {props.title}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {props.rows.map((r, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <div className="text-xs text-[color:var(--muted)]">{r.label}</div>
            <div className="text-xs font-semibold text-[color:var(--gold)]">
              {r.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
