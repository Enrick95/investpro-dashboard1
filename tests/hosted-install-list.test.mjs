import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// The hosting PC registers the servers still to install under the exact IDs the site gives them
// (Metatrader5/hosted-be-update/serveurs-a-installer.json), so members already waiting on a server connect as soon
// as it is installed. Those « fallback-… » IDs are positions in the site's list: they must keep naming the same server.
const root = path.resolve(import.meta.dirname, "..");
const list = JSON.parse(fs.readFileSync(path.join(root, "Metatrader5/hosted-be-update/serveurs-a-installer.json"), "utf8"));

function siteList() {
  const cjsModule = { exports: {} };
  const modules = { "node:crypto": {}, "@/lib/supabase/server": { createClient() { throw new Error("NO_AUTH_IN_LIST_TEST"); } } };
  const source = fs.readFileSync(path.join(root, "lib/metasync/hosted.ts"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module: cjsModule, exports: cjsModule.exports, Buffer, process: { env: {} },
    require: name => { assert(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; },
  });
  return Array.from(cjsModule.exports.brokers());
}

const entries = [...list.vip, ...list.autres];

test("every server to install keeps the ID the site gives it, on the same platform and server", () => {
  const byId = new Map(siteList().map(item => [item.id, item]));
  for (const entry of entries) {
    const offered = byId.get(entry.id);
    assert.ok(offered, `${entry.id} is still offered by the site`);
    assert.deepEqual({ label: offered.label, platform: offered.platform, server: offered.server }, { label: entry.label, platform: entry.platform, server: entry.server }, entry.id);
  }
});

test("each ID is accepted by host.py register and appears once", () => {
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
  for (const entry of entries) assert.match(entry.id, /^[a-z0-9-]{1,60}$/, entry.id);
});

test("the VIP brokers come first, the other brokers after", () => {
  const vip = /^(?:axi(?:\b|trader|corp)|pu ?prime|vt ?markets|vantage|raise)|bullwaves/i;
  assert.ok(list.vip.length > 0 && list.autres.length > 0);
  for (const entry of list.vip) assert.ok(vip.test(entry.server) || vip.test(entry.label), entry.id);
  for (const entry of list.autres) assert.ok(!vip.test(entry.server) && !vip.test(entry.label), entry.id);
});
