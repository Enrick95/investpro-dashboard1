"use client";

import { useState } from "react";
import { Avatar, Icon, Pills, S } from "./kit";

export type PayFilter = "all" | "ready" | "check" | "later";
export type PayStatus = "ready" | "check" | "later";
export type PayRowData = {
  id: string;
  ini: string;
  name: string;
  ref: string;
  handle: string;
  clipsCount: number;
  /** Ce que rapportent ses clips validés pas encore payés (montants + bonus). */
  clipsAmount: number;
  /** Primes de parrainage dues. */
  referral: number;
  referralNote: string | null;
  /** clipsAmount + referral : calculé automatiquement. */
  base: number;
  method: string;
  methodNote: string;
  details: string;
  status: PayStatus;
};
export type PaymentsVals = {
  headline: string;
  paidLabel: string;
  paid: string;
  paidSub: string;
  rules: { icon: string; title: string; sub: string }[];
  onRules: () => void;
  filter: PayFilter;
  setFilter: (key: PayFilter) => void;
  rows: PayRowData[];
  pendingNote: string | null;
  focus: { name: string; clear: () => void } | null;
  methods: { label: string; count: number; pct: number }[];
  methodsSub: string;
  history: { key: string; date: string; sub: string; amount: string }[];
  emptyLabel: string;
  minPayout: number;
  busy: boolean;
  euro: (value: number) => string;
  copiedId: string | null;
  copyDetails: (id: string, details: string) => void;
  pay: (items: { id: string; bonus: number; deduction: number }[]) => Promise<boolean>;
};

const GRID = "44px 2fr 1fr 1fr 1fr 1fr 0.9fr 1.2fr 1.1fr";

function parseAmount(raw: string): number {
  const value = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
}

