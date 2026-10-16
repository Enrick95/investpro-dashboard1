import RiskSimulator from "@/components/risk/RiskSimulator";

export default async function SimulateurRisquePage({ searchParams }: {
  searchParams: Promise<{ signal?: string | string[] }>;
}) {
  const { signal } = await searchParams;
  const valid = typeof signal === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signal);
  return <RiskSimulator key={valid ? signal : signal === undefined ? "manual" : "invalid"}
    signalId={valid ? signal : undefined} invalidSignal={signal !== undefined && !valid} />;
}
