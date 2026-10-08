import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function cleanNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function cleanConfig(raw: any) {
  const modes = ["fixed", "mirror", "balance", "equity", "percent"];
  const mode = modes.includes(raw?.risk?.mode) ? raw.risk.mode : "fixed";

  const masters = Array.isArray(raw?.masters)
    ? raw.masters
        .slice(0, 30)
        .map((master: any) => ({
          id: String(master?.id || "").slice(0, 200),
          name: String(master?.name || "Master").slice(0, 200),
          lots: cleanNumber(master?.lots, 0.001, 1000, 0.01),
        }))
        .filter((master: any) => master.id)
    : [];

  return {
    masters,
    risk: {
      mode,
      fixed_lots: cleanNumber(raw?.risk?.fixed_lots, 0.001, 1000, 0.01),
      mirror_multiplier: cleanNumber(raw?.risk?.mirror_multiplier, 0.1, 20, 1),
      balance_multiplier: cleanNumber(raw?.risk?.balance_multiplier, 0.1, 20, 1),
      equity_multiplier: cleanNumber(raw?.risk?.equity_multiplier, 0.1, 20, 1),
      risk_percent: cleanNumber(raw?.risk?.risk_percent, 0.1, 20, 1),
      copy_sl: raw?.risk?.copy_sl !== false,
      copy_tp: raw?.risk?.copy_tp !== false,
      copy_pending: raw?.risk?.copy_pending !== false,
      copy_modifications: raw?.risk?.copy_modifications !== false,
      slippage_pips: cleanNumber(raw?.risk?.slippage_pips, 0, 1000, 2),
      max_lots: cleanNumber(raw?.risk?.max_lots, 0.01, 1000, 100),
      drawdown_enabled: raw?.risk?.drawdown_enabled === true,
      max_drawdown_percent: cleanNumber(raw?.risk?.max_drawdown_percent, 0.1, 100, 5),
      symbol_mapping:
        typeof raw?.risk?.symbol_mapping === "string"
          ? raw.risk.symbol_mapping.slice(0, 4000)
          : "",
    },
    submitted_at: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) {
      return NextResponse.json({ error: "Configuration serveur incomplète." }, { status: 500 });
    }

    const { createClient: createAdmin } = await import("@supabase/supabase-js");
    const admin = createAdmin(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin
      .from("copier_configuration_requests")
      .select("id,receiver_id,requested_config,status,admin_note,created_at,updated_at,applied_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return NextResponse.json({ requests: data || [] });
  } catch (error) {
    console.error("[copier/config-request][GET]", error);
    return NextResponse.json({ error: "Impossible de charger les demandes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const body = await request.json();
    const receiverId = String(body?.receiverId || "");
    if (!receiverId || receiverId === "legacy") {
      return NextResponse.json({ error: "Compte receveur invalide." }, { status: 400 });
    }

    const { data: receiver, error: receiverError } = await supabase
      .from("copier_receivers")
      .select("id,alias,platform,login,server,config")
      .eq("id", receiverId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (receiverError || !receiver) {
      return NextResponse.json({ error: "Compte receveur introuvable." }, { status: 404 });
    }

    const requestedConfig = cleanConfig(body?.config || {});
    if (!requestedConfig.masters.length) {
      return NextResponse.json(
        { error: "Sélectionne au moins une stratégie maître." },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) {
      return NextResponse.json({ error: "Configuration serveur incomplète." }, { status: 500 });
    }

    const { createClient: createAdmin } = await import("@supabase/supabase-js");
    const admin = createAdmin(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existing } = await admin
      .from("copier_configuration_requests")
      .select("id,status")
      .eq("user_id", user.id)
      .eq("receiver_id", receiverId)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let row;
    if (existing?.id) {
      const { data, error } = await admin
        .from("copier_configuration_requests")
        .update({
          requested_config: requestedConfig,
          status: "pending",
          admin_note: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      row = data;
    } else {
      const { data, error } = await admin
        .from("copier_configuration_requests")
        .insert({
          user_id: user.id,
          receiver_id: receiverId,
          requested_config: requestedConfig,
          status: "pending",
        })
        .select("*")
        .single();
      if (error) throw error;
      row = data;
    }

    const currentConfig =
      receiver.config && typeof receiver.config === "object" ? receiver.config : {};

    await admin
      .from("copier_receivers")
      .update({
        config: {
          ...currentConfig,
          requested_configuration: requestedConfig,
          configuration_status: "pending",
          configuration_request_id: row.id,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiverId)
      .eq("user_id", user.id);

    return NextResponse.json({
      ok: true,
      request: row,
      message:
        "Configuration transmise à InvestPro. Elle sera appliquée manuellement dans Social Trade Hub avant confirmation.",
    });
  } catch (error) {
    console.error("[copier/config-request][POST]", error);
    return NextResponse.json({ error: "Impossible d’envoyer la configuration." }, { status: 500 });
  }
}
