import { NextResponse } from "next/server";
import {
  encryptProjectXApiKey,
  projectXAccounts,
  projectXBaseUrl,
  projectXLogin,
  requireUser,
} from "@/lib/projectx/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    const body = await request.json();
    const userName = String(body?.userName || "").trim();
    const apiKey = String(body?.apiKey || "").trim();
    const accountId = Number(body?.accountId);

    if (!userName || !apiKey || !Number.isFinite(accountId)) {
      return NextResponse.json({ ok: false, error: "Informations ProjectX incomplètes." }, { status: 400 });
    }

    const token = await projectXLogin(userName, apiKey);
    const accounts = await projectXAccounts(token);
    const selected = accounts.find((item) => item.id === accountId);
    if (!selected) {
      return NextResponse.json({ ok: false, error: "Ce compte ProjectX n’est plus disponible." }, { status: 404 });
    }

    const encrypted = encryptProjectXApiKey(apiKey);
    const externalId = String(selected.id);

    const { data: existingConnection, error: existingError } = await supabase
      .from("futures_connections")
      .select("id, trading_account_id")
      .eq("user_id", user.id)
      .eq("provider", "projectx")
      .eq("external_account_id", externalId)
      .maybeSingle();

    if (existingError) throw existingError;

    let tradingAccountId: number;
    if (existingConnection?.trading_account_id) {
      tradingAccountId = Number(existingConnection.trading_account_id);
      const { error } = await supabase
        .from("trading_accounts")
        .update({
          name: selected.name,
          platform: "OTHER",
          broker: "ProjectX",
          currency: "USD",
          current_balance: selected.balance,
          connection_type: "automatic",
          updated_at: new Date().toISOString(),
        })
        .eq("id", tradingAccountId)
        .eq("user_id", user.id);
      if (error) throw error;
    } else {
      const { data: created, error } = await supabase
        .from("trading_accounts")
        .insert({
          user_id: user.id,
          name: selected.name,
          account_type: "prop",
          platform: "OTHER",
          broker: "ProjectX",
          currency: "USD",
          initial_balance: selected.balance,
          current_balance: selected.balance,
          connection_type: "automatic",
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !created) throw error || new Error("Impossible de créer le compte InvestPro.");
      tradingAccountId = Number(created.id);
    }

    const connectionPayload = {
      user_id: user.id,
      trading_account_id: tradingAccountId,
      provider: "projectx",
      external_account_id: externalId,
      external_account_name: selected.name,
      username: userName,
      credentials_ciphertext: encrypted.ciphertext,
      credentials_iv: encrypted.iv,
      credentials_tag: encrypted.tag,
      provider_base_url: projectXBaseUrl(),
      status: "connected",
      updated_at: new Date().toISOString(),
    };

    const { error: connectionError } = await supabase
      .from("futures_connections")
      .upsert(connectionPayload, { onConflict: "user_id,provider,external_account_id" });

    if (connectionError) throw connectionError;

    return NextResponse.json({
      ok: true,
      account: {
        id: tradingAccountId,
        name: selected.name,
        balance: selected.balance,
        currency: "USD",
        provider: "ProjectX",
      },
    });
  } catch (error: any) {
    const message = String(error?.message || "Erreur ProjectX.");
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false, error: "Session InvestPro expirée." }, { status: 401 });
    }
    if (message === "FUTURES_CREDENTIALS_KEY_MISSING") {
      return NextResponse.json(
        { ok: false, error: "La clé serveur FUTURES_CREDENTIALS_KEY n’est pas configurée dans Vercel." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
