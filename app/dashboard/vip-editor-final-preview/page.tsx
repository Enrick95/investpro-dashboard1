import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import VipPublicationsEditor from "@/components/vip/VipPublicationsEditor";
import type { VipPost } from "@/lib/vip/types";

export const metadata: Metadata = { title: "Éditeur VIP — démonstration sans publication", robots: { index: false, follow: false } };

/** No admin data or API access: synthetic fixtures and local drafting only. */
export default async function VipEditorFinalPreview() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  const host = (await headers()).get("host") || "";
  if (!/^[a-z0-9.-]+\.vercel\.app$/i.test(host)) notFound();
  const createdAt = new Date().toISOString();
  const base = { symbol: null, direction: null, levels: {}, created_at: createdAt, updated_at: createdAt };
  const posts: VipPost[] = [
    { ...base, id: "11111111-1111-4111-8111-111111111111", category: "analysis", title: "Mon analyse graphique · exemple", body: "Publication fictive.\n\nUn graphique entier et le contexte de l’analyse.\n\nCette démonstration permet de vérifier l’édition sans publier ni envoyer de notification.", image_url: `https://${host}/vip-rail-preview-chart.svg`, reactions: { counts: { like: 12, fire: 7, heart: 3 }, mine: null } },
    { ...base, id: "22222222-2222-4222-8222-222222222222", category: "signal", title: "Exemple de signal", body: "🎯 #SIGNAL · DÉMONSTRATION\n\n🟡 Actif : XAUUSD\n📈 Direction : BUY\n📍 Entrée : 2600 – 2602\n🛑 Stop Loss : 2590\n🎯 TP1 : 2610\n🎯 TP2 : 2620\n🎯 TP3 : OPEN\n\n⚠️ Respectez votre money management.\n\nDonnées fictives.", image_url: null, reactions: { counts: { like: 8, fire: 5, heart: 2 }, mine: null } },
  ];
  return (
    <main style={{ maxWidth: 1100, width: "100%", margin: "0 auto", minWidth: 0 }}>
      <p style={{ padding: "0 4px 16px", color: "#a8b7b8", fontSize: 12 }}>Démonstration · données fictives · publication et envoi de fichiers désactivés.</p>
      <VipPublicationsEditor active readOnlyPreview initialPosts={posts} />
    </main>
  );
}
