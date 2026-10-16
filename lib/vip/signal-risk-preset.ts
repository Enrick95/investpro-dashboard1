import { getInstrument, SUGGESTED_ASSETS } from "../risk-simulator";
import type { VipSignalRiskData } from "./signal-risk";

const extraAliases: Record<string, string> = { OR: "XAUUSD", ARGENT: "XAGUSD", BTC: "BTCUSD", BITCOIN: "BTCUSD", ETH: "ETHUSD", ETHEREUM: "ETHUSD" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

function canonicalAsset(value: string): string | null {
  const compact = value.trim().toUpperCase().replace(/[\s/]+/g, "");
  if (extraAliases[compact]) return extraAliases[compact];
  // getInstrument supports broker suffixes but splits at '-'. Never let that
  // behavior silently choose the first asset from a composite label.
  if (!/^#?[A-Z0-9]+(?:[._#][A-Z0-9]+)?(?:-(?:CASH|SPOT|PRO|RAW|ECN|M|R))?$/.test(compact)) return null;
  const instrument = getInstrument(compact);
  if (instrument.market === "custom" || !instrument.profitCurrency) return null;
  if (instrument.market === "forex" && instrument.baseCurrency) return instrument.baseCurrency + instrument.profitCurrency;
  const matches = new Set(SUGGESTED_ASSETS.filter(item => item.market === instrument.market && item.label === instrument.label && item.profitCurrency === instrument.profitCurrency).map(item => item.symbol));
  if (matches.size === 1) return [...matches][0];
  const base = compact.replace(/^#/, "").split(/[._#-]/)[0].replace(/(?:CASH|SPOT|PRO|RAW|ECN)$/, "");
  if (instrument.market === "metals" && /^(?:XAU|XAG|XPT|XPD)[A-Z]{3}$/.test(base)) return base;
  return null;
}

/** Resolve equivalent aliases only; unknown or conflicting labels stay manual. */
export function resolveRiskAsset(label: string): string {
  const direct = canonicalAsset(label);
  if (direct) return direct;
  const parts = label.trim().split(/[()[\]{},:;/+|&–—-]+/).map(part => part.trim()).filter(Boolean);
  const symbols = new Set<string>();
  for (const part of parts) {
    const whole = canonicalAsset(part);
    if (whole) { symbols.add(whole); continue; }
    const words = part.split(/\s+/).filter(Boolean);
    if (!words.length) return label;
    for (const word of words) {
      const symbol = canonicalAsset(word);
      if (!symbol) return label;
      symbols.add(symbol);
    }
  }
  return symbols.size === 1 ? [...symbols][0] : label;
}

export function signalDirectionError(direction: string | null | undefined, entry: number, stop: number): boolean {
  if (!positive(entry) || !positive(stop)) return false;
  return direction === "buy" ? stop >= entry : direction === "sell" ? stop <= entry : false;
}

export function signalRiskPreset(data: VipSignalRiskData): { symbol: string; direction: "buy" | "sell" | ""; entry: string; stop: string; rangeApplied: boolean } {
  const direction = data.direction === "buy" || data.direction === "sell" ? data.direction : "";
  const stop = positive(data.stopLoss) ? data.stopLoss : null;
  let entry = "", rangeApplied = false;
  if (data.entryRange) {
    const { min, max } = data.entryRange;
    if (data.entry === undefined && positive(min) && positive(max) && min <= max && stop !== null) {
      if (direction === "buy" && stop < min) { entry = String(max); rangeApplied = true; }
      else if (direction === "sell" && stop > max) { entry = String(min); rangeApplied = true; }
    }
  } else if (positive(data.entry)) entry = String(data.entry);
  return { symbol: data.symbol ? resolveRiskAsset(data.symbol) : "", direction, entry, stop: stop === null ? "" : String(stop), rangeApplied };
}

/** Only a real post identifier may select a private signal; previews stay generic. */
export function riskSignalHref(postId: string, preview = false): string {
  return !preview && uuid.test(postId) ? `/dashboard/simulateur?signal=${encodeURIComponent(postId)}` : "/dashboard/simulateur";
}
