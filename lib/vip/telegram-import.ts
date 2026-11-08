import type { SupabaseClient } from "@supabase/supabase-js";
import type { Parsed, Signal } from "@/lib/telegram/engine";
import { VIP_SPACE_URL } from "@/lib/vip/publication-notice";

/** A message of the private Telegram channel, as the webhook received and saved it. */
export type TelegramChannelPost = {
  chatId: string;
  messageId: number;
  /** Telegram’s edit date, or the post date before any edit: a later revision replaces an earlier one. */
  revision: number;
  /** Unix seconds. */
  date: number;
  replyTo: number | null;
  text: string;
  parsed: Parsed;
  edited: boolean;
};

export type MirrorOutcome = "created" | "updated" | "duplicate" | "skipped";

type Draft = {
  category: "signal" | "followup";
  title: string;
  body: string;
  symbol: string;
  direction: "buy" | "sell";
  levels: Record<string, number>;
  thread_post_id: string | null;
};

/** A post older than this is not published when it first reaches the space: its alert would announce a stale trade. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Longest reply chain followed back to its signal. */
const MAX_CHAIN = 50;
const MAX_BODY = 12000;

const norm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const NUMBER = "(\\d+(?:[.,]\\d+)?)";
/** A line of the signal template; the template is rebuilt from the levels Telegram’s parser validated. */
const TEMPLATE_LINE = /^[^A-Z0-9]*(?:ACTIF|DIRECTION|ENTREE|STOP\s*LOSS|SL|TP\s*\d+)\s*[:：]/;
/** A heading such as « 🎯 #SIGNAL », which says nothing the publication does not already show. */
const HEADING_LINE = /^(?:NOUVEAU |NEW )?SIGNAL(?: VIP)?$/;
const STOP_TO_ENTRY = /\b(?:SL|STOP)\b[\s\S]*\b(?:BE|BREAK[\s-]*EVEN|POINT D['’ ]?ENTREE)\b/;
const UNCERTAIN = /\b(?:PAS|NON|SI|PRESQUE|BIENTOT|PEUT|DEVRAIT)\b|\?/;

function clip(value: string): string {
  return value.length <= MAX_BODY ? value : value.slice(0, MAX_BODY - 1).replace(/[\uD800-\uDBFF]$/, "") + "…";
}

/** The levels as the trader wrote them, so a zone or a trailing zero (1.0850) reads the same in the space. */
function writtenLevels(text: string) {
  const s = norm(text);
  // « BUY LIMIT » or « SELL STOP » tells the member which order to place, not only the side.
  const order = s.match(/DIRECTION\s*:\s*((?:BUY|SELL)(?:\s+(?:LIMIT|STOP(?:\s+LIMIT)?))?)\b/);
  const zone = s.match(new RegExp(`ENTREE\\s*:\\s*${NUMBER}(?:\\s*[-–—]\\s*${NUMBER})?`));
  const stop = s.match(new RegExp(`(?:STOP\\s*LOSS|SL)\\s*:\\s*${NUMBER}`));
  const targets: string[] = [];
  for (const match of s.matchAll(new RegExp(`TP\\s*(\\d+)\\s*:\\s*${NUMBER}`, "g"))) targets[Number(match[1]) - 1] = match[2];
  return { order: order ? order[1].replace(/\s+/g, " ") : null, entry: zone ? (zone[2] ? `${zone[1]} – ${zone[2]}` : zone[1]) : null, stop: stop ? stop[1] : null, targets };
}

/** Targets after the priced ones that the trader left open (« TP4 : OPEN »), kept as written. */
function openTargets(text: string, priced: number): string[] {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^[^A-Za-z0-9]*TP\s*(\d+)\s*[:：]\s*(.+)$/i);
    if (!match || Number(match[1]) <= priced) continue;
    const value = match[2].trim();
    if (value && !/^\d+(?:[.,]\d+)?$/.test(value)) lines.push(`🎯 TP${Number(match[1])} : ${value}`);
  }
  return lines;
}

/** The trader’s own words around the template: a comment, a risk warning. Kept as written. */
function traderNote(text: string): string {
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => {
      const s = norm(line);
      return !TEMPLATE_LINE.test(s) && !HEADING_LINE.test(s.replace(/[^A-Z0-9]+/g, " ").trim());
    })
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A signal of the channel as a VIP publication: the template the space reads, the levels for the lot, then the trader’s note. */
export function signalDraft(signal: Signal, text: string): Draft {
  const written = writtenLevels(text);
  const template = [
    `🟡 Actif : ${signal.asset}`,
    `📈 Direction : ${written.order ?? signal.side}`,
    `📍 Entrée : ${written.entry ?? String(signal.entry)}`,
    `🛑 Stop Loss : ${written.stop ?? String(signal.sl)}`,
    ...signal.targets.map((target, index) => `🎯 TP${index + 1} : ${written.targets[index] ?? String(target)}`),
    ...openTargets(text, signal.targets.length),
  ].join("\n");
  const levels: Record<string, number> = { entry: signal.entry, stopLoss: signal.sl };
  if (signal.targets[0] !== undefined) levels.takeProfit = signal.targets[0];
  if (signal.targets[1] !== undefined) levels.takeProfit2 = signal.targets[1];
  return {
    category: "signal",
    title: "Nouveau signal",
    body: clip([template, traderNote(text)].filter(Boolean).join("\n\n")),
    symbol: signal.asset.slice(0, 32),
    direction: signal.side === "BUY" ? "buy" : "sell",
    levels,
    thread_post_id: null,
  };
}

