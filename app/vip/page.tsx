import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/i18n/server";
import VipLanding from "./VipLanding";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: locale === "en" ? "InvestPro Trading VIP — Your private space" : "InvestPro Trading VIP — Votre espace privé",
    description: locale === "en"
      ? "Activate your InvestPro Trading VIP invitation and access your personal space."
      : "Activez votre invitation InvestPro Trading VIP et retrouvez votre espace personnel.",
    robots: { index: false, follow: false },
  };
}

export default async function VipPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code.slice(0, 256) : "";
  if (!code) redirect("/vip/rejoindre");
  return <VipLanding initialCode={code} />;
}
