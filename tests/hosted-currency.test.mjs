import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// The hosted connector refuses to pair an account again with another currency (investpro_mt_pair_v2 raises
// « currency mismatch »): the member gets a clear answer instead of the generic « réessaie ».
const root = path.resolve(import.meta.dirname, "..");
const user = { id: "33333333-3333-4333-8333-333333333333" };
const key = "a".repeat(64);
const installedBroker = { id: "mt5-vtmarkets-live", label: "VT Markets", platform: "MT5", server: "VTMarkets-Live" };
const notInstalled = { id: "fallback-mt5-vt-markets-5", label: "VT Markets", platform: "MT5", server: "VTMarkets-Live 4" };
const payload = { broker: installedBroker.id, login: "88123456", password: "lecture-seule", currency: "EUR", type: "real", syncConsent: true };

function hostedRoute(databaseError, chosen = installedBroker) {
  const calls = { rpc: [] };
  const cjsModule = { exports: {} };
  const modules = {
    "node:crypto": { randomBytes: () => ({ toString: () => "random" }) },
    "@/lib/metasync/server": {
      sameOrigin: () => true,
      digest: value => `hash:${value}`,
      database: () => ({ async rpc(name, args) { calls.rpc.push({ name, args }); return { data: databaseError ? null : "job-1", error: databaseError }; } }),
    },
    "@/lib/metasync/request-proof": { issueHostedRequestToken: () => "token", verifyHostedRequestToken: () => true },
    "@/lib/metasync/hosted": { brokers: () => [installedBroker, notInstalled], awaitingInstall: item => item.id.startsWith("fallback-"), async hostedUser() { return user; }, async body() { return { ...payload, broker: chosen.id }; }, seal: () => "sealed" },
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

test("an account already paired with another currency gets a clear answer, not a generic retry", async () => {
  const route = hostedRoute({ message: "currency mismatch", code: "P0001" });
  const result = await route.post();
  assert.equal(result.status, 409);
  assert.match(result.body.error, /déjà enregistré avec une autre devise/);
  assert.match(result.body.error, /@EquipeInvestPro/);
  assert.equal(route.calls.rpc.length, 1);
  assert.equal(route.calls.rpc[0].args.p_currency, "EUR");
  assert.equal(route.calls.rpc[0].args.p_secret, "sealed", "The password only reaches the database sealed");
});

test("a new account is still paired as before", async () => {
  const route = hostedRoute(null);
  const result = await route.post();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, id: "job-1", awaitingInstall: false });
  assert.equal(route.calls.rpc[0].name, "investpro_hosted_pair_auto");
  assert.equal(route.calls.rpc.length, 1, "An installed server needs no request");
});

test("a server not installed on the hosting PC yet is saved, and the team gets the request to install it", async () => {
  const route = hostedRoute(null, notInstalled);
  const result = await route.post();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, id: "job-1", awaitingInstall: true });
  assert.deepEqual(route.calls.rpc.map(call => call.name), ["investpro_hosted_pair_auto", "investpro_request_server"]);
  assert.deepEqual({ ...route.calls.rpc[1].args }, { p_user: user.id, p_broker: "VT Markets", p_platform: "MT5", p_server: "VTMarkets-Live 4" });
});
