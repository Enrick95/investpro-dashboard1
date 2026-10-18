import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const apex = "https://investprotrading.fr";
const www = "https://www.investprotrading.fr";
const upstream = "https://investpro-dashboard1-upstream-invest-pronos.vercel.app/api/metasync/hosted";
const user = { id: "33333333-3333-4333-8333-333333333333" };

function compile(file, modules, environment = {}) {
  const cjsModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module: cjsModule, exports: cjsModule.exports, URL, Request, Response, Headers,
    process: { env: environment },
    console: { warn() {} },
    fetch() { throw new Error("NETWORK_FORBIDDEN_IN_ORIGIN_TEST"); },
    require: name => { assert(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; },
  });
  return cjsModule.exports;
}

function originHelper(environment = {}) {
  return compile("lib/metasync/server.ts", {
    "node:crypto": { createHash() { throw new Error("CRYPTO_FORBIDDEN_IN_ORIGIN_TEST"); } },
    "@/lib/supabase/server": { createClient() { throw new Error("AUTH_FORBIDDEN_IN_PURE_ORIGIN_TEST"); } },
    "@/lib/telegram/server": { database() { throw new Error("DATABASE_FORBIDDEN_IN_ORIGIN_TEST"); } },
  }, { VERCEL_ENV: "production", ...environment });
}

function request(origin, { url = upstream, extra = {} } = {}) {
  const headers = new Headers(extra);
  if (origin !== undefined) headers.set("Origin", origin);
  return new Request(url, { method: "POST", headers });
}

function hostedFixture({ environment = {}, signedIn = true, authFailure = false, routeFile = "app/api/metasync/hosted/route.ts" } = {}) {
  const calls = { auth: 0, body: 0, database: 0, catalog: 0, crypto: 0, seal: 0 };
  const origin = originHelper(environment);
  const route = compile(routeFile, {
    "node:crypto": { randomBytes() { calls.crypto++; throw new Error("CRYPTO_FORBIDDEN_IN_ORIGIN_TEST"); } },
    "@/lib/metasync/server-catalog": { async serverCatalog() { calls.catalog++; throw new Error("CATALOG_FORBIDDEN_IN_ORIGIN_TEST"); } },
    "@/lib/metasync/server": { sameOrigin: origin.sameOrigin, database() { calls.database++; throw new Error("DATABASE_FORBIDDEN_IN_ORIGIN_TEST"); }, digest() { calls.crypto++; throw new Error("CRYPTO_FORBIDDEN_IN_ORIGIN_TEST"); } },
    "@supabase/supabase-js": { createClient() { calls.database++; throw new Error("DATABASE_FORBIDDEN_IN_ORIGIN_TEST"); } },
    "@/lib/copier/requestCrypto": { decryptCopierPassword() { calls.crypto++; throw new Error("CRYPTO_FORBIDDEN_IN_ORIGIN_TEST"); } },
    "@/lib/metasync/request-proof": { issueHostedRequestToken() { return null; }, verifyHostedRequestToken() { return false; } },
    "@/lib/metasync/hosted": {
      async hostedUser() { calls.auth++; if (authFailure) throw new Error("AUTH_FIXTURE_FAILURE"); return signedIn ? user : null; },
      async body() { calls.body++; throw new Error("INTENTIONALLY_INVALID_FIXTURE_BODY"); },
      seal() { calls.seal++; throw new Error("SEAL_FORBIDDEN_IN_ORIGIN_TEST"); },
    },
  }, { VERCEL_ENV: "production", ...environment });
  return { calls, async post(originValue, options = {}) { const url = routeFile.includes("master-sync") ? upstream.replace("/api/metasync/hosted", "/api/copier/master-sync") : upstream; const response = await route.POST(request(originValue, { url, ...options })); return { status: response.status, body: await response.json() }; } };
}

function noSensitiveWork(calls) {
  assert.equal(calls.database + calls.catalog + calls.crypto + calls.seal, 0);
}

test("both official HTTPS browser origins remain trusted when the dedicated setting is absent or stale", () => {
  for (const setting of [undefined, "", apex, www, apex + "/", "https://old-investpro.example.invalid"]) {
    const guard = originHelper(setting === undefined ? {} : { METASYNC_SITE_ORIGIN: setting });
    for (const origin of [apex, www]) assert.equal(guard.sameOrigin(request(origin)), true, `origin=${origin}; setting=${setting ?? "absent"}`);
  }
});

