import type { Metadata } from "next";
import FuturesCopierContent from "./FuturesCopierContent";
import { getRequestLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const english = (await getRequestLocale()) === "en";
  return {
    title: english ? "InvestPro Copy Futures — Coming soon" : "InvestPro Copy Futures — Bientôt",
    description: english
      ? "InvestPro is preparing its copier for futures accounts. Discover the project and find the latest announcements here."
      : "InvestPro prépare son copieur pour les comptes futures. Découvrez le projet et retrouvez les prochaines annonces ici.",
  };
}

export default function FuturesCopierPage() { return <FuturesCopierContent />; }