/** What happened to the trade, in the space’s words. Anything else is an update the trader’s text explains. */
export function followupLabel(parsed: Parsed, text: string): string {
  if (parsed.kind === "tp") return `TP${parsed.target} touché`;
  if (parsed.kind === "sl") return "Stop touché";
  if (parsed.kind === "be") return "Clôturé au point d’entrée";
  if (parsed.kind === "cancel") return "Ordre annulé";
  const s = norm(text);
  const toEntry = STOP_TO_ENTRY.test(s);
  const targets = [...s.matchAll(/\bTP\s*(\d+)\s+TOUCH/g)].map(match => Number(match[1]));
  if (UNCERTAIN.test(s)) return "Mise à jour";
  if (targets.length && toEntry) return `TP${Math.max(...targets)} touché · stop au point d’entrée`;
  return toEntry ? "Stop au point d’entrée" : "Mise à jour";
}

/** The signal a reply belongs to, through replies of replies, exactly as the performance figures link them. */
async function rootSignal(db: SupabaseClient, chatId: string, replyTo: number): Promise<{ messageId: number; signal: Signal } | null> {
  let id: number | null = replyTo;
  const seen = new Set<number>();
  while (id !== null && !seen.has(id) && seen.size < MAX_CHAIN) {
    seen.add(id);
    const { data, error } = await db.from("investpro_telegram_events").select("message_id,reply_to,parsed").eq("chat_id", chatId).eq("message_id", id).maybeSingle();
    if (error) throw new Error("VIP_TELEGRAM_CHAIN_LOOKUP_FAILED");
    const event = data as { message_id: number; reply_to: number | null; parsed: Parsed } | null;
    if (!event) return null;
    if (event.parsed?.kind === "signal") return { messageId: Number(event.message_id), signal: event.parsed.signal };
    id = typeof event.reply_to === "number" ? event.reply_to : null;
  }
  return null;
}

/** A reply to a signal, as an update in that trade’s thread. Messages that follow no signal stay on Telegram. */
async function followupDraft(db: SupabaseClient, post: TelegramChannelPost, text: string): Promise<Draft | null> {
  if (post.replyTo === null) return null;
  const root = await rootSignal(db, post.chatId, post.replyTo);
  if (!root) return null;
  const { data, error } = await db.from("vip_posts").select("id")
    .eq("telegram_chat_id", post.chatId).eq("telegram_message_id", root.messageId).eq("category", "signal").maybeSingle();
  if (error) throw new Error("VIP_TELEGRAM_THREAD_LOOKUP_FAILED");
  const asset = root.signal.asset;
  return {
    category: "followup",
    title: `${asset} · ${followupLabel(post.parsed, text)}`.slice(0, 160),
    body: clip(text),
    symbol: asset.slice(0, 32),
    direction: root.signal.side === "BUY" ? "buy" : "sell",
    levels: {},
    thread_post_id: (data as { id?: string } | null)?.id ?? null,
  };
}

/**
 * Publishes a channel message in the VIP space: a signal, or a reply in a signal’s thread.
 * Each Telegram message gives at most one publication, so a repeated delivery never alerts twice.
 * An edit corrects the publication without a new alert.
 */
export async function mirrorTelegramPost(db: SupabaseClient, post: TelegramChannelPost, now = Date.now()): Promise<MirrorOutcome> {
  const text = post.text.trim();
  // A photo without caption has nothing to show; the bot’s own copy of a VIP publication is already in the space.
  if (!text || text.includes(VIP_SPACE_URL)) return "skipped";
  const draft = post.parsed.kind === "signal" ? signalDraft(post.parsed.signal, text) : await followupDraft(db, post, text);
  if (!draft) return "skipped";
  if (post.edited) {
    const { data, error } = await db.from("vip_posts").select("id,category")
      .eq("telegram_chat_id", post.chatId).eq("telegram_message_id", post.messageId).maybeSingle();
    if (error) throw new Error("VIP_TELEGRAM_LOOKUP_FAILED");
    const existing = data as { id: string; category: string } | null;
    if (existing) {
      // A signal edited into something unreadable keeps its last valid version.
      if (existing.category !== draft.category) return "skipped";
      const { error: updateError } = await db.from("vip_posts")
        .update({
          title: draft.title, body: draft.body, symbol: draft.symbol, direction: draft.direction, levels: draft.levels,
          thread_post_id: draft.thread_post_id, telegram_revision: post.revision, updated_at: new Date(now).toISOString(),
        })
        .eq("id", existing.id).lt("telegram_revision", post.revision);
      if (updateError) throw new Error("VIP_TELEGRAM_UPDATE_FAILED");
      return "updated";
    }
  }
  if (now - post.date * 1000 > MAX_AGE_MS) return "skipped";
  const { error } = await db.from("vip_posts").insert({
    ...draft,
    telegram_chat_id: post.chatId,
    telegram_message_id: post.messageId,
    telegram_revision: post.revision,
    published: true,
  });
  if (error?.code === "23505") return "duplicate";
  if (error) throw new Error("VIP_TELEGRAM_INSERT_FAILED");
  return "created";
}
