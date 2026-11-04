import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/i18n/server";
import ExistingMemberIntake from "./ExistingMemberIntake";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: locale === "en" ? "Already a VIP member — InvestPro Trading" : "Bon retour dans le VIP — InvestPro Trading",
    description: locale === "en"
      ? "Link your Telegram VIP access to your personal InvestPro account."
      : "Déjà dans le canal Telegram VIP ? Rattachez votre accès à votre compte InvestPro et retrouvez votre espace personnel.",
    robots: { index: false, follow: false },
  };
}

export default function ExistingMemberPage() { return <ExistingMemberIntake />; }
