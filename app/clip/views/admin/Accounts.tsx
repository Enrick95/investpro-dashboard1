"use client";

import { Chip, Icon, Pills, S, go } from "./kit";

export type AccountFilter = "all" | "todo" | "verified";
export type AccountRowData = { id: string; badge: string; handle: string; url: string; network: string; clipperId: string; clipper: string; followers: string; clips: string; views: string; added: string; verified: boolean };
export type AccountsVals = {
  subline: string;
  filter: AccountFilter;
  filters: { key: AccountFilter; label: string }[];
  setFilter: (key: AccountFilter) => void;
  search: string;
  onSearch: (value: string) => void;
  rows: AccountRowData[];
  emptyLabel: string;
  linkExample: string;
  busy: boolean;
  verify: (id: string, verified: boolean) => void;
  openClipper: (id: string) => void;
};

const GRID = "2fr 1.3fr 0.8fr 0.6fr 0.8fr 0.9fr 1.3fr";

export function AdminAccounts({ v }: { v: AccountsVals }) {
  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={S.eyebrow}>{v.subline}</span>
          <h1 style={S.h1}>Comptes</h1>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
          <label htmlFor="recherche-compte" style={S.srOnly}>Rechercher un compte</label>
          <input id="recherche-compte" type="search" value={v.search} onChange={(event) => v.onSearch(event.target.value)} placeholder="Rechercher un compte ou un clippeur" style={{ width: "300px", maxWidth: "100%", minHeight: "44px", padding: "0 14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.14)", background: "#121511", color: "#F3EFE6", fontFamily: "Manrope, system-ui, sans-serif", fontSize: "13.5px" }} />
        </div>
      </header>
      <div style={{ display: "flex", gap: "12px", padding: "14px 16px", borderRadius: "16px", background: "#121511", border: "1px solid rgba(240,197,117,0.18)", fontSize: "13px", color: "#C4C8BD" }}>
        <Icon name="shield" size={18} stroke="1.9" color="#F0C575" style={{ flexShrink: "0", marginTop: "1px" }} />
        <span>Pour vérifier un compte, ouvre son profil et regarde que le lien traqué du clippeur est en bio (par exemple <b style={{ color: "#F3EFE6" }}>{v.linkExample}</b>), ou demande-lui une capture de son tableau de bord. Les clips d&apos;un compte non vérifié restent à contrôler.</span>
      </div>
      <Pills label="Filtrer" items={v.filters} value={v.filter} onPick={v.setFilter} />
      <section aria-label="Comptes des clippeurs" style={{ padding: "14px 14px 6px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", overflowX: "auto" }}>
        <div role="table" aria-label="Comptes" style={{ minWidth: "860px", display: "flex", flexDirection: "column" }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: GRID, gap: "10px", padding: "4px 10px 10px", fontSize: "12px", fontWeight: "600", color: "#A8ADA3" }}>
            {["Compte", "Clippeur", "Abonnés", "Clips", "Vues 30 j", "Ajouté", "Vérification"].map((title) => <span key={title} role="columnheader">{title}</span>)}
          </div>
          {v.rows.map((row) => (
            <div key={row.id} role="row" style={{ display: "grid", gridTemplateColumns: GRID, gap: "10px", alignItems: "center", minHeight: "62px", padding: "0 10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span role="cell" style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0" }}>
                <span aria-hidden="true" style={{ flexShrink: "0", width: "36px", height: "36px", borderRadius: "11px", display: "flex", alignItems: "center", justifyContent: "center", background: "#181c16", border: "1px solid rgba(255,255,255,0.1)", color: "#C4C8BD", fontSize: "11.5px", fontWeight: "800" }}>{row.badge}</span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                  <a href={row.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "700", color: "#F3EFE6", textDecoration: "none", minWidth: "0" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{row.handle}</span>
                    <Icon name="external" size={13} stroke="2" color="#A8ADA3" style={{ flexShrink: "0" }} />
                  </a>
                  <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{row.network}</span>
                </span>
              </span>
              <span role="cell"><a href="#clippers" onClick={go(() => v.openClipper(row.clipperId))} style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", fontWeight: "700", color: "#F3EFE6", textDecoration: "none" }}>{row.clipper}</a></span>
              <span role="cell" style={{ color: "#C4C8BD" }}>{row.followers}</span>
              <span role="cell">{row.clips}</span>
              <span role="cell" style={{ fontWeight: "700" }}>{row.views}</span>
              <span role="cell" style={{ color: "#A8ADA3" }}>{row.added}</span>
              <span role="cell" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {row.verified ? (
                  <>
                    <Chip tone="ok" icon="check">Vérifié</Chip>
                    <button type="button" disabled={v.busy} onClick={() => v.verify(row.id, false)} aria-label={`Retirer la vérification de @${row.handle}`} style={{ minHeight: "44px", padding: "0 8px", border: "0", background: "transparent", color: "#A8ADA3", fontSize: "12.5px", fontWeight: "700" }}>Retirer</button>
                  </>
                ) : (
                  <button type="button" disabled={v.busy} onClick={() => v.verify(row.id, true)} aria-label={`Vérifier @${row.handle}`} style={{ ...S.primary, padding: "0 14px", fontSize: "13px" }}><Icon name="check" size={15} stroke="2.4" />Vérifier</button>
                )}
              </span>
            </div>
          ))}
          {!v.rows.length ? <div style={{ padding: "18px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>{v.emptyLabel}</div> : null}
        </div>
      </section>
    </>
  );
}
