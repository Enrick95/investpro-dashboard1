import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const id = "08fa3092-7c2a-4a7c-b3f3-4e9fef3851aa";
const userId = "83cfaf59-8e27-47e4-b64b-3d17fc501102";

function compile(file, modules = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module, exports: module.exports, URL, Request, Response,
    require: name => { assert(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; },
  });
  return module.exports;
}
const parser = compile("lib/vip/signal-risk.ts");
const membership = compile("lib/vip/membership.ts");
const postValidation = compile("lib/vip/post-validation.ts");
const plain = value => JSON.parse(JSON.stringify(value));
const post = (body = "", changes = {}) => ({ id, category: "signal", title: "Nouveau signal", body, symbol: null, direction: null, levels: {}, published: true, ...changes });
const parse = (body, changes) => plain(parser.parseVipSignalRisk(post(body, changes)));

test("the real signal template preserves its explicit range and never chooses an entry", () => {
  const result = parse("🎯 #SIGNAL\n🟡 Actif : SP500 - US500\n📈 Direction : BUY\n📍 Entrée : 7701 - 7671\n🛑 Stop Loss : 7622.89\n🎯 TP1 : 7776.28\n🎯 TP2 : 7850.35\n🎯 TP3 : OPEN\n⚠️ Respectez votre money management.");
  assert.deepEqual(result, { postId: id, title: "Nouveau signal", symbol: "SP500 - US500", direction: "buy", entryRange: { min: 7671, max: 7701 }, stopLoss: 7622.89, issues: [] });
  assert.equal(Object.hasOwn(result, "entry"), false);
  assert.equal(Object.hasOwn(result, "body"), false);
});

test("single BUY and SELL entries are parsed without deriving direction from the stop loss", () => {
  for (const [order, direction, sl] of [["BUY", "buy", 2664], ["SELL", "sell", 2680], ["ACHAT LIMIT", "buy", 2664], ["VENTE STOP LIMIT", "sell", 2680]]) {
    const result = parse(`Actif: GOLD\nDirection: ${order}\nEntrée: 2670\nStop Loss: ${sl}`);
    assert.equal(result.direction, direction);
    assert.equal(result.entry, 2670);
    assert.deepEqual(result.issues, []);
  }
  const missing = parse("Actif: GOLD\nEntrée: 2670\nStop Loss: 2664");
  assert.equal(missing.direction, null);
  assert(missing.issues.includes("direction_missing"));
});

test("complete prices support explicit decimal/grouping formats and reject ambiguous or partial text", () => {
  for (const [value, expected] of [["2670.50", 2670.5], ["2670,50", 2670.5], ["2,670.50", 2670.5], ["2.670,50", 2670.5], ["2 670,50", 2670.5], ["2\u202f670.50", 2670.5], ["1.10563", 1.10563], ["0.00001234", .00001234], ["1,234,567", 1234567]]) {
    assert.equal(parser.parseVipSignalPrice(value), expected, value);
  }
  for (const value of ["2,670", "26 70", "2,67.50", "2 670 50", "2670 USD", "2670 $", "2670 (+5)", "1e3", "-2670", "+2670", "0", "Infinity", "NaN", "2670/2672", "<b>2670</b>", "2670\u200b", "9007199254740992"]) assert.equal(parser.parseVipSignalPrice(value), null, value);
});

test("range separators, reversed ranges and grouped prices preserve both endpoints only", () => {
  for (const range of ["2670–2672", "2672 — 2670", "2670 à 2672", "2670 to 2672", "2,670.00 - 2,672.00"]) {
    const result = parse(`Asset: XAUUSD\nDirection: BUY\nEntry: ${range}\nSL: 2664`);
    assert.deepEqual(result.entryRange, { min: 2670, max: 2672 }, range);
    assert.equal(Object.hasOwn(result, "entry"), false);
  }
  for (const range of ["2670 - 2672 - 2675", "2670 / 2672", "entre 2670 et 2672", "2670 - OPEN", "2670 - 0"]) {
    const result = parse(`Entry: ${range}`);
    assert.equal(Object.hasOwn(result, "entryRange"), false);
    assert.equal(Object.hasOwn(result, "entry"), false);
    assert(result.issues.includes("entry_invalid"));
  }
});

test("explicit text takes precedence over stale structured prices and order metadata", () => {
  const result = parse("Actif : GOLD\nDirection : SELL\nEntrée : 2670\nStop Loss : 2680", { symbol: "EURUSD", direction: "buy", levels: { entry: 1.1, stopLoss: 1.09 } });
  assert.equal(result.symbol, "GOLD"); assert.equal(result.direction, "sell");
  assert.equal(result.entry, 2670); assert.equal(result.stopLoss, 2680);
  assert.deepEqual(result.issues, []);
});

