import assert from "node:assert/strict";
import { test } from "node:test";
import { ADMIN_TOOL_IDS, adminToolPreviewHref, canOpenAdminTool, checkAdminToolAccess, parseAdminAccess, parseAdminToolQuery, parseCurrentAdminPath } from "../app/admin-preview/admin-tool-access.ts";

const memberId = "11111111-1111-4111-8111-111111111111";
const owner = { owner: true, permissions: [] };
const staff = permissions => ({ owner: false, permissions });
const response = (status, payload) => ({ status, ok: status >= 200 && status < 300, json: async () => payload });
const check = options => checkAdminToolAccess({ tool: "finance", getToken: async () => "example-token", signal: new AbortController().signal, fetcher: async () => response(200, staff(["finance"])), ...options });

test("tool access follows current server permissions, including owner-only lists", () => {
  for (const tool of ADMIN_TOOL_IDS) assert.equal(canOpenAdminTool(owner, tool), true, tool);
  for (const tool of ["utilisateurs", "backoffice", "serveurs", "staff", "overview-current"]) assert.equal(canOpenAdminTool(staff(["overview", "users", "users_write", "staff"]), tool), false, tool);
  assert.equal(canOpenAdminTool(staff(["users"]), "utilisateurs", memberId), true);
  assert.equal(canOpenAdminTool(staff([]), "utilisateurs", memberId), false);
  assert.equal(canOpenAdminTool(staff(["finance"]), "finance"), true);
  assert.equal(canOpenAdminTool(staff(["finance"]), "analytics"), false);
  assert.equal(canOpenAdminTool(staff(["overview"]), "annonces"), false);
  assert.equal(canOpenAdminTool(staff(["announcements_write"]), "annonces"), true);
});

test("complete VIP settings require both read and write rights; posts require their own write right", () => {
  assert.equal(canOpenAdminTool(staff(["users"]), "vip"), false);
  assert.equal(canOpenAdminTool(staff(["users_write"]), "vip"), false);
  assert.equal(canOpenAdminTool(staff(["users", "users_write"]), "vip"), true);
  assert.equal(canOpenAdminTool(staff(["users"]), "vip-publications"), false);
  assert.equal(canOpenAdminTool(staff(["users_write"]), "vip-publications"), true);
});

test("queries accept only known tools and one validated member UUID", () => {
  assert.deepEqual(parseAdminToolQuery(new URLSearchParams("tool=finance")), { tool: "finance" });
  assert.deepEqual(parseAdminToolQuery(new URLSearchParams(`tool=utilisateurs&member=${memberId}`)), { tool: "utilisateurs", memberId });
  for (const query of ["tool=__proto__", "tool=finance&tool=staff", "tool=finance&member=x", "tool=utilisateurs&member=../../staff", `tool=utilisateurs&member=${memberId}&member=${memberId}`, "tool=javascript:alert(1)"]) assert.equal(parseAdminToolQuery(new URLSearchParams(query)), null, query);
});

test("internal navigation retains current tools and safe member deep links", () => {
  assert.deepEqual(parseCurrentAdminPath("/dashboard/admin/finance"), { tool: "finance" });
  assert.deepEqual(parseCurrentAdminPath(`/dashboard/admin/utilisateurs/${memberId}`), { tool: "utilisateurs", memberId });
  assert.deepEqual(parseCurrentAdminPath("/dashboard/vip?mode=admin"), { tool: "vip-publications" });
  assert.deepEqual(parseCurrentAdminPath("/dashboard/admin"), { tool: "overview-current" });
  for (const path of ["javascript:alert(1)", "https://example.test/dashboard/admin/finance", "//example.test/dashboard/admin/staff", "/dashboard/admin/utilisateurs/not-a-uuid", "/dashboard/admin/unknown", "/dashboard/admin/finance\\.."]) assert.equal(parseCurrentAdminPath(path), null, path);
});

test("sign-in return targets are always the fixed preview path with validated query values", () => {
  assert.equal(adminToolPreviewHref("finance"), "/admin-preview?tool=finance");
  assert.equal(adminToolPreviewHref("utilisateurs", memberId), `/admin-preview?tool=utilisateurs&member=${memberId}`);
  assert.throws(() => adminToolPreviewHref("javascript:alert(1)"));
  assert.throws(() => adminToolPreviewHref("finance", memberId));
  assert.throws(() => adminToolPreviewHref("utilisateurs", "//example.test"));
});

