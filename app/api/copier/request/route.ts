
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { encryptCopierPassword } from "@/lib/copier/requestCrypto";

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishable || !service) {
    throw new Error("Configuration Supabase serveur incomplète.");
  }

  return {
    auth: createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    admin: createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function userFrom(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return null;

  const { auth } = clients();
  const {
    data: { user },
    error,
  } = await auth.auth.getUser(token);

  if (error || !user) return null;
  return user;
}

function publicRow(row: any) {
  return {
    id: row.id,
    alias: row.alias,
    broker: row.broker || "",
    platform: row.platform,
    login: row.login,
    server: row.server,
    status: row.status,
    note: row.note || "",
    admin_note: row.admin_note || "",
    provider_user_id: row.provider_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    activated_at: row.activated_at,
  };
}

export async function GET(request: Request) {
  try {
    const user = await userFrom(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const { admin } = clients();
    const { data, error } = await admin
      .from("copier_account_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({
      requests: (data || []).map(publicRow),
    });
  } catch (error) {
    console.error("[copier-request][GET]", error);
    return NextResponse.json(
      { error: "Impossible de charger les demandes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await userFrom(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const body = await request.json();

    const alias = String(body?.alias || "").trim();
    const broker = String(body?.broker || "").trim();
    const platform = String(body?.platform || "").toUpperCase();
    const login = String(body?.login || "").trim();
    const server = String(body?.server || "").trim();
    const password = String(body?.password || "");
    const note = String(body?.note || "").trim();

    if (!alias || !["MT4", "MT5"].includes(platform)) {
      return NextResponse.json(
        { error: "Alias et plateforme requis." },
        { status: 400 }
      );
    }

    if (!/^\d{1,20}$/.test(login)) {
      return NextResponse.json(
        { error: "Numéro de compte invalide." },
        { status: 400 }
      );
    }

    if (!server || server.length > 200 || !password || password.length > 256) {
      return NextResponse.json(
        { error: "Serveur ou mot de passe invalide." },
        { status: 400 }
      );
    }

    const { admin } = clients();

    const { data: existing } = await admin
      .from("copier_account_requests")
      .select("id,status")
      .eq("user_id", user.id)
      .eq("platform", platform)
      .eq("login", login)
      .eq("server", server)
      .in("status", ["pending", "processing"])
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Une demande est déjà en cours pour ce compte." },
        { status: 409 }
      );
    }

    const providerUserId = randomUUID();
    const passwordCipher = encryptCopierPassword(password);

    const { data, error } = await admin
      .from("copier_account_requests")
      .insert({
        user_id: user.id,
        provider_user_id: providerUserId,
        alias,
        broker: broker || null,
        platform,
        login,
        server,
        password_cipher: passwordCipher,
        note: note || null,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      request: publicRow(data),
      message:
        "Demande transmise. L’équipe InvestPro va activer le compte à distance.",
    });
  } catch (error) {
    console.error("[copier-request][POST]", error);
    return NextResponse.json(
      { error: "Impossible d’envoyer la demande." },
      { status: 500 }
    );
  }
}