function csvCell(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function AdminPayments({ v }: { v: PaymentsVals }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bonus, setBonus] = useState<Record<string, string>>({});
  const [deduction, setDeduction] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);

  const isSelected = (row: PayRowData) => selected[row.id] ?? row.status === "ready";
  const totalOf = (row: PayRowData) => Math.max(0, Math.round((row.base + parseAmount(bonus[row.id] ?? "") - parseAmount(deduction[row.id] ?? "")) * 100) / 100);
  const all = v.rows;
  const visible = v.filter === "all" ? all : all.filter((row) => row.status === v.filter);
  const chosen = all.filter(isSelected);
  const chosenTotal = chosen.reduce((sum, row) => sum + totalOf(row), 0);
  const sumOf = (status: PayStatus | null) => all.filter((row) => status === null || row.status === status).reduce((sum, row) => sum + totalOf(row), 0);
  const count = (status: PayStatus) => all.filter((row) => row.status === status).length;
  const blocked = all.filter((row) => row.status !== "ready" && !isSelected(row));

  async function payNow() {
    const ok = await v.pay(chosen.map((row) => ({ id: row.id, bonus: parseAmount(bonus[row.id] ?? ""), deduction: parseAmount(deduction[row.id] ?? "") })));
    if (ok) {
      setConfirm(false);
      setSelected({});
      setBonus({});
      setDeduction({});
    }
  }

  function askConfirm() {
    setConfirm(true);
    window.setTimeout(() => document.getElementById("pay-bar")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  function exportCsv() {
    const header = ["Clippeur", "Réf.", "Moyen de paiement", "Coordonnées", "Clips validés", "Clips (€)", "Parrainage (€)", "Bonus (€)", "Retenue (€)", "Total (€)", "Statut"];
    const label: Record<PayStatus, string> = { ready: "Prêt", check: "À vérifier", later: "Reporté" };
    const money = (value: number) => value.toFixed(2).replace(".", ",");
    const lines = all.map((row) => [row.name, row.ref, row.method, row.details, String(row.clipsCount), money(row.clipsAmount), money(row.referral), money(parseAmount(bonus[row.id] ?? "")), money(parseAmount(deduction[row.id] ?? "")), money(totalOf(row)), label[row.status]]);
    const text = [header, ...lines].map((line) => line.map(csvCell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `paiements-clippeurs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const filters: { key: PayFilter; label: string }[] = [
    { key: "all", label: `Tous · ${all.length}` },
    { key: "ready", label: `Prêts · ${count("ready")}` },
    { key: "check", label: `À vérifier · ${count("check")}` },
    { key: "later", label: `Reportés · ${count("later")}` },
  ];
  const rules = v.rules;
  const smallInput = { ...S.input, width: "86px", padding: "0 10px" };

  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#A8ADA3" }}><Icon name="calendar" size={15} stroke="1.9" />{v.headline}</span>
          <h1 style={S.h1}>Paiements</h1>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
          <button type="button" onClick={exportCsv} disabled={!all.length} style={{ ...S.ghost, fontSize: "14px" }}><Icon name="download" size={17} stroke="1.9" />Exporter CSV</button>
          <button type="button" onClick={askConfirm} disabled={!chosen.length || v.busy} style={{ ...S.primary, opacity: chosen.length ? "1" : "0.5" }}><Icon name="send" size={17} />Marquer {chosen.length} payé{chosen.length > 1 ? "s" : ""} · {v.euro(chosenTotal)}</button>
        </div>
      </header>
      {v.focus ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", fontSize: "13px", color: "#C4C8BD" }}>
          <span>Paiements de <b style={{ color: "#F3EFE6" }}>{v.focus.name}</b></span>
          <button type="button" onClick={v.focus.clear} style={{ ...S.ghost, minHeight: "40px" }}>Voir tout le monde</button>
        </div>
      ) : null}
      <section aria-label="Résumé du cycle" style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
        <div style={{ flex: "1 1 170px", minWidth: "0", padding: "18px 18px 16px", borderRadius: "18px", background: "#15170f", border: "1px solid rgba(240,197,117,0.45)", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "600", color: "#A8ADA3" }}>Total acquis</span>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "26px", letterSpacing: "-0.02em", lineHeight: "1.2", color: "#F0C575" }}>{v.euro(sumOf(null))}</span>
          <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{all.length} clippeur{all.length > 1 ? "s" : ""} à payer</span>
        </div>
        <div style={{ flex: "1 1 170px", minWidth: "0", padding: "18px 18px 16px", borderRadius: "18px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "600", color: "#A8ADA3" }}>Sélection</span>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "26px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>{v.euro(chosenTotal)}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "700", color: "#91D6D0" }}><Icon name="check" size={14} stroke="2.4" />{chosen.length} clippeur{chosen.length > 1 ? "s" : ""} sélectionné{chosen.length > 1 ? "s" : ""}</span>
        </div>
        <div style={{ flex: "1 1 170px", minWidth: "0", padding: "18px 18px 16px", borderRadius: "18px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "600", color: "#A8ADA3" }}>À vérifier</span>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "26px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>{v.euro(sumOf("check"))}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "700", color: count("check") ? "#FF6F91" : "#A8ADA3" }}>{count("check") ? <Icon name="alert" size={14} stroke="2.2" /> : null}{count("check")} sans moyen de paiement</span>
        </div>
        <div style={{ flex: "1 1 170px", minWidth: "0", padding: "18px 18px 16px", borderRadius: "18px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "600", color: "#A8ADA3" }}>Reportés</span>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "26px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>{v.euro(sumOf("later"))}</span>
          <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>sous le seuil de {v.euro(v.minPayout)}</span>
        </div>
        <div style={{ flex: "1 1 170px", minWidth: "0", padding: "18px 18px 16px", borderRadius: "18px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "600", color: "#A8ADA3" }}>{v.paidLabel}</span>
          <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "26px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>{v.paid}</span>
          <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{v.paidSub}</span>
        </div>
      </section>
      <section aria-labelledby="t-bareme" style={{ padding: "20px 22px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(240,197,117,0.18)", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "10px" }}>
            <h2 id="t-bareme" style={S.h2}>Comment tu paies</h2>
            <span style={S.sub}>les clippeurs ne voient aucun tarif, seulement ce que chaque clip validé leur a rapporté</span>
          </div>
          <button type="button" onClick={v.onRules} style={S.ghost}>Changer le montant d&apos;une campagne</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {rules.map((rule) => (
            <div key={rule.title} style={{ flex: "1 1 200px", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "14px", background: "#181c16" }}>
              <span aria-hidden="true" style={{ flexShrink: "0", width: "36px", height: "36px", borderRadius: "11px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(240,197,117,0.12)", color: "#F0C575" }}><Icon name={rule.icon} size={18} stroke="1.9" /></span>
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: "800" }}>{rule.title}</span>
                <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{rule.sub}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="t-detail" style={{ padding: "22px 22px 12px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <h2 id="t-detail" style={S.h2}>Détail du cycle</h2>
            <span style={S.sub}>Chaque clip validé compte avec le montant choisi à la validation (et son bonus), plus les primes de parrainage. Ajoute un bonus ou une retenue si besoin.</span>
          </div>
          <Pills label="Filtrer" items={filters} value={v.filter} onPick={v.setFilter} />
        </div>
        <div style={{ position: "relative", overflowX: "auto" }}>
          <div role="table" aria-label="Détail des paiements du cycle" style={{ minWidth: "1060px", display: "flex", flexDirection: "column" }}>
            <div role="row" style={{ display: "grid", gridTemplateColumns: GRID, gap: "12px", padding: "0 8px 10px", fontSize: "12px", fontWeight: "600", color: "#A8ADA3" }}>
              <span role="columnheader"><span style={S.srOnly}>Sélection</span></span>
              {["Clippeur", "Clips validés", "Parrainage", "Bonus", "Retenue", "Total", "Moyen de paiement", "Statut"].map((title) => <span key={title} role="columnheader">{title}</span>)}
            </div>
            {visible.map((row) => {
              const on = isSelected(row);
              return (
                <div key={row.id} role="row" style={{ display: "grid", gridTemplateColumns: GRID, gap: "12px", alignItems: "center", minHeight: "64px", padding: "0 8px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <span role="cell">
                    <button type="button" aria-pressed={on} aria-label={`Sélectionner ${row.name}`} onClick={() => setSelected((current) => ({ ...current, [row.id]: !on }))} style={{ width: "44px", height: "44px", marginLeft: "-10px", border: "0", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {on ? <span aria-hidden="true" style={{ width: "22px", height: "22px", borderRadius: "7px", background: "#F0C575", color: "#0b0d0b", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={14} stroke="3" /></span> : <span aria-hidden="true" style={{ width: "22px", height: "22px", borderRadius: "7px", border: "1.5px solid rgba(255,255,255,0.3)" }} />}
                    </button>
                  </span>
                  <span role="cell" style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0" }}>
                    <Avatar ini={row.ini} />
                    <span style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                      <span style={{ fontWeight: "700" }}>{row.name}</span>
                      <span style={{ fontSize: "12px", color: "#A8ADA3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.handle}</span>
                    </span>
                  </span>
                  <span role="cell" style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ color: "#C4C8BD" }}>{v.euro(row.clipsAmount)}</span>
                    <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{row.clipsCount} clip{row.clipsCount > 1 ? "s" : ""}</span>
                  </span>
                  <span role="cell" style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ color: row.referral ? "#91D6D0" : "#8E938A" }}>{row.referral ? v.euro(row.referral) : "—"}</span>
                    {row.referralNote ? <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{row.referralNote}</span> : null}
                  </span>
                  <span role="cell">
                    <label htmlFor={`bonus-${row.id}`} style={S.srOnly}>Bonus pour {row.name}</label>
                    <input id={`bonus-${row.id}`} inputMode="decimal" placeholder="0" value={bonus[row.id] ?? ""} onChange={(event) => setBonus((current) => ({ ...current, [row.id]: event.target.value.replace(/[^0-9.,]/g, "").slice(0, 8) }))} style={{ ...smallInput, color: "#91D6D0" }} />
                  </span>
                  <span role="cell">
                    <label htmlFor={`ded-${row.id}`} style={S.srOnly}>Retenue pour {row.name}</label>
                    <input id={`ded-${row.id}`} inputMode="decimal" placeholder="0" value={deduction[row.id] ?? ""} onChange={(event) => setDeduction((current) => ({ ...current, [row.id]: event.target.value.replace(/[^0-9.,]/g, "").slice(0, 8) }))} style={{ ...smallInput, color: "#FF6F91" }} />
                  </span>
                  <span role="cell" style={{ fontWeight: "800" }}>{v.euro(totalOf(row))}</span>
                  <span role="cell" style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                    <span style={{ fontWeight: "600" }}>{row.method}</span>
                    {row.details ? (
                      <button type="button" onClick={() => v.copyDetails(row.id, row.details)} aria-label={`Copier les coordonnées de paiement de ${row.name}`} title={row.details} style={{ display: "flex", alignItems: "center", gap: "6px", minHeight: "28px", padding: "0", border: "0", background: "transparent", color: v.copiedId === row.id ? "#91D6D0" : "#A8ADA3", fontSize: "12px", textAlign: "left", minWidth: "0" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.copiedId === row.id ? "Copié" : row.methodNote}</span>
                        <Icon name={v.copiedId === row.id ? "check" : "copy"} size={13} stroke="2" style={{ flexShrink: "0" }} />
                      </button>
                    ) : <span style={{ fontSize: "12px", color: "#A8ADA3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.methodNote}</span>}
                  </span>
                  <span role="cell">
                    {row.status === "ready" ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 10px", borderRadius: "999px", background: "rgba(145,214,208,0.12)", color: "#91D6D0", fontSize: "12px", fontWeight: "700" }}><Icon name="check" size={13} stroke="2.4" />Prêt</span> : null}
                    {row.status === "check" ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 10px", borderRadius: "999px", background: "rgba(255,111,145,0.12)", color: "#FF6F91", fontSize: "12px", fontWeight: "700" }}><Icon name="alert" size={13} stroke="2.2" />À vérifier</span> : null}
                    {row.status === "later" ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 10px", borderRadius: "999px", background: "rgba(255,255,255,0.07)", color: "#C4C8BD", fontSize: "12px", fontWeight: "700" }}><Icon name="clock" size={13} stroke="2.2" />Reporté</span> : null}
                  </span>
                </div>
              );
            })}
            {!visible.length ? <div style={{ padding: "18px 8px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>{v.emptyLabel}</div> : null}
            {v.pendingNote ? <div style={{ padding: "14px 8px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "12.5px", color: "#A8ADA3" }}>{v.pendingNote}</div> : null}
            <div id="pay-bar" role="row" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", minHeight: "68px", padding: "10px 8px 4px", borderTop: "1px solid rgba(240,197,117,0.25)" }}>
              <span role="cell" style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "10px", minWidth: "0", flex: "1 1 320px" }}>
                <span style={{ fontWeight: "800" }}>Sélection : {chosen.length} clippeur{chosen.length > 1 ? "s" : ""}</span>
                <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{confirm ? "Fais d'abord les paiements (crypto, PayPal ou virement), puis confirme : chacun voit « Payé » dans son espace." : blocked.length ? `${blocked.map((row) => row.name).slice(0, 3).join(", ")}${blocked.length > 3 ? "…" : ""} ${blocked.length > 1 ? "restent" : "reste"} pour le prochain cycle` : "Tout le monde est prêt."}</span>
              </span>
              <span role="cell" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px" }}>
                <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "20px", color: "#F0C575" }}>{v.euro(chosenTotal)}</span>
                {confirm ? (
                  <>
                    <button type="button" onClick={() => setConfirm(false)} style={S.ghost}>Annuler</button>
                    <button type="button" disabled={v.busy || !chosen.length} onClick={() => void payNow()} style={S.primary}>{v.busy ? "Enregistrement…" : "C'est payé, confirmer"}</button>
                  </>
                ) : (
                  <button type="button" disabled={v.busy || !chosen.length} onClick={askConfirm} style={{ ...S.primary, opacity: chosen.length ? "1" : "0.5" }}>Marquer la sélection payée</button>
                )}
              </span>
            </div>
          </div>
        </div>
      </section>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-start" }}>
        <section aria-labelledby="t-moyens" style={{ ...S.card, flex: "1 1 380px", minWidth: "0", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
            <h2 id="t-moyens" style={S.h2}>Moyens de paiement</h2>
            <span style={S.sub}>{v.methodsSub}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {v.methods.map((method) => (
              <div key={method.label} style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr) 28px", alignItems: "center", gap: "12px", fontSize: "13px" }}>
                <span style={{ fontWeight: "700" }}>{method.label}</span>
                <span style={{ height: "8px", borderRadius: "999px", background: "rgba(255,255,255,0.06)" }}>
                  <span style={{ display: "block", width: `${method.pct}%`, height: "8px", borderRadius: "999px", background: "#F0C575" }} />
                </span>
                <span style={{ textAlign: "right", color: "#C4C8BD" }}>{method.count}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: "0", padding: "12px 14px", borderRadius: "14px", background: "#181c16", fontSize: "13px", color: "#C4C8BD" }}>Chaque clippeur renseigne son moyen de paiement dans son profil. Tu fais le virement toi-même, puis tu marques le versement comme payé : il voit « Payé » tout de suite dans son espace.</p>
        </section>
        <section aria-labelledby="t-historique" style={{ ...S.card, flex: "1 1 380px", minWidth: "0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingBottom: "10px" }}>
            <h2 id="t-historique" style={S.h2}>Historique des versements</h2>
          </div>
          {v.history.map((item) => (
            <div key={item.key} style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "62px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: "700" }}>{item.date}</span>
                <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{item.sub}</span>
              </span>
              <span style={{ fontWeight: "800", whiteSpace: "nowrap" }}>{item.amount}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 10px", borderRadius: "999px", background: "rgba(145,214,208,0.12)", color: "#91D6D0", fontSize: "12px", fontWeight: "700" }}><Icon name="check" size={13} stroke="2.4" />Payé</span>
            </div>
          ))}
          {!v.history.length ? <div style={{ padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>Aucun versement pour l&apos;instant.</div> : null}
        </section>
      </div>
    </>
  );
}
