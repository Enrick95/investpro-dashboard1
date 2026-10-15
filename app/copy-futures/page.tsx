import type { Metadata } from "next";
import PublicFuturesContent from "./PublicFuturesContent";
import { getRequestLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const english = (await getRequestLocale()) === "en";
  return {
    title: english ? "InvestPro Copy Futures — Coming soon" : "InvestPro Copy Futures — Bientôt",
    description: english
      ? "The InvestPro copier for futures accounts is in development. Discover the project and the next steps."
      : "Le copieur InvestPro pour les comptes futures est en préparation. Découvrez le projet et les prochaines étapes.",
    alternates: { canonical: "/copy-futures" },
  };
}

export default function PublicFuturesPage() { return <PublicFuturesContent />; }
