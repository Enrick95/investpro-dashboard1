import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Cache mémoire (évite spam + réduit risque de ban)
const cache = new Map<string, { at: number; data: any }>();
const TTL_MS = 30_000;

function ymd(v: string | null) {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const start = ymd(url.searchParams.get("start"));
  const end = ymd(url.searchParams.get("end"));

  if (!start || !end) {
    return NextResponse.json({ ok: false, error: "Missing start/end (YYYY-MM-DD)" }, { status: 400 });
  }

  const key = `${start}|${end}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < TTL_MS) {
    return NextResponse.json(cached.data);
  }

  // Investing endpoint (souvent utilisé par leur calendrier)
  const endpoint = "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData";

  const form = new URLSearchParams();
  form.set("dateFrom", start);
  form.set("dateTo", end);
  form.set("timeFilter", "timeRemain");
  form.set("currentTab", "custom");
  form.set("limit_from", "0");
  form.set("limit_to", "500");

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        origin: "https://www.investing.com",
        referer: "https://www.investing.com/economic-calendar/",
        accept: "application/json, text/javascript, */*; q=0.01",
      },
      body: form.toString(),
      cache: "no-store",
    });

    const text = await r.text();

    let j: any = null;
    try {
      j = JSON.parse(text);
    } catch {
      j = null;
    }

    // Cloudflare / blocage => non JSON
    if (!r.ok || !j) {
      const data = {
        ok: false,
        error: "Investing blocked or non-JSON response",
        status: r.status,
        body: text.slice(0, 800),
        start,
        end,
      };
      cache.set(key, { at: now, data });
      return NextResponse.json(data, { status: 200 });
    }

    const data = {
      ok: true,
      start,
      end,
      html: String(j.data ?? ""),
      meta: j.params ?? null,
    };

    cache.set(key, { at: now, data });
    return NextResponse.json(data);
  } catch (e: any) {
    const data = {
      ok: false,
      error: String(e?.message ?? e ?? "fetch_failed"),
      start,
      end,
    };
    cache.set(key, { at: now, data });
    return NextResponse.json(data, { status: 200 });
  }
}
