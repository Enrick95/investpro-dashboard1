import assert from "node:assert/strict";
import { createECDH, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// The actual completion worker executes against owner-filtering offline fixtures.
// No real Supabase instance, message provider, credentials or device is touched.
const root = path.resolve(import.meta.dirname, "..");
const userId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const providerId = "44444444-4444-4444-8444-444444444444";
const foreignId = "99999999-9999-4999-8999-999999999999";
const secret = "PRIVATE_DATABASE_OR_PROVIDER_DETAIL";
const ownEndpoint = "https://fcm.googleapis.com/fcm/send/completion-own-fixture";
const otherEndpoint = "https://web.push.apple.com/completion-other-fixture";
const plain = value => JSON.parse(JSON.stringify(value));

function compile(file, modules = {}, globals = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, Buffer, URL, Request, Response, Headers, AbortController, AbortSignal, TextEncoder, TextDecoder, Uint8Array, Date, Error,
    require(name) { assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; }, ...globals });
  return module.exports;
}
const membership = compile("lib/vip/membership.ts");
const validation = compile("lib/vip/push-validation.ts");
const curve = createECDH("prime256v1"); curve.generateKeys();
const fixtureId = value => { const hex = createHash("sha256").update(value).digest("hex"); return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`; };
const subscription = (id, endpoint = ownEndpoint, owner = userId, overrides = {}) => ({ id: fixtureId(id), user_id: owner, endpoint, p256dh: curve.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url"), ...overrides });
function completion(overrides = {}) {
  const row = { id: eventId, user_id: userId, request_id: requestId, revision: 1, kind: "needs_info", title: "Votre dossier VIP est à compléter", message: "Merci de compléter votre numéro de compte broker.", href: "/vip/rejoindre", created_at: new Date(Date.now() - 60000).toISOString(), email_status: "processing", email_attempts: 1, push_status: "processing", push_attempts: 1, ...overrides };
  row.event_key ??= `vip:completion:${row.kind}:${row.request_id}:${row.revision}:${row.user_id}`;
  return row;
}
function fixture(options = {}) {
  const rows = options.events ?? [completion()];
  const claimedIds = new Set(rows.map(row => row.id)), claimedOwners = new Set(rows.map(row => row.user_id));
  const queues = { email: structuredClone(rows), push: structuredClone(rows) };
  const calls = { claims: [], lookup: [], auth: [], email: [], push: [], finished: [], deleted: [], logs: [], timers: [], deadlines: [], vapid: [] };
  const subscriptions = { vip_push_subscriptions: options.vip ?? [], copier_push_subscriptions: options.copier ?? [subscription("own-account")] };
  const request = options.request === null ? null : { id: requestId, user_id: userId, status: "pending", revision: 1, request_kind: "new", type: "affiliation", completion_fields: ["brokerAccountId"], completion_submitted_at: null, ...options.request };
  const db = {
    async rpc(name, args) { calls.claims.push({ name, args: plain(args) }); assert.equal(name, "vip_claim_request_completion_notifications"); assert.ok(["email", "push"].includes(args.p_channel)); return { data: queues[args.p_channel].splice(0, args.p_limit), error: options.claimError === args.p_channel ? { message: secret } : null }; },
    auth: { admin: { async getUserById(uid) { calls.auth.push(uid); return { data: { user: options.authUser === null ? null : options.authUser ?? { id: uid, email: "confirmed@example.test", email_confirmed_at: "2020-01-01T00:00:00Z", user_metadata: { email: "attacker@example.test" } } }, error: options.authError ? { message: secret } : null }; } } },
    from(table) {
      const filters = new Map(); let action = "read", patch, max;
      function result() {
        const filter = Object.fromEntries(filters); calls.lookup.push({ table, filters: filter, action, max });
        if (action === "update") {
          assert.equal(table, "vip_request_completion_events"); calls.finished.push({ filters: filter, patch: plain(patch) });
          assert.ok(claimedIds.has(filter.id)); const channel = Object.hasOwn(patch, "email_status") ? "email" : "push";
          assert.equal(filter[`${channel}_status`], "processing"); assert.ok(Number.isInteger(filter[`${channel}_attempts`]), "finishing a lease must compare its claimed attempt");
          return { data: options.trackingMissing === channel ? null : { id: filter.id }, error: options.trackingError === channel ? { message: secret } : null };
        }
        if (action === "delete") { assert.ok(table.endsWith("push_subscriptions")); assert.equal(filter.user_id, userId); calls.deleted.push({ table, filters: filter }); return { data: null, error: options.deleteError ? { message: secret } : null }; }
        if (table === "vip_access_requests") {
          assert.ok(rows.some(row => row.request_id === filter.id && row.user_id === filter.user_id));
          const candidate = options.requests ? options.requests.find(row => row.id === filter.id) : request;
          const matching = candidate && [...filters].every(([field, value]) => candidate[field] === value);
          return { data: matching ? structuredClone(candidate) : null, error: options.requestError ? { message: secret } : null };
        }
        if (table === "vip_memberships") { assert.ok(claimedOwners.has(filter.user_id)); return { data: options.member ?? null, error: options.memberError ? { message: secret } : null }; }
        assert.ok(Object.hasOwn(subscriptions, table), `Unexpected table ${table}`); assert.ok(claimedOwners.has(filter.user_id));
        return { data: subscriptions[table].filter(row => row.user_id === filter.user_id).slice(0, max ?? Infinity), error: options.subscriptionError === table ? { message: secret } : null };
      }
      const chain = { select() { return chain; }, eq(key, value) { filters.set(key, value); return chain; }, limit(value) { max = value; return chain; }, update(value) { action = "update"; patch = value; return chain; }, delete() { action = "delete"; return chain; },
        async maybeSingle() { return result(); }, then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); } }; return chain;
    },
  };
  const env = { VERCEL_ENV: "production", RESEND_API_KEY: "re_offline-fixture", INVESTPRO_EMAIL_FROM: "InvestPro <notifications@investprotrading.fr>", ...options.env };
  const pushConfig = { available: options.pushConfigured !== false, publicKey: "offline-public", privateKey: "offline-private", subject: "mailto:offline@example.test" };
  const worker = compile("lib/vip/request-completion-notifications.ts", {
    "server-only": {}, "./membership": membership, "./push-validation": validation, "./notifications": { vipPushConfig: () => pushConfig },
    "web-push": { setVapidDetails(...args) { calls.vapid.push(args); }, async sendNotification(native, rawPayload, settings) { calls.push.push({ native: plain(native), payload: JSON.parse(rawPayload), settings: plain(settings) }); const code = options.pushStatus?.[native.endpoint] ?? options.pushFailure; if (code) throw { statusCode: code, body: secret }; } },
  }, {
    process: { env }, performance: { now: () => 0 }, console: { error(...args) { calls.logs.push(args); }, warn(...args) { calls.logs.push(args); } },
    setTimeout(callback, delay) { calls.timers.push(delay); queueMicrotask(callback); return 1; }, clearTimeout() {},
    AbortSignal: { timeout(delay) { calls.deadlines.push(delay); const controller = new AbortController(); if (options.emailTimeout) queueMicrotask(() => controller.abort()); return controller.signal; } },
    async fetch(url, init) {
      calls.email.push({ url, payload: JSON.parse(init.body), headers: Object.fromEntries(new Headers(init.headers)), signal: init.signal });
      if (options.emailTimeout) { if (init.signal.aborted) throw Error(secret); await new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Error(secret)), { once: true })); }
      if (options.emailFailure) throw Error(secret);
      return new Response(options.providerRaw ?? JSON.stringify(options.providerBody ?? { id: providerId }), { status: options.emailStatus ?? 200, headers: { "Content-Type": "application/json" } });
    },
  });
  return { calls, async deliver() { return worker.deliverVipRequestCompletionNotifications(db); } };
}

test("completion notifications are production-only and independently skip unavailable channels", async () => {
  for (const environment of ["preview", "development", undefined]) { const f = fixture({ env: { VERCEL_ENV: environment } }); await f.deliver(); assert.equal(f.calls.claims.length + f.calls.email.length + f.calls.push.length, 0); }
  for (const env of [{ RESEND_API_KEY: "" }, { INVESTPRO_EMAIL_FROM: "" }]) { const noEmail = fixture({ env }); await noEmail.deliver(); assert.equal(noEmail.calls.email.length, 0); assert.equal(noEmail.calls.push.length, 1); assert.ok(noEmail.calls.claims.every(call => call.args.p_channel === "push")); }
  const noPush = fixture({ pushConfigured: false }); await noPush.deliver(); assert.equal(noPush.calls.email.length, 1); assert.equal(noPush.calls.push.length, 0); assert.ok(noPush.calls.claims.every(call => call.args.p_channel === "email"));
});

test("a current checklist reaches the verified confirmed recipient with stable idempotency and escaped branded content", async () => {
  const event = completion({ title: "Compléter <script>x</script>", message: 'Numéro broker <img src=x onerror="x">\nLien officiel uniquement', email: "attacker@example.test" });
  const f = fixture({ events: [event] }); await f.deliver(); assert.equal(f.calls.email.length, 1); assert.equal(f.calls.push.length, 1);
  assert.deepEqual(f.calls.claims.map(call => [call.args.p_channel, call.args.p_limit]).sort(), [["email", 10], ["push", 10]]);
  const send = f.calls.email[0]; assert.equal(send.url, "https://api.resend.com/emails"); assert.deepEqual([].concat(send.payload.to), ["confirmed@example.test"]); assert.equal(send.headers["idempotency-key"], event.event_key);
  assert.match(send.payload.html, /https:\/\/investprotrading\.fr\/vip\/rejoindre/); assert.match(send.payload.html, /&lt;script&gt;x&lt;\/script&gt;/); assert.match(send.payload.html, /&lt;img/); assert.doesNotMatch(send.payload.html, /<script|<img|attacker@example/);
  assert.ok(f.calls.deadlines.every(ms => ms > 0 && ms <= 8000)); assert.ok(f.calls.finished.every(done => Object.values(done.patch).includes("sent")));
});

test("existing members' checklist CTA and submitted receipt use their fixed own request destination", async () => {
  for (const kind of ["needs_info", "submitted"]) {
    const submitted = kind === "submitted"; const f = fixture({ events: [completion({ kind, revision: submitted ? 2 : 1, href: "/vip/deja-membre" })], request: { request_kind: "existing", revision: submitted ? 2 : 1, completion_fields: submitted ? [] : ["firstName"], completion_submitted_at: submitted ? new Date().toISOString() : null } });
    await f.deliver(); assert.equal(f.calls.email.length, 1); assert.equal(f.calls.push.length, 1); assert.match(f.calls.email[0].payload.html, /https:\/\/investprotrading\.fr\/vip\/deja-membre/); assert.equal(f.calls.push[0].payload.url, "/vip/deja-membre");
  }
});

test("approved, denied, missing, foreign and superseded requests never send misleading checklist notices", async () => {
  for (const request of [null, { status: "approved" }, { status: "denied" }, { user_id: foreignId }, { revision: 2 }, { completion_fields: [] }]) {
    const f = fixture({ request }); await f.deliver(); assert.equal(f.calls.email.length + f.calls.push.length, 0); assert.ok(f.calls.finished.every(done => Object.values(done.patch).includes("skipped")));
  }
  const oldReceipt = fixture({ events: [completion({ kind: "submitted", revision: 2 })], request: { revision: 2, completion_fields: ["brokerAccountId"], completion_submitted_at: new Date().toISOString() } }); await oldReceipt.deliver(); assert.equal(oldReceipt.calls.email.length + oldReceipt.calls.push.length, 0);
});

test("an access grant superseding a still-pending request suppresses both old completion channels", async () => {
  const granted = fixture({ member: { user_id: userId } }); await granted.deliver(); assert.equal(granted.calls.email.length + granted.calls.push.length + granted.calls.auth.length, 0); assert.ok(granted.calls.finished.every(done => done.patch.email_status === "skipped" || done.patch.push_status === "skipped"));
  const lookupFailure = fixture({ memberError: true }); await lookupFailure.deliver(); assert.equal(lookupFailure.calls.email.length + lookupFailure.calls.push.length, 0); assert.ok(lookupFailure.calls.finished.every(done => done.patch.email_last_error === "membership_lookup_failed" || done.patch.push_last_error === "membership_lookup_failed"));
});

test("forged event identity, request links and malformed/stale claims fail before delivery", async () => {
  for (const change of [{ event_key: "forged" }, { event_key: `vip:completion:needs_info:${requestId}:1:${foreignId}` }, { id: "bad" }, { revision: 0 }, { kind: "unknown" }, { href: "https://attacker.invalid" }, { href: "/vip/deja-membre" }, { created_at: new Date(Date.now() - 25 * 3600000).toISOString() }, { email_attempts: 0, push_attempts: 0 }]) {
    const f = fixture({ events: [completion(change)] }); try { await f.deliver(); } catch (error) { assert.doesNotMatch(error.message, new RegExp(secret)); }
    assert.equal(f.calls.email.length + f.calls.push.length, 0);
  }
});

test("unconfirmed, anonymous, missing and mismatched Auth recipients cannot receive emails", async () => {
  for (const authUser of [null, { id: foreignId, email: "foreign@example.test", email_confirmed_at: "2020-01-01" }, { id: userId, email: "unconfirmed@example.test", email_confirmed_at: null }, { id: userId, email: "anonymous@example.test", email_confirmed_at: "2020-01-01", is_anonymous: true }, { id: userId, email: "x\r\nbcc:y@example.test", email_confirmed_at: "2020-01-01" }]) {
    const f = fixture({ authUser }); await f.deliver(); assert.equal(f.calls.email.length, 0);
  }
});

test("push uses own account and VIP subscriptions once per endpoint with a generic private notification", async () => {
  const f = fixture({ vip: [subscription("vip-same")], copier: [subscription("account-same"), subscription("account-other", otherEndpoint), subscription("foreign", "https://fcm.googleapis.com/fcm/send/foreign", foreignId)], events: [completion({ message: "PRIVATE_BROKER_ACCOUNT_12345" })] });
  await f.deliver(); assert.equal(f.calls.push.length, 2); assert.deepEqual(f.calls.push.map(call => call.native.endpoint).sort(), [ownEndpoint, otherEndpoint].sort());
  assert.ok(f.calls.push.every(call => call.payload.url === "/vip/rejoindre" && call.payload.tag === completion().event_key && call.settings.timeout <= 8000));
  assert.doesNotMatch(JSON.stringify(f.calls.push.map(call => call.payload)), /PRIVATE_BROKER_ACCOUNT_12345|confirmed@example|user_id|request_id/);
});

test("invalid endpoint/key rows and no-device cases never claim a successful push", async () => {
  for (const copier of [[], [subscription("bad-endpoint", "https://127.0.0.1/test")], [subscription("bad-keys", ownEndpoint, userId, { p256dh: "bad", auth: "bad" })]]) {
    const f = fixture({ copier }); await f.deliver(); assert.equal(f.calls.push.length, 0); assert.equal(f.calls.email.length, 1);
    assert.ok(f.calls.finished.filter(done => Object.hasOwn(done.patch, "push_status")).every(done => done.patch.push_status === "skipped"));
  }
});

test("expired endpoints are pruned only from both matching own sources", async () => {
  for (const code of [404, 410]) {
    const f = fixture({ vip: [subscription("vip-old")], copier: [subscription("account-old"), subscription("foreign-old", otherEndpoint, foreignId)], pushFailure: code }); await f.deliver();
    assert.equal(f.calls.push.length, 1); assert.deepEqual(f.calls.deleted.map(call => [call.table, call.filters.id]).sort(), [["copier_push_subscriptions", fixtureId("account-old")], ["vip_push_subscriptions", fixtureId("vip-old")]].sort()); assert.ok(f.calls.deleted.every(call => call.filters.user_id === userId));
    assert.equal(f.calls.email.length, 1); assert.doesNotMatch(JSON.stringify([f.calls.finished, f.calls.logs]), new RegExp(secret));
  }
});

test("email provider errors/timeouts stay retryable without blocking push and retain safe tracking", async () => {
  for (const options of [{ emailStatus: 429 }, { emailStatus: 500 }, { emailFailure: true }, { emailTimeout: true }, { providerRaw: "invalid-json" }, { providerBody: { id: "invalid-provider-id" } }]) {
    const f = fixture(options); await f.deliver(); assert.equal(f.calls.email.length, 1); assert.equal(f.calls.push.length, 1);
    const finish = f.calls.finished.find(done => Object.hasOwn(done.patch, "email_status")); assert.equal(finish.patch.email_status, "failed"); assert.ok(Number.isFinite(Date.parse(finish.patch.email_next_attempt_at))); assert.doesNotMatch(JSON.stringify([f.calls.finished, f.calls.logs]), new RegExp(secret));
  }
});

test("push failure and lookup failure do not suppress independent email delivery", async () => {
  for (const options of [{ pushFailure: 500 }, { subscriptionError: "copier_push_subscriptions" }]) {
    const f = fixture(options); await f.deliver(); assert.equal(f.calls.email.length, 1); assert.equal(f.calls.finished.find(done => Object.hasOwn(done.patch, "email_status")).patch.email_status, "sent"); assert.equal(f.calls.finished.find(done => Object.hasOwn(done.patch, "push_status")).patch.push_status, "failed");
  }
  for (const options of [{ requestError: true }, { authError: true }]) { const f = fixture(options); await f.deliver(); assert.equal(f.calls.email.length, 0); assert.doesNotMatch(JSON.stringify([f.calls.finished, f.calls.logs]), new RegExp(secret)); }
});

test("partial device delivery stays retryable with a stable replacing device tag and no immediate retry", async () => {
  const f = fixture({ copier: [subscription("own-one"), subscription("own-two", otherEndpoint)], pushStatus: { [ownEndpoint]: 500 } }); await f.deliver(); assert.equal(f.calls.push.length, 2); assert.equal(f.calls.finished.find(done => Object.hasOwn(done.patch, "push_status")).patch.push_status, "failed"); assert.ok(f.calls.push.every(call => call.payload.tag === completion().event_key));
});

test("retries reuse event idempotency, terminal attempts stop and every channel finish uses exact lease CAS", async () => {
  const first = fixture({ emailStatus: 500 }); await first.deliver(); const retry = fixture({ events: [completion({ email_attempts: 2, push_attempts: 2 })] }); await retry.deliver();
  assert.equal(first.calls.email[0].headers["idempotency-key"], retry.calls.email[0].headers["idempotency-key"]); assert.ok(retry.calls.finished.every(done => Object.values(done.filters).includes(2)));
  const last = fixture({ events: [completion({ email_attempts: 4, push_attempts: 4 })], emailStatus: 500, pushFailure: 500 }); await last.deliver(); assert.ok(last.calls.finished.every(done => done.patch.email_next_attempt_at === null || done.patch.push_next_attempt_at === null));
});

test("a failed channel claim or lease finish cannot prevent the other channel from running", async () => {
  for (const channel of ["email", "push"]) {
    const f = fixture({ claimError: channel }); try { await f.deliver(); } catch (error) { assert.doesNotMatch(error.message, new RegExp(secret)); }
    assert.equal(channel === "email" ? f.calls.push.length : f.calls.email.length, 1);
    const tracking = fixture({ trackingMissing: channel }); try { await tracking.deliver(); } catch (error) { assert.doesNotMatch(error.message, new RegExp(secret)); }
    assert.equal(channel === "email" ? tracking.calls.push.length : tracking.calls.email.length, 1);
  }
});

test("device prune and lease tracking failures stay coarse while other channel work completes", async () => {
  const prune = fixture({ pushFailure: 410, deleteError: true }); await prune.deliver(); assert.equal(prune.calls.email.length, 1); assert.equal(prune.calls.finished.find(done => Object.hasOwn(done.patch, "push_status")).patch.push_status, "failed");
  for (const channel of ["email", "push"]) { const f = fixture({ trackingError: channel }); await assert.rejects(f.deliver(), /VIP_COMPLETION_DELIVERY_FAILED/); assert.equal(f.calls.email.length, 1); assert.equal(f.calls.push.length, 1); assert.doesNotMatch(JSON.stringify(f.calls.logs), new RegExp(secret)); }
});

test("a full claimed batch is bounded to ten, paces emails and finishes every independent lease", async () => {
  const events = Array.from({ length: 10 }, (_, index) => completion({ id: fixtureId(`event-${index}`), user_id: fixtureId(`member-${index}`), request_id: fixtureId(`request-${index}`) }));
  const requests = events.map(event => ({ id: event.request_id, user_id: event.user_id, status: "pending", revision: 1, request_kind: "new", completion_fields: ["brokerAccountId"], completion_submitted_at: null }));
  const f = fixture({ events, requests, copier: [] }); const result = await f.deliver();
  assert.equal(f.calls.email.length, 10); assert.equal(f.calls.finished.length, 20); assert.equal(f.calls.claims.length, 2); assert.ok(f.calls.claims.every(call => call.args.p_limit === 10));
  assert.equal(f.calls.timers.length, 9); assert.ok(f.calls.timers.every(ms => ms > 0 && ms <= 650)); assert.equal(result.email.remaining, true); assert.equal(result.push.remaining, true);
  assert.equal(new Set(f.calls.email.map(send => send.headers["idempotency-key"])).size, 10);
});
