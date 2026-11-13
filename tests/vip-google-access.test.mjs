import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { safeNextPath } from "../lib/auth-next-path.ts";

// 64 comptes InvestPro sur 178 ont été créés avec Google (13 novembre 2026) : ils n'ont ni mot de passe ni code d'accès.
// La validation d'une demande « nouveau membre » ne leur envoie pas de code, et les pages qui ne demandaient qu'un
// identifiant et un code les bloquaient. Ces tests vérifient le chemin Google et le « nouveau code » donné par l'admin.
const project = path.resolve(import.meta.dirname, "..");
const read = file => fs.readFileSync(path.join(project, file), "utf8");
const applicationId = "20079d23-ae74-407a-a448-961a22eb23cb";
const memberId = "88a2404f-5240-4f73-9dba-a1082b40c17e";
const CODE_SHAPE = /^[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}$/;

function compile(file, modules = {}, context = {}, jsx = false) {
  const cjs = { exports: {} };
  const output = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText;
  vm.runInNewContext(output, {
    module: cjs, exports: cjs.exports, URL, URLSearchParams, Request, Response, Date, Error, JSON, Promise, console, AbortSignal,
    ...context,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name);
      return modules[name];
    },
  });
  return cjs.exports;
}

const accessCode = compile("lib/vip/access-code.ts");

test("the « Ouvre ton accès VIP » page offers Google and comes back to itself with the application", async () => {
  const oauth = [];
  const values = [];
  let index = 0;
  const react = {
    useState(initial) {
      const slot = index++;
      // Premier état : « on vérifie ton accès ». Le formulaire s'affiche une fois la vérification terminée.
      if (!(slot in values)) values[slot] = slot === 0 ? false : initial;
      return [values[slot], value => { values[slot] = typeof value === "function" ? value(values[slot]) : value; }];
    },
    useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const page = compile("app/vip/nouveau-membre/compte/VipMemberClaimClient.tsx", {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next/dynamic": () => function VipPortal() { return null; },
    "@/lib/supabase/client": { createClient: () => ({ auth: {
      async signInWithOAuth(input) { oauth.push(input); return { data: {}, error: null }; },
      async signInWithPassword() { throw new Error("A password sign-in was not expected"); },
    } }) },
    "@/lib/vip/access-code": accessCode,
    "./claim.module.css": new Proxy({}, { get: (_target, name) => String(name) }),
  }, { window: { location: { origin: "https://investprotrading.fr" } } }, true);

  const walk = (node, predicate) => !node || typeof node !== "object" ? [] : Array.isArray(node)
    ? node.flatMap(child => walk(child, predicate))
    : [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
  const render = () => { index = 0; return page.default({ applicationId }); };
  const text = node => [].concat(node.props?.children ?? []).filter(child => typeof child === "string").join("");
  const [button] = walk(render(), node => node.type === "button" && text(node).includes("Continuer avec Google"));
  assert.ok(button, "The page shows « Continuer avec Google »");
  assert.equal(button.props.type, "button", "It never submits the code form");

  await button.props.onClick();
  assert.equal(oauth.length, 1);
  assert.equal(oauth[0].provider, "google");
  const redirect = new URL(oauth[0].options.redirectTo);
  assert.equal(redirect.origin + redirect.pathname, "https://investprotrading.fr/auth/callback");
  const next = redirect.searchParams.get("next");
  assert.equal(next, `/vip/nouveau-membre/compte?application=${applicationId}`);
  assert.equal(safeNextPath(next), next, "The callback returns to the access page, which then attaches the request");
  assert.equal(walk(render(), node => node.type === "button" && text(node).includes("Ouverture de Google")).length, 1, "The button shows Google is opening");
});

test("the « déjà membre » page lets an account without a password continue with Google, then reopens the form", () => {
  const page = read("public/vip-deja-membre-v2.html");
  const box = page.slice(page.indexOf('<div class="login-box" id="loginBox" hidden>'), page.indexOf('<div class="safe">'));
  const link = /<a class="btn btn-ghost g-btn" id="googleLogin" href="([^"]+)">/.exec(box);
  assert.ok(link, "The existing-account box offers Google next to the password");
  assert.match(box, /Continuer avec Google<\/a>/);
  const login = new URL(link[1], "https://investprotrading.fr");
  assert.equal(login.pathname, "/login");
  assert.equal(safeNextPath(login.searchParams.get("next")), "/vip/deja-membre?suite=1", "The login page sends the member back here");
  assert.ok(page.includes("if(d.state==='none'&&new URLSearchParams(location.search).get('suite')==='1'){show(1);return}"), "Back from Google, the form opens directly");
});

