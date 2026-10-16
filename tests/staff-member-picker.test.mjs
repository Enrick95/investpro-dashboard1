import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const css = new Proxy({}, { get: (_target, key) => String(key) });
const alice = { user_id: "11111111-1111-4111-8111-111111111111", name: "Kenn97", email: "kenn97@example.test", is_owner: false };
const bob = { user_id: "22222222-2222-4222-8222-222222222222", name: "Bob", email: "bob@example.test", is_owner: false };
const owner = { user_id: "33333333-3333-4333-8333-333333333333", name: "Owner", email: "owner@example.test", is_owner: true };

function compile(file, modules, globals = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, require: name => { assert(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; }, URL, AbortController, console, ...globals });
  return module.exports;
}
const pickerModule = compile("components/admin/StaffMemberPicker.tsx", { react: require("react"), "react/jsx-runtime": require("react/jsx-runtime"), "lucide-react": require("lucide-react"), "./StaffTeam.module.css": { __esModule: true, default: css } });
const pickerProps = { english: false, query: "", matches: [], member: null, searching: false, searched: false, error: "", disabled: false, onQuery() {}, onSearch() {}, onChoose() {}, onClear() {} };
const markup = props => renderToStaticMarkup(React.createElement(pickerModule.default, { ...pickerProps, ...props }));

test("picker presents a labelled account search in French and English without asking for a UUID", () => {
  const fr = markup({}), en = markup({ english: true });
  assert.match(fr, /Rechercher un membre/); assert.match(fr, /pseudo, son nom ou son e-mail/); assert.match(fr, /<label[^>]+for=/); assert.match(fr, /aria-describedby=/);
  assert.match(en, /Find a member/); assert.match(en, /username, name or email/); assert(!fr.includes(alice.user_id));
  assert.match(fr, /<button[^>]*type="submit"[^>]*disabled=/);
});
test("matching and selected accounts display their identity, while owners cannot be selected", () => {
  const results = markup({ query: "Kenn", matches: [alice, owner], searched: true });
  assert.match(results, /Kenn97/); assert.match(results, /kenn97@example.test/); assert.match(results, /Propriétaire/);
  assert.equal((results.match(/class="result"/g) || []).length, 2);
  assert.match(results, /<button[^>]*class="result"[^>]*disabled=""/);
  const selected = markup({ member: alice }); assert.match(selected, /Compte sélectionné/); assert.match(selected, /Kenn97/); assert.match(selected, /Changer/); assert(!selected.includes("<input"));
});
test("empty, loading and server errors have distinct accessible states", () => {
  assert.match(markup({ searching: true }), /role="status"[^>]*>Recherche du compte/);
  const empty = markup({ searched: true }); assert.match(empty, /Aucun compte trouvé/); assert.match(empty, /créer son compte InvestPro/);
  const failed = markup({ searched: true, error: "Service indisponible" }); assert.match(failed, /role="alert"[^>]*>Service indisponible/); assert(!failed.includes("Aucun compte trouvé"));
});
test("search payload normalization rejects invalid IDs and exposes at most ten whitelisted matches", () => {
  assert.equal(pickerModule.staffMatches(null).length, 0);
  assert.equal(pickerModule.staffMatches([{ ...alice, user_id: "Kenn97" }, { ...alice, name: undefined }, { ...alice, is_owner: "false" }, null]).length, 0);
  const result = pickerModule.staffMatches(Array.from({ length: 20 }, (_, i) => ({ ...alice, user_id: `${String(i + 1).padStart(8, "0")}-1111-4111-8111-111111111111` })));
  assert.equal(result.length, 10);
});

