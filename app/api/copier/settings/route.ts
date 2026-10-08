import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RiskMode = "fixed" | "mirror" | "balance" | "equity" | "percent";

function numberIn(
  value: unknown,
  min: number,
  max: number,
  fallback: number
) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function cleanSettings(raw: any) {
  const modes: RiskMode[] = ["fixed", "mirror", "balance", "equity", "percent"];
  const mode: RiskMode = modes.includes(raw?.mode) ? raw.mode : "fixed";

  return {
    mode,
    fixed_lots: numberIn(raw?.fixed_lots, 0.001, 1000, 0.01),
    mirror_multiplier: numberIn(raw?.mirror_multiplier, 0.1, 20, 1),
    balance_multiplier: numberIn(raw?.balance_multiplier, 0.1, 20, 1),
    equity_multiplier: numberIn(raw?.equity_multiplier, 0.1, 20, 1),
    risk_percent: numberIn(raw?.risk_percent, 0.1, 20, 1),
    copy_sl: raw?.copy_sl !== false,
    copy_tp: raw?.copy_tp !== false,
    copy_pending: raw?.copy_pending !== false,
    copy_modifications: raw?.copy_modifications !== false,
    slippage_pips: numberIn(raw?.slippage_pips, 0, 1000, 2),
    max_lots: numberIn(raw?.max_lots, 0.01, 1000, 100),
    drawdown_enabled: raw?.drawdown_enabled === true,
    max_drawdown_percent: numberIn(raw?.max_drawdown_percent, 0.1, 100, 5),
    symbol_mapping:
      typeof raw?.symbol_mapping === "string"
        ? raw.symbol_mapping.slice(0, 4000)
        : "",
    updated_at: new Date().toISOString(),
    provider_sync:
      mode === "fixed"
        ? "fixed_lots_supported"
        : "saved_in_investpro_waiting_partner_endpoint",
  };
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const body = await request.json();
    const receiverId = String(body?.receiverId || "");

    if (!receiverId || receiverId === "legacy") {
      return NextResponse.json(
        { error: "Compte receveur invalide." },
        { status: 400 }
      );
    }

    const { data: receiver, error: receiverError } = await supabase
      .from("copier_receivers")
      .select("id,config")
      .eq("id", receiverId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (receiverError || !receiver) {
      return NextResponse.json(
        { error: "Compte receveur introuvable." },
        { status: 404 }
      );
    }

    const currentConfig =
      receiver.config && typeof receiver.config === "object"
        ? receiver.config
        : {};

    const riskEngine = cleanSettings(body?.settings || {});

    const { error: updateError } = await supabase
      .from("copier_receivers")
      .update({
        config: {
          ...currentConfig,
          risk_engine: riskEngine,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiverId)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Impossible d’enregistrer la configuration." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      settings: riskEngine,
      providerSync: riskEngine.provider_sync,
    });
  } catch (error) {
    console.error("[copier/settings][PATCH]", error);
    return NextResponse.json(
      { error: "Impossible d’enregistrer le Risk Engine." },
      { status: 500 }
    );
  }
}
