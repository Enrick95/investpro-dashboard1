"use client";

import { go } from "./Shell";

export type PayStep = { title: string; sub: string; state: "done" | "current" | "todo" };
export type PayHistory = { id: string; title: string; sub: string; amount: string };
export type PaymentsVals = {
  cycleChip: string;
  acquired: string;
  pendingText: string | null;
  pendingUntil: string;
  payDateLong: string;
  methodLine: string;
  methodMissing: boolean;
  calc: { label: string; value: string }[];
  total: string;
  scale: string;
  steps: PayStep[];
  history: PayHistory[];
  onProfile: () => void;
};

export function ClipperPayments({ v }: { v: PaymentsVals }) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <h1 style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "24px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>Paiements</h1>
        <span style={{ fontSize: "13px", color: "#A8ADA3" }}>Versements le 1er et le 16 de chaque mois</span>
      </div>
      <section aria-labelledby="t-prochain" style={{ padding: "20px", borderRadius: "22px", background: "#15170f", border: "1px solid rgba(240,197,117,0.45)", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <h2 id="t-prochain" style={{ margin: "0", fontSize: "13px", fontWeight: "700", color: "#C4C8BD" }}>Prochain versement</h2>
          <span style={{ padding: "4px 9px", borderRadius: "999px", background: "rgba(255,255,255,0.07)", color: "#C4C8BD", fontSize: "12px", fontWeight: "700" }}>{v.cycleChip}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "40px", letterSpacing: "-0.03em", lineHeight: "1.1", color: "#F0C575" }}>{v.acquired}</span>
          <span style={{ fontSize: "13.5px", color: "#C4C8BD" }}>acquis{v.pendingText ? <> · <span style={{ fontWeight: "700", color: "#F2B45A" }}>{v.pendingText}</span> {v.pendingUntil}</> : null}</span>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "700" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </svg>{v.payDateLong}</span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "12px", borderTop: "1px solid rgba(240,197,117,0.2)" }}>
          <span style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
            <span style={{ fontSize: "12px", color: "#A8ADA3" }}>Versé sur</span>
            <span style={{ fontWeight: "700", color: v.methodMissing ? "#F2B45A" : "#F3EFE6", overflowWrap: "anywhere" }}>{v.methodLine}</span>
          </span>
          <a href="#profil" onClick={go(v.onProfile)} style={{ display: "flex", alignItems: "center", minHeight: "44px", fontSize: "13px", fontWeight: "800", textDecoration: "none", flexShrink: "0" }}>{v.methodMissing ? "Choisir" : "Modifier"}</a>
        </div>
      </section>
      <section aria-labelledby="t-calcul" style={{ padding: "16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "10px" }}>
        <h2 id="t-calcul" style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Le calcul</h2>
        {v.calc.map((line) => (
          <div key={line.label} style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "13.5px" }}>
            <span style={{ color: "#C4C8BD" }}>{line.label}</span>
            <span style={{ fontWeight: "700" }}>{line.value}</span>
          </div>
        ))}
        <div style={{ height: "1px", background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "14px" }}>
          <span style={{ fontWeight: "800" }}>Acquis à ce jour</span>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", color: "#F0C575" }}>{v.total}</span>
        </div>
        <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{v.scale}</span>
      </section>
      <section aria-labelledby="t-etapes" style={{ padding: "16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h2 id="t-etapes" style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Comment ça se passe</h2>
        <div style={{ position: "relative" }}>
          <span aria-hidden="true" style={{ position: "absolute", left: "11px", top: "14px", bottom: "14px", width: "2px", background: "rgba(255,255,255,0.1)" }} />
          <ol style={{ position: "relative", margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }}>
            {v.steps.map((step) => (
              <li key={step.title} style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: "12px", minHeight: "52px" }}>
                {step.state === "done" ? (
                  <span aria-hidden="true" style={{ flexShrink: "0", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "#91D6D0", color: "#0b0d0b" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                ) : step.state === "current" ? (
                  <span aria-hidden="true" style={{ flexShrink: "0", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "#121511", border: "2px solid #F0C575" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F0C575" }} />
                  </span>
                ) : (
                  <span aria-hidden="true" style={{ flexShrink: "0", width: "24px", height: "24px", borderRadius: "50%", background: "#121511", border: "2px solid rgba(255,255,255,0.25)" }} />
                )}
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: "700", color: step.state === "current" ? "#F0C575" : "#F3EFE6" }}>{step.title}</span>
                  <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{step.sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section aria-labelledby="t-histo" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", minHeight: "44px" }}>
          <h2 id="t-histo" style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "16px", letterSpacing: "-0.01em" }}>Historique</h2>
        </div>
        {v.history.map((row) => (
          <div key={row.id} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "64px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: "700" }}>{row.title}</span>
              <span style={{ fontSize: "12.5px", color: "#A8ADA3", overflowWrap: "anywhere" }}>{row.sub}</span>
            </span>
            <span style={{ fontWeight: "800" }}>{row.amount}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 9px", borderRadius: "999px", background: "rgba(145,214,208,0.12)", color: "#91D6D0", fontSize: "12px", fontWeight: "700" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>Payé</span>
          </div>
        ))}
        {!v.history.length ? <div style={{ padding: "16px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>Ton premier versement apparaîtra ici, avec sa preuve.</div> : null}
      </section>
    </>
  );
}
