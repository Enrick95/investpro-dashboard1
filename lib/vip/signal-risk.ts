import type { VipNoticePost } from "./publication-notice";

export type VipSignalRiskIssue =
  | "symbol_missing" | "symbol_invalid" | "symbol_conflicting"
  | "direction_missing" | "direction_invalid" | "direction_conflicting"
  | "entry_missing" | "entry_invalid" | "entry_conflicting"
  | "stop_loss_missing" | "stop_loss_invalid" | "stop_loss_conflicting"
  | "stop_loss_wrong_side" | "stop_loss_inside_entry_range" | "entry_stop_loss_equal";

export type VipSignalRiskData = {
  postId: string;
  title: string;
  /** The asset label as written, without guessing a ticker or broker contract. */
  symbol: string | null;
  direction: "buy" | "sell" | null;
  entry?: number;
  entryRange?: { min: number; max: number };
  stopLoss?: number;
  issues: VipSignalRiskIssue[];
};

type FieldKey = "symbol" | "direction" | "entry" | "stop_loss";
type SignalField = { value: string; conflicting: boolean };
type SignalFields = Partial<Record<FieldKey, SignalField>>;
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const aliases: Record<string, FieldKey> = {
  actif: "symbol", asset: "symbol", symbole: "symbol", symbol: "symbol", instrument: "symbol",
  direction: "direction", sens: "direction", ordre: "direction", order: "direction",
  entree: "entry", entry: "entry", "zone d'entree": "entry", "zone d’entree": "entry",
  "stop loss": "stop_loss", stoploss: "stop_loss", sl: "stop_loss",
};

function unformat(value: string): string {
  let text = value.trim();
  for (const marker of ["**", "__", "`", "*", "_"]) {
    if (text.startsWith(marker) && text.endsWith(marker) && text.length >= marker.length * 2) text = text.slice(marker.length, -marker.length).trim();
  }
  return text;
}

/** Unlike prose notification formatting, numeric values are never stripped or rewritten. */
function readSignalFields(body: string): SignalFields {
  const fields: SignalFields = {};
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^([^:：]+)[:：](.*)$/u);
    if (!match) continue;
    const label = normalize(match[1].replace(/[*_`]/g, "").replace(/^[^\p{L}\p{N}]+/u, "").trim());
    if (!Object.hasOwn(aliases, label)) continue;
    const key = aliases[label];
    const value = unformat(match[2]);
    const actual = !value || /^(?:[-–—…._]+|n\/?a|a renseigner|to fill|\[[^\]]*\])$/i.test(normalize(value)) ? "" : value;
    const existing = fields[key];
    if (existing) {
      if (existing.value !== actual) existing.conflicting = true;
    } else fields[key] = { value: actual, conflicting: false };
  }
  return fields;
}

/** Accept complete positive prices, with explicit grouping; never parseFloat a prefix. */
export function parseVipSignalPrice(value: string): number | null {
  const text = value.trim().replace(/[\u00a0\u202f]/g, " ");
  let normalized: string;
  if (/^\d+(?:\.\d+)?$/.test(text)) normalized = text;
  else if (/^\d+,\d+$/.test(text)) {
    // "2,670" could be 2670 or 2.670: require clarification rather than guess.
    if (/^\d{1,3},\d{3}$/.test(text)) return null;
    normalized = text.replace(",", ".");
  } else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(text)) normalized = text.replace(/,/g, "");
  else if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(text)) normalized = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?: \d{3})+(?:[.,]\d+)?$/.test(text)) normalized = text.replace(/ /g, "").replace(",", ".");
  else if (/^\d{1,3}(?:,\d{3}){2,}$/.test(text)) normalized = text.replace(/,/g, "");
  else if (/^\d{1,3}(?:\.\d{3}){2,}$/.test(text)) normalized = text.replace(/\./g, "");
  else return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 && number <= Number.MAX_SAFE_INTEGER ? number : null;
}

function parseEntry(value: string): { entry: number } | { entryRange: { min: number; max: number } } | null {
  const single = parseVipSignalPrice(value);
  if (single !== null) return { entry: single };
  const match = value.match(/^(.+?)\s*(?:[-–—]|\s+(?:à|to)\s+)\s*(.+)$/i);
  if (!match) return null;
  const first = parseVipSignalPrice(match[1]), second = parseVipSignalPrice(match[2]);
  if (first === null || second === null) return null;
  return { entryRange: { min: Math.min(first, second), max: Math.max(first, second) } };
}

/** Read only explicit labels or structured legacy fields when their label is absent. */
export function parseVipSignalRisk(post: VipNoticePost & { id: string }): VipSignalRiskData | null {
  if (post.category !== "signal") return null;
  const fields = readSignalFields(post.body || "");
  const issues: VipSignalRiskIssue[] = [];
  function field(key: FieldKey, fallback: unknown): string | null {
    const explicit = fields[key];
    if (explicit?.conflicting) { issues.push(`${key}_conflicting`); return null; }
    const value = explicit ? explicit.value : typeof fallback === "number" ? String(fallback) : typeof fallback === "string" ? fallback.trim() : "";
    if (!value) { issues.push(`${key}_missing`); return null; }
    return value;
  }
  const rawSymbol = field("symbol", post.symbol);
  const symbol = rawSymbol && rawSymbol.length <= 80 && !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}<>]/u.test(rawSymbol) ? rawSymbol : null;
  if (rawSymbol && !symbol) issues.push("symbol_invalid");
  const rawDirection = field("direction", post.direction);
  const order = rawDirection?.toUpperCase().match(/^(BUY|SELL|ACHAT|VENTE)(?:\s+(?:LIMIT|STOP(?:\s+LIMIT)?))?$/);
  const direction = order ? order[1] === "BUY" || order[1] === "ACHAT" ? "buy" : "sell" : null;
  if (rawDirection && !direction) issues.push("direction_invalid");
  const rawEntry = field("entry", post.levels?.entry);
  const entry = rawEntry ? parseEntry(rawEntry) : null;
  if (rawEntry && !entry) issues.push("entry_invalid");
  const rawStop = field("stop_loss", post.levels?.stopLoss);
  const stopLoss = rawStop ? parseVipSignalPrice(rawStop) : null;
  if (rawStop && stopLoss === null) issues.push("stop_loss_invalid");
  if (entry && stopLoss !== null) {
    if ("entry" in entry) {
      if (entry.entry === stopLoss) issues.push("entry_stop_loss_equal");
      else if (direction && (direction === "buy" ? stopLoss > entry.entry : stopLoss < entry.entry)) issues.push("stop_loss_wrong_side");
    } else {
      if (stopLoss >= entry.entryRange.min && stopLoss <= entry.entryRange.max) issues.push("stop_loss_inside_entry_range");
      else if (direction && (direction === "buy" ? stopLoss > entry.entryRange.max : stopLoss < entry.entryRange.min)) issues.push("stop_loss_wrong_side");
    }
  }
  return { postId: post.id, title: post.title, symbol, direction, ...(entry || {}), ...(stopLoss !== null ? { stopLoss } : {}), issues };
}
