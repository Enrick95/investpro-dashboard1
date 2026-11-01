import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const project = path.resolve(import.meta.dirname, "..");
const submission = { broker: "VT Markets", nom: "Test", telegram: "@test", compte: "1", serveur: "S", motdepasse: "x", website: "" };

function compile(file, modules = {}, globals = {}) {
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(project, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module: compiledModule, exports: compiledModule.exports, URL, Request, Response, TextDecoder,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name);
      return modules[name];
    },
    ...globals,
  });
  return compiledModule.exports;
}

const helpers = compile("lib/essai-vip.ts");

function fixture({ env = {}, rate, fetchResponse, fetchError, aborted = false } = {}) {
  const calls = { rate: [], fetch: [], timeouts: [], logs: [] };
  const runtime = {
    process: { env: { VERCEL_ENV: "production", TELEGRAM_BOT_TOKEN: "123456789:fake_test_token", TELEGRAM_CHAT_ID: "123456789", ...env } },
    console: Object.fromEntries(["log", "info", "warn", "error", "debug"].map(level => [level, (...args) => calls.logs.push({ level, args })])),
    AbortSignal: { timeout(milliseconds) {
      calls.timeouts.push(milliseconds);
      return aborted ? AbortSignal.abort(new DOMException("fixture timeout", "TimeoutError")) : new AbortController().signal;
    } },
    async fetch(url, options) {
      calls.fetch.push({ url, options });
      options.signal.throwIfAborted();
      if (fetchError) throw fetchError;
      return fetchResponse ? fetchResponse() : Response.json({ ok: true, result: { message_id: 1 } });
    },
  };
  const provider = compile("lib/telegram/server.ts", {
    "@supabase/supabase-js": { createClient() { throw new Error("The trial handler must not store credentials"); } },
    "@/lib/supabase/server": { createClient() { throw new Error("The trial handler must not use a user session"); } },
  }, runtime);
  const route = compile("app/api/essai-vip/route.ts", {
    "@/lib/essai-vip": helpers,
    "@/lib/telegram/server": provider,
    "@/lib/essai-vip-rate-limit": { async consumeEssaiVipRateLimit(request) {
      calls.rate.push(request);
      return rate ? rate(request) : { allowed: true, retryAfterSeconds: 0 };
    } },
  }, runtime);
  async function post(payload = submission, { headers: customHeaders = {}, rawBody, url = "https://investprotrading.fr/api/essai-vip" } = {}) {
    const headers = new Headers({ "Content-Type": "application/json" });
    for (const [key, value] of Object.entries(customHeaders)) {
      if (value === null) headers.delete(key);
      else headers.set(key, value);
    }
    const body = rawBody === undefined ? JSON.stringify(payload) : rawBody;
    const request = new Request(url, { method: "POST", headers, body, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) });
    const response = await route.POST(request);
    const responseText = await response.text();
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(calls.logs.length, 0);
    return { status: response.status, headers: response.headers, body: JSON.parse(responseText), text: responseText };
  }
  return { calls, post };
}

test("the documented curl submission sends exactly one HTML Telegram message", async () => {
  const { post, calls } = fixture();
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(calls.rate.length, 1);
  assert.ok(calls.rate[0] instanceof Request);
  assert.equal(calls.fetch.length, 1);
  const request = calls.fetch[0];
  assert.equal(request.url, "https://api.telegram.org/bot123456789:fake_test_token/sendMessage");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.cache, "no-store");
  assert.deepEqual(calls.timeouts, [10000]);
  const message = JSON.parse(request.options.body);
  assert.equal(message.chat_id, "123456789");
  assert.equal(message.parse_mode, "HTML");
  assert.equal(message.link_preview_options.is_disabled, true);
  assert.match(message.text, /<code>1<\/code>/);
  assert.match(message.text, /<code>S<\/code>/);
  assert.match(message.text, /<code>x<\/code>/);
});

test("all five brokers are accepted and numeric group destinations stay server controlled", async () => {
  for (const broker of helpers.ESSAI_VIP_BROKERS) {
    const { post, calls } = fixture({ env: { TELEGRAM_CHAT_ID: "-1001234567890" } });
    assert.equal((await post({ ...submission, broker, chat_id: "attacker", TELEGRAM_BOT_TOKEN: "attacker" })).status, 200);
    assert.equal(JSON.parse(calls.fetch[0].options.body).chat_id, "-1001234567890");
  }
});

test("field types, empty values, unknown brokers and oversized values never send or consume quota", async () => {
  const invalid = [null, [], "text", 123, {}, { ...submission, broker: "Other" }, { ...submission, broker: ["Axi"] }, { ...submission, website: {} }];
  for (const [field, maximum] of Object.entries(helpers.ESSAI_VIP_FIELD_LIMITS)) {
    for (const value of [undefined, null, 1, [], {}, "", "   ", "A".repeat(maximum + 1), "unsafe\nline", "unsafe\u202Etext"]) {
      invalid.push({ ...submission, [field]: value });
    }
  }
  for (const payload of invalid) {
    const { post, calls } = fixture();
    assert.equal((await post(payload)).status, 400);
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.rate.length, 0);
  }
});

test("a nonempty honeypot returns success without validation, storage, quota or Telegram", async () => {
  for (const website of ["https://example.invalid", " "]) {
    const { post, calls } = fixture({ env: { VERCEL_ENV: "preview", TELEGRAM_BOT_TOKEN: "" } });
    const response = await post({ website });
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.rate.length, 0);
  }
});

