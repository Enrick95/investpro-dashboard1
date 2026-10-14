import type { Metadata } from "next";
import VipLanding from "./VipLanding";

export const metadata: Metadata = { title: "InvestPro Trading VIP — Votre espace privé", description: "Activez votre invitation InvestPro Trading VIP et retrouvez votre espace personnel.", robots: { index: false, follow: false } };

export default async function VipPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code.slice(0, 256) : "";
  return <VipLanding initialCode={code} />;
}
