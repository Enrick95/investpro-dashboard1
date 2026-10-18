/** Facts from the read-only MQL5 history bridge, never a supplied BE flag. */
type Entry = { ticket: string; time_msc: number; price: number; volume: number };
type Exit = Entry & { reason: 'sl' | 'tp' | 'manual' | 'other'; stop_loss: number | null };
export type ExecutionMetadata = {
  version: 1;
  platform: 'MT5';
  source: 'mt5_history_deal_sl';
  position_id: string;
  price_step: number;
  entries: Entry[];
  exits: Exit[];
};
type SourceTrade = { external_id: string; entry_price: number };

const metadataKeys = ['version', 'platform', 'source', 'position_id', 'price_step', 'entries', 'exits'];
const entryKeys = ['ticket', 'time_msc', 'price', 'volume'];
const exitKeys = [...entryKeys, 'reason', 'stop_loss'];
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1e12;
const id = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{1,30}$/.test(value) && /[1-9]/.test(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

/** Missing metadata is handled by the caller, retaining compatibility with old workers. */
export function validateExecutionMetadata(input: unknown, trade: SourceTrade, platform: string): ExecutionMetadata {
  const invalid = () => { throw new Error('Métadonnées de clôture invalides'); };
  if (!record(input) || !exactKeys(input, metadataKeys)) return invalid();
  if (platform !== 'MT5' || input.version !== 1 || input.platform !== 'MT5' || input.source !== 'mt5_history_deal_sl'
    || !id(input.position_id) || trade.external_id !== `mt5:${input.position_id}` || !positive(input.price_step)) return invalid();
  const tickets = new Set<string>();
  for (const [items, keys, exiting] of [[input.entries, entryKeys, false], [input.exits, exitKeys, true]] as const) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 16) return invalid();
    for (const item of items) {
      if (!record(item) || !exactKeys(item, keys) || !id(item.ticket) || tickets.has(BigInt(item.ticket).toString())
        || typeof item.time_msc !== 'number' || !Number.isSafeInteger(item.time_msc) || item.time_msc < 0
        || !positive(item.price) || !positive(item.volume)) return invalid();
      tickets.add(BigInt(item.ticket).toString());
      if (exiting && (!['sl', 'tp', 'manual', 'other'].includes(String(item.reason))
        || (item.stop_loss !== null && !(typeof item.stop_loss === 'number' && Number.isFinite(item.stop_loss) && item.stop_loss >= 0 && item.stop_loss < 1e12)))) return invalid();
    }
  }
  const value = input as unknown as ExecutionMetadata;
  const volume = value.entries.reduce((sum, entry) => sum + entry.volume, 0);
  const basis = value.entries.reduce((sum, entry) => sum + entry.price * entry.volume, 0) / volume;
  if (!Number.isFinite(basis) || !positive(trade.entry_price) || Math.abs(basis - trade.entry_price) > value.price_step * 1e-6) return invalid();
  return value;
}

/** Technical BE: all of a closed position exited by its entry-level SL. Net P&L is irrelevant. */
export function isConfirmedBreakeven(value: ExecutionMetadata): boolean {
  const entered = value.entries.reduce((sum, entry) => sum + entry.volume, 0);
  const exited = value.exits.reduce((sum, exit) => sum + exit.volume, 0);
  if (Math.abs(entered - exited) > 1e-7) return false;
  if (Math.max(...value.entries.map(entry => entry.time_msc)) > Math.min(...value.exits.map(exit => exit.time_msc))) return false;
  const basis = value.entries.reduce((sum, entry) => sum + entry.price * entry.volume, 0) / entered;
  return value.exits.every(exit => exit.reason === 'sl' && exit.stop_loss !== null && exit.stop_loss > 0
    && Math.abs(exit.stop_loss - basis) <= value.price_step * (0.5 + 1e-6));
}
