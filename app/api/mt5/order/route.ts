import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Envoie un ordre via le mt5_bridge -> /mt5/order
 * Supporte Market + Pending (Limit/Stop)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const r = await fetch("http://127.0.0.1:5001/mt5/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    const ct = r.headers.get("content-type") || "";

    if (!ct.includes("application/json")) {
      return NextResponse.json(
        { ok: false, error: "Bridge non-JSON", detail: text.slice(0, 250) },
        { status: 502 }
      );
    }

    return NextResponse.json(JSON.parse(text), { status: r.status });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 400 }
    );
  }
}
