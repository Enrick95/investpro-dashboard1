export type ReportTradeStatus =
  | "open"
  | "win"
  | "loss"
  | "breakeven"
  | "cancelled"
  | "review";

export type ReportTrade = {
  id: string;
  date: string;
  symbol: string;
  direction: "buy" | "sell";
  status: ReportTradeStatus;
  resultR: number | null;
  target?: number | null;
  source: "telegram" | "manual";
};

export type ReportRow = Omit<ReportTrade, "target"> & {
  target: number | null;
  outcome: "WIN" | "LOSS" | "BE" | "OPEN" | "CANCELLED" | "REVIEW" | `TP${number}`;
  closed: boolean;
  rBasis: "recorded" | "telegram_model";
};

export type VipPerformanceReport = {
  rows: ReportRow[];
  closedRows: ReportRow[];
  counts: {
    total: number;
    closed: number;
    wins: number;
    losses: number;
    breakevens: number;
    tpWins: number;
    open: number;
    cancelled: number;
    review: number;
  };
  winrate: number | null;
  totalR: number | null;
  averageR: number | null;
  rewardRiskRatio: number | null;
  knownRCount: number;
  knownRSubtotal: number | null;
  excludedCounts: { open: number; cancelled: number; review: number };
  rBasis: "recorded" | "telegram_model" | "mixed" | null;
};

// Canvas text stays literal. Remove invisible controls that could disguise a row.
function reportText(value: string, maximum: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function reportRow(trade: ReportTrade): ReportRow {
  const closed = trade.status === "win" || trade.status === "loss" || trade.status === "breakeven";
  // A target is an explicit Telegram outcome, never inferred from R or a manual TP price.
  const target = trade.source === "telegram" && trade.status === "win"
    && typeof trade.target === "number" && Number.isInteger(trade.target)
    && trade.target >= 1 && trade.target <= 20 ? trade.target : null;
  const outcome: ReportRow["outcome"] = trade.status === "win"
    ? target === null ? "WIN" : `TP${target}`
    : trade.status === "loss" ? "LOSS"
    : trade.status === "breakeven" ? "BE"
    : trade.status === "open" ? "OPEN"
    : trade.status === "cancelled" ? "CANCELLED" : "REVIEW";
  const validR = typeof trade.resultR === "number" && Number.isFinite(trade.resultR)
    && (trade.status === "win" ? trade.resultR > 0
      : trade.status === "loss" ? trade.resultR < 0
      : trade.status === "breakeven" && trade.resultR === 0);
  return {
    id: reportText(trade.id, 160),
    date: reportText(trade.date, 40),
    symbol: reportText(trade.symbol, 48) || "—",
    direction: trade.direction,
    status: trade.status,
    source: trade.source,
    resultR: closed && validR ? (Object.is(trade.resultR, -0) ? 0 : trade.resultR) : null,
    target,
    outcome,
    closed,
    rBasis: trade.source === "telegram" ? "telegram_model" : "recorded",
  };
}

/** Summarizes the supplied filtered rows without fetching, deduplicating or inventing results.
 * Telegram R is the model at the best announced TP, not a realized weighted exit.
 * Manual R is the recorded value. Neither source establishes customers' actual P&L.
 */
export function buildVipPerformanceReport(trades: readonly ReportTrade[]): VipPerformanceReport {
  const rows = trades.map(reportRow);
  const closedRows = rows.filter(row => row.closed);
  const count = (status: ReportTradeStatus) => rows.filter(row => row.status === status).length;
  const wins = count("win");
  const losses = count("loss");
  const breakevens = count("breakeven");
  const excludedCounts = { open: count("open"), cancelled: count("cancelled"), review: count("review") };
  const knownRows = closedRows.filter(row => row.resultR !== null);
  const sum = knownRows.reduce((total, row) => total + row.resultR!, 0);
  const knownRSubtotal = Number.isFinite(sum) ? (Object.is(sum, -0) ? 0 : sum) : null;
  const totalR = closedRows.length > 0 && knownRows.length === closedRows.length ? knownRSubtotal : null;
  const winRows = closedRows.filter(row => row.status === "win");
  const lossRows = closedRows.filter(row => row.status === "loss");
  const ratioReady = wins > 0 && losses > 0
    && winRows.every(row => row.resultR !== null) && lossRows.every(row => row.resultR !== null);
  // Averaging each term first avoids an overflowing sum of otherwise finite R values.
  const averageWin = ratioReady ? winRows.reduce((total, row) => total + row.resultR! / wins, 0) : null;
  const averageLoss = ratioReady ? lossRows.reduce((total, row) => total + row.resultR! / losses, 0) : null;
  const ratio = averageWin !== null && averageLoss !== null ? averageWin / Math.abs(averageLoss) : null;
  const bases = new Set(closedRows.map(row => row.rBasis));
  return {
    rows,
    closedRows,
    counts: {
      total: rows.length,
      closed: closedRows.length,
      wins,
      losses,
      breakevens,
      tpWins: closedRows.filter(row => row.target !== null).length,
      ...excludedCounts,
    },
    // BE is shown separately and never counted as a win or a loss.
    winrate: wins + losses > 0 ? 100 * wins / (wins + losses) : null,
    // An incomplete sum must not be presented as the complete period result.
    totalR,
    averageR: totalR === null ? null : totalR / closedRows.length,
    rewardRiskRatio: ratio !== null && Number.isFinite(ratio) ? ratio : null,
    knownRCount: knownRows.length,
    knownRSubtotal,
    excludedCounts,
    rBasis: bases.size > 1 ? "mixed" : bases.size === 1 ? closedRows[0].rBasis : null,
  };
}
