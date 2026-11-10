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
  brief: string[];
  forbidden: string;
  rushesUrl: string | null;
  open: boolean;
};
export type VideoItem = { id: string; title: string; note: string | null; meta: string; url: string; isNew: boolean };
export type CampaignsVals = {
  filter: CampaignFilter;
  counts: Record<CampaignFilter, number>;
  cards: CampaignCard[];
  videos: VideoItem[];
  /** Le TikTok d'Enrick : de quoi clipper tout de suite, en plus des vidéos postées ici. */
  tiktok: { handle: string; url: string };
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
        <span style={{ fontSize: "13px", color: "#A8ADA3" }}>Les vidéos à couper et les briefs d&apos;Enrick.</span>
      </div>
      <section aria-labelledby="t-videos" style={{ padding: "16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(240,197,117,0.3)", display: "flex", flexDirection: "column" }}>
          <h2 id="t-videos" style={{ margin: "0 0 6px", fontSize: "14px", fontWeight: "800" }}>Vidéos à clipper</h2>
          {!v.videos.length ? <span style={{ paddingBottom: "4px", fontSize: "13px", color: "#C4C8BD" }}>La prochaine vidéo longue d&apos;Enrick arrive ici : tu pourras la télécharger et en tirer plusieurs clips.</span> : null}
          {v.videos.map((video, index) => (
            <div key={video.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: index ? "1px solid rgba(255,255,255,0.06)" : "0" }}>
              <span aria-hidden="true" style={{ flexShrink: "0", width: "40px", height: "40px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(240,197,117,0.12)", color: "#F0C575" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M10 9.2v5.6l4.8-2.8z" /></svg>
              </span>
              <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontWeight: "700" }}>{video.title}</span>
                  {video.isNew ? <span style={{ padding: "2px 7px", borderRadius: "999px", background: "#F0C575", color: "#0b0d0b", fontSize: "10.5px", fontWeight: "800" }}>Nouveau</span> : null}
                </span>
                {video.note ? <span style={{ fontSize: "12.5px", color: "#C4C8BD", whiteSpace: "pre-wrap" }}>{video.note}</span> : null}
                <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{video.meta}</span>
              </span>
              <a href={video.url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: "0", display: "flex", alignItems: "center", minHeight: "44px", padding: "0 14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.2)", color: "#F3EFE6", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>Ouvrir</a>
            </div>
          ))}
          <a href={v.tiktok.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px", padding: "12px 0 2px", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#F3EFE6", textDecoration: "none" }}>
            <span aria-hidden="true" style={{ flexShrink: "0", width: "40px", height: "40px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(145,214,208,0.12)", color: "#91D6D0" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 3.5c.4 2.6 2 4.3 4.5 4.6v3.2c-1.7 0-3.2-.5-4.5-1.4v5.6a5.4 5.4 0 1 1-5.4-5.4c.3 0 .6 0 .9.1v3.3a2.2 2.2 0 1 0 1.3 2V3.5z" /></svg>
            </span>
            <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontWeight: "700" }}>Toutes mes vidéos TikTok</span>
              <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{v.tiktok.handle} : coupe-les et republie-les sur tes comptes, dès maintenant.</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A8ADA3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: "0" }}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></svg>
          </a>
        </section>
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
              <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "15px", color: "#F0C575" }}>Payé par clip</span>
              <span style={{ fontSize: "12px", color: "#A8ADA3" }}>chaque clip validé te rapporte</span>
            </div>
            <div style={{ padding: "12px", borderRadius: "14px", background: "#181c16", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "15px", color: "#F0C575" }}>+ bonus</span>
              <span style={{ fontSize: "12px", color: "#A8ADA3" }}>pour les clips qui cartonnent</span>
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
