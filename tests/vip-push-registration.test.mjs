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
const curve = createECDH("prime256v1"); curve.generateKeys();
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/offline-fixture", keys: { p256dh: curve.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
function compile(file, modules, extra = {}) {
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { module: compiledModule, exports: compiledModule.exports, Request, Response, URL, Headers, TextDecoder, Uint8Array, ...extra, require(name) { assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; } });
  return compiledModule.exports;
}
function fixture({ signedIn = true, active = true, rpcError = null, configured = true } = {}) {
  const calls = { registrations: [], logs: [] };
  const db = {
    from(table) { assert.equal(table, "vip_memberships"); const chain = { select() { return chain; }, eq() { return chain; }, async maybeSingle() { return { data: active ? { status: "active", type: "affiliation", started_at: "2026-01-01T00:00:00Z", expires_at: null } : null, error: null }; } }; return chain; },
    async rpc(name, args) { calls.registrations.push({ name, args }); return { data: rpcError ? null : "22222222-2222-4222-8222-222222222222", error: rpcError }; },
  };
  const client = { auth: { async getUser() { return { data: { user: signedIn ? { id: userId } : null }, error: null }; } } };
  const server = compile("lib/vip/membership-server.ts", {
    "server-only": {}, "node:crypto": {}, "@supabase/supabase-js": { createClient(_url, key) { return key === "fixture-service" ? db : client; } },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } }, "@/lib/admin/permissions": { async canAdmin() { return false; } },
    "@/lib/supabase/server": { async createClient() { return client; } }, "@/lib/vip/membership": membership,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://offline.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable", SUPABASE_SERVICE_ROLE_KEY: "fixture-service" } } });
  const route = compile("app/api/vip/push/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } }, "@/lib/vip/membership-server": server,
    "@/lib/vip/notifications": { vipPushConfig: () => ({ publicKey: "fixture", available: configured }) }, "@/lib/vip/push-validation": validation,
  }, { console: { error(...values) { calls.logs.push(values); } } });
  return { calls, async post(body = { subscription }, origin = "https://investprotrading.fr", contentType = "application/json") {
    const response = await route.POST(new Request("https://investprotrading.fr/api/vip/push", { method: "POST", headers: { Origin: origin, Authorization: "Bearer offline-fixture", "Content-Type": contentType }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  } };
}

test("the actual authenticated VIP route saves only its verified user's standard Chrome/Samsung subscription", async () => {
  const api = fixture(); assert.equal((await api.post()).status, 200);
  assert.equal(api.calls.registrations.length, 1);
  assert.equal(api.calls.registrations[0].name, "vip_register_push");
  assert.equal(api.calls.registrations[0].args.p_user_id, userId);
  assert.equal(api.calls.registrations[0].args.p_endpoint, subscription.endpoint);
});
test("VIP push keeps authenticated membership, strict origin and subscription validation before persistence", async () => {
  for (const [options, body, origin, expected] of [[{ signedIn: false }, { subscription }, undefined, 401], [{ active: false }, { subscription }, undefined, 403], [{}, { subscription }, "https://foreign.invalid", 403], [{}, { subscription: { ...subscription, endpoint: "https://127.0.0.1/fixture" } }, undefined, 400], [{}, { subscription: { ...subscription, keys: { p256dh: "invalid", auth: "invalid" } } }, undefined, 400]]) {
    const api = fixture(options); assert.equal((await api.post(body, origin)).status, expected); assert.equal(api.calls.registrations.length, 0);
  }
});
test("endpoint conflicts remain ownership failures and carry the safe explicit repair code", async () => {
  const api = fixture({ rpcError: { code: "P0001", message: "vip_push_endpoint_owned" } });
  const result = await api.post(); assert.equal(result.status, 409); assert.equal(result.body.code, "push_endpoint_owned"); assert.equal(api.calls.logs.length, 0);
});
test("device limits and temporary database failures are distinct and reveal no subscription material", async () => {
  const limited = fixture({ rpcError: { code: "P0001", message: "vip_push_limit" } });
  assert.equal((await limited.post()).body.code, "push_device_limit");
  const raw = "sensitive-database-detail-must-never-be-exposed";
  const api = fixture({ rpcError: { code: "PGRST202", message: raw, details: subscription } });
  const result = await api.post(); assert.equal(result.status, 503); assert.equal(result.body.code, "push_save_unavailable");
  const output = JSON.stringify([result, api.calls.logs]); assert.doesNotMatch(output, new RegExp(raw)); assert.doesNotMatch(output, /offline-fixture/); assert.match(output, /PGRST202/);
});
test("unavailable push setup and origin rejection explain the first failed boundary", async () => {
  const api = fixture({ configured: false }); assert.equal((await api.post()).body.code, "push_unavailable"); assert.equal(api.calls.registrations.length, 0);
  const origin = fixture(); assert.equal((await origin.post({ subscription }, "null")).body.code, "push_origin_denied"); assert.equal(origin.calls.registrations.length, 0);
});
