import {NextResponse} from "next/server";
import type {NextRequest} from "next/server";
// Authorization is validated by Supabase token in /api/admin/me and on every protected API.
// Do not treat a user-controlled ip_admin cookie as authorization.
export function middleware(_req:NextRequest){return NextResponse.next();}
export const config={matcher:["/dashboard/:path*"]};
