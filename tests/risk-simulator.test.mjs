import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculatePosition,
  floorVolume,
  getInstrument,
  getSimpleInstrument,
  parseDecimal,
  resolveConversion,
  SUGGESTED_ASSETS,
  SIMPLE_ASSETS,
} from "../lib/risk-simulator.ts";

function close(actual, expected, message) {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
    message || `${actual} should be approximately ${expected}`,
  );
}

function position(overrides = {}) {
  return calculatePosition({
    symbol: "EURUSD", balance: 10_000, budget: 100,
    entry: 1.1, stop: 1.095, rr: 2,
    mode: "contract", contractSize: 100_000, lossRate: 1, gainRate: 1,
    tickSize: 0.00001, tickValue: 1,
    minLot: 0.01, lotStep: 0.01,
    ...overrides,
  });
}

test("EURUSD in a USD account: a 50-pip stop and $100 risk require 0.20 standard lots", () => {
  const result = position();
  assert.equal(result.error, "");
  close(result.distance, 0.005);
  close(result.lossPerLot, 500);
  assert.equal(result.lots, 0.2);
  close(result.actualRisk, 100);
  close(result.target, 1.11);
  close(result.gain, 200);
});

test("gold uses its 100-ounce contract rather than the former arbitrary point value", () => {
  const result = position({ symbol: "XAUUSD", entry: 2350, stop: 2340, contractSize: 100 });
  assert.equal(result.error, "");
  assert.equal(result.lossPerLot, 1000);
  assert.equal(result.lots, 0.1);
  assert.equal(result.actualRisk, 100);
  assert.equal(result.target, 2370);
});

test("a USD-denominated gold loss is converted before sizing a EUR account", () => {
  const conversion = resolveConversion({ profitCurrency: "USD", accountCurrency: "EUR", stop: 2340, target: 2370, manualRate: 0.92 });
  const result = position({ symbol: "XAUUSD", entry: 2350, stop: 2340, contractSize: 100, ...conversion });
  assert.equal(result.error, "");
  assert.equal(result.lossPerLot, 920);
  assert.equal(result.lots, 0.1);
  assert.equal(result.actualRisk, 92);
  assert.equal(result.gain, 184);
});

test("USDJPY with a USD account uses the simulated exit price for inverse conversion", () => {
  const instrument = getInstrument("USDJPY");
  const conversion = resolveConversion({ ...instrument, accountCurrency: "USD", stop: 149, target: 152 });
  assert.equal(conversion.source, "pair");
  close(conversion.lossRate, 1 / 149);
  close(conversion.gainRate, 1 / 152);
  const result = position({ symbol: instrument.symbol, entry: 150, stop: 149, ...conversion });
  assert.equal(result.error, "");
  close(result.lossPerLot, 100_000 / 149);
  assert.equal(result.lots, 0.14);
  close(result.actualRisk, 14_000 / 149);
  close(result.gain, 28_000 / 152);
  assert.ok(result.actualRisk <= 100);
  assert.ok(result.effectiveRR < 2, "price RR and account-currency RR can differ");
});

test("a cross pair uses an explicit conversion, and displays the rounded volume's actual risk", () => {
  const conversion = resolveConversion({ profitCurrency: "JPY", accountCurrency: "EUR", stop: 189, target: 192, manualRate: 0.006 });
  const result = position({ symbol: "GBPJPY", entry: 190, stop: 189, ...conversion });
  assert.equal(result.error, "");
  assert.equal(result.lossPerLot, 600);
  assert.equal(result.lots, 0.16);
  assert.equal(result.actualRisk, 96);
  assert.equal(result.gain, 192);
});

test("index lots depend on the broker multiplier, not just the index name", () => {
  const first = position({ symbol: "NAS100", entry: 20_000, stop: 19_900, contractSize: 1 });
  const second = position({ symbol: "NAS100", entry: 20_000, stop: 19_900, contractSize: 10 });
  assert.equal(first.lots, 1);
  assert.equal(second.lots, 0.1);
  assert.equal(first.actualRisk, 100);
  assert.equal(second.actualRisk, 100);
  assert.ok(position({ symbol: "NAS100", contractSize: NaN }).error);
});

test("broker tick values already in the account currency do not receive a second conversion", () => {
  const result = position({
    symbol: "CUSTOM-CFD", entry: 20_000, stop: 19_900,
    mode: "ticks", tickSize: 0.1, tickValue: 0.5,
    contractSize: NaN, lossRate: NaN, gainRate: NaN,
  });
  assert.equal(result.error, "");
  assert.equal(result.lossPerLot, 500);
  assert.equal(result.lots, 0.2);
  assert.equal(result.actualRisk, 100);
});

test("the same-currency conversion needs no market rate", () => {
  assert.deepEqual(
    resolveConversion({ profitCurrency: "CHF", accountCurrency: "CHF", stop: 0, target: 0 }),
    { source: "same", lossRate: 1, gainRate: 1 },
  );
});

