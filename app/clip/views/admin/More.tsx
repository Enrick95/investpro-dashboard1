"use client";

import { Icon, S, Soon } from "./kit";
import { SortRules } from "./Candidates";

/** WhatsApp, barème et charte, réglages : écrans d'information de l'admin. */

export type RulesVals = { rate: string; rateSub: string; minViews: string; cap: string; vip: string; minPayout: string; reasons: string[]; onCampaigns: () => void };
export type SettingsVals = { rows: { label: string; value: string; note?: string; soon?: boolean; copy?: () => void; copied?: boolean }[] };

function Lines({ items, tone }: { items: string[]; tone: "ok" | "bad" }) {
  return (
    <ul style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
      {items.map((item) => (
        <li key={item} style={{ display: "flex", gap: "10px", fontSize: "13.5px", color: "#C4C8BD" }}>
          <Icon name={tone === "ok" ? "check" : "x"} size={16} stroke="2.4" color={tone === "ok" ? "#91D6D0" : "#FF6F91"} style={{ flexShrink: "0", marginTop: "2px" }} />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function AdminWhatsApp({ onCandidates }: { onCandidates: () => void }) {
  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#A8ADA3" }}><span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#8E938A" }} />Pas encore connecté · on le branche dès que tu me donnes ton numéro</span>
          <h1 style={S.h1}>WhatsApp</h1>
        </div>
        <span style={{ maxWidth: "460px", fontSize: "13px", color: "#A8ADA3" }}>Chaque message sera rangé dans une file selon ses mots-clés. Tu répondras d&apos;ici ou de ton téléphone : tout restera synchronisé.</span>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-start" }}>
        <section aria-labelledby="t-wa" style={{ flex: "2 1 460px", minWidth: "0", padding: "24px", borderRadius: "20px", background: "#15170f", border: "1px solid rgba(240,197,117,0.45)", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 id="t-wa" style={S.h2}>Ton WhatsApp dans le dashboard</h2>
            <Soon />
          </div>
          <Lines tone="ok" items={[
            "Les messages qui parlent de clips arrivent dans la file Clips, avec une réponse auto qui envoie ton lien d'inscription.",
            "Les messages Conférences et VIP sont rangés dans leur propre file.",
            "Les autres messages restent seulement dans ton appli WhatsApp : rien de privé ici.",
            "Tu valides, mets en test ou refuses un candidat, et le message part tout seul.",
          ]} />
          <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#181c16", fontSize: "13px", color: "#C4C8BD" }}>Ce qu&apos;il me faut pour le brancher : ton numéro WhatsApp Business (celui de Bali). En attendant, les candidatures arrivent par ton lien d&apos;inscription et tu réponds avec les raccourcis WhatsApp de chaque fiche.</div>
          <button type="button" onClick={onCandidates} style={{ ...S.primary, alignSelf: "flex-start" }}>Voir les candidatures<Icon name="arrow" /></button>
        </section>
        <div style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
          <SortRules soon />
        </div>
      </div>
    </>
  );
}

export function AdminRules({ v }: { v: RulesVals }) {
  const tiles = [
    { icon: "eye", title: v.rate, sub: v.rateSub },
    { icon: "clock", title: "Vues figées à J+7", sub: "comptées 7 jours après la publication" },
    { icon: "link", title: v.vip, sub: "ramené via son lien traqué" },
    { icon: "wallet", title: `Seuil de ${v.minPayout}`, sub: "en dessous, reporté au cycle suivant" },
  ];
  const card = { ...S.card, gap: "12px", flex: "1 1 340px", minWidth: "0" };
  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={S.eyebrow}>Ce que les clippeurs voient dans leur charte et leurs campagnes</span>
          <h1 style={S.h1}>Barème et charte</h1>
        </div>
        <button type="button" onClick={v.onCampaigns} style={S.ghost}>Modifier le barème d&apos;une campagne</button>
      </header>
      <section aria-labelledby="t-bareme-regles" style={{ padding: "20px 22px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(240,197,117,0.18)", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "10px" }}>
          <h2 id="t-bareme-regles" style={S.h2}>Barème</h2>
          <span style={S.sub}>à partir de {v.minViews} vues par clip, jusqu&apos;à {v.cap} par clip · versements le 1er et le 16</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {tiles.map((tile) => (
            <div key={tile.title} style={{ flex: "1 1 200px", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "14px", background: "#181c16" }}>
              <span aria-hidden="true" style={{ flexShrink: "0", width: "36px", height: "36px", borderRadius: "11px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(240,197,117,0.12)", color: "#F0C575" }}><Icon name={tile.icon} size={18} stroke="1.9" /></span>
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: "800" }}>{tile.title}</span>
                <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{tile.sub}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "stretch" }}>
        <section style={card}>
          <h2 style={S.h3}>Dans chaque clip</h2>
          <Lines tone="ok" items={["Sous-titres lisibles et accroche dans les 2 premières secondes.", "Le brief de la campagne est respecté.", "Le lien traqué du clippeur est dans sa bio.", "Le clip est publié sur un compte de son profil."]} />
        </section>
        <section style={card}>
          <h2 style={S.h3}>Interdit</h2>
          <Lines tone="bad" items={["Promettre des gains ou montrer des montants gagnés en accroche.", "Utiliser le logo ou le contenu d'autres créateurs.", "Acheter des vues ou publier sur des comptes qui ne lui appartiennent pas."]} />
        </section>
        <section style={card}>
          <h2 style={S.h3}>Paiement</h2>
          <Lines tone="ok" items={[`${v.rate}, vues figées 7 jours après la publication.`, `À partir de ${v.minViews} vues par clip, jusqu'à ${v.cap} par clip.`, `${v.vip} par membre VIP ramené avec son lien.`, `Versements le 1er et le 16 du mois, dès ${v.minPayout} acquis.`]} />
        </section>
        <section style={card}>
          <h2 style={S.h3}>Si une règle n&apos;est pas respectée</h2>
          <Lines tone="bad" items={["Le clip est refusé et ne rapporte rien : le clippeur voit le motif.", "Des vues suspectes bloquent le paiement le temps de vérifier.", "En cas de récidive, le compte clippeur est mis en pause."]} />
        </section>
      </div>
      <section aria-labelledby="t-motifs" style={{ ...S.card, gap: "12px" }}>
        <h2 id="t-motifs" style={S.h2}>Motifs de refus</h2>
        <span style={S.sub}>Proposés quand tu refuses un clip ; le clippeur voit le motif choisi.</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {v.reasons.map((reason) => <span key={reason} style={{ padding: "8px 12px", borderRadius: "999px", background: "#181c16", border: "1px solid rgba(255,255,255,0.08)", fontSize: "13px", color: "#C4C8BD" }}>{reason}</span>)}
        </div>
      </section>
    </>
  );
}

export function AdminSettings({ v }: { v: SettingsVals }) {
  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={S.eyebrow}>Les réglages du programme clippeurs</span>
          <h1 style={S.h1}>Réglages</h1>
        </div>
      </header>
      <section aria-label="Réglages" style={{ ...S.card, padding: "8px 22px" }}>
        {v.rows.map((row, index) => (
          <div key={row.label} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px 16px", minHeight: "64px", padding: "10px 0", borderTop: index ? "1px solid rgba(255,255,255,0.06)" : "0" }}>
            <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0", flex: "1 1 220px" }}>
              <span style={{ fontWeight: "700" }}>{row.label}</span>
              {row.note ? <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{row.note}</span> : null}
            </span>
            <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: "10px", minWidth: "0", flex: "1 1 260px" }}>
              <span style={{ fontWeight: "700", color: "#C4C8BD", textAlign: "right", overflowWrap: "anywhere" }}>{row.value}</span>
              {row.soon ? <Soon /> : null}
              {row.copy ? <button type="button" onClick={row.copy} style={S.ghost}><Icon name="copy" stroke="1.9" />{row.copied ? "Copié" : "Copier"}</button> : null}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
