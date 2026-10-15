import VipPortal from "@/components/vip/VipPortal";

export default async function VipDashboardPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  const { mode } = await searchParams;
  return <VipPortal initialAdminMode={mode === "admin"} />;
}
