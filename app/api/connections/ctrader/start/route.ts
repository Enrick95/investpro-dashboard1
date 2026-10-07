import { NextResponse } from "next/server";
import { requireUser, signOauthState } from "@/lib/brokers/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    const clientId = process.env.CTRADER_CLIENT_ID;
    const redirectUri = process.env.CTRADER_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return NextResponse.json({ ok: false, error: "cTrader n’est pas encore configuré côté serveur. Ajoute CTRADER_CLIENT_ID et CTRADER_REDIRECT_URI après approbation de l’application Open API." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const returnTo = String(body?.returnTo || "/dashboard/comptes");
    const state = signOauthState({ user_id: user.id, return_to: returnTo, exp: Date.now() + 10 * 60 * 1000 });
    const url = new URL("https://id.ctrader.com/my/settings/openapi/grantingaccess/");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "accounts");
    url.searchParams.set("product", "web");
    url.searchParams.set("state", state);
    return NextResponse.json({ ok: true, url: url.toString() });
  } catch (error: any) {
    if (String(error?.message) === "UNAUTHORIZED") return NextResponse.json({ ok: false, error: "Session InvestPro expirée." }, { status: 401 });
    return NextResponse.json({ ok: false, error: String(error?.message || "Erreur cTrader.") }, { status: 400 });
  }
}
