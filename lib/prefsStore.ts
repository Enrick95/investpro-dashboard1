"use client";

import { useSyncExternalStore } from "react";

/* -------------------------------- Types --------------------------------- */
export type ThemeMode = "dark" | "light" | "system";
export type Language = "fr" | "en";

export type NotifKind =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "admin"
  | "live"
  | "video"
  | "pending"
  | "tp"
  | "sl"
  | "be";

export type BlockDuration = "15m" | "30m" | "1h" | "eod";

export type NotifPrefs = {
  muted: boolean;
  volume: number; // 0..1
  enabled: Record<NotifKind, boolean>;
};

export type UiPrefs = {
  compactMode: boolean;
  animations: boolean;
  tooltips: boolean;
  theme: ThemeMode;
  language: Language;
};

export type ProfilePrefs = {
  profilePublic: boolean;
  showStats: boolean;
  showTrades: boolean;
};

export type TradingRules = {
  enabled: boolean;

  // limites journalières
  maxTradesPerDay: number;
  maxSLPerDay: number;
  dailyLossMax: number; // € (0 = off)
  dailyProfitTarget: number; // € (0 = off)

  // ✅ ton besoin : auto-remplir le terminal
  riskPerTradeDefault: number; // ex: 250
  profitPerTradeDefault: number; // ex: 1500

  // blocage auto
  autoBlockEnabled: boolean;
  autoBlockOnMaxTrades: boolean;
  autoBlockOnMaxSL: boolean;
  autoBlockOnDailyLoss: boolean;
  autoBlockOnProfitTarget: boolean;
  autoBlockDuration: BlockDuration;
};

export type TradeLock = {
  active: boolean;
  untilMs: number; // epoch ms
  reason: string;
};

export type Prefs = {
  notif: NotifPrefs;
  ui: UiPrefs;
  profile: ProfilePrefs;
  rules: TradingRules;
  lock: TradeLock;
};

/* ------------------------------ Defaults -------------------------------- */
const ALL_KINDS: NotifKind[] = [
  "tp",
  "sl",
  "be",
  "admin",
  "live",
  "video",
  "info",
  "success",
  "warning",
  "error",
  "pending",
];

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function defaultPrefs(): Prefs {
  const enabled = {} as Record<NotifKind, boolean>;
  ALL_KINDS.forEach((k) => (enabled[k] = true));

  return {
    notif: { muted: false, volume: 0.8, enabled },
    ui: {
      compactMode: false,
      animations: true,
      tooltips: true,
      theme: "dark",
      language: "fr",
    },
    profile: {
      profilePublic: true,
      showStats: true,
      showTrades: false,
    },
    rules: {
      enabled: true,
      maxTradesPerDay: 2,
      maxSLPerDay: 2,
      dailyLossMax: 0,
      dailyProfitTarget: 0,

      riskPerTradeDefault: 250,
      profitPerTradeDefault: 1500,

      autoBlockEnabled: true,
      autoBlockOnMaxTrades: true,
      autoBlockOnMaxSL: true,
      autoBlockOnDailyLoss: true,
      autoBlockOnProfitTarget: false,
      autoBlockDuration: "eod",
    },
    lock: { active: false, untilMs: 0, reason: "" },
  };
}

/**
 * ✅ IMPORTANT (fix Next/React):
 * getServerSnapshot DOIT retourner un snapshot CACHÉ (même référence).
 * Sinon warning: "The result of getServerSnapshot should be cached".
 */
const SERVER_SNAPSHOT_PREFS: Prefs = defaultPrefs();

/* ------------------------------- Storage -------------------------------- */
const KEY = "ip_prefs_v1";

