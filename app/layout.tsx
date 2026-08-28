import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InvestPro Trading",
  description: "InvestPro Dashboard Application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}