test("a Vercel upstream URL and Host mismatch cannot block an official serialized browser Origin", () => {
  const guard = originHelper({ METASYNC_SITE_ORIGIN: apex });
  for (const origin of [apex, www]) {
    assert.equal(guard.sameOrigin(request(origin, { extra: { Host: "internal.vercel.app", "X-Forwarded-Host": new URL(origin).host, "X-Forwarded-Proto": "https" } })), true);
    assert.equal(guard.sameOrigin(request(origin, { url: "http://localhost:3000/api/metasync/hosted", extra: { Host: "localhost:3000", "X-Forwarded-Host": "deployment.vercel.app" } })), true);
  }
});

test("missing, null and multiple/ambiguous browser Origins are rejected even with trusted forwarding headers", () => {
  const guard = originHelper({ METASYNC_SITE_ORIGIN: apex });
  for (const origin of [undefined, "", "null", `${apex}, ${www}`, `${apex} ${www}`, `${apex}, https://evil.example.invalid`, apex + "/", apex + "/dashboard", "https://user@investprotrading.fr", "https://investprotrading.fr:444"]) {
    assert.equal(guard.sameOrigin(request(origin, { extra: { Host: "investprotrading.fr", "X-Forwarded-Host": "investprotrading.fr", "Sec-Fetch-Site": "same-origin", Referer: apex + "/dashboard/connexions" } })), false, String(origin));
  }
});

test("foreign and lookalike origins are never trusted from Host, forwarding, Referer or fetch-site hints", () => {
  const guard = originHelper({ METASYNC_SITE_ORIGIN: apex });
  for (const origin of ["https://evil.example.invalid", "http://investprotrading.fr", "https://investprotrading.fr.evil.example.invalid", "https://notinvestprotrading.fr", "https://investpro-dashboard1-foreign.vercel.app"]) {
    assert.equal(guard.sameOrigin(request(origin, { url: apex + "/api/metasync/hosted", extra: { Host: "investprotrading.fr", "X-Forwarded-Host": "investprotrading.fr", "X-Forwarded-Origin": apex, Referer: apex + "/dashboard/connexions", "Sec-Fetch-Site": "same-origin" } })), false, origin);
  }
});

test("official production POSTs pass the origin guard to safe body validation without database or MT activity", async () => {
  for (const origin of [apex, www]) {
    const api = hostedFixture();
    const response = await api.post(origin, { extra: { Host: "internal.vercel.app", "X-Forwarded-Host": new URL(origin).host } });
    // The body intentionally fails before database(), seal() or any hosted RPC.
    assert.equal(response.status, 400);
    assert.match(response.body.error, /demande reçue est invalide/);
    assert.equal(api.calls.auth, 1); assert.equal(api.calls.body, 1);
    noSensitiveWork(api.calls);
  }
});

test("foreign POSTs fail before reading input or attempting hosted persistence", async () => {
  for (const origin of [undefined, "null", "https://evil.example.invalid", `${apex}, https://evil.example.invalid`]) {
    const api = hostedFixture({ environment: { METASYNC_SITE_ORIGIN: apex } });
    assert.equal((await api.post(origin)).status, 403);
    assert.equal(api.calls.body, 0); noSensitiveWork(api.calls);
  }
});

test("session verification is still required before any hosted request can proceed", async () => {
  for (const options of [{ signedIn: false }, { authFailure: true }]) {
    const api = hostedFixture(options);
    assert.equal((await api.post(apex)).status, options.authFailure ? 503 : 401);
    assert.equal(api.calls.body, 0); noSensitiveWork(api.calls);
  }
});

test("preview origins retain their separate non-mutating guard even after production origin repair", async () => {
  const deployment = "investpro-dashboard1-preview.vercel.app";
  const api = hostedFixture({ environment: { VERCEL_ENV: "preview", VERCEL_URL: deployment, METASYNC_SITE_ORIGIN: apex } });
  const accepted = await api.post(`https://${deployment}`);
  assert.equal(accepted.status, 503);
  assert.match(accepted.body.error, /Aucun changement/);
  assert.equal((await api.post(apex)).status, 403);
  assert.equal(api.calls.body, 0); noSensitiveWork(api.calls);
});

