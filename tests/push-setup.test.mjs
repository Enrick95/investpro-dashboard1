import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { ensurePushSubscription, loadPushSetup, pushKeyBytes, PushSetupError, pushReminderKey, pushSetupFingerprint, readyPushRegistration, savePushChannels, shouldOfferPush } from "../lib/push/setup.ts";

const curve = createECDH("prime256v1"); curve.generateKeys();
const publicKey = curve.getPublicKey().toString("base64url");
const otherCurve = createECDH("prime256v1"); otherCurve.generateKeys();
const otherKey = otherCurve.getPublicKey().toString("base64url");
const userId = "11111111-1111-4111-8111-111111111111";
const settings = { userId, publicKey, channels: ["copier", "vip"] };
const subscription = key => ({ options: { applicationServerKey: key ? pushKeyBytes(key).buffer : null }, toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/fixture-only", keys: { p256dh: "fixture", auth: "fixture" } }), unsubscribe: async () => true });
const api = ({ active = true, admin = false, copier = publicKey, vip = publicKey } = {}) => async path => {
  if (path === "/api/vip/access") return { user: { id: userId }, active, admin };
  return { available: Boolean(path === "/api/copier/push" ? copier : vip), publicKey: path === "/api/copier/push" ? copier : vip };
};

test("verified VIP members and administrators enroll the same native subscription in both channels", async () => {
  assert.deepEqual(await loadPushSetup(api()), settings);
  assert.deepEqual(await loadPushSetup(api({ active: false, admin: true })), settings);
  const calls = [];
  await savePushChannels(subscription(publicKey), settings, async (path, options) => { calls.push([path, JSON.parse(options.body)]); return { ok: true }; });
  assert.deepEqual(calls.map(([path]) => path), ["/api/copier/push", "/api/vip/push"]);
  assert.deepEqual(calls[0][1], calls[1][1]);
});

test("ordinary members enroll only into Copier and can add VIP once their access changes", async () => {
  const ordinary = await loadPushSetup(api({ active: false }));
  assert.deepEqual(ordinary.channels, ["copier"]);
  const paths = [];
  await savePushChannels(subscription(publicKey), ordinary, async path => { paths.push(path); });
  assert.deepEqual(paths, ["/api/copier/push"]);
  const confirmed = JSON.stringify({ confirmed: pushSetupFingerprint(ordinary) });
  assert.equal(shouldOfferPush(confirmed, settings, "granted", subscription(publicKey)), true);
});

test("unavailable or conflicting identities never silently activate the wrong delivery channel", async () => {
  await assert.rejects(loadPushSetup(api({ vip: null })), error => error instanceof PushSetupError && error.code === "unavailable");
  await assert.rejects(loadPushSetup(api({ copier: otherKey })), error => error instanceof PushSetupError && error.code === "config_mismatch");
  assert.deepEqual((await loadPushSetup(api({ active: false, vip: null }))).channels, ["copier"]);
  await assert.rejects(loadPushSetup(async path => path === "/api/vip/access" ? { user_metadata: { role: "admin" }, active: true } : { available: true, publicKey }), PushSetupError);
});

test("a partial API failure remains a visible failure rather than a success confirmation", async () => {
  const calls = [];
  await assert.rejects(savePushChannels(subscription(publicKey), settings, async path => {
    calls.push(path);
    if (path === "/api/vip/push") throw new Error("fixture 409");
    return { ok: true };
  }), error => error instanceof PushSetupError && error.code === "saving_failed" && error.channels.join() === "vip");
  assert.equal(calls.length, 2);
});

test("an existing subscription with the current VAPID key is reused without resetting iOS or Android", async () => {
  const existing = subscription(publicKey);
  let resets = 0, creates = 0;
  existing.unsubscribe = async () => { resets++; return true; };
  const registration = { pushManager: { getSubscription: async () => existing, subscribe: async () => { creates++; throw new Error("must reuse"); } } };
  assert.equal(await ensurePushSubscription(registration, publicKey), existing);
  assert.equal(resets, 0); assert.equal(creates, 0);
});

test("a changed VAPID key is replaced once during explicit activation", async () => {
  const events = [], existing = subscription(otherKey), replacement = subscription(publicKey);
  existing.unsubscribe = async () => { events.push("unsubscribe"); return true; };
  const registration = { pushManager: { getSubscription: async () => existing, subscribe: async options => { events.push("subscribe"); assert.equal(options.userVisibleOnly, true); assert.deepEqual(options.applicationServerKey, pushKeyBytes(publicKey)); return replacement; } } };
  assert.equal(await ensurePushSubscription(registration, publicKey), replacement);
  assert.deepEqual(events, ["unsubscribe", "subscribe"]);
});

test("a failed native replacement does not continue with an incompatible subscription", async () => {
  const existing = subscription(otherKey); existing.unsubscribe = async () => false;
  let creates = 0;
  const registration = { pushManager: { getSubscription: async () => existing, subscribe: async () => { creates++; } } };
  await assert.rejects(ensurePushSubscription(registration, publicKey), error => error.code === "subscription_reset_failed");
  assert.equal(creates, 0);
});

test("service worker readiness is bounded and registers the root worker when missing", async () => {
  const active = { active: {} };
  assert.equal(await readyPushRegistration({ getRegistration: async () => active }), active);
  const calls = [];
  assert.equal(await readyPushRegistration({ getRegistration: async () => null, register: async path => { calls.push(path); return active; } }), active);
  assert.deepEqual(calls, ["/sw.js"]);
  await assert.rejects(readyPushRegistration({ getRegistration: async () => ({ active: null }), ready: new Promise(() => {}) }, 5), error => error.code === "worker_timeout");
});

test("reminders expire after their date, old permanent dismissal is ignored, and success is scoped to account and channels", () => {
  const now = 100000, current = subscription(publicKey);
  assert.equal(shouldOfferPush("1", settings, "default", null, now), true);
  assert.equal(shouldOfferPush(JSON.stringify({ until: now + 7 * 86400000 }), settings, "default", null, now), false);
  assert.equal(shouldOfferPush(JSON.stringify({ until: now + 7 * 86400000 }), settings, "default", null, now + 7 * 86400000 + 1), true);
  const saved = JSON.stringify({ confirmed: pushSetupFingerprint(settings) });
  assert.equal(shouldOfferPush(saved, settings, "granted", current), false);
  assert.equal(shouldOfferPush(saved, settings, "default", null), true);
  assert.equal(shouldOfferPush(saved, settings, "granted", subscription(otherKey)), true);
  assert.notEqual(pushReminderKey(settings), pushReminderKey({ ...settings, userId: "22222222-2222-4222-8222-222222222222" }));
});

test("invalid application keys never reach the native subscription API", () => {
  for (const key of ["", "not-a-key", "A".repeat(87)]) assert.throws(() => pushKeyBytes(key), PushSetupError);
});
