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
  try { return origin === new URL(request.url).origin; } catch { return false; }
}
