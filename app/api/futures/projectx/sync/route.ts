import { NextResponse } from "next/server";
import {
  decryptProjectXApiKey,
  projectXAccounts,
  projectXContract,
  projectXLogin,
  projectXTrades,
  requireUser,
} from "@/lib/projectx/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function statusFromPnl(value: number) {
  if (value > 0.000001) return "win";
  if (value < -0.000001) return "loss";
  return "breakeven";
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser(request);
    const body = await request.json().catch(() => ({}));
    const requestedConnectionId = Number(body?.connectionId || 0);
    const days = Math.max(1, Math.min(365, Number(body?.days || 90)));

    let query = supabase
      .from("futures_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "projectx")
      .eq("status", "connected");
    if (requestedConnectionId) query = query.eq("id", requestedConnectionId);
    const { data: connections, error: connectionError } = await query;
    if (connectionError) throw connectionError;
    if (!connections?.length) {
      return NextResponse.json({ ok: true, imported: 0, updated: 0, message: "Aucun compte ProjectX connecté." });
    }

    let imported = 0;
    let updated = 0;
    const contractCache = new Map<string, string>();

    for (const connection of connections) {
      const apiKey = decryptProjectXApiKey(
        String(connection.credentials_ciphertext),
        String(connection.credentials_iv),
        String(connection.credentials_tag)
      );
      const token = await projectXLogin(String(connection.username), apiKey);
      const externalAccountId = Number(connection.external_account_id);

      const accounts = await projectXAccounts(token);
      const account = accounts.find((a) => a.id === externalAccountId);
      if (account) {
        const { error } = await supabase
          .from("trading_accounts")
          .update({ current_balance: account.balance, updated_at: new Date().toISOString() })
          .eq("id", Number(connection.trading_account_id))
          .eq("user_id", user.id);
        if (error) throw error;
        updated += 1;
      }

      // Fenêtres de 30 jours pour rester simple et stable côté API.
      const start = new Date(isoDaysAgo(days));
      const end = new Date();
      const allTrades: any[] = [];
      let cursor = start;
      while (cursor < end) {
        const chunkEnd = new Date(Math.min(end.getTime(), cursor.getTime() + 30 * 86400000));
        const trades = await projectXTrades(token, externalAccountId, cursor.toISOString(), chunkEnd.toISOString());
        allTrades.push(...trades);
        cursor = new Date(chunkEnd.getTime() + 1);
      }

      // Un trade ProjectX avec profitAndLoss != null correspond à un half-turn de clôture.
      // On importe uniquement ces lignes : pas de position ouverte, pas d'ordre en attente.
      const closings = allTrades
        .filter((t) => !t.voided && t.profitAndLoss !== null && Number.isFinite(Number(t.profitAndLoss)))
        .sort((a, b) => new Date(a.creationTimestamp).getTime() - new Date(b.creationTimestamp).getTime());

      for (const trade of closings) {
        let symbol = String(trade.contractId || "FUTURES");
        if (trade.contractId) {
          if (!contractCache.has(trade.contractId)) {
            const contract = await projectXContract(token, String(trade.contractId));
            contractCache.set(String(trade.contractId), String(contract?.name || contract?.symbolId || trade.contractId));
          }
          symbol = contractCache.get(String(trade.contractId)) || symbol;
        }

        const gross = Number(trade.profitAndLoss || 0);
        const fees = Number(trade.fees || 0);
        const net = gross - fees;
        const direction = Number(trade.side) === 1 ? "buy" : "sell"; // la clôture Sell ferme un long; Buy ferme un short
        const externalTradeId = String(trade.id);
        const payload = {
          user_id: user.id,
          account_id: Number(connection.trading_account_id),
          trade_date: String(trade.creationTimestamp),
          symbol,
          direction,
          entry_price: null,
          stop_loss: null,
          take_profit: null,
          risk_percent: null,
          result_amount: net,
          result_r: null,
          status: statusFromPnl(net),
          setup: null,
          session: null,
          timeframe: null,
          notes: `Import automatique ProjectX • clôture ${trade.size ?? "?"} contrat(s) • P&L brut ${gross.toFixed(2)} • frais ${fees.toFixed(2)}`,
          external_provider: "projectx",
          external_trade_id: externalTradeId,
          external_payload: trade,
          imported_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("trading_journal")
          .upsert(payload, { onConflict: "user_id,external_provider,external_trade_id", ignoreDuplicates: true });
        if (error) throw error;
        imported += 1;
      }

      const { error: stampError } = await supabase
        .from("futures_connections")
        .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", connection.id)
        .eq("user_id", user.id);
      if (stampError) throw stampError;
    }

    return NextResponse.json({ ok: true, imported, updated, days });
  } catch (error: any) {
    const message = String(error?.message || "Erreur de synchronisation ProjectX.");
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false, error: "Session InvestPro expirée." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
