"use client";

import type { ReactNode } from "react";
import "../../clip.module.css";
import { go } from "./kit";

export type AdminSection = "overview" | "clippers" | "accounts" | "review" | "videos" | "campaigns" | "candidates" | "payments" | "whatsapp" | "rules" | "settings";

const ICONS: Record<AdminSection, ReactNode> = {
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.8" /></>,
  clippers: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18.4 14.9c1.6.8 2.6 2.4 3.1 5.1" /></>,
  accounts: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>,
  review: <><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M10 9.2v5.6l4.8-2.8z" /></>,
  videos: <><path d="M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15V6a1.5 1.5 0 0 1 1.5-1.5z" /><path d="M8 20.5h8" /><path d="M12 9v4M10 11h4" /></>,
  campaigns: <><path d="M5.5 21V4" /><path d="M5.5 4.5h11.5l-2.2 4.25L17 13H5.5" /></>,
  candidates: <><path d="M3 13.5l2.4-6.7A2.5 2.5 0 0 1 7.8 5h8.4a2.5 2.5 0 0 1 2.4 1.8l2.4 6.7" /><path d="M3 13.5V17a2.5 2.5 0 0 0 2.5 2.5h13A2.5 2.5 0 0 0 21 17v-3.5h-5l-1.5 2.5h-5L8 13.5z" /></>,
  payments: <><path d="M17.5 7.5V6a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 6.5" /><rect x="3" y="7.5" width="18" height="12.5" rx="2.5" /><circle cx="16.5" cy="13.75" r="1" /></>,
  whatsapp: <path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.5-4.3a8.4 8.4 0 1 1 15.5-4.6z" />,
  rules: <><path d="M14 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9z" /><path d="M14 3.5V9h5.5" /><path d="M8.5 13h7M8.5 16.5h5" /></>,
  settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
};

const PILOT: { key: AdminSection; label: string }[] = [
  { key: "overview", label: "Vue d'ensemble" },
  { key: "clippers", label: "Clippeurs" },
  { key: "accounts", label: "Comptes" },
  { key: "review", label: "Clips à valider" },
  { key: "videos", label: "Vidéos" },
  { key: "campaigns", label: "Campagnes" },
  { key: "candidates", label: "Candidatures" },
  { key: "payments", label: "Paiements" },
  { key: "whatsapp", label: "WhatsApp" },
];
const SETTINGS: { key: AdminSection; label: string }[] = [
  { key: "rules", label: "Paiement et charte" },
  { key: "settings", label: "Réglages" },
];

export type NavCounts = { clippers: number; accounts: number; review: number; videos: number; campaigns: number; candidates: number };

const CSS = `
@media (max-width: 760px) {
  .ipc-nav { flex: 1 1 100% !important; min-width: 0 !important; max-width: 100%; padding: 12px !important; gap: 10px !important; border-right: 0 !important; border-bottom: 1px solid rgba(255,255,255,0.08) !important; }
  .ipc-nav-group { flex-direction: row !important; min-width: 0; overflow-x: auto; gap: 6px !important; padding-bottom: 2px; scrollbar-width: none; }
  .ipc-nav-group > .ipc-nav-title { display: none; }
  .ipc-nav-item { flex: 0 0 auto; white-space: nowrap; border: 1px solid rgba(255,255,255,0.08) !important; }
  .ipc-nav-share { display: none !important; }
  .ipc-main { padding: 20px 16px 48px !important; }
}`;

