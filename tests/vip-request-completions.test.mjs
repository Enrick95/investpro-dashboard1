import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const uid = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const rid = "33333333-3333-4333-8333-333333333333";
function compile(file, modules = {}, env = {}) {
  const compiled = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module: compiled, exports: compiled.exports, Request, Response, URL, Date, console, process: { env },
    require(name) { assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; },
  });
  return compiled.exports;
}
const identity = compile("lib/vip/identity.ts");
const membership = compile("lib/vip/membership.ts");
const validators = compile("lib/vip/access-requests.ts", { "./identity": identity, "./membership": membership });
const completions = compile("lib/vip/request-completions.ts", { "./access-requests": validators });
const plain = value => JSON.parse(JSON.stringify(value));
const requestRow = changes => ({ id: rid, user_id: uid, email: "member@example.test", first_name: "Marie", last_name: "Martin", telegram_username: "member_1", type: "affiliation", affiliation_broker: "axi", paid_on: null, request_kind: "new", status: "pending", broker_account_kind: "new", broker_account_id: "AXI-123", broker_email: "broker@example.test", declared_deposit_usd: 500, copy_requested: false, revision: 1, completion_fields: ["brokerAccountId", "reply"], completion_note: "Confirmez la référence.", completion_requested_at: "2026-10-18T08:00:00Z", ...changes });

test("checklists depend on the stored access origin and request kind", () => {
  const existing = completions.allowedCompletionFields(requestRow({ request_kind: "existing" }));
  assert.ok(existing.includes("affiliationBroker")); assert.ok(!existing.includes("brokerAccountId"));
  const subscription = completions.allowedCompletionFields(requestRow({ type: "abonnement" }));
  assert.ok(subscription.includes("paidOn")); assert.ok(!subscription.includes("declaredDepositUsd"));
});
test("admin cannot request private credentials, unknown fields, empty checklists or duplicate fields", () => {
  for (const fields of [[], ["password"], ["user_id"], ["status"], ["firstName", "firstName"], ["paidOn"]]) assert.equal(completions.validateCompletionRequest({ fields, note: "Vérifiez ces informations." }, requestRow()).ok, false);
  assert.equal(completions.validateCompletionRequest({ fields: ["reply"], note: " " }, requestRow()).ok, false);
  assert.equal(completions.validateCompletionRequest({ fields: ["reply"], note: "x".repeat(501) }, requestRow()).ok, false);
  assert.equal(completions.validateCompletionRequest({ fields: ["brokerAccountId", "reply"], note: " Vérifiez la référence. " }, requestRow()).note, "Vérifiez la référence.");
});
test("member changes only requested facts and never supplies access authority", () => {
  const valid = completions.validateCompletionSubmission({ values: { brokerAccountId: "AXI-789" }, reply: "Référence vérifiée." }, requestRow());
  assert.equal(valid.ok, true); assert.deepEqual(plain(valid.patch), { broker_account_id: "AXI-789" });
  for (const forbidden of ["type", "status", "verified_payment", "user_id", "requestKind", "declaredDepositUsd"]) assert.equal(completions.validateCompletionSubmission({ values: { brokerAccountId: "AXI-789", [forbidden]: true }, reply: "Réponse" }, requestRow()).ok, false, forbidden);
});
test("required clarification and all requested fields must be completed", () => {
  assert.equal(completions.validateCompletionSubmission({ values: {}, reply: "Réponse" }, requestRow()).ok, false);
  assert.equal(completions.validateCompletionSubmission({ values: { brokerAccountId: "" }, reply: "Réponse" }, requestRow()).ok, false);
  assert.equal(completions.validateCompletionSubmission({ values: { brokerAccountId: "AXI-456" }, reply: " " }, requestRow()).ok, false);
  assert.equal(completions.validateCompletionSubmission({ values: { telegramUsername: "" } }, requestRow({ completion_fields: ["telegramUsername"] })).ok, false);
});
test("existing membership, date and deposit rules apply to corrections too", () => {
  const row = requestRow({ completion_fields: ["declaredDepositUsd"] });
  for (const amount of [0, 299, -500, "500", 500.001, Infinity]) assert.equal(completions.validateCompletionSubmission({ values: { declaredDepositUsd: amount } }, row).ok, false);
  assert.equal(completions.validateCompletionSubmission({ values: { declaredDepositUsd: 300 } }, row).ok, true);
  assert.equal(completions.validateCompletionSubmission({ values: { declaredDepositUsd: 300 } }, { ...row, copy_requested: true }).ok, false);
  const sub = requestRow({ type: "abonnement", request_kind: "existing", paid_on: "2026-10-01", completion_fields: ["paidOn"] });
  for (const paidOn of ["2099-01-01", "2026-02-30"]) assert.equal(completions.validateCompletionSubmission({ values: { paidOn } }, sub).ok, false);
});
test("answered and terminal requests cannot be edited through the completion flow", () => {
  for (const changes of [{ status: "approved" }, { status: "denied" }, { completion_fields: [] }]) assert.equal(completions.validateCompletionSubmission({ values: { brokerAccountId: "AXI-789" }, reply: "Réponse" }, requestRow(changes)).ok, false);
});
test("revisions are bounded integers rather than browser-supplied strings", () => {
  for (const value of [null, undefined, "1", -1, 1.2, 2147483647]) assert.equal(completions.completionRevisionValid(value), false);
  assert.equal(completions.completionRevisionValid(0), true);
});

