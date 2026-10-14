import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VIP_AFFILIATION_BROKERS, isVipAffiliationBroker, normalizeVipPersonName,
  validateVipIdentity, vipAffiliationBrokerLabel,
} from "../lib/vip/identity.ts";

test("broker tokens and display labels form the four supported affiliations", () => {
  assert.deepEqual(VIP_AFFILIATION_BROKERS, [
    { value: "raise_fx", label: "Raise FX" }, { value: "vantage", label: "Vantage" },
    { value: "puprime", label: "PU Prime" }, { value: "axi", label: "Axi" },
  ]);
  for (const { value, label } of VIP_AFFILIATION_BROKERS) {
    assert.equal(isVipAffiliationBroker(value), true);
    assert.equal(vipAffiliationBrokerLabel(value), label);
  }
  for (const value of [null, undefined, "", "Raise FX", "AXI", "other", {}, 42]) {
    assert.equal(isVipAffiliationBroker(value), false);
    assert.equal(vipAffiliationBrokerLabel(value), null);
  }
});

test("names are trimmed and normalized without losing accents, apostrophes or hyphens", () => {
  assert.equal(normalizeVipPersonName("  E\u0301lodie-Anne  "), "Élodie-Anne");
  assert.equal(normalizeVipPersonName("\u00A0D’Angelo O'Neill\u3000"), "D’Angelo O'Neill");
  assert.equal(normalizeVipPersonName("Jean  Pierre"), "Jean  Pierre");
  assert.equal(normalizeVipPersonName("李"), "李");
});

test("names enforce 1–80 Unicode characters and reject control/format characters", () => {
  assert.equal(normalizeVipPersonName("É".repeat(80)), "É".repeat(80));
  assert.equal(normalizeVipPersonName("𐐀".repeat(80)), "𐐀".repeat(80));
  for (const value of ["", "   ", "É".repeat(81), "𐐀".repeat(81), null, 1,
    "Jean\n", "\tJean", "Jean\u0000", "Jean\u007f", "Jean\u0085",
    "Jean\u200b", "Jean\u202e", "Jean\u2028Paul", "Jean\u2066", "Jean\ufeff", "Jean\ud800",
  ]) assert.equal(normalizeVipPersonName(value), null);
});

test("new affiliation invitations require both names and a supported broker", () => {
  const input = { firstName: "  E\u0301lodie ", lastName: " D’Angelo ", affiliationBroker: "raise_fx" };
  assert.deepEqual(validateVipIdentity(input, "affiliation"), {
    ok: true, identity: { first_name: "Élodie", last_name: "D’Angelo", affiliation_broker: "raise_fx" },
  });
  for (const affiliationBroker of [null, undefined, "", "broker", "Raise FX"]) {
    assert.equal(validateVipIdentity({ ...input, affiliationBroker }, "affiliation").ok, false);
  }
  for (const value of [{ ...input, firstName: "" }, { ...input, lastName: undefined }]) {
    assert.equal(validateVipIdentity(value, "affiliation").ok, false);
  }
});

test("subscription identity always clears a stale affiliation broker and still requires names", () => {
  assert.deepEqual(validateVipIdentity({ firstName: "Alex", lastName: "Martin", affiliationBroker: "axi" }, "abonnement"), {
    ok: true, identity: { first_name: "Alex", last_name: "Martin", affiliation_broker: null },
  });
  assert.equal(validateVipIdentity({ firstName: "Alex", lastName: "" }, "abonnement").ok, false);
});
