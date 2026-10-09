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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
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

  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await publicClient.auth.getUser(token);

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Session invalide." }, { status: 401 }),
    };
  }

  if (!await canAdmin(user.id, "finance")) {
    return {
      response: NextResponse.json(
        { error: "Accès administrateur refusé." },
        { status: 403 }
      ),
    };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { admin, requester: user };
}


export async function GET(request: Request) {
  const verified = await verifyAdmin(request);
  if ("response" in verified && verified.response) return verified.response;

  const { admin } = verified as any;

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id,username,plan,created_at");

  if (profilesError) throw profilesError;

  let subscriptions: any[] = [];
  let subscriptionsAvailable = true;

  try {
    const result = await admin
      .from("subscriptions")
      .select("id,user_id,plan,status,provider,current_period_end,cancel_at_period_end,created_at")
      .order("created_at", { ascending: false });
    if (result.error) {
      subscriptionsAvailable = false;
    } else {
      subscriptions = result.data || [];
    }
  } catch {
    subscriptionsAvailable = false;
  }

  const normalizedProfiles = profiles || [];
  const countPlan = (name: string) =>
    normalizedProfiles.filter(
      (profile: any) => String(profile.plan || "free").toLowerCase() === name
    ).length;

  const activeSubscriptions = subscriptions.filter((sub: any) =>
    ["active", "trialing"].includes(String(sub.status || "").toLowerCase())
  );

  return NextResponse.json({
    billing_live: false,
    subscriptions_available: subscriptionsAvailable,
    stats: {
      members: normalizedProfiles.length,
      free: countPlan("free"),
      pro: countPlan("pro"),
      elite:
        countPlan("elite") +
        normalizedProfiles.filter(
          (profile: any) => String(profile.plan || "").toLowerCase() === "vip"
        ).length,
      active_subscriptions: activeSubscriptions.length,
      cancelled: subscriptions.filter(
        (sub: any) =>
          String(sub.status || "").toLowerCase() === "cancelled" ||
          Boolean(sub.cancel_at_period_end)
      ).length,
    },
    subscriptions: subscriptions.slice(0, 100),
  });
}
