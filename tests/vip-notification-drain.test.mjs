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
const notices = compile("lib/vip/publication-notice.ts");

async function run({ count = 65, preview = false, exhaustBudget = false, failTracking = false, published = true, publicationError = false, invalidEvent = false, mismatchedRecipient = false, withdrawAfterSubscription = false, inactive = false, kind = "publication" } = {}) {
  const fixtureId = (index, suffix) => `${(index + 1).toString(16).padStart(8, "0")}-0000-4000-8000-${suffix}`;
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const queue = Array.from({ length: count }, (_, index) => {
    const user_id = fixtureId(index, "000000000001"), postId = fixtureId(index, "000000000002");
    return { id: "notice-" + index, user_id, kind, title: "Test", message: "Generic", event_key: invalidEvent ? "invalid" : kind === "renewal" ? `vip:renewal:${user_id}:${expiry}:j3` : `vip:post:${postId}:${mismatchedRecipient ? fixtureId(index, "000000000099") : user_id}` };
  });
  let now = 0, sends = 0, inFlight = 0, peak = 0, claims = 0, publicationReads = 0;
  const completed = [], payloads = [], subscribed = new Set(), checked = new Set();
  const db = {
    async rpc(name, args) { assert.equal(name, "vip_claim_notifications"); assert.equal(args.p_limit, 20); claims++; return { data: queue.splice(0, args.p_limit), error: null }; },
    from(table) {
      const filters = new Map();
      const chain = {
        select() { return chain; }, eq(key, value) { filters.set(key, value); return chain; },
        async maybeSingle() {
          if (table === "vip_posts") {
            publicationReads++; const postId = filters.get("id"), userId = postId.replace(/000000000002$/, "000000000001");
            assert.equal(filters.get("published"), true); assert(subscribed.has(userId), "publication visibility is rechecked after subscription lookup and immediately before push"); checked.add(postId);
            return { data: published ? { id: postId, category: "signal", title: "Nouveau signal", body: "Actif : XAUUSD\nDirection : SELL\nEntrée : 2670–2672\nStop Loss : 2680\nTP1 : 2660\nTP2 : 2650\nTP3 : OPEN" } : null, error: publicationError ? new Error("fixture publication lookup failure") : null };
          }
          assert.equal(table, "vip_memberships"); return { data: { type: kind === "renewal" ? "abonnement" : "affiliation", status: inactive ? "suspended" : "active", started_at: "2020-01-01T00:00:00Z", expires_at: kind === "renewal" ? expiry : null }, error: null };
        },
        async limit() { assert.equal(table, "vip_push_subscriptions"); subscribed.add(filters.get("user_id")); if (withdrawAfterSubscription) published = false; return { data: [{ id: "subscription", endpoint: "https://fcm.googleapis.com/test", p256dh: "fixture", auth: "fixture" }], error: null }; },
        update(value) { assert.equal(table, "vip_notification_outbox"); completed.push(value); const shouldFail = failTracking && completed.length === 1; return { eq() { return this; }, then(resolve) { resolve({ error: shouldFail ? new Error("fixture tracking failure") : null }); } }; },
      };
      return chain;
    },
  };
  const worker = compile("lib/vip/notifications.ts", {
    "server-only": {}, "./membership": membership, "./push-validation": validation, "./publication-notice": notices,
    "web-push": { setVapidDetails() {}, async sendNotification(_subscription, payload) {
      if (kind === "publication") { const postId = JSON.parse(payload).tag.split(":")[2]; assert(checked.has(postId)); assert(published); }
      payloads.push(JSON.parse(payload));
      sends++; inFlight++; peak = Math.max(peak, inFlight);
      await Promise.resolve(); inFlight--;
      if (exhaustBudget) now = 251000;
    } },
  }, { process: { env: { VERCEL_ENV: preview ? "preview" : "production", VAPID_PUBLIC_KEY: "fixture-public", VAPID_PRIVATE_KEY: "fixture-private", VAPID_SUBJECT: "mailto:test@example.invalid" } }, performance: { now: () => now } });
  let result, error;
  try { result = await worker.deliverVipNotifications(db); } catch (caught) { error = caught; }
  return { result, error, remainingRows: queue.length, sends, peak, claims, completed: completed.length, finished: completed, publicationReads, payloads };
}

(async () => {
  const drained = await run();
  assert.equal(drained.error, undefined);
  assert.equal(drained.result.sent, 65);
  assert.equal(drained.result.remaining, false);
  assert.equal(drained.remainingRows, 0);
  assert.equal(drained.claims, 5);
  assert.ok(drained.peak <= 10);
  assert(drained.payloads.every(payload => payload.title === "Nouveau signal · XAUUSD" && payload.body === "SELL · Entrée : 2670–2672 · SL : 2680 · TP1 : 2660 · TP2 : 2650 · TP3 : OPEN" && payload.url === "/dashboard/vip"));

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

  for (const settings of [{ published: false }, { withdrawAfterSubscription: true }]) {
    const withdrawn = await run(settings);
    assert.equal(withdrawn.error, undefined); assert.equal(withdrawn.sends, 0); assert.equal(withdrawn.result.skipped, 65); assert.equal(withdrawn.completed, 65); assert.equal(withdrawn.remainingRows, 0);
    assert(withdrawn.finished.every(row => row.status === "skipped" && row.last_error === "publication_unpublished"));
  }
  const unavailable = await run({ count: 3, publicationError: true });
  assert.equal(unavailable.sends, 0); assert.equal(unavailable.result.failed, 3); assert.equal(unavailable.completed, 3); assert(unavailable.finished.every(row => row.last_error === "publication_lookup_failed"));
  for (const settings of [{ invalidEvent: true }, { mismatchedRecipient: true }]) {
    const invalid = await run({ count: 3, ...settings });
    assert.equal(invalid.sends, 0); assert.equal(invalid.result.skipped, 3); assert.equal(invalid.publicationReads, 0); assert(invalid.finished.every(row => row.last_error === "invalid_publication_event"));
  }
  const renewal = await run({ count: 3, kind: "renewal", published: false });
  assert.equal(renewal.sends, 3); assert.equal(renewal.result.sent, 3); assert.equal(renewal.publicationReads, 0, "renewal delivery does not depend on any publication");
  assert(renewal.payloads.every(payload => payload.title === "Test" && payload.body === "Generic"), "renewal text is unchanged");
  const inactive = await run({ count: 3, inactive: true });
  assert.equal(inactive.sends, 0); assert.equal(inactive.publicationReads, 0); assert(inactive.finished.every(row => row.last_error === "membership_inactive"));
  console.log("VIP worker tests passed: drains 65, concurrency10, budget/claimed-row guarantees, preview isolation, withdrawal after claim, lookup failure, invalid event/recipient and unchanged renewal delivery. Database and providers stubbed; no outbound calls.");
})().catch(error => { console.error(error); process.exitCode = 1; });