test("a cross-site fetch hint rejects even an otherwise official serialized Origin", async () => {
  const guard = originHelper({ METASYNC_SITE_ORIGIN: apex });
  for (const origin of [apex, www]) {
    assert.equal(guard.sameOrigin(request(origin, { extra: { "Sec-Fetch-Site": "cross-site" } })), false);
    for (const value of ["same-origin", "same-site", "none"]) assert.equal(guard.sameOrigin(request(origin, { extra: { "Sec-Fetch-Site": value } })), true);
    const api = hostedFixture();
    assert.equal((await api.post(origin, { extra: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
    assert.equal(api.calls.body, 0); noSensitiveWork(api.calls);
  }
});

test("the shared guard refuses all preview origins, including matching configured and official domains", () => {
  const preview = "https://investpro-dashboard1-preview.vercel.app";
  for (const configured of [apex, www, preview]) {
    const guard = originHelper({ VERCEL_ENV: "preview", METASYNC_SITE_ORIGIN: configured });
    for (const origin of [apex, www, preview]) assert.equal(guard.sameOrigin(request(origin)), false);
  }
});

test("explicit development origins are normalized safely and must still match the exact serialized Origin", () => {
  for (const [configured, origin] of [["  http://localhost:3000/  ", "http://localhost:3000"], ["http://127.0.0.1:3189/", "http://127.0.0.1:3189"], ["http://[::1]:3000/", "http://[::1]:3000"], ["  https://dev.example.invalid/  ", "https://dev.example.invalid"]]) {
    const guard = originHelper({ VERCEL_ENV: "development", METASYNC_SITE_ORIGIN: configured });
    assert.equal(guard.sameOrigin(request(origin)), true, configured);
    assert.equal(guard.sameOrigin(request(origin + "/")), false);
    assert.equal(guard.sameOrigin(request("https://unconfigured.example.invalid")), false);
  }
  const local = originHelper({ VERCEL_ENV: undefined, NODE_ENV: "development", METASYNC_SITE_ORIGIN: "http://localhost:3000/" });
  assert.equal(local.sameOrigin(request("http://localhost:3000")), true);
});

test("production never trusts an arbitrary dedicated-origin setting or a development NODE_ENV override", () => {
  for (const environment of [{ VERCEL_ENV: "production" }, { VERCEL_ENV: "production", NODE_ENV: "development" }, { VERCEL_ENV: undefined, NODE_ENV: "production" }]) {
    for (const origin of ["http://localhost:3000", "https://dev.example.invalid", "https://untrusted.vercel.app"]) {
      const guard = originHelper({ ...environment, METASYNC_SITE_ORIGIN: origin });
      assert.equal(guard.sameOrigin(request(origin)), false);
      assert.equal(guard.sameOrigin(request(apex)), true);
    }
  }
});

test("invalid development configuration cannot add credentials, paths, queries, fragments or remote HTTP", () => {
  for (const configured of ["localhost:3000", "https://user:pass@dev.example.invalid", "https://dev.example.invalid/path", "https://dev.example.invalid/?source=unsafe", "https://dev.example.invalid/#fragment", "http://dev.example.invalid", "http://192.168.1.10:3000", "null"]) {
    const guard = originHelper({ VERCEL_ENV: "development", METASYNC_SITE_ORIGIN: configured });
    for (const origin of ["https://dev.example.invalid", "http://dev.example.invalid", "http://192.168.1.10:3000", "http://localhost:3000"]) assert.equal(guard.sameOrigin(request(origin)), false, configured);
  }
});

test("non-serialized URL lookalikes and duplicate Origin headers remain invalid", () => {
  const guard = originHelper();
  for (const origin of ["https://investprotrading.fr:443", "https://investprotrading.fr?next=evil", "https://investprotrading.fr#fragment", "HTTPS://INVESTPROTRADING.FR", "https:\\investprotrading.fr", "blob:https://investprotrading.fr/example", "data:text/plain,https://investprotrading.fr", "https://investprotrading.fr."]) assert.equal(guard.sameOrigin(request(origin)), false, origin);
  const headers = new Headers(); headers.append("Origin", apex); headers.append("Origin", apex);
  assert.equal(guard.sameOrigin(new Request(upstream, { method: "POST", headers })), false);
});

test("the real Master-sync route accepts official origins only as far as safe early body validation", async () => {
  for (const origin of [apex, www]) {
    const api = hostedFixture({ routeFile: "app/api/copier/master-sync/route.ts" });
    const result = await api.post(origin, { extra: { Host: "internal.vercel.app" } });
    assert.equal(result.status, 400); assert.match(result.body.error, /demande reçue est invalide/);
    assert.equal(api.calls.auth, 1); assert.equal(api.calls.body, 1); noSensitiveWork(api.calls);
  }
});

test("Master-sync retains auth, foreign-origin and preview rejection without database or password access", async () => {
  const routeFile = "app/api/copier/master-sync/route.ts";
  for (const [options, origin, status] of [[{ signedIn: false }, apex, 401], [{ authFailure: true }, apex, 503], [{}, "https://evil.example.invalid", 403], [{}, "null", 403], [{ environment: { VERCEL_ENV: "preview" } }, apex, 503]]) {
    const api = hostedFixture({ routeFile, ...options });
    assert.equal((await api.post(origin)).status, status);
    assert.equal(api.calls.body, 0); noSensitiveWork(api.calls);
  }
});
