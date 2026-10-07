import { NextResponse } from "next/server";
import { encryptBrokerCredentials, requireUser } from "@/lib/brokers/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    const body = await request.json();
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");
    const server = String(body?.server || "").trim();
    const environment = String(body?.environment || "live") === "demo" ? "demo" : "live";
    const account = body?.account || {};
    const externalId = String(account?.accountId || "").trim();
    const accNum = Number(account?.accNum);
    const name = String(account?.name || `TradeLocker ${externalId}`).trim();
    const currency = String(account?.currency || "USD").trim().toUpperCase();

    if (!email || !password || !server || !externalId || !Number.isFinite(accNum)) {
      return NextResponse.json({ ok: false, error: "Informations TradeLocker incomplètes." }, { status: 400 });
    }

    const encrypted = encryptBrokerCredentials({ email, password, server, environment, accNum });

    const { data: existing } = await supabase
      .from("broker_connections")
      .select("id,trading_account_id")
      .eq("user_id", user.id)
      .eq("provider", "tradelocker")
      .eq("external_account_id", externalId)
      .maybeSingle();

    let tradingAccountId = Number(existing?.trading_account_id || 0);
    if (tradingAccountId) {
      const { error } = await supabase
        .from("trading_accounts")
        .update({ name, platform: "OTHER", broker: "TradeLocker", currency, connection_type: "automatic", updated_at: new Date().toISOString() })
        .eq("id", tradingAccountId)
        .eq("user_id", user.id);
      if (error) throw error;
    } else {
      const { data: created, error } = await supabase
        .from("trading_accounts")
        .insert({
          user_id: user.id,
          name,
          account_type: String(account?.type || "real") === "demo" ? "demo" : "real",
          platform: "OTHER",
          broker: "TradeLocker",
          currency,
          initial_balance: 0,
          current_balance: 0,
          connection_type: "automatic",
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !created) throw error || new Error("Impossible de créer le compte InvestPro.");
      tradingAccountId = Number(created.id);
    }

    const { error: connectionError } = await supabase
      .from("broker_connections")
      .upsert({
        user_id: user.id,
        trading_account_id: tradingAccountId,
        provider: "tradelocker",
        environment,
        external_account_id: externalId,
        external_account_name: name,
        username: email,
        server,
        credentials_ciphertext: encrypted.ciphertext,
        credentials_iv: encrypted.iv,
        credentials_tag: encrypted.tag,
        status: "connected",
        metadata: { accNum, currency, api_mode: "rest", read_only_intent: true },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider,external_account_id" });
    if (connectionError) throw connectionError;

    return NextResponse.json({ ok: true, account: { id: tradingAccountId, name, currency, provider: "TradeLocker" } });
  } catch (error: any) {
    const message = String(error?.message || "Erreur TradeLocker.");
    if (message === "UNAUTHORIZED") return NextResponse.json({ ok: false, error: "Session InvestPro expirée." }, { status: 401 });
    if (message === "FUTURES_CREDENTIALS_KEY_MISSING") return NextResponse.json({ ok: false, error: "FUTURES_CREDENTIALS_KEY doit être configurée dans Vercel." }, { status: 500 });
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
