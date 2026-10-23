import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "lib/copier/account-metrics.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const cjsModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: cjsModule,
  exports: cjsModule.exports,
  require(name) { throw new Error(`Unexpected runtime dependency: ${name}`); },
});
const { buildCopierAccountMetrics, aggregateCopierPnl, COPIER_METRICS_FRESHNESS_MS } = cjsModule.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const now = Date.parse("2026-10-23T10:00:00Z");
const iso = (offset = 0) => new Date(now + offset).toISOString();
const receiver = (extra = {}) => ({ id: "r1", alias: "REAL1", login: "12345", platform: "MT5", server: "Broker-Live 2", ...extra });
const sync = (extra = {}, connection = {}) => ({
  id: "sync1", active: true, status: "active", equity: 330, floating_pnl: 10, open_positions: 1,
  metrics_observed_at: iso(-5_000),
  investpro_mt_connections: { account_id: 7, login: "12345", platform: "MT5", server: "Broker-Live 2", currency: "EUR", last_sync: iso(-2_000), ...connection },
  ...extra,
});
const account = (extra = {}) => ({ id: 7, current_balance: 320, currency: "EUR", ...extra });
const metrics = (rows = [sync()], receivers = [receiver()], accounts = [account()]) => buildCopierAccountMetrics(receivers, accounts, rows, now);

test("an exact saved MetaSync identity supplies account balance and explicit floating P&L", () => {
  const [result] = metrics();
  assert.equal(result.balance, 320);
  assert.equal(result.equity, 330);
  assert.equal(result.floatingPnl, 10);
  assert.equal(result.openPositions, 1);
  assert.equal(result.currency, "EUR");
  assert.equal(result.status, "fresh");
  assert.equal(result.isFresh, true);
  assert.equal(result.lastSync, iso(-2_000));
});

test("the same login on another server or platform can never supply a balance", () => {
  for (const connection of [{ server: "Other-Live" }, { platform: "MT4" }, { login: "12346" }]) {
    const [result] = metrics([sync({}, connection)]);
    assert.equal(result.hasSync, false);
    assert.equal(result.balance, null);
    assert.equal(result.equity, null);
    assert.equal(result.floatingPnl, null);
  }
});

test("identity matching normalizes surrounding whitespace and case, preserving server digits", () => {
  const [result] = metrics([sync({}, { server: "  BROKER-live 2 ", platform: " mt5 ", login: " 12345 " })]);
  assert.equal(result.isFresh, true);
  assert.equal(metrics([sync({}, { server: "Broker-Live2" })])[0].hasSync, false);
});

test("a similarly named REAL3 account cannot substitute for a missing MetaSync connection", () => {
  const [result] = metrics([], [receiver({ alias: "REAL3" })], [account({ name: "REAL3", login: "12345" })]);
  assert.equal(result.status, "missing");
  assert.equal(result.sourceAccountId, null);
  assert.equal(result.balance, null);
  assert.equal(result.currency, null);
});

test("the account must be linked by its saved account_id, never its order or alias", () => {
  const [result] = metrics([sync({}, { account_id: 99 })], [receiver()], [account(), account({ id: 99, current_balance: 432 })]);
  assert.equal(result.balance, 432);
  assert.equal(metrics([sync({}, { account_id: null })])[0].balance, null);
  assert.equal(metrics([sync({}, { account_id: 0 })])[0].balance, null);
});

test("a hosted snapshot can exist before an account row without fabricating a balance", () => {
  const [result] = metrics([sync()], [receiver()], []);
  assert.equal(result.hasSync, true);
  assert.equal(result.balance, null);
  assert.equal(result.equity, 330);
  assert.equal(result.floatingPnl, 10);
});

test("zero balances, P&L and open positions are confirmed values rather than missing", () => {
  const result = metrics([sync({ floating_pnl: 0, open_positions: 0, equity: 0 })], [receiver()], [account({ current_balance: 0 })]);
  assert.equal(result[0].balance, 0);
  assert.equal(result[0].floatingPnl, 0);
  const total = aggregateCopierPnl(result);
  assert.equal(total.coveredCount, 1);
  assert.equal(total.openPositions, 0);
  assert.equal(total.currencies[0].pnl, 0);
});

test("null, blank, boolean and nonfinite payloads never become false zero readings", () => {
  for (const value of [null, undefined, "", " ", false, true, NaN, Infinity, "Infinity", "0x10", {}, []]) {
    const [result] = metrics([sync({ floating_pnl: value, equity: value, open_positions: value })]);
    assert.equal(result.floatingPnl, null, `P&L rejected: ${String(value)}`);
    assert.equal(result.equity, null);
    assert.equal(result.openPositions, null);
  }
});

