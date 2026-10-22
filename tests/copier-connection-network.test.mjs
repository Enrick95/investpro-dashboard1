import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "lib/copier/connection-network.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const cjsModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: cjsModule,
  exports: cjsModule.exports,
  require(name) { throw new Error(`Unexpected runtime dependency: ${name}`); },
});
const { connectionStateLabel, persistedLinkedMasterIds, networkMasters, linkStateLabel, CONNECTION_FRESHNESS_MS } = cjsModule.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const now = Date.parse("2026-10-22T12:00:00Z");
const master = (id, subscribed = true, name = id) => ({ id, name, userIsSubscribed: subscribed, lots: 0.01 });
const state = (connected = true, masters = [master("source-a")], checkedAt = now) => ({
  snapshot: { status: { isTradingAccountConnected: connected, masterAccountsList: masters }, checkedAt },
});

test("a fresh explicit provider confirmation is connected; a negative one is disconnected", () => {
  assert.deepEqual(plain(connectionStateLabel(state(), now)), { kind: "connected", labelFrench: "Connecté", tone: "green" });
  assert.deepEqual(plain(connectionStateLabel(state(false), now)), { kind: "disconnected", labelFrench: "Déconnecté", tone: "amber" });
});

test("missing data never infers connectivity from an account's saved database status", () => {
  for (const value of [undefined, {}, { status: "connected", last_connected_at: new Date(now).toISOString() }]) {
    assert.equal(connectionStateLabel(value, now).kind, "unknown");
    assert.notEqual(connectionStateLabel(value, now).tone, "green");
  }
});

test("checking and request errors override a previously connected snapshot", () => {
  assert.equal(connectionStateLabel({ ...state(), checking: true }, now).kind, "checking");
  assert.equal(connectionStateLabel({ ...state(), error: true }, now).kind, "error");
  assert.equal(connectionStateLabel({ ...state(), checking: true, error: true }, now).kind, "checking");
  assert.notEqual(connectionStateLabel({ ...state(), error: true }, now).tone, "green");
});

test("provider connectivity expires after two minutes without erasing the saved subscription", () => {
  assert.equal(CONNECTION_FRESHNESS_MS, 120_000);
  assert.equal(connectionStateLabel(state(true, undefined, now - 120_000), now).kind, "connected");
  const expired = state(true, undefined, now - 120_001);
  assert.equal(connectionStateLabel(expired, now).kind, "stale");
  assert.deepEqual(plain(persistedLinkedMasterIds(expired)), ["source-a"]);
});

test("invalid and future timestamps can never produce a green connected state", () => {
  for (const checkedAt of [NaN, Infinity, -Infinity, undefined, "2026-10-22", now + 1]) {
    const result = connectionStateLabel(state(true, undefined, checkedAt), now);
    // An omitted argument invokes the fixture's default, so explicitly replace it.
    if (checkedAt === undefined) {
      assert.equal(connectionStateLabel({ snapshot: { ...state().snapshot, checkedAt } }, now).kind, "unknown");
    } else {
      assert.equal(result.kind, "unknown");
      assert.notEqual(result.tone, "green");
    }
  }
  assert.equal(connectionStateLabel(state(), NaN).kind, "unknown");
});

test("an incomplete provider payload does not masquerade as an explicit disconnection", () => {
  for (const connected of [undefined, null, "true", 1]) {
    const result = connectionStateLabel({ snapshot: { status: { isTradingAccountConnected: connected }, checkedAt: now } }, now);
    assert.equal(result.kind, "unknown");
  }
});

test("only saved provider subscriptions appear as links, regardless of unsaved draft checkboxes", () => {
  const value = {
    ...state(true, [master("source-a", false), master("source-b", true)]),
    selectedMasters: { "source-a": { on: true, lots: "0.05" }, "source-b": { on: false } },
  };
  assert.deepEqual(plain(persistedLinkedMasterIds(value)), ["source-b"]);
  assert.equal(linkStateLabel(value, "source-a", now).labelFrench, "Liaison à configurer");
  assert.equal(linkStateLabel(value, "source-b", now).labelFrench, "Relié au Master");
});

test("saved links are unique and malformed or unsubscribed identifiers are excluded", () => {
  const value = state(true, [master("source-a"), master("source-a"), master("source-b", false), master(""), master(null), master("truthy", "true")]);
  assert.deepEqual(plain(persistedLinkedMasterIds(value)), ["source-a"]);
  assert.deepEqual(plain(persistedLinkedMasterIds()), []);
});

test("network sources keep approval metadata while appending only actually subscribed sources", () => {
  const approved = [{ id: "source-a", name: "BOT GOLD", login: "12345", platform: "MT4", server: "Broker-Live", approved: true }];
  const states = {
    receiver1: state(true, [master("source-a", true, "Different provider name"), master("source-b", true, "EUR source"), master("catalog-only", false)]),
    receiver2: state(false, [master("source-b"), master("source-c", true, "Third source")], now - 300_000),
  };
  const before = JSON.stringify({ approved, states });
  assert.deepEqual(plain(networkMasters(approved, states)), [
    approved[0],
    { id: "source-b", name: "EUR source" },
    { id: "source-c", name: "Third source" },
  ]);
  assert.equal(JSON.stringify({ approved, states }), before);
});

test("an approved master alone never invents a receiver subscription", () => {
  const approved = [{ id: "source-a", name: "Approved source", approved: true }];
  assert.deepEqual(plain(networkMasters(approved, {})), approved);
  assert.equal(linkStateLabel({}, "source-a", now).labelFrench, "Liaison à configurer");
  assert.deepEqual(plain(networkMasters([], { receiver: { selectedMasters: { invented: { on: true } } } })), []);
});

test("a fresh linked and connected receiver is green, but a disconnected linked receiver is amber", () => {
  assert.deepEqual(plain(linkStateLabel(state(), "source-a", now)), { kind: "connected", labelFrench: "Relié au Master", tone: "green" });
  assert.deepEqual(plain(linkStateLabel(state(false), "source-a", now)), { kind: "disconnected", labelFrench: "Relié · compte déconnecté", tone: "amber" });
});

test("a saved link stays visible through stale, checking, failed, and invalid confirmations without going green", () => {
  for (const value of [state(true, undefined, now - 120_001), { ...state(), checking: true }, { ...state(), error: true }, state(true, undefined, now + 1)]) {
    const result = linkStateLabel(value, "source-a", now);
    assert.equal(result.labelFrench, "Liaison enregistrée · à vérifier");
    assert.notEqual(result.tone, "green");
  }
});

test("an unlinked but connected receiver does not become a green copy connection", () => {
  for (const value of [state(true, [master("source-a", false)]), undefined, { checking: true }, { error: true }]) {
    const result = linkStateLabel(value, "source-a", now);
    assert.equal(result.labelFrench, "Liaison à configurer");
    assert.equal(result.tone, "neutral");
  }
});
