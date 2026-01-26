import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Retourne le prix actuel (bid / ask)
 * Dépend de mt5_bridge -> /mt5/quote
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const r = await fetch("http://127.0.0.1:5001/mt5/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    const ct = r.headers.get("content-type") || "";

    if (!ct.includes("application/json")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Bridge non-JSON",
          detail: text.slice(0, 250),
        },
        { status: 502 }
      );
    }

    const json = JSON.parse(text);

    // format attendu par le front
    return NextResponse.json(
      {
        ok: true,
        bid: Number(json.bid),
        ask: Number(json.ask),
        time: json.time ?? null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 400 }
    );
  }
}