test("HTML is escaped and a password is preserved without trimming, normalizing or truncation", async () => {
  const { post, calls } = fixture();
  const motdepasse = "  <a&>E\u0301" + "&".repeat(240) + "  ";
  assert.equal((await post({ ...submission, nom: " <b>A&B</b> ", telegram: "@test&", serveur: "<S>", motdepasse })).status, 200);
  const message = JSON.parse(calls.fetch[0].options.body).text;
  assert.match(message, /&lt;b&gt;A&amp;B&lt;\/b&gt;/);
  assert.match(message, /@test&amp;/);
  assert.match(message, /&lt;S&gt;/);
  assert.ok(message.includes(`<code>${helpers.escapeEssaiVipHtml(motdepasse)}</code>`));
  assert.equal(message.includes("<b>A&B</b>"), false);
  const largest = Object.fromEntries(Object.entries(helpers.ESSAI_VIP_FIELD_LIMITS).map(([key, limit]) => [key, "&".repeat(limit)]));
  const validated = helpers.validateEssaiVipPayload({ ...submission, ...largest });
  assert.equal(validated.kind, "valid");
  assert.ok(helpers.buildEssaiVipMessage(validated.value).length < 4096);
});

test("JSON content type and a bounded, valid JSON object are required", async () => {
  const scenarios = [
    [{ headers: { "Content-Type": null } }, 415],
    [{ headers: { "Content-Type": "text/plain" } }, 415],
    [{ headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 415],
    [{ rawBody: "{" }, 400],
    [{ rawBody: "" }, 400],
    [{ headers: { "Content-Length": "invalid" } }, 400],
    [{ headers: { "Content-Length": "8193" } }, 413],
    [{ rawBody: JSON.stringify({ ...submission, extra: "é".repeat(5000) }) }, 413],
    [{ rawBody: new Uint8Array([123, 34, 120, 34, 58, 34, 0xff, 34, 125]) }, 400],
  ];
  for (const [options, status] of scenarios) {
    const { post, calls } = fixture();
    assert.equal((await post(submission, options)).status, status);
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.rate.length, 0);
  }
  assert.equal((await fixture().post(submission, { headers: { "Content-Type": "application/json; charset=utf-8" } })).status, 200);
});

test("the streaming byte cap rejects and cancels a chunked body without trusting Content-Length", async () => {
  let cancelled = false;
  let chunks = 0;
  const stream = new ReadableStream({
    pull(controller) { chunks += 1; controller.enqueue(new Uint8Array(4096).fill(32)); },
    cancel() { cancelled = true; },
  });
  const { post, calls } = fixture();
  assert.equal((await post(submission, { rawBody: stream, headers: { "Content-Length": "1" } })).status, 413);
  assert.equal(cancelled, true);
  assert.ok(chunks <= 4);
  assert.equal(calls.fetch.length + calls.rate.length, 0);
});

test("explicit foreign origins and cross-site requests are rejected while same-origin and curl work", async () => {
  for (const headers of [
    { Origin: "https://foreign.example" }, { Origin: "null" }, { Origin: "invalid" },
    { Origin: "https://investprotrading.fr/" }, { Origin: "https://investprotrading.fr.evil.example" },
    { "Sec-Fetch-Site": "cross-site" }, { Origin: "https://investprotrading.fr", "Sec-Fetch-Site": "cross-site" },
  ]) {
    const { post, calls } = fixture();
    assert.equal((await post(submission, { headers })).status, 403);
    assert.equal(calls.fetch.length + calls.rate.length, 0);
  }
  assert.equal((await fixture().post(submission, { headers: { Origin: "https://investprotrading.fr", "Sec-Fetch-Site": "same-origin" } })).status, 200);
  assert.equal((await fixture().post()).status, 200);
});

test("missing configuration and every non-production deployment refuse to transmit credentials", async () => {
  for (const env of [
    { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, { VERCEL_ENV: undefined },
    { TELEGRAM_BOT_TOKEN: undefined }, { TELEGRAM_BOT_TOKEN: "" }, { TELEGRAM_BOT_TOKEN: "invalid token" },
    { TELEGRAM_CHAT_ID: undefined }, { TELEGRAM_CHAT_ID: "" }, { TELEGRAM_CHAT_ID: "@client" }, { TELEGRAM_CHAT_ID: "0" },
  ]) {
    const { post, calls } = fixture({ env });
    assert.equal((await post()).status, 503);
    assert.equal(calls.fetch.length + calls.rate.length, 0);
  }
});

test("distributed rate-limit denials return Retry-After and storage errors fail closed", async () => {
  const denied = fixture({ rate: () => ({ allowed: false, retryAfterSeconds: 142.2 }) });
  const response = await denied.post();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "143");
  assert.equal(denied.calls.fetch.length, 0);
  const unavailable = fixture({ rate: () => { throw new Error("fixture storage error containing secret"); } });
  const failure = await unavailable.post();
  assert.equal(failure.status, 503);
  assert.equal(unavailable.calls.fetch.length, 0);
  assert.equal(failure.text.includes("secret"), false);
});

test("Telegram JSON failures, HTTP failures, invalid replies, network errors and timeouts are sanitized", async () => {
  for (const options of [
    { fetchResponse: () => Response.json({ ok: false, description: "fixture secret" }) },
    { fetchResponse: () => Response.json({ ok: true }, { status: 500 }) },
    { fetchResponse: () => Response.json({ result: {} }) },
    { fetchResponse: () => new Response("not JSON") },
    { fetchError: new Error("https://api.telegram.org/botfixture_secret/sendMessage password") },
    { aborted: true },
  ]) {
    const { post, calls } = fixture(options);
    const response = await post();
    assert.equal(response.status, 502);
    assert.equal(response.body.ok, false);
    assert.equal(response.text, '{"ok":false}');
    assert.equal(calls.fetch.length, 1);
    assert.deepEqual(calls.timeouts, [10000]);
  }
});
