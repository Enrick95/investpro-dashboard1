"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Bar, Chip, Icon, Kpi, S, go, type Tone } from "./kit";

export type CampaignCardData = { id: string; meta: string; chip: { tone: Tone; label: string; dot?: boolean; icon?: string }; title: string; left: string; right: string; pct: number; minis: { value: string; label: string }[] };
export type LeaderRow = { id: string; rank: number; ini: string; name: string; handle: string; accounts: number; clips: number; views: string; eng: string; last: string; due: string; status: { tone: Tone; icon?: string; label: string } };
export type AlertRow = { key: string; tone: "bad" | "warn" | "ok"; icon: string; title: string; text: string; cta: { label: string; primary?: boolean; icon?: string; onClick?: () => void; href?: string } };
export type CandRow = { id: string; ini: string; name: string; phone: string; when: string; msg: string; info: string };
export type ChartData = { points: number[]; labels: { text: string; at: number }[]; range: string; peak: { index: number; value: string; day: string } | null; ticks: { label: string; value: number }[]; scaleMax: number };
export type OverviewVals = {
  dateLine: string;
  clipperView: string;
  period: 7 | 30 | 90;
  setPeriod: (period: 7 | 30 | 90) => void;
  kpis: { views: string; viewsTrend: { text: string; up: boolean } | null; viewsSub: string; clips: string; clipsTrend: { text: string; up: boolean } | null; clipsSub: string; active: string; activeTotal: string; activeSub: string; accounts: string; accountsSub: string; toPayLabel: string; toPay: string; toPaySub: string };
  chart: ChartData;
  platforms: { label: string; value: string; pct: number }[];
  clicks: string;
  campaigns: CampaignCardData[];
  leaders: LeaderRow[];
  leadersSub: string;
  leadersMore: string;
  alerts: AlertRow[];
  candidates: CandRow[];
  candidatesNew: number;
  inviteCopied: boolean;
  busy: boolean;
  onInvite: () => void;
  onNewCampaign: () => void;
  onCampaign: (id: string) => void;
  onClippers: () => void;
  onCandidates: () => void;
  accept: (id: string) => void;
  openCandidate: (id: string) => void;
};

const ALERT_TONE = { bad: { bg: "rgba(255,111,145,0.12)", color: "#FF6F91" }, warn: { bg: "rgba(242,180,90,0.12)", color: "#F2B45A" }, ok: { bg: "rgba(145,214,208,0.12)", color: "#91D6D0" } };

