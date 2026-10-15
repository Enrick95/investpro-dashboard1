import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const project = path.resolve(import.meta.dirname, "..");

function compile(file, modules = {}) {
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(project, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module: compiledModule, exports: compiledModule.exports, Date, Intl,
    require: name => {
      assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name);
      return modules[name];
    },
  });
  return compiledModule.exports;
}

const identity = compile("lib/vip/identity.ts");
const membership = compile("lib/vip/membership.ts");
const { vipPaymentExpiry, validateVipApproval, validateVipAccessRequest } = compile("lib/vip/access-requests.ts", {
  "./identity": identity,
  "./membership": membership,
});
const subscription = { firstName: "Élodie", lastName: "D’Ávila", type: "abonnement", affiliationBroker: "axi" };

test("one paid calendar month ends at Paris midnight on the corresponding day", () => {
  for (const [paidOn, expected] of [
    ["2026-01-15", "2026-02-14T23:00:00.000Z"],
    ["2026-06-15", "2026-07-14T22:00:00.000Z"],
    ["2026-10-01", "2026-10-31T23:00:00.000Z"],
    ["2026-12-15", "2027-01-14T23:00:00.000Z"],
  ]) assert.equal(vipPaymentExpiry(paidOn), expected, paidOn);
});

test("month-end payments clamp to the last calendar day without rolling into the following month", () => {
  for (const [paidOn, expected] of [
    ["2023-01-31", "2023-02-27T23:00:00.000Z"],
    ["2024-01-30", "2024-02-28T23:00:00.000Z"],
    ["2024-01-31", "2024-02-28T23:00:00.000Z"],
    ["2024-02-29", "2024-03-28T23:00:00.000Z"],
    ["2026-01-30", "2026-02-27T23:00:00.000Z"],
    ["2026-03-31", "2026-04-29T22:00:00.000Z"],
    ["2026-05-31", "2026-06-29T22:00:00.000Z"],
    ["2026-07-31", "2026-08-30T22:00:00.000Z"],
    ["2026-08-31", "2026-09-29T22:00:00.000Z"],
    ["2026-10-31", "2026-11-29T23:00:00.000Z"],
    ["2026-12-31", "2027-01-30T23:00:00.000Z"],
  ]) assert.equal(vipPaymentExpiry(paidOn), expected, paidOn);
});

test("Paris DST offsets come from the expiry date, including midnight before a clock change", () => {
  for (const [paidOn, expected] of [
    ["2026-02-28", "2026-03-27T23:00:00.000Z"],
    ["2027-02-28", "2027-03-27T23:00:00.000Z"],
    ["2027-03-28", "2027-04-27T22:00:00.000Z"],
    ["2028-02-29", "2028-03-28T22:00:00.000Z"],
    ["2026-09-25", "2026-10-24T22:00:00.000Z"],
    ["2026-09-26", "2026-10-25T23:00:00.000Z"],
  ]) assert.equal(vipPaymentExpiry(paidOn), expected, paidOn);
});

test("payment dates must be real, strictly formatted calendar days", () => {
  for (const paidOn of [
    undefined, null, 20261001, true, {}, [], new Date("2026-10-01T00:00:00Z"),
    "", "2026-1-01", "2026-01-1", " 2026-10-01", "2026-10-01 ", "2026-10-01T00:00:00Z",
    "2026-00-01", "2026-13-01", "2026-01-00", "2026-01-32", "2026-04-31", "2026-02-29", "2024-02-30",
  ]) assert.equal(vipPaymentExpiry(paidOn), null, String(paidOn));
});

test("approval requires a payment on or before the current Paris day with an unexpired month", () => {
  const now = Date.parse("2026-10-15T10:00:00Z");
  const accepted = validateVipApproval({ ...subscription, paidOn: "2026-10-01" }, now);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.paid_on, "2026-10-01");
  assert.equal(accepted.value.expires_at, "2026-10-31T23:00:00.000Z");
  assert.equal(accepted.value.affiliation_broker, null);
  for (const paidOn of ["2026-10-16", "2099-01-01", "2026-09-01", "2026-02-30"]) {
    assert.equal(validateVipApproval({ ...subscription, paidOn }, now).ok, false, paidOn);
  }
});