test("finite decimal numeric strings are accepted while invalid position counts remain unknown", () => {
  const [result] = metrics([sync({ floating_pnl: " -5.75 ", equity: "314.25", open_positions: "2" })]);
  assert.equal(result.floatingPnl, -5.75);
  assert.equal(result.equity, 314.25);
  assert.equal(result.openPositions, 2);
  for (const count of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(metrics([sync({ open_positions: count })])[0].openPositions, null);
});

test("credits do not become trading gains, and missing floating P&L is never equity minus balance", () => {
  assert.equal(metrics([sync({ equity: 420, floating_pnl: 0 })])[0].floatingPnl, 0);
  const total = aggregateCopierPnl(metrics([sync({ equity: 420, floating_pnl: null })]));
  assert.equal(total.coveredCount, 0);
  assert.deepEqual(plain(total.currencies), []);
});

test("a sample expires after 180 seconds even when the API or last_sync was just refreshed", () => {
  assert.equal(COPIER_METRICS_FRESHNESS_MS, 180_000);
  assert.equal(metrics([sync({ metrics_observed_at: iso(-180_000) })])[0].isFresh, true);
  const [expired] = metrics([sync({ metrics_observed_at: iso(-180_001) }, { last_sync: iso() })]);
  assert.equal(expired.status, "stale");
  assert.equal(expired.balance, 320);
  assert.equal(expired.floatingPnl, 10);
  assert.equal(aggregateCopierPnl([expired]).coveredCount, 0);
});

test("missing, invalid and excessive future observation times are never current", () => {
  for (const observed of [null, "", "bad-date", iso(5_001)]) assert.equal(metrics([sync({ metrics_observed_at: observed })])[0].isFresh, false);
  assert.equal(metrics([sync({ metrics_observed_at: iso(5_000) })])[0].isFresh, true);
  assert.equal(buildCopierAccountMetrics([receiver()], [account()], [sync()], NaN)[0].isFresh, false);
});

test("a later transport receipt does not reject a valid sample; a newer actual observation does", () => {
  assert.equal(metrics([sync({ metrics_observed_at: iso(-60_000) }, { last_sync: iso() })])[0].isFresh, true);
  assert.equal(metrics([sync({ metrics_observed_at: iso(-60_000) }, { observed_at: iso() })])[0].isFresh, false);
  assert.equal(metrics([sync({}, { observed_at: iso(-4_000) })])[0].isFresh, true);
});

test("paused, revoked, failed and pending connections cannot contribute fresh totals", () => {
  for (const extra of [{ active: false }, { status: "paused" }, { status: "error" }, { status: "pending" }, { revoked: true }, { revoked_at: iso() }]) {
    const result = metrics([sync(extra)]);
    assert.equal(result[0].isFresh, false);
    assert.equal(aggregateCopierPnl(result).coveredCount, 0);
  }
  assert.equal(metrics([sync({}, { revoked_at: iso() })])[0].isFresh, false);
  assert.equal(metrics([sync({}, { revoked: true })])[0].isFresh, false);
});

test("new account placeholder zeros are hidden until the first broker snapshot is confirmed", () => {
  for (const status of ["pending", "error", "active"]) {
    const [result] = metrics([sync({ metrics_observed_at: null, status, equity: 0 }, { last_sync: null, observed_at: null })], [receiver()], [account({ current_balance: 0 })]);
    assert.equal(result.balance, null);
    assert.equal(result.equity, null);
    assert.equal(result.isFresh, false);
  }
});

test("an active replacement wins over a stopped connection, choosing its newest real snapshot", () => {
  const result = metrics([sync({ id: "old", active: false, floating_pnl: 999, metrics_observed_at: iso() }), sync({ id: "new", floating_pnl: 12 })]);
  assert.equal(result[0].floatingPnl, 12);
  assert.equal(result[0].isFresh, true);
});

test("money totals remain separate for EUR and USD and preserve negative values", () => {
  const rows = [sync({ floating_pnl: 10 }), sync({ floating_pnl: -12 }, { login: "999", currency: "USD", account_id: 8 }), sync({ floating_pnl: -3 }, { login: "777", currency: "EUR", account_id: 9 })];
  const result = metrics(rows, [receiver(), receiver({ id: "r2", login: "999", alias: "REAL2" }), receiver({ id: "r3", login: "777", alias: "REAL3" })]);
  const total = aggregateCopierPnl(result);
  assert.deepEqual(plain(total.currencies), [{ currency: "EUR", pnl: 7, accountCount: 2 }, { currency: "USD", pnl: -12, accountCount: 1 }]);
  assert.equal(total.coveredCount, 3);
  assert.equal(total.totalCount, 3);
  assert.equal(total.openPositions, 3);
});

test("a missing account is explicitly excluded and unknown positions are never counted as zero", () => {
  const result = metrics([sync()], [receiver(), receiver({ id: "r3", alias: "REAL3", login: "333" })]);
  const total = aggregateCopierPnl(result);
  assert.equal(total.totalCount, 2);
  assert.equal(total.coveredCount, 1);
  assert.deepEqual(plain(total.missingAliases), ["REAL3"]);
  assert.equal(total.openPositions, null);
  assert.equal(total.oldestObservedAt, iso(-5_000));
});

test("duplicate receiver aliases for one exact trading identity do not double-count money or positions", () => {
  const result = metrics([sync()], [receiver(), receiver({ id: "duplicate", alias: "Duplicate" })]);
  const total = aggregateCopierPnl(result);
  assert.equal(total.totalCount, 1);
  assert.equal(total.coveredCount, 1);
  assert.equal(total.currencies[0].pnl, 10);
  assert.equal(total.openPositions, 1);
});

test("without a confirmed currency, no USD default or mixed-currency total is invented", () => {
  for (const currency of [null, "", "euros", "$$$"]) {
    const result = metrics([sync({}, { currency })], [receiver()], [account({ currency: null })]);
    assert.equal(result[0].currency, null);
    assert.equal(aggregateCopierPnl(result).coveredCount, 0);
  }
  const [conflict] = metrics([sync({}, { currency: "USD" })]);
  assert.equal(conflict.currency, null);
  assert.equal(conflict.balance, null);
  assert.equal(aggregateCopierPnl([conflict]).coveredCount, 0);
});

test("no accounts or no available samples produce an unknown result rather than a fabricated flat P&L", () => {
  assert.deepEqual(plain(aggregateCopierPnl([])), { currencies: [], coveredCount: 0, totalCount: 0, missingAliases: [], openPositions: null, oldestObservedAt: null });
  const total = aggregateCopierPnl(metrics([], [receiver()]));
  assert.equal(total.coveredCount, 0);
  assert.deepEqual(plain(total.currencies), []);
  assert.equal(total.openPositions, null);
});
