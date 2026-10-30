import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const cjs = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(new URL("../lib/journal-withdrawals.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, { module: cjs, exports: cjs.exports });
const { buildJournalWithdrawals: build } = cjs.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const now = Date.parse("2026-10-30T12:00:00Z");
const iso = offset => new Date(now + offset).toISOString();
const account = (id = 69, extra = {}) => ({ id, name: `Account ${id}`, currency: "EUR", ...extra });
const sync = (id = 69, amount = 229, extra = {}, connection = {}) => ({
  active: true, status: "syncing", funding_summary: { inflows: 300, outflows: amount }, ...extra,
  investpro_mt_connections: { account_id: id, currency: "EUR", last_sync: iso(-1_000), observed_at: iso(-2_000), ...connection },
});

test("cumulative outflows appear once per saved journal account, separate from balance and trade P&L", () => {
  const result = build([account(69), account(70)], [sync(69), sync(70), sync(999, 1e9)], now);
  assert.deepEqual(plain(result.totals), [{ currency: "EUR", amount: 458, accountCount: 2 }]);
  assert.equal(result.availableCount, 2);
  assert.equal(result.totalCount, 2);
  const raw = sync(69, 229, { balance: 71, equity: 70, result_amount: -50, floating_pnl: -1 });
  const original = JSON.stringify(raw);
  assert.equal(build([account()], [raw], now).accounts[0].amount, 229);
  assert.equal(JSON.stringify(raw), original, "source data must not be changed");
});

test("missing summaries stay unknown while a broker-confirmed zero remains visible", () => {
  for (const value of [null, undefined, {}, [], { inflows: 1 }]) {
    const result = build([account()], [sync(69, 0, { funding_summary: value })], now);
    assert.equal(result.accounts[0].amount, null);
    assert.equal(result.availableCount, 0);
    assert.equal(result.totals.length, 0);
  }
  const result = build([account()], [sync(69, 0)], now);
  assert.equal(result.accounts[0].amount, 0);
  assert.equal(result.availableCount, 1);
  assert.equal(result.totals[0].amount, 0);
  assert.equal(build([account()], [], now).accounts[0].amount, null);
});

test("malformed JSON money is never silently interpreted as a withdrawal", () => {
  for (const amount of [undefined, null, "", " ", "229", "0", false, true, [], {}, -1, NaN, Infinity, -Infinity, 1e12]) {
    assert.equal(build([account()], [sync(69, 0, { funding_summary: { outflows: amount } })], now).accounts[0].amount, null, String(amount));
  }
});

test("unknown and repeated account IDs never leak or duplicate totals", () => {
  const result = build([account(), account("69"), account(0), account(" ")], [sync(), sync(), sync(1, 999)], now);
  assert.equal(result.totalCount, 1);
  assert.equal(result.availableCount, 1);
  assert.equal(result.totals[0].amount, 229);
  assert.equal(result.accounts[0].accountId, "69");
});

test("the newest actual valid snapshot wins over older higher totals and status timestamps", () => {
  const recent = sync(69, 10, { updated_at: iso(-50_000) });
  const old = sync(69, 1000, { updated_at: iso(0) }, { observed_at: iso(-60_000), last_sync: iso(-59_000) });
  for (const rows of [[old, recent], [recent, old]]) {
    assert.equal(build([account()], rows, now).accounts[0].amount, 10);
  }
});

test("a pending reconnection with no funding retains the previous known snapshot", () => {
  const old = sync(69, 229, { active: false, status: "stopped" }, { observed_at: iso(-600_000), last_sync: iso(-599_000), revoked: true });
  const pending = sync(69, 0, { funding_summary: null, status: "pending", updated_at: iso(0) }, { observed_at: null, last_sync: null });
  const result = build([account()], [pending, old], now);
  assert.equal(result.accounts[0].amount, 229);
  assert.equal(result.accounts[0].state, "paused");
  assert.equal(result.accounts[0].observedAt, iso(-600_000));
  assert.equal(result.staleCount, 1);
});

test("stale, error and stopped observations retain recorded totals with their status", () => {
  const scenarios = [
    [sync(), "available"],
    [sync(69, 229, {}, { observed_at: iso(-400_000), last_sync: iso(-399_000) }), "stale"],
    [sync(69, 229, { status: "error" }), "error"],
    [sync(69, 229, { active: false, status: "stopped" }), "paused"],
    [sync(69, 229, { status: "connecting" }), "pending"],
    [sync(69, 229, { status: "capacity" }), "pending"],
  ];
  for (const [row, state] of scenarios) {
    const result = build([account()], [row], now);
    assert.equal(result.accounts[0].amount, 229);
    assert.equal(result.accounts[0].state, state);
    assert.equal(result.staleCount, state === "available" ? 0 : 1);
  }
});

test("timestamps prove account synchronization, and missing dates do not create a zero", () => {
  const none = sync(69, 229, { updated_at: iso(-1000) }, { observed_at: null, last_sync: null });
  assert.equal(build([account()], [none], now).accounts[0].amount, null);
  const received = sync(69, 229, {}, { observed_at: "invalid", last_sync: iso(-10_000) });
  const row = build([account()], [received], now).accounts[0];
  assert.equal(row.amount, 229);
  assert.equal(row.observedAt, null);
  assert.equal(row.lastSync, iso(-10_000));
  const future = sync(69, 229, {}, { observed_at: iso(400_000), last_sync: iso(400_000) });
  assert.equal(build([account()], [future], now).accounts[0].amount, null);
});

test("native currencies remain separate and missing accounts cannot become a complete total", () => {
  const accounts = [account(69), account(70), account(75, { currency: "USD" }), account(13, { currency: "USD" })];
  const connections = [sync(69), sync(70), sync(13, 4305.12, {}, { currency: "USD" }),
    sync(75, 0, { funding_summary: null, status: "error" }, { currency: "USD", observed_at: null, last_sync: null })];
  const result = build(accounts, connections, now);
  assert.deepEqual(plain(result.totals), [
    { currency: "EUR", amount: 458, accountCount: 2 },
    { currency: "USD", amount: 4305.12, accountCount: 1 },
  ]);
  assert.equal(result.availableCount, 3);
  assert.equal(result.totalCount, 4);
  assert.equal(result.accounts.find(row => row.accountId === "75").amount, null);
});

test("account filters narrow funding by account ID without changing the original totals", () => {
  const accounts = [account(69), account(70)];
  const rows = [sync(69, 229), sync(70, 12)];
  const all = build(accounts, rows, now);
  const selected = build(accounts.filter(row => row.id === 70), rows, now);
  assert.equal(selected.totals[0].amount, 12);
  assert.equal(selected.totalCount, 1);
  assert.equal(all.totals[0].amount, 241);
});

test("a currency conflict blocks unsafe amounts instead of silently relabeling them", () => {
  const result = build([account()], [sync(69, 229, {}, { currency: "USD" })], now);
  assert.equal(result.accounts[0].amount, null);
  assert.equal(result.totals.length, 0);
  const fallback = build([account()], [sync(69, 229, {}, { currency: null })], now);
  assert.equal(fallback.accounts[0].currency, "EUR");
  assert.equal(fallback.accounts[0].amount, 229);
});

test("empty selections remain empty, and malformed connection values are ignored", () => {
  assert.deepEqual(plain(build([], [sync()], now)), { accounts: [], totals: [], availableCount: 0, totalCount: 0, staleCount: 0 });
  const result = build([account()], [null, undefined, false, [], {}, { investpro_mt_connections: [] }], now);
  assert.equal(result.accounts[0].state, "unavailable");
  assert.equal(result.availableCount, 0);
});
