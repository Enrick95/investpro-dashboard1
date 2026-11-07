import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
const source = fs.readFileSync(path.resolve(import.meta.dirname, "../lib/vip/publication-notice.ts"), "utf8");
const compiled = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: compiled, exports: compiled.exports });
const { formatVipTelegramCopy: copy } = compiled.exports;
const post = (category, body = "", title = "") => ({ category, title, body });
const FOOTER = "Espace VIP : https://investprotrading.fr/dashboard/vip";

test("une analyse garde son texte complet et le lien ; le titre par défaut est retiré", () => {
  const text = copy(post("analysis", "EURUSD : cassure du range.\nZone d’achat 1.0850.", "Mon analyse graphique"));
  assert.equal(text, `📊 Nouvelle analyse\n\nEURUSD : cassure du range.\nZone d’achat 1.0850.\n\n${FOOTER}`);
});

test("un titre personnalisé s’affiche au-dessus du texte", () => {
  const text = copy(post("performance", "Semaine à +3,2 %.", "Bilan de novembre"));
  assert.equal(text, `📈 Nouveau bilan publié\nBilan de novembre\n\nSemaine à +3,2 %.\n\n${FOOTER}`);
});

test("un signal avec champs explicites est recopié tel quel, sans doublon", () => {
  const body = "Actif : XAUUSD\nDirection : SELL\nEntrée : 2670.50\nStop Loss : 2680";
  const text = copy({ ...post("signal", body, "Nouveau signal"), symbol: "XAUUSD", direction: "sell", levels: { entry: 2670.5, stopLoss: 2680 } });
  assert.equal(text.split("Entrée").length - 1, 1);
  assert.ok(text.startsWith("🚨 Nouveau signal · XAUUSD\n\n"));
  assert.ok(text.endsWith(FOOTER));
});

test("un signal en texte libre reçoit ses niveaux structurés une seule fois", () => {
  const text = copy({ ...post("signal", "Je surveille l’or ce soir.", "Nouveau signal"), symbol: "XAUUSD", direction: "sell", levels: { entry: 2670.5, stopLoss: 2680, takeProfit: 2650 } });
  assert.ok(text.includes("🔴 SELL · Entrée : 2670.5 · SL : 2680 · TP1 : 2650"));
  assert.ok(text.includes("Je surveille l’or ce soir."));
  assert.ok(text.endsWith(FOOTER));
});

test("un long texte est coupé, le lien reste, et la limite est respectée", () => {
  const text = copy(post("analysis", "a".repeat(5000), "Mon analyse graphique"), 1024);
  assert.ok(text.length <= 1024);
  assert.ok(text.endsWith(FOOTER));
});

test("une publication vide renvoie tout de même vers l’espace VIP", () => {
  assert.equal(copy(post("partnership", "", "")), `🤝 Nouveau partenariat\n\n${FOOTER}`);
});
