"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculatePosition, resolveConversion } from "@/lib/risk-simulator";
import { getSizingConvention } from "@/lib/risk-simulator-conventions";
import { resolveRiskAsset } from "@/lib/vip/signal-risk-preset";

export type MemberAccount = {
  id: number;
  name: string;
  platform: string | null;
  broker: string | null;
  currency: string | null;
  current_balance: number | null;
  connection_type: string | null;
};

/** A position still open on one of the member’s connected accounts. */
export type MemberTrade = { id: string; symbol: string; direction: "buy" | "sell"; date: string; entry: number | null; stop: number | null; accountId: number | null };

export type VipMember = {
  status: "loading" | "ready" | "error" | "signedOut";
  accounts: MemberAccount[];
  /** The account the lot is calculated on. */
  account: MemberAccount | null;
  /** Risk per trade, in percent of the account. */
  risk: number;
  rates: Record<string, number> | null;
  openTrades: MemberTrade[];
  setRisk: (value: number) => void;
  setAccount: (id: number) => void;
  reload: () => void;
};

export const RISK_CHOICES = [0.5, 1, 2] as const;
const RISK_KEY = "investpro.vip.risk";
const ACCOUNT_KEY = "investpro.vip.account";

// The choices are kept on this phone. A private window keeps them for the visit only.
function readStored(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* kept in memory for this visit */ }
}

function readTrade(value: Record<string, unknown>): MemberTrade | null {
  const direction = value.direction === "sell" ? "sell" : value.direction === "buy" ? "buy" : null;
  const symbol = String(value.symbol ?? "").trim().toUpperCase();
  const date = typeof value.trade_date === "string" ? value.trade_date : "";
  if (!direction || !symbol || !date) return null;
  const number = (field: unknown) => typeof field === "number" && Number.isFinite(field) && field > 0 ? field : null;
  return {
    id: String(value.id ?? `${symbol}-${date}`),
    symbol,
    direction,
    date,
    entry: number(value.entry_price),
    stop: number(value.stop_loss),
    accountId: typeof value.account_id === "number" ? value.account_id : null,
  };
}

/** The member’s accounts, open positions and sizing choices, read once for the whole space. */
export function useVipMember(): VipMember {
  const [state, setState] = useState<{ status: VipMember["status"]; accounts: MemberAccount[]; openTrades: MemberTrade[] }>({ status: "loading", accounts: [], openTrades: [] });
  // The space only renders in the browser, after the access check, so the saved choices can be read right away.
  const [risk, setRiskState] = useState<number>(() => {
    const saved = Number(readStored(RISK_KEY));
    return (RISK_CHOICES as readonly number[]).includes(saved) ? saved : 1;
  });
  const [accountId, setAccountId] = useState<number | null>(() => {
    const saved = Number(readStored(ACCOUNT_KEY));
    return Number.isSafeInteger(saved) && saved > 0 ? saved : null;
  });
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const db = createClient();
        const { data } = await db.auth.getUser();
        if (!data.user) { if (live) setState({ status: "signedOut", accounts: [], openTrades: [] }); return; }
        const [accountsResult, tradesResult] = await Promise.all([
          db.from("trading_accounts").select("id,name,platform,broker,currency,current_balance,connection_type").order("created_at", { ascending: false }),
          db.from("trading_journal_effective").select("id,symbol,direction,trade_date,entry_price,stop_loss,account_id,status")
            .eq("user_id", data.user.id).eq("status", "open").order("trade_date", { ascending: false }).limit(50),
        ]);
        if (accountsResult.error) throw accountsResult.error;
        const accounts = ((accountsResult.data ?? []) as MemberAccount[]).filter(account => Number.isSafeInteger(account.id));
        const known = new Set(accounts.map(account => account.id));
        // Only positions of the member’s own, still connected accounts count.
        const openTrades = tradesResult.error ? [] : ((tradesResult.data ?? []) as Record<string, unknown>[])
          .map(readTrade).filter((trade): trade is MemberTrade => trade !== null && trade.accountId !== null && known.has(trade.accountId));
        if (live) setState({ status: "ready", accounts, openTrades });
      } catch {
        if (live) setState(previous => ({ ...previous, status: "error" }));
      }
    })();
    return () => { live = false; };
  }, [version]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/risk-rates", { signal: controller.signal })
      .then(async response => { if (!response.ok) throw Error("Rates unavailable"); return response.json() as Promise<{ rates?: Record<string, number> }>; })
      .then(body => { if (body.rates && typeof body.rates === "object") setRates(body.rates); })
      .catch(() => { /* a lot in another currency than the instrument’s stays unavailable */ });
    return () => controller.abort();
  }, []);

  const setRisk = useCallback((value: number) => {
    if (!(RISK_CHOICES as readonly number[]).includes(value)) return;
    setRiskState(value); writeStored(RISK_KEY, String(value));
  }, []);
  const setAccount = useCallback((id: number) => { setAccountId(id); writeStored(ACCOUNT_KEY, String(id)); }, []);
  const reload = useCallback(() => setVersion(current => current + 1), []);

  const funded = (account: MemberAccount) => typeof account.current_balance === "number" && account.current_balance > 0;
  const account = state.accounts.find(item => item.id === accountId) ?? state.accounts.find(funded) ?? state.accounts[0] ?? null;
  return { ...state, account, risk, rates, setRisk, setAccount, reload };
}

