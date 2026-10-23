import type { SupabaseClient } from "@supabase/supabase-js";
import { copierParisDayWindow, type CopierDaySnapshot, type CopierDayTrade } from "./day-result";

/** Read only the signed-in member's imported closed trades, never balance differences. */
export async function loadCopierDaySnapshot(db: SupabaseClient, userId: string, now = Date.now()): Promise<CopierDaySnapshot> {
  if (!userId) throw new Error("Authenticated member required");
  const window = copierParisDayWindow(now);
  const rows: CopierDayTrade[] = [];
  const signal = AbortSignal.timeout(15_000);
  // Every page must succeed. Truncation must never become a confirmed zero.
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const { data, error } = await db.from("trading_journal_effective")
      .select("id,account_id,trade_date,status,result_amount,sync_connection_id,sync_external_id")
      .eq("user_id", userId)
      .in("status", ["win", "loss", "breakeven"])
      .not("sync_connection_id", "is", null)
      .not("sync_external_id", "is", null)
      .gte("trade_date", window.start)
      .lt("trade_date", window.end)
      .order("id", { ascending: true })
      .range(offset, offset + 999)
      .abortSignal(signal);
    if (error || !Array.isArray(data)) throw new Error("Closed trades unavailable");
    rows.push(...data as CopierDayTrade[]);
    if (data.length < 1000) return { day: window.day, rows, readAt: Date.now() };
  }
  throw new Error("Closed trades exceed the complete-read limit");
}
