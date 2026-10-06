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

  if (!getAdminIds().includes(user.id)) {
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

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,username,plan,xp")
    .order("username", { ascending: true });

  const profileMap = new Map((profiles || []).map((x: any) => [x.id, x]));

  const users: any[] = [];
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) break;
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page += 1;
  }

  const suspended = users
    .filter((user) => Boolean(user.banned_until))
    .map((user) => {
      const profile: any = profileMap.get(user.id) || {};
      return {
        id: user.id,
        username:
          profile.username ||
          user.user_metadata?.username ||
          user.email?.split("@")[0] ||
          "Trader",
        email: user.email || "",
        plan: String(profile.plan || "free").toLowerCase(),
        xp: Number(profile.xp || 0),
        banned_until: user.banned_until,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at || null,
      };
    });

  let deletions: any[] = [];
  try {
    const result = await admin
      .from("account_deletion_requests")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(100);
    deletions = result.data || [];
  } catch {}

  let audit: any[] = [];
  try {
    const result = await admin
      .from("admin_action_logs")
      .select("id,admin_user_id,target_user_id,action,details,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    audit = result.data || [];
  } catch {}

  return NextResponse.json({
    stats: {
      suspended: suspended.length,
      pending_deletions: deletions.filter((x: any) =>
        ["pending", "processing"].includes(String(x.status))
      ).length,
      admin_actions: audit.length,
    },
    suspended,
    deletions,
    audit,
  });
}
