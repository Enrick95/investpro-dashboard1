import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// The hosting PC writes the password into MetaTrader's startup file, which refuses every control character
// (investpro_mt5_native._value). A password with a tabulation used to be saved, then failed on every read
// without the member knowing why. The site now refuses it at once, with a message that says how to fix it.
const root = path.resolve(import.meta.dirname, "..");
const user = { id: "44444444-4444-4444-8444-444444444444" };
const key = "b".repeat(64);
const broker = { id: "mt5-vtmarkets-live", label: "VT Markets", platform: "MT5", server: "VTMarkets-Live" };

function hostedRoute(password) {
  const calls = { rpc: [], seal: 0 };
  const cjsModule = { exports: {} };
  const payload = { broker: broker.id, login: "88123456", password, currency: "USD", type: "demo", syncConsent: true };
  const modules = {
    "node:crypto": { randomBytes: () => ({ toString: () => "random" }) },
    "@/lib/metasync/server": {
      sameOrigin: () => true,
      digest: value => `hash:${value}`,
      database: () => ({ async rpc(name, args) { calls.rpc.push({ name, args }); return { data: "job-1", error: null }; } }),
    },
    "@/lib/metasync/request-proof": { issueHostedRequestToken: () => "token", verifyHostedRequestToken: () => true },
    "@/lib/metasync/hosted": {
      brokers: () => [broker],
      awaitingInstall: () => false,
      async hostedUser() { return user; },
      async body() { return payload; },
      seal: () => { calls.seal++; return "sealed"; },
    },
  };
  const source = fs.readFileSync(path.join(root, "app/api/metasync/hosted/route.ts"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module: cjsModule, exports: cjsModule.exports, URL, Request, Response, Headers,
    process: { env: { VERCEL_ENV: "production", METASYNC_HOSTED_ENCRYPTION_KEY: key, METASYNC_HOSTED_WORKER_TOKEN: key } },
    console: { warn() {}, error() {} },
    require: name => { assert(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; },
  });
  return {
    calls,
    async post() {
      const response = await cjsModule.exports.POST(new Request("https://investprotrading.fr/api/metasync/hosted", { method: "POST", headers: { Origin: "https://investprotrading.fr", "Content-Type": "application/json" }, body: "{}" }));
      return { status: response.status, body: await response.json() };
    },
  };
}

for (const [label, password] of [["a tabulation", "motdepasse\t"], ["a delete character", "mot\u007fpasse"], ["a line break", "motdepasse\n"], ["a null character", "mot\u0000passe"]]) {
  test(`a password containing ${label} is refused before anything is saved`, async () => {
    const route = hostedRoute(password);
    const result = await route.post();
    assert.equal(result.status, 400);
    assert.match(result.body.error, /caractère invisible/);
    assert.match(result.body.error, /Tape-le à la main/);
    assert.equal(route.calls.rpc.length, 0, "No hosted job is created");
    assert.equal(route.calls.seal, 0, "The password is not even sealed");
  });
}

test("a password with spaces, accents and symbols is still accepted", async () => {
  const route = hostedRoute("Mot de passé #1 ; [ok] = €");
  const result = await route.post();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, id: "job-1", awaitingInstall: false });
  assert.equal(route.calls.rpc.length, 1);
  assert.equal(route.calls.rpc[0].args.p_secret, "sealed");
});

test("an empty or overlong password keeps the existing message", async () => {
  for (const password of ["", "x".repeat(129)]) {
    const route = hostedRoute(password);
    const result = await route.post();
    assert.equal(result.status, 400);
    assert.match(result.body.error, /Le mot de passe est absent ou son format/);
    assert.equal(route.calls.rpc.length, 0);
  }
});
