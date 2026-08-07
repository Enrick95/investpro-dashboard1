import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({ code: "" }));

  const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE || "INVESTPRO-ADMIN";

  if (!code || code !== ADMIN_CODE) {
    return NextResponse.json({ ok: false, error: "Code invalide" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });

  res.cookies.set("ip_admin", "1", {
    path: "/",
    sameSite: "lax",
    // secure: true en prod https
  });

  return res;
}
