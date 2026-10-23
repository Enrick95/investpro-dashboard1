import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const pageSource = fs.readFileSync(path.join(root, "app/dashboard/copieur/page.tsx"), "utf8");
const pageAst = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration;
function collect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "loadFinancialRows") declaration = `const ${node.getText(pageAst)};`;
  ts.forEachChild(node, collect);
}
collect(pageAst);
assert(declaration, "The actual page financial loader must exist");
const compiled = ts.transpileModule(`${declaration}\nmodule.exports = { loadFinancialRows };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const reply = (connections = [{ id: "snapshot-new", floating_pnl: 12 }], brokers = [{ id: "broker-new" }]) => ({
  ok: true, json: async () => ({ connections, brokers }),
});

function harness({ auth = async () => ({ data: { user: { id: "user-1" } } }), dayRead = async () => ({ day: "2026-10-23", rows: [], readAt: 1 }) } = {}) {
  const queries = [];
  const requests = [];
  const setters = [];
  const displayed = {
    accounts: [{ id: 7, current_balance: 320 }],
    hostedAccountSyncs: [{ id: "snapshot-old", floating_pnl: 10 }],
    hostedBrokers: [{ id: "broker-old" }],
    dailySnapshot: { day: "2026-10-23", rows: [{ id: "old-trade" }], readAt: 0 },
    dailyReadFailed: false,
    financialRefreshError: false,
    financialRefreshing: false,
  };
  const refs = { financialRequest: { current: null }, financialEpoch: { current: 0 } };
  const set = name => value => { setters.push(name); displayed[name] = value; };
  const cjsModule = { exports: {} };
  const supabase = {
    auth: { getUser: auth },
    from(table) {
      return { select(columns) { return { eq(column, value) {
        return new Promise((resolve, reject) => queries.push({ table, columns, column, value, resolve, reject }));
      } }; } };
    },
  };
  vm.runInNewContext(compiled, {
    ...refs,
    module: cjsModule,
    exports: cjsModule.exports,
    supabase,
    useCallback: callback => callback,
    loadCopierDaySnapshot: dayRead,
    setDailySnapshot: set("dailySnapshot"),
    setDailyReadFailed: set("dailyReadFailed"),
    setAccounts: set("accounts"),
    setHostedAccountSyncs: set("hostedAccountSyncs"),
    setHostedBrokers: set("hostedBrokers"),
    setFinancialRefreshError: set("financialRefreshError"),
    setFinancialRefreshing: set("financialRefreshing"),
    setConnectionNow: set("connectionNow"),
    AbortSignal: { timeout: ms => ({ timeoutMs: ms }) },
    fetch(url, options) { return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })); },
  });
  return { load: cjsModule.exports.loadFinancialRows, refs, displayed, setters, queries, requests };
}

test("polling and manual refresh share one in-flight authenticated read", async () => {
  const h = harness();
  const first = h.load();
  const second = h.load();
  assert.equal(first, second);
  await flush();
  assert.equal(h.queries.length, 1);
  assert.equal(h.requests.length, 1);
  assert.deepEqual({ table: h.queries[0].table, column: h.queries[0].column, value: h.queries[0].value }, { table: "trading_accounts", column: "user_id", value: "user-1" });
  assert.equal(h.requests[0].url, "/api/metasync/hosted");
  assert.equal(h.requests[0].options.cache, "no-store");
  assert.equal(h.requests[0].options.signal.timeoutMs, 15_000);
  const accounts = [{ id: 7, current_balance: 321 }];
  h.queries[0].resolve({ data: accounts, error: null });
  await flush();
  assert.notEqual(h.displayed.accounts, accounts, "half a new snapshot cannot replace the old account balance");
  h.requests[0].resolve(reply());
  await Promise.all([first, second]);
  assert.equal(h.displayed.accounts, accounts);
  assert.equal(h.displayed.hostedAccountSyncs[0].id, "snapshot-new");
  assert.equal(h.displayed.financialRefreshError, false);
  assert.equal(h.displayed.financialRefreshing, false);
});

test("a failed account query preserves both the old balance and hosted snapshot", async () => {
  const h = harness();
  const previousAccounts = h.displayed.accounts;
  const previousSnapshot = h.displayed.hostedAccountSyncs;
  const previousBrokers = h.displayed.hostedBrokers;
  const reading = h.load();
  await flush();
  h.queries[0].resolve({ data: null, error: { message: "Temporarily unavailable" } });
  h.requests[0].resolve(reply());
  await reading;
  assert.equal(h.displayed.accounts, previousAccounts);
  assert.equal(h.displayed.hostedAccountSyncs, previousSnapshot);
  assert.equal(h.displayed.hostedBrokers, previousBrokers);
  assert.equal(h.displayed.financialRefreshError, true);
  assert.equal(h.displayed.financialRefreshing, false);
});

test("failed HTTP, network and malformed hosted responses cannot erase the last good pair", async () => {
  for (const failure of ["http", "network", "malformed"]) {
    const h = harness();
    const previousAccounts = h.displayed.accounts;
    const previousSnapshot = h.displayed.hostedAccountSyncs;
    const reading = h.load();
    await flush();
    h.queries[0].resolve({ data: [{ id: 7, current_balance: 999 }], error: null });
    if (failure === "http") h.requests[0].resolve({ ok: false, json: async () => ({ error: "Unavailable" }) });
    else if (failure === "network") h.requests[0].reject(new Error("Offline"));
    else h.requests[0].resolve({ ok: true, json: async () => ({ connections: null }) });
    await reading;
    assert.equal(h.displayed.accounts, previousAccounts, failure);
    assert.equal(h.displayed.hostedAccountSyncs, previousSnapshot, failure);
    assert.equal(h.displayed.financialRefreshError, true, failure);
    assert.equal(h.refs.financialRequest.current, null, failure);
  }
});

test("a stale response after cleanup cannot write data or clear a newer request", async () => {
  const h = harness();
  const oldRead = h.load();
  await flush();
  // The real effect cleanup increments this epoch and releases the shared ref.
  h.refs.financialEpoch.current += 1;
  h.refs.financialRequest.current = null;
  const newRead = h.load();
  await flush();
  h.setters.length = 0;
  h.queries[0].resolve({ data: [{ id: "obsolete" }], error: null });
  h.requests[0].resolve(reply([{ id: "obsolete" }]));
  await oldRead;
  assert.equal(h.setters.length, 0, "an obsolete epoch cannot update React state after cleanup");
  assert.equal(h.refs.financialRequest.current, newRead, "the old request cannot release a newer request's lock");
  h.queries[1].resolve({ data: [{ id: "current" }], error: null });
  h.requests[1].resolve(reply([{ id: "current" }]));
  await newRead;
  assert.equal(h.displayed.accounts[0].id, "current");
  assert.equal(h.displayed.hostedAccountSyncs[0].id, "current");
  assert.equal(h.refs.financialRequest.current, null);
});

test("cleanup while authentication is pending prevents financial queries from starting", async () => {
  let authenticate;
  const h = harness({ auth: () => new Promise(resolve => { authenticate = resolve; }) });
  const reading = h.load();
  h.refs.financialEpoch.current += 1;
  h.refs.financialRequest.current = null;
  h.setters.length = 0;
  authenticate({ data: { user: { id: "user-1" } } });
  await reading;
  assert.equal(h.queries.length, 0);
  assert.equal(h.requests.length, 0);
  assert.equal(h.setters.length, 0);
});

test("a settled failure releases the lock and a successful retry replaces the pair and error state", async () => {
  const h = harness();
  const failed = h.load();
  await flush();
  h.queries[0].reject(new Error("Database request failed"));
  h.requests[0].resolve(reply());
  await failed;
  assert.equal(h.refs.financialRequest.current, null);
  assert.equal(h.displayed.financialRefreshError, true);
  assert.equal(h.displayed.financialRefreshing, false);
  const retried = h.load();
  assert.notEqual(retried, failed);
  await flush();
  assert.equal(h.queries.length, 2);
  h.queries[1].resolve({ data: [{ id: "retry-success" }], error: null });
  h.requests[1].resolve(reply([{ id: "retry-success" }]));
  await retried;
  assert.equal(h.displayed.accounts[0].id, "retry-success");
  assert.equal(h.displayed.hostedAccountSyncs[0].id, "retry-success");
  assert.equal(h.displayed.financialRefreshError, false);
  assert.equal(h.displayed.financialRefreshing, false);
  assert.equal(h.refs.financialRequest.current, null);
});

test("missing authentication never makes an unauthenticated financial request", async () => {
  const h = harness({ auth: async () => ({ data: { user: null } }) });
  const previous = h.displayed.accounts;
  await h.load();
  assert.equal(h.queries.length, 0);
  assert.equal(h.requests.length, 0);
  assert.equal(h.displayed.accounts, previous);
  assert.equal(h.displayed.financialRefreshing, false);
  assert.equal(h.refs.financialRequest.current, null);
});

test("the MetaSync recovery link is reachable independently of the receiver selection button", () => {
  let found = false;
  function inspect(node, ancestors = []) {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(pageAst);
      if (tag === "a" && node.getText(pageAst).includes("Relier MetaSync pour afficher le solde")) {
        found = true;
        assert(!ancestors.includes("button"), "an account recovery link must not be nested inside a selection button");
      }
      ts.forEachChild(node, child => inspect(child, [...ancestors, tag]));
    } else ts.forEachChild(node, child => inspect(child, ancestors));
  }
  inspect(pageAst);
  assert(found, "the missing-sync recovery link must remain present");
});


test("failed daily history keeps the last daily result while fresh account metrics still update", async () => {
  const h = harness({ dayRead: async () => { throw new Error("History offline"); } });
  const previous = h.displayed.dailySnapshot;
  const reading = h.load();
  await flush();
  h.queries[0].resolve({ data: [{ id: 7, current_balance: 321 }], error: null });
  h.requests[0].resolve(reply());
  await reading;
  assert.equal(h.displayed.dailySnapshot, previous);
  assert.equal(h.displayed.dailyReadFailed, true);
  assert.equal(h.displayed.accounts[0].current_balance, 321);
  assert.equal(h.displayed.financialRefreshError, false);
});

test("a delayed daily read cannot overwrite data after the page has changed", async () => {
  let finish;
  const h = harness({ dayRead: () => new Promise(resolve => { finish = resolve; }) });
  const previous = h.displayed.dailySnapshot;
  const reading = h.load();
  await flush();
  h.queries[0].resolve({ data: [{ id: 7, current_balance: 321 }], error: null });
  h.requests[0].resolve(reply());
  h.refs.financialEpoch.current += 1;
  h.refs.financialRequest.current = null;
  h.setters.length = 0;
  finish({ day: "2026-10-23", rows: [], readAt: 2 });
  await reading;
  assert.equal(h.displayed.dailySnapshot, previous);
  assert.equal(h.setters.length, 0);
});
