import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") || "";

  const isAdmin = cookie.includes("ip_admin=1");
  const maintTerminal = cookie.includes("ip_maint_terminal=1");
  const maintCopier = cookie.includes("ip_maint_copier=1");

  return NextResponse.json({
    ok: true,
    isAdmin,
    maintTerminal,
    maintCopier,
  });
}
