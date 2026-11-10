"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { isClipStandalone, openClipInstall } from "../InstallClip";
import { go } from "./Shell";

export type ProfileAccount = { id: string; short: string; handle: string; sub: string; verified: boolean };
export type ProfileMethod = { key: string; name: string; detail: string; on: boolean; hint: string };
export type ProfileVals = {
  initials: string;
  name: string;
  refLine: string;
  status: "active" | "test" | "paused";
  accounts: ProfileAccount[];
  methods: ProfileMethod[];
  payoutDetails: string;
  infos: { key: "display_name" | "whatsapp" | "telegram"; label: string; value: string; placeholder: string }[];
  payoutCount: number;
  contact: { label: string; href: string };
  owner: boolean;
  message: { kind: "ok" | "error"; text: string } | null;
  busy: boolean;
  addAccount: (platform: string, handle: string, followers: string) => Promise<boolean>;
  removeAccount: (id: string) => Promise<boolean>;
  savePayout: (method: string, details: string) => Promise<boolean>;
  saveInfo: (key: "display_name" | "whatsapp" | "telegram", value: string) => Promise<boolean>;
  changePassword: (current: string, next: string) => Promise<boolean>;
  onCharter: () => void;
  onPayments: () => void;
  signOut: () => void;
};

const card = { padding: "16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "10px" } as const;
const field = { width: "100%", minHeight: "48px", padding: "0 12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.14)", background: "#181c16", color: "#F3EFE6", fontFamily: "Manrope, system-ui, sans-serif", fontSize: "14px" } as const;
const label = { fontSize: "12px", fontWeight: "700", color: "#C4C8BD" } as const;
const primary = { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "44px", padding: "0 16px", borderRadius: "12px", border: "0", background: "#F0C575", color: "#0b0d0b", fontSize: "13px", fontWeight: "800" } as const;
const ghost = { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "44px", padding: "0 14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#F3EFE6", fontSize: "13px", fontWeight: "700" } as const;
const NOTIFS = ["Clip validé ou refusé", "Paiement envoyé", "Nouvelle campagne"];

function StatusChip({ status }: { status: ProfileVals["status"] }) {
  const tone = status === "active" ? { bg: "rgba(145,214,208,0.12)", color: "#91D6D0", label: "Actif" } : status === "test" ? { bg: "rgba(255,255,255,0.07)", color: "#C4C8BD", label: "Période de test" } : { bg: "rgba(255,111,145,0.12)", color: "#FF6F91", label: "En pause" };
  return <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "999px", background: tone.bg, color: tone.color, fontSize: "12px", fontWeight: "700" }}><span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: tone.color }} />{tone.label}</span>;
}

