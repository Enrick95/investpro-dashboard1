import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const r = await fetch("http://127.0.0.1:5001/mt5/test", {
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

    const json = JSON.parse(text);
    if (!json?.ok) {
      return NextResponse.json({ ok: false, error: json?.error || "MT5 test failed" }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        snapshot: json.snapshot,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}
