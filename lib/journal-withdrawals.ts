/** Cumulative broker balance outflows, kept separate from trade results. */
export type JournalWithdrawalAccount = {
  id: number | string;
  name?: string | null;
  currency?: string | null;
};

export type JournalWithdrawalRow = {
  accountId: string;
  accountName: string;
  currency: string | null;
  amount: number | null;
  observedAt: string | null;
  lastSync: string | null;
  state: "available" | "stale" | "paused" | "error" | "pending" | "unavailable";
};

export type JournalWithdrawals = {
  accounts: JournalWithdrawalRow[];
  totals: { currency: string; amount: number; accountCount: number }[];
  availableCount: number;
  totalCount: number;
  staleCount: number;
};

const FRESHNESS_MS = 180_000;
const MAX_CLOCK_SKEW_MS = 300_000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function identifier(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  const id = String(value).trim();
  return /^[1-9]\d*$/.test(id) ? id : null;
}

function currencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function money(value: unknown): number | null {
  // funding_summary is JSON, so numbers must be actual JSON numbers, not
  // coercible strings, booleans or nulls from a malformed response.
  if (typeof value !== "number") return null;
  const amount = value;
  return Number.isFinite(amount) && amount >= 0 && amount < 1e12 ? amount : null;
}

function timestamp(value: unknown, now: number): { value: string; time: number } | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now + MAX_CLOCK_SKEW_MS
    ? { value, time } : null;
}

type Candidate = {
  row: Record<string, unknown>;
  connection: Record<string, unknown>;
  amount: number | null;
  currency: string | null;
  observed: ReturnType<typeof timestamp>;
  synced: ReturnType<typeof timestamp>;
  time: number;
  usable: boolean;
};

/**
 * Only match the authenticated journal's saved account IDs. A reconnection or
 * duplicate hosted row must never count a cumulative summary more than once.
 * Snapshot timestamps describe account sync, not the date of a withdrawal.
 */
export function buildJournalWithdrawals(
  accounts: readonly JournalWithdrawalAccount[],
  connections: readonly unknown[],
  now = Date.now(),
): JournalWithdrawals {
  const currentTime = Number.isFinite(now) ? now : Date.now();
  const grouped = new Map<string, { row: Record<string, unknown>; connection: Record<string, unknown> }[]>();
  for (const raw of connections) {
    const row = record(raw);
    const connection = record(row?.investpro_mt_connections);
    const id = identifier(connection?.account_id);
    if (!row || !connection || !id) continue;
    const group = grouped.get(id) ?? [];
    group.push({ row, connection });
    grouped.set(id, group);
  }

  const result: JournalWithdrawalRow[] = [];
  const seen = new Set<string>();
  for (const account of accounts) {
    const id = identifier(account.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const accountCurrency = currencyCode(account.currency);
    const candidates: Candidate[] = (grouped.get(id) ?? []).map(({ row, connection }) => {
      const sourceCurrency = currencyCode(connection.currency);
      const mismatch = Boolean(accountCurrency && sourceCurrency && accountCurrency !== sourceCurrency);
      const currency = mismatch ? null : sourceCurrency ?? accountCurrency;
      const amount = money(record(row.funding_summary)?.outflows);
      const observed = timestamp(connection.observed_at, currentTime);
      const synced = timestamp(connection.last_sync, currentTime);
      const time = observed?.time ?? synced?.time ?? -Infinity;
      return { row, connection, currency, amount, observed, synced, time,
        usable: amount !== null && currency !== null && time !== -Infinity };
    });
    // Status-only updated_at is not a financial observation. Prefer the latest
    // valid known summary, retaining it through an error or a pending reconnect.
    candidates.sort((a, b) => Number(b.usable) - Number(a.usable) || b.time - a.time);
    const source = candidates[0];
    const known = Boolean(source?.usable);
    const status = String(source?.row.status ?? "").toLowerCase();
    const paused = source?.row.active === false || source?.connection.revoked === true ||
      ["paused", "stopped", "revoked"].includes(status);
    const failed = ["error", "failed", "disconnected"].includes(status);
    const pending = ["pending", "initializing", "connecting", "queued", "capacity"].includes(status);
    const fresh = known && source.time <= currentTime + 5_000 && currentTime - source.time <= FRESHNESS_MS;
    const state: JournalWithdrawalRow["state"] = !source ? "unavailable" : paused ? "paused"
      : failed ? "error" : pending ? "pending" : !known ? "unavailable" : fresh ? "available" : "stale";
    result.push({
      accountId: id,
      accountName: typeof account.name === "string" && account.name.trim() ? account.name.trim() : `#${id}`,
      currency: source?.currency ?? accountCurrency,
      amount: known ? source.amount : null,
      observedAt: source?.observed?.value ?? null,
      lastSync: source?.synced?.value ?? null,
      state,
    });
  }

  const totals = new Map<string, { currency: string; amount: number; accountCount: number }>();
  for (const account of result) {
    if (account.amount === null || !account.currency) continue;
    const total = totals.get(account.currency) ?? { currency: account.currency, amount: 0, accountCount: 0 };
    total.amount += account.amount;
    total.accountCount += 1;
    totals.set(account.currency, total);
  }
  return {
    accounts: result,
    totals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    availableCount: result.filter((row) => row.amount !== null).length,
    totalCount: result.length,
    staleCount: result.filter((row) => row.amount !== null && row.state !== "available").length,
  };
}