function apiFixture(options = {}) {
  const calls = { reads: [], rpcs: [], auth: [] };
  const row = options.row === null ? null : requestRow(options.row);
  const db = { from(table) {
    const filters = []; const chain = { select() { return chain; }, eq(key, value) { filters.push([key, value]); return chain; },
      async maybeSingle() { calls.reads.push({ table, filters }); return { data: row && filters.every(([key, value]) => row[key] === value) ? row : null, error: null }; },
    }; return chain;
  }, async rpc(name, args) { calls.rpcs.push({ name, args }); return { data: { ...row, revision: 2, completion_fields: [] }, error: options.rpcError ? { message: options.rpcError } : null }; } };
  const modules = {
    "next/server": { after() {} },
    "@/lib/vip/access-requests": validators, "@/lib/vip/request-completions": completions, "@/lib/vip/membership": membership,
    "@/lib/vip/admin-activity": { async queueVipAdminActivity() {} }, "@/lib/vip/notifications": { async deliverVipNotifications() {} },
    "@/lib/vip/access-confirmations": { async deliverVipAccessConfirmations() {} },
    "@/lib/vip/request-completion-notifications": { async deliverVipRequestCompletionNotifications() {} },
    "@/lib/admin/permissions": { async authenticateAdmin(_req, permission) { calls.auth.push(permission); return options.admin === false ? { error: "Forbidden", status: 403 } : { admin: db, user: { id: other } }; } },
    "@/lib/vip/membership-server": { async authenticateVip() { calls.auth.push("member"); return options.auth === false ? { error: "Unauthorized", status: 401 } : { db, user: { id: uid, email: "member@example.test", email_confirmed_at: options.confirmed === false ? null : "2026-10-01T00:00:00Z" } }; },
      async readVipJson(request) { return request.json(); }, async readVipMembership() { return null; }, vipJson: (body, status = 200) => Response.json(body, { status }), vipErrorResponse: () => Response.json({ error: "safe unavailable" }, { status: 503 }),
    },
  };
  const env = { VERCEL_ENV: options.preview ? "preview" : "production" };
  const member = compile("app/api/vip/requests/route.ts", modules, env);
  const admin = compile("app/api/admin/vip/requests/route.ts", modules, env);
  async function send(route, method, body) { const response = await route[method](new Request("https://investprotrading.fr/api/vip/requests", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })); return { status: response.status, body: await response.json() }; }
  return { calls, patch: body => send(member, "PATCH", body), admin: body => send(admin, "POST", body) };
}
const submitted = { id: rid, expectedRevision: 1, values: { brokerAccountId: "AXI-456" }, reply: "Référence confirmée." };
test("PATCH uses authenticated owner in lookup and atomic RPC, ignoring forged identity", async () => {
  const api = apiFixture(); const result = await api.patch({ ...submitted, user_id: other, status: "approved", verified_payment: true });
  assert.equal(result.status, 200); assert.deepEqual(plain(api.calls.reads[0].filters), [["id", rid], ["user_id", uid]]);
  assert.equal(api.calls.rpcs[0].name, "vip_submit_request_completion"); assert.equal(api.calls.rpcs[0].args.p_user_id, uid);
  assert.deepEqual(plain(api.calls.rpcs[0].args.p_values), { broker_account_id: "AXI-456" });
});
test("anonymous, unconfirmed and foreign owners never mutate a request", async () => {
  for (const [options, expected] of [[{ auth: false }, 401], [{ confirmed: false }, 403], [{ row: { user_id: other } }, 409], [{ row: null }, 409]]) {
    const api = apiFixture(options); assert.equal((await api.patch(submitted)).status, expected); assert.equal(api.calls.rpcs.length, 0);
  }
});
test("stale submissions report a conflict rather than overriding the latest dossier", async () => {
  const api = apiFixture({ rpcError: "vip_request_revision_conflict" }); assert.equal((await api.patch(submitted)).status, 409);
  assert.match((await api.patch(submitted)).body.error, /Actualisez/);
});
test("previews cannot request or submit dossier updates", async () => {
  const api = apiFixture({ preview: true }); assert.equal((await api.patch(submitted)).status, 403);
  assert.equal((await api.admin({ action: "request_completion", id: rid, expectedRevision: 1, fields: ["reply"], note: "Précisez votre situation." })).status, 403);
  assert.equal(api.calls.rpcs.length, 0);
});
test("only users_write administrators may request a checklist", async () => {
  const body = { action: "request_completion", id: rid, expectedRevision: 1, fields: ["reply"], note: "Précisez votre situation." };
  const denied = apiFixture({ admin: false }); assert.equal((await denied.admin(body)).status, 403); assert.equal(denied.calls.rpcs.length, 0);
  const api = apiFixture(); assert.equal((await api.admin(body)).status, 200); assert.deepEqual(api.calls.auth, ["users_write"]);
  assert.equal(api.calls.rpcs[0].name, "vip_request_completion_action"); assert.equal(api.calls.rpcs[0].args.p_actor_id, other);
});
test("admin approval uses the revision wrapper, preserving verification values for stored request kind", async () => {
  const api = apiFixture({ row: { request_kind: "existing", completion_fields: [] } });
  const response = await api.admin({ action: "approve", id: rid, expectedRevision: 1, firstName: "Marie", lastName: "Martin", type: "affiliation", affiliationBroker: "axi" });
  assert.equal(response.status, 200); assert.equal(api.calls.rpcs[0].name, "vip_review_access_request_revision"); assert.equal(api.calls.rpcs[0].args.p_expected_revision, 1);
  const stale = apiFixture({ rpcError: "vip_request_revision_conflict", row: { request_kind: "existing" } }); assert.equal((await stale.admin({ action: "deny", id: rid, expectedRevision: 1 })).status, 409);
});
test("approval cannot bypass broker checks using a forged request kind", async () => {
  const api = apiFixture(); assert.equal((await api.admin({ action: "approve", id: rid, expectedRevision: 1, requestKind: "existing", firstName: "Marie", lastName: "Martin", type: "affiliation", affiliationBroker: "axi" })).status, 400); assert.equal(api.calls.rpcs.length, 0);
});
