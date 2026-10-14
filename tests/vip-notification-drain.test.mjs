import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import ts from "typescript";
const project = path.resolve(import.meta.dirname, "..");


function compile(file, modules = {}, globals = {}) {
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(project, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, { module: compiledModule, exports: compiledModule.exports, require: name => {
    assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name);
    return modules[name];
  }, Buffer, URL, ...globals });
  return compiledModule.exports;
}
const membership = compile("lib/vip/membership.ts");
const validation = compile("lib/vip/push-validation.ts");

async function run({ count = 65, preview = false, exhaustBudget = false, failTracking = false } = {}) {
  const queue = Array.from({ length: count }, (_, index) => ({
    id: "notice-" + index, user_id: "user-" + index, kind: "publication", title: "Test", message: "Generic", event_key: "vip:post:" + index,
  }));
  let now = 0, sends = 0, inFlight = 0, peak = 0, claims = 0;
  const completed = [];
  const db = {
    async rpc(name, args) { assert.equal(name, "vip_claim_notifications"); assert.equal(args.p_limit, 20); claims++; return { data: queue.splice(0, args.p_limit), error: null }; },
    from(table) {
      const chain = {
        select() { return chain; }, eq() { return chain; },
        async maybeSingle() { assert.equal(table, "vip_memberships"); return { data: { type: "affiliation", status: "active", started_at: "2020-01-01T00:00:00Z", expires_at: null }, error: null }; },
        async limit() { assert.equal(table, "vip_push_subscriptions"); return { data: [{ id: "subscription", endpoint: "https://fcm.googleapis.com/test", p256dh: "fixture", auth: "fixture" }], error: null }; },
        update(value) { assert.equal(table, "vip_notification_outbox"); completed.push(value.status); const shouldFail = failTracking && completed.length === 1; return { eq() { return this; }, then(resolve) { resolve({ error: shouldFail ? new Error("fixture tracking failure") : null }); } }; },
      };
      return chain;
    },
  };
  const worker = compile("lib/vip/notifications.ts", {
    "server-only": {}, "./membership": membership, "./push-validation": validation,
    "web-push": { setVapidDetails() {}, async sendNotification() {
      sends++; inFlight++; peak = Math.max(peak, inFlight);
      await Promise.resolve(); inFlight--;
      if (exhaustBudget) now = 251000;
    } },
  }, { process: { env: { VERCEL_ENV: preview ? "preview" : "production", VAPID_PUBLIC_KEY: "fixture-public", VAPID_PRIVATE_KEY: "fixture-private", VAPID_SUBJECT: "mailto:test@example.invalid" } }, performance: { now: () => now } });
  let result, error;
  try { result = await worker.deliverVipNotifications(db); } catch (caught) { error = caught; }
  return { result, error, remainingRows: queue.length, sends, peak, claims, completed: completed.length };
}

(async () => {
  const drained = await run();
  assert.equal(drained.error, undefined);
  assert.equal(drained.result.sent, 65);
  assert.equal(drained.result.remaining, false);
  assert.equal(drained.remainingRows, 0);
  assert.equal(drained.claims, 5);
  assert.ok(drained.peak <= 10);

  const budget = await run({ exhaustBudget: true });
  assert.equal(budget.result.sent, 20);
  assert.equal(budget.completed, 20, "all already-claimed rows finish despite the budget crossing mid-batch");
  assert.equal(budget.result.remaining, true);
  assert.equal(budget.remainingRows, 45);
  assert.equal(budget.claims, 1);

  const preview = await run({ preview: true });
  assert.equal(preview.result.preview, true);
  assert.equal(preview.claims, 0);
  assert.equal(preview.sends, 0);

  const empty = await run({ count: 0 });
  assert.equal(empty.result.remaining, false);
  assert.equal(empty.claims, 1);

  const failure = await run({ failTracking: true });
  assert.ok(failure.error);
  assert.equal(failure.completed, 20, "tracking failure still finishes every row in the claimed batch");
  assert.equal(failure.claims, 1);
  console.log("VIP worker tests passed: drains 65 recipients, concurrency10, budget boundary, empty queue, preview isolation and finishes claimed rows on tracking error. All providers and database access were stubbed; no outbound calls.");
})().catch(error => { console.error(error); process.exitCode = 1; });
