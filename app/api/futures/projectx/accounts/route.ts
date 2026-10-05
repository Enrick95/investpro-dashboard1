import { NextResponse } from "next/server";
import { projectXAccounts, projectXLogin, requireUser } from "@/lib/projectx/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireUser(request);
    const body = await request.json();
    const userName = String(body?.userName || "").trim();
    const apiKey = String(body?.apiKey || "").trim();

    if (!userName || !apiKey) {
      return NextResponse.json({ ok: false, error: "Username et clé API ProjectX requis." }, { status: 400 });
    }

    const token = await projectXLogin(userName, apiKey);
    const accounts = await projectXAccounts(token);
    return NextResponse.json({ ok: true, accounts });
  } catch (error: any) {
    const message = String(error?.message || "Erreur ProjectX.");
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false, error: "Session InvestPro expirée." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
