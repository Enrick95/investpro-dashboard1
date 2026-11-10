"use client";

import type { ReactNode } from "react";
import { go } from "./Shell";

export type ClipChipState = "review" | "counting" | "frozen" | "paid" | "rejected";
export type ClipItem = { id: string; title: string; meta: string; state: ClipChipState; note: string; views: string; money: string; url: string };
export type ClipsVals = {
  subline: string;
  chips: { key: string; label: string; on: boolean; pick: () => void }[];
  clips: ClipItem[];
  more: { label: string; show: () => void } | null;
  emptyLabel: string;
};

const CHIP: Record<ClipChipState, { label: string; bg: string; color: string; icon: ReactNode; stroke: string }> = {
  review: { label: "En revue", bg: "rgba(255,255,255,0.07)", color: "#C4C8BD", stroke: "2.4", icon: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></> },
  counting: { label: "Vues en cours", bg: "rgba(242,180,90,0.12)", color: "#F2B45A", stroke: "2.4", icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> },
  frozen: { label: "Figé", bg: "rgba(145,214,208,0.12)", color: "#91D6D0", stroke: "2.6", icon: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  paid: { label: "Payé", bg: "rgba(240,197,117,0.14)", color: "#F0C575", stroke: "2.6", icon: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  rejected: { label: "Refusé", bg: "rgba(255,111,145,0.12)", color: "#FF6F91", stroke: "2.6", icon: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /> },
};

export function ClipperClips({ v }: { v: ClipsVals }) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <h1 style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "24px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>Mes clips</h1>
        <span style={{ fontSize: "13px", color: "#A8ADA3" }}>{v.subline}</span>
      </div>
      <div role="group" aria-label="Filtrer mes clips" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {v.chips.map((chip) => (
          <button key={chip.key} type="button" aria-pressed={chip.on} onClick={chip.pick} style={chip.on
            ? { minHeight: "44px", padding: "0 13px", borderRadius: "999px", border: "0", background: "#F3EFE6", color: "#0b0d0b", fontSize: "13px", fontWeight: "800" }
            : { minHeight: "44px", padding: "0 13px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#C4C8BD", fontSize: "13px", fontWeight: "700" }}>{chip.label}</button>
        ))}
      </div>
      <section aria-label="Liste des clips" style={{ display: "flex", flexDirection: "column" }}>
        {v.clips.map((clip) => {
          const chip = CHIP[clip.state];
          return (
            <div key={clip.id} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <a href={clip.url} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir le clip ${clip.title}`} style={{ flexShrink: "0", width: "44px", height: "62px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "#181c16", border: "1px solid rgba(255,255,255,0.1)", color: "#F0C575" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                  <path d="M8 5.5v13l10.5-6.5z" />
                </svg>
              </a>
              <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                <span style={{ fontWeight: "700", lineHeight: "1.35" }}>{clip.title}</span>
                <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{clip.meta}</span>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 8px", borderRadius: "999px", background: chip.bg, color: chip.color, fontSize: "11.5px", fontWeight: "700" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={chip.stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{chip.icon}</svg>{chip.label}</span>
                  {clip.note ? <span style={{ fontSize: "12px", color: clip.state === "rejected" ? "#FF6F91" : "#A8ADA3" }}>{clip.note}</span> : null}
                </span>
              </span>
              <span style={{ flexShrink: "0", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", textAlign: "right" }}>
                <span style={{ fontSize: "13px", fontWeight: "800" }}>{clip.views}</span>
                <span style={{ fontSize: "11.5px", color: "#A8ADA3" }}>{clip.money}</span>
              </span>
            </div>
          );
        })}
        {v.more ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", minHeight: "52px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>
            <span>{v.more.label}</span>
            <a href="#" onClick={go(v.more.show)} style={{ display: "flex", alignItems: "center", minHeight: "44px", fontWeight: "800", textDecoration: "none" }}>Afficher</a>
          </div>
        ) : null}
        {!v.clips.length ? (
          <div style={{ padding: "24px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3", textAlign: "center" }}>{v.emptyLabel}</div>
        ) : null}
      </section>
    </>
  );
}
