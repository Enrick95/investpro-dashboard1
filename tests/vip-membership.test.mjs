import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addVipCalendarMonth, getVipMemberState, isSameVipOrigin, isValidVipCode,
  isValidVipEmail, isVipMembershipActive, normalizeVipCode, normalizeVipEmail,
  safeVipTelegramUrl,
} from "../lib/vip/membership.ts";

const now = Date.parse("2026-10-14T20:10:30.400Z");
const member = {
  user_id: "00000000-0000-4000-8000-000000000001", email: "member@example.com", type: "abonnement",
  started_at: "2026-10-14T20:10:30.400Z", expires_at: "2026-11-14T20:10:30.400Z", status: "active",
  renewal_requested_at: null, created_at: "2026-10-14T20:10:30.400Z", updated_at: "2026-10-14T20:10:30.400Z",
};

test("a month uses calendar boundaries, clamps month ends and preserves UTC time", () => {
  const pairs = [
    ["2026-01-31T12:34:56.789Z", "2026-02-28T12:34:56.789Z"],
    ["2028-01-31T12:34:56.789Z", "2028-02-29T12:34:56.789Z"],
    ["2026-03-31T00:00:00.000Z", "2026-04-30T00:00:00.000Z"],
    ["2026-12-31T23:59:59.999Z", "2027-01-31T23:59:59.999Z"],
  ];
  for (const [input, expected] of pairs) assert.equal(addVipCalendarMonth(input), expected);
  assert.throws(() => addVipCalendarMonth("invalid"), RangeError);
});

test("subscriptions stop at the exact expiry instant; lifting suspension does not renew", () => {
  assert.equal(isVipMembershipActive(member, now), true);
  assert.equal(isVipMembershipActive(member, Date.parse(member.expires_at) - 1), true);
  assert.equal(getVipMemberState(member, Date.parse(member.expires_at)), "expired");
  assert.equal(isVipMembershipActive({ ...member, status: "suspended" }, now), false);
  assert.equal(isVipMembershipActive({ ...member, status: "active" }, Date.parse(member.expires_at) + 1), false);
});

test("missing, future and malformed membership data always fail closed", () => {
  assert.equal(getVipMemberState(null, now), "none");
  assert.equal(getVipMemberState({ ...member, started_at: "2026-10-15T00:00:00Z" }, now), "upcoming");
  for (const invalid of [
    { ...member, started_at: "bad" }, { ...member, expires_at: "bad" },
    { ...member, expires_at: null }, { ...member, expires_at: member.started_at },
    { ...member, type: "PRO" }, { ...member, status: "unexpected" },
  ]) assert.equal(isVipMembershipActive(invalid, now), false);
  assert.equal(isVipMembershipActive(member, Number.NaN), false);
});

test("affiliation has no automatic expiry, but still honors suspension and start", () => {
  const affiliation = { ...member, type: "affiliation", expires_at: null };
  assert.equal(isVipMembershipActive(affiliation, Date.parse("2036-10-14")), true);
  assert.equal(isVipMembershipActive({ ...affiliation, status: "suspended" }, now), false);
  assert.equal(isVipMembershipActive({ ...affiliation, expires_at: member.expires_at }, now), false);
});

test("only complete high-entropy invitation formats are accepted; no demo or shared codes", () => {
  for (const prefix of ["AFF", "ABO"]) {
    const code = `IP-${prefix}-${"AB09".repeat(12)}`;
    assert.equal(isValidVipCode(code), true);
    assert.equal(normalizeVipCode(`  ${code.toLowerCase()}  `), code);
  }
  for (const invalid of ["IP-AFF-DEMO", "IP-ABO-DEMO", `IP-VIP-${"A".repeat(48)}`, `IP-AFF-${"G".repeat(48)}`, `IP-AFF-${"A".repeat(47)}`, "shared-code"]) {
    assert.equal(isValidVipCode(invalid), false);
  }
  assert.equal(normalizeVipCode("A".repeat(1000)), "");
  assert.equal(normalizeVipEmail("  Member@Example.COM  "), "member@example.com");
  assert.equal(isValidVipEmail("member@example.com"), true);
  for (const invalid of ["member", "a@@example.com", "a b@example.com", `${"a".repeat(255)}@example.com`]) assert.equal(isValidVipEmail(invalid), false);
});

test("Telegram settings cannot redirect members to arbitrary or credentialed origins", () => {
  assert.equal(safeVipTelegramUrl("https://t.me/+PrivateInvite_123"), "https://t.me/+PrivateInvite_123");
  for (const invalid of [null, "javascript:alert(1)", "http://t.me/+Invite", "https://t.me.evil.example/+Invite", "https://evil.example/+Invite", "https://t.me@evil.example/+Invite", "https://attacker@t.me/+Invite", "https://t.me:8443/+Invite", "https://t.me/"]) {
    assert.equal(safeVipTelegramUrl(invalid), null);
  }
});

test("mutations require an exact same-origin browser request, including scheme and port", () => {
  const request = (origin, site = "same-origin") => new Request("https://investprotrading.fr/api/vip/redeem", { method: "POST", headers: { ...(origin ? { Origin: origin } : {}), "Sec-Fetch-Site": site } });
  assert.equal(isSameVipOrigin(request("https://investprotrading.fr")), true);
  for (const origin of [null, "null", "https://www.investprotrading.fr", "https://investprotrading.fr.evil.example", "http://investprotrading.fr", "https://investprotrading.fr:8443"]) assert.equal(isSameVipOrigin(request(origin)), false);
  assert.equal(isSameVipOrigin(request("https://investprotrading.fr", "cross-site")), false);
});
