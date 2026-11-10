"use client";

import { go } from "./Shell";

export type CampaignFilter = "live" | "soon" | "ended";
export type CampaignCard = {
  id: string;
  platforms: string;
  state: CampaignFilter;
  stateLabel: string;
  title: string;
  dates: string;
  mine: number;
  quota: number;
  rate: string;
  rateNote: string;
  vip: string;
  brief: string[];
  forbidden: string;
  rushesUrl: string | null;
  open: boolean;
};
export type CampaignsVals = {
  filter: CampaignFilter;
  counts: Record<CampaignFilter, number>;
  cards: CampaignCard[];
  setFilter: (filter: CampaignFilter) => void;
  openCard: (id: string) => void;
  submitFor: (id: string) => void;
};

const FILTERS: { key: CampaignFilter; label: string }[] = [
  { key: "live", label: "En cours" },
  { key: "soon", label: "À venir" },
  { key: "ended", label: "Terminées" },
];

function StateChip({ card }: { card: CampaignCard }) {
  if (card.state === "live") {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 9px", borderRadius: "999px", background: "rgba(145,214,208,0.12)", color: "#91D6D0", fontSize: "12px", fontWeight: "700", flexShrink: "0" }}><span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#91D6D0" }} />{card.stateLabel}</span>;
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 9px", borderRadius: "999px", background: "rgba(255,255,255,0.07)", color: "#C4C8BD", fontSize: "12px", fontWeight: "700", flexShrink: "0" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>{card.stateLabel}</span>
  );
}

function Progress({ card }: { card: CampaignCard }) {
  const pct = card.quota ? Math.min(100, Math.round((card.mine / card.quota) * 100)) : 0;
  const left = Math.max(0, card.quota - card.mine);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px" }}>
        <span style={{ fontWeight: "700" }}>Toi : {card.mine} / {card.quota} clips</span>
        <span style={{ color: "#A8ADA3" }}>{left ? `encore ${left}` : "objectif atteint"}</span>
      </div>
      <div style={{ height: "8px", borderRadius: "999px", background: "rgba(255,255,255,0.08)" }}>
        <div style={{ width: `${pct}%`, height: "8px", borderRadius: "999px", background: "#F0C575" }} />
      </div>
    </div>
  );
}

export function ClipperCampaigns({ v }: { v: CampaignsVals }) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <h1 style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "24px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>Campagnes</h1>
        <span style={{ fontSize: "13px", color: "#A8ADA3" }}>Les briefs d&apos;Enrick et ce que chaque clip te rapporte.</span>
      </div>
      <div role="group" aria-label="Filtrer les campagnes" style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {FILTERS.map((filter) => {
          const on = v.filter === filter.key;
          return (
            <button key={filter.key} type="button" aria-pressed={on} onClick={() => v.setFilter(filter.key)} style={on
              ? { minHeight: "44px", padding: "0 14px", borderRadius: "999px", border: "0", background: "#F3EFE6", color: "#0b0d0b", fontSize: "13px", fontWeight: "800" }
              : { minHeight: "44px", padding: "0 14px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#C4C8BD", fontSize: "13px", fontWeight: "700" }}>{filter.label} · {v.counts[filter.key]}</button>
          );
        })}
      </div>
      {!v.cards.length ? (
        <div style={{ padding: "18px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", fontSize: "13.5px", color: "#A8ADA3" }}>
          {v.filter === "live" ? "Aucune campagne en cours. Enrick te prévient sur WhatsApp dès qu'une nouvelle démarre." : v.filter === "soon" ? "Aucune campagne à venir pour l'instant." : "Pas encore de campagne terminée."}
        </div>
      ) : null}
      {v.cards.map((card) => card.open && card.state === "live" ? (
        <article key={card.id} aria-labelledby={`c-${card.id}`} style={{ padding: "18px", borderRadius: "22px", background: "#121511", border: "1px solid rgba(240,197,117,0.45)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: "#A8ADA3" }}>{card.platforms}</span>
            <StateChip card={card} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <h2 id={`c-${card.id}`} style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "19px", letterSpacing: "-0.02em", lineHeight: "1.25" }}>{card.title}</h2>
            <span style={{ fontSize: "13px", color: "#A8ADA3" }}>{card.dates}</span>
          </div>
          <Progress card={card} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
            <div style={{ padding: "12px", borderRadius: "14px", background: "#181c16", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "15px", color: "#F0C575" }}>{card.rate}</span>
              <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{card.rateNote}</span>
            </div>
            <div style={{ padding: "12px", borderRadius: "14px", background: "#181c16", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "15px", color: "#F0C575" }}>{card.vip}</span>
              <span style={{ fontSize: "12px", color: "#A8ADA3" }}>ramené par ton lien</span>
            </div>
          </div>
          {card.brief.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <h3 style={{ margin: "0", fontSize: "13px", fontWeight: "800" }}>Le brief</h3>
              <ul style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                {card.brief.map((line) => (
                  <li key={line} style={{ display: "flex", gap: "10px", fontSize: "13.5px", color: "#C4C8BD" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#91D6D0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {card.forbidden ? (
            <div style={{ display: "flex", gap: "10px", padding: "12px", borderRadius: "14px", background: "rgba(255,111,145,0.08)", border: "1px solid rgba(255,111,145,0.25)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF6F91" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: "0", marginTop: "2px" }}>
                <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
              </svg>
              <span style={{ fontSize: "13px", color: "#C4C8BD" }}><span style={{ fontWeight: "800", color: "#FF6F91" }}>Interdit :</span> {card.forbidden}</span>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: "10px" }}>
            {card.rushesUrl ? (
              <a href={card.rushesUrl} target="_blank" rel="noopener noreferrer" style={{ flex: "1 1 0", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "48px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.22)", color: "#F3EFE6", fontSize: "14px", fontWeight: "700", textDecoration: "none" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.8l2 2.5h7.2a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
                </svg>Rushs</a>
            ) : null}
            <a href="#soumettre" onClick={go(() => v.submitFor(card.id))} style={{ flex: "1.4 1 0", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "48px", borderRadius: "14px", background: "#F0C575", color: "#0b0d0b", fontSize: "14px", fontWeight: "800", textDecoration: "none" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>Soumettre un clip</a>
          </div>
        </article>
      ) : (
        <article key={card.id} aria-labelledby={`c-${card.id}`} style={{ padding: "16px 18px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: "#A8ADA3" }}>{card.platforms}</span>
            <StateChip card={card} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <h2 id={`c-${card.id}`} style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "16px", letterSpacing: "-0.01em" }}>{card.title}</h2>
            <span style={{ fontSize: "13px", color: "#A8ADA3" }}>{card.dates}</span>
          </div>
          {card.state !== "soon" ? <Progress card={card} /> : null}
          {card.state === "live" ? (
            <a href="#" onClick={go(() => v.openCard(card.id))} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", minHeight: "44px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.18)", color: "#F3EFE6", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>Voir le brief<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg></a>
          ) : null}
          {card.state === "soon" ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "44px", borderRadius: "12px", border: "1px solid rgba(145,214,208,0.35)", background: "rgba(145,214,208,0.08)", color: "#91D6D0", fontSize: "13px", fontWeight: "700" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>Tu pourras soumettre dès le premier jour</span>
          ) : null}
        </article>
      ))}
    </>
  );
}
