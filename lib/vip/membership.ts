import type { VipMemberState, VipMembership, VipMembershipType } from "./types";

export function normalizeVipEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidVipEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isVipMembershipType(value: unknown): value is VipMembershipType {
  return value === "affiliation" || value === "abonnement";
}

export function normalizeVipCode(value: unknown): string {
  return typeof value === "string" && value.length <= 80 ? value.trim().toUpperCase() : "";
}

export function isValidVipCode(value: string): boolean {
  return /^IP-(AFF|ABO)-[0-9A-F]{48}$/.test(value);
}

/** UTC calendar arithmetic mirrors the database interval, including month ends. */
export function addVipCalendarMonth(value: string | Date): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Date invalide.");
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString();
}

export function getVipMemberState(
  membership: VipMembership | null | undefined,
  now: number | Date = Date.now(),
): VipMemberState {
  if (!membership) return "none";
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp)) return "expired";
  if (membership.status !== "active") return "suspended";
  const start = Date.parse(membership.started_at);
  if (!Number.isFinite(start)) return "expired";
  if (start > timestamp) return "upcoming";
  if (membership.type === "affiliation") return membership.expires_at === null ? "active" : "expired";
  if (membership.type !== "abonnement" || !membership.expires_at) return "expired";
  const expiry = Date.parse(membership.expires_at);
  return Number.isFinite(expiry) && expiry > start && expiry > timestamp ? "active" : "expired";
}

export function isVipMembershipActive(
  membership: VipMembership | null | undefined,
  now: number | Date = Date.now(),
): boolean {
  return getVipMemberState(membership, now) === "active";
}

/** A queued renewal notice applies only to the member's current expiry and current phase. */
export function isCurrentVipRenewalNotice(
  eventKey: string,
  userId: string,
  membership: VipMembership | null | undefined,
  now: number | Date = Date.now(),
): boolean {
  if (!membership || membership.status !== "active" || membership.type !== "abonnement" || !membership.expires_at) return false;
  const timestamp = Number(now);
  const start = Date.parse(membership.started_at);
  const expiry = Date.parse(membership.expires_at);
  if (!Number.isFinite(timestamp) || !Number.isFinite(start) || start > timestamp || !Number.isFinite(expiry) || expiry <= start) return false;
  const prefix = `vip:renewal:${userId}:`;
  const suffix = eventKey.endsWith(":j3") ? ":j3" : eventKey.endsWith(":expired") ? ":expired" : null;
  if (!eventKey.startsWith(prefix) || !suffix) return false;
  // PostgreSQL ::text uses a space and may emit +00; JSON uses ISO T and +00:00.
  const rawDate = eventKey.slice(prefix.length, -suffix.length);
  const match = rawDate.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/);
  if (!match) return false;
  const fraction = match[3] ? `.${match[3].padEnd(3, "0").slice(0, 3)}` : "";
  const offset = match[4] === "Z" || match[4].length === 6 ? match[4]
    : match[4].length === 3 ? `${match[4]}:00` : `${match[4].slice(0, 3)}:${match[4].slice(3)}`;
  const queuedExpiry = Date.parse(`${match[1]}T${match[2]}${fraction}${offset}`);
  if (queuedExpiry !== expiry) return false;
  const day = 24 * 60 * 60 * 1000;
  return suffix === ":j3"
    ? expiry > timestamp && expiry <= timestamp + 3 * day
    : expiry <= timestamp && expiry > timestamp - 7 * day;
}

export function safeVipTelegramUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["t.me", "telegram.me"].includes(url.hostname)) return null;
    if (url.username || url.password || url.port || url.pathname === "/") return null;
    return url.toString();
  } catch { return null; }
}

export function isSameVipOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    // Browsers serialize Origin without a path, credentials or a trailing slash.
    // Vercel may use the other verified production alias for the request URL.
    if (new URL(origin).origin !== origin) return false;
    const target = new URL(request.url).origin;
    const production = new Set(["https://investprotrading.fr", "https://www.investprotrading.fr"]);
    return origin === target || (production.has(origin) && production.has(target));
  } catch { return false; }
}
