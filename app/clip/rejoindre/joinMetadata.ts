import type { Metadata } from "next";
import { CLIP_OG_IMAGE, CLIP_PUBLIC_URL } from "@/lib/clip/rules";

/** Page d'inscription, servie à la racine (investproclip.com) et sur /rejoindre (liens déjà partagés). */
export const joinMetadata: Metadata = {
  title: "Devenir clippeur",
  description: "Rejoins les clippeurs d'Enrick95 : coupe ses vidéos, publie sur tes comptes et sois payé pour chaque clip validé.",
  robots: { index: false, follow: false },
  // Le lien partagé à la communauté : son propre aperçu dans WhatsApp, Telegram, Discord…
  openGraph: {
    title: "Deviens clippeur d'Enrick95",
    description: "Coupe ses vidéos, publie-les sur tes réseaux et sois payé pour chaque clip validé. Inscription en 2 minutes.",
    siteName: "InvestPro Clip",
    locale: "fr_FR",
    type: "website",
    url: CLIP_PUBLIC_URL,
    images: [CLIP_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Deviens clippeur d'Enrick95",
    description: "Coupe ses vidéos, publie-les sur tes réseaux et sois payé pour chaque clip validé.",
    images: [CLIP_OG_IMAGE.url],
  },
};
