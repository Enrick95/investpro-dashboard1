import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(file, modules = {}) {
  const cjs = { exports: {} };
  const source = fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: cjs, exports: cjs.exports, require(name) { return Object.hasOwn(modules, name) ? modules[name] : require(name); } });
  return cjs.exports;
}
const metricsModule = compile("lib/copier/account-metrics.ts");
const dayModule = compile("lib/copier/day-result.ts", { "./account-metrics": metricsModule });
const { parisDayKey, copierParisDayWindow, aggregateCopierDayResult: aggregate } = dayModule;
const plain = value => JSON.parse(JSON.stringify(value));
const now = Date.parse("2026-10-23T15:30:00Z");
const iso = offset => new Date(now + offset).toISOString();
const metric = (extra = {}) => ({
  receiverId: "r1", alias: "REAL1", identityKey: "MT5:123:broker-live", sourceAccountId: 7,
  balance: 330, equity: 330, floatingPnl: 0, openPositions: 0, currency: "EUR",
  lastSync: iso(-2_000), metricsObservedAt: iso(-3_000), status: "fresh", hasSync: true, isFresh: true, ...extra,
});
const trade = (extra = {}) => ({
  id: 10, account_id: 7, trade_date: "2026-10-23T10:00:00Z", status: "win", result_amount: 12.4,
  sync_connection_id: "offline-sync-1", sync_external_id: "mt5:10", ...extra,
});
const snapshot = (rows = [trade()], extra = {}) => ({ day: "2026-10-23", rows, readAt: now, ...extra });

test("Paris day keys do not depend on the process timezone or UTC date", () => {
  assert.equal(parisDayKey("2026-10-22T22:30:00Z"), "2026-10-23");
  assert.equal(parisDayKey("2026-10-23T22:30:00Z"), "2026-10-24");
  assert.equal(parisDayKey("invalid"), null);
  assert.equal(parisDayKey(NaN), null);
});

test("normal Paris day boundaries are correct in summer and winter", () => {
  assert.deepEqual(plain(copierParisDayWindow(now)), { day: "2026-10-23", start: "2026-10-22T22:00:00.000Z", end: "2026-10-23T22:00:00.000Z" });
  assert.deepEqual(plain(copierParisDayWindow(Date.parse("2026-01-15T12:00:00Z"))), { day: "2026-01-15", start: "2026-01-14T23:00:00.000Z", end: "2026-01-15T23:00:00.000Z" });
});

test("the spring clock change produces a 23-hour day and autumn a 25-hour day", () => {
  const spring = copierParisDayWindow(Date.parse("2026-03-29T12:00:00Z"));
  const autumn = copierParisDayWindow(Date.parse("2026-10-25T12:00:00Z"));
  assert.equal(spring.start, "2026-03-28T23:00:00.000Z");
  assert.equal(spring.end, "2026-03-29T22:00:00.000Z");
  assert.equal(Date.parse(spring.end) - Date.parse(spring.start), 23 * 3600000);
  assert.equal(autumn.start, "2026-10-24T22:00:00.000Z");
  assert.equal(autumn.end, "2026-10-25T23:00:00.000Z");
  assert.equal(Date.parse(autumn.end) - Date.parse(autumn.start), 25 * 3600000);
});

test("year and leap-month boundaries produce the next actual Paris calendar day", () => {
  assert.equal(copierParisDayWindow(Date.parse("2026-12-31T12:00:00Z")).end, "2026-12-31T23:00:00.000Z");
  assert.equal(copierParisDayWindow(Date.parse("2028-02-29T12:00:00Z")).end, "2028-02-29T23:00:00.000Z");
  assert.throws(() => copierParisDayWindow(NaN), /Invalid day/);
});

test("daily net closed-trade result includes losses and BE fees without subtracting costs again", () => {
  const result = aggregate([metric()], snapshot([trade(), trade({ id: 11, status: "loss", result_amount: -4.5 }), trade({ id: 12, status: "breakeven", result_amount: -0.4 })]), now);
  assert.equal(result.currencies[0].pnl, 7.5);
  assert.equal(result.tradeCount, 3);
  assert.equal(result.coveredCount, 1);
  assert.equal(result.snapshotCurrent, true);
});