// A small hook/JSX harness exercises the page's public event handlers. Fetch and
// auth are fixtures; it cannot contact Supabase or grant any real permissions.
function pageHarness({ items = [], lookup = async () => [alice, bob, owner] } = {}) {
  const states = [], refs = [], effects = [], calls = [];
  let stateCursor = 0, refCursor = 0, mounted = false, tree;
  const hooks = {
    useState(initial) { const index = stateCursor++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial; return [states[index], next => { states[index] = typeof next === "function" ? next(states[index]) : next; }]; },
    useRef(initial) { const index = refCursor++; if (!(index in refs)) refs[index] = { current: initial }; return refs[index]; },
    useMemo(factory) { return factory(); }, useCallback(callback) { return callback; },
    useEffect(callback) { if (!mounted) effects.push(callback); },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  async function fetchFixture(url, init = {}) {
    calls.push({ url, init });
    if (init.method === "POST") return { ok: true, async json() { return { ok: true }; } };
    if (url.includes("?search=")) {
      const matches = await lookup(new URL(url, "https://example.test").searchParams.get("search"));
      return { ok: true, async json() { return { matches }; } };
    }
    return { ok: true, async json() { return { items }; } };
  }
  const Page = compile("app/dashboard/admin/staff/page.tsx", {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/i18n/LocaleProvider": { useLocale: () => ({ locale: "fr" }) },
    "@/components/admin/StaffMemberPicker": pickerModule,
    "@/lib/supabase/client": { createClient: () => ({ auth: { async getSession() { return { data: { session: { access_token: "fixture-token" } } }; } } }) },
    "@/components/admin/StaffTeam.module.css": { __esModule: true, default: css },
  }, { fetch: fetchFixture }).default;
  function render() { stateCursor = 0; refCursor = 0; tree = Page(); mounted = true; return tree; }
  function flatten(node, result = []) { if (!node || typeof node !== "object") return result; result.push(node); const children = node.props?.children; for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) flatten(child, result); return result; }
  const nodes = () => flatten(tree);
  const picker = () => nodes().find(node => node.type === pickerModule.default).props;
  const saveButton = () => nodes().find(node => node.type === "button" && typeof node.props.children === "string" && node.props.children.includes("Enregistrer les permissions"));
  const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); render(); };
  render();
  return { render, picker, saveButton, nodes, calls, flush, async start() { effects.forEach(effect => effect()); await flush(); } };
}

test("typing a pseudo cannot save or send permissions until a result account is selected", async () => {
  const h = pageHarness(); await h.start();
  h.picker().onQuery("Kenn97"); h.render();
  assert.equal(h.saveButton().props.disabled, true);
  h.saveButton().props.onClick(); await h.flush();
  assert.equal(h.calls.filter(call => call.init.method === "POST").length, 0);
  h.picker().onSearch(); await h.flush();
  assert.equal(h.picker().matches.length, 3); assert.equal(h.saveButton().props.disabled, true);
});
test("only the selected account UUID is posted, and selecting another account resets permission choices", async () => {
  const h = pageHarness({ items: [{ user_id: alice.user_id, permissions: ["users"], enabled: true, updated_at: "2026-10-16" }] }); await h.start();
  h.picker().onChoose(alice); h.render();
  assert.equal(h.saveButton().props.disabled, false);
  h.saveButton().props.onClick(); await h.flush();
  const post = h.calls.find(call => call.init.method === "POST");
  assert.deepEqual(JSON.parse(post.init.body), { user_id: alice.user_id, permissions: ["users"], enabled: true }); assert(!post.init.body.includes("Kenn97"));
  h.picker().onClear(); h.render(); assert.equal(h.picker().member, null); assert.equal(h.picker().query, "");
  h.picker().onChoose(bob); h.render();
  assert.equal(h.saveButton().props.disabled, true); // New account inherits no rights from Alice.
  const permissionInputs = h.nodes().filter(node => node.type === "input" && node.props.type === "checkbox");
  assert.equal(permissionInputs.filter(node => node.props.checked).length, 1); // Only "Access enabled".
});
test("an old staff entry loads its saved permissions and a protected owner remains unselectable", async () => {
  const h = pageHarness({ items: [{ user_id: alice.user_id, permissions: ["finance", "analytics"], enabled: false, updated_at: "2026-10-16" }] }); await h.start();
  const entry = h.nodes().find(node => node.type === "button" && node.props.className === "staffEntry"); entry.props.onClick(); h.render();
  assert.equal(h.picker().member.user_id, alice.user_id);
  assert.equal(h.nodes().filter(node => node.type === "input" && node.props.type === "checkbox" && node.props.checked).length, 2);
  h.picker().onClear(); h.render(); h.picker().onChoose(owner); h.render();
  assert.equal(h.picker().member, null); assert.equal(h.saveButton().props.disabled, true);
});
test("editing the query aborts an older async search and stale results never replace the new search", async () => {
  let resolveOld;
  const old = new Promise(resolve => { resolveOld = resolve; });
  const h = pageHarness({ lookup: query => query === "old" ? old : Promise.resolve([bob]) }); await h.start();
  h.picker().onQuery("old"); h.render(); h.picker().onSearch(); await h.flush();
  const firstSearch = h.calls.find(call => call.url.includes("?search="));
  assert.equal(h.picker().searching, true);
  h.picker().onQuery("Bob + test@example.test"); h.render(); assert.equal(firstSearch.init.signal.aborted, true);
  h.picker().onSearch(); await h.flush();
  const newest = h.calls.filter(call => call.url.includes("?search=")).at(-1); assert(newest.url.endsWith("Bob%20%2B%20test%40example.test"));
  assert.equal(h.picker().matches[0].user_id, bob.user_id);
  resolveOld([alice]); await h.flush();
  assert.equal(h.picker().matches[0].user_id, bob.user_id);
});
