"use client";

import type { ReactNode } from "react";
import { go } from "./Shell";
import { RankRow, type RankingRow } from "./Ranking";

export type HomeTodo = { key: string; icon: "link" | "flag" | "alert" | "wallet" | "film" | "gift" | "bell"; tone: "warn" | "teal"; title: string; sub: string; cta: string; primary: boolean; onClick: () => void };
export type HomeCampaign = { id: string; title: string; progress: string; pct: number; meta: string };
export type HomeVals = {
  firstName: string;
  subline: string;
  payDateShort: string;
  acquired: string;
  pendingText: string | null;
  inDays: string;
  cycleLabel: string;
  cycleDay: number;
  cycleLength: number;
  methodLine: string;
  methodMissing: boolean;
  acquiredClips: string;
  received: string;
  receivedNote: string;
  review: string;
  reviewNote: string;
  todos: HomeTodo[];
  campaigns: HomeCampaign[];
  linkLabel: string;
  linkStats: string;
  copied: boolean;
  onCopyLink: () => void;
  onPayments: () => void;
  onCampaigns: () => void;
  referral: { link: string; copied: boolean; onCopy: () => void; pitch: string; summary: string; list: { name: string; progress: string; status: string; done: boolean }[] };
  /** Aperçu du classement du mois (le détail est dans l'onglet Classement). */
  ranking: { place: string; rows: RankingRow[]; empty: string; viewsLine: string; onOpen: () => void };
};

const ICONS: Record<HomeTodo["icon"], ReactNode> = {
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  flag: <><path d="M5.5 21V4" /><path d="M5.5 4.5h11.5l-2.2 4.25L17 13H5.5" /></>,
  alert: <><path d="M12 4.5l9 15.5H3z" /><path d="M12 10v4.5M12 17.6v.1" /></>,
  wallet: <><path d="M17.5 7.5V6a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 6.5" /><rect x="3" y="7.5" width="18" height="12.5" rx="2.5" /><circle cx="16.5" cy="13.75" r="1" /></>,
  film: <><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M10 9.2v5.6l4.8-2.8z" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  gift: <><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8.5v12" /><path d="M12 8.5C10.5 5 7 5 7 7s3 1.5 5 1.5zM12 8.5C13.5 5 17 5 17 7s-3 1.5-5 1.5z" /></>,
};

