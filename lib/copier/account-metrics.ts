export type CopierMetricsReceiver = {
  id: string;
  alias: string;
  login: string;
  platform: string;
  server: string;
};

export type CopierMetricsAccount = Record<string, unknown>;

export type HostedCopierAccountSync = {
  id?: string;
  active?: boolean;
  status?: string;
  revoked?: boolean;
  revoked_at?: string | null;
  equity?: unknown;
  floating_pnl?: unknown;
  open_positions?: unknown;
  metrics_observed_at?: string | null;
  investpro_mt_connections?: {
    account_id?: number | string | null;
    login?: string;
    server?: string;
    platform?: string;
    currency?: string | null;
    last_sync?: string | null;
    observed_at?: string | null;
    revoked_at?: string | null;
    revoked?: boolean;
  } | null;
};

export type CopierAccountMetric = {
  receiverId: string;
  alias: string;
  identityKey: string;
  sourceAccountId: number | string | null;
  balance: number | null;
  equity: number | null;
  floatingPnl: number | null;
  openPositions: number | null;
  currency: string | null;
  lastSync: string | null;
  metricsObservedAt: string | null;
  status: "fresh" | "stale" | "missing" | "paused" | "error" | "pending";
  hasSync: boolean;
  isFresh: boolean;
};

export type CopierPnlAggregate = {
  currencies: { currency: string; pnl: number; accountCount: number }[];
  coveredCount: number;
  totalCount: number;
  missingAliases: string[];
  openPositions: number | null;
  oldestObservedAt: string | null;
};

export const COPIER_METRICS_FRESHNESS_MS = 180_000;
export const COPIER_METRICS_FUTURE_TOLERANCE_MS = 5_000;

function numberOrNull(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? (result === 0 ? 0 : result) : null;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function currencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function identity(value: { login?: string; platform?: string; server?: string }): string | null {
  const login = typeof value.login === "string" ? value.login.trim() : "";
  const platform = typeof value.platform === "string" ? value.platform.trim().toUpperCase() : "";
  const server = typeof value.server === "string" ? value.server.trim().toLowerCase() : "";
  if (!login || !["MT4", "MT5"].includes(platform) || !server) return null;
  return JSON.stringify([platform, login, server]);
}

function accountId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value).trim();
  // Account identifiers are compared as identifiers, without coercing null to zero.
  return id && id !== "0" ? id : null;
}

