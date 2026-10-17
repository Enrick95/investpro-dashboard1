import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const userId = "743319c5-d9c1-4d2a-bd57-fd11f833ca01";
const otherId = "743319c5-d9c1-4d2a-bd57-fd11f833ca02";
const plain = (value) => JSON.parse(JSON.stringify(value));

function compile(file, modules = {}, onFetch = () => {}) {
  const cjsModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, {
    module: cjsModule,
    exports: cjsModule.exports,
    fetch() { onFetch(); throw new Error("CONNECTION_NETWORK_FORBIDDEN_IN_HISTORY_TEST"); },
    require(name) {
      assert(Object.hasOwn(modules, name), `Unexpected import ${name}`);
      return modules[name];
    },
  });
  return cjsModule.exports;
}

function fixture({ accounts = [], trades = [], accountsError = null, journalError = null } = {}) {
  const calls = [];
  let connectionFetches = 0;
  const scope = compile("lib/trading/activeScope.ts", {}, () => { connectionFetches++; });
  const journal = compile("lib/metasync/loadJournal.ts", { "@/lib/trading/activeScope": scope });
  const db = {
    from(table) {
      // History visibility must not depend on the status of an external connection.
      assert(["trading_accounts", "trading_journal"].includes(table), `Unexpected connection lookup ${table}`);
      const call = { table, filters: [], order: [] };
      calls.push(call);
      const result = () => {
        assert(call.filters.some(([key, value]) => key === "user_id" && value === userId), "Every history lookup must be scoped to the signed-in user");
        const rows = (table === "trading_accounts" ? accounts : trades).filter((row) => row.user_id === userId);
        const selected = call.range ? rows.slice(call.range[0], call.range[1] + 1) : rows;
        return { data: selected, error: table === "trading_accounts" ? accountsError : journalError };
      };
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        order(key, value) { call.order.push([key, value]); return query; },
        range(first, last) { call.range = [first, last]; return query; },
        then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); },
      };
      return query;
    },
  };
  return { db, scope, journal, calls, get connectionFetches() { return connectionFetches; } };
}

test("stored owned accounts remain selectable when MetaTrader is offline, stale, revoked or has no connection row", async () => {
  const f = fixture({ accounts: [
    { id: 11, user_id: userId, connection_type: "automatic", last_sync: "2020-01-01T00:00:00Z", revoked: false },
    { id: 12, user_id: userId, connection_type: "automatic", last_sync: null, revoked: true, active: false },
    { id: 13, user_id: userId, connection_type: "automatic", last_sync: "invalid", status: "disconnected" },
    { id: 14, user_id: userId, connection_type: "manual" },
    { id: 15, user_id: userId, connection_type: null },
    { id: 16, user_id: userId, connection_type: "future-provider" },
    { id: 99, user_id: otherId, connection_type: "manual" },
  ] });
  const result = await f.scope.loadActiveTradingScope(f.db, userId);
  assert.deepEqual([...result.activeIds], [11, 12, 13, 14, 15, 16]);
  assert.deepEqual([...result.existingIds], [11, 12, 13, 14, 15, 16]);
  assert.deepEqual(Array.from(result.activeAccountIds), [11, 12, 13, 14, 15, 16]);
  assert.equal(f.connectionFetches, 0);
  assert.deepEqual(f.calls.map((call) => call.table), ["trading_accounts"]);
});

test("an empty owned account list never inherits another member's account or calls a connection API", async () => {
  const f = fixture({ accounts: [{ id: 99, user_id: otherId, connection_type: "manual" }] });
  const result = await f.scope.loadActiveTradingScope(f.db, userId);
  assert.equal(result.activeIds.size, 0);
  assert.equal(result.existingIds.size, 0);
  assert.deepEqual(Array.from(result.activeAccountIds), []);
  assert.equal(f.connectionFetches, 0);
});

test("invalid account identifiers cannot create a history scope", async () => {
  const f = fixture({ accounts: [
    { id: 17, user_id: userId },
    ...[null, undefined, "", 0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((id) => ({ id, user_id: userId })),
  ] });
  const result = await f.scope.loadActiveTradingScope(f.db, userId);
  assert.deepEqual([...result.activeIds], [17]);
  assert.deepEqual([...result.existingIds], [17]);
});

test("an account read failure retains the existing fail-closed contract without exposing partial records", async () => {
  const f = fixture({ accounts: [{ id: 11, user_id: userId }], accountsError: { message: "PRIVATE_DATABASE_ERROR_FIXTURE" } });
  const result = await f.scope.loadActiveTradingScope(f.db, userId);
  assert.equal(result.activeIds.size, 0);
  assert.equal(result.existingIds.size, 0);
  assert.deepEqual(Array.from(result.activeAccountIds), []);
  assert.equal(f.connectionFetches, 0);
});

test("trade scoping keeps owned account history and excludes null, deleted or foreign account references", () => {
  const f = fixture();
  const rows = [
    { id: 1, account_id: 11 }, { id: 2, account_id: 12 },
    { id: 3, account_id: null }, { id: 4, account_id: 98 }, { id: 5, account_id: 99 },
  ];
  assert.deepEqual(plain(f.scope.scopeTradesToActiveAccounts(rows, new Set([11, 12]))), rows.slice(0, 2));
  assert.deepEqual(plain(f.scope.scopeTradesToActiveAccounts(rows, new Set())), []);
  assert.deepEqual(rows.map((row) => row.id), [1, 2, 3, 4, 5]);
});

test("the journal loader preserves paginated offline-account history without making a connection request", async () => {
  const history = Array.from({ length: 1001 }, (_, index) => ({
    id: index + 1, user_id: userId, account_id: 11, trade_date: "2026-10-01T12:00:00Z", status: "win",
  }));
  const f = fixture({
    accounts: [{ id: 11, user_id: userId, connection_type: "automatic", last_sync: "2020-01-01T00:00:00Z", active: false }],
    trades: [
      ...history,
      { id: 2000, user_id: userId, account_id: 99 },
      { id: 2001, user_id: userId, account_id: null },
      { id: 2002, user_id: otherId, account_id: 11 },
    ],
  });
  const result = await f.journal.loadJournal(f.db, userId);
  assert.equal(result.error, null);
  assert.deepEqual(plain(result.data), history);
  assert.equal(f.connectionFetches, 0);
  assert.deepEqual(f.calls.filter((call) => call.table === "trading_journal").map((call) => call.range), [[0, 999], [1000, 1999]]);
});

test("journal read errors remain visible and do not trigger account or connection work", async () => {
  const error = { message: "JOURNAL_READ_FAILURE_FIXTURE" };
  const f = fixture({ journalError: error });
  const result = await f.journal.loadJournal(f.db, userId);
  assert.equal(result.data, null);
  assert.equal(result.error, error);
  assert.equal(f.connectionFetches, 0);
  assert.deepEqual(f.calls.map((call) => call.table), ["trading_journal"]);
});
