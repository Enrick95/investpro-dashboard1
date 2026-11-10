"use client";

import { useState } from "react";
import { Avatar, Bar, Chip, Icon, Pills, S, go, type Tone } from "./kit";

export type ClipperFilter = "all" | "active" | "test" | "idle" | "paused" | "watch";
export type ClipperStatus = "test" | "active" | "paused";
export type StatusChip = { tone: Tone; label: string; icon?: string };
export type ClipperRowData = { id: string; ini: string; name: string; sub: string; status: StatusChip; accounts: string; views: string; clips: string; refus: string };
export type FicheAccount = { id: string; badge: string; handle: string; url: string; sub: string; verified: boolean };
export type FicheData = {
  id: string;
  ini: string;
  name: string;
  firstName: string;
  status: StatusChip;
  statusValue: ClipperStatus;
  meta: string;
  wa: string | null;
  link: string;
  previewHref: string;
  stats: { value: string; label: string; gold?: boolean }[];
  accounts: FicheAccount[];
  campaigns: { title: string; progress: string; pct: number }[];
  serious: { label: string; value: string; tone?: "ok" | "warn" }[];
  /** Parrain et filleuls (vide : rien à afficher). */
  referral: { label: string; value: string; tone?: "ok" | "warn" }[];
  note: string;
  payout: string;
};
export type ClippersVals = {
  subline: string;
  search: string;
  onSearch: (value: string) => void;
  filter: ClipperFilter;
  filters: { key: ClipperFilter; label: string }[];
  setFilter: (key: ClipperFilter) => void;
  rows: ClipperRowData[];
  selectedId: string | null;
  select: (id: string) => void;
  hidden: number;
  showAll: () => void;
  fiche: FicheData | null;
  emptyLabel: string;
  busy: boolean;
  inviteCopied: boolean;
  onInvite: () => void;
  copiedLink: boolean;
  onCopyLink: (link: string) => void;
  verify: (accountId: string, verified: boolean) => void;
  setStatus: (id: string, status: ClipperStatus) => void;
  saveNote: (id: string, note: string) => Promise<boolean>;
  resetPassword: (id: string) => Promise<{ password: string; wa: string | null } | null>;
  onPayments: (id: string) => void;
};

const GRID = "2fr 1.3fr 1fr 0.9fr 0.6fr 0.6fr";

