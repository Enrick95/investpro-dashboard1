import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// Tableau de bord InvestPro Copy (comptes pilotes) : compte source, comptes copieurs, panneau « Régler la copie ».
const project = path.resolve(import.meta.dirname, "..");
const pageFile = "app/dashboard/copieur/page.tsx";
const source = fs.readFileSync(path.join(project, pageFile), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function topLevel(names) {
  const parts = [];
  for (const statement of ast.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && names.includes(statement.name.text)) parts.push(statement.getText(ast));
    if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && names.includes(d.name.text))) parts.push(statement.getText(ast));
  }
  const cjs = { exports: {} };
  const output = ts.transpileModule(parts.join("\n") + `\nmodule.exports = { ${names.join(", ")} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, { module: cjs, exports: cjs.exports });
  return cjs.exports;
}

test("the page compiles", () => {
  const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
  assert.deepEqual((result.diagnostics || []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});

test("members read « compte source » and « compte copieur », in tutoiement, never the engine's jargon", () => {
  const visible = [];
  (function walk(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "translate" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) visible.push(node.arguments[0].text);
    ts.forEachChild(node, walk);
  })(ast);
  assert.ok(visible.length > 100);
  const jargon = visible.filter((text) => /receveur|\bmaster\b|\bvous\b|\bvotre\b|copier_receivers/i.test(text));
  assert.deepEqual(jargon, []);
  for (const text of ["Ajouter un compte source", "Ajouter un compte copieur", "Régler la copie", "Compte source copié", "Volume des trades", "Protections"]) {
    assert.ok(visible.includes(text), text);
  }
});

test("the header opens the existing source-account request and copier-account forms", () => {
  assert.match(source, /onClick=\{openSourceRequest\}[^>]*>[^]*?translate\("Ajouter un compte source"\)/);
  assert.match(source, /onClick=\{startAddReceiver\} className="cp-btn cp-btn-gold"><Plus size=\{16\} aria-hidden="true" \/>\{translate\("Ajouter un compte copieur"\)\}/);
  assert.match(source, /function openSourceRequest\(\) \{\s*setError\(false\);\s*setRequestOpen\(true\);/);
  assert.match(source, /function startAddReceiver\(\)[^]*?openAddReceiver\(\);/);
});

test("each copier account can be set, paused or resumed, and removed through the existing handlers", () => {
  assert.match(source, /onClick=\{\(\) => openSettings\(row\.receiver\.id\)\}/);
  assert.match(source, /row\.connection\.kind === "connected" \? <button type="button" onClick=\{\(\) => openPause\(row\.receiver\.id\)\}/);
  assert.match(source, /row\.connection\.kind === "disconnected" \? <button type="button" onClick=\{\(\) => resumeReceiver\(row\.receiver\)\}/);
  assert.match(source, /setRemoveReceiverId\(row\.receiver\.id\); setDisconnectConsent\(false\); setRemoveError\(""\);/);
  // La pause passe par la déconnexion confirmée existante ; la reprise repasse par le formulaire d'ajout (mot de passe ressaisi).
  assert.match(source, /async function confirmPause\(\) \{\s*await disconnect\(\);/);
  assert.match(source, /function resumeReceiver\(receiver: Receiver\)[^]*?openAddReceiver\(\);/);
  assert.match(source, /onClick=\{\(\) => void saveAll\(\)\}/);
  assert.match(source, /onClick=\{\(\) => void removeReceiver\(\)\}/);
  assert.match(source, /onClick=\{\(\) => void submitActivationRequest\(\)\}/);
  assert.match(source, /onClick=\{\(\) => void addReceiver\(\)\}/);
});

test("fixed lots are instant and capped by the pilot limit; every other mode is on request", () => {
  const { COPY_MODES } = topLevel(["COPY_MODES"]);
  assert.deepEqual(JSON.parse(JSON.stringify(COPY_MODES.map((mode) => mode.mode))), ["fixed", "mirror", "balance", "equity", "percent"]);
  assert.match(source, /translate\(instant \? "Immédiat" : "Sur demande"\)/);
  assert.match(source, /const instant = item\.mode === "fixed";/);
  assert.match(source, /lotsNumber <= maxLots \+ 1e-9/);
  assert.match(source, /const \[maxLots, setMaxLots\] = useState\(0\.1\);/);
});

test("the panel and the server agree on which protection changes need the team", () => {
  const { protectionsDiffer, DEFAULT_RISK_SETTINGS } = topLevel(["protectionsDiffer", "PROTECTION_KEYS", "DEFAULT_RISK_SETTINGS"]);
  const base = { ...DEFAULT_RISK_SETTINGS };
  assert.equal(protectionsDiffer(base, { ...base }), false);
  assert.equal(protectionsDiffer(base, { ...base, max_lots: 0.5 }), false, "the maximum volume is irrelevant in fixed lots");
  assert.equal(protectionsDiffer(base, { ...base, mode: "percent", max_lots: 0.5 }), true);
  assert.equal(protectionsDiffer(base, { ...base, copy_pending: false }), true);
  assert.equal(protectionsDiffer(base, { ...base, max_drawdown_percent: 9 }), false, "an unused loss threshold changes nothing");
  assert.equal(protectionsDiffer(base, { ...base, drawdown_enabled: true }), true);
  assert.equal(protectionsDiffer({ ...base, symbol_mapping: "US30 = DJ30" }, { ...base, symbol_mapping: " US30 = DJ30\n" }), false);
  const route = fs.readFileSync(path.join(project, "app/api/copier/settings/route.ts"), "utf8");
  const keys = (text) => text.match(/const PROTECTION_KEYS = (\[[^\]]+\])/)[1];
  assert.equal(keys(route), keys(source));
  assert.match(route, /const needsRequest = riskEngine\.mode !== "fixed" \|\| protectionsChanged\(savedEngine, riskEngine\);/);
});

test("passwords are typed by the member only, masked, and never displayed back", () => {
  const passwordInputs = source.match(/autoComplete="new-password"/g) || [];
  assert.equal(passwordInputs.length, 2);
  assert.ok(!/type=\{show|showPassword|Afficher le mot de passe/i.test(source));
  assert.match(source, /pas le mot de passe investisseur/);
});

test("the dashboard follows the light and dark themes instead of hard-coded white text", () => {
  assert.ok(!/text-white|border-white\/|bg-\[#0b0d0b\]/.test(source));
  assert.match(source, /\.dark \.cp-root\{--cp-green:/);
  assert.match(source, /\.cp-root :is\(button,a,input,select,textarea,summary\):focus-visible\{outline:2px solid var\(--gold\)/);
});
