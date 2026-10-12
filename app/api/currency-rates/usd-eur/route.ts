import { NextResponse } from "next/server";

export const revalidate = 3600;

type FrankfurterRate = {
  date?: string;
  base?: string;
  quote?: string;
  rate?: number;
};

export async function GET() {
  try {
    const response = await fetch("https://api.frankfurter.dev/v2/rate/usd/eur", {
      next: { revalidate: 3600 },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Taux de change indisponible." }, { status: 502 });
    }

    const data = (await response.json()) as FrankfurterRate;
    if (data.base !== "USD" || data.quote !== "EUR" || !Number.isFinite(data.rate) || Number(data.rate) <= 0) {
      return NextResponse.json({ error: "Réponse de taux invalide." }, { status: 502 });
    }

    return NextResponse.json(
      { base: "USD", quote: "EUR", rate: Number(data.rate), date: data.date || null },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "Taux de change indisponible." }, { status: 502 });
  }
}
