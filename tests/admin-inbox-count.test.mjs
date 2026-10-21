import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "app/api/admin/inbox/count/route.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function routeFor(authenticateAdmin) {
  const cjsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: cjsModule, exports: cjsModule.exports,
    require(name) {
      if (name === "next/server") return { NextResponse: Response };
      if (name === "@/lib/admin/permissions") return { authenticateAdmin };
      throw new Error("Unexpected dependency: " + name);
    },
  });
  return cjsModule.exports;
}

function database(tables = {}, overrides = {}) {
  const reads = [];
  const admin = {
    from(table) {
      const read = { table };
      reads.push(read);
      return {
        select(fields, options) {
          read.fields = fields;
          read.options = { ...options };
          return {
            async in(column, statuses) {
              read.column = column;
              read.statuses = [...statuses];
              const override = overrides[table];
              if (override instanceof Error) throw override;
              if (typeof override === "function") return override();
              if (override !== undefined) return override;
              return {
                data: null,
                count: (tables[table] || []).filter(row => statuses.includes(row[column])).length,
                error: null,
              };
            },
          };
        },
      };
    },
  };
  return { admin, reads };
}

const request = () => new Request("https://investpro.test/api/admin/inbox/count", {
  headers: { Authorization: "Bearer test-transport-token" },
});
const row = status => ({ status, message: "PRIVATE message", email: "private@example.test", admin_note: "PRIVATE note" });

test("only a server-authorized inbox administrator can read the counts", async () => {
  for (const status of [401, 403, 503]) {
    const db = database();
    const req = request();
    let checked = false;
    const route = routeFor(async (received, permission) => {
      checked = true;
      assert.equal(received, req);
      assert.equal(permission, "inbox");
      return { error: "Access denied", status, admin: db.admin };
    });
    const response = await route.GET(req);
    assert.equal(checked, true);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { error: "Access denied" });
    assert.equal(db.reads.length, 0);
  }
});

test("the response counts every pending request beyond the old list limits and exposes no content", async () => {
  const db = database({
    support_tickets: [...Array.from({ length: 205 }, () => row("open")), row("in_progress"), row("answered"), row("resolved"), row("closed")],
    bug_reports: [row("open"), row("investigating"), row("resolved"), row("closed")],
    account_deletion_requests: [row("pending"), row("processing"), row("resolved"), row("rejected"), row("cancelled")],
  });
  const response = await routeFor(async () => ({ admin: db.admin })).GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { open_support: 206, open_bugs: 2, pending_deletions: 2, total: 210 });
  assert.deepEqual(db.reads, [
    { table: "support_tickets", fields: "id", options: { count: "exact", head: true }, column: "status", statuses: ["open", "in_progress"] },
    { table: "bug_reports", fields: "id", options: { count: "exact", head: true }, column: "status", statuses: ["open", "investigating"] },
    { table: "account_deletion_requests", fields: "id", options: { count: "exact", head: true }, column: "status", statuses: ["pending", "processing"] },
  ]);
});

test("a support answer removes pending work and a subsequent client reply adds it again", async () => {
  const ticket = row("open");
  const db = database({ support_tickets: [ticket] });
  const route = routeFor(async () => ({ admin: db.admin }));
  for (const [status, expected] of [["open", 1], ["answered", 0], ["open", 1], ["closed", 0]]) {
    ticket.status = status;
    assert.equal((await (await route.GET(request())).json()).total, expected);
  }
});

test("an empty queue is a confirmed zero rather than an unavailable counter", async () => {
  const db = database();
  const response = await routeFor(async () => ({ admin: db.admin })).GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { open_support: 0, open_bugs: 0, pending_deletions: 0, total: 0 });
});

test("any failed source returns a generic unavailable response without misleading partial counts", async () => {
  for (const table of ["support_tickets", "bug_reports", "account_deletion_requests"]) {
    for (const failure of [{ count: 0, error: { message: "PRIVATE database detail" } }, new Error("PRIVATE transport error")]) {
      const db = database({ support_tickets: [row("open")] }, { [table]: failure });
      const response = await routeFor(async () => ({ admin: db.admin })).GET(request());
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ["error"]);
      assert.equal(JSON.stringify(body).includes("PRIVATE"), false);
    }
  }
});

test("missing or invalid exact counts never become a successful zero", async () => {
  for (const count of [null, undefined, "1", NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const db = database({}, { support_tickets: { count, error: null } });
    const response = await routeFor(async () => ({ admin: db.admin })).GET(request());
    assert.equal(response.status, 503);
    assert.deepEqual(Object.keys(await response.json()), ["error"]);
  }
});

test("an unexpected authorization failure does not disclose details or access ticket tables", async () => {
  const response = await routeFor(async () => { throw new Error("PRIVATE auth configuration"); }).GET(request());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.equal(JSON.stringify(body).includes("PRIVATE"), false);
});
