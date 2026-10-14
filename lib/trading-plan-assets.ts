export const ASSET_GROUPS = [
  { value: "group:forex", label: "Tout le Forex", description: "Paires de devises, hors métaux" },
  { value: "group:indices", label: "Tous les indices", description: "NAS100, US30, DAX, CAC40…" },
  { value: "group:metals", label: "Tous les métaux", description: "Or, argent, platine, palladium" },
  { value: "group:crypto", label: "Toutes les cryptos", description: "Bitcoin, Ethereum et autres cryptos" },
  { value: "group:energy", label: "Toutes les énergies", description: "Pétrole et gaz naturel" },
  { value: "group:stocks", label: "Toutes les actions", description: "Actions individuelles reconnues" },
] as const;

const currencies = new Set("USD EUR GBP CHF JPY CAD AUD NZD SGD HKD NOK SEK DKK PLN CZK HUF TRY ZAR MXN CNH CNY RUB BRL ILS THB AED SAR RON BGN INR KRW".split(" "));
const indices = new Set("NAS100 NASDAQ NASDAQ100 US100 USTEC NDX US30 DJ30 DJI DOW DOW30 SPX500 US500 SP500 SPX US2000 RUS2000 RUSSELL2000 GER40 DE40 DAX40 DAX GER30 DE30 FRA40 FR40 CAC40 UK100 FTSE100 AUS200 ASX200 JP225 JPN225 NIKKEI225 HK50 HSI50 CHINA50 EU50 STOXX50 ESP35 IBEX35".split(" "));
const crypto = new Set("BTC ETH LTC BCH XRP ADA DOT SOL DOGE AVAX BNB LINK XLM XTZ EOS ETC UNI AAVE SHIB MATIC POL TRX TON".split(" "));
const energy = new Set("WTI BRENT USOIL UKOIL XTIUSD XBRUSD XNGUSD NATGAS NGAS NG OILWTI OILBRENT".split(" "));
const stocks = new Set("AAPL MSFT NVDA AMZN META GOOGL GOOG TSLA AMD INTC NFLX DIS BABA BA JPM V MA PYPL COIN PLTR ORCL IBM UBER ABNB WMT COST XOM CVX KO PEP NKE MCD SAP SIE VOW3 BMW AIR MC OR TTE SAN BNP".split(" "));

export function normalizePlanAsset(value: string | null | undefined): string {
  const symbol = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (symbol === "GOLD") return "XAUUSD";
  if (symbol === "SILVER") return "XAGUSD";
  return symbol;
}

export function assetGroupLabel(value: string): string {
  return ASSET_GROUPS.find(group => group.value.toUpperCase() === value.toUpperCase())?.label || value;
}

export function isAssetGroup(value: string): boolean {
  return ASSET_GROUPS.some(group => group.value.toUpperCase() === value.toUpperCase());
}

// Unknown symbols stay unclassified. A broker-specific symbol can always be
// authorized explicitly rather than guessed into an allowed family.
export function classifyPlanAsset(value: string): string | null {
  const symbol = normalizePlanAsset(value).replace(/^[#]/, "");
  const base = symbol.split(/[._#-]/)[0];
  const pair = base.match(/^([A-Z]{3})([A-Z]{3})(?:M|R|PRO|RAW|ECN)?$/);
  if (pair) {
    if (["XAU", "XAG", "XPT", "XPD"].includes(pair[1]) && currencies.has(pair[2])) return "group:metals";
    if (currencies.has(pair[1]) && currencies.has(pair[2]) && pair[1] !== pair[2]) return "group:forex";
  }
  const clean = base.replace(/(?:CASH|SPOT|FUT|PRO|RAW|ECN)$/, "");
  if (indices.has(clean) || indices.has(clean.replace(/M$/, ""))) return "group:indices";
  if (energy.has(clean) || energy.has(clean.replace(/M$/, ""))) return "group:energy";
  if (["GOLD", "SILVER", "PLATINUM", "PALLADIUM"].includes(clean)) return "group:metals";
  const cryptoPair = clean.match(/^([A-Z0-9]+)(USDT|USDC|USD|EUR|GBP|JPY|BTC|ETH)(?:M)?$/);
  if (crypto.has(clean) || (cryptoPair && crypto.has(cryptoPair[1]))) return "group:crypto";
  if (stocks.has(clean)) return "group:stocks";
  return null;
}

export function planAllowsAsset(allowed: string[], symbol: string): boolean {
  if (allowed.length === 0) return true; // Preserve existing unrestricted plans.
  const normalized = normalizePlanAsset(symbol);
  const group = classifyPlanAsset(symbol);
  return allowed.some(value => isAssetGroup(value)
    ? group !== null && value.toUpperCase() === group.toUpperCase()
    : normalizePlanAsset(value) === normalized);
}

export function parsePlanAssets(input: string): string[] {
  return Array.from(new Set(input.split(/[,;\s]+/).map(normalizePlanAsset).filter(value => /^[A-Z0-9._#-]{1,40}$/.test(value))));
}