/**
 * What one MetaTrader lot is worth for this instrument. Forex and metals have standard lots (100 000 units,
 * 100 ounces of gold). For indices and crypto a lot is one contract (1 unit of currency per point, one coin):
 * the most common broker setting, but not every broker’s, so the card says it and how to check it.
 */
export type LotBasis =
  | { kind: "units"; amount: number; unit: string; varies: boolean }
  | { kind: "ounces"; amount: number; varies: false }
  | { kind: "point"; currency: string; varies: true };

/** MetaTrader takes volumes in steps of 0.01 lot, from 0.01 lot. */
export const LOT_STEP = 0.01;

export type SignalSize =
  | { ok: true; lots: number; basis: LotBasis; risk: number; currency: string; account: MemberAccount }
  | { ok: false; reason: "loading" | "account" | "balance" | "levels" | "instrument" | "rate" }
  /** Even 0.01 lot would lose more than the member’s risk; `minimumRisk` is what it would lose. */
  | { ok: false; reason: "budget"; minimumRisk: number | null; currency: string };

/** The lot of a signal for the member’s account and risk, in MetaTrader lots, with the simulator’s rounding rules. */
export function sizeSignal(member: VipMember, symbol: string, entry: number | undefined, stop: number | undefined): SignalSize {
  if (member.status === "loading") return { ok: false, reason: "loading" };
  const account = member.account;
  if (!account) return { ok: false, reason: "account" };
  const balance = Number(account.current_balance);
  if (!Number.isFinite(balance) || balance <= 0) return { ok: false, reason: "balance" };
  if (!entry || !stop || entry === stop) return { ok: false, reason: "levels" };
  const asset = resolveRiskAsset(symbol);
  const convention = getSizingConvention(asset);
  if (!convention) return { ok: false, reason: "instrument" };
  const currency = (account.currency || "EUR").toUpperCase();
  const conversion = resolveConversion({ profitCurrency: convention.profitCurrency, accountCurrency: currency, baseCurrency: convention.baseCurrency, stop, target: Number.NaN, rates: member.rates ?? undefined });
  if (!(conversion.lossRate > 0)) return { ok: false, reason: "rate" };
  const basis: LotBasis = convention.sizingKind === "point_value" ? { kind: "point", currency: convention.profitCurrency, varies: true }
    : convention.market === "metals" ? { kind: "ounces", amount: convention.contractSize, varies: false }
    : convention.sizingKind === "asset_units" ? { kind: "units", amount: 1, unit: convention.displayUnit, varies: true }
    : { kind: "units", amount: convention.contractSize, unit: convention.baseCurrency ?? "", varies: false };
  const result = calculatePosition({
    symbol: asset, balance, budget: balance * member.risk / 100, entry, stop, mode: "contract",
    // One lot of an index or a coin is one contract: the conventions already count 1 per point or 1 coin.
    contractSize: convention.contractSize, lossRate: conversion.lossRate, gainRate: Number.NaN,
    tickSize: Number.NaN, tickValue: Number.NaN, minLot: LOT_STEP, lotStep: LOT_STEP,
  });
  if (result.error || !(result.lots > 0)) {
    const minimumRisk = Number.isFinite(result.lossPerLot) && result.lossPerLot > 0 ? LOT_STEP * result.lossPerLot : null;
    return { ok: false, reason: "budget", minimumRisk, currency };
  }
  return { ok: true, lots: result.lots, basis, risk: result.actualRisk, currency, account };
}