test("today is determined in Europe/Paris even while UTC is still on the previous day or year", () => {
  for (const [now, paidOn, expectedExpiry] of [
    ["2026-09-30T22:30:00Z", "2026-10-01", "2026-10-31T23:00:00.000Z"],
    ["2026-12-31T23:30:00Z", "2027-01-01", "2027-01-31T23:00:00.000Z"],
  ]) {
    const approved = validateVipApproval({ ...subscription, paidOn }, Date.parse(now));
    assert.equal(approved.ok, true, now);
    assert.equal(approved.value.expires_at, expectedExpiry);
  }
  assert.equal(validateVipApproval({ ...subscription, paidOn: "2026-10-02" }, Date.parse("2026-09-30T22:30:00Z")).ok, false);
  assert.equal(validateVipApproval({ ...subscription, paidOn: "2026-10-15" }, Date.parse("2026-10-14T21:30:00Z")).ok, false);
  assert.equal(validateVipApproval({ ...subscription, paidOn: "2026-10-15" }, Date.parse("2026-10-14T22:30:00Z")).ok, true);
});

test("an access request may be approved just before expiry but never at or after the exact boundary", () => {
  const paidOn = "2026-09-25";
  const expiry = Date.parse("2026-10-24T22:00:00.000Z");
  assert.equal(validateVipApproval({ ...subscription, paidOn }, expiry - 1).ok, true);
  assert.equal(validateVipApproval({ ...subscription, paidOn }, expiry).ok, false);
  assert.equal(validateVipApproval({ ...subscription, paidOn }, expiry + 1).ok, false);
});

test("expiry cannot be extended by supplying an arbitrary deadline or membership fields", () => {
  const approved = validateVipApproval({ ...subscription, paidOn: "2026-10-01", expiresAt: "2099-01-01T00:00:00Z", expires_at: "2099-01-01T00:00:00Z", started_at: "2026-10-15T00:00:00Z", months: 12 }, Date.parse("2026-10-15T10:00:00Z"));
  assert.equal(approved.ok, true);
  assert.equal(approved.value.expires_at, "2026-10-31T23:00:00.000Z");
  assert.equal(Object.hasOwn(approved.value, "started_at"), false);
  assert.equal(Object.hasOwn(approved.value, "months"), false);
  assert.equal(validateVipApproval({ ...subscription, paidOn: "2026-09-01", expiresAt: "2099-01-01T00:00:00Z" }, Date.parse("2026-10-15T10:00:00Z")).ok, false);
});

test("affiliation approval has no payment date or expiry even if stale subscription inputs are supplied", () => {
  const approved = validateVipApproval({ ...subscription, type: "affiliation", paidOn: "2099-01-01", expiresAt: "2099-02-01T00:00:00Z" }, Date.parse("2026-10-15T10:00:00Z"));
  assert.equal(approved.ok, true);
  assert.equal(approved.value.affiliation_broker, "axi");
  assert.equal(approved.value.paid_on, null);
  assert.equal(approved.value.expires_at, null);
});

test("member-declared payment dates use the Paris day when rejecting future payments", () => {
  const now = Date.parse("2026-10-14T22:30:00Z");
  const declared = validateVipAccessRequest({ ...subscription, paidOn: "2026-10-15" }, now);
  assert.equal(declared.ok, true);
  assert.equal(declared.value.paid_on, "2026-10-15");
  assert.equal(declared.value.affiliation_broker, null);
  assert.equal(validateVipAccessRequest({ ...subscription, paidOn: "2026-10-16" }, now).ok, false);
  assert.equal(validateVipAccessRequest({ ...subscription, paidOn: "2026-10-15" }, Date.parse("2026-10-14T21:30:00Z")).ok, false);
});

test("declarations accept an expired real payment for review while approval rejects it", () => {
  const now = Date.parse("2026-10-15T10:00:00Z");
  const declared = validateVipAccessRequest({ ...subscription, paidOn: "2000-01-01", expiresAt: "2099-01-01T00:00:00Z" }, now);
  assert.equal(declared.ok, true);
  assert.equal(declared.value.paid_on, "2000-01-01");
  assert.equal(Object.hasOwn(declared.value, "expires_at"), false);
  assert.equal(validateVipApproval({ ...subscription, paidOn: "2000-01-01", expiresAt: "2099-01-01T00:00:00Z" }, now).ok, false);
});
