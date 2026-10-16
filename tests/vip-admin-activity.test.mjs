import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const owner = "11111111-1111-4111-8111-111111111111", staff = "22222222-2222-4222-8222-222222222222", request = "33333333-3333-4333-8333-333333333333";
function compile(file, modules, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { module, exports: module.exports, require: name => { assert(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; }, URL, Buffer, ...globals });
  return module.exports;
}
function helper(ids = [owner], env = "production") {
  return compile("lib/vip/admin-activity.ts", { "server-only": {}, "../admin/permissions": { ownerIds: () => ids } }, { process: { env: { VERCEL_ENV: env } } });
}
function fixture({ events = [{ id: request, event_key: `vip:admin:request:${request}`, kind: "requested", title: "Demande VIP reçue", message: "Affiliation à vérifier." }], reviewers = [{ user_id: staff, permissions: ["users_write"] }, { user_id: owner, permissions: ["users_write"] }], failFeed = false, failPush = false, failStaff = false } = {}) {
  const writes = [], tracked = [], reads = [];
  const db = { from(table) {
    const chain = {
      select() { reads.push(table); return chain; }, is() { return chain; }, order() { return chain; },
      async limit() { return { data: events, error: null }; },
      async eq() { return { data: reviewers, error: failStaff ? new Error("fixture") : null }; },
      async upsert(rows, options) { writes.push({ table, rows, options }); return { error: table === "investpro_notifications" && failFeed || table === "vip_notification_outbox" && failPush ? new Error("fixture") : null }; },
      update(value) { tracked.push(value); return { eq() { return this; }, async is() { return { error: null }; } }; },
    }; return chain;
  } }; return { db, writes, tracked, reads };
}

test("future events fan out only to owner and enabled VIP reviewers, with deduplicated recipients", async () => {
  const f = fixture(), h = helper();
  const result = await h.queueVipAdminActivity(f.db);
  assert.equal(result.queued, 2); assert.equal(f.tracked.length, 1); assert.equal(f.writes.length, 2);
  assert.deepEqual(Array.from(f.writes[0].rows, row => row.user_id), [owner, staff]);
  for (const write of f.writes) {
    assert.equal(write.options.ignoreDuplicates, true); assert.equal(write.options.onConflict, "event_key");
    assert(write.rows.every(row => row.event_key.startsWith(`vip:admin:request:${request}:`) && row.href === "/dashboard/admin?tool=vip&view=requests"));
  }
  assert(f.writes[1].rows.every(row => row.kind === "admin_event"));
});
test("approved activity points directly to member management", async () => {
  const f = fixture({ events: [{ id: request, event_key: `vip:admin:approved:${request}`, kind: "approved", title: "Accès VIP validé", message: "Validation par l’équipe." }] });
  await helper().queueVipAdminActivity(f.db);
  assert(f.writes.every(write => write.rows.every(row => row.href === "/dashboard/admin?tool=vip&view=members")));
});
test("no backfill: empty future-event table never reads requests or writes notices", async () => {
  const f = fixture({ events: [] }); await helper().queueVipAdminActivity(f.db);
  assert.equal(f.writes.length, 0); assert.deepEqual(f.reads, ["vip_admin_activity_events"]);
});
test("preview cannot queue anything", async () => {
  const f = fixture(); const result = await helper([owner], "preview").queueVipAdminActivity(f.db);
  assert.equal(result.preview, true); assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
});
test("no authorized recipient keeps the durable event pending", async () => {
  const f = fixture({ reviewers: [{ user_id: staff, permissions: ["finance"] }] });
  const result = await helper([]).queueVipAdminActivity(f.db);
  assert.equal(result.pending, true); assert.equal(f.tracked.length, 0); assert.equal(f.writes.length, 0);
});
test("a failed feed, push or staff lookup keeps events retryable", async () => {
  for (const failure of [{ failFeed: true }, { failPush: true }, { failStaff: true }]) {
    const f = fixture(failure); await assert.rejects(helper().queueVipAdminActivity(f.db)); assert.equal(f.tracked.length, 0);
  }
});
test("activity links reject foreign recipients, unrecognized events and unsafe destinations", () => {
  const { vipAdminActivityHref: href } = helper();
  const event = `vip:admin:request:${request}:${owner}`, destination = "/dashboard/admin?tool=vip&view=requests";
  assert.equal(href(event, owner, destination), destination);
  for (const bad of ["https://evil.test", "//evil.test", "/dashboard/vip", "/dashboard/admin?tool=vip&view=requests&next=evil", "/dashboard/admin?tool=finance"]) assert.equal(href(event, owner, bad), null);
  assert.equal(href(event, staff, destination), null);
  assert.equal(href(`vip:admin:madeup:${request}:${owner}`, owner, destination), null);
});

async function delivery({ permitted = true, permissionError = false, destination = "/dashboard/admin?tool=vip&view=requests", eventKey = `vip:admin:request:${request}:${owner}` } = {}) {
  let claimed = false; const sent = [], finished = [], tables = [];
  const db = { async rpc() { const rows = claimed ? [] : [{ id: request, user_id: owner, kind: "admin_event", title: "Demande VIP reçue", message: "Paiement à vérifier.", event_key: eventKey, href: destination }]; claimed = true; return { data: rows, error: null }; }, from(table) {
    tables.push(table); const chain = { select() { return chain; }, eq() { return chain; }, async limit() { return { data: [{ endpoint: "https://fcm.googleapis.com/fixture", p256dh: "fixture", auth: "fixture" }], error: null }; }, update(value) { finished.push(value); return { eq() { return this; }, then(resolve) { resolve({ error: null }); } }; } }; return chain;
  } };
  const worker = compile("lib/vip/notifications.ts", {
    "server-only": {}, "./membership": {}, "./push-validation": { validPushEndpoint: () => true }, "./publication-notice": {}, "./admin-activity": helper(),
    "../admin/permissions": { canAdmin: async (id, permission) => { assert.equal(id, owner); assert.equal(permission, "users_write"); if (permissionError) throw new Error("fixture"); return permitted; } },
    "web-push": { setVapidDetails() {}, async sendNotification(_subscription, payload) { sent.push(JSON.parse(payload)); } },
  }, { process: { env: { VERCEL_ENV: "production", VAPID_PUBLIC_KEY: "fixture", VAPID_PRIVATE_KEY: "fixture", VAPID_SUBJECT: "mailto:fixture@example.invalid" } }, performance: { now: () => 0 } });
  return { result: await worker.deliverVipNotifications(db), sent, finished, tables };
}
test("admin push reaches admin destination without requiring a VIP member subscription", async () => {
  const f = await delivery(); assert.equal(f.result.sent, 1); assert.equal(f.sent[0].url, "/dashboard/admin?tool=vip&view=requests"); assert(!f.tables.includes("vip_memberships"));
});
test("revoked admin rights suppress push at delivery time", async () => {
  const f = await delivery({ permitted: false }); assert.equal(f.sent.length, 0); assert.equal(f.finished[0].last_error, "admin_permission_revoked");
});
test("permission lookup failures remain retryable and unsafe links never send", async () => {
  const unavailable = await delivery({ permissionError: true }); assert.equal(unavailable.result.failed, 1); assert.equal(unavailable.sent.length, 0);
  for (const options of [{ destination: "https://evil.test" }, { eventKey: `vip:admin:request:${request}:${staff}` }]) {
    const f = await delivery(options); assert.equal(f.sent.length, 0); assert.equal(f.finished[0].last_error, "invalid_admin_event");
  }
});
