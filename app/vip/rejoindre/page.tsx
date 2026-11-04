import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import JoinVip from "./JoinVip";
import { getRequestLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: locale === "en" ? "Join InvestPro VIP" : "Rejoindre InvestPro VIP",
    description: locale === "en" ? "Choose monthly subscription or broker affiliation and follow your VIP application." : "Choisissez l’abonnement ou l’affiliation avec votre broker et suivez votre demande d’accès VIP.",
    robots: { index: true, follow: true },
    alternates: { canonical: "https://investprotrading.fr/vip/rejoindre" },
  };
}

export default async function JoinVipPage({ searchParams }: { searchParams: Promise<{ access?: string; broker?: string; account?: string }> }) {
  const choices = await searchParams;
  if (choices.access !== "affiliation" && choices.access !== "subscription") permanentRedirect("/vip");
  return <JoinVip initialChoices={choices} />;
}
