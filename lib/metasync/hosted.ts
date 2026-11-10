import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';

export type Broker = { id: string; label: string; platform: 'MT4' | 'MT5'; server: string };

type BrokerGroup = { platform: Broker['platform']; broker: string; servers: string[] };

// Keep a safe catalogue available if the optional Vercel catalogue variable is
// malformed or empty. The hosted connection page must remain usable while an
// administrator repairs the environment value.
const FALLBACK_GROUPS: BrokerGroup[] = [
  { platform: 'MT4', broker: 'Axi', servers: ['Axi-US02-Live','Axi-US03-Demo','Axi-US03-Live','Axi-US05-Live','Axi-US06-Live','Axi-US07-Live','Axi-US09-Live','Axi-US10-Live','Axi-US12-Live','Axi-US15-Live','Axi-US16-Live','Axi-US17-Live','Axi-US18-Live','Axi-US888-Demo','Axi-US888-Live'] },
  { platform: 'MT4', broker: 'FTMO', servers: ['FTMO-Demo2','FTMO-Server','FTMO-Server2','FTMO-Server3','FTMO-Server4'] },
  { platform: 'MT4', broker: 'Fusion Markets', servers: ['FusionMarkets-Demo','FusionMarkets-Demo 2','FusionMarkets-Live','FusionMarkets-Live 2','FusionMarkets-Live 3','FusionMarkets-Live3','Fusion Market-Live 2','Fusion Markets-Live 3'] },
  { platform: 'MT4', broker: 'MegaFusionGroup', servers: ['MegaFusionGroup-Demo','MegaFusionGroup-Live 1','MegaFusionGroupPty-Demo 2','MegaFusionGroupPty-Live 2'] },
  { platform: 'MT4', broker: 'PU Prime', servers: ['PUPrime-Demo','PUPrime-Live','PUPrime-Live 2','PUPrime-Live 3','PUPrime-Live 4','PUPrime-Live 5','PUPrime-Live 6','PUPrime-Live 7','PUPrime-Live5','PUPRimeTrading-Live'] },
  { platform: 'MT4', broker: 'VT Markets', servers: ['VTMarkets-Demo','VTMarkets-Live','VTMarkets-Live 2','VTMarkets-Live 3','VTMarkets-Live 4','VTMarkets-Live 5','VTMarkets-Live 6','VTMarkets-Live 7','VTMarkets-Live 8','VTMarkets-Live 9'] },
  { platform: 'MT5', broker: 'Axi', servers: ['Axi-US50-Demo','Axi-US50-Live','Axi-US51-Live','Axi-US52-Live','Axi-US53-Live','Axi-US54-Live','Axi-US88-Live'] },
  { platform: 'MT5', broker: 'FTMO', servers: ['FTMO-Demo','FTMO-Demo2','FTMO-Server','FTMO-Server2','FTMO-Server3','FTMO-Server4','FTMO-Server5'] },
  { platform: 'MT5', broker: 'Fusion Markets', servers: ['FusionMarkets-Demo','FusionMarkets-Live','FusionMarkets-Demo 2','FusionMarkets-Live 2','FusionMarkets-Live 3','FusionMarketsAU-Demo','FusionMarketsAU-Live','FusionMarketsInternational-MT5_2','MegaFusionGroupPty-Trade'] },
  { platform: 'MT5', broker: 'PU Prime', servers: ['PuPrime-Demo','PuPrime-Live','PuPrime-Live2','PuPrime-Live 4','PuPrime-Live 5','PuPrime-Live 6','PuPrime-Live7','PuPrimeTrading-Live','PUPrime-Live','PUPrime-Live 2','PUPrime-Live 3','PUPrime-Live 4','PUPrime-Live 5','PUPrime-Live 6','PUPrime-Live 7','PUPrimeTrading-Live'] },
  { platform: 'MT5', broker: 'Blueberry Markets', servers: ['BlueberryMarkets-Live','BlueberryMarkets-Live02','BlueberryMarkets-Demo','BlueberryMarkets-Demo02','BlueberryMarketsV-Live3','BlueberryMarketsSVG-Live'] },
  { platform: 'MT5', broker: 'Raise Global', servers: ['RaiseGlobal-Live','RaiseGlobalSA-LIVE'] },
  { platform: 'MT5', broker: 'VT Markets', servers: ['VTMarkets-Demo','VTMarkets-Live','VTMarkets-Live 2','VTMarkets-Live 3','VTMarkets-Live 4','VTMarkets-Live 5','VTMarkets-Live 6','VTMarkets-Live 7','VTMarkets-Live 8','VTMarkets-Live 9','VTMarketsLtd-Live 4'] },
  { platform: 'MT5', broker: 'Vantage', servers: ['VantageMarkets-Demo','VantageMarkets-Live','VantageMarkets-Live 2','VantageMarkets-Live 3','VantageMarkets-Live 4','VantageMarkets-Live 5','VantageMarkets-Live 6','VantageMarkets-Live 7','VantageMarkets-Live 8','VantageMarkets-Live 9','VantageMarkets-Live 10','VantageMarkets-Live 11','VantageMarkets-Live 12','VantageMarkets-Live 13','VantageMarkets-Live 14','VantageMarkets-Live 15','VantageMarkets-Live 17','VantageMarkets-Live 19','VantageMarkets-Live 21','VantageFX-Live','VantageFX-Demo'] },
  { platform: 'MT5', broker: 'FundingPips', servers: ['FundingPips-SIM','FundingPips2-SIM'] },
  { platform: 'MT5', broker: 'IronFX / Notesco', servers: ['IronFX-Real1','IronFX-Demo1'] },
  { platform: 'MT5', broker: 'RoboForex', servers: ['RoboForex-Pro','RoboForex-ECN'] },
  { platform: 'MT5', broker: 'Eightcap', servers: ['Eightcap-Live','Eightcap-Demo','EightcapGlobal-Live','EightcapEU-Live'] },
  { platform: 'MT5', broker: 'IC Markets', servers: ['ICMarketsEU-MT5-5','ICMarketsEU-Demo','ICMarketsInternational-Demo','ICMarketsInternational-MT5','ICMarketsInternational-MT5-4','ICMarketsInternational-MT5-2','ICMarketsGRP-MT5','ICMarketsGRP-Demo','ICMarketsKE-MT5-7','ICMarketsKE-Demo','ICMarkets-MT5','ICMarkets-MT5-2','ICMarkets-MT5-4','ICMarkets-Demo'] },
  { platform: 'MT5', broker: 'OANDA', servers: ['OANDA-Live-1','OANDA-Demo-1','OANDA-Prop Trader','Oanda-Japan MT5 Live','Oanda-Japan MT5 Demo','OANDA_UK-Demo-1','OANDA_UK-Live-1','OANDA_SG-Demo-1','OANDA_SG-Live-1','OANDA_Canada-Demo-1','OANDA_Global-Demo-1','OANDA_Global-Live-1','OANDATMS-MT5'] },
  { platform: 'MT5', broker: 'AvaTrade', servers: ['AvaTradeMarkets-Demo 1-MT5','AvaTradeMarkets-Real 1-MT5'] },
  { platform: 'MT5', broker: 'MetaQuotes', servers: ['MetaQuotes-Demo'] },
];

