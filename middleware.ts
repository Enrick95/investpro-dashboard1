import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdmin = req.cookies.get("ip_admin")?.value === "1";

  /**
   * ✅ Admin protection
   * - On laisse /dashboard/admin accessible (écran code)
   * - Mais on bloque les sous-pages /dashboard/admin/... si pas admin
   */
  if (pathname.startsWith("/dashboard/admin/") && !isAdmin) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard/admin";
    return NextResponse.redirect(url);
  }

  /**
   * ❌ IMPORTANT :
   * On ne redirige plus terminal/copieur vers /maintenance,
   * car maintenant la maintenance est gérée via un MODAL dans les pages.
   */

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
