import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const identity = value => value;
const fragment = Symbol("fragment");
const element = (type, props, key) => ({ type, props: props || {}, key });
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };

function compile(file, modules, extra = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module, exports: module.exports, URL, AbortController, Date, console, ...extra,
    fetch() { throw Error("No real network is allowed in portal mode tests"); },
    require(name) { assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name); return modules[name]; },
  });
  return module.exports;
}

/* A small offline hook host executes the actual TSX and async effects. It is not a
   browser/layout test; the real React DOM/full-height result is checked in CUA. */
function hookHost() {
  const instances = new Map(), mounts = new Map();
  let current, dirty = true, tree, rootType, rootProps, effects = [];
  const equalDeps = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  const slot = initializer => {
    assert.ok(current, "Hook outside a component");
    const instance = current, index = instance.cursor++;
    if (!Object.hasOwn(instance.hooks, index)) instance.hooks[index] = initializer();
    return [instance, index, instance.hooks[index]];
  };
  const hooks = {
    useState(initial) {
      const [instance, index, value] = slot(() => typeof initial === "function" ? initial() : initial);
      return [value, next => { instance.hooks[index] = typeof next === "function" ? next(instance.hooks[index]) : next; dirty = true; }];
    },
    useRef(value) { return slot(() => ({ current: value }))[2]; },
    useCallback(callback, deps) {
      const [instance, index, cached] = slot(() => ({ value: callback, deps }));
      if (!equalDeps(cached.deps, deps)) instance.hooks[index] = { value: callback, deps };
      return instance.hooks[index].value;
    },
    useEffect(callback, deps) {
      const [instance, index, previous] = slot(() => ({ deps: undefined, cleanup: undefined }));
      if (!equalDeps(previous.deps, deps)) {
        effects.push(() => {
          previous.cleanup?.();
          instance.hooks[index] = { deps, cleanup: callback() };
        });
      }
    },
  };
  function resolve(node, location, seen) {
    if (node === null || node === undefined || typeof node === "boolean") return null;
    if (Array.isArray(node)) return node.map((child, index) => resolve(child, location + "." + index, seen));
    if (typeof node !== "object") return node;
    if (node.type === fragment) return resolve(node.props.children, location + ".fragment", seen);
    if (typeof node.type === "function") {
      const key = location + ":" + node.type.name;
      let instance = instances.get(key);
      if (!instance || instance.type !== node.type) {
        instance = { type: node.type, hooks: [], cursor: 0, key };
        instances.set(key, instance); mounts.set(node.type.name, (mounts.get(node.type.name) || 0) + 1);
      }
      seen.add(key); instance.cursor = 0;
      const parent = current; current = instance;
      const result = node.type(node.props); current = parent;
      return resolve(result, key + ".result", seen);
    }
    return { type: node.type, props: { ...node.props, children: resolve(node.props.children, location + ".children", seen) } };
  }
  function render() {
    dirty = false; const seen = new Set();
    tree = resolve(element(rootType, rootProps), "root", seen);
    for (const [key, instance] of instances) if (!seen.has(key)) {
      for (const hook of instance.hooks) hook?.cleanup?.();
      instances.delete(key);
    }
    const pending = effects; effects = []; for (const effect of pending) effect();
  }
  return {
    hooks, mounts,
    start(type, props) { rootType = type; rootProps = props; render(); },
    async settle() {
      for (let iteration = 0; iteration < 20; iteration++) {
        await new Promise(resolve => setImmediate(resolve));
        if (!dirty) return;
        render();
      }
      assert.fail("Offline portal effects did not settle");
    },
    get tree() { return tree; },
    instance(name) { return [...instances.values()].find(item => item.type.name === name); },
  };
}

