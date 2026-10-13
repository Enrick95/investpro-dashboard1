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
    const response = await fetch("https://api.frankfurter.dev/v2/rates?base=EUR&quotes=USD,CHF", {
      next: { revalidate: 3600 },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Taux de change indisponibles." }, { status: 502 });
    }

    const rows = (await response.json()) as FrankfurterRate[];
    const rates: Record<string, number> = {};
    const dates: string[] = [];
    for (const row of rows) {
      if (row.base !== "EUR" || !row.quote || !["USD", "CHF"].includes(row.quote)) continue;
      if (!Number.isFinite(row.rate) || Number(row.rate) <= 0) continue;
      rates[row.quote] = Number(row.rate);
      if (row.date) dates.push(row.date);
    }

    if (!rates.USD || !rates.CHF) {
      return NextResponse.json({ error: "Réponse de taux invalide." }, { status: 502 });
    }

    return NextResponse.json(
      { base: "EUR", rates, date: dates.length ? dates.sort()[0] : null },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "Taux de change indisponibles." }, { status: 502 });
  }
}