export function AdminShell({ active, onSection, counts, joinLabel, copied, onCopyJoin, onSignOut, gap = "24px", children }: {
  active: AdminSection;
  onSection: (section: AdminSection) => void;
  counts: NavCounts;
  joinLabel: string;
  copied: boolean;
  onCopyJoin: () => void;
  onSignOut: () => void;
  gap?: string;
  children: ReactNode;
}) {
  const item = (entry: { key: AdminSection; label: string }) => {
    const on = active === entry.key;
    const badge = entry.key === "review" ? counts.review : entry.key === "candidates" ? counts.candidates : 0;
    const count = entry.key === "clippers" ? counts.clippers : entry.key === "accounts" ? counts.accounts : entry.key === "videos" ? counts.videos : entry.key === "campaigns" ? counts.campaigns : null;
    return (
      <a key={entry.key} href={`#${entry.key}`} className="ipc-nav-item" onClick={go(() => onSection(entry.key))} aria-current={on ? "page" : undefined} style={on
        ? { display: "flex", alignItems: "center", gap: "12px", minHeight: "44px", padding: "0 12px", borderRadius: "12px", background: "rgba(240,197,117,0.12)", color: "#F0C575", fontWeight: "700", textDecoration: "none" }
        : { display: "flex", alignItems: "center", gap: "12px", minHeight: "44px", padding: "0 12px", borderRadius: "12px", color: "#C4C8BD", fontWeight: "600", textDecoration: "none" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[entry.key]}</svg>
        {entry.label}
        {badge ? <span style={{ marginLeft: "auto", minWidth: "22px", padding: "1px 7px", borderRadius: "999px", background: "#F0C575", color: "#0b0d0b", fontSize: "12px", fontWeight: "800", textAlign: "center" }}>{badge}</span> : null}
        {count !== null && !badge ? <span style={{ marginLeft: "auto", fontSize: "12px", color: "#A8ADA3" }}>{count}</span> : null}
      </a>
    );
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexWrap: "wrap", background: "#0b0d0b", color: "#F3EFE6", fontFamily: "Manrope, system-ui, sans-serif", fontSize: "14px", lineHeight: "1.45" }}>
      <style>{CSS}</style>
      <nav aria-label="Menu" className="ipc-nav" style={{ flex: "1 1 240px", padding: "26px 16px", display: "flex", flexDirection: "column", gap: "26px", background: "#0e100d", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
        <a href="#overview" onClick={go(() => onSection("overview"))} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 8px", textDecoration: "none", color: "#F3EFE6" }}>
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
            <rect x="1" y="1" width="28" height="28" rx="9" fill="none" stroke="#F0C575" strokeWidth="1.6" />
            <path d="M12.5 9.5v11l8.5-5.5z" fill="#F0C575" />
          </svg>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "600", fontSize: "15px", letterSpacing: "-0.02em" }}>InvestPro</span>
          <span style={{ fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.08em", color: "#0b0d0b", background: "#F0C575", padding: "3px 7px", borderRadius: "999px" }}>CLIP</span>
        </a>
        <div className="ipc-nav-group" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span className="ipc-nav-title" style={{ padding: "0 12px 8px", fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", color: "#8E938A" }}>PILOTAGE</span>
          {PILOT.map(item)}
        </div>
        <div className="ipc-nav-group" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span className="ipc-nav-title" style={{ padding: "0 12px 8px", fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", color: "#8E938A" }}>RÉGLAGES</span>
          {SETTINGS.map(item)}
          <button type="button" className="ipc-nav-item" onClick={onSignOut} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "44px", padding: "0 12px", borderRadius: "12px", border: "0", background: "transparent", color: "#A8ADA3", fontSize: "14px", fontWeight: "600", textAlign: "left" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" /><path d="M10 16.5L5.5 12 10 7.5" /><path d="M5.5 12H15" /></svg>
            Se déconnecter
          </button>
        </div>
        <div className="ipc-nav-share" style={{ marginTop: "auto", padding: "16px", borderRadius: "16px", background: "#121511", border: "1px solid rgba(240,197,117,0.18)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: "600", color: "#A8ADA3" }}>Lien d&apos;inscription clippeurs</span>
          <span style={{ fontSize: "13px", fontWeight: "700", wordBreak: "break-all" }}>{joinLabel}</span>
          <button type="button" onClick={onCopyJoin} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "44px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#F3EFE6", fontSize: "13px", fontWeight: "700" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
              <path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
            </svg>{copied ? "Lien copié" : "Copier le lien"}</button>
        </div>
      </nav>
      <main className="ipc-main" style={{ flex: "999 1 560px", minWidth: "0", padding: "32px 40px 56px", display: "flex", flexDirection: "column", gap }}>{children}</main>
    </div>
  );
}
