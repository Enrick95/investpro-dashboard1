import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Exercise the real server workers with a strict, owner-filtering in-memory DB.
// Providers, timers and environment are local fixtures; no network or DB writes.
const root = path.resolve(import.meta.dirname, "..");
const userId = "11111111-1111-4111-8111-111111111111";
const foreignUserId = "99999999-9999-4999-8999-999999999999";
const confirmationId = "22222222-2222-4222-8222-222222222222";
const providerId = "33333333-3333-4333-8333-333333333333";
const eventKey = `vip:access:${confirmationId}:${userId}`;
const secret = "PRIVATE_PROVIDER_OR_DATABASE_DETAIL";

function compile(file, modules = {}, globals = {}) {
  const compiled = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module: compiled, exports: compiled.exports, Buffer, URL, Request, Response, Headers,
    AbortController, AbortSignal, TextEncoder, TextDecoder, Uint8Array,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Unexpected import: ${name}`);
      return modules[name];
    },
    ...globals,
  });
  return compiled.exports;
}
const membership = compile("lib/vip/membership.ts");
const validation = compile("lib/vip/push-validation.ts");
const publicationNotice = compile("lib/vip/publication-notice.ts");
const identity = compile("lib/vip/identity.ts");
const accessRequests = compile("lib/vip/access-requests.ts", { "./identity": identity, "./membership": membership });

function event(overrides = {}) {
  return {
    id: confirmationId, user_id: userId, event_key: eventKey,
    title: "Votre accès InvestPro VIP est activé",
    message: "Votre accès VIP est validé. Retrouvez vos analyses et signaux dans votre espace InvestPro.",
    created_at: new Date(Date.now() - 60_000).toISOString(),
    email_status: "processing", email_attempts: 1,
    ...overrides,
  };
}
function activeMember(overrides = {}) {
  return { type: "affiliation", status: "active", started_at: "2020-01-01T00:00:00.000Z", expires_at: null, ...overrides };
}

function emailFixture(options = {}) {
  const queue = [...(options.events ?? [event()])];
  const calls = { claims: [], auth: [], membership: [], requests: [], finished: [], logs: [], timers: [], deadlines: [] };
  let requestIndex = 0;
  const db = {
    async rpc(name, args) {
      calls.claims.push({ name, args });
      assert.equal(name, "vip_claim_access_confirmation_emails");
      return { data: queue.splice(0, args.p_limit), error: options.claimError ? { message: secret } : null };
    },
    auth: { admin: { async getUserById(id) {
      calls.auth.push(id);
      return {
        data: { user: options.authUser === null ? null : options.authUser ?? {
          id: userId, email: "verified-client@example.test", email_confirmed_at: "2020-01-01T00:00:00Z",
          user_metadata: { full_name: '<img src=x onerror="alert(1)">', email: "attacker@example.test" },
        } },
        error: options.authError ? { message: secret } : null,
      };
    } } },
    from(table) {
      const filters = new Map();
      let update;
      const chain = {
        select() { return chain; },
        eq(key, value) { filters.set(key, value); return chain; },
        update(value) { update = value; return chain; },
        async maybeSingle() {
          if (table === "vip_memberships") {
            assert.equal(filters.get("user_id"), userId);
            calls.membership.push(Object.fromEntries(filters));
            return { data: options.member === undefined ? activeMember() : options.member, error: options.memberError ? { message: secret } : null };
          }
          assert.equal(table, "vip_access_confirmations");
          assert.ok(update, "tracking must explicitly update the claimed event");
          const finish = { patch: update, filters: Object.fromEntries(filters) };
          calls.finished.push(finish);
          assert.equal(filters.get("id"), confirmationId);
          assert.equal(filters.get("email_status"), "processing");
          assert.ok(Number.isInteger(filters.get("email_attempts")), "CAS guards the exact claimed attempt");
          return { data: options.trackingMissing ? null : { id: confirmationId }, error: options.trackingError ? { message: secret } : null };
        },
      };
      return chain;
    },
  };
  const env = {
    VERCEL_ENV: "production", RESEND_API_KEY: "re_fixture-not-a-real-key",
    INVESTPRO_EMAIL_FROM: "InvestPro <notifications@investprotrading.fr>",
    ...options.env,
  };
  const worker = compile("lib/vip/access-confirmations.ts", {
    "server-only": {}, "./membership": membership,
  }, {
    process: { env },
    performance: { now: () => 0 },
    console: { error(...args) { calls.logs.push(args); }, warn(...args) { calls.logs.push(args); } },
    setTimeout(callback, delay) {
      const token = { callback, delay };
      calls.timers.push(token);
      // Provider pacing passes without wall-clock waits.
      if (delay < 1000) queueMicrotask(callback);
      return token;
    },
    AbortSignal: { timeout(delay) {
      calls.deadlines.push(delay);
      const controller = new AbortController();
      if (options.timeout) queueMicrotask(() => controller.abort());
      return controller.signal;
    } },
    async fetch(url, init) {
      const headers = new Headers(init.headers);
      const payload = JSON.parse(init.body);
      calls.requests.push({ url, headers: Object.fromEntries(headers), payload, signal: init.signal });
      const behavior = options.provider?.[requestIndex++] ?? { status: 200, body: { id: providerId } };
      if (options.timeout) {
        if (init.signal.aborted) throw Object.assign(new Error(secret), { name: "AbortError" });
        await new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error(secret), { name: "AbortError" })), { once: true }));
      }
      if (behavior.error) throw new Error(secret);
      return new Response(behavior.rawBody ?? JSON.stringify(behavior.body ?? { message: secret }), { status: behavior.status, headers: { "Content-Type": "application/json" } });
    },
  });
  return { calls, async deliver() { return worker.deliverVipAccessConfirmations(db); } };
}

test("VIP confirmation emails are production-only and missing configuration cannot claim or mark delivery", async () => {
  for (const env of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, { VERCEL_ENV: undefined }]) {
    const fixture = emailFixture({ env });
    const result = await fixture.deliver();
    assert.equal(result.preview, true);
    assert.equal(fixture.calls.claims.length, 0);
    assert.equal(fixture.calls.requests.length, 0);
  }
  for (const env of [{ RESEND_API_KEY: "" }, { INVESTPRO_EMAIL_FROM: "" }]) {
    const fixture = emailFixture({ env });
    const result = await fixture.deliver();
    assert.equal(result.unavailable, true);
    assert.equal(result.sent, 0);
    assert.equal(fixture.calls.claims.length, 0);
    assert.equal(fixture.calls.finished.length, 0);
  }
});

test("email confirmation uses the server-verified confirmed Auth recipient and fixed branded CTA without requiring VAPID", async () => {
  const fixture = emailFixture({ events: [event({ email: "attacker@example.test", title: "InvestPro VIP <script>evil()</script>", message: '<img src=x onerror="evil()">', href: "https://attacker.invalid/" })] });
  const result = await fixture.deliver();
  assert.equal(result.sent, 1);
  assert.equal(fixture.calls.requests.length, 1);
  const request = fixture.calls.requests[0];
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.deepEqual([].concat(request.payload.to), ["verified-client@example.test"]);
  assert.equal(request.headers["idempotency-key"], eventKey);
  assert.match(request.payload.subject, /InvestPro/);
  assert.match(request.payload.html, /https:\/\/investprotrading\.fr\/dashboard\/vip/);
  assert.doesNotMatch(request.payload.html, /attacker|<script|<img/);
  assert.match(request.payload.html, /&lt;script&gt;evil\(\)&lt;\/script&gt;/);
  assert.match(request.payload.html, /&lt;img src=x onerror=&quot;evil\(\)&quot;&gt;/);
  assert.equal(fixture.calls.finished[0].patch.email_status, "sent");
  assert.equal(fixture.calls.finished[0].filters.email_attempts, 1);
});

test("unconfirmed, mismatched and missing Auth users never receive access confirmations", async () => {
  for (const authUser of [null, { id: foreignUserId, email: "foreign@example.test", email_confirmed_at: "2020-01-01" }, { id: userId, email: "unconfirmed@example.test", email_confirmed_at: null }, { id: userId, email: "invalid\r\nbcc:x@example.test", email_confirmed_at: "2020-01-01" }]) {
    const fixture = emailFixture({ authUser });
    const result = await fixture.deliver();
    assert.equal(fixture.calls.requests.length, 0);
    assert.equal(result.sent, 0);
    assert.equal(result.skipped, 1);
    assert.equal(fixture.calls.finished[0].patch.email_status, "skipped");
  }
});

test("stale events and inactive or expired memberships cannot send a misleading activation email", async () => {
  const stale = emailFixture({ events: [event({ created_at: new Date(Date.now() - 25 * 60 * 60_000).toISOString() })] });
  await assert.rejects(stale.deliver(), /VIP_ACCESS_EMAIL_CLAIM_INVALID/);
  assert.equal(stale.calls.requests.length, 0);
  for (const options of [
    { member: null }, { member: activeMember({ status: "suspended" }) },
    { member: activeMember({ type: "abonnement", expires_at: "2020-02-01T00:00:00Z" }) },
  ]) {
    const fixture = emailFixture(options);
    const result = await fixture.deliver();
    assert.equal(fixture.calls.requests.length, 0);
    assert.equal(result.skipped, 1);
    assert.equal(fixture.calls.finished[0].patch.email_status, "skipped");
  }
});

test("event keys bind confirmation and recipient before any lookup or provider call", async () => {
  for (const overrides of [
    { event_key: `vip:access:${confirmationId}:${foreignUserId}` },
    { event_key: "untrusted-event" },
    { id: "not-a-uuid" },
    { email_attempts: 0 }, { email_attempts: 99 },
  ]) {
    const fixture = emailFixture({ events: [event(overrides)] });
    await assert.rejects(fixture.deliver(), /VIP_ACCESS_EMAIL_CLAIM_INVALID/);
    assert.equal(fixture.calls.requests.length, 0);
    assert.equal(fixture.calls.auth.length, 0);
  }
});

test("provider 429, 500, network and timeout failures remain retryable bounded safe states", async () => {
  for (const options of [
    { provider: [{ status: 429 }] }, { provider: [{ status: 500 }] },
    { provider: [{ error: true }] }, { timeout: true },
    { provider: [{ status: 200, rawBody: "not-json" }] },
    { provider: [{ status: 200, body: { id: "not-a-provider-id" } }] },
  ]) {
    const fixture = emailFixture(options);
    const result = await fixture.deliver();
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 1);
    assert.equal(fixture.calls.requests.length, 1, "no immediate retry can duplicate delivery");
    const finish = fixture.calls.finished[0].patch;
    assert.equal(finish.email_status, "failed");
    assert.ok(Number.isFinite(Date.parse(finish.email_next_attempt_at)));
    assert.doesNotMatch(JSON.stringify([result, fixture.calls.finished, fixture.calls.logs]), new RegExp(secret));
    assert.ok(fixture.calls.deadlines.every(delay => delay > 0 && delay <= 8000), "provider request has a bounded abort deadline");
    assert.equal(fixture.calls.deadlines.length, 1);
  }
});

test("retry and failed tracking reuse the stable event idempotency key and guard the claimed attempt", async () => {
  const first = emailFixture({ provider: [{ status: 429 }] });
  await first.deliver();
  const retry = emailFixture({ events: [event({ email_attempts: 2 })] });
  assert.equal((await retry.deliver()).sent, 1);
  assert.equal(first.calls.requests[0].headers["idempotency-key"], retry.calls.requests[0].headers["idempotency-key"]);
  assert.equal(retry.calls.finished[0].filters.email_attempts, 2);
  for (const option of [{ trackingError: true }, { trackingMissing: true }]) {
    const fixture = emailFixture(option);
    await assert.rejects(fixture.deliver(), /VIP_ACCESS_EMAIL_TRACKING_FAILED/);
    assert.equal(fixture.calls.requests[0].headers["idempotency-key"], eventKey);
    assert.doesNotMatch(JSON.stringify(fixture.calls.logs), new RegExp(secret));
  }
});

test("lookup failures cannot claim successful delivery and do not expose raw infrastructure errors", async () => {
  for (const option of [{ memberError: true }, { authError: true }]) {
    const fixture = emailFixture(option);
    const result = await fixture.deliver();
    assert.equal(result.failed, 1);
    assert.equal(fixture.calls.requests.length, 0);
    assert.equal(fixture.calls.finished[0].patch.email_status, "failed");
    assert.doesNotMatch(JSON.stringify([result, fixture.calls.finished, fixture.calls.logs]), new RegExp(secret));
  }
});

test("the last email attempt is terminal and a claimed batch is paced, bounded and reported as remaining", async () => {
  const finalAttempt = emailFixture({ events: [event({ email_attempts: 4 })], provider: [{ status: 500 }] });
  assert.equal((await finalAttempt.deliver()).failed, 1);
  assert.equal(finalAttempt.calls.finished[0].patch.email_next_attempt_at, null);
  const batch = emailFixture({ events: Array.from({ length: 10 }, () => event()) });
  const result = await batch.deliver();
  assert.equal(result.sent, 10);
  assert.equal(result.remaining, true);
  assert.equal(batch.calls.claims.length, 1);
  assert.equal(batch.calls.claims[0].args.p_limit, 10);
  assert.equal(batch.calls.requests.length, 10);
  assert.equal(batch.calls.finished.length, 10);
  assert.equal(batch.calls.timers.length, 9);
  assert.ok(batch.calls.timers.every(timer => timer.delay > 0 && timer.delay <= 650));
});

const curve = createECDH("prime256v1");
curve.generateKeys();
function subscription(id, endpoint, owner = userId, overrides = {}) {
  return { id, user_id: owner, endpoint, p256dh: curve.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url"), ...overrides };
}
const ownEndpoint = "https://fcm.googleapis.com/fcm/send/own-confirmation-fixture";
const otherEndpoint = "https://web.push.apple.com/own-confirmation-fixture";

function pushFixture(options = {}) {
  const queue = [...(options.events ?? [{ ...event(), kind: "access_confirmation", href: "/dashboard/vip" }])];
  const calls = { claims: [], lookup: [], sends: [], finished: [], deleted: [], logs: [] };
  const allSubscriptions = {
    vip_push_subscriptions: options.vip ?? [],
    copier_push_subscriptions: options.copier ?? [],
  };
  const db = {
    async rpc(name, args) {
      assert.equal(name, "vip_claim_notifications");
      calls.claims.push(args);
      return { data: queue.splice(0, args.p_limit), error: null };
    },
    from(table) {
      const filters = new Map();
      let action, patch;
      const chain = {
        select() { return chain; },
        eq(key, value) { filters.set(key, value); return chain; },
        delete() { action = "delete"; return chain; },
        update(value) { action = "update"; patch = value; return chain; },
        async maybeSingle() {
          calls.lookup.push({ table, filters: Object.fromEntries(filters) });
          if (table === "vip_access_confirmations") {
            assert.equal(filters.get("id"), confirmationId);
            assert.equal(filters.get("user_id"), userId);
            assert.equal(filters.get("event_key"), eventKey);
            return { data: options.confirmationMissing ? null : { id: confirmationId, user_id: userId, event_key: eventKey }, error: options.confirmationError ? { message: secret } : null };
          }
          assert.equal(table, "vip_memberships");
          assert.equal(filters.get("user_id"), userId);
          return { data: options.member === undefined ? activeMember() : options.member, error: options.memberError ? { message: secret } : null };
        },
        async limit(limit) {
          assert.ok(Object.hasOwn(allSubscriptions, table), `Unexpected subscription table ${table}`);
          assert.equal(limit, 10, "each device source is bounded");
          assert.equal(filters.get("user_id"), userId, "every source query must be owner-scoped");
          calls.lookup.push({ table, filters: Object.fromEntries(filters) });
          return { data: allSubscriptions[table].filter(row => row.user_id === filters.get("user_id")), error: options.subscriptionError === table ? { message: secret } : null };
        },
        then(resolve, reject) {
          try {
            if (action === "delete") {
              assert.ok(Object.hasOwn(allSubscriptions, table));
              assert.equal(filters.get("user_id"), userId, "stale-device cleanup cannot delete another owner's row");
              calls.deleted.push({ table, filters: Object.fromEntries(filters) });
            } else {
              assert.equal(table, "vip_notification_outbox");
              assert.equal(action, "update");
              assert.equal(filters.get("status"), "processing");
              calls.finished.push({ patch, filters: Object.fromEntries(filters) });
            }
            resolve({ error: options.trackingError && action === "update" ? { message: secret } : null });
          } catch (error) { reject(error); }
        },
      };
      return chain;
    },
  };
  const worker = compile("lib/vip/notifications.ts", {
    "server-only": {}, "./membership": membership, "./push-validation": validation,
    "./publication-notice": publicationNotice,
    "../admin/permissions": { async canAdmin() { return false; } },
    "./admin-activity": { vipAdminActivityHref() { return null; } },
    "web-push": {
      setVapidDetails() {},
      async sendNotification(nativeSubscription, rawPayload, settings) {
        calls.sends.push({ subscription: nativeSubscription, payload: JSON.parse(rawPayload), settings });
        if (options.pushStatus) throw { statusCode: options.pushStatus, body: secret };
      },
    },
  }, {
    process: { env: { VERCEL_ENV: "production", VAPID_PUBLIC_KEY: "fixture", VAPID_PRIVATE_KEY: "fixture", VAPID_SUBJECT: "mailto:fixture@example.test", ...options.env } },
    performance: { now: () => 0 },
    console: { error(...args) { calls.logs.push(args); }, warn(...args) { calls.logs.push(args); } },
  });
  return { calls, async deliver() { return worker.deliverVipNotifications(db); } };
}

test("a newly approved applicant receives phone confirmation through their own previously registered account device", async () => {
  const fixture = pushFixture({
    copier: [subscription("own-account-device", ownEndpoint), subscription("foreign-account-device", otherEndpoint, foreignUserId)],
    vip: [subscription("foreign-vip-device", otherEndpoint, foreignUserId)],
  });
  assert.equal((await fixture.deliver()).sent, 1);
  assert.equal(fixture.calls.sends.length, 1);
  assert.equal(fixture.calls.sends[0].subscription.endpoint, ownEndpoint);
  assert.equal(fixture.calls.sends[0].payload.url, "/dashboard/vip");
  assert.equal(fixture.calls.sends[0].payload.tag, eventKey);
  assert.match(fixture.calls.sends[0].payload.title, /VIP/);
});

test("own VIP and account devices are unioned and shared endpoints receive exactly one confirmation", async () => {
  const fixture = pushFixture({
    vip: [subscription("vip-1", ownEndpoint)],
    copier: [subscription("copier-same", ownEndpoint), subscription("copier-other", otherEndpoint)],
  });
  assert.equal((await fixture.deliver()).sent, 1);
  assert.deepEqual(fixture.calls.sends.map(call => call.subscription.endpoint).sort(), [ownEndpoint, otherEndpoint].sort());
});

test("revoked access, missing confirmations and invalid confirmation recipients remain silent", async () => {
  for (const options of [
    { member: activeMember({ status: "suspended" }) }, { member: null },
    { confirmationMissing: true },
    { events: [{ ...event({ event_key: `vip:access:${confirmationId}:${foreignUserId}` }), kind: "access_confirmation", href: "/dashboard/vip" }] },
  ]) {
    const fixture = pushFixture({ ...options, copier: [subscription("own", ownEndpoint)] });
    const result = await fixture.deliver();
    assert.equal(result.sent, 0);
    assert.equal(result.skipped, 1);
    assert.equal(fixture.calls.sends.length, 0);
  }
});

test("invalid push endpoints or key material never reach the native provider", async () => {
  for (const item of [subscription("invalid-endpoint", "https://127.0.0.1/fixture"), subscription("invalid-key", ownEndpoint, userId, { p256dh: "invalid", auth: "invalid" })]) {
    const fixture = pushFixture({ copier: [item] });
    assert.equal((await fixture.deliver()).sent, 0);
    assert.equal(fixture.calls.sends.length, 0);
  }
  const fallback = pushFixture({ vip: [subscription("bad-vip", ownEndpoint, userId, { p256dh: "invalid", auth: "invalid" })], copier: [subscription("valid-account", ownEndpoint)] });
  assert.equal((await fallback.deliver()).sent, 1, "a malformed VIP row cannot mask the same valid own account device");
  assert.equal(fallback.calls.sends.length, 1);
});

test("expired shared endpoints are removed from both own subscription sources with owner guards", async () => {
  const fixture = pushFixture({ vip: [subscription("vip-old", ownEndpoint)], copier: [subscription("account-old", ownEndpoint)], pushStatus: 410 });
  assert.equal((await fixture.deliver()).failed, 1);
  assert.equal(fixture.calls.sends.length, 1);
  assert.deepEqual(fixture.calls.deleted.map(item => [item.table, item.filters.id]).sort(), [["vip_push_subscriptions", "vip-old"], ["copier_push_subscriptions", "account-old"]].sort());
  assert.doesNotMatch(JSON.stringify([fixture.calls.finished, fixture.calls.logs]), new RegExp(secret));
});

test("no device is skipped rather than falsely sent and unavailable push cannot prevent independent email delivery", async () => {
  const noDevice = pushFixture();
  const result = await noDevice.deliver();
  assert.equal(result.skipped, 1);
  assert.equal(noDevice.calls.sends.length, 0);
  const push = pushFixture({ env: { VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "" } });
  assert.equal((await push.deliver()).unavailable, true);
  assert.equal(push.calls.claims.length, 0);
  assert.equal((await emailFixture().deliver()).sent, 1);
});

test("device and membership lookups fail closed with only coarse tracking errors", async () => {
  for (const options of [{ memberError: true }, { confirmationError: true }, { subscriptionError: "copier_push_subscriptions" }]) {
    const fixture = pushFixture({ ...options, vip: [subscription("valid", ownEndpoint)] });
    const result = await fixture.deliver();
    assert.equal(result.failed, 1);
    assert.equal(fixture.calls.sends.length, 0);
    assert.equal(fixture.calls.finished[0].patch.status, "failed");
    assert.doesNotMatch(JSON.stringify([result, fixture.calls.finished, fixture.calls.logs]), new RegExp(secret));
  }
});

function approvalRouteFixture(file, options = {}) {
  const deferred = [];
  const calls = { auth: 0, rpc: [], email: 0, push: 0, adminActivity: 0, logs: [] };
  const db = {
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      return { data: activeMember(), error: options.rpcError ? { message: secret } : null };
    },
    from(table) {
      assert.equal(table, "vip_access_requests");
      const filters = new Map();
      const chain = {
        select() { return chain; }, eq(key, value) { filters.set(key, value); return chain; },
        async maybeSingle() {
          assert.equal(filters.get("id"), confirmationId);
          return { data: { id: confirmationId, request_kind: options.requestKind ?? "existing", type: "affiliation", copy_requested: false, status: "pending" }, error: null };
        },
      };
      return chain;
    },
  };
  const authenticate = async () => {
    calls.auth++;
    return options.unauthorized ? { error: "Accès refusé.", status: 403 } : { admin: db, db, user: { id: userId, email: "verified-client@example.test", email_confirmed_at: options.unconfirmed ? null : "2020-01-01" } };
  };
  const route = compile(file, {
    "next/server": { after(callback) { deferred.push(callback); } },
    "@/lib/admin/permissions": { authenticateAdmin: authenticate },
    "@/lib/vip/access-requests": accessRequests,
    "@/lib/vip/identity": identity,
    "@/lib/vip/membership": membership,
    "@/lib/vip/membership-server": {
      authenticateVip: authenticate,
      async readVipJson(request) { return request.json(); },
      vipJson(body, status = 200) { return Response.json(body, { status }); },
      vipErrorResponse() { return Response.json({ error: "Traitement indisponible." }, { status: 500 }); },
      hashVipInvitationCode() { return "fixture-code-hash"; },
    },
    "@/lib/vip/access-confirmations": { async deliverVipAccessConfirmations(client) { assert.equal(client, db); calls.email++; if (options.emailError) throw new Error(secret); } },
    "@/lib/vip/notifications": { async deliverVipNotifications(client) { assert.equal(client, db); calls.push++; if (options.pushError) throw new Error(secret); } },
    "@/lib/vip/admin-activity": { async queueVipAdminActivity(client) { assert.equal(client, db); calls.adminActivity++; } },
  }, {
    process: { env: { VERCEL_ENV: options.environment ?? "production" } },
    console: { error(...args) { calls.logs.push(args); } },
  });
  return {
    calls, deferred,
    async post(body) {
      return route.POST(new Request("https://investprotrading.fr/api/offline-fixture", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://investprotrading.fr" }, body: JSON.stringify(body) }));
    },
    async flush() { for (const callback of deferred) await callback(); },
  };
}
const approvalBody = {
  id: confirmationId, action: "approve", firstName: "Membre", lastName: "Fixture", type: "affiliation", affiliationBroker: "axi",
  brokerLinkedVerified: true, verifiedDepositUsd: 300,
};

test("existing-member and new-client approval routes schedule both channels after the successful authoritative RPC", async () => {
  for (const requestKind of ["existing", "new"]) {
    const fixture = approvalRouteFixture("app/api/admin/vip/requests/route.ts", { requestKind, emailError: true });
    const response = await fixture.post(approvalBody);
    assert.equal(response.status, 200);
    assert.equal(fixture.calls.rpc[0].name, requestKind === "new" ? "vip_review_access_request_checked" : "vip_review_access_request");
    assert.equal(fixture.calls.email, 0, "provider work is deferred until after the response");
    await fixture.flush();
    assert.equal(fixture.calls.email, 1);
    assert.equal(fixture.calls.push, 1, "email failure cannot suppress phone delivery");
    assert.equal(fixture.calls.adminActivity, 1);
    assert.doesNotMatch(JSON.stringify(fixture.calls.logs), new RegExp(secret));
  }
});

test("failed or unauthorized approval and preview mutations never schedule client confirmations", async () => {
  for (const options of [{ rpcError: true }, { unauthorized: true }, { environment: "preview" }]) {
    const fixture = approvalRouteFixture("app/api/admin/vip/requests/route.ts", options);
    assert.ok((await fixture.post(approvalBody)).status >= 400);
    assert.equal(fixture.deferred.length, 0);
    await fixture.flush();
    assert.equal(fixture.calls.email + fixture.calls.push, 0);
  }
});

test("redeeming a valid invitation and admin renew/resume actions also defer both delivery workers", async () => {
  const redeem = approvalRouteFixture("app/api/vip/redeem/route.ts", { pushError: true });
  assert.equal((await redeem.post({ code: "IP-AFF-" + "A".repeat(48) })).status, 200);
  assert.equal(redeem.calls.rpc[0].name, "vip_redeem_invitation");
  await redeem.flush();
  assert.equal(redeem.calls.email, 1, "push failure cannot suppress email delivery");
  assert.equal(redeem.calls.push, 1);
  assert.doesNotMatch(JSON.stringify(redeem.calls.logs), new RegExp(secret));
  for (const action of ["renew", "resume"]) {
    const fixture = approvalRouteFixture("app/api/admin/vip/members/route.ts");
    assert.equal((await fixture.post({ action, userId })).status, 200);
    assert.equal(fixture.calls.rpc[0].name, "vip_admin_membership_action");
    await fixture.flush();
    assert.equal(fixture.calls.email, 1);
    assert.equal(fixture.calls.push, 1);
  }
});
