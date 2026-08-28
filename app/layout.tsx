import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "InvestPro Trading",
  description: "InvestPro Dashboard Application",
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07070a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
