"use client";

import { useState, type FormEvent } from "react";
import { Avatar, Chip, Icon, Pills, S, type Tone } from "./kit";

export type ReviewTab = "queue" | "views";
export type ViewsFilter = "unpaid" | "all";
export type Decision = "ok" | "ko" | null;
export type QueueItem = { id: string; ini: string; who: string; title: string; meta: string; age: string; flag: boolean; decision: Decision };
export type ReviewCurrent = {
  id: string;
  ini: string;
  title: string;
  ref: string;
  url: string;
  open: string;
  firstName: string;
  info: { label: string; value: string }[];
  flagText: string | null;
  /** Captures des stats envoyées par le clippeur. */
  captures: { id: string; url: string; when: string }[];
  checks: { ok: boolean; label: string }[];
  decision: Decision;
  reason: string | null;
  okNote: string;
  waOk: string | null;
  waKo: string | null;
  /** Montant proposé pour ce clip (celui de la campagne). */
  defaultAmount: number;
  earned: string | null;
};
export type ViewRowData = { id: string; title: string; url: string; meta: string; clipper: string; published: string; state: { tone: Tone; label: string }; views: number; amount: string; bonus: number; paid: boolean };
export type ReviewVals = {
  tab: ReviewTab;
  setTab: (tab: ReviewTab) => void;
  pendingCount: number;
  viewsCount: number;
  subline: string;
  queue: QueueItem[];
  pick: (id: string) => void;
  cur: ReviewCurrent | null;
  reasons: string[];
  busy: boolean;
  validate: (id: string, amount: number) => void;
  refuse: (id: string, reason: string) => void;
  next: () => void;
  hasNext: boolean;
  viewRows: ViewRowData[];
  viewsFilter: ViewsFilter;
  viewsFilters: { key: ViewsFilter; label: string }[];
  setViewsFilter: (key: ViewsFilter) => void;
  saveViews: (id: string, views: number) => Promise<boolean>;
  /** Relève tout de suite les vues TikTok et YouTube (sinon toutes les 3 h). */
  refreshViews: () => void;
  saveBonus: (id: string, bonus: number) => Promise<boolean>;
  euro: (value: number) => string;
};

const MANUAL: [string, string][] = [["a", "Aucune promesse de gains ni montant gagné"], ["b", "Sous-titres lisibles, bon montage"], ["c", "Respecte le brief de la campagne"]];
const VIEW_GRID = "2.1fr 1fr 0.7fr 0.8fr 1.3fr 0.8fr 1.3fr";

function parseAmount(raw: string): number {
  const value = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : 0;
}

