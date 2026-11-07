import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/i18n/server";
import JoinVip from "../rejoindre/JoinVip";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: locale === "en" ? "Join InvestPro VIP" : "Rejoindre InvestPro VIP",
    description: locale === "en"
      ? "Choose monthly subscription or broker affiliation and follow your VIP application."
      : "Choisissez l’abonnement ou l’affiliation avec votre broker et suivez votre demande d’accès VIP.",
    robots: { index: true, follow: true },
    alternates: { canonical: "https://investprotrading.fr/vip/acces" },
  };
}

/** Same journey as /vip/rejoindre: subscription or affiliation, then validation by the team. */
export default async function VipAccesPage({ searchParams }: { searchParams: Promise<{ access?: string; broker?: string; account?: string }> }) {
  const choices = await searchParams;
  return <JoinVip initialChoices={choices} />;
}
