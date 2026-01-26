import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Historique des deals (pour journal / rapport / classement)
 * -> mt5_bridge /mt5/history
 *
 * body attendu :
 * - broker, server, login, password
 * - from_ts, to_ts (unix seconds)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.from_ts || !body.to_ts) {
      return NextResponse.json(
        { ok: false, error: "Paramètres manquants : from_ts / to_ts" },
        { status: 400 }
      );
    }

    const r = await fetch("http://127.0.0.1:5001/mt5/history", {
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
