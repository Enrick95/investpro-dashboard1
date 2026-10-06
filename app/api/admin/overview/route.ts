import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminIds() {
  return String(process.env.INVESTPRO_ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Configuration Supabase serveur incomplète." },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!accessToken) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const publicClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await publicClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Session invalide." }, { status: 401 });
    }

    const adminIds = getAdminIds();

    if (!adminIds.includes(user.id)) {
      return NextResponse.json({ error: "Accès administrateur refusé." }, { status: 403 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const users: any[] = [];
    let page = 1;

    while (page <= 20) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });

      if (error) throw error;

      users.push(...data.users);

      if (data.users.length < 1000) break;
      page += 1;
    }

    const userIds = users.map((item) => item.id);

    const [profilesResult, accountsResult, tradesResult] = await Promise.all([
      userIds.length
        ? admin
            .from("profiles")
            .select("id,username,plan,xp,avatar_url")
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null } as any),

      userIds.length
        ? admin
            .from("trading_accounts")
            .select("id,user_id,connection_type")
            .in("user_id", userIds)
        : Promise.resolve({ data: [], error: null } as any),

      userIds.length
        ? admin
            .from("trading_journal")
            .select("id,user_id,trade_date,status")
            .in("user_id", userIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (accountsResult.error) throw accountsResult.error;
    if (tradesResult.error) throw tradesResult.error;

    const profiles = new Map(
      (profilesResult.data || []).map((profile: any) => [profile.id, profile])
    );

    const accountCount = new Map<string, number>();
    const automaticCount = new Map<string, number>();

    for (const account of accountsResult.data || []) {
      accountCount.set(
        account.user_id,
        (accountCount.get(account.user_id) || 0) + 1
      );

      if (account.connection_type === "automatic") {
        automaticCount.set(
          account.user_id,
          (automaticCount.get(account.user_id) || 0) + 1
        );
      }
    }

    const tradeCount = new Map<string, number>();
    const lastTrade = new Map<string, string>();

    for (const trade of tradesResult.data || []) {
      tradeCount.set(
        trade.user_id,
        (tradeCount.get(trade.user_id) || 0) + 1
      );

      const current = lastTrade.get(trade.user_id);
      if (!current || String(trade.trade_date) > current) {
        lastTrade.set(trade.user_id, String(trade.trade_date));
      }
    }

    const now = Date.now();
    const members = users
      .map((authUser) => {
        const profile: any = profiles.get(authUser.id) || {};
        const lastSignIn = authUser.last_sign_in_at || null;

        const active =
          !!lastSignIn &&
          now - new Date(lastSignIn).getTime() <= 30 * 24 * 60 * 60 * 1000;

        return {
          id: authUser.id,
          email: authUser.email || "",
          username:
            profile.username ||
            authUser.user_metadata?.username ||
            authUser.email?.split("@")[0] ||
            "Trader",
          plan: String(profile.plan || "free").toLowerCase(),
          xp: Number(profile.xp || 0),
          avatar_url: profile.avatar_url || null,
          created_at: authUser.created_at || null,
          last_sign_in_at: lastSignIn,
          accounts_count: accountCount.get(authUser.id) || 0,
          automatic_accounts_count: automaticCount.get(authUser.id) || 0,
          trades_count: tradeCount.get(authUser.id) || 0,
          last_trade_at: lastTrade.get(authUser.id) || null,
          active,
          banned_until: authUser.banned_until || null,
        };
      })
      .sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || ""))
      );

    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    return NextResponse.json({
      stats: {
        members_total: members.length,
        new_7d: members.filter(
          (m) => m.created_at && new Date(m.created_at).getTime() >= sevenDaysAgo
        ).length,
        active_30d: members.filter((m) => m.active).length,
        accounts_total: (accountsResult.data || []).length,
        auto_accounts_total: (accountsResult.data || []).filter(
          (a: any) => a.connection_type === "automatic"
        ).length,
        trades_total: (tradesResult.data || []).length,
      },
      members,
    });
  } catch (error: any) {
    console.error("InvestPro admin overview:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur admin." },
      { status: 500 }
    );
  }
}
