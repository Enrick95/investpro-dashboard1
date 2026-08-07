import { NextResponse } from "next/server";

function requireAdmin(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  return cookie.includes("ip_admin=1");
}

export async function POST(req: Request) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { target, enabled } = body as { target?: "terminal" | "copieur"; enabled?: boolean };

  if (!target || typeof enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });

  const name = target === "terminal" ? "ip_maint_terminal" : "ip_maint_copier";
  res.cookies.set(name, enabled ? "1" : "0", {
    path: "/",
    sameSite: "lax",
  });

  return res;
}
