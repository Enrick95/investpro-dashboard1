import assert from "node:assert/strict";
import { test } from "node:test";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const secret = "a1".repeat(32);
const source = ts.transpileModule(fs.readFileSync("app/api/essai-vip/setup/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ env = {}, webhook = { url: "" }, updates = [], fail = false } = {}) {
  const calls = [];
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, Buffer, Response,
    process: { env: { VERCEL_ENV: "production", ESSAI_VIP_SETUP_SECRET: secret, ...env } },
    require(name) {
      if (name === "node:crypto") return { timingSafeEqual };
      assert.equal(name, "@/lib/telegram/server");
      return { async telegram(method, body = {}) {
        calls.push({ method, body });
        if (fail) throw new Error("fixture token/password/providerURL must never leak");
        if (method === "getMe") return { username: "InvestProTradingBOT", first_name: "not returned", id: 123 };
        if (method === "getWebhookInfo") return webhook;
        if (method === "getUpdates") return updates;
        throw new Error("Unexpected provider mutation");
      } };
    },
    console: { log() { assert.fail("No setup logs"); }, error() { assert.fail("No setup logs"); } },
  });
  return {
    calls,
    async get(authorization = `Bearer ${secret}`) {
      const request = new Request("https://investprotrading.fr/api/essai-vip/setup", {
        headers: authorization === null ? {} : { Authorization: authorization },
      });
      const response = await compiled.exports.GET(request);
      assert.equal(response.headers.get("cache-control"), "no-store");
      return { status: response.status, body: await response.json() };
    },
  };
}

test("setup is hidden without production configuration and rejects unauthorized calls before Telegram", async () => {
  for (const env of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: undefined }, { ESSAI_VIP_SETUP_SECRET: undefined }, { ESSAI_VIP_SETUP_SECRET: "a".repeat(31) }, { ESSAI_VIP_SETUP_SECRET: "z".repeat(64) }]) {
    const trial = fixture({ env });
    assert.equal((await trial.get()).status, 404);
    assert.equal(trial.calls.length, 0);
  }
  for (const authorization of [null, "", "Bearer bad", `Bearer ${"b1".repeat(32)}`, `Basic ${secret}`, `Bearer ${secret}extra`]) {
    const trial = fixture();
    assert.equal((await trial.get(authorization)).status, 403);
    assert.equal(trial.calls.length, 0);
  }
});

test("an active webhook is reported without reading updates or changing delivery", async () => {
  const trial = fixture({ webhook: { url: "https://private.example/webhook", pending_update_count: 5, last_error_message: "private" } });
  const result = await trial.get();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { botUsername: "InvestProTradingBOT", webhookActive: true, candidates: [], candidateCount: 0, blocker: "webhook_active" });
  assert.deepEqual(trial.calls.map(call => call.method).sort(), ["getMe", "getWebhookInfo"]);
  assert.equal(JSON.stringify(result.body).includes("private"), false);
});

test("only deduplicated private /start chats belonging to EquipeInvestPro are returned", async () => {
  const message = (id, username, text = "/start", type = "private") => ({ message: { text, chat: { id, username, type, first_name: "private name" }, from: { id: 999 }, secret: "private metadata" } });
  const trial = fixture({ updates: [
    message(123456789, "EquipeInvestPro"), message(123456789, "equipeinvestpro", "/start hello"),
    message(987654321, "EQUIPEINVESTPRO", "/start@InvestProTradingBOT payload"),
    message(1, "other", "/start"), message(2, "EquipeInvestPro", "/starter"), message(3, "EquipeInvestPro", "hello /start"),
    message(4, "EquipeInvestPro", "/start", "group"), message(-5, "EquipeInvestPro"), message("6", "EquipeInvestPro"),
    { edited_message: message(7, "EquipeInvestPro").message }, null, {},
  ] });
  const result = await trial.get();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    botUsername: "InvestProTradingBOT", webhookActive: false,
    candidates: [{ chatId: "123456789", username: "EquipeInvestPro" }, { chatId: "987654321", username: "EQUIPEINVESTPRO" }],
    candidateCount: 2,
  });
  assert.deepEqual(trial.calls.map(call => call.method).sort(), ["getMe", "getUpdates", "getWebhookInfo"]);
  assert.deepEqual(JSON.parse(JSON.stringify(trial.calls.find(call => call.method === "getUpdates").body)), { limit: 100, timeout: 0 });
  const serialized = JSON.stringify(result.body);
  for (const forbidden of ["private name", "private metadata", "payload", "other", "update_id", "secret", "text", "first_name"]) assert.equal(serialized.includes(forbidden), false);
});

test("provider failures return only a generic failure and no sensitive information", async () => {
  for (const options of [{ fail: true }, { webhook: {} }, { updates: {} }]) {
    const trial = fixture(options);
    const result = await trial.get();
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { ok: false });
    assert.equal(trial.calls.some(call => ["sendMessage", "setWebhook", "deleteWebhook"].includes(call.method)), false);
  }
});
