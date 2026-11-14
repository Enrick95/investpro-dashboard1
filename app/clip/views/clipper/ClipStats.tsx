"use client";

import { useEffect, useRef } from "react";

export type ClipStatsCapture = { id: string; url: string; when: string };
export type ClipStatsVals = {
  title: string;
  meta: string;
  /** Où trouver ses statistiques sur le réseau du clip. */
  hint: string;
  /** Vues et interactions relevées toutes seules sur la page du clip (TikTok). */
  auto: string | null;
  captures: ClipStatsCapture[];
  max: number;
  busy: boolean;
  error: string | null;
  /** Aperçu admin : on montre les captures sans pouvoir en ajouter. */
  readOnly: boolean;
  onPick: (file: File) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
};

/** Feuille « Stats de ton clip » : captures de ses statistiques (vues, rétention, temps de visionnage…). */
export function ClipStatsSheet({ v }: { v: ClipStatsVals }) {
  const input = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onClose = useRef(v.onClose);
  const full = v.captures.length >= v.max;

  useEffect(() => {
    onClose.current = v.onClose;
  });

  // À l'ouverture seulement : le focus va sur « Fermer », Échap ferme la feuille.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{ position: "fixed", inset: "0", zIndex: 70, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "12px 12px calc(12px + env(safe-area-inset-bottom))" }}>
      <button type="button" aria-label="Fermer" onClick={v.onClose} style={{ position: "absolute", inset: "0", border: "0", background: "rgba(5,6,5,0.78)", cursor: "pointer" }} />
      <section role="dialog" aria-modal="true" aria-labelledby="t-stats" style={{ position: "relative", width: "100%", maxWidth: "460px", maxHeight: "calc(100dvh - 24px)", overflowY: "auto", padding: "18px 18px 16px", borderRadius: "24px", border: "1px solid rgba(240,197,117,0.3)", background: "#0f110e", color: "#F3EFE6", display: "flex", flexDirection: "column", gap: "14px", boxShadow: "0 28px 80px rgba(0,0,0,0.7)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
            <h2 id="t-stats" style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "19px", letterSpacing: "-0.02em" }}>Stats de ton clip</h2>
            <span style={{ fontSize: "12.5px", color: "#A8ADA3", overflowWrap: "anywhere" }}>{v.title} · {v.meta}</span>
          </span>
          <button ref={closeRef} type="button" onClick={v.onClose} aria-label="Fermer" style={{ flexShrink: "0", width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#A8ADA3", cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
          </button>
        </div>
        <p style={{ margin: "0", fontSize: "13px", lineHeight: "1.55", color: "#C4C8BD" }}>
          {v.readOnly ? "Les captures des statistiques envoyées par le clippeur." : "Ajoute une capture des statistiques de ta vidéo : vues, temps de visionnage, rétention, partages… Enrick les regarde avant de valider ton clip."}
        </p>
        {v.auto ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "10px 12px", borderRadius: "12px", background: "rgba(145,214,208,0.07)", border: "1px solid rgba(145,214,208,0.25)", fontSize: "12.5px", lineHeight: "1.5" }}>
            <span style={{ fontWeight: "800", color: "#91D6D0" }}>Relevé tout seul sur TikTok</span>
            <span style={{ color: "#C4C8BD" }}>{v.auto}</span>
          </div>
        ) : null}
        {v.captures.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
            {v.captures.map((capture, index) => (
              <div key={capture.id} style={{ position: "relative" }}>
                <a href={capture.url} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir la capture ${index + 1} (${capture.when})`} style={{ display: "block", aspectRatio: "9 / 16", borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", background: "#181c16" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={capture.url} alt={`Capture des stats ${index + 1}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </a>
                <span style={{ display: "block", marginTop: "4px", fontSize: "11px", color: "#A8ADA3" }}>{capture.when}</span>
                {v.readOnly ? null : (
                  <button type="button" disabled={v.busy} onClick={() => v.onRemove(capture.id)} aria-label={`Retirer la capture ${index + 1}`} style={{ position: "absolute", top: "6px", right: "6px", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", border: "0", background: "rgba(11,13,11,0.82)", color: "#F3EFE6", cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: "18px 14px", borderRadius: "16px", border: "1px dashed rgba(255,255,255,0.16)", fontSize: "13px", color: "#A8ADA3", textAlign: "center" }}>
            {v.readOnly ? "Pas encore de capture pour ce clip." : `Pas encore de capture. ${v.hint}`}
          </div>
        )}
        {v.error ? <span role="alert" style={{ fontSize: "12.5px", color: "#FF6F91" }}>{v.error}</span> : null}
        {v.readOnly ? null : (
          <>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) v.onPick(file);
              }}
            />
            <button type="button" disabled={v.busy || full} onClick={() => input.current?.click()} style={{ width: "100%", minHeight: "50px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", borderRadius: "14px", border: "0", background: full ? "rgba(255,255,255,0.08)" : "#F0C575", color: full ? "#A8ADA3" : "#0b0d0b", fontSize: "14px", fontWeight: "800", cursor: v.busy || full ? "default" : "pointer" }}>
              {v.busy ? "Envoi…" : full ? `${v.max} captures maximum` : (
                <>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  Ajouter une capture
                </>
              )}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
