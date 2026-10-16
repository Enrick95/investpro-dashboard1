import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const cjsModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.join(root, "lib/vip/performance-report.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, { module: cjsModule, exports: cjsModule.exports });
const report = trades => cjsModule.exports.buildVipPerformanceReport(trades);
const plain = value => JSON.parse(JSON.stringify(value));
const trade = changes => ({
  id: "manual:1", date: "2026-10-16", symbol: "XAUUSD", direction: "buy",
  status: "win", resultR: 2, source: "manual", ...changes,
});

test("one win, one loss and one BE produce a 50% winrate, not 66.7%", () => {
  const result = report([
    trade({ resultR: 2.5 }),
    trade({ id: "manual:2", status: "loss", resultR: -1 }),
    trade({ id: "manual:3", status: "breakeven", resultR: 0 }),
  ]);
  assert.deepEqual(plain(result.counts), { total: 3, closed: 3, wins: 1, losses: 1, breakevens: 1, tpWins: 0, open: 0, cancelled: 0, review: 0 });
  assert.equal(result.winrate, 50);
  assert.equal(result.totalR, 1.5);
  assert.equal(result.averageR, 0.5);
  assert.equal(result.rewardRiskRatio, 2.5);
  assert.equal(result.knownRCount, 3);
  assert.equal(result.rBasis, "recorded");
});

test("all rows stay in supplied order, with pending/cancelled/review excluded from metrics", () => {
  const result = report([
    trade({ id: "a", status: "open", resultR: 100 }),
    trade({ id: "b", status: "cancelled", resultR: 100 }),
    trade({ id: "c", status: "review", resultR: 100 }),
    trade({ id: "d", status: "loss", resultR: -0.4 }),
  ]);
  assert.deepEqual(plain(result.rows.map(row => row.id)), ["a", "b", "c", "d"]);
  assert.deepEqual(plain(result.rows.map(row => row.outcome)), ["OPEN", "CANCELLED", "REVIEW", "LOSS"]);
  assert.deepEqual(plain(result.rows.map(row => row.resultR)), [null, null, null, -0.4]);
  assert.deepEqual(plain(result.excludedCounts), { open: 1, cancelled: 1, review: 1 });
  assert.equal(result.counts.total, 4);
  assert.equal(result.counts.closed, 1);
  assert.equal(result.totalR, -0.4);
  assert.equal(result.winrate, 0);
});

test("an unknown R never becomes zero and blocks the complete sum without blocking status counts", () => {
  for (const missing of [null, undefined, NaN, Infinity, -Infinity, "2", "", false]) {
    const result = report([trade({ resultR: 3 }), trade({ id: "manual:2", resultR: missing })]);
    assert.equal(result.rows[1].resultR, null);
    assert.equal(result.totalR, null);
    assert.equal(result.knownRCount, 1);
    assert.equal(result.knownRSubtotal, 3);
    assert.equal(result.counts.wins, 2);
    assert.equal(result.winrate, 100);
  }
});

test("an empty period has no winrate or result, while closed BE with a recorded zero has 0 R", () => {
  const empty = report([]);
  assert.equal(empty.winrate, null);
  assert.equal(empty.totalR, null);
  assert.equal(empty.rBasis, null);
  assert.equal(empty.averageR, null);
  assert.equal(empty.rewardRiskRatio, null);
  assert.equal(empty.knownRCount, 0);
  const be = report([trade({ status: "breakeven", resultR: 0 })]);
  assert.equal(be.winrate, null);
  assert.equal(be.totalR, 0);
  assert.equal(be.averageR, 0);
  assert.equal(be.rewardRiskRatio, null);
  assert.equal(be.rows[0].outcome, "BE");
  const unknownBe = report([trade({ status: "breakeven", resultR: null })]);
  assert.equal(unknownBe.totalR, null);
});

test("Telegram TP3 is one winning signal and not three separate wins or a realized weighted exit", () => {
  const result = report([trade({ id: "telegram:1", source: "telegram", resultR: 3.2, target: 3 })]);
  assert.equal(result.counts.total, 1);
  assert.equal(result.counts.wins, 1);
  assert.equal(result.counts.tpWins, 1);
  assert.equal(result.rows[0].outcome, "TP3");
  assert.equal(result.totalR, 3.2);
  assert.equal(result.rBasis, "telegram_model");
  assert.equal(result.rows[0].rBasis, "telegram_model");
});

test("a TP label requires an explicit valid Telegram win target, never a guessed target from R", () => {
  for (const target of [null, undefined, 0, -1, 1.5, 21, Infinity, "2"]) {
    const result = report([trade({ source: "telegram", target, resultR: 4 })]);
    assert.equal(result.rows[0].outcome, "WIN");
    assert.equal(result.rows[0].target, null);
    assert.equal(result.counts.tpWins, 0);
  }
  assert.equal(report([trade({ source: "manual", target: 2 })]).rows[0].outcome, "WIN");
  for (const [status, outcome] of [["loss", "LOSS"], ["breakeven", "BE"], ["open", "OPEN"], ["cancelled", "CANCELLED"], ["review", "REVIEW"]]) {
    const row = report([trade({ source: "telegram", status, target: 3 })]).rows[0];
    assert.equal(row.outcome, outcome);
    assert.equal(row.target, null);
  }
});

test("mixed sources remain explicit and matching local IDs across sources are not silently merged", () => {
  const input = [trade({ id: "1", resultR: 0.7 }), trade({ id: "1", source: "telegram", resultR: 2, target: 1 })];
  const result = report(input);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rBasis, "mixed");
  assert.deepEqual(plain(result.rows.map(row => row.rBasis)), ["recorded", "telegram_model"]);
  assert.equal(result.totalR, 2.7);
  assert.deepEqual(input, [trade({ id: "1", resultR: 0.7 }), trade({ id: "1", source: "telegram", resultR: 2, target: 1 })]);
});

