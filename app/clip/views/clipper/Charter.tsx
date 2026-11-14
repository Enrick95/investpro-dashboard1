"use client";

import { go } from "./Shell";

export type CharterVals = { minPayout: string; referral: string; onBack: () => void };

const card = { padding: "16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "10px" } as const;

function Lines({ items, tone }: { items: string[]; tone: "ok" | "bad" }) {
  return (
    <ul style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
      {items.map((item) => (
        <li key={item} style={{ display: "flex", gap: "10px", fontSize: "13.5px", color: "#C4C8BD" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={tone === "ok" ? "#91D6D0" : "#FF6F91"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: "0", marginTop: "2px" }}>
            {tone === "ok" ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />}
          </svg>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ClipperCharter({ v }: { v: CharterVals }) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <a href="#profil" onClick={go(v.onBack)} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", minHeight: "36px", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>← Mon profil</a>
        <h1 style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "24px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>Charte du clippeur</h1>
        <span style={{ fontSize: "13px", color: "#A8ADA3" }}>Les règles qui s&apos;appliquent à chaque clip.</span>
      </div>
      <section style={card}>
        <h2 style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Dans chaque clip</h2>
        <Lines tone="ok" items={["Sous-titres lisibles et accroche dans les 2 premières secondes.", "Le brief de la campagne est respecté.", "Ton lien traqué est dans ta bio pour que les membres ramenés te soient comptés.", "Le clip est publié sur un compte de ton profil."]} />
      </section>
      <section style={card}>
        <h2 style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Interdit</h2>
        <Lines tone="bad" items={["Promettre des gains ou montrer des montants gagnés en accroche.", "Utiliser le logo ou le contenu d'autres créateurs.", "Acheter des vues ou des j'aime, booster le clip avec une pub payée (Promote) ou publier sur des comptes qui ne t'appartiennent pas."]} />
      </section>
      <section style={card}>
        <h2 style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Paiement</h2>
        <Lines tone="ok" items={["Enrick valide un clip quand il a fait assez de vues et d'engagement. En attendant, il compte déjà dans le classement.", "Chaque clip validé par Enrick te rapporte de l'argent : tu vois le montant sur le clip dès qu'il est validé.", "Un clip qui cartonne peut recevoir un bonus en plus.", v.referral, `Versements le 1er et le 16 du mois, dès ${v.minPayout} acquis.`]} />
      </section>
      <section style={card}>
        <h2 style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Si une règle n&apos;est pas respectée</h2>
        <Lines tone="bad" items={["Le clip est refusé et ne rapporte rien : tu reçois le motif.", "Vues ou j'aime achetés, pub payée ou compte qui n'est pas à toi : le clip est refusé.", "En cas de récidive, le compte clippeur est mis en pause."]} />
      </section>
    </>
  );
}
