import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import * as access from "../app/admin-preview/admin-tool-access.ts";

// Compile the actual browser helper without changing its standard Next.js import paths.
const source = readFileSync(new URL("../components/mobile/admin-navigation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(name => {
  if (name === "../../app/admin-preview/admin-tool-access") return access;
  throw new Error("Unexpected dependency: " + name);
}, module, module.exports);
const { adminNavigationDestination, loadAdminNavigation } = module.exports;
const staff = permissions => ({ owner: false, permissions });
const response = (status, payload) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const load = options => loadAdminNavigation({ getToken: async () => "example-transport-token", signal: new AbortController().signal, fetcher: async () => response(200, staff(["finance"])), ...options });

test("owners enter the unified workspace and VIP managers enter the request queue", () => {
  assert.equal(adminNavigationDestination({ owner: true, permissions: [] }), "/dashboard/admin");
  assert.equal(adminNavigationDestination(staff(["users", "users_write", "finance"])), "/dashboard/admin?tool=vip&view=requests");
  assert.equal(adminNavigationDestination(staff(["users_write"])), "/dashboard/admin?tool=vip-publications");
  assert.equal(adminNavigationDestination(staff(["users"])), null);
});

test("staff destinations use an authorized tool rather than the owner-only overview", () => {
  const cases = { inbox: "inbox", copier: "copieur", finance: "finance", analytics: "analytics", feedback: "feedback", moderation: "moderation", announcements_write: "annonces", navigation: "navigation", system: "systeme" };
  for (const [permission, tool] of Object.entries(cases)) assert.equal(adminNavigationDestination(staff([permission])), "/dashboard/admin?tool=" + tool);
  assert.equal(adminNavigationDestination(staff(["overview", "staff"])), null);
  assert.equal(adminNavigationDestination(staff(["overview", "finance"])), "/dashboard/admin?tool=finance");
});

test("members and malformed or client-controlled role claims never display an administration entry", () => {
  for (const payload of [null, [], {}, staff([]), { owner: "true", permissions: [] }, { owner: true }, { owner: false, permissions: [null] }, { user_metadata: { role: "admin" } }, { app_metadata: { role: "admin" } }]) assert.equal(adminNavigationDestination(payload), null);
});

test("missing, failed and aborted sessions never contact the admin API", async () => {
  let requests = 0;
  const fetcher = async () => { requests++; throw new Error("Must not fetch"); };
  assert.equal(await load({ getToken: async () => null, fetcher }), null);
  assert.equal(await load({ getToken: async () => { throw new Error("Session unavailable"); }, fetcher }), null);
  const controller = new AbortController(); controller.abort();
  assert.equal(await load({ signal: controller.signal, fetcher }), null);
  assert.equal(requests, 0);
});

test("a fresh server verification uses the session only for transport", async () => {
  const destination = await load({ fetcher: async (url, options) => {
    assert.equal(url, "/api/admin/me");
    assert.equal(options.headers.Authorization, "Bearer example-transport-token");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    return response(200, staff(["finance"]));
  } });
  assert.equal(destination, "/dashboard/admin?tool=finance");
  assert.equal(destination.includes("token"), false);
});

test("HTTP failures, network failures and malformed responses fail closed", async () => {
  for (const status of [401, 403, 500, 503]) assert.equal(await load({ fetcher: async () => response(status, { owner: true, permissions: [] }) }), null);
  assert.equal(await load({ fetcher: async () => { throw new Error("Offline"); } }), null);
  assert.equal(await load({ fetcher: async () => response(200, { owner: true }) }), null);
  assert.equal(await load({ fetcher: async () => ({ ...response(200, null), json: async () => { throw new Error("Invalid JSON"); } }) }), null);
});

test("a late response after logout or account change cannot restore the old entry", async () => {
  const controller = new AbortController();
  let resolveJson;
  const pending = load({ signal: controller.signal, fetcher: async () => ({ ...response(200, null), json: () => new Promise(resolve => { resolveJson = resolve; }) }) });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  resolveJson({ owner: true, permissions: [] });
  assert.equal(await pending, null);
});
