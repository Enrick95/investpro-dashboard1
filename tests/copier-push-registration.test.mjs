import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createECDH, randomBytes } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import * as membership from "../lib/vip/membership.ts";
import * as validation from "../lib/vip/push-validation.ts";

const root = path.resolve(import.meta.dirname, "..");
const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const curve = createECDH("prime256v1"); curve.generateKeys();
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/copier-offline-fixture", keys: { p256dh: curve.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
function compile(file, modules, extra = {}) {
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { module: compiledModule, exports: compiledModule.exports, Request, Response, URL, Headers, TextDecoder, Uint8Array, Date, ...extra, require(name) { assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; } });
  return compiledModule.exports;
}
function fixture({ stored = [], insertError = null, updateError = null, signedIn = true, configured = true } = {}) {
  const rows = new Map(stored.map(row => [row.endpoint, { ...row }]));
  const calls = { operations: [], bearerChecks: [], cookieChecks: 0, logs: [] };
  const db = { from(table) {
    assert.equal(table, "copier_push_subscriptions");
    const filters = new Map(); let operation, values;
    const matching = () => [...rows.values()].filter(row => [...filters].every(([key, value]) => row[key] === value));
    const query = {
      async upsert(row, options) {
        calls.operations.push({ operation: "insert", row, options });
        assert.equal(options.ignoreDuplicates, true);
        if (insertError) return { error: insertError };
        if (!rows.has(row.endpoint)) rows.set(row.endpoint, { id: "offline-id", ...row });
        return { error: null };
      },
      update(row) { operation = "update"; values = row; assert.equal(Object.hasOwn(row, "user_id"), false); calls.operations.push({ operation, values, filters }); return query; },
      delete() { operation = "delete"; calls.operations.push({ operation, filters }); return query; },
      eq(key, value) { filters.set(key, value); return query; },
      select(columns) { assert.equal(columns, "id"); return query; },
      async maybeSingle() {
        if (updateError) return { data: null, error: updateError };
        const row = matching()[0]; if (row) Object.assign(row, values);
        return { data: row ? { id: row.id } : null, error: null };
      },
      then(resolve) { if (operation === "delete") for (const row of matching()) rows.delete(row.endpoint); return Promise.resolve({ error: null }).then(resolve); },
    };
    return query;
  } };
  const env = { VAPID_PUBLIC_KEY: configured ? "fixture-public" : "", VAPID_PRIVATE_KEY: configured ? "fixture-private" : "", VAPID_SUBJECT: configured ? "mailto:fixture@example.invalid" : "", NEXT_PUBLIC_SUPABASE_URL: "https://offline.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable", SUPABASE_SERVICE_ROLE_KEY: "fixture-service" };
  const server = compile("lib/vip/membership-server.ts", {
    "server-only": {}, "node:crypto": {}, "@supabase/supabase-js": { createClient(_url, key) { return key === "fixture-service" ? db : { auth: { async getUser(token) { calls.bearerChecks.push(token); return { data: { user: signedIn ? { id: token === "fixture-other" ? otherId : userId } : null }, error: null }; } } }; } },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } }, "@/lib/admin/permissions": { async canAdmin() { return false; } },
    "@/lib/supabase/server": { async createClient() { return { auth: { async getUser() { calls.cookieChecks++; return { data: { user: signedIn ? { id: otherId } : null }, error: null }; } } }; } }, "@/lib/vip/membership": membership,
  }, { process: { env } });
  const route = compile("app/api/copier/push/route.ts", { "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } }, "@/lib/vip/membership-server": server, "@/lib/vip/push-validation": validation }, { process: { env }, console: { error(...values) { calls.logs.push(values); } } });
  return { rows, calls, async send({ method = "POST", body = { subscription }, origin = "https://investprotrading.fr", token = "fixture-user" } = {}) {
    const response = await route[method](new Request("https://investprotrading.fr/api/copier/push", { method, headers: { Origin: origin, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  } };
}
test("the actual Copier route uses the verified bearer identity consistently with VIP despite stale cookies", async () => {
  const api = fixture(); assert.equal((await api.send()).status, 200);
  assert.equal(api.rows.get(subscription.endpoint).user_id, userId);
  assert.deepEqual(api.calls.bearerChecks, ["fixture-user"]); assert.equal(api.calls.cookieChecks, 0);
});
test("passive registration cannot transfer or replace another account's endpoint or encryption values", async () => {
  const stored = { id: "existing-id", endpoint: subscription.endpoint, user_id: otherId, p256dh: "old-public", auth: "old-auth" };
  const api = fixture({ stored: [stored] }); const result = await api.send();
  assert.equal(result.status, 409); assert.equal(result.body.code, "push_endpoint_owned");
  assert.deepEqual(api.rows.get(subscription.endpoint), stored);
  const update = api.calls.operations.find(row => row.operation === "update"); assert.equal(update.filters.get("user_id"), userId);
});
test("the owner may refresh keys without rewriting ownership and concurrent contenders cannot steal an endpoint", async () => {
  const api = fixture(); const results = await Promise.all([api.send(), api.send({ token: "fixture-other" })]);
  assert.deepEqual(results.map(row => row.status), [200, 409]); assert.equal(api.rows.get(subscription.endpoint).user_id, userId);
  assert.equal((await api.send()).status, 200); assert.equal(api.rows.get(subscription.endpoint).p256dh, subscription.keys.p256dh);
});
test("Copier push rejects unauthenticated, cross-origin and invalid subscriptions before persistence", async () => {
  for (const [options, changes, expected] of [[{ signedIn: false }, {}, 401], [{}, { origin: "https://foreign.invalid" }, 403], [{}, { body: { subscription: { ...subscription, endpoint: "https://127.0.0.1/fixture" } } }, 400], [{}, { body: { subscription: { ...subscription, keys: { p256dh: "invalid", auth: "invalid" } } } }, 400], [{ configured: false }, {}, 503]]) {
    const api = fixture(options); assert.equal((await api.send(changes)).status, expected); assert.equal(api.calls.operations.length, 0);
  }
});
test("DELETE is scoped to the same authenticated identity and never removes another account's subscription", async () => {
  const api = fixture({ stored: [{ id: "existing-id", endpoint: subscription.endpoint, user_id: otherId }] });
  assert.equal((await api.send({ method: "DELETE", body: { endpoint: subscription.endpoint } })).status, 200);
  assert.equal(api.rows.size, 1);
  assert.equal((await api.send({ method: "DELETE", body: { endpoint: subscription.endpoint }, token: "fixture-other" })).status, 200);
  assert.equal(api.rows.size, 0);
});
test("database failures expose and log only a coarse code, never subscription material", async () => {
  const api = fixture({ updateError: { code: "PGRST202", message: "private-endpoint-fixture-must-not-leak", details: subscription } });
  const result = await api.send(); assert.equal(result.status, 503); assert.equal(result.body.code, "push_save_unavailable");
  const output = JSON.stringify([result, api.calls.logs]); assert.doesNotMatch(output, /private-endpoint-fixture|copier-offline-fixture/); assert.match(output, /PGRST202/);
});
