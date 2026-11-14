import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// Onglet « Copie » de l'espace VIP (mode Bientôt) : un membre actif demande à être prévenu de l'ouverture de la copie
// du compte d'Enrick, ou retire sa demande. Rien d'autre n'est enregistré.
const project = path.resolve(import.meta.dirname, "..");
const userId = "88a2404f-5240-4f73-9dba-a1082b40c17e";

function compile(file, modules, environment = {}) {
  const cjs = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(project, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(output, {
    module: cjs, exports: cjs.exports, Request, Response, URL, JSON, Error, Promise, console, process: { env: environment },
    require(name) { assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name); return modules[name]; },
  });
  return cjs.exports;
}

function fixture({ access = "active", stored = false, failWrite = false, environment = "production" } = {}) {
  const calls = { upserts: [], deletes: [], reads: 0 };
  let row = stored ? { created_at: "2026-11-14T12:00:00Z" } : null;
  const db = {
    from(table) {
      assert.equal(table, "vip_copy_interest");
      const chain = {
        select() { return chain; },
        eq(column, value) { assert.equal(column, "user_id"); assert.equal(value, userId); return chain; },
        async maybeSingle() { calls.reads += 1; return { data: row, error: null }; },
        async upsert(value, options) { calls.upserts.push({ value, options }); if (failWrite) return { error: { message: "down" } }; row = { created_at: "now" }; return { error: null }; },
        delete() { return { eq: async (column, value) => { calls.deletes.push({ column, value }); if (failWrite) return { error: { message: "down" } }; row = null; return { error: null }; } }; },
      };
      return chain;
    },
  };
  class VipRequestError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const vipJson = (body, status = 200) => Response.json(body, { status });
  const route = compile("app/api/vip/copie/route.ts", {
    "@/lib/vip/membership-server": {
      VipRequestError, vipJson,
      async requireVipAccess() {
        if (access === "inactive") return { error: "Votre accès VIP n’est pas actif.", status: 403 };
        if (access === "anonymous") return { error: "Session invalide.", status: 401 };
        return { user: { id: userId }, db, admin: false, active: true, membership: { status: "active" } };
      },
      async readVipJson(request) {
        if (request.headers.get("origin") !== "https://investprotrading.fr") throw new VipRequestError("Origine de la requête refusée.", 403);
        return request.json();
      },
      vipErrorResponse: error => error instanceof VipRequestError ? vipJson({ error: error.message }, error.status) : vipJson({ error: "Service VIP temporairement indisponible." }, 503),
    },
    "@/lib/vip/posts-server": {
      assertVipMutationEnvironment() { if (environment === "preview") throw new VipRequestError("Les modifications du VIP sont désactivées sur les aperçus.", 403); },
    },
  });
  async function call(method, body, origin = "https://investprotrading.fr") {
    const response = await route[method](new Request("https://investprotrading.fr/api/vip/copie", {
      method, headers: { "Content-Type": "application/json", Origin: origin }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    return { status: response.status, body: await response.json() };
  }
  return { calls, get: () => call("GET"), put: (body, origin) => call("PUT", body, origin) };
}

test("an active member asks to be told when the copy opens, sees it is noted, and can withdraw it", async () => {
  const api = fixture();
  assert.deepEqual((await api.get()).body, { status: "soon", notify: false });
  const asked = await api.put({ notify: true });
  assert.equal(asked.status, 200);
  assert.deepEqual(asked.body, { status: "soon", notify: true });
  assert.deepEqual(JSON.parse(JSON.stringify(api.calls.upserts)), [{ value: { user_id: userId }, options: { onConflict: "user_id", ignoreDuplicates: true } }]);
  assert.deepEqual((await api.get()).body, { status: "soon", notify: true });
  const withdrawn = await api.put({ notify: false });
  assert.deepEqual(withdrawn.body, { status: "soon", notify: false });
  assert.deepEqual(api.calls.deletes, [{ column: "user_id", value: userId }]);
});

test("only an active member, from the site itself, with exactly one yes/no answer, is recorded", async () => {
  for (const access of ["inactive", "anonymous"]) {
    const api = fixture({ access });
    assert.ok([401, 403].includes((await api.get()).status), access);
    assert.ok([401, 403].includes((await api.put({ notify: true })).status), access);
    assert.equal(api.calls.upserts.length, 0);
  }
  const api = fixture();
  for (const body of [{}, { notify: "yes" }, { notify: true, account: "123" }, { notify: true, password: "x" }]) {
    assert.equal((await api.put(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await api.put({ notify: true }, "https://evil.example")).status, 403);
  assert.equal((await fixture({ environment: "preview" }).put({ notify: true })).status, 403);
  assert.equal(api.calls.upserts.length + api.calls.deletes.length, 0);
});

test("a failed save says so and records nothing as done", async () => {
  const api = fixture({ failWrite: true });
  const result = await api.put({ notify: true });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /n’a pas pu être enregistrée/);
});

test("the Copie tab tells members it is coming, from Enrick's MT4 Fusion account, in fixed lots with other settings on request", () => {
  const tab = fs.readFileSync(path.join(project, "components/vip/VipCopie.tsx"), "utf8");
  for (const text of ["Bientôt", "MT4 · Fusion Markets", "Me prévenir à l’ouverture", "en lots fixes", "Un autre réglage se demande à l’équipe.", "La copie reproduit aussi les pertes."]) {
    assert.ok(tab.includes(text), text);
  }
  assert.ok(!/password|motdepasse|login/i.test(tab.replace(/mot de passe principal/g, "")), "The soon tab collects no account details");
  const space = fs.readFileSync(path.join(project, "components/vip/VipEspace.tsx"), "utf8");
  assert.match(space, /\{ key: "copie", label: "Copie" \}/);
  assert.match(space, /section === "copie" \? <VipCopie banner=\{banner\} \/>/);
});