function nodes(tree, predicate) {
  const result = [];
  function walk(node) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== "object") return;
    if (predicate(node)) result.push(node);
    walk(node.props.children);
  }
  walk(tree); return result;
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  return typeof node === "object" ? text(node.props.children) : String(node);
}
function button(host, label) {
  const result = nodes(host.tree, node => node.type === "button" && text(node) === label);
  assert.equal(result.length, 1, "Expected one button: " + label); return result[0];
}
function access(admin = false, active = true) {
  return { admin, active, telegramUrl: null, user: { id: "offline-user", email: "member@example.invalid" }, membership: active ? { type: "affiliation", email: "member@example.invalid", started_at: "2026-10-01T10:00:00Z", expires_at: null, renewal_requested_at: null, status: "active" } : null };
}

function fixture(initialAdminMode = false) {
  const host = hookHost(), calls = [], listeners = new Map();
  let resolveAccess, rejectAccess, settled = false, latestAccess, accessError;
  const accessPromise = new Promise((resolve, reject) => { resolveAccess = resolve; rejectAccess = reject; });
  class VipApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const client = {
    VipApiError,
    safeHttps(value) { try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } },
    vipDate: value => value || "Sans échéance",
    async vipRequest(url, init = {}) {
      calls.push({ url, method: init.method || "GET" });
      assert.equal(init.method || "GET", "GET", "Tests must never invoke a write action");
      if (url === "/api/vip/access") {
        if (!settled) return accessPromise;
        if (accessError) throw accessError;
        return latestAccess;
      }
      if (url === "/api/vip/posts" || url === "/api/admin/vip/posts") return { posts: [] };
      if (url === "/api/vip/push") return { publicKey: null };
      assert.fail("Unexpected API path: " + url);
    },
  };
  const browser = {
    window: { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name), setInterval: () => 1, clearInterval() {}, setTimeout: () => 2, clearTimeout() {} },
    document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame(callback) { callback(); return 0; },
  };
  const icon = () => null;
  const common = {
    react: host.hooks, "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: fragment },
    "next/link": props => element("a", props), "next/image": props => element("img", props),
    "lucide-react": new Proxy({}, { get: () => icon }),
    "@/components/i18n/LocaleProvider": { useLocale: () => ({ t: identity, locale: "fr" }) },
    "@/lib/vip/client": client, "./VipPostCard": () => element("article", { "data-card-preview": true }),
  };
  const Editor = compile("components/vip/VipPublicationsEditor.tsx", {
    ...common, "./VipPublicationsEditor.module.css": css,
    "@/lib/supabase/client": { createClient() { throw Error("Storage must never be accessed by mode tests"); } },
  }, browser).default;
  const Portal = compile("components/vip/VipPortal.tsx", {
    ...common, "@/components/i18n/LanguageSwitcher": () => element("select", { "aria-label": "Language" }),
    "./VipPublicationsEditor": Editor, "./VipPortal.module.css": css, "./VipPortalShell.css": {},
  }, browser).default;
  host.start(Portal, { initialAdminMode });
  const settle = host.settle.bind(host);
  host.settle = async () => {
    await settle();
    assert.equal(calls.every(call => call.method === "GET"), true, "Mode changes and initial loading must never write");
  };
  return {
    host, calls,
    resolve(value) { settled = true; latestAccess = value; resolveAccess(value); },
    anonymous() { settled = true; accessError = new VipApiError("Connectez-vous", 401); rejectAccess(accessError); },
    async revoke() { latestAccess = access(false, true); listeners.get("focus")?.(); await host.settle(); },
  };
}

test("mode query only selects an initial view; repeated/unknown values do not grant roles", async () => {
  const Page = compile("app/dashboard/vip/page.tsx", {
    "react/jsx-runtime": { jsx: element }, "@/components/vip/VipPortal": function PortalMarker() {},
  }).default;
  for (const [mode, expected] of [["admin", true], ["member", false], [undefined, false], [["admin"], false]]) {
    const tree = await Page({ searchParams: Promise.resolve({ mode }) });
    assert.equal(tree.props.initialAdminMode, expected);
  }
});

