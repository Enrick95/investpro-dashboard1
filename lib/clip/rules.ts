// Règles du programme clippeurs, partagées entre le navigateur et le serveur.
// Chaque clip validé rapporte le montant choisi par Enrick à la validation (plus un
// bonus éventuel). Les clippeurs ne voient jamais de barème, seulement ce qu'ils ont gagné.

export const CLIP_PLATFORMS = ["tiktok", "instagram", "youtube", "facebook", "snapchat", "x"] as const;
export type ClipPlatform = (typeof CLIP_PLATFORMS)[number];
export const PLATFORM_LABEL: Record<ClipPlatform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", facebook: "Facebook", snapchat: "Snapchat", x: "X (Twitter)" };
export const PLATFORM_SHORT: Record<ClipPlatform, string> = { tiktok: "TT", instagram: "IG", youtube: "YT", facebook: "FB", snapchat: "SC", x: "X" };
/** Les réseaux où les clippeurs peuvent publier, dits simplement. */
export const NETWORKS_TEXT = "TikTok, Instagram, YouTube Shorts, Facebook, Snapchat ou X";
export const NETWORKS_LIST = ["TikTok", "Instagram", "YouTube Shorts", "Facebook", "Snapchat", "X (Twitter)"];

/** Crypto, PayPal ou virement (la clé usdt_trc20 reste celle de la base pour la crypto). */
export const PAYOUT_METHODS = ["usdt_trc20", "paypal", "sepa"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];
export const PAYOUT_LABEL: Record<PayoutMethod, string> = { usdt_trc20: "Crypto", paypal: "PayPal", sepa: "Virement" };
export const PAYOUT_HINT: Record<PayoutMethod, string> = { usdt_trc20: "Adresse crypto et réseau (ex. USDT TRC20)", paypal: "E-mail PayPal", sepa: "IBAN" };

export const FREEZE_DAYS = 7;
export const MIN_PAYOUT = 20;
/** Montant proposé par défaut pour un clip validé (modifiable à chaque validation). */
export const DEFAULT_CLIP_AMOUNT = 7;
/** Parrainage : prime pour le parrain quand son filleul atteint ce nombre de clips validés. */
export const REFERRAL_BONUS = 20;
export const REFERRAL_CLIPS = 10;
/** WhatsApp d'Enrick (Bali) : le canal de contact des clippeurs et des candidats. */
export const ENRICK_WHATSAPP_LABEL = "+62 851 2811 5218";

export function enrickWhatsApp(text?: string): string {
  return `https://wa.me/6285128115218${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Message tout prêt qu'un candidat envoie à Enrick sur WhatsApp juste après avoir postulé sur le site. */
export function candidateWhatsAppText(name?: string | null): string {
  const clean = (name ?? "").trim().replace(/\.+$/, "");
  const who = clean ? ` C'est ${clean}.` : "";
  return `Salut Enrick !${who} Je viens d'envoyer ma candidature pour devenir clippeur InvestPro Clip sur le site. Tu peux la regarder quand tu as un moment ? Merci !`;
}

/** Le TikTok d'Enrick : les clippeurs peuvent déjà y prendre ses vidéos pour les couper et les republier. */
export const ENRICK_TIKTOK_HANDLE = "@enrick95__";
export const ENRICK_TIKTOK_URL = "https://www.tiktok.com/@enrick95__";
/** Sa chaîne YouTube : vidéos longues et lives, à découper aussi. */
export const ENRICK_YOUTUBE_HANDLE = "@Enrick95";
export const ENRICK_YOUTUBE_URL = "https://www.youtube.com/@Enrick95";

/** Le domaine de l'espace clippeurs. */
export const CLIP_DOMAIN = "investproclip.com";
export const CLIP_PUBLIC_URL = `https://${CLIP_DOMAIN}`;

/** Image d'aperçu des liens partagés (WhatsApp, Telegram, Discord, iMessage…). */
export const CLIP_OG_IMAGE = { url: `${CLIP_PUBLIC_URL}/clip-app/og.jpg`, width: 1200, height: 630, alt: "InvestPro Clip : clippe les vidéos d'Enrick95, fais des vues, sois payé" };

/** Adresse de l'espace clippeurs depuis le site où l'on est : à la racine sur investproclip.com, sous /clip ailleurs. */
export function clipBase(origin: string): string {
  try {
    const host = new URL(origin).hostname.replace(/^www\./, "");
    if (host === CLIP_DOMAIN) return `https://${CLIP_DOMAIN}`;
  } catch {
    // origine vide (rendu serveur) : chemin relatif
  }
  return `${origin}/clip`;
}