test("all receiver accounts aggregate by exact linked account ID, never by alias", () => {
  const second = metric({ receiverId: "r2", alias: "REAL2", identityKey: "MT5:124:broker-live", sourceAccountId: 8 });
  const missing = metric({ receiverId: "r3", alias: "REAL3", identityKey: "MT5:125:broker-live", sourceAccountId: 9, lastSync: null, metricsObservedAt: null, isFresh: false, status: "error" });
  const result = aggregate([metric(), second, missing], snapshot([trade(), trade({ id: 11, account_id: 8, status: "loss", result_amount: -4.5 }), trade({ id: 12, account_id: 8, result_amount: 6.2 }), trade({ id: 13, account_id: 99, result_amount: 9999 })]), now);
  assert.ok(Math.abs(result.currencies[0].pnl - 14.1) < 1e-10);
  assert.equal(result.tradeCount, 3);
  assert.equal(result.coveredCount, 2);
  assert.equal(result.totalCount, 3);
  assert.deepEqual(plain(result.missingAliases), ["REAL3"]);
});

test("duplicate aliases of one account and repeated trade IDs cannot double its result", () => {
  const result = aggregate([metric(), metric({ receiverId: "r2", alias: "REAL1 again" })], snapshot([trade(), trade()]), now);
  assert.equal(result.totalCount, 1);
  assert.equal(result.currencies[0].pnl, 12.4);
  assert.equal(result.currencies[0].accountCount, 1);
  assert.equal(result.tradeCount, 1);
});

test("currencies remain separate and conflicting currencies cannot produce a false total", () => {
  const usd = metric({ receiverId: "r2", alias: "USD", identityKey: "MT5:124:broker-live", sourceAccountId: 8, currency: "USD" });
  const result = aggregate([metric(), usd], snapshot([trade(), trade({ id: 11, account_id: 8, result_amount: -2 })]), now);
  assert.deepEqual(plain(result.currencies), [{ currency: "EUR", pnl: 12.4, accountCount: 1 }, { currency: "USD", pnl: -2, accountCount: 1 }]);
  assert.equal(aggregate([metric(), metric({ currency: "USD" })], snapshot(), now).coveredCount, 0);
  assert.equal(aggregate([metric({ currency: null })], snapshot(), now).currencies.length, 0);
});

test("a confirmed account read today permits a genuine zero if no trades have closed", () => {
  const result = aggregate([metric()], snapshot([]), now);
  assert.equal(result.currencies[0].pnl, 0);
  assert.equal(result.tradeCount, 0);
  assert.equal(result.coveredCount, 1);
});

test("an account with no first read or only yesterday's read cannot turn an empty query into zero", () => {
  for (const changes of [
    { lastSync: null, metricsObservedAt: null },
    { lastSync: "2026-10-22T10:00:00Z", metricsObservedAt: "2026-10-22T10:00:00Z" },
    { sourceAccountId: null }, { hasSync: false },
  ]) {
    const result = aggregate([metric(changes)], snapshot([]), now);
    assert.equal(result.currencies.length, 0);
    assert.equal(result.coveredCount, 0);
    assert.deepEqual(plain(result.missingAliases), ["REAL1"]);
  }
});

test("a broker read after the queried dataset cannot falsely validate its empty result", () => {
  const result = aggregate([metric({ lastSync: iso(10_000) })], snapshot([]), now);
  assert.equal(result.coveredCount, 0);
});

test("a same-day stale dataset preserves last known numbers but loses its fresh flag", () => {
  const readAt = now - 600000;
  const result = aggregate([metric({ lastSync: new Date(readAt - 1000).toISOString() })], snapshot([trade()], { readAt }), now);
  assert.equal(result.currencies[0].pnl, 12.4);
  assert.equal(result.snapshotCurrent, false);
});

test("a missing, future or previous-day dataset never becomes today's zero or yesterday's result", () => {
  for (const input of [null, snapshot([], { day: "2026-10-22" }), snapshot([], { readAt: now + 60000 }), snapshot([], { readAt: NaN })]) {
    const result = aggregate([metric()], input, now);
    assert.equal(result.currencies.length, 0);
    assert.equal(result.coveredCount, 0);
    assert.equal(result.snapshotCurrent, false);
  }
});

