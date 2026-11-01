import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import * as crypto from "node:crypto";
import * as net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "../lib/essai-vip-rate-limit.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const secret = "123456789:fake_test_token";
const genericFailure = { message: "ESSAI_VIP_RATE_LIMIT_UNAVAILABLE" };

function fixture({ env = {}, result = { data: { allowed: true, retry_after_seconds: 0 }, error: null }, rpcError, databaseError } = {}) {
  const calls = { database: 0, rpc: [], logs: [] };
  const compiledModule = { exports: {} };
  vm.runInNewContext(output, {
    module: compiledModule, exports: compiledModule.exports, URL,
    process: { env: { VERCEL: "1", TELEGRAM_BOT_TOKEN: secret, ...env } },
    console: Object.fromEntries(["log", "info", "warn", "error", "debug"].map(level => [level, (...args) => calls.logs.push({ level, args })])),
    require(name) {
      if (name === "node:crypto") return crypto;
      if (name === "node:net") return net;
      assert.equal(name, "@/lib/telegram/server");
      return { database() {
        calls.database++;
        if (databaseError) throw databaseError;
        return { async rpc(name, args) {
          calls.rpc.push({ name, args });
          if (rpcError) throw rpcError;
          return result;
        } };
      } };
    },
  });
  async function consume(headers = { "x-vercel-forwarded-for": "192.0.2.1" }) {
    try {
      return await compiledModule.exports.consumeEssaiVipRateLimit(new Request("https://investprotrading.fr/api/essai-vip", { headers }));
    } finally {
      assert.equal(calls.logs.length, 0);
    }
  }
  return { calls, consume };
}

test("the RPC receives only a domain-separated keyed IP digest", async () => {
  const { calls, consume } = fixture();
  const decision = await consume();
  assert.equal(decision.allowed, true);
  assert.equal(decision.retryAfterSeconds, 0);
  assert.equal(calls.database, 1);
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.rpc[0].name, "consume_essai_vip_rate_limit");
  const bucket = calls.rpc[0].args.p_bucket;
  assert.deepEqual(Object.keys(calls.rpc[0].args), ["p_bucket"]);
  assert.match(bucket, /^[a-f0-9]{64}$/);
  assert.equal(bucket, createHmac("sha256", secret).update("essai-vip:v1:192.0.2.1").digest("hex"));
  assert.notEqual(bucket, createHash("sha256").update("essai-vip:v1:192.0.2.1").digest("hex"));
  assert.ok(!JSON.stringify(calls.rpc).includes("192.0.2.1"));
});

test("equivalent IPv6 spellings and IPv4-mapped aliases share a bucket", async () => {
  const { calls, consume } = fixture();
  for (const address of ["2001:0DB8:0000:0000:0000:0000:0000:0001", "2001:db8::1"]) {
    await consume({ "x-vercel-forwarded-for": address });
  }
  assert.equal(calls.rpc[0].args.p_bucket, calls.rpc[1].args.p_bucket);
  for (const address of ["192.0.2.1", "::ffff:192.0.2.1", "0:0:0:0:0:FFFF:c000:0201"]) {
    await consume({ "x-vercel-forwarded-for": address });
  }
  assert.equal(calls.rpc[2].args.p_bucket, calls.rpc[3].args.p_bucket);
  assert.equal(calls.rpc[3].args.p_bucket, calls.rpc[4].args.p_bucket);
});

test("trusted primary IP wins and fallback is allowed only when primary is absent", async () => {
  const { calls, consume } = fixture();
  await consume({ "x-vercel-forwarded-for": "192.0.2.1", "x-real-ip": "198.51.100.1", "x-forwarded-for": "203.0.113.1" });
  await consume({ "x-real-ip": "192.0.2.1", "x-forwarded-for": "203.0.113.1" });
  assert.equal(calls.rpc[0].args.p_bucket, calls.rpc[1].args.p_bucket);
  await assert.rejects(consume({ "x-forwarded-for": "192.0.2.1" }), genericFailure);
  await assert.rejects(consume({ "x-vercel-forwarded-for": "", "x-real-ip": "192.0.2.1" }), genericFailure);
  await assert.rejects(consume({ "x-vercel-forwarded-for": "malformed", "x-real-ip": "192.0.2.1" }), genericFailure);
  assert.equal(calls.rpc.length, 2);
});

test("malformed addresses, forwarding lists, ports, and scoped IPv6 fail before database access", async () => {
  const { calls, consume } = fixture();
  for (const address of ["192.0.2.1, 198.51.100.1", "192.000.2.1", "192.0.2.1:443", "[2001:db8::1]", "fe80::1%eth0", "2001:db8::1/64", "unknown"]) {
    await assert.rejects(consume({ "x-vercel-forwarded-for": address }), genericFailure);
  }
  await assert.rejects(consume({}), genericFailure);
  assert.equal(calls.database, 0);
});

test("missing Vercel provenance or HMAC configuration fails closed", async () => {
  for (const env of [{ VERCEL: undefined }, { VERCEL: "0" }, { VERCEL: "true" }, { TELEGRAM_BOT_TOKEN: undefined }, { TELEGRAM_BOT_TOKEN: "" }, { TELEGRAM_BOT_TOKEN: " " }]) {
    const { calls, consume } = fixture({ env });
    await assert.rejects(consume(), genericFailure);
    assert.equal(calls.database, 0);
  }
});

test("denied decisions preserve the database retry interval", async () => {
  for (const seconds of [1, 61, 3600]) {
    const { consume } = fixture({ result: { data: { allowed: false, retry_after_seconds: seconds }, error: null } });
    const decision = await consume();
    assert.equal(decision.allowed, false);
    assert.equal(decision.retryAfterSeconds, seconds);
  }
});

test("malformed or inconsistent RPC results fail closed", async () => {
  for (const data of [null, [], [{ allowed: true, retry_after_seconds: 0 }], {}, { allowed: "true", retry_after_seconds: 0 }, { allowed: true, retry_after_seconds: "0" }, { allowed: true, retry_after_seconds: 1 }, { allowed: false, retry_after_seconds: 0 }, { allowed: false, retry_after_seconds: -1 }, { allowed: false, retry_after_seconds: 1.5 }, { allowed: false, retry_after_seconds: 3601 }, { allowed: false, retry_after_seconds: Infinity }, { allowed: false, retry_after_seconds: NaN }]) {
    const { consume } = fixture({ result: { data, error: null } });
    await assert.rejects(consume(), genericFailure);
  }
});

test("database and RPC failures expose no provider details or causes", async () => {
  for (const setup of [{ databaseError: new Error("private service configuration") }, { rpcError: new Error("private provider URL") }, { result: { data: { allowed: true, retry_after_seconds: 0 }, error: { message: "private provider detail" } } }]) {
    const { consume } = fixture(setup);
    await assert.rejects(consume(), error => {
      assert.equal(error.message, genericFailure.message);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});
