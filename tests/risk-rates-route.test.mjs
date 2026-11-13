import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// The lot calculator converts through /api/risk-rates (Frankfurter, base EUR). Since November 2026 the provider also
// lists crypto-assets in the same answer; one four-letter code made the whole list unusable and the calculator showed
// « Conversion momentanément indisponible » for every account in another currency than the instrument's.
const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "app/api/risk-rates/route.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function call(payload, status = 200) {
  const cjsModule = { exports: {} };
  const fetch = async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  vm.runInNewContext(compiled, {
    module: cjsModule, exports: cjsModule.exports, fetch, AbortSignal, Intl, Response, Date, Number, Object, Array, Set, JSON, Error,
    require(name) {
      if (name === "next/server") return { NextResponse: Response };
      throw new Error("Unexpected dependency: " + name);
    },
  });
  const response = await cjsModule.exports.GET();
  return { status: response.status, body: await response.json() };
}

const row = (quote, rate, date = "2026-11-13") => ({ date, base: "EUR", quote, rate });

test("crypto-assets listed by the provider are ignored, currencies are still converted", async () => {
  const { status, body } = await call([
    row("AAVE", 0.0097287, "2026-11-12"), row("ADA", 6.3824, "2026-11-12"), row("BTC", 0.000015235, "2026-11-12"),
    row("EUR", 1.0), row("GBP", 0.83541), row("JPY", 177.17), row("LINK", 0.10966, "2026-11-12"),
    row("USD", 1.1089), row("USDC", 1.1092, "2026-11-12"), row("USDT", 1.1103, "2026-11-12"),
  ]);
  assert.equal(status, 200);
  assert.equal(body.base, "EUR");
  assert.deepEqual(body.rates, { EUR: 1, GBP: 0.83541, JPY: 177.17, USD: 1.1089 });
  assert.equal(body.dates.USD, "2026-11-13");
  for (const code of ["AAVE", "ADA", "BTC", "LINK", "USDC", "USDT"]) assert.equal(body.rates[code], undefined, code);
});

test("a malformed currency row or an unavailable provider still refuses the whole answer", async () => {
  assert.equal((await call([row("USD", -1)])).status, 502);
  assert.equal((await call([row("USD", 1.1, "13/11/2026")])).status, 502);
  assert.equal((await call([{ date: "2026-11-13", base: "USD", quote: "EUR", rate: 0.9 }])).status, 502);
  assert.equal((await call([row("usd", 1.1)])).status, 502);
  assert.equal((await call([], 503)).status, 502);
});
