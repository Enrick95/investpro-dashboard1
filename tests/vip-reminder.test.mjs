import assert from "node:assert/strict";
import { test } from "node:test";
import { isCurrentVipRenewalNotice } from "../lib/vip/membership.ts";

const userId = "83cfaf59-8e27-47e4-b64b-3d17fc501102";
const now = Date.parse("2026-11-14T12:00:00Z");
const member = {
  user_id: userId, email: "test@example.invalid", type: "abonnement", status: "active",
  started_at: "2026-10-16T12:34:56.123456+00:00", expires_at: "2026-11-16T12:34:56.123456+00:00",
  renewal_requested_at: null, created_at: "2026-10-16T12:34:56Z", updated_at: "2026-10-16T12:34:56Z",
};
const key = (date = "2026-11-16 12:34:56.123456+00", phase = "j3", owner = userId) => `vip:renewal:${owner}:${date}:${phase}`;

test("a current J-3 reminder matches PostgreSQL timestamp text to Supabase ISO JSON", () => {
  assert.equal(isCurrentVipRenewalNotice(key(), userId, member, now), true);
  assert.equal(isCurrentVipRenewalNotice(key("2026-11-16 14:34:56.123456+02"), userId, member, now), true);
  assert.equal(isCurrentVipRenewalNotice(key("2026-11-16T12:34:56.123Z"), userId, member, now), true);
});

test("renewing a subscription makes its queued old-expiry reminder obsolete", () => {
  const renewed = { ...member, expires_at: "2026-12-16T12:34:56.123456+00:00" };
  assert.equal(isCurrentVipRenewalNotice(key(), userId, renewed, now), false);
  assert.equal(isCurrentVipRenewalNotice(key("2026-12-16 12:34:56.123456+00"), userId, renewed, now), false, "new expiry is not due yet");
});

test("the expired and J-3 phases cannot send the opposite message", () => {
  const expiry = Date.parse(member.expires_at);
  assert.equal(isCurrentVipRenewalNotice(key(undefined, "expired"), userId, member, now), false);
  assert.equal(isCurrentVipRenewalNotice(key(), userId, member, expiry), false);
  assert.equal(isCurrentVipRenewalNotice(key(undefined, "expired"), userId, member, expiry), true);
  assert.equal(isCurrentVipRenewalNotice(key(undefined, "expired"), userId, member, expiry + 7 * 86400000), false);
});

test("suspended, non-subscription, future, missing and malformed memberships never receive renewal reminders", () => {
  for (const value of [null, { ...member, status: "suspended" }, { ...member, type: "affiliation", expires_at: null }, { ...member, started_at: "2026-11-15T12:00:00Z" }, { ...member, expires_at: "invalid" }, { ...member, started_at: "invalid" }]) {
    assert.equal(isCurrentVipRenewalNotice(key(), userId, value, now), false);
  }
  assert.equal(isCurrentVipRenewalNotice(key(), userId, member, NaN), false);
});

test("another owner, invalid dates and unsupported event keys cannot become renewal reminders", () => {
  for (const value of [key(undefined, "j3", "another-user"), key("invalid"), key("2026-11-16 12:34:56.123456"), key(undefined, "anything"), "vip:post:123", "vip:renewal:" + userId + ":2026-11-16 12:34:56.123456+00:extra:j3"]) {
    assert.equal(isCurrentVipRenewalNotice(value, userId, member, now), false, value);
  }
});