export function CampaignCardView({ card, onOpen, children }: { card: CampaignCardData; onOpen?: () => void; children?: ReactNode }) {
  return (
    <article style={{ flex: "1 1 280px", minWidth: "0", padding: "18px", borderRadius: "18px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ fontSize: "12px", fontWeight: "700", color: "#A8ADA3" }}>{card.meta}</span>
        <Chip tone={card.chip.tone} dot={card.chip.dot} icon={card.chip.icon}>{card.chip.label}</Chip>
      </div>
      <h3 style={{ margin: "0", fontSize: "16px", fontWeight: "800" }}>{onOpen ? <a href="#campaigns" onClick={go(onOpen)} style={{ color: "#F3EFE6", textDecoration: "none" }}>{card.title}</a> : card.title}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px" }}>
          <span style={{ fontWeight: "700" }}>{card.left}</span>
          <span style={{ color: "#A8ADA3" }}>{card.right}</span>
        </div>
        <Bar pct={card.pct} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
        {card.minis.map((mini) => (
          <div key={mini.label} style={S.mini}>
            <span style={S.miniValue}>{mini.value}</span>
            <span style={S.miniLabel}>{mini.label}</span>
          </div>
        ))}
      </div>
      {children}
    </article>
  );
}

function ViewsChart({ chart }: { chart: ChartData }) {
  const n = chart.points.length;
  const y = (value: number) => 230 - (chart.scaleMax ? (value / chart.scaleMax) * 230 : 0);
  const x = (index: number) => (n > 1 ? (index / (n - 1)) * 600 : 0);
  const line = chart.points.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const peak = chart.peak;
  const peakLeft = peak && n > 1 ? (peak.index / (n - 1)) * 100 : 0;
  const peakTop = peak ? y(chart.points[peak.index]) : 0;
  const empty = !peak;
  return (
    <div style={{ display: "flex", gap: "10px" }}>
      <div aria-hidden="true" style={{ position: "relative", width: "40px", height: "230px", flexShrink: "0", fontSize: "11.5px", color: "#A8ADA3" }}>
        {chart.ticks.map((tick) => <span key={tick.label} style={{ position: "absolute", right: "0", top: `${Math.max(0, y(tick.value) - 9)}px` }}>{tick.label}</span>)}
      </div>
      <div style={{ position: "relative", flex: "1 1 auto", minWidth: "0" }}>
        <svg role="img" aria-label={empty ? "Pas encore de vues saisies sur la période" : `Vues par jour, pic à ${peak?.value} le ${peak?.day}`} viewBox="0 0 600 230" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: "230px", overflow: "visible" }}>
          {chart.ticks.filter((tick) => tick.value > 0).map((tick) => <line key={tick.label} x1="0" y1={y(tick.value)} x2="600" y2={y(tick.value)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          <line x1="0" y1="230" x2="600" y2="230" stroke="rgba(255,255,255,0.16)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {!empty && n > 1 ? (
            <>
              <path d={`${line} L600 230 L0 230 Z`} fill="rgba(240,197,117,0.10)" />
              <path d={line} fill="none" stroke="#F0C575" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
        </svg>
        {peak ? (
          <>
            <span aria-hidden="true" style={{ position: "absolute", left: `${peakLeft}%`, top: `${peakTop}px`, width: "10px", height: "10px", borderRadius: "50%", background: "#F0C575", boxShadow: "0 0 0 2px #121511", transform: "translate(-50%, -50%)" }} />
            <div style={{ position: "absolute", left: `${peakLeft}%`, top: `${Math.max(0, peakTop - 17)}px`, transform: peakLeft > 35 ? "translateX(calc(-100% - 14px))" : "translateX(14px)", padding: "6px 10px", borderRadius: "10px", background: "#1c2019", border: "1px solid rgba(255,255,255,0.12)", fontSize: "12px", whiteSpace: "nowrap" }}>
              <span style={{ fontWeight: "800" }}>{peak.value}</span> <span style={{ color: "#A8ADA3" }}>· {peak.day}</span>
            </div>
          </>
        ) : (
          <div style={{ position: "absolute", inset: "0 0 18px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 20px", fontSize: "13px", color: "#A8ADA3" }}>La courbe se remplit dès que tu saisis les vues des clips validés.</div>
        )}
        <div aria-hidden="true" style={{ position: "relative", height: "18px", marginTop: "8px", fontSize: "11.5px", color: "#A8ADA3" }}>
          {chart.labels.map((label, index) => (
            <span key={`${label.text}-${index}`} style={index === 0 ? { position: "absolute", left: "0" } : index === chart.labels.length - 1 ? { position: "absolute", right: "0" } : { position: "absolute", left: `${label.at}%`, transform: "translateX(-50%)" }}>{label.text}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminOverview({ v }: { v: OverviewVals }) {
  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#A8ADA3" }}><span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#91D6D0" }} />{v.dateLine}</span>
          <h1 style={S.h1}>Bonjour Enrick</h1>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
          <div role="group" aria-label="Période" style={{ display: "flex", borderRadius: "12px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
            {([7, 30, 90] as const).map((days) => (
              <button key={days} type="button" aria-pressed={v.period === days} onClick={() => v.setPeriod(days)} style={v.period === days
                ? { minHeight: "44px", padding: "0 16px", border: "0", borderRadius: "10px", background: "#F3EFE6", color: "#0b0d0b", fontSize: "13px", fontWeight: "800" }
                : { minHeight: "44px", padding: "0 16px", border: "0", background: "transparent", color: "#A8ADA3", fontSize: "13px", fontWeight: "700" }}>{days} j</button>
            ))}
          </div>
          <Link href={v.clipperView} style={{ ...S.ghost, fontSize: "14px" }}><Icon name="eye" size={17} stroke="1.9" />Voir comme un clippeur</Link>
          <button type="button" onClick={v.onInvite} style={S.primary}><Icon name="plus" size={18} stroke="2.2" />{v.inviteCopied ? "Lien copié" : "Inviter un clippeur"}</button>
        </div>
      </header>
      <section aria-label="Chiffres clés" style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
        <Kpi label={`Vues · ${v.period} jours`} value={v.kpis.views} trend={v.kpis.viewsTrend} sub={v.kpis.viewsSub} />
        <Kpi label="Clips publiés" value={v.kpis.clips} trend={v.kpis.clipsTrend} sub={v.kpis.clipsSub} />
        <Kpi label="Clippeurs actifs" value={v.kpis.active} suffix={v.kpis.activeTotal} sub={v.kpis.activeSub} />
        <Kpi label="Comptes suivis" value={v.kpis.accounts} sub={v.kpis.accountsSub} />
        <Kpi label="VIP via les clips" value="—" sub="bientôt : membres VIP ramenés par les liens" />
        <Kpi label={v.kpis.toPayLabel} value={v.kpis.toPay} sub={v.kpis.toPaySub} gold />
      </section>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
        <section aria-labelledby="t-vues" style={{ ...S.card, flex: "2 1 520px", minWidth: "0", gap: "18px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
            <h2 id="t-vues" style={S.h2}>Vues par jour</h2>
            <span style={S.sub}>{v.chart.range}</span>
          </div>
          <ViewsChart chart={v.chart} />
        </section>
        <section aria-labelledby="t-plateformes" style={{ ...S.card, flex: "1 1 300px", minWidth: "0", gap: "16px" }}>
          <h2 id="t-plateformes" style={S.h2}>Par plateforme</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {v.platforms.map((platform) => (
              <div key={platform.label} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px" }}>
                  <span style={{ fontWeight: "700" }}>{platform.label}</span>
                  <span style={{ color: "#C4C8BD" }}>{platform.value}</span>
                </div>
                <Bar pct={platform.pct} />
              </div>
            ))}
          </div>
          <div style={{ height: "1px", background: "rgba(255,255,255,0.08)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
              <h3 style={S.h3}>Ce que les clips ramènent</h3>
              <span style={{ fontSize: "12px", color: "#A8ADA3" }}>liens traqués</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
              <div style={{ padding: "12px 10px", borderRadius: "14px", background: "#181c16", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "18px" }}>{v.clicks}</span>
                <span style={{ fontSize: "12px", color: "#A8ADA3" }}>clics · 30 j</span>
              </div>
              <div style={{ padding: "12px 10px", borderRadius: "14px", background: "#181c16", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "18px", color: "#8E938A" }}>—</span>
                <span style={{ fontSize: "12px", color: "#A8ADA3" }}>VIP · bientôt</span>
              </div>
            </div>
          </div>
        </section>
      </div>
      <section aria-labelledby="t-campagnes" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <h2 id="t-campagnes" style={S.h2}>Campagnes</h2>
            <span style={S.sub}>Chaque campagne a son brief, ses rushs, son barème et un objectif de clips par clippeur</span>
          </div>
          <button type="button" onClick={v.onNewCampaign} style={S.ghost}><Icon name="plus" size={16} stroke="2.2" />Nouvelle campagne</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
          {v.campaigns.map((card) => <CampaignCardView key={card.id} card={card} onOpen={() => v.onCampaign(card.id)} />)}
          {!v.campaigns.length ? <div style={{ ...S.card, flex: "1 1 280px", fontSize: "13px", color: "#A8ADA3" }}>Aucune campagne pour l&apos;instant : crée la première pour que les clippeurs puissent soumettre.</div> : null}
        </div>
      </section>
      <section aria-labelledby="t-classement" style={{ ...S.card, padding: "22px 22px 10px", gap: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <h2 id="t-classement" style={S.h2}>Classement des clippeurs</h2>
            <span style={S.sub}>{v.leadersSub}</span>
          </div>
          <a href="#clippers" onClick={go(v.onClippers)} style={{ display: "flex", alignItems: "center", gap: "6px", minHeight: "44px", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>{v.leadersMore}<Icon name="arrow" /></a>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div role="table" aria-label="Classement des clippeurs" style={{ minWidth: "940px", display: "flex", flexDirection: "column" }}>
            <div role="row" style={{ display: "grid", gridTemplateColumns: "36px 2.2fr 0.7fr 0.7fr 0.9fr 0.9fr 1fr 1fr 1.3fr", gap: "12px", padding: "0 8px 10px", fontSize: "12px", fontWeight: "600", color: "#A8ADA3" }}>
              {["#", "Clippeur", "Comptes", "Clips", "Vues", "Engagement", "Dernier clip", "À payer", "Statut"].map((title) => <span key={title} role="columnheader">{title}</span>)}
            </div>
            {v.leaders.map((row) => (
              <div key={row.id} role="row" style={{ display: "grid", gridTemplateColumns: "36px 2.2fr 0.7fr 0.7fr 0.9fr 0.9fr 1fr 1fr 1.3fr", gap: "12px", alignItems: "center", minHeight: "62px", padding: "0 8px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <span role="cell" style={{ fontFamily: "Unbounded, sans-serif", fontSize: "13px", color: "#A8ADA3" }}>{row.rank}</span>
                <span role="cell" style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0" }}>
                  <Avatar ini={row.ini} />
                  <span style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                    <span style={{ fontWeight: "700" }}>{row.name}</span>
                    <span style={{ fontSize: "12px", color: "#A8ADA3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.handle}</span>
                  </span>
                </span>
                <span role="cell">{row.accounts}</span>
                <span role="cell">{row.clips}</span>
                <span role="cell" style={{ fontWeight: "700" }}>{row.views}</span>
                <span role="cell" style={{ color: "#8E938A" }}>{row.eng}</span>
                <span role="cell" style={{ color: "#A8ADA3" }}>{row.last}</span>
                <span role="cell" style={{ fontWeight: "700" }}>{row.due}</span>
                <span role="cell"><Chip tone={row.status.tone} icon={row.status.icon} big>{row.status.label}</Chip></span>
              </div>
            ))}
            {!v.leaders.length ? <div style={{ padding: "18px 8px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>Pas encore de clippeur : accepte une candidature pour commencer.</div> : null}
          </div>
        </div>
      </section>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-start" }}>
        <section aria-labelledby="t-alertes" style={{ ...S.card, flex: "1 1 420px", minWidth: "0" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", paddingBottom: "10px" }}>
            <h2 id="t-alertes" style={S.h2}>À surveiller</h2>
            <span style={S.sub}>{v.alerts.length ? `${v.alerts.length} alerte${v.alerts.length > 1 ? "s" : ""}` : "rien à signaler"}</span>
          </div>
          {v.alerts.map((alert, index) => {
            const tone = ALERT_TONE[alert.tone];
            const ctaStyle = alert.cta.primary
              ? { flexShrink: "0", display: "flex", alignItems: "center", minHeight: "44px", padding: "0 14px", borderRadius: "12px", border: "0", background: "#F0C575", color: "#0b0d0b", fontSize: "13px", fontWeight: "800", textDecoration: "none" }
              : { flexShrink: "0", display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", padding: "0 14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#F3EFE6", fontSize: "13px", fontWeight: "700", textDecoration: "none" };
            return (
              <div key={alert.key} style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: index === v.alerts.length - 1 ? "14px 0 4px" : "14px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <span aria-hidden="true" style={{ flexShrink: "0", width: "38px", height: "38px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: tone.bg, color: tone.color }}><Icon name={alert.icon} size={18} stroke="1.9" /></span>
                <div style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span style={{ fontWeight: "700" }}>{alert.title}</span>
                  <span style={{ fontSize: "13px", color: "#A8ADA3" }}>{alert.text}</span>
                </div>
                {alert.cta.href ? (
                  <a href={alert.cta.href} target="_blank" rel="noopener noreferrer" style={ctaStyle}>{alert.cta.icon ? <Icon name={alert.cta.icon} stroke="1.9" /> : null}{alert.cta.label}</a>
                ) : (
                  <button type="button" onClick={alert.cta.onClick} style={ctaStyle}>{alert.cta.icon ? <Icon name={alert.cta.icon} stroke="1.9" /> : null}{alert.cta.label}</button>
                )}
              </div>
            );
          })}
          {!v.alerts.length ? <div style={{ padding: "14px 0 4px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>Tout est à jour.</div> : null}
        </section>
        <section aria-labelledby="t-candidatures" style={{ ...S.card, flex: "1 1 420px", minWidth: "0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
              <h2 id="t-candidatures" style={S.h2}>Candidatures</h2>
              {v.candidatesNew ? <span style={{ padding: "3px 9px", borderRadius: "999px", background: "#F0C575", color: "#0b0d0b", fontSize: "12px", fontWeight: "800" }}>{v.candidatesNew} nouvelle{v.candidatesNew > 1 ? "s" : ""}</span> : null}
            </div>
            <span style={S.sub}>Elles arrivent par ton lien d&apos;inscription. Quand ton WhatsApp sera relié au site, les messages « clip » arriveront ici aussi.</span>
          </div>
          {v.candidates.map((cand) => (
            <div key={cand.id} style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <Avatar ini={cand.ini} size={38} teal />
              <div style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontWeight: "700" }}>{cand.name}</span>
                  <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{cand.phone} · {cand.when}</span>
                </span>
                <span style={{ fontSize: "13px", color: "#C4C8BD" }}>{cand.msg}</span>
                <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{cand.info}</span>
              </div>
              <div style={{ flexShrink: "0", display: "flex", gap: "8px" }}>
                <button type="button" onClick={() => v.openCandidate(cand.id)} aria-label={`Voir la candidature de ${cand.name}`} style={{ minHeight: "44px", padding: "0 12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#C4C8BD", fontSize: "13px", fontWeight: "700" }}>Voir</button>
                <button type="button" disabled={v.busy} onClick={() => v.accept(cand.id)} title="Accepter en période de test" style={{ minHeight: "44px", padding: "0 14px", borderRadius: "12px", border: "0", background: "#F0C575", color: "#0b0d0b", fontSize: "13px", fontWeight: "800" }}>Accepter</button>
              </div>
            </div>
          ))}
          {!v.candidates.length ? <div style={{ padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>Aucune nouvelle candidature. Partage ton lien d&apos;inscription pour en recevoir.</div> : null}
          <a href="#candidates" onClick={go(v.onCandidates)} style={{ display: "flex", alignItems: "center", gap: "6px", minHeight: "44px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>Voir toutes les candidatures<Icon name="arrow" /></a>
        </section>
      </div>
    </>
  );
}
