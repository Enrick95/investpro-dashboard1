import type { SupabaseClient } from "@supabase/supabase-js";

type TradingAccountScopeRow = {
  id: number;
};

/** Stored account/history visibility is independent of a connection's online status.
 * Keep the existing export and result shape for dashboard, journal and report callers.
 */
export async function loadActiveTradingScope(
  db: SupabaseClient,
  userId: string
) {
  const accountsResult = await db
    .from("trading_accounts")
    .select("id")
    .eq("user_id", userId);
  // Preserve the existing fail-closed result contract used by all five callers.
  const accounts =
    accountsResult.error ? [] : (accountsResult.data as TradingAccountScopeRow[] | null) || [];

  const existingIds = new Set(accounts.map(account => Number(account.id)).filter(id => Number.isSafeInteger(id) && id > 0));
  const activeIds = new Set(existingIds);

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
