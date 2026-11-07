import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
const source = fs.readFileSync(path.resolve(import.meta.dirname, "../lib/vip/access-code.ts"), "utf8");
const compiled = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: compiled, exports: compiled.exports });
const { normalizeAccessCode, ACCESS_CODE_ALPHABET } = compiled.exports;

test("un code saisi sans tirets ou avec des espaces retrouve la forme Ab3d-Ef7g-Hk9m", () => {
  assert.equal(normalizeAccessCode("Ab3dEf7gHk9m"), "Ab3d-Ef7g-Hk9m");
  assert.equal(normalizeAccessCode(" Ab3d Ef7g Hk9m "), "Ab3d-Ef7g-Hk9m");
  assert.equal(normalizeAccessCode("Ab3d-Ef7g-Hk9m"), "Ab3d-Ef7g-Hk9m");
});

test("la casse est conservée : une autre casse n'est pas le même code", () => {
  assert.equal(normalizeAccessCode("ab3d-ef7g-hk9m"), "ab3d-ef7g-hk9m");
  assert.notEqual(normalizeAccessCode("ab3d-ef7g-hk9m"), normalizeAccessCode("Ab3d-Ef7g-Hk9m"));
});

test("les caractères ambigus et les longueurs incorrectes sont refusés", () => {
  assert.equal(normalizeAccessCode("Ab3d-Ef7g-Hk90"), null);
  assert.equal(normalizeAccessCode("Ab3d-Ef7g-HkIO"), null);
  assert.equal(normalizeAccessCode("Ab3d-Ef7g-Hkil"), null);
  assert.equal(normalizeAccessCode("Ab3d-Ef7g"), null);
  assert.equal(normalizeAccessCode("mon mot de passe long"), null);
});

test("l’alphabet du code ne contient aucun caractère ambigu et compte 55 signes", () => {
  for (const char of "01IOilo") assert.equal(ACCESS_CODE_ALPHABET.includes(char), false);
  assert.equal(new Set(ACCESS_CODE_ALPHABET).size, 55);
});
