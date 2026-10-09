import { authenticateAdmin } from "@/lib/admin/permissions";
import { canAdmin } from "@/lib/admin/permissions";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    return { response: NextResponse.json({ error: "Configuration serveur incomplète." }, { status: 500 }) };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };

  const auth = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await auth.auth.getUser(token);
  if (!user) return { response: NextResponse.json({ error: "Session invalide." }, { status: 401 }) };
  if (!await canAdmin(user.id, "copier")) {
    return { response: NextResponse.json({ error: "Accès administrateur refusé." }, { status: 403 }) };
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
    .from("copier_configuration_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: "Impossible de charger les configurations." }, { status: 500 });
  }

  const userIds: string[] = Array.from(
    new Set<string>((data || []).map((row: any) => String(row.user_id || "")).filter(Boolean))
  );
  const receiverIds: string[] = Array.from(
    new Set<string>((data || []).map((row: any) => String(row.receiver_id || "")).filter(Boolean))
  );

  const profiles = new Map<string, any>();
  if (userIds.length) {
    const { data: profileRows } = await admin.from("profiles").select("id,username,plan").in("id", userIds);
    for (const row of profileRows || []) profiles.set(row.id, row);
  }

  const receivers = new Map<string, any>();
  if (receiverIds.length) {
    const { data: receiverRows } = await admin
      .from("copier_receivers")
      .select("id,alias,platform,login,server,status,provider_user_id,config")
      .in("id", receiverIds);
    for (const row of receiverRows || []) receivers.set(row.id, row);
  }

  const authUsers = new Map<string, any>();
  for (const id of userIds.slice(0, 300)) {
    const { data: authUser } = await admin.auth.admin.getUserById(id);
    if (authUser?.user) authUsers.set(id, authUser.user);
  }

  const requests = (data || []).map((row: any) => {
    const profile = profiles.get(row.user_id) || {};
    const authUser = authUsers.get(row.user_id) || {};
    return {
      ...row,
      receiver: receivers.get(row.receiver_id) || null,
      member: {
        username: profile.username || authUser.user_metadata?.username || authUser.email?.split("@")[0] || "Trader",
        email: authUser.email || "",
        plan: String(profile.plan || "free").toLowerCase(),
      },
    };
  });

  return NextResponse.json({
    pending_count: requests.filter((row: any) => ["pending", "processing"].includes(String(row.status))).length,
    requests,
  });
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

  if (!id || !["pending", "processing", "applied", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  }

  const { data: current, error: currentError } = await admin
    .from("copier_configuration_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (currentError || !current) {
    return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    admin_note: adminNote || null,
    handled_by: requester.id,
    updated_at: now,
  };
  if (status === "applied") patch.applied_at = now;

  const { error } = await admin
    .from("copier_configuration_requests")
    .update(patch)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Impossible de mettre à jour la demande." }, { status: 500 });
  }

  const { data: receiver } = await admin
    .from("copier_receivers")
    .select("id,config")
    .eq("id", current.receiver_id)
    .single();

  if (receiver) {
    const currentConfig = receiver.config && typeof receiver.config === "object" ? receiver.config : {};
    const nextConfig: Record<string, unknown> = {
      ...currentConfig,
      requested_configuration: current.requested_config,
      configuration_status: status,
      configuration_request_id: id,
    };

    if (status === "applied") {
      nextConfig.applied_configuration = current.requested_config;
      nextConfig.applied_configuration_at = now;
    }

    await admin
      .from("copier_receivers")
      .update({ config: nextConfig, updated_at: now })
      .eq("id", current.receiver_id);
  }

  return NextResponse.json({
    ok: true,
    message:
      status === "applied"
        ? "Configuration confirmée comme appliquée dans Social Trade Hub."
        : "Demande mise à jour.",
  });
}
