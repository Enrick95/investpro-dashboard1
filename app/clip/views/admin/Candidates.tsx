"use client";

import { Avatar, Icon, S, Soon, type Tone, toneColor } from "./kit";

export type CandTab = "new" | "accepted" | "refused";
export type CandDecision = "active" | "test" | "refused" | null;
export type CandItem = { id: string; ini: string; name: string; time: string; last: string; tag: string; tagTone: Tone };
export type CandBubble = { kind: "in" | "event" | "link"; text: string; time?: string; href?: string };
export type CandCurrent = {
  id: string;
  ini: string;
  name: string;
  firstName: string;
  phone: string;
  source: string;
  bubbles: CandBubble[];
  steps: { label: string; done: boolean }[];
  facts: { label: string; value: string; href?: string }[];
  pending: boolean;
  decision: CandDecision;
  statusText: string | null;
  waDecision: string | null;
  quick: { label: string; href: string }[];
};
export type CandidatesVals = {
  subline: string;
  tab: CandTab;
  tabs: { key: CandTab; label: string; count: number }[];
  setTab: (tab: CandTab) => void;
  items: CandItem[];
  selectedId: string | null;
  pick: (id: string) => void;
  cur: CandCurrent | null;
  emptyLabel: string;
  busy: boolean;
  accept: (id: string) => void;
  test: (id: string) => void;
  refuse: (id: string) => void;
};

export function SortRules({ soon }: { soon?: boolean }) {
  return (
    <section aria-labelledby="t-regles" style={{ padding: "18px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <h2 id="t-regles" style={{ margin: "0", fontSize: "14px", fontWeight: "800" }}>Règles de tri</h2>
        {soon ? <Soon /> : null}
      </div>
      {[["Clips", "clip, clips, clipper, clippeur, montage"], ["Conférences", "conférence, conf, billet, place"], ["VIP", "vip, signal, abonnement, broker"]].map(([title, words]) => (
        <div key={title} style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "10px 12px", borderRadius: "12px", background: "#181c16" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "800", color: "#F0C575" }}>{title}</span>
          <span style={{ fontSize: "12.5px", color: "#C4C8BD" }}>{words}</span>
        </div>
      ))}
      <span style={{ fontSize: "12px", color: "#A8ADA3" }}>La file Clips enverra aussi une réponse auto avec ton lien d&apos;inscription, dès que ton numéro WhatsApp sera branché.</span>
    </section>
  );
}

