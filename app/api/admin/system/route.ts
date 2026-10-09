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
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!accessToken) {
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
  } = await publicClient.auth.getUser(accessToken);

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Session invalide." }, { status: 401 }),
    };
  }

  if (!await canAdmin(user.id, "system")) {
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

  return { admin };
}

async function safeQuery<T>(promise: PromiseLike<any>, fallback: T) {
  try {
    const result = await promise;
    if (result?.error) return { data: fallback, available: false, error: result.error.message || "Erreur Supabase" };
    return { data: (result?.data ?? fallback) as T, available: true, error: null };
  } catch (error: any) {
    return { data: fallback, available: false, error: error?.message || "Indisponible" };
  }
}

function isRecent(value: string | null | undefined, minutes: number) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= minutes * 60_000;
}

export async function GET(request: Request) {
  try {
    const verified = await verifyAdmin(request);
    if ("response" in verified && verified.response) return verified.response;

    const { admin } = verified as any;

    const [
      projectXResult,
      mtResult,
      hostedResult,
      accountsResult,
      profilesResult,
    ] = await Promise.all([
      safeQuery<any[]>(
        admin
          .from("futures_connections")
          .select(
            "id,user_id,trading_account_id,provider,external_account_id,external_account_name,username,status,last_sync_at,updated_at,created_at"
          )
          .order("updated_at", { ascending: false }),
        []
      ),

      safeQuery<any[]>(
        admin
          .from("investpro_mt_connections")
          .select(
            "id,user_id,account_id,login,server,platform,currency,revoked,last_sync,warnings,created_at"
          )
          .order("created_at", { ascending: false }),
        []
      ),

      safeQuery<any[]>(
        admin
          .from("investpro_mt_hosted")
          .select(
            "id,user_id,broker_id,active,status,updated_at,capital_auto,capital_reference,capital_method,equity"
          )
          .order("updated_at", { ascending: false }),
        []
      ),

      safeQuery<any[]>(
        admin
          .from("trading_accounts")
          .select(
            "id,user_id,name,account_type,platform,broker,currency,current_balance,connection_type,updated_at"
          )
          .order("updated_at", { ascending: false }),
        []
      ),

      safeQuery<any[]>(
        admin
          .from("profiles")
          .select("id,username,plan"),
        []
      ),
    ]);

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

    const authMap = new Map(users.map((user) => [user.id, user]));
    const profileMap = new Map(
      profilesResult.data.map((profile: any) => [profile.id, profile])
    );
    const accountMap = new Map(
      accountsResult.data.map((account: any) => [Number(account.id), account])
    );

    function member(userId: string) {
      const auth: any = authMap.get(userId) || {};
      const profile: any = profileMap.get(userId) || {};
      return {
        id: userId,
        username:
          profile.username ||
          auth.user_metadata?.username ||
          auth.email?.split("@")[0] ||
          "Trader",
        email: auth.email || "",
        plan: String(profile.plan || "free").toLowerCase(),
      };
    }

    const projectx = projectXResult.data.map((connection: any) => {
      const account: any = accountMap.get(Number(connection.trading_account_id)) || {};
      const status = String(connection.status || "unknown");
      return {
        id: `projectx-${connection.id}`,
        raw_id: connection.id,
        source: "ProjectX",
        kind: "Futures",
        member: member(connection.user_id),
        account_name:
          connection.external_account_name ||
          account.name ||
          `ProjectX ${connection.external_account_id || ""}`.trim(),
        account_id: connection.trading_account_id || null,
        external_account_id: connection.external_account_id || null,
        broker: account.broker || "ProjectX",
        platform: "ProjectX",
        balance:
          account.current_balance != null
            ? Number(account.current_balance)
            : null,
        currency: account.currency || "USD",
        status,
        connected: status === "connected",
        last_sync_at: connection.last_sync_at || null,
        updated_at: connection.updated_at || connection.created_at || null,
        warning_count: 0,
        warnings: [],
      };
    });

    const hostedByUser = new Map<string, any[]>();
    for (const hosted of hostedResult.data) {
      const list = hostedByUser.get(hosted.user_id) || [];
      list.push(hosted);
      hostedByUser.set(hosted.user_id, list);
    }

    const metatrader = mtResult.data.map((connection: any) => {
      const account: any = accountMap.get(Number(connection.account_id)) || {};
      const hostedCandidates = hostedByUser.get(connection.user_id) || [];
      const hosted = hostedCandidates.find(
        (item: any) =>
          item.active &&
          (String(item.status || "").toLowerCase() === "syncing" ||
            String(item.status || "").toLowerCase() === "ready")
      );

      const warnings = Array.isArray(connection.warnings)
        ? connection.warnings.map(String)
        : [];

      let status = connection.revoked ? "revoked" : "connected";
      if (!connection.revoked && hosted?.status) {
        status = String(hosted.status);
      } else if (!connection.revoked && connection.last_sync && !isRecent(connection.last_sync, 10)) {
        status = "stale";
      }

      return {
        id: `mt-${connection.id}`,
        raw_id: connection.id,
        source: connection.platform || "MetaTrader",
        kind: hosted ? "MetaTrader hébergé" : "MetaTrader",
        member: member(connection.user_id),
        account_name:
          account.name ||
          `${connection.platform || "MT"} · ${connection.login || ""}`.trim(),
        account_id: connection.account_id || null,
        external_account_id: connection.login || null,
        broker: account.broker || connection.server || "MetaTrader",
        platform: connection.platform || account.platform || "MetaTrader",
        balance:
          account.current_balance != null
            ? Number(account.current_balance)
            : null,
        currency: connection.currency || account.currency || "",
        status,
        connected: !connection.revoked,
        last_sync_at: connection.last_sync || null,
        updated_at: hosted?.updated_at || connection.last_sync || connection.created_at || null,
        warning_count: warnings.length,
        warnings,
      };
    });

    const connections = [...projectx, ...metatrader].sort((a, b) =>
      String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
    );

    const automaticAccounts = accountsResult.data.filter(
      (account: any) => account.connection_type === "automatic"
    );

    const stale = connections.filter(
      (connection) =>
        connection.connected &&
        connection.last_sync_at &&
        !isRecent(connection.last_sync_at, 60)
    ).length;

    const neverSynced = connections.filter(
      (connection) => connection.connected && !connection.last_sync_at
    ).length;

    return NextResponse.json({
      stats: {
        connections_total: connections.length,
        connected_total: connections.filter((item) => item.connected).length,
        projectx_total: projectx.length,
        metatrader_total: metatrader.length,
        automatic_accounts_total: automaticAccounts.length,
        stale_total: stale,
        never_synced_total: neverSynced,
        warning_total: connections.reduce(
          (sum, item) => sum + Number(item.warning_count || 0),
          0
        ),
      },
      availability: {
        futures_connections: projectXResult.available,
        metatrader_connections: mtResult.available,
        metatrader_hosted: hostedResult.available,
        trading_accounts: accountsResult.available,
      },
      environment: {
        supabase_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        futures_credentials_key: Boolean(process.env.FUTURES_CREDENTIALS_KEY),
        projectx_api: true,
        projectx_custom_base_url: Boolean(process.env.PROJECTX_API_BASE_URL),
        metasync_site_origin: Boolean(process.env.METASYNC_SITE_ORIGIN),
        metasync_pilot_users: Boolean(process.env.METASYNC_PILOT_USER_IDS),
        metasync_hosted_worker: Boolean(process.env.METASYNC_HOSTED_WORKER_TOKEN),
      },
      connections,
    });
  } catch (error: any) {
    console.error("InvestPro admin system:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur système admin." },
      { status: 500 }
    );
  }
}
