import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const ownerId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const candidate = { id: userId, email: "kenn@example.invalid", phone: "+000000000", user_metadata: { username: "MetadataKenn", admin: true }, app_metadata: { provider: "email" } };

function compile(file, modules = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module, exports: module.exports, URL, Request, Response,
    require: name => { assert(Object.hasOwn(modules, name), `Unexpected import: ${name}`); return modules[name]; },
  });
  return module.exports;
}
const helpers = compile("lib/admin/staff-search.ts");

function fixture({ authorized = true, owner = true, pages = [[candidate]], profiles = [{ id: userId, username: "Kenn97" }], listError = false, profileError = false, targetMissing = false } = {}) {
  const calls = { permissions: [], pages: [], reads: [], lookups: [], writes: [] };
  const db = {
    auth: { admin: {
      async listUsers(options) { calls.pages.push(options); return { data: { users: pages[options.page - 1] || [] }, error: listError ? new Error("fixture") : null }; },
      async getUserById(id) { calls.lookups.push(id); return { data: { user: targetMissing ? null : { ...candidate, id } }, error: null }; },
    } },
    from(table) {
      const query = { table, columns: "", ids: null };
      const chain = {
        select(columns) { query.columns = columns; return chain; },
        async in(column, ids) { query.ids = ids; calls.reads.push({ ...query, column }); return { data: profiles.filter(profile => ids.includes(profile.id)), error: profileError ? new Error("fixture") : null }; },
        async order() { calls.reads.push({ ...query }); return { data: [{ user_id: userId, permissions: ["inbox"], enabled: true }], error: null }; },
        async upsert(value) { calls.writes.push({ table, operation: "upsert", value }); return { error: null }; },
        async insert(value) { calls.writes.push({ table, operation: "insert", value }); return { error: null }; },
      };
      return chain;
    },
  };
  const route = compile("app/api/admin/staff/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/admin/staff-search": helpers,
    "@/lib/admin/permissions": { PERMISSIONS: ["overview", "users", "users_write", "inbox"], isOwner: id => id === ownerId,
      async authenticateAdmin(_request, permission) { calls.permissions.push(permission); return authorized ? { user: { id: ownerId }, access: { owner, permissions: owner ? ["staff"] : ["staff", "users_write"] }, admin: db } : { error: "Non authentifié", status: 401 }; },
    },
  });
  async function request(method, query = "", body) {
    const response = await route[method](new Request("https://investprotrading.fr/api/admin/staff" + query, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) }));
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { calls, get: query => request("GET", query), post: body => request("POST", "", body) };
}

test("staff lookup requires authenticated owner access before reading any member records", async () => {
  for (const options of [{ authorized: false }, { owner: false }]) {
    const api = fixture(options);
    assert.equal((await api.get("?search=Kenn")).status, options.authorized === false ? 401 : 403);
    assert.deepEqual(api.calls.permissions, ["staff"]);
    assert.equal(api.calls.pages.length + api.calls.reads.length + api.calls.writes.length, 0);
  }
});

test("lookup returns only safe member identity fields from the official profile and Auth schema", async () => {
  const api = fixture();
  const response = await api.get("?search=kenn97");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { matches: [{ user_id: userId, name: "Kenn97", email: "kenn@example.invalid", is_owner: false }] });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(api.calls.reads[0].columns, "id,username");
  assert.equal(api.calls.reads[0].column, "id");
  assert.equal(api.calls.writes.length, 0);
  assert.equal(JSON.stringify(response.body).includes("user_metadata"), false);
  assert.equal(JSON.stringify(response.body).includes("+000000000"), false);
});

test("search matches email, profile username and names case/accent insensitively", () => {
  assert.equal(helpers.staffSearchMatch(candidate, "Kenn97", "KENN97", false).user_id, userId);
  assert.equal(helpers.staffSearchMatch(candidate, "Kenn97", "@example.invalid", false).email, candidate.email);
  assert.equal(helpers.staffSearchMatch({ ...candidate, user_metadata: { full_name: "Élodie Dupont" } }, null, "elodie", false).name, "Élodie Dupont");
  assert.equal(helpers.staffSearchMatch(candidate, "Kenn97", "unmatched", false), null);
});

test("search rejects undersized, repeated, oversized and hidden-control input without listing users", async () => {
  for (const query of ["?search=", "?search=a", "?search=%20%20", "?search=ab&search=cd", "?search=ab%0A", "?search=" + "x".repeat(255), "?search=ab%E2%80%AE"]) {
    const api = fixture();
    assert.equal((await api.get(query)).status, 400, query);
    assert.equal(api.calls.pages.length + api.calls.reads.length + api.calls.writes.length, 0);
  }
});