export function ClipperHome({ v }: { v: HomeVals }) {
  const pct = Math.max(0, Math.min(100, Math.round((v.cycleDay / Math.max(1, v.cycleLength)) * 100)));
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <h1 style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "24px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>Salut {v.firstName}</h1>
        <span style={{ fontSize: "13px", color: "#A8ADA3" }}>{v.subline}</span>
      </div>
      <a href="#paiements" onClick={go(v.onPayments)} style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "20px", borderRadius: "22px", background: "#15170f", border: "1px solid rgba(240,197,117,0.45)", color: "#F3EFE6", textDecoration: "none" }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "#C4C8BD" }}>Prochain paiement</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 9px", borderRadius: "999px", background: "rgba(240,197,117,0.14)", color: "#F0C575", fontSize: "12px", fontWeight: "800" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
              <path d="M3.5 10h17M8 3v4M16 3v4" />
            </svg>{v.payDateShort}</span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "40px", letterSpacing: "-0.03em", lineHeight: "1.1", color: "#F0C575" }}>{v.acquired}</span>
          <span style={{ fontSize: "13.5px", color: "#C4C8BD" }}>déjà acquis · {v.pendingText ? <><span style={{ fontWeight: "700", color: "#F2B45A" }}>{v.pendingText}</span> · </> : null}{v.inDays}</span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "12.5px", color: "#A8ADA3" }}>
            <span>{v.cycleLabel}</span>
            <span>jour {v.cycleDay} sur {v.cycleLength}</span>
          </span>
          <span role="progressbar" aria-label="Avancement du cycle" aria-valuenow={v.cycleDay} aria-valuemin={0} aria-valuemax={v.cycleLength} style={{ display: "block", height: "8px", borderRadius: "999px", background: "rgba(255,255,255,0.08)" }}>
            <span style={{ display: "block", width: `${pct}%`, height: "8px", borderRadius: "999px", background: "#F0C575" }} />
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", paddingTop: "12px", borderTop: "1px solid rgba(240,197,117,0.2)", fontSize: "13px" }}>
          <span style={{ color: v.methodMissing ? "#F2B45A" : "#C4C8BD", fontWeight: v.methodMissing ? "700" : "400" }}>{v.methodLine}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: "800", color: "#F0C575" }}>Voir le détail<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg></span>
        </span>
      </a>
      <section aria-label="Où en est ton argent" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
        <div style={{ padding: "12px 10px", borderRadius: "16px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: "700", color: "#91D6D0" }}><span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#91D6D0" }} />Acquis</span>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "15px" }}>{v.acquired}</span>
          <span style={{ fontSize: "11.5px", color: "#A8ADA3" }}>{v.acquiredClips}</span>
        </div>
        <div style={{ padding: "12px 10px", borderRadius: "16px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: "700", color: "#F0C575" }}><span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F0C575" }} />Déjà reçu</span>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "15px" }}>{v.received}</span>
          <span style={{ fontSize: "11.5px", color: "#A8ADA3" }}>{v.receivedNote}</span>
        </div>
        <div style={{ padding: "12px 10px", borderRadius: "16px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: "700", color: "#C4C8BD" }}><span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#C4C8BD" }} />En revue</span>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "15px" }}>{v.review}</span>
          <span style={{ fontSize: "11.5px", color: "#A8ADA3" }}>{v.reviewNote}</span>
        </div>
      </section>
      {v.todos.length ? (
        <section aria-labelledby="t-afaire" style={{ padding: "16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(242,180,90,0.35)", display: "flex", flexDirection: "column" }}>
          <h2 id="t-afaire" style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: "800" }}>À faire</h2>
          {v.todos.map((todo, index) => (
            <div key={todo.key} style={{ display: "flex", alignItems: "center", gap: "12px", padding: index === v.todos.length - 1 ? "10px 0 0" : "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span aria-hidden="true" style={{ flexShrink: "0", width: "36px", height: "36px", borderRadius: "11px", display: "flex", alignItems: "center", justifyContent: "center", background: todo.tone === "warn" ? "rgba(242,180,90,0.12)" : "rgba(145,214,208,0.12)", color: todo.tone === "warn" ? "#F2B45A" : "#91D6D0" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{ICONS[todo.icon]}</svg>
              </span>
              <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: "700" }}>{todo.title}</span>
                <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{todo.sub}</span>
              </span>
              <a href="#" onClick={go(todo.onClick)} style={todo.primary
                ? { flexShrink: "0", display: "flex", alignItems: "center", minHeight: "44px", padding: "0 14px", borderRadius: "12px", background: "#F0C575", color: "#0b0d0b", fontSize: "13px", fontWeight: "800", textDecoration: "none" }
                : { flexShrink: "0", display: "flex", alignItems: "center", minHeight: "44px", padding: "0 14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.2)", color: "#F3EFE6", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>{todo.cta}</a>
            </div>
          ))}
        </section>
      ) : null}
      <section aria-labelledby="t-rank" style={{ padding: "16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(240,197,117,0.3)", display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
          <h2 id="t-rank" style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Classement du mois</h2>
          <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{v.ranking.place}</span>
        </div>
        {v.ranking.rows.length ? (
          <ol style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column" }}>
            {v.ranking.rows.map((row, index) => <RankRow key={row.key} row={row} first={index === 0} />)}
          </ol>
        ) : (
          <span style={{ fontSize: "13px", lineHeight: "1.5", color: "#A8ADA3" }}>{v.ranking.empty}</span>
        )}
        <span style={{ fontSize: "12.5px", color: "#C4C8BD" }}>{v.ranking.viewsLine}</span>
        <a href="#classement" onClick={go(v.ranking.onOpen)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "44px", marginTop: "4px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", fontWeight: "800", textDecoration: "none" }}>
          Voir le classement complet
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </a>
      </section>
      <section aria-labelledby="t-camp" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <h2 id="t-camp" style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "16px", letterSpacing: "-0.01em" }}>Mes campagnes</h2>
          <a href="#campagnes" onClick={go(v.onCampaigns)} style={{ display: "flex", alignItems: "center", minHeight: "44px", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>Tout voir</a>
        </div>
        {v.campaigns.length ? v.campaigns.map((campaign, index) => (
          <a key={campaign.id} href="#campagnes" onClick={go(v.onCampaigns)} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: index === v.campaigns.length - 1 ? "14px 0 0" : "14px 0", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#F3EFE6", textDecoration: "none" }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
              <span style={{ fontWeight: "700" }}>{campaign.title}</span>
              <span style={{ fontSize: "13px", color: "#C4C8BD", flexShrink: "0" }}>{campaign.progress}</span>
            </span>
            <span style={{ display: "block", height: "6px", borderRadius: "999px", background: "rgba(255,255,255,0.08)" }}>
              <span style={{ display: "block", width: `${campaign.pct}%`, height: "6px", borderRadius: "999px", background: "#F0C575" }} />
            </span>
            <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{campaign.meta}</span>
          </a>
        )) : (
          <span style={{ padding: "14px 0 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>Aucune campagne ouverte pour l&apos;instant. Enrick te prévient dès qu&apos;une nouvelle démarre.</span>
        )}
      </section>
      <section aria-labelledby="t-lien" style={{ padding: "14px 16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "6px" }}>
          <h2 id="t-lien" style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Mon lien traqué</h2>
          <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{v.linkStats}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 4px 4px 12px", borderRadius: "14px", background: "#181c16" }}>
          <span style={{ flex: "1 1 auto", minWidth: "0", fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.copied ? "Lien copié" : v.linkLabel}</span>
          <button type="button" onClick={v.onCopyLink} aria-label="Copier mon lien" style={{ flexShrink: "0", width: "44px", height: "44px", borderRadius: "12px", border: "0", background: "rgba(240,197,117,0.14)", color: "#F0C575", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
              <path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
            </svg>
          </button>
        </div>
      </section>
      <section aria-labelledby="t-parrainage" style={{ padding: "16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(145,214,208,0.3)", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <h2 id="t-parrainage" style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Parrainage</h2>
          <span style={{ fontSize: "12.5px", color: "#C4C8BD" }}>{v.referral.pitch}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 4px 4px 12px", borderRadius: "14px", background: "#181c16" }}>
          <span style={{ flex: "1 1 auto", minWidth: "0", fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.referral.copied ? "Lien copié" : v.referral.link}</span>
          <button type="button" onClick={v.referral.onCopy} aria-label="Copier mon lien de parrainage" style={{ flexShrink: "0", width: "44px", height: "44px", borderRadius: "12px", border: "0", background: "rgba(145,214,208,0.14)", color: "#91D6D0", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
              <path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
            </svg>
          </button>
        </div>
        <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{v.referral.summary}</span>
        {v.referral.list.map((item) => (
          <div key={item.name + item.progress} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", minHeight: "40px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px" }}>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: "700" }}>{item.name}</span>
              <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{item.progress}</span>
            </span>
            <span style={{ padding: "3px 8px", borderRadius: "999px", background: item.done ? "rgba(145,214,208,0.12)" : "rgba(255,255,255,0.07)", color: item.done ? "#91D6D0" : "#C4C8BD", fontSize: "11.5px", fontWeight: "700", whiteSpace: "nowrap" }}>{item.status}</span>
          </div>
        ))}
      </section>
    </>
  );
}