/** Chemin d'une page de l'espace : à la racine sur investproclip.com (/login), sous /clip ailleurs (/clip/login). */
export function clipPath(origin: string, path: string): string {
  return clipBase(origin) === CLIP_PUBLIC_URL ? path.replace(/^\/clip(?=[/?#]|$)/, "") || "/" : path;
}

/** Page de connexion des clippeurs, qui ouvre aussi leur espace une fois connectés. */
export function clipSpaceUrl(origin: string): string {
  return `${clipBase(origin)}/login`;
}

/** Page vers laquelle renvoie le lien traqué de chaque clippeur (le lien en bio d'Enrick). */
export const TRACKED_LINK_TARGET = "https://investprotrading.fr/enrick";

export function trackedLink(origin: string, trackingCode: string): string {
  return `${clipBase(origin)}/l/${trackingCode}`;
}

/** Lien de parrainage d'un clippeur : la page d'inscription avec son code. */
export function referralLink(origin: string, trackingCode: string): string {
  return `${clipBase(origin)}/rejoindre?parrain=${trackingCode}`;
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
  /** Montant proposé par défaut à la validation : réservé à l'admin, jamais envoyé aux clippeurs. */
  amount_per_clip?: number | string;
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
  /** Montant fixé par Enrick à la validation. */
  amount?: number | string | null;
  /** Bonus ajouté ensuite (clip qui cartonne). */
  bonus?: number | string | null;
  /** TikTok : interactions relevées avec les vues (vides pour les autres réseaux). */
  likes?: number | string | null;
  comments?: number | string | null;
  shares?: number | string | null;
  saves?: number | string | null;
  engagement_at?: string | null;
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
  referral_amount?: number | string;
  total: number | string;
  method: string | null;
  proof: string | null;
  paid_at: string;
};

export type ClipState = "review" | "rejected" | "paid" | "validated";

export function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Ce que rapporte un clip validé : le montant choisi à la validation, plus son bonus. */
export function clipValue(clip: Pick<ClipRow, "amount" | "bonus">): number {
  return round2(num(clip.amount) + num(clip.bonus));
}

/** Vues connues d'un clip (figées à J+7 si c'est passé), pour les statistiques. */
export function clipViewsOf(clip: Pick<ClipRow, "views" | "frozen_views">): number {
  return clip.frozen_views !== null && clip.frozen_views !== undefined ? num(clip.frozen_views) : num(clip.views);
}

export type ClipEngagementCounts = Pick<ClipRow, "views" | "likes" | "comments" | "shares" | "saves">;

/**
 * Taux d'engagement par vues, en % : (j'aime + commentaires + partages + enregistrements) ÷ vues × 100.
 * null tant que rien n'est relevé (TikTok seulement) ou sans vues.
 */
export function engagementRate(clip: ClipEngagementCounts): number | null {
  const known = (value: unknown) => value !== null && value !== undefined && value !== "";
  if (!known(clip.likes) || !known(clip.comments) || !known(clip.shares)) return null;
  const views = num(clip.views);
  if (views <= 0) return null;
  return ((num(clip.likes) + num(clip.comments) + num(clip.shares) + num(clip.saves)) / views) * 100;
}

/** Un TikTok normal tourne autour de 4 % d'engagement par vues. */
export const TIKTOK_USUAL_RATE = 4;
/** Alerte « à contrôler » : beaucoup de vues pour presque aucune interaction (vues achetées, pub payée)… */
export const SUSPECT_LOW = { minViews: 1000, maxRate: 1 };
/** …ou des interactions bien trop nombreuses pour les vues (j'aime achetés). */
export const SUSPECT_HIGH = { minViews: 500, minRate: 30 };

export type EngagementSuspicion = { kind: "low" | "high"; rate: number; views: number };

/** Engagement anormal pour un clip TikTok relevé, sinon null. */
export function engagementSuspicion(clip: ClipEngagementCounts): EngagementSuspicion | null {
  const rate = engagementRate(clip);
  if (rate === null) return null;
  const views = num(clip.views);
  if (views >= SUSPECT_LOW.minViews && rate < SUSPECT_LOW.maxRate) return { kind: "low", rate, views };
  if (views >= SUSPECT_HIGH.minViews && rate >= SUSPECT_HIGH.minRate) return { kind: "high", rate, views };
  return null;
}

export function clipState(clip: Pick<ClipRow, "status" | "payout_id">): ClipState {
  if (clip.status === "review") return "review";
  if (clip.status === "rejected") return "rejected";
  if (clip.payout_id) return "paid";
  return "validated";
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
  review: number;
};

/** Ce qui est acquis (clips validés pas encore payés) et ce qui attend la validation. */
export function summarize(clips: ClipRow[], now: Date): MoneySummary {
  const summary: MoneySummary = { cycle: cycleFor(now), acquired: 0, acquiredClips: 0, acquiredViews: 0, review: 0 };
  for (const clip of clips) {
    const state = clipState(clip);
    if (state === "review") summary.review += 1;
    if (state !== "validated") continue;
    summary.acquired += clipValue(clip);
    summary.acquiredClips += 1;
    summary.acquiredViews += clipViewsOf(clip);
  }
  summary.acquired = round2(summary.acquired);
  return summary;
}

/** Primes de parrainage dues : un filleul qui a assez de clips validés et dont la prime n'est pas encore versée. */
export function referralDue(referees: { approved: number; paid: boolean }[]): { count: number; amount: number } {
  const count = referees.filter((referee) => !referee.paid && referee.approved >= REFERRAL_CLIPS).length;
  return { count, amount: count * REFERRAL_BONUS };
}

export function platformFromUrl(raw: string): ClipPlatform | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "youtube";
    if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch" || host === "fb.com" || host.endsWith(".fb.com")) return "facebook";
    if (host === "snapchat.com" || host.endsWith(".snapchat.com")) return "snapchat";
    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) return "x";
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