test("the validation e-mail tells an existing account to sign in as usual, Google included, and carries no code", async () => {
  const sent = [];
  const db = { auth: { admin: {
    async createUser() { return { data: { user: null }, error: { message: "A user with this email address has already been registered", code: "email_exists" } }; },
    async updateUserById() { throw new Error("An existing account's password must never change"); },
  } }, from() { throw new Error("No link to save for an existing account"); } };
  const module = compile("lib/vip/access-account.ts", { "node:crypto": crypto, "@/lib/vip/access-code": accessCode }, {
    process: { env: { RESEND_API_KEY: "test-key", INVESTPRO_EMAIL_FROM: "InvestPro <vip@example.test>" } },
    async fetch(url, init) { sent.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); },
  });
  const result = await module.issueMemberAccess(db, { id: applicationId, email: "member@example.test", first_name: "Charly" });
  assert.deepEqual({ ...result }, { emailSent: true, accountCreated: false });
  assert.equal(sent.length, 1);
  for (const part of [sent[0].body.html, sent[0].body.text]) {
    assert.ok(part.includes("« Continuer avec Google »"), "Google accounts know how to sign in");
    assert.ok(!part.includes("Code (majuscules"), "No code is sent to an existing account");
  }
});

function adminRoute({ allowed = true, logFails = false } = {}) {
  const calls = { updates: [], logs: [] };
  const adminClient = {
    auth: { admin: {
      async getUserById(id) { return { data: { user: { id, email: "member@example.test" } }, error: null }; },
      async updateUserById(id, attributes) { calls.updates.push({ id, attributes }); return { data: {}, error: null }; },
    } },
    from(table) {
      return { async insert(row) { calls.logs.push({ table, row }); return { error: logFails ? { message: "missing table" } : null }; } };
    },
  };
  const publicClient = { auth: { async getUser(token) { return token === "admin-token" ? { data: { user: { id: "admin-1" } }, error: null } : { data: { user: null }, error: { message: "bad" } }; } } };
  const accessAccount = compile("lib/vip/access-account.ts", { "node:crypto": crypto, "@/lib/vip/access-code": accessCode }, { process: { env: {} } });
  const route = compile("app/api/admin/member/[id]/actions/route.ts", {
    "@/lib/admin/permissions": { async canAdmin(userId, permission) { return allowed && userId === "admin-1" && permission === "users_write"; } },
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@supabase/supabase-js": { createClient: (_url, key) => key === "service-role" ? adminClient : publicClient },
    "@/lib/vip/access-account": accessAccount,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://db.example.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable", SUPABASE_SERVICE_ROLE_KEY: "service-role" } } });
  const post = async body => {
    const response = await route.POST(new Request(`https://investprotrading.fr/api/admin/member/${memberId}/actions`, {
      method: "POST", headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: memberId }) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  return { calls, post };
}

test("an admin creates a new access code: it becomes the password and is returned once, never logged", async () => {
  const admin = adminRoute();
  const response = await admin.post({ action: "new_access_code" });
  assert.equal(response.status, 200);
  assert.match(response.body.accessCode, CODE_SHAPE);
  assert.equal(response.body.email, "member@example.test");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(admin.calls.updates.map(update => ({ ...update, attributes: { ...update.attributes } })), [{ id: memberId, attributes: { password: response.body.accessCode } }]);
  assert.equal(admin.calls.logs.length, 1);
  assert.equal(admin.calls.logs[0].row.action, "access_code_reset");
  assert.ok(!JSON.stringify(admin.calls.logs).includes(response.body.accessCode), "The admin log never contains the code");

  const again = await admin.post({ action: "new_access_code" });
  assert.notEqual(again.body.accessCode, response.body.accessCode, "Every request draws a new code");
});

test("only an admin with users_write creates a code, and a failed log still hands over the active code", async () => {
  const refused = adminRoute({ allowed: false });
  const denied = await refused.post({ action: "new_access_code" });
  assert.equal(denied.status, 403);
  assert.equal(refused.calls.updates.length, 0);
  assert.equal(denied.body.accessCode, undefined);

  const unlogged = adminRoute({ logFails: true });
  const response = await unlogged.post({ action: "new_access_code" });
  assert.equal(response.status, 200);
  assert.match(response.body.accessCode, CODE_SHAPE);
  assert.match(response.body.message, /journal admin indisponible/);
});
