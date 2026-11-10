// Règles du programme clippeurs, partagées entre le navigateur et le serveur.
// Barème par campagne : X € pour 1 000 vues, rien sous le minimum de vues,
// plafond par clip, vues figées 7 jours après la publication.

export const CLIP_PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export type ClipPlatform = (typeof CLIP_PLATFORMS)[number];
export const PLATFORM_LABEL: Record<ClipPlatform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };
export const PLATFORM_SHORT: Record<ClipPlatform, string> = { tiktok: "TT", instagram: "IG", youtube: "YT" };

export const PAYOUT_METHODS = ["usdt_trc20", "wise", "paypal", "sepa"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];
export const PAYOUT_LABEL: Record<PayoutMethod, string> = { usdt_trc20: "USDT (TRC20)", wise: "Wise", paypal: "PayPal", sepa: "Virement SEPA" };
export const PAYOUT_HINT: Record<PayoutMethod, string> = { usdt_trc20: "Adresse TRC20", wise: "E-mail Wise", paypal: "E-mail PayPal", sepa: "IBAN" };

export const FREEZE_DAYS = 7;
export const MIN_PAYOUT = 20;
/** Page vers laquelle renvoie le lien traqué de chaque clippeur (le lien en bio d'Enrick). */
export const TRACKED_LINK_TARGET = "https://investprotrading.fr/enrick";

export function trackedLink(origin: string, trackingCode: string): string {
  return `${origin}/clip/l/${trackingCode}`;
}
const DAY = 86_400_000;

export type CampaignRow = {
  id: string;
  title: string;
  platforms: string;
  brief: string;
  forbidden: string;
  rushes_url: string | null;
  starts_on: string;
  ends_on: string;
  quota_per_clipper: number;
  rate_per_1000: number | string;
  min_views: number;
  max_per_clip: number | string;
  vip_bonus: number | string;
  status: "draft" | "active" | "ended";
  created_at: string;
};

export type ClipRow = {
  id: string;
  ref: string;
  clipper_id?: string;
  campaign_id: string;
  platform: ClipPlatform;
  url: string;
  title: string;
  published_at: string;
  status: "review" | "approved" | "rejected";
  reject_reason: string | null;
  views: number | string;
  views_updated_at: string | null;
  frozen_views: number | string | null;
  frozen_at: string | null;
  payout_id: string | null;
  reviewed_at?: string | null;
  created_at: string;
};

export type PayoutRow = {
  id: string;
  ref: string;
  clipper_id?: string;
  cycle_start: string;
  cycle_end: string;
  clips_count: number;
  views_total: number | string;
  base_amount: number | string;
  bonus_amount: number | string;
  deduction_amount: number | string;
  total: number | string;
  method: string | null;
  proof: string | null;
  paid_at: string;
};

export type ClipState = "review" | "rejected" | "paid" | "frozen" | "counting";

export function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Montant d'un clip pour un nombre de vues donné, selon le barème de sa campagne. */
export function clipAmount(views: number, campaign: Pick<CampaignRow, "rate_per_1000" | "min_views" | "max_per_clip">): number {
  const rate = num(campaign.rate_per_1000);
  const max = num(campaign.max_per_clip);
  if (views < num(campaign.min_views)) return 0;
  const raw = (views / 1000) * rate;
  return round2(max > 0 ? Math.min(raw, max) : raw);
}

export function clipState(clip: Pick<ClipRow, "status" | "payout_id" | "frozen_views">): ClipState {
  if (clip.status === "review") return "review";
  if (clip.status === "rejected") return "rejected";
  if (clip.payout_id) return "paid";
  if (clip.frozen_views !== null && clip.frozen_views !== undefined) return "frozen";
  return "counting";
}

export function freezeAt(publishedAt: string): Date {
  return new Date(new Date(publishedAt).getTime() + FREEZE_DAYS * DAY);
}

function isoDay(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

export type Cycle = { start: string; end: string; payDate: string };

/** Cycles du 1er au 15 (payé le 16) et du 16 à la fin du mois (payé le 1er). */
export function cycleFor(date: Date): Cycle {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  if (d <= 15) return { start: isoDay(y, m, 1), end: isoDay(y, m, 15), payDate: isoDay(y, m, 16) };
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { start: isoDay(y, m, 16), end: isoDay(y, m, last), payDate: isoDay(y, m + 1, 1) };
}

export function cycleProgress(cycle: Cycle, now: Date): { day: number; length: number } {
  const start = new Date(`${cycle.start}T00:00:00Z`).getTime();
  const end = new Date(`${cycle.end}T00:00:00Z`).getTime();
  const length = Math.round((end - start) / DAY) + 1;
  const day = Math.min(length, Math.max(1, Math.floor((now.getTime() - start) / DAY) + 1));
  return { day, length };
}

export function daysUntil(isoDate: string, now: Date): number {
  const target = new Date(`${isoDate}T00:00:00Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((target - today) / DAY));
}

export type MoneySummary = {
  cycle: Cycle;
  acquired: number;
  acquiredClips: number;
  acquiredViews: number;
  pending: number;
  pendingClips: number;
  later: number;
  laterClips: number;
  review: number;
};

/** Ce qui est acquis (vues figées non payées), en cours (figé avant la fin du cycle) et en revue. */
export function summarize(clips: ClipRow[], campaigns: CampaignRow[], now: Date): MoneySummary {
  const byId = new Map<string, CampaignRow>(campaigns.map((campaign): [string, CampaignRow] => [campaign.id, campaign]));
  const cycle = cycleFor(now);
  const summary: MoneySummary = { cycle, acquired: 0, acquiredClips: 0, acquiredViews: 0, pending: 0, pendingClips: 0, later: 0, laterClips: 0, review: 0 };
  for (const clip of clips) {
    const state = clipState(clip);
    if (state === "review") { summary.review += 1; continue; }
    const campaign = byId.get(clip.campaign_id);
    if (!campaign || state === "rejected" || state === "paid") continue;
    if (state === "frozen") {
      const views = num(clip.frozen_views);
      summary.acquired += clipAmount(views, campaign);
      summary.acquiredClips += 1;
      summary.acquiredViews += views;
      continue;
    }
    const estimate = clipAmount(num(clip.views), campaign);
    if (freezeAt(clip.published_at).toISOString().slice(0, 10) <= cycle.end) {
      summary.pending += estimate;
      summary.pendingClips += 1;
    } else {
      summary.later += estimate;
      summary.laterClips += 1;
    }
  }
  summary.acquired = round2(summary.acquired);
  summary.pending = round2(summary.pending);
  summary.later = round2(summary.later);
  return summary;
}

export function platformFromUrl(raw: string): ClipPlatform | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "youtube";
    return null;
  } catch {
    return null;
  }
}

export function tiktokHandleFromUrl(raw: string): string | null {
  const match = raw.match(/tiktok\.com\/@([A-Za-z0-9._-]{2,40})/i);
  return match ? match[1].toLowerCase() : null;
}

export function normalizeHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._-]{2,40}$/.test(handle) ? handle : null;
}

export function normalizePhone(raw: string): string | null {
  const phone = raw.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function normalizeTelegram(raw: string): string | null {
  const value = raw.trim().replace(/^@/, "");
  if (!value) return null;
  return /^[A-Za-z0-9_]{4,32}$/.test(value) ? value : null;
}

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const integer = new Intl.NumberFormat("fr-FR");

export function formatEuro(value: number): string {
  return euro.format(value);
}

export function formatInt(value: number): string {
  return integer.format(Math.round(value));
}

export function formatDay(isoDate: string, withWeekday = true): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", withWeekday ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}
