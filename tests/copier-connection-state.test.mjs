import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const pageSource = fs.readFileSync(path.join(root, "app/dashboard/copieur/page.tsx"), "utf8");
const pageAst = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functionNames = ["setActiveReceiver", "updateConnectionState", "confirmConnection", "applyStatus", "readConnection", "fetchStatus", "verifyNetwork"];
const declarations = new Map();

// Execute the page's actual async coordination code, leaving React rendering out of the harness.
function collect(node) {
  if (ts.isFunctionDeclaration(node) && node.name && functionNames.includes(node.name.text)) {
    declarations.set(node.name.text, node.getText(pageAst));
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && functionNames.includes(node.name.text)) {
    declarations.set(node.name.text, `const ${node.getText(pageAst)};`);
  }
  ts.forEachChild(node, collect);
}
collect(pageAst);
for (const name of functionNames) assert(declarations.has(name), `The page coordination function ${name} was not found`);
const compiled = ts.transpileModule(
  functionNames.map(name => declarations.get(name)).join("\n") + `\nmodule.exports = { ${functionNames.join(", ")} };`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function moduleFrom(file) {
  const cjsModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: cjsModule,
    exports: cjsModule.exports,
    require(name) { throw new Error(`Unexpected runtime dependency ${name}`); },
  });
  return cjsModule.exports;
}
const { connectionStateLabel } = moduleFrom("lib/copier/connection-network.ts");
const plain = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
const providerStatus = (connected = true, masters = [{ id: "master-a", name: "GOLD", userIsSubscribed: true, lots: 0.01 }]) => ({
  isTradingAccountConnected: connected,
  masterAccountsList: masters,
});
const reply = (status = providerStatus(), extras = {}) => ({
  ok: true,
  json: async () => ({ enabled: true, maxLots: 0.1, status, ...extras }),
});

function harness() {
  let clock = Date.parse("2026-10-22T12:00:00Z");
  const pending = [];
  const setters = [];
  const displayed = { selectedReceiverId: null, selectedStatus: null, selectedMasters: {}, enabled: false, maxLots: 0.1 };
  const refs = {
    selectedReceiverRef: { current: null },
    connectionStatesRef: { current: {} },
    connectionRequests: { current: new Map() },
    connectionVersions: { current: {} },
    networkCheckingRef: { current: false },
    networkReceiverIdsRef: { current: [] },
  };
  const set = name => value => {
    setters.push(name);
    displayed[name] = typeof value === "function" ? value(displayed[name]) : value;
  };
  class TestDate extends Date {
    static now() { return clock; }
  }
  const cjsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    ...refs,
    module: cjsModule,
    exports: cjsModule.exports,
    Date: TestDate,
    locale: "fr",
    useCallback: callback => callback,
    setSelectedReceiverId: set("selectedReceiverId"),
    setConnectionStates: set("connectionStates"),
    setConnectionNow: set("connectionNow"),
    setSelectedStatus: set("selectedStatus"),
    setSelectedMasters: set("selectedMasters"),
    setMasterConsent: set("masterConsent"),
    setChecked: set("checked"),
    setEnabled: set("enabled"),
    setMaxLots: set("maxLots"),
    setNetworkChecking: set("networkChecking"),
    fetch(url, options) {
      return new Promise((resolve, reject) => pending.push({ url, options, resolve, reject }));
    },
  });
  return {
    api: cjsModule.exports,
    refs,
    pending,
    displayed,
    setters,
    get now() { return clock; },
    advance(ms) { clock += ms; },
  };
}

test("concurrent reads of one receiver share a request; different receivers stay independent", async () => {
  const h = harness();
  const first = h.api.readConnection("receiver-a");
  const second = h.api.readConnection("receiver-a");
  const other = h.api.readConnection("receiver-b");
  assert.equal(first, second);
  assert.equal(h.pending.length, 2);
  assert.equal(h.pending[0].url, "/api/sth?receiverId=receiver-a");
  assert.equal(h.pending[0].options.cache, "no-store");
  h.pending[0].resolve(reply());
  h.pending[1].resolve(reply(providerStatus(false)));
  await Promise.all([first, second, other]);
  assert.equal(h.refs.connectionStatesRef.current["receiver-a"].snapshot.status.isTradingAccountConnected, true);
  assert.equal(h.refs.connectionStatesRef.current["receiver-b"].snapshot.status.isTradingAccountConnected, false);
  const next = h.api.readConnection("receiver-a");
  assert.equal(h.pending.length, 3);
  h.pending[2].resolve(reply());
  await next;
});

test("a late response for A cannot overwrite B's selected form or account limits", async () => {
  const h = harness();
  h.api.setActiveReceiver("receiver-a");
  const readA = h.api.fetchStatus("receiver-a");
  h.api.setActiveReceiver("receiver-b");
  const readB = h.api.fetchStatus("receiver-b");
  const b = providerStatus(true, [{ id: "master-b", name: "EUR", userIsSubscribed: true, lots: 0.07 }]);
  h.pending[1].resolve(reply(b, { maxLots: 0.2 }));
  await readB;
  const formB = h.displayed.selectedMasters;
  h.pending[0].resolve(reply(providerStatus(false), { enabled: false, maxLots: 0.01 }));
  await readA;
  assert.equal(h.displayed.selectedReceiverId, "receiver-b");
  assert.equal(h.displayed.selectedStatus, b);
  assert.equal(h.displayed.selectedMasters, formB);
  assert.deepEqual(plain(formB), { "master-b": { on: true, lots: "0.07" } });
  assert.equal(h.displayed.enabled, true);
  assert.equal(h.displayed.maxLots, 0.2);
  assert.equal(h.setters.filter(name => name === "selectedMasters").length, 1);
  assert.equal(h.refs.connectionStatesRef.current["receiver-a"].snapshot.status.isTradingAccountConnected, false);
});