test("R is recorded as provided and never synthesized as a full SL or TP distance", () => {
  const result = report([trade({ status: "loss", resultR: -0.35 }), trade({ id: "manual:2", resultR: 1.125 })]);
  assert.equal(result.rows[0].resultR, -0.35);
  assert.equal(result.rows[1].resultR, 1.125);
  assert.equal(result.totalR, 0.775);
});

test("text is bounded and invisible controls removed; private journal fields never enter output", () => {
  const result = report([trade({
    symbol: "\nXAU\u202eUSD\t", date: "2026-10-16\n", id: "a\u0000b",
    email: "private@example.test", comment: "secret", screenshot_url: "https://private.test/chart",
  })]);
  assert.equal(result.rows[0].symbol, "XAU USD");
  assert.equal(result.rows[0].date, "2026-10-16");
  assert.equal(result.rows[0].id, "a b");
  assert.equal(Object.hasOwn(result.rows[0], "email"), false);
  assert.equal(Object.hasOwn(result.rows[0], "comment"), false);
  assert.equal(Object.hasOwn(result.rows[0], "screenshot_url"), false);
  assert.equal(report([trade({ symbol: "A".repeat(1000) })]).rows[0].symbol.length, 48);
  assert.equal(report([trade({ symbol: "\u200b\t" })]).rows[0].symbol, "—");
});

test("overflow cannot become a published infinite performance", () => {
  const result = report([trade({ resultR: Number.MAX_VALUE }), trade({ id: "manual:2", resultR: Number.MAX_VALUE })]);
  assert.equal(result.totalR, null);
  assert.equal(result.knownRSubtotal, null);
  assert.equal(result.knownRCount, 2);
});

test("average reward/risk uses average gain divided by average actual loss, not a -1R assumption", () => {
  const result = report([
    trade({ id: "win:1", resultR: 4 }), trade({ id: "win:2", resultR: 2 }),
    trade({ id: "loss:1", status: "loss", resultR: -0.5 }),
    trade({ id: "loss:2", status: "loss", resultR: -1.5 }),
    trade({ id: "be:1", status: "breakeven", resultR: 0 }),
  ]);
  assert.equal(result.rewardRiskRatio, 3);
  assert.equal(result.averageR, 0.8);
  assert.equal(result.totalR, 4);
  assert.equal(result.winrate, 50);
});

test("reward/risk requires known winning and losing R; unknown BE does not enter this ratio", () => {
  assert.equal(report([trade()]).rewardRiskRatio, null);
  assert.equal(report([trade({ status: "loss", resultR: -1 })]).rewardRiskRatio, null);
  for (const changes of [{ status: "win", resultR: null }, { status: "loss", resultR: null }]) {
    const result = report([trade(), trade({ status: "loss", resultR: -0.5 }), trade(changes)]);
    assert.equal(result.rewardRiskRatio, null);
    assert.equal(result.totalR, null);
    assert.equal(result.averageR, null);
  }
  const result = report([trade(), trade({ status: "loss", resultR: -0.5 }), trade({ status: "breakeven", resultR: null })]);
  assert.equal(result.rewardRiskRatio, 4);
  assert.equal(result.totalR, null);
  assert.equal(result.averageR, null);
});

test("contradictory R signs are unknown rather than silently changing the trade outcome", () => {
  for (const changes of [
    { status: "win", resultR: -2 }, { status: "win", resultR: 0 },
    { status: "loss", resultR: 2 }, { status: "loss", resultR: 0 },
    { status: "breakeven", resultR: 1 }, { status: "breakeven", resultR: -1 },
  ]) {
    const result = report([trade(changes)]);
    assert.equal(result.rows[0].status, changes.status);
    assert.equal(result.rows[0].resultR, null);
    assert.equal(result.totalR, null);
    assert.equal(result.knownRCount, 0);
  }
});
