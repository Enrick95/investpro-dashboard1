"use client";

import { Icon, S, Soon } from "./kit";
import { SortRules } from "./Candidates";

/** WhatsApp, paiement et charte, réglages : écrans d'information de l'admin. */

export type RulesVals = { amount: string; referralBonus: string; referralClips: number; minPayout: string; reasons: string[]; onCampaigns: () => void };
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

export type WhatsAppVals = {
  number: string;
  greeting: string;
  quickReply: string;
  /** Exemple du message tout prêt qu'un candidat t'envoie après avoir postulé. */
  candidateMessage: string;
  copied: string | null;
  copy: (key: string, text: string) => void;
  onCandidates: () => void;
};

function CopyBlock({ id, title, hint, text, v }: { id: string; title: string; hint: string; text: string; v: WhatsAppVals }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "14px", background: "#181c16" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <h3 style={S.h3}>{title}</h3>
        <button type="button" onClick={() => v.copy(id, text)} style={{ ...S.ghost, minHeight: "40px" }}><Icon name={v.copied === id ? "check" : "copy"} stroke="1.9" />{v.copied === id ? "Copié" : "Copier le texte"}</button>
      </div>
      <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{hint}</span>
      <p style={{ margin: "0", padding: "12px 14px", borderRadius: "12px", background: "#0f110e", border: "1px solid rgba(255,255,255,0.08)", fontSize: "13.5px", lineHeight: "1.5", color: "#F3EFE6", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</p>
    </div>
  );
}

export function AdminWhatsApp({ v }: { v: WhatsAppVals }) {
  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#A8ADA3" }}><span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F2B45A" }} />Ton numéro {v.number} · pas encore relié au site</span>
          <h1 style={S.h1}>WhatsApp</h1>
        </div>
        <span style={{ maxWidth: "460px", fontSize: "13px", color: "#A8ADA3" }}>Les candidats te préviennent en un clic après leur inscription, et tu leur réponds en un clic depuis le site. Rien à installer.</span>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-start" }}>
        <div style={{ flex: "2 1 460px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
          <section aria-labelledby="t-wa-flow" style={{ padding: "22px", borderRadius: "20px", background: "#15170f", border: "1px solid rgba(240,197,117,0.45)", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <h2 id="t-wa-flow" style={S.h2}>Un nouveau clippeur, étape par étape</h2>
              <span style={S.sub}>Déjà en place sur le site, gratuit.</span>
            </div>
            <ol style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                "Il s'inscrit sur le site : il crée son compte et remplit sa candidature.",
                "Il appuie sur « Prévenir Enrick sur WhatsApp » : le message ci-dessous t'arrive, déjà écrit.",
                "Tu ouvres Candidatures et tu l'acceptes (ou tu le mets en test) : son espace se débloque tout de suite.",
                "Tu lui réponds en un clic avec le message de bienvenue, depuis sa candidature.",
              ].map((step, index) => (
                <li key={step} style={{ display: "flex", gap: "10px", fontSize: "13.5px", color: "#C4C8BD" }}>
                  <span aria-hidden="true" style={{ flexShrink: "0", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(240,197,117,0.14)", color: "#F0C575", fontSize: "12px", fontWeight: "800" }}>{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "14px", background: "#181c16" }}>
              <h3 style={S.h3}>Le message que tu reçois</h3>
              <p style={{ margin: "0", padding: "12px 14px", borderRadius: "12px", background: "#0f110e", border: "1px solid rgba(255,255,255,0.08)", fontSize: "13.5px", lineHeight: "1.5", color: "#F3EFE6", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{v.candidateMessage}</p>
              <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>Astuce : dans WhatsApp Business, mets l&apos;étiquette « Clip » sur ces discussions (appui long › Étiqueter) pour ne pas les mélanger avec le reste.</span>
            </div>
            <button type="button" onClick={v.onCandidates} style={{ ...S.primary, alignSelf: "flex-start" }}>Voir les candidatures<Icon name="arrow" /></button>
          </section>
          <section aria-labelledby="t-wa-now" style={{ ...S.card, gap: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <h2 id="t-wa-now" style={S.h2}>Pour ceux qui t&apos;écrivent avant de s&apos;inscrire</h2>
              <span style={S.sub}>Dans ton appli WhatsApp Business : Réglages › Outils professionnels. À activer le jour où l&apos;espace clippeurs est en ligne, pour que le lien marche.</span>
            </div>
            <CopyBlock id="wa-greeting" title="Message d'accueil" hint="WhatsApp Business l'envoie tout seul quand un nouveau contact t'écrit pour la première fois." text={v.greeting} v={v} />
            <CopyBlock id="wa-quick" title="Réponse rapide « /clip »" hint="Tu tapes /clip dans une discussion, le message s'écrit tout seul." text={v.quickReply} v={v} />
          </section>
          <section aria-labelledby="t-wa-auto" style={{ ...S.card, gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 id="t-wa-auto" style={S.h2}>Le tri automatique</h2>
              <Soon />
            </div>
            <Lines tone="ok" items={[
              "Les messages qui parlent de clips arrivent dans la file Clips, avec une réponse auto qui envoie ton lien d'inscription.",
              "Les messages Conférences et VIP sont rangés dans leur propre file.",
              "Les autres messages restent seulement dans ton appli : rien de privé ici.",
              "Tu acceptes, mets en test ou refuses un candidat, et le message part tout seul.",
            ]} />
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 14px", borderRadius: "14px", background: "#181c16", fontSize: "13px", color: "#C4C8BD" }}>
              <span style={{ fontWeight: "800", color: "#F3EFE6" }}>Pour le brancher</span>
              <span>1. Ton numéro doit être sur l&apos;appli WhatsApp Business (pas WhatsApp normal) depuis au moins 7 jours.</span>
              <span>2. On le relie au site via un partenaire officiel de Meta, en scannant un QR code. Tu gardes ton appli et tes discussions.</span>
              <span>3. Les messages tapés dans ton appli restent gratuits ; ceux envoyés par le site sont facturés par Meta, plus l&apos;abonnement du partenaire.</span>
            </div>
          </section>
        </div>
        <div style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
          <SortRules soon />
        </div>
      </div>
    </>
  );
}

export function AdminRules({ v }: { v: RulesVals }) {
  const tiles = [
    { icon: "film", title: `${v.amount} par clip validé`, sub: "proposé par défaut, tu le changes à chaque validation" },
    { icon: "trend", title: "Bonus à ta main", sub: "sur un clip qui cartonne" },
    { icon: "gift", title: `Parrainage ${v.referralBonus}`, sub: `quand un filleul a ${v.referralClips} clips validés` },
    { icon: "wallet", title: `Seuil de ${v.minPayout}`, sub: "en dessous, reporté au cycle suivant" },
  ];
  const card = { ...S.card, gap: "12px", flex: "1 1 340px", minWidth: "0" };
  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={S.eyebrow}>Comment tu paies les clippeurs, et la charte qu&apos;ils voient</span>
          <h1 style={S.h1}>Paiement et charte</h1>
        </div>
        <button type="button" onClick={v.onCampaigns} style={S.ghost}>Changer le montant d&apos;une campagne</button>
      </header>
      <section aria-labelledby="t-bareme-regles" style={{ padding: "20px 22px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(240,197,117,0.18)", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "10px" }}>
          <h2 id="t-bareme-regles" style={S.h2}>Paiement</h2>
          <span style={S.sub}>les clippeurs ne voient aucun tarif : seulement ce que chaque clip validé leur a rapporté · versements le 1er et le 16</span>
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
          <h2 style={S.h3}>Paiement, côté clippeur</h2>
          <Lines tone="ok" items={["Chaque clip validé rapporte : il voit le montant une fois le clip validé, jamais avant.", "Un bonus peut s'ajouter sur un clip qui cartonne.", `Parrainage : ${v.referralBonus} quand un clippeur invité avec son lien a ${v.referralClips} clips validés.`, `Versements le 1er et le 16 du mois, dès ${v.minPayout} acquis.`]} />
        </section>
        <section style={card}>
          <h2 style={S.h3}>Si une règle n&apos;est pas respectée</h2>
          <Lines tone="bad" items={["Le clip est refusé et ne rapporte rien : le clippeur voit le motif.", "Vues achetées ou compte qui n'est pas à lui : clip refusé.", "En cas de récidive, le compte clippeur est mis en pause."]} />
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
