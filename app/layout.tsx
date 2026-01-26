import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InvestPro Trading",
  description: "InvestPro Dashboard Application",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    var t = localStorage.getItem('ip_theme') || 'dark';
    var root = document.documentElement;
    var setDark = function(){ root.classList.add('dark'); };
    var setLight = function(){ root.classList.remove('dark'); };
    if (t === 'system') {
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      prefersDark ? setDark() : setLight();
    } else {
      t === 'dark' ? setDark() : setLight();
    }
  } catch (e) {}
})();
`,
          }}
        />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
