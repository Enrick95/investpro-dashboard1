import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { assertOwnedMasters } from "@/lib/copier/masterOwnership";

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

    if (riskEngine.mode !== "fixed") {
      const masters = Array.isArray(body?.masters) ? body.masters : [];
      if (!masters.length) return NextResponse.json({ error: "Active au moins un Master pour demander ce mode." }, { status: 400 });
    }

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

    // Les modes avancés ne sont pas pris en charge par les endpoints partenaire connus.
    // On crée donc une demande de traitement, y compris pour le compte du propriétaire.
    let requestStatus = "not_required";
    if (riskEngine.mode !== "fixed") {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !service) return NextResponse.json({ error: "Configuration serveur incomplète." }, { status: 503 });
      const admin = createAdminClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
      const rawMasters = Array.isArray(body?.masters) ? body.masters.slice(0, 30) : [];
      const masters = rawMasters.map((m: any) => ({
        id: String(m?.id || ""),
        name: String(m?.name || "Master").slice(0, 200),
        lots: numberIn(m?.lots, 0.001, 1000, 0.01),
      }));
      if (!masters.length || masters.some((m: any) => !m.id || m.id.length > 200)) {
        return NextResponse.json({ error: "Active au moins un Master avant de demander ce mode de risque." }, { status: 400 });
      }
      try { await assertOwnedMasters(admin, user.id, masters.map((m: any) => m.id)); }
      catch { return NextResponse.json({ error: "Master non autorisé." }, { status: 403 }); }
      const requestedConfig = {
        masters,
        risk: Object.fromEntries(Object.entries(riskEngine).filter(([key]) => !["updated_at", "provider_sync"].includes(key))),
        submitted_at: new Date().toISOString(),
      };
      const { data: existing } = await admin.from("copier_configuration_requests")
        .select("id").eq("user_id", user.id).eq("receiver_id", receiverId)
        .in("status", ["pending", "processing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const action = existing?.id
        ? admin.from("copier_configuration_requests").update({ requested_config: requestedConfig, status: "pending", admin_note: null, updated_at: new Date().toISOString() }).eq("id", existing.id)
        : admin.from("copier_configuration_requests").insert({ user_id: user.id, receiver_id: receiverId, requested_config: requestedConfig, status: "pending" });
      const { error: requestError } = await action;
      if (requestError) return NextResponse.json({ error: "Réglage sauvegardé, mais demande admin non transmise. Réessayez." }, { status: 503 });
      requestStatus = "pending";
    }
    return NextResponse.json({
      ok: true,
      settings: riskEngine,
      providerSync: riskEngine.provider_sync,
      requestStatus,
    });
  } catch (error) {
    console.error("[copier/settings][PATCH]", error);
    return NextResponse.json(
      { error: "Impossible d’enregistrer le Risk Engine." },
      { status: 500 }
    );
  }
}
