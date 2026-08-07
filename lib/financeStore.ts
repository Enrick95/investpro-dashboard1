"use client";

export type FinanceSnapshot = {
  // KPIs haut de page
  newUsers: number;
  avgSessionSec: number;
  subscribers: number;
  pageViews: number;

  // Revenus
  weekUsd: number;
  monthUsd: number;
  yearUsd: number;
};

const KEY = "ip_finance_v1";

const DEFAULT: FinanceSnapshot = {
  newUsers: 275000,
  avgSessionSec: 3 * 60 + 12, // 3m12s
  subscribers: 3720000,
  pageViews: 523000,
  weekUsd: 1240,
  monthUsd: 8920,
  yearUsd: 64210,
};

function safeParse(raw: string | null): Partial<FinanceSnapshot> {
  try {
    return raw ? (JSON.parse(raw) as Partial<FinanceSnapshot>) : {};
  } catch {
    return {};
  }
}

export function loadFinance(): FinanceSnapshot {
  if (typeof window === "undefined") return DEFAULT;

  const saved = safeParse(localStorage.getItem(KEY));

  // ✅ merge + coercion number
  const n = (v: any, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  return {
    newUsers: n(saved.newUsers, DEFAULT.newUsers),
    avgSessionSec: n(saved.avgSessionSec, DEFAULT.avgSessionSec),
    subscribers: n(saved.subscribers, DEFAULT.subscribers),
    pageViews: n(saved.pageViews, DEFAULT.pageViews),
    weekUsd: n(saved.weekUsd, DEFAULT.weekUsd),
    monthUsd: n(saved.monthUsd, DEFAULT.monthUsd),
    yearUsd: n(saved.yearUsd, DEFAULT.yearUsd),
  };
}

export function saveFinance(v: FinanceSnapshot) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(v));
}
