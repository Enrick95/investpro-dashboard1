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

test("un code saisi sans tirets, en minuscules ou avec des espaces devient ABCD-EFGH-JKMN", () => {
  assert.equal(normalizeAccessCode("abcd efgh jkmn"), "ABCD-EFGH-JKMN");
  assert.equal(normalizeAccessCode(" ABCDEFGHJKMN "), "ABCD-EFGH-JKMN");
});

test("les caractères ambigus et les longueurs incorrectes sont refusés", () => {
  assert.equal(normalizeAccessCode("ABCD-EFGH-JKM0"), null);
  assert.equal(normalizeAccessCode("ABCD-EFGH-JKMO"), null);
  assert.equal(normalizeAccessCode("ABCD-EFGH"), null);
  assert.equal(normalizeAccessCode("mon mot de passe long"), null);
});

test("l’alphabet du code ne contient aucun caractère ambigu", () => {
  for (const char of "01IOL") assert.equal(ACCESS_CODE_ALPHABET.includes(char), false);
  assert.equal(new Set(ACCESS_CODE_ALPHABET).size, 31);
});
