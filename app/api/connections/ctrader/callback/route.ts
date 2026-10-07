import { NextResponse } from "next/server";
import { adminSupabase, encryptBrokerCredentials, verifyOauthState } from "@/lib/brokers/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  try {
    const code = requestUrl.searchParams.get("code") || "";
    const stateRaw = requestUrl.searchParams.get("state") || "";
    const state = verifyOauthState(stateRaw);
    const clientId = process.env.CTRADER_CLIENT_ID;
    const clientSecret = process.env.CTRADER_CLIENT_SECRET;
    const redirectUri = process.env.CTRADER_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) throw new Error("CTRADER_ENV_MISSING");
    if (!code) throw new Error("CTRADER_CODE_MISSING");

    const tokenUrl = new URL("https://openapi.ctrader.com/apps/token");
    tokenUrl.searchParams.set("grant_type", "authorization_code");
    tokenUrl.searchParams.set("code", code);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);

    const tokenResponse = await fetch(tokenUrl.toString(), { headers: { Accept: "application/json" }, cache: "no-store" });
    const tokenJson = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || !tokenJson?.accessToken) throw new Error(tokenJson?.description || "Échange du token cTrader impossible.");

    const encrypted = encryptBrokerCredentials({
      accessToken: tokenJson.accessToken,
      refreshToken: tokenJson.refreshToken,
      expiresIn: tokenJson.expiresIn,
      tokenType: tokenJson.tokenType,
    });

    const supabase = adminSupabase();
    const externalId = `oauth:${state.user_id}`;
    const { error } = await supabase.from("broker_connections").upsert({
      user_id: state.user_id,
      provider: "ctrader",
      environment: "oauth",
      external_account_id: externalId,
      external_account_name: "cTrader Open API",
      username: null,
      server: "ctrader-open-api",
      credentials_ciphertext: encrypted.ciphertext,
      credentials_iv: encrypted.iv,
      credentials_tag: encrypted.tag,
      status: "authorized",
      metadata: {
        scope: "accounts",
        token_expires_in: Number(tokenJson.expiresIn || 0),
        worker_required: true,
        json_endpoint_live: "live.ctraderapi.com:5036",
        json_endpoint_demo: "demo.ctraderapi.com:5036"
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider,external_account_id" });
    if (error) throw error;

    const returnTo = String(state.return_to || "/dashboard/comptes");
    const redirect = new URL(returnTo, requestUrl.origin);
    redirect.searchParams.set("connection", "ctrader");
    redirect.searchParams.set("status", "authorized");
    return NextResponse.redirect(redirect);
  } catch (error: any) {
    const redirect = new URL("/dashboard/comptes", requestUrl.origin);
    redirect.searchParams.set("connection", "ctrader");
    redirect.searchParams.set("status", "error");
    redirect.searchParams.set("reason", String(error?.message || "ctrader_error").slice(0, 120));
    return NextResponse.redirect(redirect);
  }
}
