import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CLIP_OG_IMAGE } from "@/lib/clip/rules";
import InstallClip from "./views/InstallClip";

const description = "L'espace des clippeurs d'Enrick : campagnes, vidéos à clipper, clips et paiements.";

/** L'espace clippeurs a sa propre identité (InvestPro Clip) et s'installe comme une app sur le téléphone. */
export const metadata: Metadata = {
  title: { default: "InvestPro Clip", template: "%s · InvestPro Clip" },
  description,
  applicationName: "InvestPro Clip",
  keywords: null,
  alternates: { canonical: "https://investproclip.com" },
  manifest: "/clip.webmanifest",
  icons: {
    icon: [
      { url: "/clip-app/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/clip-app/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/clip-app/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Barre d'état opaque : sur iPhone, l'app ne passe pas sous l'heure et la batterie.
  appleWebApp: { capable: true, title: "InvestPro Clip", statusBarStyle: "black" },
  openGraph: { title: "InvestPro Clip", description, siteName: "InvestPro Clip", locale: "fr_FR", type: "website", url: "https://investproclip.com", images: [CLIP_OG_IMAGE] },
  twitter: { card: "summary_large_image", title: "InvestPro Clip", description, images: [CLIP_OG_IMAGE.url] },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b0d0b" };

export default function ClipLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <InstallClip />
    </>
  );
}