function readStorage(): Prefs {
  const base = defaultPrefs();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const j = JSON.parse(raw);

    const merged: Prefs = {
      ...base,
      ...j,
      notif: {
        ...base.notif,
        ...(j.notif || {}),
        volume: clamp(Number(j?.notif?.volume ?? base.notif.volume), 0, 1),
        enabled: { ...base.notif.enabled, ...(j?.notif?.enabled || {}) },
      },
      ui: { ...base.ui, ...(j.ui || {}) },
      profile: { ...base.profile, ...(j.profile || {}) },
      rules: {
        ...base.rules,
        ...(j.rules || {}),
        maxTradesPerDay: clamp(
          Number(j?.rules?.maxTradesPerDay ?? base.rules.maxTradesPerDay),
          1,
          50
        ),
        maxSLPerDay: clamp(
          Number(j?.rules?.maxSLPerDay ?? base.rules.maxSLPerDay),
          1,
          50
        ),
        dailyLossMax: Math.max(
          0,
          Number(j?.rules?.dailyLossMax ?? base.rules.dailyLossMax)
        ),
        dailyProfitTarget: Math.max(
          0,
          Number(j?.rules?.dailyProfitTarget ?? base.rules.dailyProfitTarget)
        ),
        riskPerTradeDefault: Math.max(
          0,
          Number(j?.rules?.riskPerTradeDefault ?? base.rules.riskPerTradeDefault)
        ),
        profitPerTradeDefault: Math.max(
          0,
          Number(j?.rules?.profitPerTradeDefault ?? base.rules.profitPerTradeDefault)
        ),
      },
      lock: { ...base.lock, ...(j.lock || {}) },
    };

    return merged;
  } catch {
    return base;
  }
}

function writeStorage(p: Prefs) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

/* ----------------------------- Store API -------------------------------- */
let _prefs: Prefs | null = null;
const listeners = new Set<() => void>();

function ensureLoaded() {
  if (_prefs) return;
  _prefs = readStorage();
}

function emit() {
  listeners.forEach((fn) => fn());
  window.dispatchEvent(
    new CustomEvent("investpro:prefs_updated", { detail: _prefs })
  );
}

export function getPrefs(): Prefs {
  ensureLoaded();
  return _prefs!;
}

export function setPrefs(next: Prefs) {
  _prefs = next;
  writeStorage(next);
  emit();
}

export function patchPrefs(patch: Partial<Prefs>) {
  const cur = getPrefs();
  const next: Prefs = {
    ...cur,
    ...patch,
    notif: patch.notif
      ? {
          ...cur.notif,
          ...patch.notif,
          enabled: { ...cur.notif.enabled, ...(patch.notif.enabled || {}) },
        }
      : cur.notif,
    ui: patch.ui ? { ...cur.ui, ...patch.ui } : cur.ui,
    profile: patch.profile ? { ...cur.profile, ...patch.profile } : cur.profile,
    rules: patch.rules ? { ...cur.rules, ...patch.rules } : cur.rules,
    lock: patch.lock ? { ...cur.lock, ...patch.lock } : cur.lock,
  };
  setPrefs(next);
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePrefs() {
  return useSyncExternalStore(
    subscribe,
    getPrefs, // ✅ stable
    () => SERVER_SNAPSHOT_PREFS // ✅ snapshot serveur caché
  );
}

/* ------------------------ Trading lock helpers -------------------------- */
function endOfDayMsFromNow(now: Date) {
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  next.setHours(0, 0, 0, 0); // demain 00:00
  return next.getTime();
}

function msFromDuration(d: BlockDuration) {
  if (d === "15m") return 15 * 60 * 1000;
  if (d === "30m") return 30 * 60 * 1000;
  if (d === "1h") return 60 * 60 * 1000;
  return 0;
}

export function lockTrading(duration: BlockDuration, reason: string) {
  const now = new Date();
  const untilMs =
    duration === "eod"
      ? endOfDayMsFromNow(now)
      : now.getTime() + msFromDuration(duration);

  patchPrefs({
    lock: { active: true, untilMs, reason },
  });

  window.dispatchEvent(
    new CustomEvent("investpro:trade_lock_updated", {
      detail: getPrefs().lock,
    })
  );
}

export function unlockTrading() {
  patchPrefs({
    lock: { active: false, untilMs: 0, reason: "" },
  });

  window.dispatchEvent(
    new CustomEvent("investpro:trade_lock_updated", {
      detail: getPrefs().lock,
    })
  );
}

export function isTradeLocked(nowMs = Date.now()) {
  const l = getPrefs().lock;
  return !!l.active && l.untilMs > nowMs;
}