test("an empty or placeholder template never revives structured metadata", () => {
  const result = parse("🟡 Actif :\n📈 Direction : [à renseigner]\n📍 Entrée : —\n🛑 Stop Loss :", { symbol: "OLD", direction: "buy", levels: { entry: 123, stopLoss: 100 } });
  assert.equal(result.symbol, null); assert.equal(result.direction, null);
  assert.equal(Object.hasOwn(result, "entry"), false); assert.equal(Object.hasOwn(result, "stopLoss"), false);
  assert.deepEqual(result.issues, ["symbol_missing", "direction_missing", "entry_missing", "stop_loss_missing"]);
});

test("conflicting repeated labels remain ambiguous even if a later line repeats one candidate", () => {
  const result = parse("Actif: GOLD\nAsset: EURUSD\nActif: GOLD\nDirection: BUY\nDirection: SELL\nEntry: 100\nEntry: 200\nEntry: 100\nSL: 90\nSL: 95", { symbol: "OLD", direction: "buy", levels: { entry: 120, stopLoss: 110 } });
  assert.equal(result.symbol, null); assert.equal(result.direction, null);
  assert.equal(Object.hasOwn(result, "entry"), false); assert.equal(Object.hasOwn(result, "stopLoss"), false);
  assert.deepEqual(result.issues, ["symbol_conflicting", "direction_conflicting", "entry_conflicting", "stop_loss_conflicting"]);
  assert.equal(parse("Entry: 2670\nEntrée: 2670").entry, 2670);
});

test("legacy structured values remain supported only for absent labels", () => {
  const result = parse("Préparation de séance.", { symbol: "EURUSD", direction: "sell", levels: { entry: 1.12, stopLoss: 1.13 } });
  assert.deepEqual(result, { postId: id, title: "Nouveau signal", symbol: "EURUSD", direction: "sell", entry: 1.12, stopLoss: 1.13, issues: [] });
  assert(parser.parseVipSignalRisk(post("", { levels: { entry: Infinity, stopLoss: -1 } })).issues.includes("entry_invalid"));
});

test("prose, titles, conditions, unsupported fields and target levels never imply entry or direction", () => {
  const result = parse("Attention : ne pas BUY avant 2670.\nTP1 : 2680\nTP2: 2690\nconstructor: 2670", { title: "BUY GOLD à 2670" });
  assert.equal(result.symbol, null); assert.equal(result.direction, null);
  assert.equal(Object.hasOwn(result, "entry"), false); assert.equal(Object.hasOwn(result, "stopLoss"), false);
  for (const direction of ["BUY/SELL", "BUY si le marché monte", "SELL puis BUY", "LONG ou SHORT"]) assert(parse(`Direction: ${direction}`).issues.includes("direction_invalid"));
});

test("simple formatting and accented label aliases do not alter numeric values", () => {
  const result = parse("🟡 **Actif** : **XAUUSD**\nSens : achat\nZone d’entrée : `2670-2672`\nStopLoss : __2664__");
  assert.equal(result.symbol, "XAUUSD");
  assert.deepEqual(result.entryRange, { min: 2670, max: 2672 });
  assert.equal(result.stopLoss, 2664);
  assert.deepEqual(result.issues, []);
});

test("inconsistent stop placement is identified without choosing another price or reversing direction", () => {
  for (const [direction, entry, sl, issue] of [["BUY", "2670", "2680", "stop_loss_wrong_side"], ["SELL", "2670", "2660", "stop_loss_wrong_side"], ["BUY", "2670", "2670", "entry_stop_loss_equal"], ["BUY", "2670-2672", "2671", "stop_loss_inside_entry_range"], ["SELL", "2670-2672", "2660", "stop_loss_wrong_side"]]) {
    const result = parse(`Actif: GOLD\nDirection: ${direction}\nEntrée: ${entry}\nSL: ${sl}`);
    assert(result.issues.includes(issue));
    assert.equal(result.direction, direction.toLowerCase());
    assert.equal(result.stopLoss, Number(sl));
  }
});

test("non-signal categories never produce risk prefill data", () => {
  for (const category of ["analysis", "performance", "followup", "partnership", "signal-other"]) assert.equal(parser.parseVipSignalRisk(post("Entrée: 2670", { category })), null);
});