test("reference rates quoted against a common base are divided in the correct direction", () => {
  const rates = { EUR: 1, USD: 1.1, JPY: 165, CHF: 0.95 };
  const result = resolveConversion({ profitCurrency: "JPY", accountCurrency: "USD", stop: 100, target: 101, rates });
  assert.equal(result.source, "reference");
  close(result.lossRate, 1.1 / 165);
  const inverse = resolveConversion({ profitCurrency: "USD", accountCurrency: "EUR", stop: 100, target: 101, rates });
  close(inverse.lossRate, 1 / 1.1);
});

test("an explicit conversion overrides reference and inferred pair conversion", () => {
  const result = resolveConversion({ profitCurrency: "JPY", accountCurrency: "USD", baseCurrency: "USD", stop: 149, target: 152, manualRate: 0.007, rates: { USD: 1, JPY: 150 } });
  assert.deepEqual(result, { source: "manual", lossRate: 0.007, gainRate: 0.007 });
});

test("missing and invalid conversions never silently fall back to parity", () => {
  for (const overrides of [
    {}, { manualRate: 0 }, { manualRate: -1 }, { manualRate: NaN },
    { rates: { JPY: 0, EUR: 1 } }, { rates: { JPY: 150, EUR: Infinity } },
    { profitCurrency: "" },
  ]) {
    const result = resolveConversion({ profitCurrency: "JPY", accountCurrency: "EUR", stop: 100, target: 101, ...overrides });
    assert.equal(result.source, "missing");
    assert.ok(Number.isNaN(result.lossRate));
    assert.ok(position(result).error);
  }
});

test("Forex aliases, broker suffixes and metal aliases preserve their financial meaning", () => {
  for (const symbol of [" eur usd ", "EURUSD.a", "EURUSDpro", "EURUSDm"]) {
    const instrument = getInstrument(symbol);
    assert.equal(instrument.market, "forex", symbol);
    assert.equal(instrument.profitCurrency, "USD", symbol);
    assert.equal(instrument.contractSize, 100_000, symbol);
  }
  assert.equal(getInstrument("USDJPY").pipSize, 0.01);
  assert.equal(getInstrument("EURUSD").pipSize, 0.0001);
  assert.equal(getInstrument("gold").contractSize, 100);
  assert.equal(getInstrument("SILVER").contractSize, 5000);
  assert.equal(getInstrument("XAUEUR").profitCurrency, "EUR");
  assert.equal(getInstrument("USTEC").market, "indices");
  assert.equal(getInstrument("DE40").profitCurrency, "EUR");
  assert.equal(getInstrument("WTI").market, "energy");
});

test("custom instruments and index presets do not invent a broker contract", () => {
  const unknown = getInstrument("BrokerSpecial", "custom");
  assert.equal(unknown.symbol, "BROKERSPECIAL");
  assert.equal(unknown.profitCurrency, "");
  assert.equal(unknown.contractSize, undefined);
  assert.equal(getInstrument("US30").contractSize, undefined);
  assert.equal(getInstrument("EURCHF").market, "forex");
  assert.equal(getInstrument("USDUSD").profitCurrency, "");
  assert.ok(SUGGESTED_ASSETS.some(item => item.symbol === "GBPJPY"));
  assert.ok(SUGGESTED_ASSETS.some(item => item.symbol === "XAUUSD"));
  assert.ok(SUGGESTED_ASSETS.some(item => item.symbol === "NAS100"));
});

test("volume rounding floors broker steps, including fractional steps and floating point noise", () => {
  assert.equal(floorVolume(1.13, 0.25), 1);
  assert.equal(floorVolume(0.1239, 0.001), 0.123);
  assert.equal(floorVolume(0.29999999999999999, 0.01), 0.3);
  assert.equal(floorVolume(0.299999, 0.01), 0.29);
  for (const [raw, step] of [[NaN, 0.01], [Infinity, 0.01], [1, 0], [1, -1], [0, 1]]) {
    assert.equal(floorVolume(raw, step), 0);
  }
});

test("a maximum broker volume caps the recommendation and recalculates risk", () => {
  const result = position({ symbol: "INDEX", entry: 100, stop: 90, contractSize: 1, minLot: 0.1, lotStep: 0.1, maxLot: 1.35 });
  assert.equal(result.error, "");
  assert.equal(result.theoretical, 10);
  assert.equal(result.lots, 1.3);
  assert.equal(result.actualRisk, 13);
  assert.equal(result.gain, 26);
  assert.equal(result.capped, true);
});

test("the minimum broker volume is never rounded up past the risk budget", () => {
  const result = position({ symbol: "XAUUSD", entry: 2350, stop: 2340, contractSize: 100, budget: 9 });
  assert.ok(result.error);
  assert.equal(result.lots, 0);
  assert.equal(result.actualRisk, 0);
});

test("the inferred sell direction gives a lower target, and invalid negative targets are blocked", () => {
  const sell = position({ entry: 1.1, stop: 1.105 });
  assert.equal(sell.error, "");
  assert.equal(sell.isBuy, false);
  close(sell.target, 1.09);
  assert.ok(position({ entry: 1, stop: 2, rr: 2 }).error);
});

