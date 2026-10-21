import { buildStats, type Event } from "@/lib/telegram/engine";
import { channel, database } from "@/lib/telegram/server";
import {
  publicVipPerformanceTrades,
  readCompletePerformancePages,
  type ManualPerformanceTrade,
} from "@/lib/vip/public-performance";

export const dynamic = "force-dynamic";

// Public results are independent of login, VIP membership and Telegram's private pilot allowlist.
export async function GET() {
  try {
    const db = database();
    const chat = channel();
    const [manualTrades, events] = await Promise.all([
      readCompletePerformancePages<ManualPerformanceTrade>((start, end) => db
        .from("vip_trades")
        .select("id,trade_date,symbol,direction,status,result_r,pips")
        .in("status", ["win", "loss", "breakeven"])
        .order("id", { ascending: true })
        .range(start, end)),
      readCompletePerformancePages<Event>((start, end) => db
        .from("investpro_telegram_events")
        .select("message_id,date,reply_to,parsed")
        .eq("chat_id", chat)
        .order("message_id", { ascending: true })
        .range(start, end)),
    ]);
    const trades = publicVipPerformanceTrades(manualTrades, buildStats(events).trades);
    return Response.json({ trades }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Les performances VIP sont momentanément indisponibles. Réessayez dans un instant." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
