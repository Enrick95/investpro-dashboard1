import { authenticateAdmin } from "@/lib/admin/permissions";
import { canAdmin } from "@/lib/admin/permissions";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptCopierPassword } from "@/lib/copier/requestCrypto";

function getAdminIds() {
  return String(process.env.INVESTPRO_ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function verifyAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishable || !service) {
    return {
      response: NextResponse.json(
        { error: "Configuration Supabase serveur incomplète." },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return {
      response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }),
    };
  }

  const auth = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await auth.auth.getUser(token);

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Session invalide." }, { status: 401 }),
    };
  }

  if (!await canAdmin(user.id, "copier")) {
    return {
      response: NextResponse.json(
        { error: "Accès administrateur refusé." },
        { status: 403 }
      ),
    };
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { admin, requester: user };
}

export async function GET(request: Request) {
  const verified = await verifyAdmin(request);
  if ("response" in verified && verified.response) return verified.response;

  const { admin } = verified as any;

  const { data, error } = await admin
    .from("copier_account_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { error: "Impossible de charger les demandes." },
      { status: 500 }
    );
  }

  const userIds: string[] = Array.from(
    new Set<string>(
      (data || [])
        .map((row: any) => String(row.user_id || ""))
        .filter((id: string) => Boolean(id))
    )
  );

  const profileMap = new Map<string, any>();
  if (userIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id,username,plan")
      .in("id", userIds);

    for (const row of profiles || []) profileMap.set(row.id, row);
  }

  const authMap = new Map<string, any>();
  for (const id of userIds.slice(0, 300)) {
    const { data: authUser } = await admin.auth.admin.getUserById(id);
    if (authUser?.user) authMap.set(id, authUser.user);
  }

  const { data: associations } = await admin.from("copier_master_ownership")
    .select("request_id,provider_master_id");
  const associationMap = new Map((associations || []).map((m: any) => [m.request_id, m.provider_master_id]));
  const requests = (data || []).map((row: any) => {
    const profile = profileMap.get(row.user_id) || {};
    const auth = authMap.get(row.user_id) || {};

    return {
      id: row.id,
      user_id: row.user_id,
      provider_user_id: row.provider_user_id,
      provider_master_id: associationMap.get(row.id) || "",
      alias: row.alias,
      broker: row.broker || "",
      platform: row.platform,
      login: row.login,
      server: row.server,
      note: row.note || "",
      status: row.status,
      admin_note: row.admin_note || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
      activated_at: row.activated_at,
      member: {
        username:
          profile.username ||
          auth.user_metadata?.username ||
          auth.email?.split("@")[0] ||
          "Trader",
        email: auth.email || "",
        plan: String(profile.plan || "free").toLowerCase(),
      },
    };
  });

  return NextResponse.json({
    pending_count: requests.filter((x: any) =>
      ["pending", "processing"].includes(String(x.status))
    ).length,
    requests,
  });
}

export async function POST(request: Request) {
  const pcheck=await authenticateAdmin(request,"copier_write");
  if("error" in pcheck)return NextResponse.json({error:pcheck.error},{status:pcheck.status});
  const verified = await verifyAdmin(request);
  if ("response" in verified && verified.response) return verified.response;

  const { admin } = verified as any;
  const body = await request.json();

  if (String(body?.action || "") === "assign_master") {
    const requestId = String(body?.id || "");
    const masterId = String(body?.master_id || "").trim();
    if (!requestId || !masterId || masterId.length > 200)
      return NextResponse.json({ error: "Identifiant maître invalide." }, { status: 400 });
    const { data: reqRow, error: reqError } = await admin.from("copier_account_requests")
      .select("id,user_id,status").eq("id", requestId).maybeSingle();
    if (reqError || !reqRow) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
    if (reqRow.status !== "activated") return NextResponse.json({ error: "Active d’abord la demande, puis associe le Master." }, { status: 409 });
    const { error } = await admin.from("copier_master_ownership").upsert(
      { provider_master_id: masterId, user_id: reqRow.user_id, request_id: reqRow.id },
      { onConflict: "request_id" }
    );
    if (error) return NextResponse.json({ error: "Association refusée : Master déjà attribué ou migration SQL manquante." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (String(body?.action || "") !== "reveal") {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }

  const id = String(body?.id || "");
  const { data, error } = await admin
    .from("copier_account_requests")
    .select("password_cipher")
    .eq("id", id)
    .single();

  if (error || !data?.password_cipher) {
    return NextResponse.json(
      { error: "Demande introuvable." },
      { status: 404 }
    );
  }

  try {
    return NextResponse.json({
      password: decryptCopierPassword(data.password_cipher),
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de déchiffrer le mot de passe." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const pcheck=await authenticateAdmin(request,"copier_write");
  if("error" in pcheck)return NextResponse.json({error:pcheck.error},{status:pcheck.status});
  const verified = await verifyAdmin(request);
  if ("response" in verified && verified.response) return verified.response;

  const { admin, requester } = verified as any;
  const body = await request.json();

  const id = String(body?.id || "");
  const status = String(body?.status || "");
  const adminNote = String(body?.admin_note || "").trim();

  if (!id || !["pending", "processing", "activated", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  }

  const { data: current, error: currentError } = await admin
    .from("copier_account_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (currentError || !current) {
    return NextResponse.json(
      { error: "Demande introuvable." },
      { status: 404 }
    );
  }

  if (status === "activated") {
    const { data: existingReceiver } = await admin
      .from("copier_receivers")
      .select("id")
      .eq("user_id", current.user_id)
      .eq("platform", current.platform)
      .eq("login", current.login)
      .eq("server", current.server)
      .maybeSingle();

    if (existingReceiver?.id) {
      await admin
        .from("copier_receivers")
        .update({
          provider_user_id: current.provider_user_id,
          alias: current.alias,
          status: "connected",
          last_connected_at: new Date().toISOString(),
          config: {
            activation_source: "admin_social_trade_hub",
            request_id: current.id,
          },
        })
        .eq("id", existingReceiver.id);
    } else {
      const { count } = await admin
        .from("copier_receivers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", current.user_id);

      const { error: insertError } = await admin
        .from("copier_receivers")
        .insert({
          user_id: current.user_id,
          provider_user_id: current.provider_user_id,
          alias: current.alias,
          platform: current.platform,
          login: current.login,
          server: current.server,
          status: "connected",
          is_primary: Number(count || 0) === 0,
          last_connected_at: new Date().toISOString(),
          config: {
            activation_source: "admin_social_trade_hub",
            request_id: current.id,
          },
        });

      if (insertError) {
        return NextResponse.json(
          { error: `Activation impossible : ${insertError.message}` },
          { status: 500 }
        );
      }
    }
  }

  const patch: Record<string, unknown> = {
    status,
    admin_note: adminNote || null,
    handled_by: requester.id,
    updated_at: new Date().toISOString(),
  };

  if (status === "activated") {
    patch.activated_at = new Date().toISOString();
  }

  const { error } = await admin
    .from("copier_account_requests")
    .update(patch)
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Impossible de mettre à jour la demande." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      status === "activated"
        ? "Compte marqué actif : il est maintenant visible dans InvestPro Copier du membre."
        : "Demande mise à jour.",
  });
}
