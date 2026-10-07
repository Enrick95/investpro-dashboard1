import type { SupabaseClient } from "@supabase/supabase-js";

type TradingAccountScopeRow = {
  id: number;
  connection_type: string | null;
};

type MetaConnectionScopeRow = {
  account_id: number;
  revoked: boolean;
  last_sync: string | null;
};

type FutureConnectionScopeRow = {
  trading_account_id: number;
  status: string | null;
};

type HostedConnectionScopeRow = {
  active?: boolean;
  status?: string | null;
  investpro_mt_connections?: {
    account_id?: number;
    last_sync?: string | null;
    revoked?: boolean;
  } | null;
};

const META_ONLINE_WINDOW_MS = 5 * 60 * 1000;

function fresh(value?: string | null) {
  if (!value) return false;
  const stamp = new Date(value).getTime();
  return Number.isFinite(stamp) && Date.now() - stamp <= META_ONLINE_WINDOW_MS;
}

export async function loadActiveTradingScope(
  db: SupabaseClient,
  userId: string
) {
  const [accountsResult, futuresResult, metaResult, hostedResult] = await Promise.all([
    db
      .from("trading_accounts")
      .select("id,connection_type")
      .eq("user_id", userId),

    db
      .from("futures_connections")
      .select("trading_account_id,status")
      .eq("user_id", userId),

    fetch("/api/metasync/connect", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        return response.ok && Array.isArray(json?.connections)
          ? (json.connections as MetaConnectionScopeRow[])
          : [];
      })
      .catch(() => [] as MetaConnectionScopeRow[]),

    fetch("/api/metasync/hosted", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        return response.ok && Array.isArray(json?.connections)
          ? (json.connections as HostedConnectionScopeRow[])
          : [];
      })
      .catch(() => [] as HostedConnectionScopeRow[]),
  ]);

  const accounts =
    (accountsResult.data as TradingAccountScopeRow[] | null) || [];

  const existingIds = new Set(accounts.map((account) => Number(account.id)));
  const activeIds = new Set<number>();

  // Un compte manuel encore présent dans Mes comptes reste volontairement actif.
  for (const account of accounts) {
    if (String(account.connection_type || "").toLowerCase() === "manual") {
      activeIds.add(Number(account.id));
    }
  }

  // MetaTrader : seulement les connexions non révoquées réellement fraîches.
  for (const row of metaResult) {
    const accountId = Number(row.account_id);
    if (!row.revoked && existingIds.has(accountId) && fresh(row.last_sync)) {
      activeIds.add(accountId);
    }
  }


  // MetaTrader hébergé : source principale pour les clients standards.
  // On ne dépend donc pas de l'ancienne route pilote /api/metasync/connect.
  for (const hosted of hostedResult) {
    const mt = hosted.investpro_mt_connections;
    const accountId = Number(mt?.account_id);
    if (
      hosted.active !== false &&
      mt &&
      mt.revoked !== true &&
      existingIds.has(accountId) &&
      fresh(mt.last_sync)
    ) {
      activeIds.add(accountId);
    }
  }

  // Futures : une connexion marquée connected reste dans le périmètre actif.
  if (!futuresResult.error) {
    for (const row of (futuresResult.data || []) as FutureConnectionScopeRow[]) {
      const accountId = Number(row.trading_account_id);
      if (
        existingIds.has(accountId) &&
        String(row.status || "").toLowerCase() === "connected"
      ) {
        activeIds.add(accountId);
      }
    }
  }

  return {
    activeIds,
    existingIds,
    activeAccountIds: [...activeIds],
  };
}

export function scopeTradesToActiveAccounts<
  T extends { account_id: number | null }
>(rows: T[], activeIds: Set<number>) {
  return rows.filter(
    (row) => row.account_id != null && activeIds.has(Number(row.account_id))
  );
}
