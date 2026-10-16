import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
function compile(file, modules = {}) {
  const compiled = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: compiled, exports: compiled.exports, require: name => { assert(Object.hasOwn(modules, name), name); return modules[name]; } });
  return compiled.exports;
}
const engine = compile("lib/risk-simulator.ts");
const { getSizingConvention: convention } = compile("lib/risk-simulator-conventions.ts", { "./risk-simulator": engine });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

function size(symbol, overrides = {}) {
  const preset = convention(symbol);
  assert.ok(preset, symbol);
  return engine.calculatePosition({
    symbol, balance: 10_000, budget: 100, entry: 60_000, stop: 59_000,
    mode: "contract", contractSize: preset.contractSize, lossRate: 1, gainRate: NaN,
    tickSize: NaN, tickValue: NaN, minLot: preset.displayMinimum, lotStep: preset.displayStep,
    ...overrides,
  });
}

test("Forex and gold keep explicitly named standard lots and their base/profit currencies", () => {
  const forex = convention("EURUSD"), gold = convention("XAUUSD"), inverse = convention("USDJPY");
  assert.equal(forex.sizingKind, "standard_lot");
  assert.equal(forex.displayUnit, "lot standard");
  assert.equal(forex.contractSize, 100_000); assert.equal(forex.baseCurrency, "EUR"); assert.equal(forex.profitCurrency, "USD");
  assert.equal(inverse.baseCurrency, "USD"); assert.equal(inverse.profitCurrency, "JPY");
  const fx = size("EURUSD", { entry: 1.1, stop: 1.095 });
  assert.equal(fx.error, ""); assert.equal(fx.lots, 0.2); close(fx.actualRisk, 100);
  assert.equal(gold.contractSize, 100); assert.equal(gold.sizingKind, "standard_lot");
  const metal = size("XAUUSD", { entry: 2350, stop: 2340 });
  assert.equal(metal.error, ""); assert.equal(metal.lots, 0.1); assert.equal(metal.actualRisk, 100);
});

test("silver uses its named 5000-ounce convention while metal profit currency is retained", () => {
  const silver = convention("XAGUSD"), goldEuro = convention("XAUEUR");
  assert.equal(silver.contractSize, 5000); assert.equal(silver.displayStep, 0.01);
  const result = size("XAGUSD", { entry: 30, stop: 29.5 });
  assert.equal(result.lots, 0.04); assert.equal(result.actualRisk, 100);
  assert.equal(goldEuro.contractSize, 100); assert.equal(goldEuro.profitCurrency, "EUR");
});

test("BTC sizing returns coins and cannot be mistaken for a broker whose lot represents 100 coins", () => {
  const btc = convention("BTCUSD"), coins = size("BTCUSD");
  assert.equal(btc.sizingKind, "asset_units"); assert.equal(btc.displayUnit, "BTC");
  assert.equal(btc.contractSize, 1); assert.equal(coins.lots, 0.1); assert.equal(coins.actualRisk, 100);
  const brokerLots = size("BTCUSD", { contractSize: 100, minLot: 0.00001, lotStep: 0.00001 });
  assert.equal(brokerLots.lots, 0.001); assert.equal(brokerLots.actualRisk, 100);
  assert.equal(coins.lots / brokerLots.lots, 100);
  assert.equal(engine.getInstrument("BTCUSD").contractSize, undefined, "the underlying catalog must not gain an invented CFD contract");
});

test("supported crypto quantities retain their token unit and small quantities are floored without rounding up", () => {
  for (const token of ["BTC", "ETH", "SOL", "XRP", "LTC"]) {
    const preset = convention(token + "USD");
    assert.equal(preset.displayUnit, token); assert.equal(preset.profitCurrency, "USD");
    assert.equal(preset.displayStep, 1e-8); assert.equal(preset.displayMinimum, 1e-8);
  }
  const result = size("BTCUSD", { budget: 0.0001, entry: 60_000, stop: 59_997 });
  assert.equal(result.error, ""); assert.equal(result.lots, 0.00003333);
  assert.ok(result.actualRisk <= 0.0001);
});

test("indices return the available profit-currency amount per point, after account conversion", () => {
  const nasdaq = convention("NAS100"), dax = convention("GER40"), nikkei = convention("JP225");
  assert.equal(nasdaq.sizingKind, "point_value"); assert.equal(nasdaq.displayUnit, "USD/point");
  assert.equal(dax.displayUnit, "EUR/point"); assert.equal(nikkei.displayUnit, "JPY/point");
  const rate = engine.resolveConversion({ ...nasdaq, accountCurrency: "EUR", stop: 19_900, target: NaN, rates: { EUR: 1, USD: 1.25 } });
  const result = size("NAS100", { entry: 20_000, stop: 19_900, ...rate });
  assert.equal(result.error, ""); assert.equal(result.lots, 1.25, "1.25 USD per point for a 100-point stop and 100 EUR budget");
  close(result.actualRisk, 100);
  const otherContract = size("NAS100", { entry: 20_000, stop: 19_900, contractSize: 10, ...rate });
  assert.notEqual(otherContract.lots, result.lots, "the amount per point is not a universal broker lot count");
  assert.equal(engine.getInstrument("NAS100").contractSize, undefined);
});

test("unknown, composite and unsupported contract labels are rejected before the legacy parser can choose an asset", () => {
  for (const value of ["", "EURUSD/XAUUSD", "GOLD-EURUSD", "BTC ETH", "BTCUSD.foo", "#NAS100", "Gold (XAUUSD)", "eurusd", " XAUUSD ", "UNKNOWN", "USDUSD", "BTCUSDT", "BTCEUR", "USOIL", "UKOIL", "NATGAS", "XPTUSD", "XPDUSD"]) {
    assert.equal(convention(value), null, value);
  }
});

test("display rounding can underuse a budget but never rounds a standard estimate up to its display minimum", () => {
  const tooSmall = size("XAUUSD", { entry: 2350, stop: 2340, budget: 9 });
  assert.ok(tooSmall.error); assert.equal(tooSmall.lots, 0); assert.equal(tooSmall.actualRisk, 0);
  const rounded = size("XAUUSD", { entry: 2350, stop: 2340, budget: 99 });
  assert.equal(rounded.lots, 0.09); assert.equal(rounded.actualRisk, 90);
});

test("contract-size differences change theoretical sizing before rounding or any fee model", () => {
  const standard = size("XAUUSD", { entry: 2350, stop: 2340 });
  const alternate = size("XAUUSD", { entry: 2350, stop: 2340, contractSize: 1 });
  assert.equal(standard.theoretical, 0.1); assert.equal(alternate.theoretical, 10);
  assert.equal(standard.actualRisk, alternate.actualRisk);
  assert.equal(alternate.theoretical / standard.theoretical, 100, "a contract multiplier difference cannot be explained as a small fee difference");
});