/** Match only a saved MetaSync identity. Aliases and similarly named accounts are not identities. */
export function buildCopierAccountMetrics(
  receivers: readonly CopierMetricsReceiver[],
  accounts: readonly CopierMetricsAccount[],
  hostedSyncs: readonly HostedCopierAccountSync[],
  now = Date.now(),
): CopierAccountMetric[] {
  const accountsById = new Map<string, CopierMetricsAccount>();
  for (const account of accounts) {
    const id = accountId(account.id);
    if (id) accountsById.set(id, account);
  }

  return receivers.map((receiver) => {
    const key = identity(receiver);
    const candidates = key ? hostedSyncs.filter((row) => row.investpro_mt_connections && identity(row.investpro_mt_connections) === key) : [];
    // A replacement active connection wins over an old stopped connection. Within
    // that set, the newest observed snapshot wins, not the latest UI fetch time.
    const usable = candidates.filter((row) => row.active !== false && row.revoked !== true && !row.revoked_at && row.investpro_mt_connections?.revoked !== true && !row.investpro_mt_connections?.revoked_at);
    const source = [...(usable.length ? usable : candidates)].sort((a, b) => {
      const age = (row: HostedCopierAccountSync) => timestamp(row.metrics_observed_at) ?? timestamp(row.investpro_mt_connections?.observed_at) ?? timestamp(row.investpro_mt_connections?.last_sync) ?? -Infinity;
      return age(b) - age(a);
    })[0];
    const connection = source?.investpro_mt_connections;
    const linkedId = accountId(connection?.account_id);
    const account = linkedId ? accountsById.get(linkedId) : undefined;
    const connectionCurrency = currencyCode(connection?.currency);
    const accountCurrency = currencyCode(account?.currency);
    const currencyConflict = Boolean(connectionCurrency && accountCurrency && connectionCurrency !== accountCurrency);
    const currency = currencyConflict ? null : connectionCurrency ?? accountCurrency;
    const observed = timestamp(source?.metrics_observed_at);
    const connectionObserved = timestamp(connection?.observed_at);
    const isCurrentObservation = observed !== null && Number.isFinite(now) &&
      now - observed <= COPIER_METRICS_FRESHNESS_MS &&
      observed <= now + COPIER_METRICS_FUTURE_TOLERANCE_MS &&
      // last_sync is a transport receipt time, often after the sampled value.
      // Only an actual newer account observation can invalidate the P&L sample.
      (connectionObserved === null || connectionObserved <= observed + COPIER_METRICS_FUTURE_TOLERANCE_MS);
    const sourceStatus = String(source?.status ?? "").toLowerCase();
    const inactive = source?.active === false || source?.revoked === true || connection?.revoked === true || Boolean(source?.revoked_at || connection?.revoked_at);
    const error = ["error", "failed", "disconnected"].includes(sourceStatus);
    const paused = inactive || ["paused", "stopped", "revoked"].includes(sourceStatus);
    const pending = ["pending", "initializing", "queued"].includes(sourceStatus);
    const isFresh = Boolean(source && !paused && !error && !pending && isCurrentObservation);
    // A new trading_accounts row starts at zero before the first broker read.
    // An observed or received snapshot is required before that balance is real.
    const hasBaseSnapshot = observed !== null || connectionObserved !== null || timestamp(connection?.last_sync) !== null;
    const positionCount = numberOrNull(source?.open_positions);
    const status: CopierAccountMetric["status"] = !source ? "missing" : paused ? "paused" : error ? "error" : pending ? "pending" : isFresh ? "fresh" : "stale";

    return {
      receiverId: receiver.id,
      alias: receiver.alias,
      identityKey: key ?? `receiver:${receiver.id}`,
      sourceAccountId: connection?.account_id ?? null,
      balance: currencyConflict || !hasBaseSnapshot ? null : numberOrNull(account?.current_balance),
      equity: hasBaseSnapshot ? numberOrNull(source?.equity) : null,
      // Never derive floating P&L from equity minus balance: credit, fees and
      // account adjustments can make that difference unrelated to positions.
      floatingPnl: numberOrNull(source?.floating_pnl),
      openPositions: positionCount !== null && Number.isSafeInteger(positionCount) && positionCount >= 0 ? positionCount : null,
      currency,
      lastSync: timestamp(connection?.last_sync) !== null ? connection?.last_sync ?? null : null,
      metricsObservedAt: observed !== null ? source?.metrics_observed_at ?? null : null,
      status,
      hasSync: Boolean(source),
      isFresh,
    };
  });
}

/** Totals contain only recent explicit snapshots, once per trading-account identity. */
export function aggregateCopierPnl(metrics: readonly CopierAccountMetric[]): CopierPnlAggregate {
  const unique = new Map<string, CopierAccountMetric>();
  for (const metric of metrics) {
    const previous = unique.get(metric.identityKey);
    const usable = metric.isFresh && metric.floatingPnl !== null && metric.currency !== null;
    const previousUsable = previous?.isFresh && previous.floatingPnl !== null && previous.currency !== null;
    if (!previous || (usable && !previousUsable) || (usable === Boolean(previousUsable) && (timestamp(metric.metricsObservedAt) ?? -Infinity) > (timestamp(previous.metricsObservedAt) ?? -Infinity))) {
      unique.set(metric.identityKey, metric);
    }
  }

  const currencies = new Map<string, { currency: string; pnl: number; accountCount: number }>();
  const missingAliases: string[] = [];
  let coveredCount = 0;
  let positions = 0;
  let positionsComplete = unique.size > 0;
  let oldestObserved: number | null = null;
  for (const metric of unique.values()) {
    if (metric.isFresh && metric.openPositions !== null) positions += metric.openPositions;
    else positionsComplete = false;
    if (!metric.isFresh || metric.floatingPnl === null || !metric.currency) {
      missingAliases.push(metric.alias);
      continue;
    }
    coveredCount += 1;
    const previous = currencies.get(metric.currency);
    currencies.set(metric.currency, { currency: metric.currency, pnl: (previous?.pnl ?? 0) + metric.floatingPnl, accountCount: (previous?.accountCount ?? 0) + 1 });
    const observed = timestamp(metric.metricsObservedAt);
    if (observed !== null) oldestObserved = oldestObserved === null ? observed : Math.min(oldestObserved, observed);
  }

  return {
    currencies: Array.from(currencies.values()).sort((a, b) => a.currency.localeCompare(b.currency)),
    coveredCount,
    totalCount: unique.size,
    missingAliases,
    openPositions: positionsComplete ? positions : null,
    oldestObservedAt: oldestObserved === null ? null : new Date(oldestObserved).toISOString(),
  };
}