export function AdminCandidates({ v }: { v: CandidatesVals }) {
  const cur = v.cur;
  return (
    <>
      <header style={S.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#A8ADA3" }}><span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#91D6D0" }} />{v.subline}</span>
          <h1 style={S.h1}>Candidatures</h1>
        </div>
        <span style={{ maxWidth: "460px", fontSize: "13px", color: "#A8ADA3" }}>Chaque candidat crée son compte et postule depuis ton lien d&apos;inscription. Tu acceptes ici, puis tu lui envoies le message d&apos;accès sur WhatsApp en un clic.</span>
      </header>
      <div role="tablist" aria-label="Candidatures" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {v.tabs.map((tab) => {
          const on = tab.key === v.tab;
          return (
            <button key={tab.key} type="button" role="tab" aria-selected={on} onClick={() => v.setTab(tab.key)} style={on
              ? { display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", padding: "0 16px", borderRadius: "999px", border: "0", background: "#F3EFE6", color: "#0b0d0b", fontSize: "13.5px", fontWeight: "800" }
              : { display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", padding: "0 16px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#C4C8BD", fontSize: "13.5px", fontWeight: "700" }}>
              {tab.label}
              <span style={on
                ? { minWidth: "22px", padding: "1px 7px", borderRadius: "999px", background: "#0b0d0b", color: "#F3EFE6", fontSize: "12px", textAlign: "center" }
                : { minWidth: "22px", padding: "1px 7px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", color: "#C4C8BD", fontSize: "12px", textAlign: "center" }}>{tab.count}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-start" }}>
        <section aria-label="Candidats" style={{ flex: "1 1 270px", minWidth: "0", padding: "8px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "4px" }}>
          {v.items.map((item) => {
            const on = item.id === v.selectedId;
            return (
              <button key={item.id} type="button" aria-pressed={on} onClick={() => v.pick(item.id)} style={{ display: "flex", alignItems: "flex-start", gap: "10px", width: "100%", padding: "10px", borderRadius: "14px", border: on ? "1px solid rgba(240,197,117,0.45)" : "1px solid transparent", background: on ? "rgba(240,197,117,0.09)" : "transparent", color: "#F3EFE6", textAlign: "left", fontSize: "14px" }}>
                <Avatar ini={item.ini} size={36} teal />
                <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontWeight: on ? "800" : "700" }}>{item.name}</span>
                    <span style={{ fontSize: "11.5px", color: "#A8ADA3", whiteSpace: "nowrap" }}>{item.time}</span>
                  </span>
                  <span style={{ fontSize: "12.5px", color: on ? "#C4C8BD" : "#A8ADA3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.last}</span>
                  <span style={{ fontSize: "11.5px", fontWeight: "700", color: toneColor(item.tagTone) }}>{item.tag}</span>
                </span>
              </button>
            );
          })}
          {!v.items.length ? <div style={{ padding: "18px 12px", fontSize: "13px", color: "#A8ADA3" }}>{v.emptyLabel}</div> : null}
        </section>
        {cur ? (
          <>
            <section aria-labelledby="t-conv" style={{ flex: "2 1 420px", minWidth: "0", borderRadius: "20px", background: "#121511", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "0" }}>
                  <Avatar ini={cur.ini} size={40} teal />
                  <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                    <h2 id="t-conv" style={{ margin: "0", fontSize: "15px", fontWeight: "800" }}>{cur.name}</h2>
                    <span style={{ fontSize: "12.5px", color: "#A8ADA3" }}>{cur.phone} · {cur.source}</span>
                  </div>
                </div>
                <span style={{ flexShrink: "0", padding: "4px 10px", borderRadius: "999px", background: "rgba(240,197,117,0.14)", color: "#F0C575", fontSize: "12px", fontWeight: "800" }}>File Clips</span>
              </div>
              <div style={{ minHeight: "360px", maxHeight: "560px", overflowY: "auto", padding: "18px", display: "flex", flexDirection: "column", gap: "10px", background: "#0f110e" }}>
                {cur.bubbles.map((bubble, index) => bubble.kind === "event" ? (
                  <span key={index} style={{ alignSelf: "center", padding: "4px 10px", borderRadius: "999px", background: "rgba(255,255,255,0.06)", color: "#A8ADA3", fontSize: "11.5px", fontWeight: "700", textAlign: "center" }}>{bubble.time ? `${bubble.time} · ` : ""}{bubble.text}</span>
                ) : bubble.kind === "link" ? (
                  <a key={index} href={bubble.href} target="_blank" rel="noopener noreferrer" style={{ alignSelf: "flex-start", maxWidth: "78%", display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "16px 16px 16px 4px", background: "#1f231c", color: "#F0C575", fontSize: "13.5px", fontWeight: "700", textDecoration: "none" }}><Icon name="film" size={16} stroke="1.9" />{bubble.text}<Icon name="external" size={14} /></a>
                ) : (
                  <div key={index} style={{ alignSelf: "flex-start", maxWidth: "78%", padding: "10px 12px", borderRadius: "16px 16px 16px 4px", background: "#1f231c", fontSize: "13.5px", lineHeight: "1.4", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{bubble.text}{bubble.time ? <span style={{ display: "block", marginTop: "4px", fontSize: "11px", color: "#A8ADA3", textAlign: "right" }}>{bubble.time}</span> : null}</div>
                ))}
              </div>
              <div style={{ padding: "12px 14px 14px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {cur.quick.map((quick) => (
                    <a key={quick.label} href={quick.href} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", minHeight: "40px", padding: "0 12px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.14)", color: "#C4C8BD", fontSize: "12.5px", fontWeight: "700", textDecoration: "none" }}>{quick.label}</a>
                  ))}
                </div>
                <span style={{ fontSize: "12px", color: "#A8ADA3" }}>Ces raccourcis ouvrent WhatsApp avec le message prêt : il part de ton numéro.</span>
              </div>
            </section>
            <div style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
              <section aria-labelledby="t-cand" style={{ padding: "18px", borderRadius: "20px", background: "#121511", border: "1px solid rgba(240,197,117,0.3)", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#A8ADA3" }}>Candidature</span>
                  <h2 id="t-cand" style={{ margin: "0", fontFamily: "Unbounded, sans-serif", fontWeight: "500", fontSize: "17px" }}>{cur.name}</h2>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${cur.steps.length}, minmax(0, 1fr))`, gap: "4px" }}>
                  {cur.steps.map((step) => (
                    <div key={step.label} style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}>
                      <span style={{ display: "block", height: "6px", borderRadius: "999px", background: step.done ? "#F0C575" : "rgba(255,255,255,0.1)" }} />
                      <span style={{ fontSize: "11px", fontWeight: "700", color: step.done ? "#F0C575" : "#A8ADA3", overflow: "hidden", textOverflow: "ellipsis" }}>{step.label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {cur.facts.map((fact) => (
                    <div key={fact.label} style={{ display: "flex", justifyContent: "space-between", gap: "10px", minHeight: "36px", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "13px" }}>
                      <span style={{ color: "#A8ADA3", flexShrink: "0" }}>{fact.label}</span>
                      {fact.href ? (
                        <a href={fact.href} target="_blank" rel="noopener noreferrer" style={{ fontWeight: "700", textAlign: "right", minWidth: "0", overflowWrap: "anywhere" }}>{fact.value}</a>
                      ) : <span style={{ fontWeight: "700", textAlign: "right", minWidth: "0", overflowWrap: "anywhere" }}>{fact.value}</span>}
                    </div>
                  ))}
                </div>
                {cur.pending ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <button type="button" disabled={v.busy} onClick={() => v.accept(cur.id)} style={{ minHeight: "46px", borderRadius: "12px", border: "0", background: "#F0C575", color: "#0b0d0b", fontSize: "14px", fontWeight: "800" }}>Accepter et envoyer l&apos;accès</button>
                    <button type="button" disabled={v.busy} onClick={() => v.test(cur.id)} style={{ minHeight: "44px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#F3EFE6", fontSize: "13px", fontWeight: "700" }}>Mettre en test</button>
                    <button type="button" disabled={v.busy} onClick={() => v.refuse(cur.id)} style={{ minHeight: "44px", borderRadius: "12px", border: "0", background: "transparent", color: "#FF6F91", fontSize: "13px", fontWeight: "700" }}>Refuser poliment</button>
                  </div>
                ) : cur.statusText ? (
                  <div role="status" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px 14px", borderRadius: "14px", background: cur.decision === "refused" ? "rgba(255,255,255,0.05)" : "rgba(145,214,208,0.08)", border: cur.decision === "refused" ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(145,214,208,0.35)", fontSize: "13px", color: "#C4C8BD" }}>
                    <span><span style={{ fontWeight: "800", color: cur.decision === "refused" ? "#F3EFE6" : "#91D6D0" }}>{cur.statusText}</span> {cur.waDecision ? `Envoie-lui le message sur WhatsApp.` : ""}</span>
                    {cur.waDecision ? <a href={cur.waDecision} target="_blank" rel="noopener noreferrer" style={{ ...S.primary, fontSize: "13px" }}><Icon name="chat" />Envoyer le message</a> : null}
                  </div>
                ) : null}
              </section>
              <SortRules soon />
            </div>
          </>
        ) : (
          <section style={{ ...S.card, flex: "3 1 600px", minWidth: "0", fontSize: "13px", color: "#A8ADA3" }}>Sélectionne une candidature pour la voir en détail.</section>
        )}
      </div>
    </>
  );
}