function Fiche({ f, v }: { f: FicheData; v: ClippersVals }) {
  const [more, setMore] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(f.note);
  const [confirmReset, setConfirmReset] = useState(false);
  const [temp, setTemp] = useState<{ password: string; wa: string | null } | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  async function save() {
    if (await v.saveNote(f.id, note)) setEditing(false);
  }
  async function reset() {
    setResetBusy(true);
    const result = await v.resetPassword(f.id);
    setResetBusy(false);
    setConfirmReset(false);
    if (result) setTemp(result);
  }

  return (
    <section id="fiche" aria-labelledby="t-fiche" style={{ flex: "1 1 440px", minWidth: "0", padding: "22px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(240,197,117,0.3)", display: "flex", flexDirection: "column", gap: "18px", scrollMarginTop: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <Avatar ini={f.ini} size={56} />
        <div style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
            <h2 id="t-fiche" style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "20px", letterSpacing: "-0.02em" }}>{f.name}</h2>
            <Chip tone={f.status.tone} icon={f.status.icon}>{f.status.label}</Chip>
          </div>
          <span style={{ fontSize: "13px", color: "#A8ADA3" }}>{f.meta}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {f.wa ? (
          <a href={f.wa} target="_blank" rel="noopener noreferrer" style={{ ...S.primary, fontSize: "13px", padding: "0 14px" }}><Icon name="chat" />Écrire sur WhatsApp</a>
        ) : <span style={{ ...S.ghost, color: "#A8ADA3" }}>Pas de WhatsApp</span>}
        <a href={f.previewHref} style={{ ...S.ghost, padding: "0 14px" }}><Icon name="eye" stroke="1.9" />Voir son espace</a>
        <button type="button" aria-label="Plus d'actions" aria-expanded={more} onClick={() => setMore((value) => !value)} style={{ width: "44px", height: "44px", borderRadius: "12px", border: more ? "1px solid rgba(240,197,117,0.5)" : "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#C4C8BD", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="dots" size={18} /></button>
      </div>
      {more ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "14px", borderRadius: "14px", background: "#181c16" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={S.label}>Son lien traqué</span>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
              <span style={{ flex: "1 1 200px", minWidth: "0", fontSize: "13px", fontWeight: "700", overflowWrap: "anywhere" }}>{f.link.replace(/^https?:\/\//, "")}</span>
              <button type="button" onClick={() => v.onCopyLink(f.link)} style={S.ghost}><Icon name="copy" stroke="1.9" />{v.copiedLink ? "Copié" : "Copier"}</button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={S.label}>Statut</span>
            <Pills
              label={`Statut de ${f.name}`}
              value={f.statusValue}
              onPick={(status) => { if (status !== f.statusValue && !v.busy) v.setStatus(f.id, status); }}
              items={[{ key: "active", label: "Actif" }, { key: "test", label: "En test" }, { key: "paused", label: "En pause" }]}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={S.label}>Mot de passe oublié</span>
            {temp ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "13px", color: "#C4C8BD" }}>Mot de passe provisoire : <b style={{ color: "#F3EFE6", letterSpacing: "0.04em" }}>{temp.password}</b></span>
                <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>L&apos;ancien ne marche plus. Envoie-le à {f.firstName} : il le change ensuite dans son profil.</span>
                {temp.wa ? <a href={temp.wa} target="_blank" rel="noopener noreferrer" style={{ ...S.primary, alignSelf: "flex-start", fontSize: "13px" }}><Icon name="chat" />Envoyer sur WhatsApp</a> : null}
              </div>
            ) : confirmReset ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: "700", color: "#F2B45A" }}>Son mot de passe actuel ne marchera plus.</span>
                <button type="button" disabled={resetBusy} onClick={() => void reset()} style={S.danger}>{resetBusy ? "Création…" : "Confirmer"}</button>
                <button type="button" onClick={() => setConfirmReset(false)} style={S.ghost}>Annuler</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmReset(true)} style={{ ...S.ghost, alignSelf: "flex-start" }}>Créer un mot de passe provisoire</button>
            )}
          </div>
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
        {f.stats.map((stat) => (
          <div key={stat.label} style={{ padding: "12px 10px", borderRadius: "14px", background: "#181c16", display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
            <span style={{ fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "16px", color: stat.gold ? "#F0C575" : "#F3EFE6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stat.value}</span>
            <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{stat.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <h3 style={{ ...S.h3, margin: "0 0 6px" }}>Comptes</h3>
        {f.accounts.map((account) => (
          <div key={account.id} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span aria-hidden="true" style={{ flexShrink: "0", width: "36px", height: "36px", borderRadius: "11px", display: "flex", alignItems: "center", justifyContent: "center", background: "#181c16", border: "1px solid rgba(255,255,255,0.1)", color: "#C4C8BD", fontSize: "11.5px", fontWeight: "800" }}>{account.badge}</span>
            <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column" }}>
              <a href={account.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: "700", color: "#F3EFE6", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{account.handle}</a>
              <span style={account.verified ? { fontSize: "12.5px", color: "#A8ADA3" } : { fontSize: "12.5px", color: "#F2B45A", fontWeight: "700" }}>{account.sub}</span>
            </span>
            {account.verified ? <Chip tone="ok">Vérifié</Chip> : <button type="button" disabled={v.busy} onClick={() => v.verify(account.id, true)} style={{ minHeight: "44px", padding: "0 12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#F3EFE6", fontSize: "13px", fontWeight: "700" }}>Vérifier</button>}
          </div>
        ))}
        {!f.accounts.length ? <div style={{ minHeight: "48px", display: "flex", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", fontWeight: "700", color: "#F2B45A" }}>Aucun compte ajouté pour l&apos;instant.</div> : null}
      </div>
      {f.campaigns.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <h3 style={S.h3}>Campagnes</h3>
          {f.campaigns.map((campaign) => (
            <div key={campaign.title} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px" }}>
                <span style={{ fontWeight: "700" }}>{campaign.title}</span>
                <span style={{ color: "#C4C8BD", whiteSpace: "nowrap" }}>{campaign.progress}</span>
              </div>
              <Bar pct={campaign.pct} height={6} track="rgba(255,255,255,0.08)" />
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <h3 style={{ ...S.h3, margin: "0 0 6px" }}>Sérieux</h3>
        {f.serious.map((line) => (
          <div key={line.label} style={{ display: "flex", justifyContent: "space-between", gap: "10px", minHeight: "40px", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px" }}>
            <span style={{ color: "#C4C8BD" }}>{line.label}</span>
            <span style={{ fontWeight: "700", textAlign: "right", color: line.tone === "ok" ? "#91D6D0" : line.tone === "warn" ? "#F2B45A" : "#F3EFE6" }}>{line.value}</span>
          </div>
        ))}
      </div>
      {f.referral.length ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h3 style={{ ...S.h3, margin: "0 0 6px" }}>Parrainage</h3>
          {f.referral.map((line, index) => (
            <div key={`${line.label}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: "10px", minHeight: "40px", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px" }}>
              <span style={{ color: "#C4C8BD", minWidth: "0", overflowWrap: "anywhere" }}>{line.label}</span>
              <span style={{ fontWeight: "700", textAlign: "right", color: line.tone === "ok" ? "#91D6D0" : line.tone === "warn" ? "#F2B45A" : "#F3EFE6" }}>{line.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "14px", background: "#181c16" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <h3 style={{ margin: "0", fontSize: "13px", fontWeight: "800" }}>{editing ? <label htmlFor={`note-${f.id}`}>Note interne</label> : "Note interne"}</h3>
          {!editing ? <button type="button" onClick={() => { setNote(f.note); setEditing(true); }} style={{ minHeight: "36px", padding: "0 4px", border: "0", background: "transparent", color: "#F0C575", fontSize: "12.5px", fontWeight: "700" }}>{f.note ? "Modifier" : "Ajouter"}</button> : null}
        </div>
        {editing ? (
          <>
            <textarea id={`note-${f.id}`} value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} style={{ minHeight: "90px", padding: "10px 12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.16)", background: "#121511", color: "#F3EFE6", fontFamily: "Manrope, system-ui, sans-serif", fontSize: "13px", resize: "vertical" }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" disabled={v.busy} onClick={() => void save()} style={{ ...S.primary, fontSize: "13px" }}>Enregistrer</button>
              <button type="button" onClick={() => setEditing(false)} style={S.ghost}>Annuler</button>
            </div>
          </>
        ) : (
          <p style={{ margin: "0", fontSize: "13px", color: f.note ? "#C4C8BD" : "#8E938A", whiteSpace: "pre-wrap" }}>{f.note || "Rien pour l'instant. Visible par toi seul."}</p>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "10px", paddingTop: "4px" }}>
        {f.statusValue === "paused" ? (
          <button key="reactivate" type="button" disabled={v.busy} onClick={() => v.setStatus(f.id, "active")} style={{ ...S.ghost, border: "1px solid rgba(145,214,208,0.4)", color: "#91D6D0" }}>Réactiver</button>
        ) : (
          <button key="suspend" type="button" disabled={v.busy} onClick={() => v.setStatus(f.id, "paused")} style={S.danger}>Suspendre</button>
        )}
        <a href="#payments" onClick={go(() => v.onPayments(f.id))} style={S.ghost}>Voir ses paiements</a>
      </div>
      <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{f.payout}</span>
    </section>
  );
}

export function AdminClippers({ v }: { v: ClippersVals }) {
  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={S.eyebrow}>{v.subline}</span>
          <h1 style={S.h1}>Clippeurs</h1>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
          <label htmlFor="recherche" style={S.srOnly}>Rechercher un clippeur</label>
          <input id="recherche" type="search" value={v.search} onChange={(event) => v.onSearch(event.target.value)} placeholder="Rechercher un clippeur ou un compte" style={{ width: "300px", maxWidth: "100%", minHeight: "44px", padding: "0 14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.14)", background: "#121511", color: "#F3EFE6", fontFamily: "Manrope, system-ui, sans-serif", fontSize: "13.5px" }} />
          <button type="button" onClick={v.onInvite} style={S.primary}><Icon name="plus" size={18} stroke="2.2" />{v.inviteCopied ? "Lien copié" : "Inviter un clippeur"}</button>
        </div>
      </header>
      <Pills label="Filtrer" items={v.filters} value={v.filter} onPick={v.setFilter} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-start" }}>
        <section aria-label="Liste des clippeurs" style={{ flex: "1.25 1 560px", minWidth: "0", padding: "14px 14px 6px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", overflowX: "auto" }}>
          <div style={{ minWidth: "560px", display: "flex", flexDirection: "column" }}>
            <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: GRID, gap: "10px", padding: "4px 10px 10px", fontSize: "12px", fontWeight: "600", color: "#A8ADA3" }}>
              <span>Clippeur</span><span>Statut</span><span>Comptes</span><span>Vues 30 j</span><span>Clips</span><span>Refus</span>
            </div>
            {v.rows.map((row, index) => {
              const on = row.id === v.selectedId;
              const edge = on ? "1px solid rgba(240,197,117,0.4)" : "1px solid transparent";
              return (
                <button
                  key={row.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${row.name}, ${row.status.label}, ${row.views} vues sur 30 jours, ${row.clips} clips`}
                  onClick={() => v.select(row.id)}
                  style={{ display: "grid", gridTemplateColumns: GRID, gap: "10px", alignItems: "center", minHeight: "62px", padding: "0 10px", borderRadius: on ? "14px" : "0", background: on ? "rgba(240,197,117,0.09)" : "transparent", borderLeft: edge, borderRight: edge, borderBottom: edge, borderTop: on || index === 0 ? edge : "1px solid rgba(255,255,255,0.06)", color: "#F3EFE6", textAlign: "left", fontSize: "14px" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0" }}>
                    <Avatar ini={row.ini} selected={on} />
                    <span style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                      <span style={{ fontWeight: on ? "800" : "700" }}>{row.name}</span>
                      <span style={{ fontSize: "12px", color: "#A8ADA3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.sub}</span>
                    </span>
                  </span>
                  <span><Chip tone={row.status.tone} icon={row.status.icon}>{row.status.label}</Chip></span>
                  <span style={{ fontSize: "13px" }}>{row.accounts}</span>
                  <span style={{ fontWeight: "700" }}>{row.views}</span>
                  <span>{row.clips}</span>
                  <span>{row.refus}</span>
                </button>
              );
            })}
            {!v.rows.length ? <div style={{ padding: "18px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>{v.emptyLabel}</div> : null}
            {v.hidden ? <button type="button" onClick={v.showAll} style={{ display: "flex", alignItems: "center", gap: "6px", minHeight: "48px", padding: "0 10px", border: "0", borderTop: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "#F0C575", fontSize: "13px", fontWeight: "700", textAlign: "left" }}>Voir les {v.hidden} autres clippeurs</button> : null}
          </div>
        </section>
        {v.fiche ? <Fiche key={v.fiche.id} f={v.fiche} v={v} /> : (
          <section style={{ ...S.card, flex: "1 1 440px", minWidth: "0", fontSize: "13px", color: "#A8ADA3" }}>Sélectionne un clippeur pour voir sa fiche.</section>
        )}
      </div>
    </>
  );
}