test("wildcards and PostgREST punctuation are matched literally and never become query syntax", async () => {
  for (const search of ["%_", "*a", "a),id.not.is.null", "Kenn%", "Kenn_"]) {
    const api = fixture();
    const response = await api.get("?search=" + encodeURIComponent(search));
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.matches, []);
    assert.equal(api.calls.reads[0].column, "id");
  }
});

test("lookup returns at most ten matches even when a broad search matches more accounts", async () => {
  const users = Array.from({ length: 15 }, (_, index) => ({ ...candidate, id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`, email: `kenn${index}@example.invalid` }));
  const api = fixture({ pages: [users], profiles: [] });
  const response = await api.get("?search=kenn");
  assert.equal(response.body.matches.length, 10);
  assert.equal(api.calls.pages.length, 1);
  assert.equal(new Set(response.body.matches.map(row => row.user_id)).size, 10);
});

test("lookup searches subsequent Auth pages when an earlier full page has no match", async () => {
  const users = Array.from({ length: 1000 }, (_, index) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`, email: `other${index}@example.invalid`, user_metadata: {} }));
  const api = fixture({ pages: [users, [candidate]], profiles: [{ id: userId, username: "Kenn97" }] });
  assert.equal((await api.get("?search=Kenn97")).body.matches[0].user_id, userId);
  assert.deepEqual(api.calls.pages.map(options => options.page), [1, 2]);
  assert(api.calls.pages.every(options => options.perPage === 1000));
});

test("failed Auth or profile lookups fail closed instead of returning partial membership data", async () => {
  for (const options of [{ listError: true }, { profileError: true }]) {
    const api = fixture(options);
    const response = await api.get("?search=kenn");
    assert.equal(response.status, 503);
    assert.equal(Object.hasOwn(response.body, "matches"), false);
    assert.equal(api.calls.writes.length, 0);
  }
});

test("the existing staff list remains available without requesting Auth directory pages", async () => {
  const api = fixture();
  const response = await api.get("");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.items[0], { user_id: userId, permissions: ["inbox"], enabled: true });
  assert.equal(api.calls.pages.length, 0);
});

test("permission writes remain owner-only even if delegated staff reports a staff permission", async () => {
  const api = fixture({ owner: false });
  assert.equal((await api.post({ user_id: userId, permissions: ["inbox"], enabled: true })).status, 403);
  assert.equal(api.calls.lookups.length + api.calls.writes.length, 0);
});

test("a nickname, malformed UUID, nil UUID or non-string never reaches target lookup or permission writes", async () => {
  for (const id of ["Kenn97", "-".repeat(36), "22222222-2222-2222-2222-222222222222", "00000000-0000-0000-0000-000000000000", 123, null, userId + "x"]) {
    const api = fixture();
    const response = await api.post({ user_id: id, permissions: ["inbox"], enabled: true });
    assert.equal(response.status, 400, String(id));
    assert.match(response.body.error, /Sélectionnez un membre/);
    assert.equal(api.calls.lookups.length + api.calls.writes.length, 0);
  }
});

test("protected-owner errors are distinct from malformed identifiers and cannot change owner rights", async () => {
  const api = fixture();
  const response = await api.post({ user_id: "  " + ownerId.toUpperCase() + "  ", permissions: ["inbox"], enabled: false });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /propriétaire protégé/);
  assert.equal(api.calls.lookups.length + api.calls.writes.length, 0);
});

test("valid selected UUIDs are normalized, checked in Auth, and retain the existing permission whitelist", async () => {
  const api = fixture();
  assert.equal((await api.post({ user_id: "  " + userId.toUpperCase() + "  ", permissions: ["inbox"], enabled: true })).status, 200);
  assert.deepEqual(api.calls.lookups, [userId]);
  assert.equal(api.calls.writes[0].table, "admin_staff_permissions");
  assert.equal(api.calls.writes[0].value.user_id, userId);
  assert.equal(api.calls.writes[0].value.updated_by, ownerId);
  assert.equal(api.calls.writes[1].table, "admin_staff_audit");
  for (const permissions of [["staff"], ["inbox", "inbox"], ["unrecognized"], null]) {
    const invalid = fixture();
    assert.equal((await invalid.post({ user_id: userId, permissions, enabled: true })).status, 400);
    assert.equal(invalid.calls.writes.length, 0);
  }
});

test("an absent Auth account cannot receive permissions from a previously selected UUID", async () => {
  const api = fixture({ targetMissing: true });
  assert.equal((await api.post({ user_id: userId, permissions: ["inbox"], enabled: true })).status, 404);
  assert.equal(api.calls.writes.length, 0);
});
