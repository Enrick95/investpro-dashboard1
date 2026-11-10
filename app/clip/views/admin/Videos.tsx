"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Chip, Icon, S } from "./kit";

/** Vidéos tournées par Enrick : les clippeurs les voient en haut de leur onglet Campagnes. */

export type VideoFormData = { id: string | null; title: string; url: string; note: string; campaign_id: string };
export type AdminVideoItem = { id: string; title: string; url: string; note: string | null; meta: string; isNew: boolean };
export type AdminVideosVals = {
  subline: string;
  items: AdminVideoItem[];
  campaigns: { id: string; title: string }[];
  form: VideoFormData | null;
  openNew: () => void;
  edit: (id: string) => void;
  closeForm: () => void;
  setField: (key: keyof VideoFormData, value: string) => void;
  save: () => void;
  remove: (id: string) => void;
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

const STEPS = [
  "Tu tournes ta vidéo et tu la mets sur Google Drive (partage : « tous ceux qui ont le lien »).",
  "Tu colles le lien ici avec un titre et, si tu veux, une consigne.",
  "Les clippeurs la voient en haut de leur onglet Campagnes avec un badge « Nouveau », la découpent et soumettent leurs clips.",
];

export function AdminVideos({ v }: { v: AdminVideosVals }) {
  const form = v.form;
  const [confirmId, setConfirmId] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    v.save();
  }
  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={S.eyebrow}>{v.subline}</span>
          <h1 style={S.h1}>Vidéos</h1>
        </div>
        {!form ? <button type="button" onClick={v.openNew} style={S.primary}><Icon name="plus" size={18} stroke="2.2" />Ajouter une vidéo</button> : null}
      </header>
      {form ? (
        <form onSubmit={submit} aria-labelledby="t-video-form" style={{ padding: "22px", borderRadius: "20px", background: "#15170f", border: "1px solid rgba(240,197,117,0.45)", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <h2 id="t-video-form" style={S.h2}>{form.id ? "Modifier la vidéo" : "Nouvelle vidéo"}</h2>
            <span style={S.sub}>Les clippeurs voient le titre, la consigne et le lien. Vérifie que le lien s&apos;ouvre sans demander d&apos;accès.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
            <Field id="v-title" label="Titre"><input id="v-title" required minLength={2} maxLength={120} placeholder="Ex. Live du 12 novembre, setup Gold" value={form.title} onChange={(event) => v.setField("title", event.target.value)} style={input} /></Field>
            <Field id="v-campaign" label="Campagne">
              <select id="v-campaign" value={form.campaign_id} onChange={(event) => v.setField("campaign_id", event.target.value)} style={input}>
                <option value="">Toutes les campagnes</option>
                {v.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}
              </select>
            </Field>
          </div>
          <Field id="v-url" label="Lien de la vidéo (Drive, Dropbox, YouTube…)"><input id="v-url" type="url" required placeholder="https://drive.google.com/…" value={form.url} onChange={(event) => v.setField("url", event.target.value)} style={input} /></Field>
          <Field id="v-note" label="Consigne pour les clippeurs (facultatif)"><textarea id="v-note" maxLength={600} placeholder="Ex. Garde le passage sur la cassure de 14 min à 18 min, sous-titres obligatoires." value={form.note} onChange={(event) => v.setField("note", event.target.value)} style={{ ...input, minHeight: "90px", padding: "10px 12px", resize: "vertical", lineHeight: "1.45" }} /></Field>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button type="submit" disabled={v.busy} style={S.primary}>{form.id ? "Enregistrer" : "Publier pour les clippeurs"}</button>
            <button type="button" onClick={v.closeForm} style={S.ghost}>Annuler</button>
          </div>
        </form>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-start" }}>
        <section aria-labelledby="t-videos-list" style={{ ...S.card, flex: "2 1 460px", minWidth: "0", padding: "22px 22px 10px" }}>
          <h2 id="t-videos-list" style={{ ...S.h2, paddingBottom: "12px" }}>Vidéos publiées</h2>
          {v.items.map((item) => (
            <article key={item.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ flex: "1 1 260px", minWidth: "0", display: "flex", gap: "12px" }}>
                <span aria-hidden="true" style={{ flexShrink: "0", width: "40px", height: "40px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(240,197,117,0.12)", color: "#F0C575" }}><Icon name="film" size={19} stroke="1.9" /></span>
                <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: "800", color: "#F3EFE6", textDecoration: "none", overflowWrap: "anywhere" }}>{item.title}</a>
                    {item.isNew ? <Chip tone="gold">Nouveau</Chip> : null}
                  </span>
                  <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{item.meta}</span>
                  {item.note ? <span style={{ fontSize: "13px", color: "#C4C8BD", whiteSpace: "pre-wrap" }}>{item.note}</span> : null}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ ...S.ghost, minHeight: "40px", padding: "0 12px" }}>Ouvrir<Icon name="external" size={14} /></a>
                <button type="button" onClick={() => { setConfirmId(null); v.edit(item.id); }} style={{ ...S.ghost, minHeight: "40px", padding: "0 12px" }}>Modifier</button>
                {confirmId === item.id ? (
                  <button type="button" disabled={v.busy} onClick={() => { setConfirmId(null); v.remove(item.id); }} style={{ ...S.danger, minHeight: "40px" }}>Confirmer</button>
                ) : (
                  <button type="button" aria-label={`Retirer ${item.title}`} onClick={() => setConfirmId(item.id)} style={{ ...S.danger, minHeight: "40px", gap: "6px" }}><Icon name="trash" size={15} stroke="1.9" />Retirer</button>
                )}
              </div>
            </article>
          ))}
          {!v.items.length ? <div style={{ padding: "16px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#A8ADA3" }}>Aucune vidéo pour l&apos;instant. Ajoute le lien d&apos;une vidéo que tu as tournée : les clippeurs la verront tout de suite.</div> : null}
        </section>
        <section aria-labelledby="t-videos-how" style={{ ...S.card, flex: "1 1 300px", minWidth: "0", gap: "12px" }}>
          <h2 id="t-videos-how" style={S.h2}>Comment ça marche</h2>
          <ol style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
            {STEPS.map((step, index) => (
              <li key={step} style={{ display: "flex", gap: "10px", fontSize: "13px", color: "#C4C8BD" }}>
                <span aria-hidden="true" style={{ flexShrink: "0", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(240,197,117,0.14)", color: "#F0C575", fontSize: "12px", fontWeight: "800" }}>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>Une vidéo reste marquée « Nouveau » pendant 3 jours dans l&apos;espace des clippeurs. Les clips qu&apos;ils en tirent arrivent dans « Clips à valider », comme les autres.</span>
        </section>
      </div>
    </>
  );
}
