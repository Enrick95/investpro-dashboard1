import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const root = path.resolve(import.meta.dirname, "..");
function compile(file, modules = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => { assert(Object.hasOwn(modules, name), name); return modules[name]; } });
  return module.exports;
}
const instruments = compile("lib/risk-simulator.ts");
const { resolveRiskAsset: asset, signalRiskPreset: preset, signalDirectionError: directionError, riskSignalHref: href } = compile("lib/vip/signal-risk-preset.ts", { "../risk-simulator": instruments });
const data = fields => ({ postId: "11111111-1111-4111-8111-111111111111", title: "Signal", symbol: null, direction: null, issues: [], ...fields });

test("gold aliases and equivalent composite labels resolve to one canonical metal", () => {
  for (const value of ["GOLD", " gold ", "OR", "Gold (XAUUSD)", "Gold / Or", "XAUUSD", "XAUUSD.m", "XAUUSD.a", "#XAUUSD"]) assert.equal(asset(value), "XAUUSD", value);
  assert.equal(asset("XAUEUR"), "XAUEUR");
});
test("forex currencies and existing index/energy aliases keep their canonical ticker", () => {
  for (const value of ["EURUSD", "EUR/USD", "EUR USD", "EURUSD.r", "EURUSDm"]) assert.equal(asset(value), "EURUSD", value);
  for (const value of ["SP500", "US500", "SP500 - US500", "SPX500 (US500)"]) assert.equal(asset(value), "SPX500", value);
  for (const [value, ticker] of [["NASDAQ", "US100"], ["NASDAQ 100", "NAS100"], ["DAX40", "GER40"], ["FTSE 100 / UK100", "UK100"], ["WTI", "USOIL"], ["BRENT", "UKOIL"]]) assert.equal(asset(value), ticker === "US100" ? "NAS100" : ticker, value);
});
test("crypto shorthand is explicit USD convention and unsupported crypto pairs remain manual", () => {
  for (const value of ["BTC", "BITCOIN", "Bitcoin (BTCUSD)", "BTC / USD"]) assert.equal(asset(value), "BTCUSD", value);
  for (const value of ["ETH", "ETHEREUM", "ETHUSD"]) assert.equal(asset(value), "ETHUSD", value);
  for (const value of ["BTC / EUR", "BTCUSDT", "ETH / USDT"]) assert.equal(asset(value), value, value);
});
test("distinct symbols, unknown custom assets and prose never silently select their first asset", () => {
  for (const value of ["Gold / EURUSD", "SP500 - NAS100", "XAUUSD-BTCUSD", "BTC ETH", "GOLD / MYCOIN", "GOLD MAYBE", "MY.CUSTOM", "custom ticker", "", "  CUSTOM  "]) assert.equal(asset(value), value, value);
});
test("single prices retain exactly the validated values and do not invent missing fields", () => {
  const simple = preset(data({ symbol: "Gold (XAUUSD)", direction: "buy", entry: 2670.25, stopLoss: 2660.5 }));
  assert.equal(simple.symbol, "XAUUSD"); assert.equal(simple.entry, "2670.25"); assert.equal(simple.stop, "2660.5"); assert.equal(simple.direction, "buy"); assert.equal(simple.rangeApplied, false);
  const empty = preset(data({})); assert.equal(empty.symbol, ""); assert.equal(empty.entry, ""); assert.equal(empty.stop, ""); assert.equal(empty.direction, "");
  const wrongSide = preset(data({ direction: "buy", entry: 100, stopLoss: 101 })); assert.equal(wrongSide.entry, "100"); assert.equal(directionError(wrongSide.direction, Number(wrongSide.entry), Number(wrongSide.stop)), true);
});
test("conservative zones choose the farther entry only when the explicit order and stop agree", () => {
  const buy = preset(data({ direction: "buy", entryRange: { min: 2670, max: 2675 }, stopLoss: 2660 }));
  assert.equal(buy.entry, "2675"); assert.equal(buy.rangeApplied, true);
  const sell = preset(data({ direction: "sell", entryRange: { min: 2670, max: 2675 }, stopLoss: 2685 }));
  assert.equal(sell.entry, "2670"); assert.equal(sell.rangeApplied, true);
});
test("ambiguous, malformed or wrong-side ranges leave entry empty for manual review", () => {
  for (const fields of [
    { direction: null, stopLoss: 90 }, { direction: "buy", stopLoss: 100 }, { direction: "buy", stopLoss: 105 }, { direction: "buy", stopLoss: 110 }, { direction: "buy", stopLoss: 120 },
    { direction: "sell", stopLoss: 90 }, { direction: "sell", stopLoss: 100 }, { direction: "sell", stopLoss: 110 }, { direction: "sell" },
  ]) {
    const result = preset(data({ entryRange: { min: 100, max: 110 }, ...fields })); assert.equal(result.entry, ""); assert.equal(result.rangeApplied, false);
  }
  for (const range of [{ min: 110, max: 100 }, { min: -1, max: 100 }, { min: 100, max: Infinity }]) assert.equal(preset(data({ direction: "buy", entryRange: range, stopLoss: 90 })).entry, "");
  assert.equal(preset(data({ direction: "buy", entry: 105, entryRange: { min: 100, max: 110 }, stopLoss: 90 })).entry, "");
});
test("direction validation applies only to explicit sides and finite positive prices", () => {
  assert.equal(directionError("buy", 100, 99), false); assert.equal(directionError("buy", 100, 100), true); assert.equal(directionError("buy", 100, 101), true);
  assert.equal(directionError("sell", 100, 101), false); assert.equal(directionError("sell", 100, 100), true); assert.equal(directionError("sell", 100, 99), true);
  for (const side of ["", null, "BUY", "buy or sell"]) assert.equal(directionError(side, 100, 100), false);
  for (const invalid of [0, -1, NaN, Infinity]) { assert.equal(directionError("buy", invalid, 100), false); assert.equal(directionError("sell", 100, invalid), false); }
  assert.equal(preset(data({ entry: NaN, stopLoss: Infinity })).entry, ""); assert.equal(preset(data({ entry: NaN, stopLoss: Infinity })).stop, "");
});
test("private signal links accept only an actual UUID and never prefill a demo or unsafe identifier", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(href(id), `/dashboard/simulateur?signal=${id}`); assert.equal(href(id, true), "/dashboard/simulateur");
  for (const bad of ["demo-1", "", "11111111-1111-4111-8111-111111111111&balance=100000", "../../admin", "https://evil.test", " 11111111-1111-4111-8111-111111111111 "]) assert.equal(href(bad), "/dashboard/simulateur");
});