test("the day window is inclusive at its start and exclusive at the next midnight", () => {
  const bounds = copierParisDayWindow(now);
  const result = aggregate([metric()], snapshot([
    trade({ trade_date: bounds.start }),
    trade({ id: 11, trade_date: bounds.end, result_amount: 9999 }),
    trade({ id: 12, trade_date: new Date(Date.parse(bounds.start) - 1).toISOString(), result_amount: 9999 }),
  ]), now);
  assert.equal(result.tradeCount, 1);
  assert.equal(result.currencies[0].pnl, 12.4);
});

test("open trades and manual journal rows are not counted as imported closed executions", () => {
  const result = aggregate([metric()], snapshot([
    trade({ status: "open" }), trade({ id: 11, status: "pending" }), trade({ id: 12, sync_connection_id: null }),
    trade({ id: 13, sync_external_id: "" }),
  ]), now);
  assert.equal(result.tradeCount, 0);
  assert.equal(result.currencies[0].pnl, 0);
});

test("malformed monetary values fail the affected account closed instead of being coerced to zero", () => {
  for (const value of [null, undefined, "", true, NaN, Infinity, -Infinity, "not-a-number"]) {
    const result = aggregate([metric()], snapshot([trade({ result_amount: value })]), now);
    assert.equal(result.currencies.length, 0);
    assert.equal(result.coveredCount, 0);
  }
  assert.equal(aggregate([metric()], snapshot([trade({ result_amount: "-2.30" })]), now).currencies[0].pnl, -2.3);
});

test("conflicting duplicates invalidate their affected accounts, while unrelated results remain", () => {
  const second = metric({ receiverId: "r2", alias: "REAL2", identityKey: "MT5:124:broker-live", sourceAccountId: 8 });
  const result = aggregate([metric(), second], snapshot([trade(), trade({ result_amount: 13 }), trade({ id: 11, account_id: 8, result_amount: 3 })]), now);
  assert.equal(result.coveredCount, 1);
  assert.equal(result.currencies[0].pnl, 3);
  assert.equal(result.tradeCount, 1);
  assert.deepEqual(plain(result.missingAliases), ["REAL1"]);
});

const { default: Summary } = compile("components/copier/CopierPnlSummary.tsx", {
  "@/lib/copier/account-metrics": metricsModule, "@/lib/copier/day-result": dayModule,
});
const render = props => renderToStaticMarkup(React.createElement(Summary, { metrics: [metric()], now, translate: text => text, ...props }));

test("actual React summary leads with closed-trade result and separates zero floating profit", () => {
  const html = render({ dailySnapshot: snapshot() });
  assert.match(html, /Résultat des trades clôturés aujourd’hui/);
  assert.ok(html.indexOf("Résultat des trades clôturés") < html.indexOf("P&amp;L en cours"));
  assert.match(html, /12,40/);
  assert.match(html, /Aucune position ouverte/);
  assert.match(html, /1 trade\(s\) clôturé\(s\)/);
  assert.match(html, /Heure de Paris/);
});

test("actual React summary labels partial coverage and unavailable daily refresh", () => {
  const missing = metric({ receiverId: "r3", alias: "REAL3", identityKey: "MT5:125:broker-live", sourceAccountId: 9, lastSync: null, metricsObservedAt: null, isFresh: false, status: "error" });
  const html = render({ metrics: [metric(), missing], dailySnapshot: snapshot(), dailyReadFailed: true });
  assert.match(html, /1\/2 comptes inclus/);
  assert.match(html, /Total partiel/);
  assert.match(html, /REAL3/);
  assert.match(html, /dernière lecture conservée/);
  assert.match(html, /12,40/);
});

test("actual React summary never shows an invented daily zero before a dataset exists", () => {
  const html = render({ dailySnapshot: null });
  const leading = html.slice(0, html.indexOf("P&amp;L en cours"));
  assert.match(leading, /En attente de l’historique synchronisé du jour/);
  assert.doesNotMatch(leading, /0,00|0 trade/);
});

test("the initial empty clock never displays an epoch date", () => {
  const html = render({ now: 0, dailySnapshot: null });
  assert.doesNotMatch(html, /1970|01 janvier|January 01/);
});
