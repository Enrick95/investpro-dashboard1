"use client";

import type { MouseEvent, ReactNode } from "react";
import "../../clip.module.css";

export type ClipperTab = "home" | "campaigns" | "submit" | "clips" | "payments" | "profile" | "charter";

/** Lien interne : garde l'aspect d'un lien de la maquette, sans recharger la page. */
export function go(action: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    action();
  };
}

const TABS: { key: ClipperTab; label: string; hash: string; icon: ReactNode }[] = [
  { key: "home", label: "Accueil", hash: "#accueil", icon: <path d="M4 10.5l8-6.5 8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z" /> },
  { key: "campaigns", label: "Campagnes", hash: "#campagnes", icon: <><path d="M5.5 21V4" /><path d="M5.5 4.5h11.5l-2.2 4.25L17 13H5.5" /></> },
  { key: "submit", label: "Soumettre", hash: "#soumettre", icon: null },
  { key: "clips", label: "Clips", hash: "#clips", icon: <><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M10 9.2v5.6l4.8-2.8z" /></> },
  { key: "payments", label: "Paiements", hash: "#paiements", icon: <><path d="M17.5 7.5V6a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 6.5" /><rect x="3" y="7.5" width="18" height="12.5" rx="2.5" /><circle cx="16.5" cy="13.75" r="1" /></> },
];

export function ClipperShell({ initials, active, onTab, bellDot, onBell, children }: {
  initials: string;
  active: ClipperTab;
  onTab: (tab: ClipperTab) => void;
  bellDot: boolean;
  onBell: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ minHeight: "100dvh", background: "#0b0d0b" }}>
      <div style={{ width: "100%", maxWidth: "480px", minHeight: "100dvh", margin: "0 auto", display: "flex", flexDirection: "column", background: "#0b0d0b", color: "#F3EFE6", fontFamily: "Manrope, system-ui, sans-serif", fontSize: "14px", lineHeight: "1.45" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "10px 10px 6px 16px" }}>
          <a href="#accueil" onClick={go(() => onTab("home"))} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#F3EFE6", textDecoration: "none" }}>
            <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true">
              <rect x="1" y="1" width="28" height="28" rx="9" fill="none" stroke="#F0C575" strokeWidth="1.6" />
              <path d="M12.5 9.5v11l8.5-5.5z" fill="#F0C575" />
            </svg>
            <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "600", fontSize: "14px", letterSpacing: "-0.02em" }}>InvestPro</span>
            <span style={{ fontSize: "10px", fontWeight: "800", letterSpacing: "0.08em", color: "#0b0d0b", background: "#F0C575", padding: "3px 6px", borderRadius: "999px" }}>CLIP</span>
          </a>
          <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <button type="button" onClick={onBell} aria-label={bellDot ? "Notifications, nouveau message sur tes clips" : "Notifications"} style={{ position: "relative", width: "44px", height: "44px", borderRadius: "50%", border: "0", background: "transparent", color: "#C4C8BD", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
                <path d="M10 20.5a2 2 0 0 0 4 0" />
              </svg>
              {bellDot ? <span aria-hidden="true" style={{ position: "absolute", top: "10px", right: "11px", width: "8px", height: "8px", borderRadius: "50%", background: "#F0C575", boxShadow: "0 0 0 2px #0b0d0b" }} /> : null}
            </button>
            <a href="#profil" onClick={go(() => onTab("profile"))} aria-label="Mon profil" aria-current={active === "profile" ? "page" : undefined} style={{ width: "44px", height: "44px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(240,197,117,0.4)", background: active === "profile" ? "#F0C575" : "rgba(240,197,117,0.14)", color: active === "profile" ? "#0b0d0b" : "#F0C575", fontSize: "13px", fontWeight: "800", textDecoration: "none" }}>{initials}</a>
          </span>
        </header>
        <main style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "6px 16px 24px" }}>{children}</main>
        <nav aria-label="Navigation" style={{ position: "sticky", bottom: "0", zIndex: 5, marginTop: "auto", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", alignItems: "end", padding: "6px 6px calc(14px + env(safe-area-inset-bottom))", borderTop: "1px solid rgba(255,255,255,0.08)", background: "#0e100d" }}>
          {TABS.map((tab) => {
            const on = active === tab.key;
            return (
              <a key={tab.key} href={tab.hash} onClick={go(() => onTab(tab.key))} aria-current={on ? "page" : undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", minHeight: "56px", color: on ? "#F0C575" : "#A8ADA3", fontSize: "11px", fontWeight: "700", textDecoration: "none" }}>
                {tab.key === "submit" ? (
                  <span aria-hidden="true" style={{ width: "48px", height: "48px", marginTop: "-20px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", background: "#F0C575", color: "#0b0d0b", boxShadow: "0 0 0 4px #0e100d" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tab.icon}</svg>
                )}
                {tab.label}
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