test("mode=admin never mounts/fetches the editor while verified access is pending", async () => {
  const { host, calls } = fixture(true); await host.settle();
  assert.equal(host.instance("VipPublicationsEditor"), undefined);
  assert.equal(nodes(host.tree, node => node.type === "nav" && node.props["aria-label"] === "Vue de l’espace VIP").length, 0);
  assert.deepEqual(calls.map(call => call.url), ["/api/vip/access"]);
});

test("anonymous and non-admin affiliated accounts cannot activate the editor through mode=admin", async () => {
  for (const anonymous of [false, true]) {
    const state = fixture(true);
    if (anonymous) state.anonymous(); else state.resolve(access(false, true));
    await state.host.settle();
    assert.equal(state.host.instance("VipPublicationsEditor"), undefined);
    assert.equal(nodes(state.host.tree, node => node.type === "nav" && node.props["aria-label"] === "Vue de l’espace VIP").length, 0);
    assert.equal(state.calls.some(call => call.url.startsWith("/api/admin/")), false);
  }
});

test("verified admin affiliation enables inline editor only on activation and keeps its draft mounted", async () => {
  const state = fixture(false); state.resolve(access(true, true)); await state.host.settle();
  const instance = state.host.instance("VipPublicationsEditor"); assert.ok(instance);
  assert.equal(state.calls.some(call => call.url.startsWith("/api/admin/")), false);
  button(state.host, "Administrateur").props.onClick(); await state.host.settle();
  assert.equal(state.calls.filter(call => call.url === "/api/admin/vip/posts").length, 1);
  const category = nodes(state.host.tree, node => node.type === "select" && node.props.value === "analysis")[0];
  category.props.onChange({ target: { value: "signal" } }); await state.host.settle();
  let message = nodes(state.host.tree, node => node.type === "textarea")[0];
  assert.match(message.props.value, /Actif :[\s\S]*Direction :[\s\S]*Entrée :[\s\S]*Stop Loss :[\s\S]*TP1 :[\s\S]*TP2 :[\s\S]*TP3 :/);
  message.props.onChange({ target: { value: "Brouillon hors réseau — scénario personnel" } }); await state.host.settle();
  button(state.host, "Membre").props.onClick(); await state.host.settle();
  assert.equal(state.host.instance("VipPublicationsEditor"), instance);
  assert.equal(nodes(state.host.tree, node => node.props.className === "editorWorkspace")[0].props.hidden, true);
  button(state.host, "Administrateur").props.onClick(); await state.host.settle();
  assert.equal(state.host.instance("VipPublicationsEditor"), instance);
  assert.equal(state.host.mounts.get("VipPublicationsEditor"), 1);
  message = nodes(state.host.tree, node => node.type === "textarea")[0];
  assert.equal(message.props.value, "Brouillon hors réseau — scénario personnel");
  assert.equal(nodes(state.host.tree, node => node.props.className === "workspace")[0].props.hidden, true);
  assert.equal(nodes(state.host.tree, node => node.props.className === "editorWorkspace")[0].props.hidden, false);
});

test("a later role revocation removes editor and switch even if mode state is still admin", async () => {
  const state = fixture(true); state.resolve(access(true, true)); await state.host.settle();
  assert.ok(state.host.instance("VipPublicationsEditor"));
  await state.revoke();
  assert.equal(state.host.instance("VipPublicationsEditor"), undefined);
  assert.equal(nodes(state.host.tree, node => node.type === "nav" && node.props["aria-label"] === "Vue de l’espace VIP").length, 0);
  assert.equal(nodes(state.host.tree, node => node.props.className === "workspace")[0].props.hidden, false);
});

test("full-height workspace visibility does not rely on browser hidden defaults overridden by flex", () => {
  const cssText = fs.readFileSync(path.join(root, "components/vip/VipPortal.module.css"), "utf8");
  assert.match(cssText, /\.workspace\[hidden\],\s*\.editorWorkspace\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(cssText, /\.editorWorkspace\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;/);
});
