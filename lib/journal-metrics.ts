type JournalRInput = {
  status?: unknown;
  result_r?: unknown;
  risk_percent?: unknown;
};

type JournalPlanInput = {
  risk_percent?: unknown;
  entry_price?: unknown;
  stop_loss?: unknown;
  take_profit?: unknown;
  symbol?: unknown;
  session?: unknown;
  setup?: unknown;
};

type JournalPlan = {
  max_risk_percent: unknown;
  minimum_rr: unknown;
  allowed_assets: readonly string[];
  allowed_sessions: readonly string[];
  allowed_setups: readonly string[];
};

// Database numerics can be strings. Missing data must never become a real zero.
function knownNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value: unknown): number | null {
  const number = knownNumber(value);
  return number !== null && number > 0 ? number : null;
}

function knownText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Average realized R only where both R and the original percentage risk are known. */
export function summarizeKnownR(trades: readonly JournalRInput[]): {
  average: number | null;
  evaluatedCount: number;
  closedCount: number;
} {
  const closed = trades.filter(trade =>
    trade.status === "win" || trade.status === "loss" || trade.status === "breakeven"
  );
  const values: number[] = [];
  for (const trade of closed) {
    const value = knownNumber(trade.result_r);
    if (value !== null && positiveNumber(trade.risk_percent) !== null) values.push(value);
  }

  // Divide before adding so a large, but finite, result cannot overflow the sum.
  const average = values.length
    ? values.reduce((total, value) => total + value / values.length, 0)
    : null;
  return {
    average: average !== null && Number.isFinite(average) ? average : null,
    evaluatedCount: values.length,
    closedCount: closed.length,
  };
}

/**
 * Eligibility for the journal's risk, RR, asset, session and setup evaluation.
 * It is deliberately not a daily-frequency or a partial-compliance score.
 * The caller still determines whether the known inputs respect the saved plan.
 */
export function hasCompletePlanInputs(trade: JournalPlanInput, plan: JournalPlan | null): boolean {
  if (!plan || positiveNumber(plan.max_risk_percent) === null) return false;
  const minimumRr = knownNumber(plan.minimum_rr);
  if (minimumRr === null || minimumRr < 0 || positiveNumber(trade.risk_percent) === null) return false;

  const entry = positiveNumber(trade.entry_price);
  const stop = positiveNumber(trade.stop_loss);
  const target = positiveNumber(trade.take_profit);
  if (entry === null || stop === null || target === null || entry === stop || entry === target) return false;
  if (!Number.isFinite(Math.abs(target - entry) / Math.abs(entry - stop))) return false;

  if (plan.allowed_assets.length > 0 && knownText(trade.symbol) === null) return false;
  if (plan.allowed_sessions.length > 0 && knownText(trade.session) === null) return false;
  if (plan.allowed_setups.length > 0) {
    const setup = knownText(trade.setup);
    if (setup === null || /^mt[45]\s+synchronis[ée]$/i.test(setup)) return false;
  }
  return true;
}