test("invalid financial quantities cannot produce a position recommendation", () => {
  const invalid = [
    { symbol: " " }, { balance: 0 }, { balance: Infinity },
    { budget: 0 }, { budget: -1 }, { budget: 10_001 }, { budget: NaN },
    { entry: 0 }, { stop: -1 }, { entry: NaN }, { stop: Infinity },
    { stop: 1.1 }, { rr: 0 }, { rr: -1 },
    { contractSize: 0 }, { contractSize: Infinity },
    { lossRate: 0 }, { gainRate: NaN },
    { minLot: 0 }, { lotStep: 0 }, { maxLot: 0 }, { maxLot: 0.001 },
    { mode: "ticks", tickSize: 0 }, { mode: "ticks", tickValue: 0 },
    { entry: 1e308, stop: 1, contractSize: 1e308 },
  ];
  for (const parameters of invalid) {
    const result = position(parameters);
    assert.ok(result.error, JSON.stringify(parameters));
    assert.equal(result.lots, 0, JSON.stringify(parameters));
  }
});

test("valid rounded positions never exceed their input risk budget", () => {
  for (const budget of [1, 9, 33.33, 100, 999.99]) {
    for (const lotStep of [0.001, 0.01, 0.1, 0.25, 1]) {
      const result = position({ symbol: "SYNTHETIC", entry: 123.4, stop: 120.1, contractSize: 7, budget, minLot: lotStep, lotStep });
      if (result.error) assert.equal(result.lots, 0);
      else {
        assert.ok(result.actualRisk <= budget + 1e-9, `${budget} / ${lotStep}`);
        close(result.lots / lotStep, Math.round(result.lots / lotStep));
      }
    }
  }
});

test("French decimal entry accepts common grouping, but rejects malformed and scientific input", () => {
  assert.equal(parseDecimal("1 234,56"), 1234.56);
  assert.equal(parseDecimal("1\u202f234,56"), 1234.56);
  assert.equal(parseDecimal(" .005 "), 0.005);
  assert.equal(parseDecimal("0"), 0);
  for (const value of ["", " ", "1,2,3", "1.2.3", "12abc", "1e3", "Infinity"]) {
    assert.ok(Number.isNaN(parseDecimal(value)), value);
  }
});

test("simple calculator chooses explicit Forex, gold, silver and index conventions automatically", () => {
  for (const [symbol, contractSize, profitCurrency, indexConvention] of [
    ["EURUSD.a", 100_000, "USD", false],
    ["GOLD", 100, "USD", false],
    ["SILVER", 5000, "USD", false],
    ["USTEC", 1, "USD", true],
    ["DAX", 1, "EUR", true],
    ["JP225", 1, "JPY", true],
  ]) {
    const instrument = getSimpleInstrument(symbol);
    assert.ok(instrument, symbol);
    assert.equal(instrument.contractSize, contractSize, symbol);
    assert.equal(instrument.profitCurrency, profitCurrency, symbol);
    assert.equal(instrument.indexConvention, indexConvention, symbol);
  }
});

test("simple calculator never invents contracts for unknown or unsupported instruments", () => {
  for (const symbol of ["BrokerSpecial", "USDUSD", "", "XPTUSD", "XPDUSD", "WTI", "BTCUSD"]) {
    assert.equal(getSimpleInstrument(symbol), null, symbol);
  }
  for (const symbol of ["EURUSD", "XAUUSD", "XAGUSD", "NAS100"]) {
    assert.ok(SIMPLE_ASSETS.some(item => item.symbol === symbol), symbol);
  }
  assert.ok(SIMPLE_ASSETS.every(item => getSimpleInstrument(item.symbol) !== null));
  assert.ok(!SIMPLE_ASSETS.some(item => ["energy", "crypto"].includes(item.market)));
});

test("a lot-only sell is valid even when a hypothetical take profit would be negative", () => {
  const result = position({ entry: 1, stop: 2, rr: undefined, contractSize: 1 });
  assert.equal(result.error, "");
  assert.equal(result.isBuy, false);
  assert.equal(result.lots, 100);
  assert.equal(result.actualRisk, 100);
  assert.ok(Number.isNaN(result.target));
  assert.equal(result.gain, 0);
});

test("lot-only sizing uses the SL conversion without requiring an unused TP conversion", () => {
  const instrument = getSimpleInstrument("USDJPY");
  const conversion = resolveConversion({ ...instrument, accountCurrency: "USD", stop: 149, target: NaN });
  assert.equal(conversion.source, "pair");
  assert.ok(Number.isNaN(conversion.gainRate));
  const result = position({ symbol: "USDJPY", entry: 150, stop: 149, rr: undefined, ...conversion });
  assert.equal(result.error, "");
  assert.equal(result.lots, 0.14);
  close(result.actualRisk, 14_000 / 149);
  assert.equal(result.gain, 0);
  assert.ok(result.actualRisk <= 100);
});