const BULLWAVES_MT5: Broker = {
  id: 'bullwaves-mt5-live', label: 'Bullwaves', platform: 'MT5', server: 'BullWaves-LIVE',
};

/**
 * One entry per platform and server. The hosting PC can hold several IDs (aliases) for the same server; members
 * see it once. A named template is preferred over a legacy « fallback-… » alias, both being installed on the PC.
 */
function serverKey(row: Broker): string {
  return `${row.platform}:${row.server.trim().toLowerCase()}`;
}

function uniqueServers(rows: Broker[]): Broker[] {
  const kept = new Map<string, Broker>();
  for (const row of rows) {
    const key = serverKey(row);
    const seen = kept.get(key);
    if (!seen || (seen.id.startsWith('fallback-') && !row.id.startsWith('fallback-'))) kept.set(key, row);
  }
  return [...kept.values()];
}

function includeBullwaves(rows: Broker[]): Broker[] {
  return rows.some((broker) => broker.platform === 'MT5' && broker.server.toLowerCase() === BULLWAVES_MT5.server.toLowerCase())
    ? rows : [...rows, BULLWAVES_MT5];
}

function fallbackBrokers(): Broker[] {
  return includeBullwaves(FALLBACK_GROUPS.flatMap(({ platform, broker, servers }) =>
    servers.map((server, index) => ({
      id: `fallback-${platform.toLowerCase()}-${broker.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
      label: broker,
      platform,
      server,
    }))
  ));
}

/** The templates installed on the hosting PC, as listed in METASYNC_HOSTED_BROKERS (empty when it is unreadable). */
function installedTemplates(): Broker[] {
  let rows: unknown;
  try {
    rows = JSON.parse(process.env.METASYNC_HOSTED_BROKERS ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows.filter((value: unknown): value is Broker => {
    if (!value || typeof value !== 'object') return false;
    const b = value as Partial<Broker>;
    // Same rule as `host.py register` on the hosting PC (ex. « puprime-mt5-live6 »): letters a-z, digits, hyphens.
    return /^[a-z0-9-]{1,60}$/.test(b.id ?? '') &&
      (b.platform === 'MT4' || b.platform === 'MT5') &&
      typeof b.label === 'string' &&
      typeof b.server === 'string' &&
      b.server.length <= 120 &&
      !/[\r\n\0]/.test(b.server);
  });
}

export function brokers(): Broker[] {
  const configured = installedTemplates();
  if (!configured.length) return fallbackBrokers();
  // The templates installed on the hosting PC come first, with their own IDs. Every other known server stays
  // offered (« fallback-… » ID) so members still find theirs: the connection is saved, the team is asked to install
  // the server (see the hosted route), and the PC connects it once a template with that ID is registered.
  const installed = uniqueServers(configured);
  const onPc = new Set(installed.map(serverKey));
  return includeBullwaves(uniqueServers([...installed, ...fallbackBrokers().filter(item => !onPc.has(serverKey(item)))]));
}

/**
 * True when this catalog entry is not (yet) a template installed on the hosting PC: its ID is not listed in
 * METASYNC_HOSTED_BROKERS. A server installed later under its « fallback-… » ID and listed there counts as installed.
 */
export function awaitingInstall(broker: Broker, installed: Set<string> = new Set(installedTemplates().map(item => item.id))): boolean {
  return broker.id !== BULLWAVES_MT5.id && !installed.has(broker.id);
}

/** The catalog for the connection forms, each server flagged `pending` while it is not installed on the PC. */
export function brokersWithStatus(): (Broker & { pending: boolean })[] {
  const installed = new Set(installedTemplates().map(item => item.id));
  return brokers().map(item => ({ ...item, pending: awaitingInstall(item, installed) }));
}

// La connexion MetaTrader hébergée est disponible pour tout utilisateur authentifié.
// L'ancienne whitelist METASYNC_HOSTED_USER_IDS était prévue pour la phase pilote
// et empêchait les nouveaux membres d'afficher / utiliser le formulaire MT4 / MT5.
export function hostedAllowed(_id: string) { return true; }
export async function hostedUser() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user ?? null;
}
function key() {
  const value = process.env.METASYNC_HOSTED_ENCRYPTION_KEY ?? '';
  if (!/^[a-f0-9]{64}$/.test(value)) throw Error('configuration');
  return Buffer.from(value, 'hex');
}
export function seal(password: string, owner: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(owner));
  return Buffer.concat([iv, cipher.update(password, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
export function unseal(value: string, owner: string) {
  const data = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  cipher.setAAD(Buffer.from(owner)); cipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]).toString('utf8');
}
export function workerAuth(req: Request) {
  const secret = process.env.METASYNC_HOSTED_WORKER_TOKEN ?? '', given = req.headers.get('authorization') ?? '';
  return /^[a-f0-9]{64}$/.test(secret) && given.length === secret.length + 7 && timingSafeEqual(Buffer.from(given), Buffer.from('Bearer ' + secret));
}
export async function body(req: Request, max = 6000) {
  const reader = req.body?.getReader(); if (!reader) throw Error('body');
  let size = 0; const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > max) { await reader.cancel(); throw Error('body'); }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
