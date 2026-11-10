"use client";

import type { FormEvent, ReactNode } from "react";
import { Icon, Pills, S } from "./kit";
import { CampaignCardView, type CampaignCardData } from "./Overview";

export type AdminCampaignFilter = "live" | "soon" | "ended" | "draft";
export type CampaignFormData = {
  id: string | null;
  title: string;
  platforms: string;
  starts_on: string;
  ends_on: string;
  quota_per_clipper: string;
  /** Montant proposé quand tu valides un clip de cette campagne (tu peux le changer à chaque fois). */
  amount_per_clip: string;
  status: "draft" | "active" | "ended";
  rushes_url: string;
  brief: string;
  forbidden: string;
};
export type AdminCampaignCard = CampaignCardData & { rules: string; brief: string; rushes: string | null };
export type AdminCampaignsVals = {
  subline: string;
  filter: AdminCampaignFilter;
  filters: { key: AdminCampaignFilter; label: string }[];
  setFilter: (key: AdminCampaignFilter) => void;
  cards: AdminCampaignCard[];
  emptyLabel: string;
  form: CampaignFormData | null;
  openNew: () => void;
  edit: (id: string) => void;
  closeForm: () => void;
  setField: (key: keyof CampaignFormData, value: string) => void;
  save: () => void;
  busy: boolean;
};

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}>
      <label htmlFor={id} style={S.label}>{label}</label>
      {children}
    </div>
  );
}

const input = { ...S.input, width: "100%" };
const area = { ...S.input, width: "100%", minHeight: "96px", padding: "10px 12px", resize: "vertical" as const, lineHeight: "1.45" };

export function AdminCampaigns({ v }: { v: AdminCampaignsVals }) {
  const form = v.form;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    v.save();
  }
  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={S.eyebrow}>{v.subline}</span>
          <h1 style={S.h1}>Campagnes</h1>
        </div>
        {!form ? <button type="button" onClick={v.openNew} style={S.primary}><Icon name="plus" size={18} stroke="2.2" />Nouvelle campagne</button> : null}
      </header>
      {form ? (
        <form onSubmit={submit} aria-labelledby="t-form" style={{ padding: "22px", borderRadius: "20px", background: "#15170f", border: "1px solid rgba(240,197,117,0.45)", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <h2 id="t-form" style={S.h2}>{form.id ? "Modifier la campagne" : "Nouvelle campagne"}</h2>
            <span style={S.sub}>Les clippeurs voient le brief, les interdits et les rushs dans leur onglet Campagnes. Le montant par clip reste entre toi et toi : ils voient seulement ce qu&apos;ils ont gagné.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
            <Field id="c-title" label="Titre"><input id="c-title" required maxLength={80} value={form.title} onChange={(event) => v.setField("title", event.target.value)} style={input} /></Field>
            <Field id="c-platforms" label="Plateformes"><input id="c-platforms" maxLength={80} value={form.platforms} onChange={(event) => v.setField("platforms", event.target.value)} style={input} /></Field>
            <Field id="c-start" label="Début"><input id="c-start" type="date" required value={form.starts_on} onChange={(event) => v.setField("starts_on", event.target.value)} style={input} /></Field>
            <Field id="c-end" label="Fin"><input id="c-end" type="date" required value={form.ends_on} onChange={(event) => v.setField("ends_on", event.target.value)} style={input} /></Field>
            <Field id="c-status" label="Statut">
              <select id="c-status" value={form.status} onChange={(event) => v.setField("status", event.target.value)} style={input}>
                <option value="active">Ouverte</option>
                <option value="draft">Brouillon (cachée)</option>
                <option value="ended">Terminée</option>
              </select>
            </Field>
            <Field id="c-quota" label="Objectif de clips par clippeur"><input id="c-quota" inputMode="numeric" value={form.quota_per_clipper} onChange={(event) => v.setField("quota_per_clipper", event.target.value)} style={input} /></Field>
            <Field id="c-amount" label="Montant par clip validé (€)"><input id="c-amount" inputMode="decimal" value={form.amount_per_clip} onChange={(event) => v.setField("amount_per_clip", event.target.value)} style={input} /></Field>
          </div>
          <span style={{ marginTop: "-6px", fontSize: "12.5px", color: "#A8ADA3" }}>C&apos;est le montant proposé quand tu valides un clip : tu peux le changer clip par clip, et ajouter un bonus à un clip qui cartonne.</span>
          <Field id="c-rushes" label="Lien des rushs (Drive, Dropbox…)"><input id="c-rushes" type="url" placeholder="https://…" value={form.rushes_url} onChange={(event) => v.setField("rushes_url", event.target.value)} style={input} /></Field>
          <Field id="c-brief" label="Brief (une consigne par ligne)"><textarea id="c-brief" maxLength={2000} value={form.brief} onChange={(event) => v.setField("brief", event.target.value)} style={area} /></Field>
          <Field id="c-forbidden" label="Interdits"><textarea id="c-forbidden" maxLength={600} value={form.forbidden} onChange={(event) => v.setField("forbidden", event.target.value)} style={{ ...area, minHeight: "70px" }} /></Field>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button type="submit" disabled={v.busy} style={S.primary}>{form.id ? "Enregistrer" : "Créer la campagne"}</button>
            <button type="button" onClick={v.closeForm} style={S.ghost}>Annuler</button>
          </div>
        </form>
      ) : null}
      <Pills label="Filtrer les campagnes" items={v.filters} value={v.filter} onPick={v.setFilter} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
        {v.cards.map((card) => (
          <CampaignCardView key={card.id} card={card}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: "12.5px", color: "#C4C8BD" }}>{card.rules}</span>
              {card.brief ? <span style={{ fontSize: "12.5px", color: "#A8ADA3", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.brief}</span> : null}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button type="button" onClick={() => v.edit(card.id)} style={S.ghost}>Modifier</button>
              {card.rushes ? <a href={card.rushes} target="_blank" rel="noopener noreferrer" style={S.ghost}>Rushs<Icon name="external" size={14} /></a> : null}
            </div>
          </CampaignCardView>
        ))}
        {!v.cards.length ? <div style={{ ...S.card, flex: "1 1 280px", fontSize: "13px", color: "#A8ADA3" }}>{v.emptyLabel}</div> : null}
      </div>
    </>
  );
}
