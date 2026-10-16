import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
const source = fs.readFileSync(path.resolve(import.meta.dirname, "../lib/vip/publication-notice.ts"), "utf8");
const compiled = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: compiled, exports: compiled.exports });
const { formatVipPublicationNotice: format, publicationPostId, vipSignalOrder } = compiled.exports;
const post = (category, body = "", title = "") => ({ category, title, body });

test("signal template preserves asset, order, zones and all three targets", () => {
  const result = format(post("signal", "🎯 #SIGNAL\n🟡 Actif : SP500 - US500\n📈 Direction : BUY\n📍 Entrée : 7701 - 7671\n🛑 Stop Loss : 7622.89\n🎯 TP1 : 7776.28\n🎯 TP2 : 7850.35\n🎯 TP3 : OPEN\n⚠️ Respectez votre money management.", "Nouveau signal"));
  assert.equal(result.title, "Nouveau signal · SP500 - US500");
  assert.equal(result.body, "🟢 BUY · Entrée : 7701 - 7671 · SL : 7622.89 · TP1 : 7776.28 · TP2 : 7850.35 · TP3 : OPEN");
});
test("SELL and pending orders remain exactly the specified order type", () => {
  for (const order of ["SELL", "BUY LIMIT", "SELL STOP", "BUY STOP LIMIT"]) {
    assert.equal(format(post("signal", `Asset: XAUUSD\nDirection: ${order}\nEntry: 2,670.50–2,672.00\nStop Loss: 2,664.00`)).body, `${order.startsWith("BUY") ? "🟢" : "🔴"} ${order} · Entrée : 2,670.50–2,672.00 · SL : 2,664.00`);
  }
});
test("empty template omits placeholders and does not revive stale metadata", () => {
  const result = format({ ...post("signal", "🟡 Actif :\nDirection :\nEntrée : [à renseigner]\nStop Loss : —\nTP1 :\nTP2 :\nTP3 :\n⚠️ Respectez votre money management.", "Nouveau signal"), symbol: "OLD", direction: "buy", levels: { entry: 123, stopLoss: 100, takeProfit: 140 } });
  assert.equal(result.title, "Nouveau signal");
  assert.equal(result.body, "Consultez le signal dans votre espace VIP.");
});
test("structured legacy posts remain supported and visible text takes priority", () => {
  const old = { ...post("signal"), symbol: "EURUSD", direction: "sell", levels: { entry: 1.12, stopLoss: 1.13, takeProfit: 1.1, takeProfit2: 1.09 } };
  assert.equal(format(old).body, "🔴 SELL · Entrée : 1.12 · SL : 1.13 · TP1 : 1.1 · TP2 : 1.09");
  const changed = format({ ...old, body: "Actif : GOLD\nDirection : BUY LIMIT\nEntrée : 2600–2602\nStop Loss : 2590" });
  assert.equal(changed.title, "Nouveau signal · GOLD");
  assert(changed.body.startsWith("🟢 BUY LIMIT · Entrée : 2600–2602 · SL : 2590"));
});
test("conflicting labels do not invent an order or resurrect metadata", () => {
  const result = format({ ...post("signal", "Direction: BUY\nDirection: SELL\nEntrée: 100\nEntrée: 200"), direction: "buy", levels: { entry: 300 } });
  assert.equal(result.body, "Consultez le signal dans votre espace VIP.");
});
test("freeform signals get a readable excerpt without inferring an order", () => {
  assert.equal(format(post("signal", "Attention : ne pas BUY avant la clôture.", "Nouveau signal")).body, "Attention : ne pas BUY avant la clôture.");
});
test("all other categories have short, specific titles and custom post context", () => {
  for (const [category, heading] of [["analysis", "Nouvelle analyse"], ["performance", "Nouveau bilan publié"], ["followup", "Mise à jour du suivi"], ["partnership", "Nouveau partenariat"]]) {
    const result = format(post(category, "**Les zones** et le contexte sont disponibles.", "XAUUSD · Session du jour"));
    assert.equal(result.title, heading);
    assert.equal(result.body, "XAUUSD · Session du jour — Les zones et le contexte sont disponibles.");
  }
});
test("image-only, default titles and unknown categories have useful fallbacks", () => {
  assert.equal(format(post("analysis", "", "Graphique de la session")).body, "Graphique de la session");
  assert.equal(format(post("analysis", "Le marché se stabilise.", "Mon analyse graphique")).body, "Le marché se stabilise.");
  assert.equal(format(post("unknown")).title, "Nouvelle publication VIP");
});
test("payload lengths fit the service worker and trading prices are never cut", () => {
  const result = format(post("analysis", "Une analyse détaillée. ".repeat(50), "Titre ".repeat(30)));
  assert(result.title.length <= 100); assert(result.body.length <= 240); assert(result.body.endsWith("…"));
  const signal = format(post("signal", `Actif : ${"X".repeat(200)}\nDirection: BUY\nEntrée : ${"1234567890".repeat(40)}\nStop Loss : 99.25\nTP1: 110.75`));
  assert(signal.title.length <= 100); assert(signal.body.length <= 240);
  assert.equal(signal.body, "🟢 BUY · SL : 99.25 · TP1 : 110.75");
  const unicode = format(post("analysis", "😀".repeat(300))).body;
  assert(!/\p{Surrogate}/u.test(unicode)); assert(unicode.length <= 240);
});
test("publication events are accepted only for their exact recipient", () => {
  const id = "12345678-1234-4000-8000-123456789abc", user = "12345678-1234-4000-8000-123456789def";
  assert.equal(publicationPostId(`vip:post:${id}:${user}`, user), id);
  assert.equal(publicationPostId(`vip:post:${id}:${user}`, id), null);
  assert.equal(publicationPostId(`vip:post:${id}:${user}:extra`, user), null);
  assert.equal(publicationPostId("vip:renewal:any", user), null);
});

test("order colour follows explicit direction including pending orders and French labels", () => {
  for (const label of ["buy", "BUY LIMIT", "BUY STOP", "BUY STOP LIMIT", "ACHAT"]) {
    assert.equal(vipSignalOrder(post("signal", `Direction : ${label}`)).side, "buy");
  }
  for (const label of ["sell", "SELL LIMIT", "SELL STOP", "SELL STOP LIMIT", "VENTE"]) {
    assert.equal(vipSignalOrder(post("signal", `Direction : ${label}`)).side, "sell");
  }
  assert.equal(vipSignalOrder({ ...post("signal", "Direction : SELL"), direction: "buy" }).side, "sell");
  assert.equal(vipSignalOrder({ ...post("signal"), direction: "buy" }).side, "buy");
});
test("no directional marker is inferred from ambiguity, empty template or commentary", () => {
  for (const body of ["Direction :", "Direction : BUY/SELL", "Direction : SELL si le marché baisse", "Direction : BUY\nDirection : SELL"]) {
    assert.equal(vipSignalOrder({ ...post("signal", body), direction: "buy" }).side, null);
    assert(!/[🟢🔴]/u.test(format({ ...post("signal", body), direction: "buy" }).body));
  }
  assert.equal(vipSignalOrder(post("signal", "Ne pas BUY avant confirmation.")).side, null);
  assert.equal(vipSignalOrder({ ...post("analysis", "Direction : SELL"), direction: "buy" }), null);
});