function Tabs({ v }: { v: ReviewVals }) {
  const tabs: { key: ReviewTab; label: string; count: number }[] = [
    { key: "queue", label: "À valider", count: v.pendingCount },
    { key: "views", label: "Vues et bonus", count: v.viewsCount },
  ];
  return (
    <div role="tablist" aria-label="Clips" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {tabs.map((tab) => {
        const on = tab.key === v.tab;
        return (
          <button key={tab.key} type="button" role="tab" aria-selected={on} onClick={() => v.setTab(tab.key)} style={on
            ? { display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", padding: "0 16px", borderRadius: "999px", border: "0", background: "#F3EFE6", color: "#0b0d0b", fontSize: "13.5px", fontWeight: "800" }
            : { display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", padding: "0 16px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#C4C8BD", fontSize: "13.5px", fontWeight: "700" }}>
            {tab.label}
            <span style={on
              ? { minWidth: "22px", padding: "1px 7px", borderRadius: "999px", background: "#0b0d0b", color: "#F3EFE6", fontSize: "12px", textAlign: "center" }
              : { minWidth: "22px", padding: "1px 7px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", color: "#C4C8BD", fontSize: "12px", textAlign: "center" }}>{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function ViewRow({ row, v }: { row: ViewRowData; v: ReviewVals }) {
  const [value, setValue] = useState(String(row.views));
  const [bonus, setBonus] = useState(row.bonus ? String(row.bonus).replace(".", ",") : "");
  const [saved, setSaved] = useState(false);
  const views = Number(value) || 0;
  const bonusValue = parseAmount(bonus);
  const changedViews = views !== row.views;
  const changedBonus = !row.paid && bonusValue !== row.bonus;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let ok = true;
    if (changedViews) ok = (await v.saveViews(row.id, views)) && ok;
    if (changedBonus) ok = (await v.saveBonus(row.id, bonusValue)) && ok;
    if (ok) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    }
  }
  const dirty = changedViews || changedBonus;
  return (
    <form role="row" onSubmit={(event) => void submit(event)} style={{ display: "grid", gridTemplateColumns: VIEW_GRID, gap: "12px", alignItems: "center", minHeight: "66px", padding: "8px 8px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <span role="cell" style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
        <a href={row.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: "700", color: "#F3EFE6", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</a>
        <span style={{ fontSize: "12px", color: "#A8ADA3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.meta}</span>
      </span>
      <span role="cell" style={{ fontWeight: "600" }}>{row.clipper}</span>
      <span role="cell" style={{ color: "#A8ADA3" }}>{row.published}</span>
      <span role="cell"><Chip tone={row.state.tone}>{row.state.label}</Chip></span>
      <span role="cell">
        <label htmlFor={`views-${row.id}`} style={S.srOnly}>Vues de {row.title}</label>
        <input id={`views-${row.id}`} inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, "").slice(0, 11))} style={{ ...S.input, width: "100%" }} />
      </span>
      <span role="cell" style={{ fontWeight: "800" }}>{row.amount}</span>
      <span role="cell" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <label htmlFor={`bonus-${row.id}`} style={S.srOnly}>Bonus pour {row.title}</label>
        <input id={`bonus-${row.id}`} inputMode="decimal" placeholder="0" disabled={row.paid} value={bonus} onChange={(event) => setBonus(event.target.value.replace(/[^0-9.,]/g, "").slice(0, 8))} style={{ ...S.input, width: "72px", color: "#91D6D0" }} />
        <button type="submit" disabled={v.busy || !dirty} style={{ minHeight: "44px", padding: "0 12px", borderRadius: "12px", border: dirty ? "0" : "1px solid rgba(255,255,255,0.14)", background: dirty ? "#F0C575" : "transparent", color: dirty ? "#0b0d0b" : "#A8ADA3", fontSize: "13px", fontWeight: "800" }}>{saved ? "OK ✓" : "OK"}</button>
      </span>
    </form>
  );
}

export function AdminReview({ v }: { v: ReviewVals }) {
  const [manual, setManual] = useState<Record<string, Record<string, boolean>>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const cur = v.cur;
  const mine = cur ? manual[cur.id] ?? {} : {};
  const allManual = MANUAL.every(([key]) => mine[key]);
  const reason = cur ? reasons[cur.id] ?? v.reasons[0] : v.reasons[0];
  const amountText = cur ? amounts[cur.id] ?? String(cur.defaultAmount).replace(".", ",") : "";
  const amount = parseAmount(amountText);
  const toggle = (key: string) => {
    if (!cur) return;
    setManual((current) => ({ ...current, [cur.id]: { ...(current[cur.id] ?? {}), [key]: !(current[cur.id] ?? {})[key] } }));
  };

  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={S.eyebrow}>{v.subline}</span>
          <h1 style={S.h1}>Clips à valider</h1>
        </div>
        <span style={{ maxWidth: "420px", fontSize: "13px", color: "#A8ADA3" }}>Tu choisis ce que rapporte chaque clip en le validant : il entre dans le prochain versement. Un clip refusé ne rapporte rien, et le clippeur voit le motif.</span>
      </header>
      <Tabs v={v} />
      {v.tab === "queue" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-start" }}>
          <section aria-label="File d'attente" style={{ flex: "1 1 340px", minWidth: "0", padding: "10px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "6px" }}>
            {v.queue.map((item) => {
              const on = cur?.id === item.id;
              return (
                <button key={item.id} type="button" aria-pressed={on} onClick={() => v.pick(item.id)} style={{ display: "flex", alignItems: "flex-start", gap: "12px", width: "100%", padding: "12px", borderRadius: "14px", border: on ? "1px solid rgba(240,197,117,0.45)" : "1px solid transparent", background: on ? "rgba(240,197,117,0.09)" : "transparent", color: "#F3EFE6", textAlign: "left", fontSize: "14px" }}>
                  <Avatar ini={item.ini} size={36} selected={on} />
                  <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{item.who}</span>
                    <span style={{ fontWeight: on ? "800" : "700", lineHeight: "1.35" }}>{item.title}</span>
                    <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{item.meta}</span>
                  </span>
                  <span style={{ flexShrink: "0", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{item.age}</span>
                    {item.flag && !item.decision ? <span style={{ padding: "3px 8px", borderRadius: "999px", background: "rgba(242,180,90,0.12)", color: "#F2B45A", fontSize: "11.5px", fontWeight: "700" }}>À contrôler</span> : null}
                    {item.decision === "ok" ? <span style={{ padding: "3px 8px", borderRadius: "999px", background: "rgba(145,214,208,0.12)", color: "#91D6D0", fontSize: "11.5px", fontWeight: "700" }}>Validé</span> : null}
                    {item.decision === "ko" ? <span style={{ padding: "3px 8px", borderRadius: "999px", background: "rgba(255,111,145,0.12)", color: "#FF6F91", fontSize: "11.5px", fontWeight: "700" }}>Refusé</span> : null}
                  </span>
                </button>
              );
            })}
            {!v.queue.length ? <div style={{ padding: "18px 12px", fontSize: "13px", color: "#A8ADA3" }}>Aucun clip en attente. Les nouveaux clips soumis arrivent ici.</div> : null}
          </section>
          {cur ? (
            <section aria-labelledby="t-clip" style={{ flex: "2.2 1 600px", minWidth: "0", padding: "22px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
                  <h2 id="t-clip" style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "20px", letterSpacing: "-0.02em", lineHeight: "1.25" }}>{cur.title}</h2>
                  <span style={{ fontSize: "13px", color: "#A8ADA3" }}>{cur.ref}</span>
                </div>
                <a href={cur.url} target="_blank" rel="noopener noreferrer" style={S.ghost}>{cur.open}<Icon name="external" size={15} /></a>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
                <a href={cur.url} target="_blank" rel="noopener noreferrer" style={{ flex: "0 0 210px", height: "374px", maxWidth: "100%", borderRadius: "18px", background: "#0b0d0b", border: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", color: "#A8ADA3", textDecoration: "none" }}>
                  <span aria-hidden="true" style={{ width: "56px", height: "56px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(240,197,117,0.14)", color: "#F0C575" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                  </span>
                  <span style={{ fontSize: "12.5px", textAlign: "center", padding: "0 14px" }}>Regarder le clip · 9:16</span>
                </a>
                <div style={{ flex: "1 1 320px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {cur.info.map((line) => (
                      <div key={line.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", minHeight: "38px", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "13.5px" }}>
                        <span style={{ color: "#A8ADA3" }}>{line.label}</span>
                        <span style={{ fontWeight: "700", textAlign: "right", minWidth: "0", overflowWrap: "anywhere" }}>{line.value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <h3 style={{ margin: "0", fontSize: "13px", fontWeight: "800" }}>Stats envoyées par le clippeur{cur.captures.length ? ` · ${cur.captures.length}` : ""}</h3>
                    {cur.captures.length ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {cur.captures.map((capture, index) => (
                          <a key={capture.id} href={capture.url} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir la capture ${index + 1} (${capture.when})`} style={{ display: "flex", flexDirection: "column", gap: "4px", width: "86px", textDecoration: "none" }}>
                            <span style={{ display: "block", width: "86px", height: "153px", borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", background: "#181c16" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={capture.url} alt={`Capture des stats ${index + 1}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            </span>
                            <span style={{ fontSize: "11px", color: "#A8ADA3" }}>{capture.when}</span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>Pas encore de capture : le clippeur peut ajouter ses stats depuis « Mes clips ».</span>
                    )}
                  </div>
                  {cur.flagText ? (
                    <div style={{ display: "flex", gap: "10px", padding: "12px 14px", borderRadius: "14px", background: "rgba(242,180,90,0.08)", border: "1px solid rgba(242,180,90,0.3)", fontSize: "13px", color: "#C4C8BD" }}>
                      <Icon name="alert" size={17} stroke="2.1" color="#F2B45A" style={{ flexShrink: "0", marginTop: "1px" }} />
                      <span><span style={{ fontWeight: "800", color: "#F2B45A" }}>À contrôler :</span> {cur.flagText}</span>
                    </div>
                  ) : null}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <h3 style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: "800" }}>Vérifié automatiquement</h3>
                    {cur.checks.map((check) => (
                      <div key={check.label} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13.5px" }}>
                        {check.ok ? <Icon name="check" size={16} stroke="2.6" color="#91D6D0" style={{ flexShrink: "0" }} /> : <Icon name="alert" size={16} stroke="2.4" color="#F2B45A" style={{ flexShrink: "0" }} />}
                        <span style={check.ok ? { color: "#C4C8BD" } : { fontWeight: "700", color: "#F2B45A" }}>{check.label}</span>
                      </div>
                    ))}
                  </div>
                  {!cur.decision ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <h3 style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: "800" }}>À vérifier par toi</h3>
                      {MANUAL.map(([key, label]) => {
                        const on = Boolean(mine[key]);
                        return (
                          <button key={key} type="button" aria-pressed={on} onClick={() => toggle(key)} style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", minHeight: "46px", padding: "6px 12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "#181c16", color: "#F3EFE6", fontSize: "13.5px", textAlign: "left" }}>
                            {on ? (
                              <span aria-hidden="true" style={{ flexShrink: "0", width: "22px", height: "22px", borderRadius: "7px", background: "#91D6D0", color: "#0b0d0b", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={14} stroke="3" /></span>
                            ) : <span aria-hidden="true" style={{ flexShrink: "0", width: "22px", height: "22px", borderRadius: "7px", border: "1.5px solid rgba(255,255,255,0.3)" }} />}
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
              {!cur.decision ? (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <label htmlFor="montant" style={S.label}>Ce clip rapporte (€)</label>
                      <input id="montant" inputMode="decimal" value={amountText} onChange={(event) => { const value = event.target.value.replace(/[^0-9.,]/g, "").slice(0, 8); setAmounts((current) => ({ ...current, [cur.id]: value })); }} style={{ ...S.input, width: "120px", color: "#F0C575", fontWeight: "800" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <label htmlFor="motif" style={S.label}>Motif si tu refuses</label>
                      <select id="motif" value={reason} onChange={(event) => { const value = event.target.value; setReasons((current) => ({ ...current, [cur.id]: value })); }} style={{ ...S.input, minWidth: "220px", maxWidth: "100%" }}>
                        {v.reasons.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                    <button type="button" disabled={v.busy} onClick={() => v.refuse(cur.id, reason)} style={{ minHeight: "48px", padding: "0 18px", borderRadius: "12px", border: "1px solid rgba(255,111,145,0.4)", background: "transparent", color: "#FF6F91", fontSize: "14px", fontWeight: "800" }}>Refuser</button>
                    {allManual ? (
                      <button type="button" disabled={v.busy} onClick={() => v.validate(cur.id, amount)} style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "48px", padding: "0 20px", borderRadius: "12px", border: "0", background: "#F0C575", color: "#0b0d0b", fontSize: "14px", fontWeight: "800" }}><Icon name="check" size={17} stroke="2.6" />Valider · {v.euro(amount)}</button>
                    ) : (
                      <button type="button" disabled style={{ minHeight: "48px", padding: "0 20px", borderRadius: "12px", border: "0", background: "rgba(255,255,255,0.08)", color: "#A8ADA3", fontSize: "14px", fontWeight: "700" }}>Coche les 3 points pour valider</button>
                    )}
                  </div>
                </div>
              ) : (
                <div role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "14px 16px", borderRadius: "14px", background: cur.decision === "ok" ? "rgba(145,214,208,0.08)" : "rgba(255,111,145,0.08)", border: cur.decision === "ok" ? "1px solid rgba(145,214,208,0.35)" : "1px solid rgba(255,111,145,0.3)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13.5px", minWidth: "0", flex: "1 1 260px" }}>
                    <Icon name={cur.decision === "ok" ? "check" : "x"} size={18} stroke="2.6" color={cur.decision === "ok" ? "#91D6D0" : "#FF6F91"} style={{ flexShrink: "0" }} />
                    {cur.decision === "ok"
                      ? <span><span style={{ fontWeight: "800", color: "#91D6D0" }}>Clip validé{cur.earned ? ` · ${cur.earned}` : ""}.</span> {cur.okNote}</span>
                      : <span><span style={{ fontWeight: "800", color: "#FF6F91" }}>Clip refusé.</span> {cur.firstName} voit le motif dans son espace{cur.reason ? ` : « ${cur.reason} »` : ""}.</span>}
                  </span>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {(cur.decision === "ok" ? cur.waOk : cur.waKo) ? <a href={(cur.decision === "ok" ? cur.waOk : cur.waKo) ?? "#"} target="_blank" rel="noopener noreferrer" style={{ ...S.ghost, padding: "0 14px" }}><Icon name="chat" />Prévenir sur WhatsApp</a> : null}
                    {v.hasNext ? <button type="button" onClick={v.next} style={{ ...S.ghost, padding: "0 14px" }}>Clip suivant</button> : null}
                  </span>
                </div>
              )}
            </section>
          ) : (
            <section style={{ ...S.card, flex: "2.2 1 600px", minWidth: "0", fontSize: "13px", color: "#A8ADA3" }}>Rien à valider pour l&apos;instant. Les vues et les bonus des clips validés sont dans l&apos;onglet « Vues et bonus ».</section>
          )}
        </div>
      ) : (
        <section aria-labelledby="t-vues-saisir" style={{ ...S.card, padding: "22px 22px 12px", gap: "14px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxWidth: "640px" }}>
              <h2 id="t-vues-saisir" style={S.h2}>Vues et bonus</h2>
              <span style={S.sub}>Les vues TikTok et YouTube se relèvent toutes seules toutes les 3 h, dès l&apos;envoi du clip. Instagram et les autres réseaux : saisis-les ici. Pour un clip qui cartonne, ajoute un bonus : il s&apos;ajoute au prochain versement du clippeur.</span>
            </div>
            <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
              <button type="button" disabled={v.busy} onClick={v.refreshViews} style={{ ...S.ghost, minHeight: "40px", padding: "0 12px" }}>Actualiser les vues</button>
              <Pills label="Filtrer" items={v.viewsFilters} value={v.viewsFilter} onPick={v.setViewsFilter} />
            </span>
          </div>
          <div style={{ position: "relative", overflowX: "auto" }}>
            <div role="table" aria-label="Vues et bonus des clips validés" style={{ minWidth: "980px", display: "flex", flexDirection: "column" }}>
              <div role="row" style={{ display: "grid", gridTemplateColumns: VIEW_GRID, gap: "12px", padding: "0 8px 10px", fontSize: "12px", fontWeight: "600", color: "#A8ADA3" }}>
                {["Clip", "Clippeur", "Publié", "État", "Vues", "Montant", "Bonus"].map((title) => <span key={title} role="columnheader">{title}</span>)}
              </div>
              {v.viewRows.map((row) => <ViewRow key={row.id} row={row} v={v} />)}
              {!v.viewRows.length ? <div style={{ padding: "18px 8px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>Aucun clip validé pour l&apos;instant.</div> : null}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
