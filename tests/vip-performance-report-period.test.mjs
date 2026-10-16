import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
function compile(file, modules = {}) {
  const cjsModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: cjsModule, exports: cjsModule.exports,
    require: name => { assert(Object.hasOwn(modules, name), `Unexpected import: ${name}`); return modules[name]; },
  });
  return cjsModule.exports;
}
const performance = compile("lib/performance.ts");
const { reportPeriodRange, containsReportDay } = compile("lib/vip/performance-report-period.ts", { "../performance": performance });
const plain = value => JSON.parse(JSON.stringify(value));
const at = value => new Date(value);

test("Paris midnight determines the day and month even while UTC and US are still previous day", () => {
  const now = at("2026-03-31T22:30:00Z"); // April 1, 00:30 in Paris.
  assert.deepEqual(plain(reportPeriodRange("month", now)), { start: "2026-04-01", end: "2026-04-01" });
  assert.deepEqual(plain(reportPeriodRange("7d", now)), { start: "2026-03-26", end: "2026-04-01" });
  assert.equal(containsReportDay("2026-03-31T22:30:00Z", reportPeriodRange("month", now)), true);
  assert.equal(containsReportDay("2026-03-31T21:59:59Z", reportPeriodRange("month", now)), false);
});

test("three calendar months and year begin at the first Paris day across year rollover", () => {
  const now = at("2025-12-31T23:30:00Z"); // January 1, 00:30 in Paris.
  assert.deepEqual(plain(reportPeriodRange("3m", now)), { start: "2025-11-01", end: "2026-01-01" });
  assert.deepEqual(plain(reportPeriodRange("year", now)), { start: "2026-01-01", end: "2026-01-01" });
  assert.deepEqual(plain(reportPeriodRange("all", now)), { start: null, end: "2026-01-01" });
});

test("seven days are inclusive calendar days across leap-day and daylight-saving boundaries", () => {
  assert.deepEqual(plain(reportPeriodRange("7d", at("2024-03-01T12:00:00Z"))), { start: "2024-02-24", end: "2024-03-01" });
  assert.deepEqual(plain(reportPeriodRange("7d", at("2026-03-30T12:00:00Z"))), { start: "2026-03-24", end: "2026-03-30" });
  assert.deepEqual(plain(reportPeriodRange("7d", at("2026-10-26T12:00:00Z"))), { start: "2026-10-20", end: "2026-10-26" });
});

test("range boundaries are inclusive and future calendar days are excluded even for all history", () => {
  const range = reportPeriodRange("7d", at("2026-10-16T10:00:00Z"));
  assert.equal(containsReportDay("2026-10-10", range), true);
  assert.equal(containsReportDay("2026-10-16", range), true);
  assert.equal(containsReportDay("2026-10-09", range), false);
  assert.equal(containsReportDay("2026-10-17", range), false);
  const all = reportPeriodRange("all", at("2026-10-16T10:00:00Z"));
  assert.equal(containsReportDay("2000-01-01", all), true);
  assert.equal(containsReportDay("2026-10-17", all), false);
  assert.equal(containsReportDay("2026-10-16T22:30:00Z", all), false); // October 17 in Paris.
});

test("invalid calendar dates cannot be silently normalized, while Gregorian leap days are valid", () => {
  const range = { start: null, end: "2400-12-31" };
  for (const invalid of ["", "0", "10/16/2026", "not a date", "2026-02-29", "2024-02-30", "2026-04-31", "2026-00-10", "2026-13-01", "2026-01-00", "0000-01-01", "1900-02-29", "2100-02-29", "2026-02-30T10:00:00Z", "2026-10-16T24:00:00Z", "2026-10-16T10:00:00"]) {
    assert.equal(containsReportDay(invalid, range), false, invalid);
  }
  for (const valid of ["2024-02-29", "2000-02-29", "2400-02-29", "2026-04-30", "2024-02-29T10:00:00Z", "2026-10-16 10:00:00+00:00", "2026-10-16T10:00:00.123456+02:00"]) {
    assert.equal(containsReportDay(valid, range), true, valid);
  }
});

test("invalid ranges fail closed and invalid now does not silently use another day", () => {
  assert.equal(containsReportDay("2026-10-16", { start: "2026-10-17", end: "2026-10-16" }), false);
  assert.equal(containsReportDay("2026-10-16", { start: null, end: "2026-02-30" }), false);
  assert.equal(containsReportDay("2026-10-16", { start: "2026-02-30", end: "2026-10-16" }), false);
  assert.throws(() => reportPeriodRange("all", at("invalid")), { name: "RangeError" });
});
