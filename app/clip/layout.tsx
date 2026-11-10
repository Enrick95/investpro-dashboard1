import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const description = "L'espace des clippeurs d'Enrick : campagnes, vidéos à clipper, clips et paiements.";

/** L'espace clippeurs a sa propre identité (InvestPro Clip), prête pour son futur nom de domaine. */
export const metadata: Metadata = {
  title: { default: "InvestPro Clip", template: "%s · InvestPro Clip" },
  description,
  applicationName: "InvestPro Clip",
  keywords: null,
  alternates: { canonical: "/clip" },
  manifest: null,
  appleWebApp: { capable: true, title: "InvestPro Clip", statusBarStyle: "black-translucent" },
  openGraph: { title: "InvestPro Clip", description, siteName: "InvestPro Clip", locale: "fr_FR", type: "website", url: "/clip" },
  twitter: { card: "summary", title: "InvestPro Clip", description },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b0d0b" };

export default function ClipLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
