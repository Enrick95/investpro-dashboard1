import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// 22 novembre 2026 : un membre a demandé un lien « mot de passe oublié », l'a ouvert depuis l'appli Gmail (donc dans
// un autre navigateur) et la page affichait « Auth session missing! ». Le lien doit marcher sur n'importe quel appareil.
const project = path.resolve(import.meta.dirname, "..");
const read = file => fs.readFileSync(path.join(project, file), "utf8");

function compile(file, modules = {}, env = {}) {
  const cjs = { exports: {} };
  const output = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = name => { if (name in modules) return modules[name]; throw new Error(`module inattendu : ${name}`); };
  vm.runInNewContext(output, { module: cjs, exports: cjs.exports, require, process: { env }, URLSearchParams });
  return cjs.exports;
}

const created = [];
const recovery = compile("lib/supabase/recovery.ts", {
  "@supabase/supabase-js": { createClient: (url, key, options) => { created.push({ url, key, options }); return { auth: {} }; } },
}, { NEXT_PUBLIC_SUPABASE_URL: "https://db.example.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable" });

test("the forgot-password request uses the implicit flow, so the emailed link carries its own session", () => {
  recovery.createRecoveryRequestClient();
  const { options } = created.at(-1);
  assert.equal(options.auth.flowType, "implicit");
  assert.equal(options.auth.persistSession, false, "la demande ne touche pas à la session du site");
  assert.equal(options.auth.detectSessionInUrl, false);
  const login = read("app/login/page.tsx");
  assert.match(login, /createRecoveryRequestClient\(\)\.auth\.resetPasswordForEmail\(email\.trim\(\), \{\n\s+redirectTo: `\$\{window\.location\.origin\}\/reset-password`/);
  assert.ok(!/supabase\.auth\.resetPasswordForEmail/.test(login), "plus de demande PKCE liée au navigateur");
});

test("the reset page reads tokens, an old PKCE code or an error from the link", () => {
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(recovery.readRecoveryLink("", "#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery")), { kind: "tokens", accessToken: "a.b.c", refreshToken: "r1" });
  assert.deepEqual(plain(recovery.readRecoveryLink("?code=abc-123", "")), { kind: "code", code: "abc-123" });
  assert.deepEqual(plain(recovery.readRecoveryLink("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")), { kind: "error" });
  assert.deepEqual(plain(recovery.readRecoveryLink("?error=access_denied&error_code=otp_expired", "")), { kind: "error" });
  assert.deepEqual(plain(recovery.readRecoveryLink("", "")), { kind: "none" });
  assert.deepEqual(plain(recovery.readRecoveryLink("", "#access_token=only")), { kind: "none" }, "il faut les deux jetons");
});

test("the reset page opens the session from the link, removes the tokens from the address and explains what to do", () => {
  const page = read("app/reset-password/page.tsx");
  assert.match(page, /supabase\.auth\.setSession\(\{ access_token: link\.accessToken, refresh_token: link\.refreshToken \}\)/);
  assert.match(page, /window\.history\.replaceState\(null, "", window\.location\.pathname\)/);
  assert.match(page, /exchangeCodeForSession\(link\.code\)/);
  assert.match(page, /disabled=\{busy \|\| linkState !== "ready"\}/);
  assert.match(page, /href="\/login\?oubli=1"/);
  assert.ok(page.includes("il marchera sur n’importe quel appareil"));
  // « Auth session missing! » n'est plus montré tel quel.
  assert.match(page, /if \(\/session\/i\.test\(errorMessage\)\) \{\n\s+setLinkState\("expired"\);/);
  // La page de connexion s'ouvre sur « Mot de passe oublié » avec ?oubli=1.
  assert.match(read("app/login/page.tsx"), /get\("oubli"\) === "1"\) setForgotMode\(true\)/);
  const dictionary = read("lib/i18n/auth-vip.ts");
  for (const text of ["Vérification du lien…", "Demander un nouveau lien", "Ouvre le lien reçu par e-mail pour choisir ton nouveau mot de passe."]) {
    assert.ok(dictionary.includes(`"${text}":`), `traduction anglaise pour « ${text} »`);
  }
});
