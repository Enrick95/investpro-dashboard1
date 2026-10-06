"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { pushNotif } from "@/lib/notifyStore";

type TradingPlan = {
  max_risk_percent: number;
  minimum_rr: number;
  max_trades_per_day: number;
  allowed_sessions: string[];
  allowed_assets: string[];
  allowed_setups: string[];
};

type TradeRow = {
  id: number;
  user_id: string;
  symbol: string;
  status: string;
  result_amount: number | null;
  result_r: number | null;
  risk_percent: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  session: string | null;
  setup: string | null;
  trade_date: string;
};

function normalizeAsset(value: string | null | undefined) {
  const clean = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  return clean === "GOLD" ? "XAUUSD" : clean;
}

function normalizeSession(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace("newyork", "new york");
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function calculateRR(trade: TradeRow) {
  if (
    trade.entry_price == null ||
    trade.stop_loss == null ||
    trade.take_profit == null
  ) {
    return null;
  }

  const risk = Math.abs(Number(trade.entry_price) - Number(trade.stop_loss));
  const reward = Math.abs(Number(trade.take_profit) - Number(trade.entry_price));

  return risk > 0 ? reward / risk : null;
}

function complianceReasons(trade: TradeRow, plan: TradingPlan | null) {
  if (!plan) return [];

  const reasons: string[] = [];

  const risk = Number(trade.risk_percent || 0);
  if (risk > 0 && risk > Number(plan.max_risk_percent || 0)) {
    reasons.push(`risque ${risk}% > ${plan.max_risk_percent}%`);
  }

  const rr = calculateRR(trade);
  if (rr != null && rr < Number(plan.minimum_rr || 0)) {
    reasons.push(`RR ${rr.toFixed(2)} < ${plan.minimum_rr}`);
  }

  if (plan.allowed_assets?.length) {
    const allowed = plan.allowed_assets.map(normalizeAsset);
    if (!allowed.includes(normalizeAsset(trade.symbol))) {
      reasons.push(`${trade.symbol} hors actifs autorisés`);
    }
  }

  if (plan.allowed_sessions?.length && trade.session) {
    const allowed = plan.allowed_sessions.map(normalizeSession);
    if (!allowed.includes(normalizeSession(trade.session))) {
      reasons.push(`session ${trade.session} hors plan`);
    }
  }

  if (plan.allowed_setups?.length && trade.setup) {
    const allowed = plan.allowed_setups.map(normalizeText);
    if (!allowed.includes(normalizeText(trade.setup))) {
      reasons.push(`setup ${trade.setup} hors plan`);
    }
  }

  return reasons;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function NotificationEngine() {
  const supabase = useMemo(() => createClient(), []);
  const planRef = useRef<TradingPlan | null>(null);
  const userIdRef = useRef<string | null>(null);
  const prefsRef = useRef({
    notify_imports: true,
    notify_discipline: true,
    notify_reports: true,
  });

  const pendingTradesRef = useRef<TradeRow[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    let journalChannel: any = null;
    let accountChannel: any = null;

    function once(key: string, run: () => void) {
      try {
        if (window.localStorage.getItem(key) === "1") return;
        run();
        window.localStorage.setItem(key, "1");
      } catch {
        run();
      }
    }

    function queueImportedTrade(trade: TradeRow) {
      pendingTradesRef.current.push(trade);

      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
      }

      flushTimerRef.current = window.setTimeout(() => {
        const rows = [...pendingTradesRef.current];
        pendingTradesRef.current = [];

        if (!rows.length) return;

        const wins = rows.filter((row) => Number(row.result_amount || 0) > 0).length;
        const losses = rows.filter((row) => Number(row.result_amount || 0) < 0).length;
        const pnl = rows.reduce(
          (sum, row) => sum + Number(row.result_amount || 0),
          0
        );

        if (prefsRef.current.notify_imports) {
          pushNotif({
          kind: pnl >= 0 ? "success" : "info",
          title:
            rows.length === 1
              ? "Nouveau trade importé"
              : `Import terminé · ${rows.length} trades`,
          message:
            rows.length === 1
              ? `${rows[0].symbol} · ${pnl >= 0 ? "+" : ""}${pnl.toLocaleString(
                  "fr-FR",
                  { maximumFractionDigits: 2 }
                )} $US`
              : `${wins} gain(s) · ${losses} perte(s) · P&L ${
                  pnl >= 0 ? "+" : ""
                }${pnl.toLocaleString("fr-FR", {
                  maximumFractionDigits: 2,
                })} $US`,
          ttlMs: 4500,
          });
        }

        for (const trade of rows) {
          const reasons = complianceReasons(trade, planRef.current);
          if (!reasons.length) continue;

          if (!prefsRef.current.notify_discipline) continue;

          pushNotif({
            kind: "warning",
            title: "Trade hors plan détecté",
            message: `${trade.symbol} · ${reasons.slice(0, 2).join(" · ")}`,
            ttlMs: 6500,
          });
        }
      }, 1400);
    }

    async function bootstrap() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !mounted) return;

      userIdRef.current = user.id;

      const [planResult, preferencesResult, previousMonthTrades] = await Promise.all([
        supabase
          .from("trading_plans")
          .select(
            "max_risk_percent, minimum_rr, max_trades_per_day, allowed_sessions, allowed_assets, allowed_setups"
          )
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase
          .from("trader_preferences")
          .select("notify_imports, notify_discipline, notify_reports")
          .eq("user_id", user.id)
          .maybeSingle(),

        (() => {
          const now = new Date();
          const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
          const startPrevious = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1
          );

          return supabase
            .from("trading_journal")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("trade_date", startPrevious.toISOString())
            .lt("trade_date", startCurrent.toISOString());
        })(),
      ]);

      if (planResult.data) {
        planRef.current = {
          max_risk_percent: Number(planResult.data.max_risk_percent || 0),
          minimum_rr: Number(planResult.data.minimum_rr || 0),
          max_trades_per_day: Number(planResult.data.max_trades_per_day || 0),
          allowed_sessions: Array.isArray(planResult.data.allowed_sessions)
            ? planResult.data.allowed_sessions
            : [],
          allowed_assets: Array.isArray(planResult.data.allowed_assets)
            ? planResult.data.allowed_assets
            : [],
          allowed_setups: Array.isArray(planResult.data.allowed_setups)
            ? planResult.data.allowed_setups
            : [],
        };
      }

      if (preferencesResult.data) {
        prefsRef.current = {
          notify_imports: preferencesResult.data.notify_imports ?? true,
          notify_discipline: preferencesResult.data.notify_discipline ?? true,
          notify_reports: preferencesResult.data.notify_reports ?? true,
        };
      }

      const previousCount = Number(previousMonthTrades.count || 0);
      if (previousCount > 0 && prefsRef.current.notify_reports) {
        const now = new Date();
        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const reportKey = `investpro_notif_monthly_report_${user.id}_${monthKey(
          previous
        )}`;

        once(reportKey, () => {
          pushNotif({
            kind: "admin",
            title: "Rapport mensuel disponible",
            message: `Ton rapport de ${previous.toLocaleDateString("fr-FR", {
              month: "long",
              year: "numeric",
            })} est prêt. Ouvre « Bilan mensuel » depuis le Dashboard.`,
            ttlMs: 5000,
          });
        });
      }

      // Alertes utiles de discipline au chargement.
      try {
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);

        const { data: todayTrades } = await supabase
          .from("trading_journal")
          .select("id,result_amount,risk_percent,status,trade_date,symbol")
          .eq("user_id", user.id)
          .gte("trade_date", start.toISOString())
          .order("trade_date", { ascending: true });

        const rows = todayTrades || [];
        const closed = rows.filter((row: any) =>
          ["win", "loss", "breakeven"].includes(
            String(row.status || "").toLowerCase()
          )
        );
        const losses = closed.filter(
          (row: any) => Number(row.result_amount || 0) < 0
        ).length;

        const maxRisk = Number(planRef.current?.max_risk_percent || 0);
        const maxTrades = Number(planRef.current?.max_trades_per_day || 0);
        const dayKey = new Date().toISOString().slice(0, 10);

        if (prefsRef.current.notify_discipline && losses >= 2) {
          once(`investpro_2loss_${user.id}_${dayKey}`, () => {
            pushNotif({
              kind: "warning",
              title: "2 pertes aujourd’hui",
              message:
                "Ta règle de protection mérite ton attention avant de reprendre une position.",
              ttlMs: 7000,
            });
          });
        }

        if (
          prefsRef.current.notify_discipline &&
          maxTrades > 0 &&
          rows.length >= maxTrades
        ) {
          once(`investpro_maxtrades_${user.id}_${dayKey}`, () => {
            pushNotif({
              kind: "warning",
              title: "Limite de trades atteinte",
              message: `${rows.length} trade(s) aujourd’hui · ton plan prévoit ${maxTrades} maximum.`,
              ttlMs: 7000,
            });
          });
        }

        if (prefsRef.current.notify_discipline && maxRisk > 0) {
          const overRisk = rows.find(
            (row: any) => Number(row.risk_percent || 0) > maxRisk
          );

          if (overRisk) {
            once(`investpro_risk_${user.id}_${dayKey}`, () => {
              pushNotif({
                kind: "warning",
                title: "Risque supérieur au plan",
                message: `${overRisk.symbol || "Trade"} dépasse ta limite de ${maxRisk}%.`,
                ttlMs: 7000,
              });
            });
          }
        }
      } catch {}

      // Santé MT4 / MT5 uniquement. ProjectX n'est volontairement pas touché ici.
      try {
        const { data: mtConnections } = await supabase
          .from("investpro_mt_connections")
          .select("id,login,platform,last_sync,revoked")
          .eq("user_id", user.id)
          .eq("revoked", false);

        for (const connection of mtConnections || []) {
          if (!connection.last_sync) continue;

          const ageMinutes =
            (Date.now() - new Date(connection.last_sync).getTime()) / 60000;

          if (ageMinutes < 30) continue;

          const hourKey = new Date().toISOString().slice(0, 13);

          once(`investpro_mt_stale_${connection.id}_${hourKey}`, () => {
            pushNotif({
              kind: "warning",
              title: `${connection.platform || "MetaTrader"} à vérifier`,
              message: `Le compte ${connection.login || ""} n’a pas synchronisé depuis ${Math.floor(ageMinutes)} min.`,
              ttlMs: 7000,
            });
          });
        }
      } catch {}

      // Nouvelle réponse support.
      try {
        const { data: answeredTickets } = await supabase
          .from("support_tickets")
          .select("id,subject,answered_at,admin_reply")
          .eq("user_id", user.id)
          .not("admin_reply", "is", null)
          .order("answered_at", { ascending: false })
          .limit(5);

        for (const ticket of answeredTickets || []) {
          if (!ticket.admin_reply) continue;

          once(
            `investpro_support_answer_${ticket.id}_${ticket.answered_at || "answered"}`,
            () => {
              pushNotif({
                kind: "admin",
                title: "Nouvelle réponse du support",
                message:
                  ticket.subject ||
                  "L’équipe InvestPro a répondu à ta demande.",
                ttlMs: 6000,
              });
            }
          );
        }
      } catch {}

      journalChannel = supabase
        .channel(`investpro-notifs-journal-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "trading_journal",
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            queueImportedTrade(payload.new as TradeRow);
          }
        )
        .subscribe();

      accountChannel = supabase
        .channel(`investpro-notifs-accounts-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "trading_accounts",
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const row = payload.new || {};
            const old = payload.old || {};

            if (
              row.connection_type !== "automatic" &&
              String(row.platform || "").toUpperCase() !== "MT4" &&
              String(row.platform || "").toUpperCase() !== "MT5"
            ) {
              return;
            }

            const newBalance = Number(row.current_balance || 0);
            const oldBalance = Number(old.current_balance || 0);

            if (newBalance === oldBalance && row.updated_at === old.updated_at) {
              return;
            }

            const eventKey = `investpro_notif_sync_${user.id}_${row.id}_${String(
              row.updated_at || newBalance
            )}`;

            if (!prefsRef.current.notify_imports) return;

            once(eventKey, () => {
              pushNotif({
                kind: "success",
                title: "Compte synchronisé",
                message: `${row.name || row.platform || "Compte"} · solde ${newBalance.toLocaleString(
                  "fr-FR",
                  { maximumFractionDigits: 2 }
                )} ${row.currency || ""}`.trim(),
                ttlMs: 4200,
              });
            });
          }
        )
        .subscribe();
    }

    bootstrap();

    return () => {
      mounted = false;

      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
      }

      if (journalChannel) {
        supabase.removeChannel(journalChannel);
      }

      if (accountChannel) {
        supabase.removeChannel(accountChannel);
      }
    };
  }, [supabase]);

  return null;
}
