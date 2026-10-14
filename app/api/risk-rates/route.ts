import { NextResponse } from "next/server";

export const revalidate = 3600;

const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));
const unavailableMessage = "Taux de change indisponibles.";

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function parseRates(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) {
    throw new Error("Invalid rate response");
  }

  const rates: Record<string, number> = { EUR: 1 };
  const dates: Record<string, string> = {};

  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error("Invalid rate row");
    }

    const row = item as Record<string, unknown>;
    if (
      row.base !== "EUR" ||
      typeof row.quote !== "string" ||
      !/^[A-Z]{3}$/.test(row.quote) ||
      typeof row.rate !== "number" ||
      !Number.isFinite(row.rate) ||
      row.rate <= 0 ||
      !isValidDate(row.date)
    ) {
      throw new Error("Invalid rate fields");
    }

    // Frankfurter also publishes non-ISO currency aliases; do not expose them as account currencies.
    if (!supportedCurrencies.has(row.quote)) continue;
    if (dates[row.quote] !== undefined || (row.quote === "EUR" && row.rate !== 1)) {
      throw new Error("Inconsistent rate response");
    }

    rates[row.quote] = row.rate;
    dates[row.quote] = row.date;
  }

  if (Object.keys(rates).length < 2) throw new Error("Missing conversion rates");
  return { base: "EUR", rates, dates };
}

export async function GET() {
  try {
    const response = await fetch("https://api.frankfurter.dev/v2/rates?base=EUR", {
      next: { revalidate: 3600 },
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error("Rate provider unavailable");
    const payload: unknown = await response.json();

    return NextResponse.json(parseRates(payload), {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json(
      { error: unavailableMessage },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
