import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { VipPortalPreview } from "@/components/vip/VipPortal";
import type { VipPost } from "@/lib/vip/types";

export const metadata: Metadata = { title: "Maquette Rail compact — contenu fictif", robots: { index: false, follow: false } };

/** Synthetic, read-only review surface. Never available on production or connected to VIP APIs. */
export default async function VipRailFinalPreview() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  const host = (await headers()).get("host") || "";
  if (!/^[a-z0-9.-]+\.vercel\.app$/i.test(host)) notFound();
  const createdAt = new Date().toISOString();
  const base = { symbol: null, direction: null, levels: {}, created_at: createdAt, updated_at: createdAt };
  const posts: VipPost[] = [
    { ...base, id: "11111111-1111-4111-8111-111111111111", category: "analysis", title: "Mon analyse graphique · exemple", body: "Démonstration de l’interface.\n\nUn graphique entier, le contexte de l’analyse et les niveaux à surveiller, dans une publication simple à lire.\n\nCes données sont fictives.", image_url: `https://${host}/vip-rail-preview-chart.svg`, reactions: { counts: { like: 12, fire: 7, heart: 3 }, mine: null } },
    { ...base, id: "22222222-2222-4222-8222-222222222222", category: "signal", title: "Exemple de signal", body: "🎯 #SIGNAL · DÉMONSTRATION\n\n🟡 Actif : XAUUSD\n📈 Direction : BUY\n📍 Entrée : 2600 – 2602\n🛑 Stop Loss : 2590\n🎯 TP1 : 2610\n🎯 TP2 : 2620\n🎯 TP3 : OPEN\n\n⚠️ Respectez votre money management.\n\nExemple fictif pour vérifier la mise en page.", image_url: null, reactions: { counts: { like: 8, fire: 5, heart: 2 }, mine: null } },
    { ...base, id: "33333333-3333-4333-8333-333333333333", category: "performance", title: "Le bilan de la session · exemple", body: "Démonstration de la rubrique Bilan.\n\nLes points à retenir, les décisions suivies et les enseignements de la session, réunis au même endroit.", image_url: null, reactions: { counts: { like: 4, fire: 1, heart: 2 }, mine: null } },
    { ...base, id: "44444444-4444-4444-8444-444444444444", category: "followup", title: "Mise à jour du scénario · exemple", body: "Un suivi lisible après la publication initiale.\n\nCette publication est fictive et ne constitue aucune opération de trading.", image_url: null, reactions: { counts: { like: 3, fire: 1, heart: 0 }, mine: null } },
    { ...base, id: "55555555-5555-4555-8555-555555555555", category: "partnership", title: "Les nouvelles du cercle · exemple", body: "Un espace pour partager les actualités et les informations sur vos partenariats.\n\nContenu de démonstration.", image_url: null, reactions: { counts: { like: 2, fire: 0, heart: 1 }, mine: null } },
  ];
  return <VipPortalPreview posts={posts} />;
}