test("an older GET finishing after a confirmed write cannot undo the write's provider snapshot", async () => {
  const h = harness();
  h.api.setActiveReceiver("receiver-a");
  const oldRead = h.api.fetchStatus("receiver-a");
  h.advance(250);
  const confirmedWrite = providerStatus(false, [{ id: "master-a", name: "GOLD", userIsSubscribed: false, lots: 0.03 }]);
  h.api.applyStatus(confirmedWrite, "receiver-a");
  const confirmedAt = h.refs.connectionStatesRef.current["receiver-a"].snapshot.checkedAt;
  h.advance(500);
  h.pending[0].resolve(reply(providerStatus(true)));
  assert.equal(await oldRead, undefined);
  const current = h.refs.connectionStatesRef.current["receiver-a"];
  assert.equal(current.snapshot.status, confirmedWrite);
  assert.equal(current.snapshot.checkedAt, confirmedAt);
  assert.equal(current.checking, false);
  assert.equal(h.displayed.selectedStatus, confirmedWrite);
  assert.deepEqual(plain(h.displayed.selectedMasters), { "master-a": { on: false, lots: "0.03" } });
});

test("network, HTTP, and malformed-response failures leave no spinner or false green confirmation", async () => {
  for (const failure of ["network", "http", "payload"]) {
    const h = harness();
    h.api.confirmConnection("receiver-a", providerStatus());
    const read = h.api.readConnection("receiver-a");
    assert.equal(connectionStateLabel(h.refs.connectionStatesRef.current["receiver-a"], h.now).kind, "checking");
    if (failure === "network") h.pending[0].reject(new Error("Offline"));
    else if (failure === "http") h.pending[0].resolve({ ok: false, json: async () => ({ error: "Provider unavailable" }) });
    else h.pending[0].resolve({ ok: true, json: async () => ({ enabled: true, status: {} }) });
    await assert.rejects(read);
    const current = h.refs.connectionStatesRef.current["receiver-a"];
    assert.equal(current.checking, false, failure);
    assert.equal(current.error, true, failure);
    assert.equal(connectionStateLabel(current, h.now).kind, "error", failure);
    assert.notEqual(connectionStateLabel(current, h.now).tone, "green", failure);
    const retry = h.api.readConnection("receiver-a");
    assert.equal(h.pending.length, 2, `${failure}: the completed request must not block retries`);
    h.pending[1].resolve(reply());
    await retry;
    assert.equal(connectionStateLabel(h.refs.connectionStatesRef.current["receiver-a"], h.now).kind, "connected");
  }
});

test("automatic network verification updates confirmations without resetting edited master choices", async () => {
  const h = harness();
  h.api.setActiveReceiver("receiver-a");
  const draft = { "master-a": { on: false, lots: "0.08" }, "master-b": { on: true, lots: "0.05" } };
  h.displayed.selectedMasters = draft;
  h.displayed.masterConsent = true;
  h.refs.networkReceiverIdsRef.current = ["receiver-a", "receiver-b"];
  const verification = h.api.verifyNetwork(false);
  assert.equal(h.displayed.networkChecking, true);
  h.pending[0].resolve(reply(providerStatus(true, [])));
  await flush();
  assert.equal(h.pending.length, 2);
  h.pending[1].resolve(reply(providerStatus(false)));
  await verification;
  assert.equal(h.displayed.selectedMasters, draft);
  assert.equal(h.displayed.masterConsent, true);
  assert.equal(h.setters.filter(name => name === "selectedMasters").length, 0);
  assert.equal(h.setters.filter(name => name === "selectedStatus").length, 0);
  assert.deepEqual(plain(h.refs.connectionStatesRef.current["receiver-a"].snapshot.status.masterAccountsList), []);
  assert.equal(h.refs.connectionStatesRef.current["receiver-b"].snapshot.status.isTradingAccountConnected, false);
  assert.equal(h.displayed.networkChecking, false);
  assert.equal(h.refs.networkCheckingRef.current, false);
});

test("a failed receiver does not prevent verification of the next receiver", async () => {
  const h = harness();
  h.refs.networkReceiverIdsRef.current = ["receiver-a", "receiver-b"];
  const verification = h.api.verifyNetwork(true);
  h.pending[0].reject(new Error("Provider unavailable"));
  await flush();
  assert.equal(h.pending.length, 2);
  h.pending[1].resolve(reply());
  await verification;
  assert.equal(h.refs.connectionStatesRef.current["receiver-a"].error, true);
  assert.equal(h.refs.connectionStatesRef.current["receiver-b"].snapshot.status.isTradingAccountConnected, true);
  assert.equal(h.displayed.networkChecking, false);
});