function fixture({ authorized = true, admin = false, member = { type: "affiliation", status: "active", started_at: "2026-01-01T00:00:00Z", expires_at: null }, stored = post("Actif: GOLD\nDirection: BUY\nEntry: 2670\nSL: 2664"), dbError = false } = {}) {
  const calls = { guards: 0, reads: [] };
  const db = { from(table) {
    const query = { table, columns: "", filters: [] };
    const chain = { select(columns) { query.columns = columns; return chain; }, eq(column, value) { query.filters.push([column, value]); return chain; }, async maybeSingle() { calls.reads.push(query); return { data: stored, error: dbError ? new Error("fixture") : null }; } };
    return chain;
  } };
  class VipRequestError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const vipJson = (body, status = 200) => Response.json(body, { status });
  const route = compile("app/api/vip/posts/[id]/risk/route.ts", {
    "@/lib/vip/membership-server": { VipRequestError, vipJson, async requireVipAccess() { calls.guards++; if (!authorized) return { error: "Session requise", status: 401 }; if (!admin && !membership.isVipMembershipActive(member)) return { error: "Accès VIP inactif", status: 403 }; return { user: { id: userId }, db, membership: member, admin }; } },
    "@/lib/vip/post-validation": postValidation,
    "@/lib/vip/signal-risk": parser,
    "@/lib/vip/posts-server": { vipPostErrorResponse: (error, message) => vipJson({ error: error instanceof VipRequestError ? error.message : message }, error instanceof VipRequestError ? error.status : 503) },
  });
  return { calls, async get(postId = id, search = "") { const response = await route.GET(new Request(`https://investprotrading.fr/api/vip/posts/${postId}/risk${search}`), { params: Promise.resolve({ id: postId }) }); return { status: response.status, body: await response.json() }; } };
}

test("unauthenticated, non-VIP, suspended and expired callers cannot read a signal", async () => {
  for (const options of [{ authorized: false }, { member: null }, { member: { type: "affiliation", status: "suspended" } }, { member: { type: "abonnement", status: "active", started_at: "2020-01-01T00:00:00Z", expires_at: "2020-02-01T00:00:00Z" } }]) {
    const api = fixture(options), result = await api.get();
    assert.equal(result.status, options.authorized === false ? 401 : 403);
    assert.equal(api.calls.reads.length, 0);
    assert.equal(api.calls.guards, 1);
    assert.equal(Object.hasOwn(result.body, "entry"), false);
  }
});

test("invalid post identifiers fail before database lookup after the entitlement guard", async () => {
  for (const invalid of ["Gold", id + "-extra", "'or'1'='1", "-".repeat(36)]) {
    const api = fixture(); assert.equal((await api.get(invalid)).status, 400);
    assert.equal(api.calls.guards, 1); assert.equal(api.calls.reads.length, 0);
  }
});

test("the protected endpoint reads only the exact currently published signal and ignores URL price overrides", async () => {
  const api = fixture(), result = await api.get(id, "?entry=1&stopLoss=2&symbol=OTHER&user_id=other");
  assert.equal(result.status, 200);
  assert.equal(result.body.entry, 2670); assert.equal(result.body.stopLoss, 2664); assert.equal(result.body.symbol, "GOLD");
  assert.deepEqual(api.calls.reads[0].filters, [["id", id], ["category", "signal"], ["published", true]]);
  assert.equal(api.calls.reads[0].columns.includes("image"), false);
  assert.equal(Object.hasOwn(result.body, "body"), false);
});

test("withdrawn, deleted and non-signal posts remain unavailable even to administrators", async () => {
  for (const stored of [null, post("Entrée: 2670", { published: false }), post("Entrée: 2670", { category: "analysis" })]) {
    const api = fixture({ admin: true, member: null, stored });
    assert.equal((await api.get()).status, 404);
  }
});

test("authorized administrator access matches the existing VIP read guard without requiring a member subscription", async () => {
  const api = fixture({ admin: true, member: null });
  assert.equal((await api.get()).status, 200);
});

test("database failures return no private price payload and successful reads reflect latest post edits", async () => {
  const failed = await fixture({ dbError: true }).get();
  assert.equal(failed.status, 503); assert.equal(Object.hasOwn(failed.body, "entry"), false);
  const updated = await fixture({ stored: post("Asset: XAUUSD\nDirection: SELL\nEntry: 2680\nSL: 2688", { title: "Signal corrigé", levels: { entry: 2670, stopLoss: 2664 } }) }).get();
  assert.equal(updated.body.title, "Signal corrigé"); assert.equal(updated.body.entry, 2680); assert.equal(updated.body.direction, "sell");
});
