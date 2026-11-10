"use client";

import type { ChangeEvent } from "react";
import { go } from "./Shell";

export type SubmitCampaign = { id: string; title: string; note: string; selected: boolean };
export type SubmitVals = {
  link: string;
  onLink: (event: ChangeEvent<HTMLInputElement>) => void;
  day: string;
  maxDay: string;
  onDay: (event: ChangeEvent<HTMLInputElement>) => void;
  detected: { title: string; account: string; ok: boolean; views: string } | null;
  linkError: string | null;
  campaigns: SubmitCampaign[];
  pick: (id: string) => void;
  checks: { label: string; on: boolean; toggle: () => void }[];
  freezeNote: string;
  canSend: boolean;
  missing: string;
  busy: boolean;
  error: string | null;
  sent: boolean;
  send: () => void;
  again: () => void;
  onClips: () => void;
  onProfile: () => void;
  noAccounts: boolean;
};

const inputStyle = { width: "100%", minHeight: "50px", padding: "0 14px", borderRadius: "14px", border: "1px solid rgba(240,197,117,0.45)", background: "#121511", color: "#F3EFE6", fontFamily: "Manrope, system-ui, sans-serif", fontSize: "14px" } as const;

export function ClipperSubmit({ v }: { v: SubmitVals }) {
  if (v.sent) {
    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h1 style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "24px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>Soumettre un clip</h1>
          <span style={{ fontSize: "13px", color: "#A8ADA3" }}>Colle le lien de ta vidéo publiée.</span>
        </div>
        <div role="status" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px", borderRadius: "16px", background: "rgba(145,214,208,0.08)", border: "1px solid rgba(145,214,208,0.35)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "800", color: "#91D6D0" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>Clip envoyé</span>
          <span style={{ fontSize: "13px", color: "#C4C8BD" }}>Enrick te répond sous 24 h, ici et sur WhatsApp.</span>
          <span style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <a href="#clips" onClick={go(v.onClips)} style={{ display: "flex", alignItems: "center", minHeight: "44px", fontSize: "13px", fontWeight: "800", textDecoration: "none" }}>Voir mes clips</a>
            <a href="#soumettre" onClick={go(v.again)} style={{ display: "flex", alignItems: "center", minHeight: "44px", fontSize: "13px", fontWeight: "800", textDecoration: "none" }}>Soumettre un autre clip</a>
          </span>
        </div>
      </>
    );
  }
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <h1 style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "24px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>Soumettre un clip</h1>
        <span style={{ fontSize: "13px", color: "#A8ADA3" }}>Colle le lien de ta vidéo publiée, on reconnaît le réseau tout seul.</span>
      </div>
      {v.noAccounts ? (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", borderRadius: "16px", background: "rgba(242,180,90,0.08)", border: "1px solid rgba(242,180,90,0.35)" }}>
          <span style={{ flex: "1 1 auto", fontSize: "13px", color: "#C4C8BD" }}>Ajoute d&apos;abord le compte sur lequel tu publies, sinon le clip ne peut pas être validé.</span>
          <a href="#profil" onClick={go(v.onProfile)} style={{ flexShrink: "0", display: "flex", alignItems: "center", minHeight: "44px", padding: "0 14px", borderRadius: "12px", background: "#F0C575", color: "#0b0d0b", fontSize: "13px", fontWeight: "800", textDecoration: "none" }}>Ajouter</a>
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label htmlFor="lien-clip" style={{ fontSize: "13px", fontWeight: "700" }}>Lien du clip</label>
        <input id="lien-clip" type="url" inputMode="url" placeholder="https://www.tiktok.com/@ton.compte/video/…" value={v.link} onChange={v.onLink} style={inputStyle} />
        {v.linkError ? <span style={{ fontSize: "12.5px", color: "#F2B45A" }}>{v.linkError}</span> : null}
      </div>
      {v.detected ? (
        <section aria-label="Clip détecté" style={{ display: "flex", gap: "12px", padding: "14px", borderRadius: "18px", background: v.detected.ok ? "rgba(145,214,208,0.06)" : "rgba(242,180,90,0.06)", border: v.detected.ok ? "1px solid rgba(145,214,208,0.35)" : "1px solid rgba(242,180,90,0.35)" }}>
          <span aria-hidden="true" style={{ flexShrink: "0", width: "50px", height: "72px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "#181c16", border: "1px solid rgba(255,255,255,0.1)", color: "#F0C575" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </span>
          <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "800", color: v.detected.ok ? "#91D6D0" : "#F2B45A" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>Clip détecté</span>
            <span style={{ fontWeight: "700", overflowWrap: "anywhere" }}>{v.detected.title}</span>
            <span style={{ fontSize: "12.5px", color: v.detected.ok ? "#A8ADA3" : "#F2B45A" }}>{v.detected.account}</span>
            <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{v.detected.views}</span>
          </span>
        </section>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label htmlFor="date-clip" style={{ fontSize: "13px", fontWeight: "700" }}>Publié le</label>
        <input id="date-clip" type="date" max={v.maxDay} value={v.day} onChange={v.onDay} style={{ ...inputStyle, border: "1px solid rgba(255,255,255,0.14)", colorScheme: "dark" }} />
      </div>
      <fieldset style={{ margin: "0", padding: "0", border: "0", display: "flex", flexDirection: "column", gap: "8px" }}>
        <legend style={{ padding: "0", marginBottom: "8px", fontSize: "13px", fontWeight: "700" }}>Campagne</legend>
        {!v.campaigns.length ? <span style={{ fontSize: "13px", color: "#A8ADA3" }}>Aucune campagne ouverte pour l&apos;instant.</span> : null}
        {v.campaigns.map((campaign) => campaign.selected ? (
          <button key={campaign.id} type="button" aria-pressed="true" onClick={() => v.pick(campaign.id)} style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", minHeight: "62px", padding: "10px 14px", borderRadius: "16px", border: "1.5px solid #F0C575", background: "rgba(240,197,117,0.08)", color: "#F3EFE6", textAlign: "left" }}>
            <span aria-hidden="true" style={{ flexShrink: "0", width: "20px", height: "20px", borderRadius: "50%", border: "2px solid #F0C575", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#F0C575" }} />
            </span>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: "800", fontSize: "14px" }}>{campaign.title}</span>
              <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{campaign.note}</span>
            </span>
          </button>
        ) : (
          <button key={campaign.id} type="button" aria-pressed="false" onClick={() => v.pick(campaign.id)} style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", minHeight: "62px", padding: "10px 14px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.14)", background: "#121511", color: "#F3EFE6", textAlign: "left" }}>
            <span aria-hidden="true" style={{ flexShrink: "0", width: "20px", height: "20px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)" }} />
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: "800", fontSize: "14px" }}>{campaign.title}</span>
              <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{campaign.note}</span>
            </span>
          </button>
        ))}
      </fieldset>
      <section aria-labelledby="t-check" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <h2 id="t-check" style={{ margin: "0", fontSize: "13px", fontWeight: "700" }}>Avant d&apos;envoyer</h2>
        {v.checks.map((check) => (
          <button key={check.label} type="button" aria-pressed={check.on} onClick={check.toggle} style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", minHeight: "50px", padding: "8px 12px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.1)", background: "#121511", color: "#F3EFE6", fontSize: "13.5px", textAlign: "left" }}>
            {check.on ? (
              <span aria-hidden="true" style={{ flexShrink: "0", width: "22px", height: "22px", borderRadius: "7px", background: "#91D6D0", color: "#0b0d0b", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
            ) : (
              <span aria-hidden="true" style={{ flexShrink: "0", width: "22px", height: "22px", borderRadius: "7px", border: "1.5px solid rgba(255,255,255,0.3)" }} />
            )}
            {check.label}
          </button>
        ))}
      </section>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "14px", background: "#181c16", fontSize: "13px", color: "#C4C8BD" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F0C575" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: "0", marginTop: "2px" }}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
        <span>{v.freezeNote}</span>
      </div>
      {v.error ? <p role="alert" style={{ margin: "0", padding: "12px 14px", borderRadius: "14px", background: "rgba(255,111,145,0.08)", border: "1px solid rgba(255,111,145,0.3)", color: "#FF6F91", fontSize: "13px", fontWeight: "700" }}>{v.error}</p> : null}
      {v.canSend ? (
        <button type="button" onClick={v.send} disabled={v.busy} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", minHeight: "52px", borderRadius: "15px", border: "0", background: "#F0C575", color: "#0b0d0b", fontSize: "15px", fontWeight: "800", opacity: v.busy ? 0.7 : 1 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.5 3.5L10 14" />
            <path d="M20.5 3.5l-6.5 17-4-6.5-6.5-4z" />
          </svg>{v.busy ? "Envoi…" : "Envoyer pour validation"}</button>
      ) : (
        <button type="button" disabled style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", minHeight: "52px", borderRadius: "15px", border: "0", background: "rgba(255,255,255,0.08)", color: "#A8ADA3", fontSize: "14px", fontWeight: "700" }}>{v.missing}</button>
      )}
      <span style={{ fontSize: "12.5px", color: "#A8ADA3", textAlign: "center" }}>Réponse sous 24 h, ici et sur WhatsApp.</span>
    </>
  );
}
