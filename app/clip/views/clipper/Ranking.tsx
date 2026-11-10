"use client";

/** Onglet Classement du clippeur : sa place, le top du mois (vues, jamais de montant) et ses vues sur 30 jours. */

export type RankingRow = { key: string; position: number; initials: string; name: string; detail: string; views: string; me: boolean };
export type RankingVals = {
  subline: string;
  place: { position: string; context: string; ahead: { text: string; gap: string; pct: number } | null; leader: boolean } | null;
  noPlace: string;
  rows: RankingRow[];
  others: string | null;
  empty: string;
  views: { total: string; delta: string | null; up: boolean; daily: number[]; labels: [string, string, string]; platforms: { label: string; value: string; pct: number }[] };
};

const MEDAL: Record<number, string> = { 1: "#F0C575", 2: "#C4C8BD", 3: "#D9A066" };

export function RankRow({ row, first }: { row: RankingRow; first: boolean }) {
  const medal = MEDAL[row.position];
  const base = { display: "flex", alignItems: "center", gap: "12px" } as const;
  const style = row.me
    ? { ...base, margin: "2px -8px", padding: "10px 8px", borderRadius: "14px", background: "rgba(240,197,117,0.09)", border: "1px solid rgba(240,197,117,0.35)" }
    : { ...base, padding: "10px 0", borderTop: first ? "0" : "1px solid rgba(255,255,255,0.06)" };
  return (
    <li style={style}>
      <span style={medal
        ? { flexShrink: "0", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: medal, color: "#0b0d0b", fontSize: "13px", fontWeight: "800" }
        : { flexShrink: "0", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.2)", color: "#C4C8BD", fontSize: "13px", fontWeight: "800" }}>{row.position}</span>
      <span aria-hidden="true" style={{ flexShrink: "0", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: row.me ? "rgba(240,197,117,0.16)" : "rgba(145,214,208,0.12)", color: row.me ? "#F0C575" : "#91D6D0", fontSize: "12px", fontWeight: "800" }}>{row.initials}</span>
      <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
        <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{row.detail}</span>
      </span>
      <span style={{ flexShrink: "0", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "14px" }}>{row.views}</span>
        <span style={{ fontSize: "11px", color: "#A8ADA3" }}>vues</span>
      </span>
    </li>
  );
}

/** Courbe des vues gagnées par jour (aire + ligne). */
export function ViewsSpark({ daily, width, height, label }: { daily: number[]; width: number; height: number; label: string }) {
  const pad = 6;
  const max = Math.max(1, ...daily) * 1.1;
  const step = daily.length > 1 ? width / (daily.length - 1) : width;
  const points = daily.map((value, index) => [index * step, height - pad - (value / max) * (height - 2 * pad)] as const);
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const last = points[points.length - 1];
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ display: "block" }}>
      <path d={area} fill="rgba(240,197,117,0.12)" />
      <path d={line} fill="none" stroke="#F0C575" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {last ? <circle cx={Math.max(4, last[0] - 3)} cy={last[1]} r="4" fill="#F0C575" /> : null}
    </svg>
  );
}

export function ClipperRanking({ v }: { v: RankingVals }) {
  const hasViews = v.views.daily.some((value) => value > 0);
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <h1 style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "24px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>Classement</h1>
        <span style={{ fontSize: "13px", color: "#A8ADA3" }}>{v.subline}</span>
      </div>

      <section aria-labelledby="t-place" style={{ padding: "20px", borderRadius: "22px", background: "#15170f", border: "1px solid rgba(240,197,117,0.45)", display: "flex", flexDirection: "column", gap: "14px" }}>
        <h2 id="t-place" style={{ margin: "0", fontSize: "13px", fontWeight: "700", color: "#C4C8BD" }}>Ta place ce mois-ci</h2>
        {v.place ? (
          <>
            <span style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "10px" }}>
              <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "44px", lineHeight: "1", letterSpacing: "-0.03em", color: "#F0C575" }}>{v.place.position}</span>
              <span style={{ fontSize: "14px", color: "#C4C8BD" }}>{v.place.context}</span>
            </span>
            {v.place.ahead ? (
              <span style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "12.5px", color: "#A8ADA3" }}>
                  <span>{v.place.ahead.text}</span>
                  <span style={{ flexShrink: "0", fontWeight: "700", color: "#F0C575" }}>{v.place.ahead.gap}</span>
                </span>
                <span role="progressbar" aria-label={v.place.ahead.text} aria-valuenow={v.place.ahead.pct} aria-valuemin={0} aria-valuemax={100} style={{ display: "block", height: "8px", borderRadius: "999px", background: "rgba(255,255,255,0.08)" }}>
                  <span style={{ display: "block", width: `${v.place.ahead.pct}%`, height: "8px", borderRadius: "999px", background: "#F0C575" }} />
                </span>
              </span>
            ) : v.place.leader ? (
              <span style={{ fontSize: "13px", fontWeight: "700", color: "#91D6D0" }}>Tu es en tête du classement : garde le rythme !</span>
            ) : null}
          </>
        ) : (
          <span style={{ fontSize: "13.5px", lineHeight: "1.5", color: "#C4C8BD" }}>{v.noPlace}</span>
        )}
      </section>

      <section aria-labelledby="t-top" style={{ padding: "16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
          <h2 id="t-top" style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Top du mois</h2>
          <span style={{ fontSize: "12px", color: "#A8ADA3" }}>classés par vues</span>
        </div>
        {v.rows.length ? (
          <ol style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column" }}>
            {v.rows.map((row, index) => <RankRow key={row.key} row={row} first={index === 0} />)}
          </ol>
        ) : (
          <span style={{ fontSize: "13px", lineHeight: "1.5", color: "#A8ADA3" }}>{v.empty}</span>
        )}
        <span style={{ paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "12.5px", color: "#A8ADA3" }}>{v.others ? `${v.others} · ` : ""}aucun montant affiché, seulement les vues</span>
      </section>

      <section aria-labelledby="t-vues" style={{ padding: "16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
          <h2 id="t-vues" style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Mes vues · 30 jours</h2>
          {v.views.delta ? <span style={{ fontSize: "12px", fontWeight: "700", color: v.views.up ? "#91D6D0" : "#F2B45A" }}>{v.views.delta}</span> : null}
        </div>
        <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "26px", letterSpacing: "-0.02em" }}>{v.views.total}</span>
        {hasViews ? (
          <>
            <ViewsSpark daily={v.views.daily} width={326} height={96} label="Courbe de tes vues sur 30 jours" />
            <span style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "#A8ADA3" }}>
              <span>{v.views.labels[0]}</span><span>{v.views.labels[1]}</span><span>{v.views.labels[2]}</span>
            </span>
            {v.views.platforms.length ? (
              <span style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {v.views.platforms.map((platform) => (
                  <span key={platform.label} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px" }}>
                      <span style={{ fontWeight: "700" }}>{platform.label}</span>
                      <span style={{ color: "#C4C8BD" }}>{platform.value} · {platform.pct} %</span>
                    </span>
                    <span style={{ display: "block", height: "6px", borderRadius: "999px", background: "rgba(255,255,255,0.08)" }}>
                      <span style={{ display: "block", width: `${platform.pct}%`, height: "6px", borderRadius: "999px", background: "#F0C575" }} />
                    </span>
                  </span>
                ))}
              </span>
            ) : null}
          </>
        ) : (
          <span style={{ fontSize: "13px", lineHeight: "1.5", color: "#A8ADA3" }}>Ta courbe apparaît dès que les vues de tes clips sont relevées.</span>
        )}
      </section>
    </>
  );
}
