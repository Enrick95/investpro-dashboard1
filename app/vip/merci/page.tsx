import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { vipDatabase } from "@/lib/vip/membership-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bienvenue dans le VIP · InvestPro", robots: { index: false, follow: false } };

type Search = Promise<{ session_id?: string | string[] }>;

async function readPayment(sessionId: string) {
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return null;
  try {
    const { data } = await vipDatabase().from("vip_stripe_payments").select("full_name,invite_url,channel_joined_at").eq("checkout_session_id", sessionId).maybeSingle();
    return data as { full_name: string | null; invite_url: string | null; channel_joined_at: string | null } | null;
  } catch { return null; }
}

const wrap: CSSProperties = { minHeight: "100dvh", display: "grid", placeItems: "center", padding: "32px 16px", background: "#090c0c", color: "#f6f2e8", fontFamily: "Inter, system-ui, sans-serif" };
const card: CSSProperties = { width: "100%", maxWidth: 520, padding: "32px 24px", borderRadius: 22, border: "1px solid #3a443e", background: "linear-gradient(180deg,#151b19,#101413)", textAlign: "center", display: "grid", gap: 14 };
const gold: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 52, padding: "0 22px", borderRadius: 14, background: "linear-gradient(135deg,#ffd68a,#f0b95a)", color: "#17140d", fontWeight: 800, fontSize: 16, textDecoration: "none" };
const muted: CSSProperties = { margin: 0, color: "#a9b4ae", fontSize: 14, lineHeight: 1.6 };

export default async function VipThanks({ searchParams }: { searchParams: Search }) {
  const raw = (await searchParams).session_id;
  const sessionId = typeof raw === "string" ? raw : "";
  const payment = sessionId ? await readPayment(sessionId) : null;
  const first = payment?.full_name?.split(/\s+/)[0];

  return <main style={wrap}>
    {payment?.invite_url || payment?.channel_joined_at ? <section style={card}>
      <div style={{ fontSize: 42 }}>🎉</div>
      <h1 style={{ margin: 0, fontSize: 26 }}>Bienvenue dans le VIP{first ? `, ${first}` : ""} !</h1>
      <p style={muted}>Ton paiement est confirmé. Clique ci-dessous pour rejoindre le canal VIP sur Telegram. Ce lien est personnel et ne marche qu’une seule fois : ne le partage pas.</p>
      {payment.channel_joined_at ? <p style={{ ...muted, color: "#7fdc9a" }}>✅ Tu as déjà rejoint le canal. Ouvre Telegram pour retrouver le VIP.</p>
        : <a style={gold} href={payment.invite_url as string} rel="noopener">Rejoindre le canal VIP ↗</a>}
      <p style={muted}>Tu reçois aussi ce lien par e-mail. Une question ? Écris à <a href="https://t.me/EquipeInvestPro" style={{ color: "#F0C575", fontWeight: 700 }}>@EquipeInvestPro</a>.</p>
    </section> : <section style={card}>
      {sessionId && <meta httpEquiv="refresh" content="4" />}
      <div style={{ fontSize: 42 }}>⏳</div>
      <h1 style={{ margin: 0, fontSize: 24 }}>{sessionId ? "On confirme ton paiement…" : "Merci pour ton paiement !"}</h1>
      <p style={muted}>{sessionId ? "Ça prend quelques secondes. Cette page se met à jour toute seule et ton lien d’accès au canal VIP va apparaître ici." : "Ton lien d’accès au canal VIP t’a été envoyé par e-mail (pense à regarder dans les spams)."}</p>
      <p style={muted}>Rien après 2 minutes ? Écris à <a href="https://t.me/EquipeInvestPro" style={{ color: "#F0C575", fontWeight: 700 }}>@EquipeInvestPro</a> sur Telegram avec l’e-mail utilisé pour payer.</p>
    </section>}
  </main>;
}