test("production workspace targets retain safe tools, VIP views and member details", () => {
  assert.equal(adminToolPreviewHref("finance", undefined, "/dashboard/admin"), "/dashboard/admin?tool=finance");
  assert.equal(adminToolPreviewHref("vip", undefined, "/dashboard/admin", "requests"), "/dashboard/admin?tool=vip&view=requests");
  assert.equal(adminToolPreviewHref("utilisateurs", memberId, "/dashboard/admin"), `/dashboard/admin?tool=utilisateurs&member=${memberId}`);
  assert.deepEqual(parseCurrentAdminPath("/dashboard/admin?tool=finance"), { tool: "finance" });
  assert.deepEqual(parseCurrentAdminPath("/dashboard/admin?tool=vip&view=affiliation"), { tool: "vip", vipView: "affiliation" });
  assert.throws(() => adminToolPreviewHref("finance", undefined, "https://example.test"));
  assert.throws(() => adminToolPreviewHref("finance", undefined, "/dashboard/admin", "requests"));
  assert.throws(() => adminToolPreviewHref("vip", undefined, "/dashboard/admin", "__proto__"));
});

test("VIP views cannot be duplicated, unrecognized or attached to another module", () => {
  for (const view of ["members", "requests", "subscriptions", "affiliation", "settings"]) assert.deepEqual(parseAdminToolQuery(new URLSearchParams(`tool=vip&view=${view}`)), { tool: "vip", vipView: view });
  for (const query of ["tool=vip&view=unknown", "tool=vip&view=requests&view=settings", "tool=finance&view=requests", "tool=utilisateurs&view=members"]) assert.equal(parseAdminToolQuery(new URLSearchParams(query)), null, query);
  assert.equal(parseCurrentAdminPath("/dashboard/admin?tool=vip&view=invalid"), null);
});

test("missing or invalid local sessions never cause an admin API request", async () => {
  let requests = 0;
  const fetcher = async () => { requests++; throw new Error("must not fetch"); };
  assert.deepEqual(await check({ getToken: async () => null, fetcher }), { status: "signedOut" });
  assert.deepEqual(await check({ getToken: async () => { throw new Error("session unavailable"); }, fetcher }), { status: "unavailable" });
  assert.equal(requests, 0);
});

test("only the current server check authorizes a tool; token remains transport-only", async () => {
  let requests = 0;
  const result = await check({ fetcher: async (url, options) => {
    requests++;
    assert.equal(url, "/api/admin/me");
    assert.equal(options.method, "GET");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers.Authorization, "Bearer example-token");
    assert.equal(options.credentials, "same-origin");
    return response(200, staff(["finance"]));
  } });
  assert.deepEqual(result, { status: "allowed", access: staff(["finance"]) });
  assert.equal(requests, 1);
  assert.equal(JSON.stringify(result).includes("example-token"), false);
  assert.deepEqual(await check({ tool: "staff" }), { status: "denied" });
});

test("401, 403, server errors and malformed access payloads all fail closed", async () => {
  assert.deepEqual(await check({ fetcher: async () => response(401, owner) }), { status: "signedOut" });
  assert.deepEqual(await check({ fetcher: async () => response(403, owner) }), { status: "denied" });
  assert.deepEqual(await check({ fetcher: async () => response(503, owner) }), { status: "unavailable" });
  for (const payload of [null, [], {}, { owner: "true", permissions: [] }, { owner: true }, { owner: true, permissions: [null] }, { owner: true, permissions: Array(65).fill("finance") }]) {
    assert.equal(parseAdminAccess(payload), null);
    assert.deepEqual(await check({ fetcher: async () => response(200, payload) }), { status: "unavailable" });
  }
});

test("network and JSON failures do not authorize modules", async () => {
  assert.deepEqual(await check({ fetcher: async () => { throw new Error("offline"); } }), { status: "unavailable" });
  assert.deepEqual(await check({ fetcher: async () => ({ ...response(200, owner), json: async () => { throw new Error("bad JSON"); } }) }), { status: "unavailable" });
});

test("cancellation prevents a late old server grant from reopening a tool after switching or signing out", async () => {
  const controller = new AbortController();
  let resolveJson;
  const oldRequest = check({ signal: controller.signal, fetcher: async () => ({ ...response(200, owner), json: () => new Promise(resolve => { resolveJson = resolve; }) }) });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  resolveJson(owner);
  assert.deepEqual(await oldRequest, { status: "aborted" });
  assert.deepEqual(await check({ tool: "staff", fetcher: async () => response(200, staff(["finance"])) }), { status: "denied" });
});

test("aborted and invalid requests never start a server request", async () => {
  let requests = 0;
  const fetcher = async () => { requests++; return response(200, owner); };
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await check({ signal: controller.signal, fetcher }), { status: "aborted" });
  assert.deepEqual(await check({ tool: "unknown", fetcher }), { status: "denied" });
  assert.deepEqual(await check({ tool: "utilisateurs", memberId: "invalid", fetcher }), { status: "denied" });
  assert.equal(requests, 0);
});
