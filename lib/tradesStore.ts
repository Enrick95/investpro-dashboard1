export type Market = "forex" | "indices" | "commodities" | "crypto";
export type Side = "BUY" | "SELL";
export type TradeResult = "WIN" | "LOSS" | "BE";

export type Trade = {
  id: string;
  date: string; // YYYY-MM-DD
  symbol: string;
  market: Market;
  side: Side;

  pnl: number; // +/-
  result: TradeResult;

  // Journal V2
  setup?: string;
  tags?: string[];
  discipline?: number; // 0..10
  note?: string;

  // NEW
  owner: string;             // username
  publicTrade?: boolean;     // visible sur profil public
};

const KEY = "investpro_trades_v2";

export function loadTrades(): Trade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTrades(trades: Trade[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(trades));
}

export function addTrade(t: Trade) {
  const trades = loadTrades();
  trades.unshift(t);
  saveTrades(trades);
  return trades;
}

export function removeTrade(id: string) {
  const trades = loadTrades().filter((t) => t.id !== id);
  saveTrades(trades);
  return trades;
}

export function clearTrades() {
  saveTrades([]);
}
