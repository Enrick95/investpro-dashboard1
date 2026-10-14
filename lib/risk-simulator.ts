export const ACCOUNT_CURRENCIES = ["EUR", "USD", "CHF", "GBP", "JPY", "AUD", "CAD", "NZD", "SGD", "HKD", "NOK", "SEK", "DKK", "PLN", "CZK", "HUF", "ZAR", "TRY", "MXN", "CNH", "CNY", "BRL", "INR", "AED", "SAR", "THB", "ILS", "RON", "KRW"] as const;
export type AssetMarket = "forex" | "metals" | "indices" | "energy" | "crypto" | "custom";
export const MARKETS: { value: AssetMarket; label: string }[] = [
  { value: "forex", label: "Forex" }, { value: "metals", label: "Or & métaux" },
  { value: "indices", label: "Indices" }, { value: "energy", label: "Énergies" },
  { value: "crypto", label: "Cryptos" }, { value: "custom", label: "Autre actif" },
];
export type Instrument = {
  symbol: string; label: string; market: AssetMarket; profitCurrency: string;
  baseCurrency?: string; contractSize?: number; pipSize?: number;
};
const majorPairs = "EURUSD GBPUSD AUDUSD NZDUSD USDCAD USDCHF USDJPY EURGBP EURAUD EURNZD EURCAD EURCHF EURJPY GBPAUD GBPNZD GBPCAD GBPCHF GBPJPY AUDNZD AUDCAD AUDCHF AUDJPY NZDCAD NZDCHF NZDJPY CADCHF CADJPY CHFJPY".split(" ");
const exoticPairs = "USDSGD USDHKD USDNOK USDSEK USDDKK USDPLN USDCZK USDHUF USDZAR USDTRY USDMXN USDCNH USDCNY USDBRL USDINR USDTHB USDILS USDRON EURSGD EURNOK EURSEK EURDKK EURPLN EURCZK EURHUF EURZAR EURTRY EURMXN EURCNH".split(" ");
const catalog: Instrument[] = [
  { symbol: "XAUUSD", label: "Gold / Or", market: "metals", profitCurrency: "USD", contractSize: 100 },
  { symbol: "XAGUSD", label: "Silver / Argent", market: "metals", profitCurrency: "USD", contractSize: 5000 },
  { symbol: "XPTUSD", label: "Platine", market: "metals", profitCurrency: "USD" },
  { symbol: "XPDUSD", label: "Palladium", market: "metals", profitCurrency: "USD" },
  ...["NAS100", "US30", "SPX500", "US2000"].map(symbol => ({ symbol, label: symbol, market: "indices" as const, profitCurrency: "USD" })),
  ...["GER40", "FRA40", "EU50", "ESP35"].map(symbol => ({ symbol, label: symbol, market: "indices" as const, profitCurrency: "EUR" })),
  { symbol: "UK100", label: "FTSE 100", market: "indices", profitCurrency: "GBP" },
  { symbol: "JP225", label: "Nikkei 225", market: "indices", profitCurrency: "JPY" },
  { symbol: "HK50", label: "Hang Seng", market: "indices", profitCurrency: "HKD" },
  { symbol: "AUS200", label: "ASX 200", market: "indices", profitCurrency: "AUD" },
  ...["USOIL", "UKOIL", "NATGAS"].map(symbol => ({ symbol, label: symbol, market: "energy" as const, profitCurrency: "USD" })),
  ...["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "LTCUSD"].map(symbol => ({ symbol, label: symbol, market: "crypto" as const, profitCurrency: "USD" })),
];
const aliases: Record<string, string> = { GOLD: "XAUUSD", SILVER: "XAGUSD", US100: "NAS100", USTEC: "NAS100", NASDAQ: "NAS100", NASDAQ100: "NAS100", DJ30: "US30", DOW30: "US30", US500: "SPX500", SP500: "SPX500", DE40: "GER40", DAX: "GER40", DAX40: "GER40", CAC40: "FRA40", FR40: "FRA40", FTSE100: "UK100", JPN225: "JP225", WTI: "USOIL", XTIUSD: "USOIL", BRENT: "UKOIL", XBRUSD: "UKOIL", XNGUSD: "NATGAS" };
const currencies = new Set<string>(ACCOUNT_CURRENCIES);

export function getInstrument(value: string, hint: AssetMarket = "custom"): Instrument {
  const symbol = value.trim().toUpperCase().replace(/[\s/]+/g, "");
  const base = symbol.replace(/^#/, "").split(/[._#-]/)[0].replace(/(?:CASH|SPOT|PRO|RAW|ECN)$/, "");
  const key = aliases[base] || base;
  const known = catalog.find(item => item.symbol === key || `${item.symbol}M` === key);
  if (known) return { ...known, symbol };
  const pair = base.match(/^([A-Z]{3})([A-Z]{3})(?:M|R)?$/);
  if (pair && currencies.has(pair[1]) && currencies.has(pair[2]) && pair[1] !== pair[2]) {
    return { symbol, label: `${pair[1]} / ${pair[2]}`, market: "forex", baseCurrency: pair[1], profitCurrency: pair[2], contractSize: 100000, pipSize: pair[2] === "JPY" ? 0.01 : 0.0001 };
  }
  if (pair && ["XAU", "XAG", "XPT", "XPD"].includes(pair[1]) && currencies.has(pair[2])) {
    return { symbol, label: symbol, market: "metals", profitCurrency: pair[2], contractSize: pair[1] === "XAU" ? 100 : pair[1] === "XAG" ? 5000 : undefined };
  }
  return { symbol, label: symbol, market: hint, profitCurrency: "" };
}

export const SUGGESTED_ASSETS = [...majorPairs, ...exoticPairs].map(symbol => getInstrument(symbol)).concat(catalog);

// The simple calculator uses named conventions, never inferred broker specifications.
export function getSimpleInstrument(value: string) {
  const instrument = getInstrument(value);
  if (instrument.contractSize) return { ...instrument, indexConvention: false };
  if (instrument.market === "indices" && instrument.profitCurrency) {
    return { ...instrument, contractSize: 1, indexConvention: true };
  }
  return null;
}

export const SIMPLE_ASSETS = SUGGESTED_ASSETS.filter(item => getSimpleInstrument(item.symbol) !== null);

export function parseDecimal(value: string): number {
  if (!value.trim()) return NaN;
  const normalized = value.trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return NaN;
  return Number(normalized);
}

export function resolveConversion(input: {
  profitCurrency: string; accountCurrency: string; baseCurrency?: string;
  stop: number; target: number; manualRate?: number; rates?: Record<string, number>;
}): { lossRate: number; gainRate: number; source: "same" | "pair" | "manual" | "reference" | "missing" } {
  const positive = (value: number | undefined): value is number => Number.isFinite(value) && Number(value) > 0;
  if (!input.profitCurrency || !input.accountCurrency) return { lossRate: NaN, gainRate: NaN, source: "missing" };
  if (input.profitCurrency === input.accountCurrency) return { lossRate: 1, gainRate: 1, source: "same" };
  if (input.manualRate !== undefined) return positive(input.manualRate) ? { lossRate: input.manualRate, gainRate: input.manualRate, source: "manual" } : { lossRate: NaN, gainRate: NaN, source: "missing" };
  if (input.baseCurrency === input.accountCurrency && positive(input.stop)) return { lossRate: 1 / input.stop, gainRate: positive(input.target) ? 1 / input.target : NaN, source: "pair" };
  const from = input.rates?.[input.profitCurrency];
  const to = input.rates?.[input.accountCurrency];
  if (positive(from) && positive(to)) return { lossRate: to / from, gainRate: to / from, source: "reference" };
  return { lossRate: NaN, gainRate: NaN, source: "missing" };
}

export function floorVolume(raw: number, step: number): number {
  if (!Number.isFinite(raw) || raw <= 0 || !Number.isFinite(step) || step <= 0) return 0;
  const units = raw / step;
  const tolerance = Math.min(1e-7, 1e-10 * Math.max(1, Math.abs(units)));
  return Number((Math.floor(units + tolerance) * step).toPrecision(14));
}

export type PositionInput = {
  symbol: string; balance: number; budget: number; entry: number; stop: number; rr?: number;
  mode: "contract" | "ticks"; contractSize: number; lossRate: number; gainRate: number;
  tickSize: number; tickValue: number; minLot: number; lotStep: number; maxLot?: number;
};
export function calculatePosition(input: PositionInput) {
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const distance = Math.abs(input.entry - input.stop);
  const isBuy = input.stop < input.entry;
  const hasTarget = input.rr !== undefined;
  const rr = input.rr ?? 0;
  const target = hasTarget ? (isBuy ? input.entry + distance * rr : input.entry - distance * rr) : NaN;
  let error = "";
  if (!input.symbol.trim()) error = "Choisis l’actif à calculer.";
  else if (!positive(input.balance) || !positive(input.budget) || input.budget > input.balance) error = "Renseigne un capital et un risque valides, sans dépasser le capital.";
  else if (!positive(input.entry) || !positive(input.stop) || !positive(distance)) error = "Renseigne une entrée et un Stop Loss positifs et différents.";
  else if (hasTarget && (!positive(rr) || !positive(target))) error = "Le ratio doit donner un Take Profit positif.";
  else if (!positive(input.minLot) || !positive(input.lotStep) || (input.maxLot !== undefined && (!positive(input.maxLot) || input.maxLot < input.minLot))) error = "Vérifie le volume minimum, le pas et le maximum du broker.";
  else if (input.mode === "contract" && !positive(input.contractSize)) error = "Renseigne la taille du contrat ou la valeur d’un point indiquée par ton broker.";
  else if (input.mode === "contract" && (!positive(input.lossRate) || (hasTarget && !positive(input.gainRate)))) error = "Renseigne le taux de conversion dans la devise du compte.";
  else if (input.mode === "ticks" && (!positive(input.tickSize) || !positive(input.tickValue))) error = "Renseigne la taille du tick et sa valeur de perte pour 1 lot.";
  const lossPerLot = input.mode === "ticks" ? distance / input.tickSize * input.tickValue : distance * input.contractSize * input.lossRate;
  const gainPerLot = !hasTarget ? 0 : input.mode === "ticks" ? distance * rr / input.tickSize * input.tickValue : distance * rr * input.contractSize * input.gainRate;
  if (!error && (!positive(lossPerLot) || (hasTarget && !positive(gainPerLot)))) error = "Ces paramètres ne permettent pas de calculer un volume fini.";
  const theoretical = !error ? input.budget / lossPerLot : 0;
  let lots = !error ? floorVolume(Math.min(theoretical, input.maxLot ?? Infinity), input.lotStep) : 0;
  if (!error && (!positive(lots) || lots < input.minLot - 1e-12)) { error = "Le volume minimum du broker dépasserait ton budget de risque."; lots = 0; }
  const actualRisk = lots > 0 ? lots * lossPerLot : 0;
  const gain = lots > 0 ? lots * gainPerLot : 0;
  return { error, distance, isBuy, target, lossPerLot, theoretical, lots, actualRisk, gain, capped: lots > 0 && input.maxLot !== undefined && theoretical > input.maxLot, effectiveRR: actualRisk > 0 ? gain / actualRisk : 0 };
}
