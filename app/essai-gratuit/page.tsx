import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Essai VIP — InvestPro Trading",
  description: "Découvre l’essai VIP d’un mois sur compte démo.",
  alternates: { canonical: "/essai-gratuit" },
};

export default function EssaiGratuitPage() {
  return (
    <main style={{ position: "fixed", inset: 0, background: "#0b100d" }}>
      <iframe
        src="/essai-gratuit/index.html"
        title="Essai VIP InvestPro Trading"
        style={{ display: "block", width: "100%", height: "100%", border: 0 }}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </main>
  );
}
