import type { Trade as TelegramTrade } from "@/lib/telegram/engine";
import { tradeDay } from "@/lib/performance";
import { containsReportDay } from "@/lib/vip/performance-report-period";

export type PublicVipPerformanceTrade = {
  id: number;
  source: "telegram" | "manual";
  trade_date: string;
  symbol: string;
  direction: "buy" | "sell";
  status: "win" | "loss" | "breakeven";
  result_r: number | null;
  pips: number;
  target: number | null;
};

export type ManualPerformanceTrade = {
  id: number;
  trade_date: string;
  symbol: string;
  direction: "buy" | "sell";
  status: string;
  result_r: number | null;
  pips: number | null;
};

function publicIdentity(id: number, date: string, symbol: string) {
  const day = tradeDay(date);
  const cleanSymbol = typeof symbol === "string" ? symbol.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim().slice(0, 48) : "";
  if (!Number.isSafeInteger(id) || id <= 0 || !containsReportDay(date, { start: null, end: "9999-12-31" })
    || !cleanSymbol) throw Error("Invalid performance row");
  return {
    trade_date: day,
    symbol: cleanSymbol,
  };
}

function knownResult(value: number | null, status: PublicVipPerformanceTrade["status"]) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (status === "win" && value > 0 || status === "loss" && value < 0) return value;
  return status === "breakeven" && value === 0 ? 0 : null;
}

/** Only this explicit projection leaves the server. Active signals and private fields never do. */
export function publicVipPerformanceTrades(
  manualTrades: readonly ManualPerformanceTrade[],
  telegramTrades: readonly TelegramTrade[],
): PublicVipPerformanceTrade[] {
  const rows: PublicVipPerformanceTrade[] = [];
  for (const trade of manualTrades) {
    if (trade.status !== "win" && trade.status !== "loss" && trade.status !== "breakeven") continue;
    if (trade.direction !== "buy" && trade.direction !== "sell") throw Error("Invalid performance direction");
    rows.push({
      id: trade.id,
      source: "manual",
      ...publicIdentity(trade.id, trade.trade_date, trade.symbol),
      direction: trade.direction,
      status: trade.status,
      result_r: knownResult(trade.result_r, trade.status),
      pips: typeof trade.pips === "number" && Number.isFinite(trade.pips) ? trade.pips : 0,
      target: null,
    });
  }
  for (const trade of telegramTrades) {
    if (trade.status !== "win" && trade.status !== "loss" && trade.status !== "be") continue;
    if (trade.side !== "BUY" && trade.side !== "SELL") throw Error("Invalid performance direction");
    const status = trade.status === "be" ? "breakeven" : trade.status;
    rows.push({
      id: -trade.id,
      source: "telegram",
      ...publicIdentity(trade.id, trade.date, trade.asset),
      direction: trade.side === "BUY" ? "buy" : "sell",
      status,
      result_r: knownResult(trade.r, status),
      pips: 0,
      target: status === "win" && Number.isInteger(trade.target) && trade.target >= 1 && trade.target <= 20 ? trade.target : null,
    });
  }
  return rows.sort((a, b) => b.trade_date.localeCompare(a.trade_date) || a.id - b.id);
}

/** Do not present a truncated read as the whole history when a source fails or exceeds the bound. */
export async function readCompletePerformancePages<Row>(
  readPage: (start: number, end: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let start = 0; start < 100000; start += 1000) {
    const { data, error } = await readPage(start, start + 999);
    if (error || !Array.isArray(data) || data.length > 1000) throw Error("Performance read unavailable");
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
  throw Error("Performance history limit");
}
