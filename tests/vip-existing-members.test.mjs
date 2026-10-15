import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const project = path.resolve(import.meta.dirname, "..");
const userId = "83cfaf59-8e27-47e4-b64b-3d17fc501102";
const otherUserId = "5bc837cb-8de0-45ae-8a47-368c5f59d371";
const requestId = "ddba72f8-8b73-409a-8628-cb427c82ef61";
const adminId = "b2c68762-370f-4dc9-bdf1-57dba561b982";
const email = "member@example.invalid";

function compile(file, modules = {}, environment = {}) {
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(project, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module: compiledModule, exports: compiledModule.exports, URL, Request, Response,
    Date, console, process: { env: environment },
    require: name => {
      assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name);
      return modules[name];
    },
  });
  return compiledModule.exports;
}

const identity = compile("lib/vip/identity.ts");
const membership = compile("lib/vip/membership.ts");
const validators = compile("lib/vip/access-requests.ts", {
  "./identity": identity,
  "@/lib/vip/identity": identity,
  "./membership": membership,
  "@/lib/vip/membership": membership,
});

function fixture({ authorized = true, adminAuthorized = true, confirmed = true, existingRequest = null, existingMembership = null, databaseError = null, rpcError = null, environment = "production" } = {}) {
  const calls = { auth: [], permissions: [], reads: [], writes: [], rpcs: [] };
  const db = {
    from(table) {
      const query = { table, filters: [], columns: null, operation: null };
      function result(single = false) {
        if (query.operation) return { data: { id: requestId, ...query.operation.value }, error: databaseError };
        calls.reads.push({ ...query, filters: [...query.filters] });
        const row = table === "vip_memberships" ? existingMembership : existingRequest;
        return { data: single ? row : row ? [row] : [], error: databaseError };
      }
      const chain = {
        select(columns) { query.columns = columns; return chain; },
        eq(column, value) { query.filters.push([column, value]); return chain; },
        in(column, values) { query.filters.push([column, values]); return chain; },
        order() { return chain; },
        limit() { return chain; },
        insert(value) { query.operation = { kind: "insert", value }; calls.writes.push({ table, ...query.operation }); return chain; },
        upsert(value, options) { query.operation = { kind: "upsert", value, options }; calls.writes.push({ table, ...query.operation }); return chain; },
        update(value) { query.operation = { kind: "update", value }; calls.writes.push({ table, ...query.operation }); return chain; },
        async maybeSingle() { return result(true); },
        async single() { return result(true); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return chain;
    },
    async rpc(name, args) {
      calls.rpcs.push({ name, args });
      return { data: { user_id: userId, email, type: "affiliation", status: "active" }, error: rpcError };
    },
  };
  class VipRequestError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
  }
  const modules = {
    "@/lib/admin/permissions": { async authenticateAdmin(_request, permission) {
      calls.permissions.push(permission);
      return adminAuthorized ? { user: { id: adminId }, admin: db } : { error: "Accès refusé", status: 403 };
    } },
    "@/lib/vip/access-requests": validators,
    "@/lib/vip/identity": identity,
    "@/lib/vip/membership": membership,
    "@/lib/vip/membership-server": {
      async authenticateVip() {
        calls.auth.push("vip");
        return authorized ? { user: { id: userId, email, email_confirmed_at: confirmed ? "2026-10-15T00:00:00Z" : null }, db, admin: false } : { error: "Non authentifié", status: 401 };
      },
      async readVipMembership(_db, id) {
        calls.reads.push({ table: "vip_memberships", filters: [["user_id", id]], operation: null });
        return existingMembership;
      },
      async readVipJson(request) { return request.json(); },
      VIP_MEMBERSHIP_COLUMNS: "user_id,email,type,status,expires_at",
      VipRequestError,
      vipJson: (body, status = 200) => Response.json(body, { status }),
      vipErrorResponse: error => Response.json({ error: error instanceof VipRequestError ? error.message : "Fixture unexpected failure" }, { status: error instanceof VipRequestError ? error.status : 503 }),
    },
  };
  const memberRoute = compile("app/api/vip/requests/route.ts", modules, { VERCEL_ENV: environment });
  const adminRoute = compile("app/api/admin/vip/requests/route.ts", modules, { VERCEL_ENV: environment });
  async function request(route, method, body, search = "") {
    const response = await route[method](new Request("https://investprotrading.fr/api/vip/requests" + search, {
      method, headers: { "Content-Type": "application/json", Origin: "https://investprotrading.fr" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    return { status: response.status, body: await response.json() };
  }
  return {
    calls,
    get: search => request(memberRoute, "GET", undefined, search),
    post: body => request(memberRoute, "POST", body),
    adminGet: () => request(adminRoute, "GET"),
    adminPost: body => request(adminRoute, "POST", body),
  };
}

const declaration = { firstName: "Élodie", lastName: "D’Ávila", telegramUsername: "@member_vip", type: "affiliation", affiliationBroker: "axi" };
const plain = value => JSON.parse(JSON.stringify(value));

test("a former member can declare each supported broker without granting themselves VIP access", async () => {
  for (const affiliationBroker of ["raise_fx", "vantage", "puprime", "axi"]) {
    const { post, calls } = fixture();
    const response = await post({ ...declaration, affiliationBroker, user_id: otherUserId, email: "attacker@example.invalid", status: "approved", active: true, admin: true, expires_at: "2099-01-01", reviewed_by: otherUserId, verified_type: "affiliation", verified_affiliation_broker: "axi", verified_expires_at: null });
    assert.equal(response.status, 201);
    assert.equal(calls.writes.length, 1);
    const write = calls.writes[0];
    assert.equal(write.table, "vip_access_requests");
    assert.equal(write.value.user_id, userId);
    assert.equal(write.value.email, email);
    assert.equal(write.value.affiliation_broker, affiliationBroker);
    assert.equal(write.value.status, "pending");
    assert.deepEqual(plain(write.value), {
      first_name: "Élodie", last_name: "D’Ávila", telegram_username: "member_vip", type: "affiliation", affiliation_broker: affiliationBroker,
      user_id: userId, email, status: "pending",
    });
    for (const field of ["active", "admin", "expires_at", "reviewed_by"]) assert.equal(Object.hasOwn(write.value, field), false, field);
    assert.equal(calls.rpcs.length, 0);
  }
});

test("a member can read only their own declaration even when another user ID is supplied", async () => {
  const existingRequest = { id: requestId, user_id: userId, email, status: "pending" };
  const { get, calls } = fixture({ existingRequest });
  const response = await get("?user_id=" + otherUserId + "&userId=" + otherUserId);
  assert.equal(response.status, 200);
  const reads = calls.reads.filter(read => read.table === "vip_access_requests");
  assert.equal(reads.length, 1);
  assert.ok(reads[0].filters.some(([column, value]) => column === "user_id" && value === userId));
  assert.equal(JSON.stringify(response.body).includes(otherUserId), false);
  assert.equal(calls.writes.length + calls.rpcs.length, 0);
});

test("anonymous visitors cannot submit or read declarations and never reach the database", async () => {
  for (const method of ["get", "post"]) {
    const api = fixture({ authorized: false });
    assert.equal((await api[method](method === "post" ? declaration : undefined)).status, 401);
    assert.equal(api.calls.reads.length + api.calls.writes.length + api.calls.rpcs.length, 0);
  }
});

test("declaring an unknown affiliation broker is pending only and approval requires a verified broker", async () => {
  const pending = validators.validateVipAccessRequest({ ...declaration, affiliationBroker: "unknown" });
  assert.equal(pending.ok, true);
  assert.equal(pending.value.affiliation_broker, null);
  const approval = validators.validateVipApproval({ ...declaration, affiliationBroker: "unknown" });
  assert.equal(approval.ok, false);
  const api = fixture();
  const response = await api.post({ ...declaration, affiliationBroker: "unknown" });
  assert.equal(response.status, 201);
  assert.equal(api.calls.writes[0].value.status, "pending");
  assert.equal(api.calls.writes[0].value.affiliation_broker, null);
});

test("identity validation trims and normalizes names while rejecting malformed declarations", () => {
  const normalized = validators.validateVipAccessRequest({ ...declaration, firstName: "  E\u0301lodie  ", lastName: "  O'Connor-李  " });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.first_name, "Élodie");
  assert.equal(normalized.value.last_name, "O'Connor-李");
  for (const changes of [
    { firstName: "" }, { firstName: 123 }, { lastName: "Du\npont" }, { lastName: "Du\u202Epont" }, { lastName: "A".repeat(81) },
    { type: "vip" }, { affiliationBroker: "other" }, { affiliationBroker: ["axi"] },
    { telegramUsername: "https://t.me/member_vip" }, { telegramUsername: {} },
  ]) assert.equal(validators.validateVipAccessRequest({ ...declaration, ...changes }).ok, false, JSON.stringify(changes));
});

test("malformed declarations are rejected before any pending request is written", async () => {
  for (const changes of [{ firstName: "" }, { lastName: "Du\npont" }, { type: "admin" }, { affiliationBroker: "other" }, { telegramUsername: {} }]) {
    const api = fixture();
    assert.equal((await api.post({ ...declaration, ...changes })).status, 400, JSON.stringify(changes));
    assert.equal(api.calls.writes.length + api.calls.rpcs.length, 0);
  }
});

test("subscriptions clear stale broker choices and require the paid future expiry for approval", () => {
  const input = { ...declaration, type: "abonnement", affiliationBroker: "vantage" };
  const declarationResult = validators.validateVipAccessRequest(input);
  assert.equal(declarationResult.ok, true);
  assert.equal(declarationResult.value.affiliation_broker, null);
  for (const expiresAt of [undefined, null, "", "not-a-date", "2020-01-01T00:00:00Z", 4102444800000]) {
    assert.equal(validators.validateVipApproval({ ...input, expiresAt }).ok, false, String(expiresAt));
  }
  const approved = validators.validateVipApproval({ ...input, expiresAt: "2099-01-23T23:59:00+01:00" });
  assert.equal(approved.ok, true);
  assert.equal(approved.value.expires_at, "2099-01-23T22:59:00.000Z");
  assert.equal(approved.value.affiliation_broker, null);
});

test("the administrative queue and approval always require users_write authorization", async () => {
  for (const method of ["adminGet", "adminPost"]) {
    const api = fixture({ adminAuthorized: false });
    const response = await api[method]({ action: "approve", id: requestId, ...declaration });
    assert.equal(response.status, 403);
    assert.deepEqual(api.calls.permissions, ["users_write"]);
    assert.equal(api.calls.reads.length + api.calls.writes.length + api.calls.rpcs.length, 0);
  }
});

test("approval uses the service RPC and cannot forward arbitrary membership or reviewer fields", async () => {
  const api = fixture();
  const response = await api.adminPost({ action: "approve", id: requestId, ...declaration, user_id: otherUserId, email: "attacker@example.invalid", status: "suspended", reviewed_by: otherUserId, admin: true, started_at: "1900-01-01", expires_at: "2099-01-01" });
  assert.equal(response.status, 200);
  assert.deepEqual(api.calls.permissions, ["users_write"]);
  assert.equal(api.calls.writes.length, 0);
  assert.equal(api.calls.rpcs.length, 1);
  assert.equal(api.calls.rpcs[0].name, "vip_review_access_request");
  const args = plain(api.calls.rpcs[0].args);
  assert.equal(args.p_request_id, requestId);
  assert.equal(args.p_reviewed_by, adminId);
  assert.equal(args.p_action, "approve");
  assert.equal(args.p_affiliation_broker, "axi");
  assert.equal(args.p_expires_at, null);
  for (const field of ["p_user_id", "p_email", "p_status", "p_admin", "p_started_at"]) assert.equal(Object.hasOwn(args, field), false, field);
});

test("invalid approval requests never reach the access-grant RPC", async () => {
  for (const changes of [{ id: otherUserId + "-invalid" }, { action: "grant" }, { affiliationBroker: "unknown" }, { firstName: "" }, { type: "abonnement", expiresAt: "2020-01-01" }]) {
    const api = fixture();
    assert.equal((await api.adminPost({ action: "approve", id: requestId, ...declaration, ...changes })).status, 400, JSON.stringify(changes));
    assert.equal(api.calls.writes.length + api.calls.rpcs.length, 0);
  }
});

test("Telegram handles are normalized for matching and never accepted as arbitrary links or controls", () => {
  const normalized = validators.validateVipAccessRequest({ ...declaration, telegramUsername: "  @Member_VIP  " });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.telegram_username, "member_vip");
  for (const telegramUsername of ["@", "abc", "1member", "@@member_vip", "m".repeat(33), "member\nvip", "member\u202Evip", "https://t.me/member_vip"]) {
    assert.equal(validators.validateVipAccessRequest({ ...declaration, telegramUsername }).ok, false, JSON.stringify(telegramUsername));
  }
});

test("former members without a Telegram username can submit a declaration with no invented handle", async () => {
  for (const telegramUsername of [undefined, "", "   "]) {
    const validation = validators.validateVipAccessRequest({ ...declaration, telegramUsername });
    assert.equal(validation.ok, true);
    assert.equal(validation.value.telegram_username, null);
    const api = fixture();
    assert.equal((await api.post({ ...declaration, telegramUsername })).status, 201);
    assert.equal(api.calls.writes[0].value.telegram_username, null);
    assert.equal(api.calls.writes[0].value.status, "pending");
  }
});

test("unconfirmed accounts cannot submit a declaration", async () => {
  const api = fixture({ confirmed: false });
  assert.equal((await api.post(declaration)).status, 403);
  assert.equal(api.calls.reads.length + api.calls.writes.length + api.calls.rpcs.length, 0);
});

test("an existing VIP membership cannot be replaced by a self-declared access request", async () => {
  for (const status of ["active", "suspended"]) {
    const api = fixture({ existingMembership: { user_id: userId, type: "abonnement", status, started_at: "2020-01-01T00:00:00Z", expires_at: "2020-02-01T00:00:00Z" } });
    assert.equal((await api.post(declaration)).status, 409);
    assert.equal(api.calls.writes.length + api.calls.rpcs.length, 0);
  }
});

test("a duplicate pending request is reported instead of overwriting an existing declaration", async () => {
  const api = fixture({ databaseError: { code: "23505" } });
  assert.equal((await api.post({ ...declaration, affiliationBroker: "vantage" })).status, 409);
  assert.equal(api.calls.writes.length, 1);
  assert.equal(api.calls.writes[0].kind, "insert");
  assert.equal(api.calls.rpcs.length, 0);
});

test("the admin queue is restricted to declarations awaiting a decision", async () => {
  const existingRequest = { id: requestId, user_id: userId, status: "pending" };
  const api = fixture({ existingRequest });
  const response = await api.adminGet();
  assert.equal(response.status, 200);
  assert.deepEqual(api.calls.permissions, ["users_write"]);
  assert.equal(api.calls.reads.length, 1);
  assert.equal(api.calls.reads[0].table, "vip_access_requests");
  assert.ok(api.calls.reads[0].filters.some(([column, value]) => column === "status" && value === "pending"));
  assert.deepEqual(response.body.requests, [existingRequest]);
  assert.equal(api.calls.writes.length + api.calls.rpcs.length, 0);
});

test("subscription approval passes the actual paid deadline unchanged and clears broker affiliation", async () => {
  const api = fixture();
  const response = await api.adminPost({ action: "approve", id: requestId, ...declaration, type: "abonnement", expiresAt: "2099-01-23T23:59:00+01:00" });
  assert.equal(response.status, 200);
  const args = plain(api.calls.rpcs[0].args);
  assert.equal(args.p_type, "abonnement");
  assert.equal(args.p_expires_at, "2099-01-23T22:59:00.000Z");
  assert.equal(args.p_affiliation_broker, null);
  assert.equal(Object.hasOwn(args, "p_months"), false);
});

test("denial sends no access-grant fields even when the client includes a valid approval payload", async () => {
  const api = fixture();
  const response = await api.adminPost({ action: "deny", id: requestId, ...declaration, type: "abonnement", expiresAt: "2099-01-23T23:59:00Z" });
  assert.equal(response.status, 200);
  assert.deepEqual(plain(api.calls.rpcs[0]), {
    name: "vip_review_access_request",
    args: { p_request_id: requestId, p_action: "deny", p_reviewed_by: adminId, p_first_name: null, p_last_name: null, p_type: null, p_affiliation_broker: null, p_expires_at: null },
  });
  assert.equal(api.calls.writes.length, 0);
});

test("approval conflicts are surfaced without creating or overwriting a second membership", async () => {
  for (const message of ["vip_request_unavailable", "vip_membership_exists"]) {
    const api = fixture({ rpcError: { message } });
    assert.equal((await api.adminPost({ action: "approve", id: requestId, ...declaration })).status, 409);
    assert.equal(api.calls.rpcs.length, 1);
    assert.equal(api.calls.writes.length, 0);
  }
});

test("a failed private declaration read fails closed instead of returning membership data as success", async () => {
  const api = fixture({ databaseError: { code: "42501" } });
  assert.equal((await api.get()).status, 503);
  assert.equal(api.calls.writes.length + api.calls.rpcs.length, 0);
});

test("preview deployments reject member submissions and admin decisions before auth or database work", async () => {
  for (const method of ["post", "adminPost"]) {
    const api = fixture({ environment: "preview" });
    const response = await api[method](method === "post" ? declaration : { action: "approve", id: requestId, ...declaration });
    assert.equal(response.status, 403);
    assert.equal(api.calls.auth.length + api.calls.permissions.length + api.calls.reads.length + api.calls.writes.length + api.calls.rpcs.length, 0);
  }
});
