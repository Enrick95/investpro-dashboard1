import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Tu peux mettre une clé TE plus tard (sinon guest:guest)
const TE_KEY = process.env.TE_API_KEY || "guest:guest";

// Simple cache mémoire (évite spam l’API)
const cache = new Map<string, { at: number; data: any }>();
const TTL_MS = 30_000;

export async function GET(req: Request) {
  const url = new URL(req.url);

  const start = url.searchParams.get("start"); // YYYY-MM-DD
  const end = url.searchParams.get("end");     // YYYY-MM-DD
  const importance = url.searchParams.get("importance"); // 1/2/3 ou vide
  const country = url.searchParams.get("country") || "All"; // All ou liste TE

  if (!start || !end) {
    return NextResponse.json({ error: "Missing start/end (YYYY-MM-DD)" }, { status: 400 });
  }

  const key = `${country}|${start}|${end}|${importance ?? ""}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < TTL_MS) {
    return NextResponse.json(cached.data);
  }

  // TradingEconomics: /calendar/country/All/{yyyy-mm-dd}/{yyyy-mm-dd}?c=guest:guest&f=json
  // Doc: By date endpoint :contentReference[oaicite:2]{index=2}
  const te = new URL(
    `https://api.tradingeconomics.com/calendar/country/${encodeURIComponent(country)}/${start}/${end}`
  );
  te.searchParams.set("c", TE_KEY);
  te.searchParams.set("f", "json");
  if (importance) te.searchParams.set("importance", importance);

  const r = await fetch(te.toString(), { cache: "no-store" });
  if (!r.ok) {
    const text = await r.text();
    return NextResponse.json(
      { error: "TradingEconomics error", status: r.status, body: text.slice(0, 500) },
      { status: 502 }
    );
  }

  const data = await r.json();
  cache.set(key, { at: now, data });
  return NextResponse.json(data);
}
