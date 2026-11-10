import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// The servers offered for the hosted connection are the templates installed on the hosting PC, listed in
// METASYNC_HOSTED_BROKERS with the IDs `host.py register` gives them (ex. « puprime-mt5-live6 »).
const root = path.resolve(import.meta.dirname, "..");

function brokers(env) {
  const cjsModule = { exports: {} };
  const modules = { "node:crypto": {}, "@/lib/supabase/server": { createClient() { throw new Error("NO_AUTH_IN_CATALOG_TEST"); } } };
  const source = fs.readFileSync(path.join(root, "lib/metasync/hosted.ts"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module: cjsModule, exports: cjsModule.exports, Buffer, process: { env },
    require: name => { assert(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; },
  });
  return cjsModule.exports.brokers();
}

const installed = [
  { id: "puprime-mt5-live6", label: "PU Prime", platform: "MT5", server: "PUPrime-Live 6" },
  { id: "mt5-vtmarkets-live-9", label: "VT Markets", platform: "MT5", server: "VTMarkets-Live 9" },
  { id: "mt4-axi-us03-live", label: "Axi", platform: "MT4", server: "Axi-US03-Live" },
  { id: "mt5-raiseglobalsa-live", label: "Raise Global", platform: "MT5", server: "RaiseGlobalSA-LIVE" },
];

test("the templates installed on the hosting PC are offered with their own IDs", () => {
  const list = brokers({ METASYNC_HOSTED_BROKERS: JSON.stringify(installed) });
  assert.deepEqual(Array.from(list, item => item.id), installed.map(item => item.id));
  assert.ok(!list.some(item => item.id.startsWith("fallback-")), "No emergency entry when the configuration is valid");
});

test("only malformed entries are dropped; the emergency list is used only when nothing is valid", () => {
  const list = brokers({ METASYNC_HOSTED_BROKERS: JSON.stringify([...installed, { id: "Bad ID", label: "X", platform: "MT5", server: "X-Live" }, { id: "mt5-x", label: "X", platform: "MT6", server: "X-Live" }]) });
  assert.equal(list.length, installed.length);
  assert.ok(brokers({ METASYNC_HOSTED_BROKERS: "not json" }).every(item => item.id.startsWith("fallback-")));
  assert.ok(brokers({}).every(item => item.id.startsWith("fallback-")));
});