export function ClipperProfile({ v }: { v: ProfileVals }) {
  const [adding, setAdding] = useState(false);
  const [platform, setPlatform] = useState("tiktok");
  const [handle, setHandle] = useState("");
  const [followers, setFollowers] = useState("");
  const selected = v.methods.find((method) => method.on)?.key ?? null;
  const [method, setMethod] = useState<string | null>(selected);
  const [details, setDetails] = useState(v.payoutDetails);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  // Masqué quand l'espace tourne déjà comme une app installée.
  const [installable, setInstallable] = useState(false);
  useEffect(() => setInstallable(!isClipStandalone()), []);

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await v.addAccount(platform, handle, followers)) {
      setHandle("");
      setFollowers("");
      setAdding(false);
    }
  }

  const currentMethod = v.methods.find((item) => item.key === method);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <span aria-hidden="true" style={{ flexShrink: "0", width: "64px", height: "64px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(240,197,117,0.14)", border: "1px solid rgba(240,197,117,0.4)", color: "#F0C575", fontFamily: "Unbounded, sans-serif", fontSize: "20px", fontWeight: "500" }}>{v.initials}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
          <h1 style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "22px", letterSpacing: "-0.02em", lineHeight: "1.2" }}>{v.name}</h1>
          <span style={{ fontSize: "13px", color: "#A8ADA3" }}>{v.refLine}</span>
          <StatusChip status={v.status} />
        </div>
      </div>
      {v.message ? <p role="status" style={{ margin: "0", padding: "12px 14px", borderRadius: "14px", background: v.message.kind === "ok" ? "rgba(145,214,208,0.08)" : "rgba(255,111,145,0.08)", border: v.message.kind === "ok" ? "1px solid rgba(145,214,208,0.35)" : "1px solid rgba(255,111,145,0.3)", color: v.message.kind === "ok" ? "#91D6D0" : "#FF6F91", fontSize: "13px", fontWeight: "700" }}>{v.message.text}</p> : null}

      <section aria-labelledby="t-comptes" style={{ ...card, gap: "6px" }}>
        <h2 id="t-comptes" style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Mes comptes</h2>
        <span style={{ fontSize: "12.5px", color: "#A8ADA3", paddingBottom: "6px" }}>Les comptes sur lesquels tu publies tes clips. Enrick les vérifie avant de valider tes clips.</span>
        {v.accounts.map((account) => (
          <div key={account.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span aria-hidden="true" style={{ flexShrink: "0", width: "40px", height: "40px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "#181c16", border: "1px solid rgba(255,255,255,0.1)", color: "#C4C8BD", fontSize: "12px", fontWeight: "800" }}>{account.short}</span>
            <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{account.handle}</span>
              <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{account.sub}</span>
            </span>
            {account.verified ? (
              <span style={{ flexShrink: "0", display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 9px", borderRadius: "999px", background: "rgba(145,214,208,0.12)", color: "#91D6D0", fontSize: "12px", fontWeight: "700" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>Vérifié</span>
            ) : (
              <span style={{ flexShrink: "0", display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 9px", borderRadius: "999px", background: "rgba(242,180,90,0.12)", color: "#F2B45A", fontSize: "12px", fontWeight: "700" }}>À vérifier</span>
            )}
            <button type="button" aria-label={`Retirer @${account.handle}`} disabled={v.busy} onClick={() => void v.removeAccount(account.id)} style={{ flexShrink: "0", width: "36px", height: "44px", border: "0", background: "transparent", color: "#8E938A", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7" />
              </svg>
            </button>
          </div>
        ))}
        {!v.accounts.length ? <span style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", fontWeight: "700", color: "#F2B45A" }}>Aucun compte pour l&apos;instant : ajoute celui sur lequel tu publies.</span> : null}
        {adding ? (
          <form onSubmit={submitAccount} style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={label}>Réseau</span>
                <select value={platform} onChange={(event) => setPlatform(event.target.value)} style={field}>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                  <option value="facebook">Facebook</option>
                  <option value="snapchat">Snapchat</option>
                  <option value="x">X (Twitter)</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={label}>Abonnés</span>
                <input inputMode="numeric" placeholder="Ex. 12400" value={followers} onChange={(event) => setFollowers(event.target.value.replace(/[^0-9]/g, ""))} style={field} />
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={label}>Nom du compte</span>
              <input placeholder="@ton.compte" value={handle} onChange={(event) => setHandle(event.target.value)} style={field} />
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="submit" disabled={v.busy || !handle.trim()} style={{ ...primary, flex: "1 1 auto" }}>Ajouter ce compte</button>
              <button type="button" onClick={() => setAdding(false)} style={ghost}>Annuler</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} style={{ ...ghost, marginTop: "6px" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>Ajouter un compte</button>
        )}
      </section>

      <section aria-labelledby="t-pay" style={card}>
        <h2 id="t-pay" style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Moyen de paiement</h2>
        <div role="group" aria-label="Choisir mon moyen de paiement" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
          {v.methods.map((item) => {
            const on = method === item.key;
            return (
              <button key={item.key} type="button" aria-pressed={on} onClick={() => { setMethod(item.key); if (item.key !== selected) setDetails(""); else setDetails(v.payoutDetails); }} style={on
                ? { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", minHeight: "64px", padding: "10px 12px", borderRadius: "14px", border: "1.5px solid #F0C575", background: "rgba(240,197,117,0.08)", color: "#F3EFE6", textAlign: "left" }
                : { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", minHeight: "64px", padding: "10px 12px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.14)", background: "#181c16", color: "#F3EFE6", textAlign: "left" }}>
                <span style={{ fontWeight: "800", fontSize: "13.5px" }}>{item.name}</span>
                <span style={{ fontSize: "12px", color: "#A8ADA3", overflowWrap: "anywhere" }}>{item.detail}</span>
              </button>
            );
          })}
        </div>
        {currentMethod ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={label}>{currentMethod.hint}</span>
              <input maxLength={200} value={details} onChange={(event) => setDetails(event.target.value)} style={field} />
            </label>
            <button type="button" disabled={v.busy || !details.trim() || (method === selected && details === v.payoutDetails)} onClick={() => void v.savePayout(currentMethod.key, details)} style={primary}>Enregistrer</button>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="t-infos" style={{ padding: "6px 16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column" }}>
        <h2 id="t-infos" style={{ margin: "10px 0 6px", fontSize: "14px", fontWeight: "800" }}>Mes infos</h2>
        {v.infos.map((info) => editing === info.key ? (
          <form key={info.key} onSubmit={async (event) => { event.preventDefault(); if (await v.saveInfo(info.key, draft)) setEditing(null); }} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={label}>{info.label}</span>
              <input value={draft} placeholder={info.placeholder} onChange={(event) => setDraft(event.target.value)} style={field} autoFocus />
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="submit" disabled={v.busy} style={{ ...primary, flex: "1 1 auto" }}>Enregistrer</button>
              <button type="button" onClick={() => setEditing(null)} style={ghost}>Annuler</button>
            </div>
          </form>
        ) : (
          <div key={info.key} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "56px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{info.label}</span>
              <span style={{ fontWeight: "700", overflowWrap: "anywhere", color: info.value ? "#F3EFE6" : "#8E938A" }}>{info.value || "Pas renseigné"}</span>
            </span>
            <a href="#" onClick={go(() => { setDraft(info.value); setEditing(info.key); })} style={{ display: "flex", alignItems: "center", minHeight: "44px", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>Modifier</a>
          </div>
        ))}
      </section>

      <section aria-labelledby="t-notif" style={{ padding: "6px 16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column" }}>
        <h2 id="t-notif" style={{ margin: "10px 0 6px", fontSize: "14px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>Messages WhatsApp<span style={{ padding: "2px 8px", borderRadius: "999px", background: "rgba(255,255,255,0.07)", color: "#C4C8BD", fontSize: "11px", fontWeight: "700" }}>bientôt</span></h2>
        {NOTIFS.map((labelText) => (
          <div key={labelText} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span role="switch" aria-checked="true" aria-disabled="true" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", width: "100%", minHeight: "52px", color: "#A8ADA3", fontSize: "14px" }}>
              <span>{labelText}</span>
              <span aria-hidden="true" style={{ flexShrink: "0", width: "46px", height: "28px", padding: "3px", borderRadius: "999px", background: "rgba(145,214,208,0.35)", display: "flex", justifyContent: "flex-end" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#0b0d0b" }} />
              </span>
            </span>
          </div>
        ))}
      </section>

      <section aria-labelledby="t-password" style={card}>
        <h2 id="t-password" style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Mot de passe</h2>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={label}>Mot de passe actuel</span>
          <input type="password" autoComplete="current-password" maxLength={72} value={current} onChange={(event) => setCurrent(event.target.value)} style={field} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={label}>Nouveau mot de passe</span>
          <input type="password" autoComplete="new-password" maxLength={72} value={next} onChange={(event) => setNext(event.target.value)} style={field} />
        </label>
        <span style={{ fontSize: "12px", color: "#A8ADA3" }}>8 caractères minimum, avec des lettres et au moins un chiffre.</span>
        <button type="button" disabled={v.busy || !current || next.length < 8} onClick={async () => { if (await v.changePassword(current, next)) { setCurrent(""); setNext(""); } }} style={ghost}>Changer mon mot de passe</button>
      </section>

      <section aria-label="Documents" style={{ padding: "6px 16px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column" }}>
        <a href="#charte" onClick={go(v.onCharter)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", minHeight: "56px", color: "#F3EFE6", textDecoration: "none" }}>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: "700" }}>Charte du clippeur</span>
            <span style={{ fontSize: "12px", color: "#A8ADA3" }}>les règles à respecter dans chaque clip</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A8ADA3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </a>
        <a href="#paiements" onClick={go(v.onPayments)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", minHeight: "56px", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#F3EFE6", textDecoration: "none" }}>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: "700" }}>Mes reçus de paiement</span>
            <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{v.payoutCount ? `${v.payoutCount} versement${v.payoutCount > 1 ? "s" : ""}` : "aucun versement pour l'instant"}</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A8ADA3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </a>
        <a href={v.contact.href} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", minHeight: "56px", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#F3EFE6", textDecoration: "none" }}>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: "700" }}>Écrire à Enrick sur WhatsApp</span>
            <span style={{ fontSize: "12px", color: "#A8ADA3" }}>{v.contact.label} · une question, un souci</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A8ADA3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M20 4l-9 9" />
            <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
          </svg>
        </a>
        {installable ? (
          <button type="button" onClick={openClipInstall} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", width: "100%", minHeight: "56px", padding: "0", border: "0", borderTop: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "#F3EFE6", font: "inherit", textAlign: "left", cursor: "pointer" }}>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: "700" }}>Installer l&apos;app sur mon téléphone</span>
              <span style={{ fontSize: "12px", color: "#A8ADA3" }}>InvestPro Clip sur ton écran d&apos;accueil</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F0C575" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
            </svg>
          </button>
        ) : null}
      </section>

      {v.owner ? <Link href="/clip/admin" style={{ ...ghost, textDecoration: "none" }}>Ouvrir l&apos;espace admin</Link> : null}
      <button type="button" onClick={v.signOut} style={{ alignSelf: "center", minHeight: "44px", border: "0", background: "transparent", color: "#F0C575", fontSize: "13px", fontWeight: "800" }}>Se déconnecter</button>
    </>
  );
}
