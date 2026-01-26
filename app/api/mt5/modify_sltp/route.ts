import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Modifier SL / TP d’une position existante
 * -> mt5_bridge /mt5/modify_sltp
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.ticket) {
      return NextResponse.json(
        { ok: false, error: "Paramètre manquant : ticket" },
        { status: 400 }
      );
    }

    const r = await fetch("http://127.0.0.1:5001/mt5/modify_sltp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        broker: body.broker,
        server: body.server,
        login: body.login,
        password: body.password,
        ticket: body.ticket,
        sl: body.sl ?? null,
        tp: body.tp ?? null,
      }),
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
