"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Chip, Icon, S } from "./kit";

/**
 * Vidéos tournées par Enrick : les clippeurs les voient en haut de leur onglet Campagnes
 * et sont prévenus à la publication (notification sur leur téléphone + e-mail).
 */

export type VideoFormData = { id: string | null; title: string; url: string; note: string; campaign_id: string };
export type AdminVideoItem = { id: string; title: string; url: string; note: string | null; meta: string; isNew: boolean; whatsapp: string };
/** Bilan affiché juste après la publication, avec le message WhatsApp prêt à envoyer. */
export type PublishedNotice = { title: string; line: string; tone: "ok" | "warn"; whatsapp: string };
export type AdminVideosVals = {
  subline: string;
  items: AdminVideoItem[];
  campaigns: { id: string; title: string }[];
  form: VideoFormData | null;
  openNew: () => void;
  edit: (id: string) => void;
  closeForm: () => void;
  setField: (key: keyof VideoFormData, value: string) => void;
  notify: boolean;
  setNotify: (value: boolean) => void;
  published: PublishedNotice | null;
  dismissPublished: () => void;
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
  "Les clippeurs sont prévenus tout de suite : notification sur leur téléphone, e-mail et bandeau « Nouveau » dans leur espace.",
  "Ils la découpent et soumettent leurs clips, que tu valides dans « Clips à valider ».",
];

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return <Icon name="chat" size={size} stroke="2" />;
}

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
          {!form.id ? (
            <label htmlFor="v-notify" style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 14px", borderRadius: "14px", background: "rgba(240,197,117,0.07)", border: "1px solid rgba(240,197,117,0.28)", cursor: "pointer" }}>
              <input id="v-notify" type="checkbox" checked={v.notify} onChange={(event) => v.setNotify(Boolean(event.target.checked))} style={{ width: "20px", height: "20px", margin: "1px 0 0", accentColor: "#F0C575", flexShrink: "0" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontWeight: "800", color: "#F3EFE6" }}>Prévenir les clippeurs</span>
                <span style={S.sub}>Notification sur leur téléphone (s&apos;ils l&apos;ont activée) et e-mail, dès que tu publies.</span>
              </span>
            </label>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button type="submit" disabled={v.busy} style={S.primary}>{form.id ? "Enregistrer" : "Publier pour les clippeurs"}</button>
            <button type="button" onClick={v.closeForm} style={S.ghost}>Annuler</button>
          </div>
        </form>
      ) : null}
      {v.published ? (
        <section role="status" aria-label="Vidéo publiée" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "16px 18px", borderRadius: "18px", background: v.published.tone === "ok" ? "rgba(145,214,208,0.07)" : "rgba(242,180,90,0.08)", border: v.published.tone === "ok" ? "1px solid rgba(145,214,208,0.35)" : "1px solid rgba(242,180,90,0.4)" }}>
          <span style={{ flex: "1 1 280px", minWidth: "0", display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ flexShrink: "0", width: "36px", height: "36px", borderRadius: "11px", display: "flex", alignItems: "center", justifyContent: "center", background: v.published.tone === "ok" ? "rgba(145,214,208,0.14)" : "rgba(242,180,90,0.14)", color: v.published.tone === "ok" ? "#91D6D0" : "#F2B45A" }}><Icon name={v.published.tone === "ok" ? "check" : "alert"} size={18} stroke="2.2" /></span>
            <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
              <span style={{ fontWeight: "800", color: "#F3EFE6", overflowWrap: "anywhere" }}>« {v.published.title} » est en ligne</span>
              <span style={{ fontSize: "13px", color: "#C4C8BD" }}>{v.published.line}</span>
            </span>
          </span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <a href={v.published.whatsapp} target="_blank" rel="noopener noreferrer" style={{ ...S.primary, minHeight: "42px" }}><WhatsAppIcon />Prévenir aussi sur WhatsApp</a>
            <button type="button" onClick={v.dismissPublished} aria-label="Fermer" style={{ ...S.ghost, minHeight: "42px", padding: "0 12px" }}><Icon name="x" size={15} /></button>
          </span>
        </section>
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
                <a href={item.whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Partager ${item.title} sur WhatsApp`} style={{ ...S.ghost, minHeight: "40px", padding: "0 12px" }}><WhatsAppIcon size={15} />WhatsApp</a>
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
          <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>Une vidéo reste marquée « Nouveau » pendant 3 jours dans l&apos;espace des clippeurs. Le bouton WhatsApp ouvre ton WhatsApp avec le message prêt : choisis ta liste de diffusion ou ton groupe de clippeurs et envoie.</span>
        </section>
      </div>
    </>
  );
}
