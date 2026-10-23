import {
  COPIER_METRICS_FRESHNESS_MS,
  COPIER_METRICS_FUTURE_TOLERANCE_MS,
  type CopierAccountMetric,
} from "./account-metrics";

export type CopierDayTrade = {
  id: number | string;
  account_id: number | string | null;
  trade_date: string;
  status: string;
  result_amount: unknown;
  sync_connection_id?: string | null;
  sync_external_id?: string | null;
};

export type CopierDaySnapshot = {
  day: string;
  rows: CopierDayTrade[];
  readAt: number;
};

export type CopierDayResult = {
  day: string;
  currencies: { currency: string; pnl: number; accountCount: number }[];
  coveredCount: number;
  totalCount: number;
  tradeCount: number;
  missingAliases: string[];
  snapshotCurrent: boolean;
};

const parisCalendar = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function parsedTime(value: unknown): number | null {
  const stamp = typeof value === "number" ? value
    : typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
  return Number.isFinite(stamp) && Number.isFinite(new Date(stamp).getTime()) ? stamp : null;
}

export function parisDayKey(value: number | string): string | null {
  const stamp = parsedTime(value);
  if (stamp === null) return null;
  const parts = parisCalendar.formatToParts(stamp);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parisMidnightUtc(year: number, month: number, day: number): number {
  const nominal = Date.UTC(year, month - 1, day);
  const parts = parisCalendar.formatToParts(nominal);
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
  // Paris changes clocks after midnight: the offset at UTC midnight is also
  // the offset of that local midnight. Calculate each boundary independently.
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return nominal - (asUtc - nominal);
}

/** UTC query boundaries for one Paris calendar day, including 23h/25h DST days. */
export function copierParisDayWindow(now = Date.now()): { day: string; start: string; end: string } {
  const day = parisDayKey(now);
  if (!day) throw new Error("Invalid day timestamp");
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return {
    day,
    start: new Date(parisMidnightUtc(year, month, date)).toISOString(),
    end: new Date(parisMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())).toISOString(),
  };
}

function identifier(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const raw = String(value).trim();
  return /^[1-9]\d*$/.test(raw) ? raw : null;
}

function currencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(result) ? result : null;
}

function amountOrNull(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && Math.abs(amount) < 1e12 ? amount : null;
}

/**
 * Journal P&L of fully closed imported trades, attributed to their closing day.
 * This is deliberately distinct from deal-level realized P&L and floating P&L.
 */
export function aggregateCopierDayResult(
  metrics: readonly CopierAccountMetric[],
  snapshot: CopierDaySnapshot | null,
  now = Date.now(),
): CopierDayResult {
  const window = copierParisDayWindow(now);
  const readAt = parsedTime(snapshot?.readAt);
  const usableSnapshot = Boolean(snapshot && Array.isArray(snapshot.rows) && snapshot.day === window.day
    && readAt !== null && readAt >= Date.parse(window.start) && readAt < Date.parse(window.end)
    && readAt <= now + COPIER_METRICS_FUTURE_TOLERANCE_MS);
  const snapshotCurrent = usableSnapshot && readAt !== null && now - readAt <= COPIER_METRICS_FRESHNESS_MS;

  type Source = { id: string | null; aliases: Set<string>; currency: string | null; observed: number | null; hasSync: boolean };
  const sources = new Map<string, Source>();
  for (const metric of metrics) {
    const id = identifier(metric.sourceAccountId);
    const key = id ? `account:${id}` : `identity:${metric.identityKey}`;
    const currency = currencyCode(metric.currency);
    const observed = parsedTime(metric.lastSync) ?? parsedTime(metric.metricsObservedAt);
    const previous = sources.get(key);
    if (previous) {
      previous.aliases.add(metric.alias);
      if (previous.currency !== currency) previous.currency = null;
      previous.hasSync = previous.hasSync || metric.hasSync;
      if (observed !== null && (previous.observed === null || observed > previous.observed)) previous.observed = observed;
    } else {
      sources.set(key, { id, aliases: new Set([metric.alias]), currency, observed, hasSync: metric.hasSync });
    }
  }

  const eligible = new Map<string, Source>();
  for (const source of sources.values()) {
    if (usableSnapshot && source.id && source.hasSync && source.currency && source.observed !== null
      && source.observed >= Date.parse(window.start) && source.observed < Date.parse(window.end) && readAt !== null
      && source.observed <= readAt + COPIER_METRICS_FUTURE_TOLERANCE_MS) eligible.set(source.id, source);
  }
  const invalidAccounts = new Set<string>();
  const closed = new Map<string, { accountId: string; amount: number; tradeDate: string }>();
  for (const row of usableSnapshot ? snapshot!.rows : []) {
    const accountId = identifier(row.account_id);
    if (!accountId || !eligible.has(accountId)) continue;
    if (!["win", "loss", "breakeven"].includes(row.status)) continue;
    // Broker imports only: journal manual entries are not evidence of execution.
    if (typeof row.sync_connection_id !== "string" || !row.sync_connection_id.trim()
      || typeof row.sync_external_id !== "string" || !row.sync_external_id.trim()) continue;
    const tradeStamp = parsedTime(row.trade_date);
    if (tradeStamp === null) { invalidAccounts.add(accountId); continue; }
    if (tradeStamp < Date.parse(window.start) || tradeStamp >= Date.parse(window.end)) continue;
    const id = identifier(row.id);
    const amount = amountOrNull(row.result_amount);
    if (!id || amount === null) { invalidAccounts.add(accountId); continue; }
    const previous = closed.get(id);
    if (previous) {
      if (previous.accountId !== accountId || previous.amount !== amount || previous.tradeDate !== row.trade_date) {
        invalidAccounts.add(previous.accountId); invalidAccounts.add(accountId);
      }
      continue;
    }
    closed.set(id, { accountId, amount, tradeDate: row.trade_date });
  }

  const currencies = new Map<string, { currency: string; pnl: number; accountCount: number }>();
  const missingAliases: string[] = [];
  let coveredCount = 0;
  let tradeCount = 0;
  for (const source of sources.values()) {
    if (!source.id || !eligible.has(source.id) || invalidAccounts.has(source.id) || !source.currency) {
      missingAliases.push(...source.aliases);
      continue;
    }
    coveredCount += 1;
    const previous = currencies.get(source.currency);
    currencies.set(source.currency, { currency: source.currency, pnl: previous?.pnl ?? 0, accountCount: (previous?.accountCount ?? 0) + 1 });
  }
  for (const trade of closed.values()) {
    const source = eligible.get(trade.accountId);
    if (!source?.currency || invalidAccounts.has(trade.accountId)) continue;
    const currency = currencies.get(source.currency)!;
    currency.pnl += trade.amount;
    tradeCount += 1;
  }
  return {
    day: window.day, currencies: [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    coveredCount, totalCount: sources.size, tradeCount, missingAliases, snapshotCurrent,
  };
}
