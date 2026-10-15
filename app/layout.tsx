import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import InstallAppExperience from "@/components/InstallAppExperience";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import { getRequestLocale } from "@/lib/i18n/server";
import "./globals.css";
import "./aura.css";
import "./fundamentals.css";
import "./aura-faithful.css";

const baseMetadata: Metadata = {
  metadataBase: new URL("https://investprotrading.fr"),
  title: { default: "InvestPro Trading — Journal, risque & multi-comptes", template: "%s | InvestPro Trading" },
  description: "Centralisez vos comptes de trading, automatisez votre journal, analysez vos performances et suivez votre discipline dans un seul espace.",
  keywords: ["journal de trading", "trading journal", "gestion du risque", "MetaTrader", "MT4", "MT5", "TradeLocker", "cTrader", "multi-comptes", "analyse trading"],
  alternates: { canonical: "/" },
  openGraph: { title: "InvestPro Trading", description: "Tradez mieux. Progressez chaque jour.", url: "https://investprotrading.fr", siteName: "InvestPro Trading", locale: "fr_FR", type: "website", images: [{ url: "/aura-eclipse.webp", width: 1200, height: 630, alt: "InvestPro Trading" }] },
  twitter: { card: "summary_large_image", title: "InvestPro Trading", description: "Tradez mieux. Progressez chaque jour.", images: ["/aura-eclipse.webp"] },
  applicationName: "InvestPro",
  manifest: "/manifest.webmanifest",

  appleWebApp: {
    capable: true,
    title: "InvestPro",
    statusBarStyle: "black-translucent",
  },

  formatDetection: {
    telephone: false,
  },

  icons: {
    icon: "/logo.webp",
    apple: "/logo.webp",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  if (locale === "fr") return baseMetadata;
  const title = "InvestPro Trading — Trading journal, risk & multiple accounts";
  const description = "Centralize your trading accounts, automate your journal, analyze your performance and track your discipline in one place.";
  return {
    ...baseMetadata,
    title: { default: title, template: "%s | InvestPro Trading" },
    description,
    openGraph: { ...baseMetadata.openGraph, description: "Trade better. Improve every day.", locale: "en_US" },
    twitter: { ...baseMetadata.twitter, description: "Trade better. Improve every day." },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07070a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body>
        <LocaleProvider initialLocale={locale}>
          <PwaRegister />
          <InstallAppExperience />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
