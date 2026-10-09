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
    throw new Error("Configuration Supabase serveur incomplète.");
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!accessToken) {
    return { response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  }

  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user: requester },
    error: requesterError,
  } = await publicClient.auth.getUser(accessToken);

  if (requesterError || !requester) {
    return { response: NextResponse.json({ error: "Session invalide." }, { status: 401 }) };
  }

  if (!await canAdmin(requester.id, "users")) {
    return { response: NextResponse.json({ error: "Accès administrateur refusé." }, { status: 403 }) };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { requester, admin };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const verified = await verifyAdmin(request);

    if ("response" in verified && verified.response) return verified.response;

    const { admin } = verified as any;

    const { data: authData, error: authError } =
      await admin.auth.admin.getUserById(id);

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
    }

    const authUser = authData.user;

    const [
      profileResult,
      accountsResult,
      tradesResult,
      prefsResult,
      planResult,
      logsResult,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id,username,plan,xp,avatar_url")
        .eq("id", id)
        .maybeSingle(),

      admin
        .from("trading_accounts")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),

      admin
        .from("trading_journal")
        .select("id,symbol,trade_date,status,result_amount,result_r,risk_percent")
        .eq("user_id", id)
        .order("trade_date", { ascending: false })
        .limit(25),

      admin
        .from("trader_preferences")
        .select("*")
        .eq("user_id", id)
        .maybeSingle(),

      admin
        .from("trading_plans")
        .select("*")
        .eq("user_id", id)
        .maybeSingle(),

      admin
        .from("admin_action_logs")
        .select("id,admin_user_id,target_user_id,action,details,created_at")
        .eq("target_user_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (accountsResult.error) throw accountsResult.error;
    if (tradesResult.error) throw tradesResult.error;

    // Si la table de logs n'a pas encore été créée, on ne casse pas toute la fiche.
    const adminLogs = logsResult.error ? [] : logsResult.data || [];

    const profile: any = profileResult.data || {};
    const accounts: any[] = accountsResult.data || [];
    const trades: any[] = tradesResult.data || [];

    const closedTrades = trades.filter((trade) =>
      ["closed", "win", "loss", "be"].includes(
        String(trade.status || "").toLowerCase()
      )
    );

    const wins = closedTrades.filter((trade) => {
      const r = Number(trade.result_r || 0);
      const amount = Number(trade.result_amount || 0);
      return (
        r > 0 ||
        amount > 0 ||
        String(trade.status || "").toLowerCase() === "win"
      );
    }).length;

    const totalR = closedTrades.reduce(
      (sum, trade) => sum + Number(trade.result_r || 0),
      0
    );

    return NextResponse.json({
      member: {
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
        last_sign_in_at: authUser.last_sign_in_at || null,
        banned_until: authUser.banned_until || null,
        email_confirmed_at: authUser.email_confirmed_at || null,
        phone: authUser.phone || null,
        provider: authUser.app_metadata?.provider || "email",
      },
      accounts,
      trades,
      preferences: prefsResult.data || null,
      trading_plan: planResult.data || null,
      admin_logs: adminLogs,
      metrics: {
        accounts_count: accounts.length,
        automatic_accounts_count: accounts.filter(
          (account) => account.connection_type === "automatic"
        ).length,
        trades_count: trades.length,
        closed_trades_count: closedTrades.length,
        winrate:
          closedTrades.length > 0
            ? Math.round((wins / closedTrades.length) * 1000) / 10
            : 0,
        total_r: Math.round(totalR * 100) / 100,
      },
    });
  } catch (error: any) {
    console.error("InvestPro admin member:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur admin." },
      { status: 500 }
    );
  }
}
