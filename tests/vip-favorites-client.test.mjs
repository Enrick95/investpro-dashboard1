import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const one = { id: "00000000-0000-4000-8000-000000000001", category: "analysis", title: "Analyse sauvegardée", body: "Contexte du marché", symbol: null, direction: null, levels: {}, image_url: null, created_at: "2026-10-18T10:00:00Z", favorite: false, reactions: { counts: { like: 0, fire: 0, heart: 0 }, mine: null } };
const two = { ...one, id: "00000000-0000-4000-8000-000000000002", title: "Autre analyse" };
class VipApiError extends Error { constructor(message, status) { super(message); this.status = status; } }

// Actual TSX handlers/effects run offline with deterministic hook state. This
// verifies data/interaction behavior; it does not claim native layout/device QA.
function harness(component, initialProps = {}) {
  const source = fs.readFileSync(new URL(`../components/vip/${component}.tsx`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  let slots = [], index = 0, effects = [], dirty = true, tree, mounted = true, props = initialProps, memberKey;
  const calls = [], changes = [], queued = [];
  const state = { fail: null, hold: false, reply: null, pages: [{ posts: [{ ...one, favorite: true }], nextCursor: null }] };
  const hooks = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; dirty = true; }]; },
    useRef(initial) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(callback, deps) { const i = index++; if (!slots[i] || deps.some((value, n) => !Object.is(value, slots[i].deps[n]))) slots[i] = { callback, deps }; return slots[i].callback; },
    useEffect(callback, deps) { const i = index++; if (!slots[i] || !deps || deps.some((value, n) => !Object.is(value, slots[i].deps[n]))) { const previous = slots[i]; slots[i] = { deps, cleanup: previous?.cleanup }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = callback(); }); } },
    useId() { const i = index++; if (!(i in slots)) slots[i] = { value: `favorite-id-${i}` }; return slots[i].value; },
  };
  function jsx(type, value, key) { return { type, props: value || {}, key }; }
  function vipRequest(path, init = {}) {
    calls.push({ path, ...init });
    const method = init.method || "GET";
    const value = state.reply ?? (method === "PUT" ? { postId: props.post.id, favorite: JSON.parse(init.body).favorite } : state.pages[path.includes("cursor=") ? 1 : 0]);
    const error = state.fail;
    if (state.hold) return new Promise((resolve, reject) => queued.push(() => error ? reject(error) : resolve(structuredClone(value))));
    return error ? Promise.reject(error) : Promise.resolve(structuredClone(value));
  }
  const context = { exports: {}, Error, Date, Intl, URL, Map, Set, AbortController, DOMException, console,
    window: { setTimeout() { return 1; }, clearTimeout() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (["next/link", "next/image"].includes(name)) return { __esModule: true, default: name };
      if (name === "lucide-react") return new Proxy({}, { get: (_object, key) => `icon-${String(key)}` });
      if (name === "@/components/i18n/LocaleProvider") return { useLocale: () => ({ t: value => value, locale: "fr" }) };
      if (name === "@/lib/vip/client") return { vipRequest, VipApiError, safeHttps: value => value?.startsWith("https://") ? value : null, vipDate: value => value };
      if (name === "@/lib/vip/publication-notice") return { vipSignalOrder: () => null };
      if (name === "@/lib/vip/signal-risk-preset") return { riskSignalHref: postId => "/dashboard/risk?signal=" + postId };
      if (name === "./VipPostCard") return { __esModule: true, default: "VipPostCard" };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_object, key) => key }) };
      throw Error(`Unmocked dependency ${name}`);
    },
  };
  vm.runInNewContext(compiled, context, { filename: component + ".cjs" });
  function render() {
    index = 0; dirty = false;
    tree = context.exports.default({ onFavoriteChange: (postId, favorite) => changes.push({ postId, favorite }), ...props });
    if (typeof tree.type === "function") {
      // The account-keyed wrapper follows React's replacement semantics, including
      // running old effect cleanup before rendering the next member's empty state.
      if (memberKey !== tree.key) { slots.forEach(slot => slot?.cleanup?.()); slots = []; effects = []; memberKey = tree.key; }
      index = 0; tree = tree.type(tree.props);
    }
  }
  async function flush() { for (let pass = 0; pass < 20; pass++) { if (dirty && mounted) render(); effects.splice(0).forEach(effect => effect()); await Promise.resolve(); } }
  function nodes(value = tree) { if (value === null || value === undefined || typeof value === "boolean") return []; if (Array.isArray(value)) return value.flatMap(nodes); if (typeof value !== "object") return []; return [value, ...nodes(value.props?.children ?? null)]; }
  function text(value = tree) { if (value === null || value === undefined || typeof value === "boolean") return ""; if (Array.isArray(value)) return value.map(text).join(" "); if (typeof value !== "object") return String(value); return text(value.props?.children ?? null); }
  return { state, calls, changes, flush, nodes, text,
    get bookmark() { return nodes().find(node => node.type === "button" && /(?:Ajouter aux|Retirer des) favoris/.test(node.props["aria-label"] || "")); },
    get cards() { return nodes().filter(node => node.type === "VipPostCard"); },
    button(label) { return nodes().find(node => node.type === "button" && text(node).trim() === label); },
    async click(label) { const button = label ? this.button(label) : this.bookmark; assert.ok(button, `Button ${label || "bookmark"} exists`); assert.ok(!button.props.disabled, `Button ${label || "bookmark"} enabled`); button.props.onClick(); await flush(); },
    async resolve() { queued.splice(0).forEach(callback => callback()); await flush(); },
    async rerender(nextProps) { props = { ...props, ...nextProps }; dirty = true; await flush(); },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test("a bookmark waits for server confirmation and blocks duplicate clicks while pending", async t => {
  const h = harness("VipPostCard", { post: one }); t.after(() => h.unmount()); await h.flush();
  h.state.hold = true; const original = h.bookmark; original.props.onClick(); original.props.onClick(); await h.flush();
  assert.equal(h.calls.length, 1); assert.equal(h.bookmark.props["aria-pressed"], false); assert.equal(h.bookmark.props.disabled, true); assert.equal(h.changes.length, 0);
  assert.equal(h.calls[0].path, `/api/vip/posts/${one.id}/favorite`); assert.equal(h.calls[0].method, "PUT"); assert.deepEqual(JSON.parse(h.calls[0].body), { favorite: true });
  await h.resolve(); assert.equal(h.bookmark.props["aria-pressed"], true); assert.equal(h.bookmark.props.disabled, false); assert.deepEqual(h.changes, [{ postId: one.id, favorite: true }]);
});

test("failed favorite save keeps the real state, shows an error and retries the same target", async t => {
  const h = harness("VipPostCard", { post: one }); t.after(() => h.unmount()); await h.flush();
  h.state.fail = new Error("Connexion indisponible"); await h.click(); assert.equal(h.bookmark.props["aria-pressed"], false); assert.equal(h.changes.length, 0); assert.match(h.text(), /Connexion indisponible/);
  h.state.fail = null; await h.click(); assert.equal(h.bookmark.props["aria-pressed"], true); assert.deepEqual(h.calls.map(call => JSON.parse(call.body)), [{ favorite: true }, { favorite: true }]);
  assert.doesNotMatch(h.text(), /Connexion indisponible/);
});

test("unfavorite is explicit false and a mismatched response is never reported as saved", async t => {
  const h = harness("VipPostCard", { post: { ...one, favorite: true } }); t.after(() => h.unmount()); await h.flush();
  await h.click(); assert.equal(h.bookmark.props["aria-pressed"], false); assert.deepEqual(JSON.parse(h.calls[0].body), { favorite: false });
  h.state.reply = { postId: two.id, favorite: true }; await h.click(); assert.equal(h.bookmark.props["aria-pressed"], false); assert.equal(h.changes.length, 1); assert.ok(h.nodes().some(node => node.props.role === "alert"));
});

test("editor previews never save favorites or mutate reactions", async t => {
  const h = harness("VipPostCard", { post: one, preview: true }); t.after(() => h.unmount()); await h.flush();
  assert.equal(h.bookmark.props.disabled, true); h.bookmark.props.onClick(); await h.flush();
  for (const button of h.nodes().filter(node => node.type === "button" && /J’aime|Flamme|Cœur/.test(node.props["aria-label"] || ""))) { assert.equal(button.props.disabled, true); button.props.onClick(); }
  await h.flush(); assert.equal(h.calls.length, 0);
});

test("unmounted favorite requests abort and cannot update another card or notify its parent", async () => {
  const h = harness("VipPostCard", { post: one }); await h.flush(); h.state.hold = true; await h.click();
  h.unmount(); assert.equal(h.calls[0].signal.aborted, true); await h.resolve(); assert.equal(h.changes.length, 0);
});

test("a fresh server post object replaces the prior locally confirmed bookmark state", async t => {
  const h = harness("VipPostCard", { post: one }); t.after(() => h.unmount()); await h.flush(); await h.click(); assert.equal(h.bookmark.props["aria-pressed"], true);
  await h.rerender({ post: { ...one, favorite: false } }); assert.equal(h.bookmark.props["aria-pressed"], false);
});

test("favorites mount loads once, paginates explicitly and deduplicates overlapping pages", async t => {
  const h = harness("VipFavorites", { userId: "account-a" }); t.after(() => h.unmount());
  h.state.pages = [{ posts: [{ ...one, favorite: true }], nextCursor: "first-cursor" }, { posts: [{ ...one, favorite: true }, { ...two, favorite: true }], nextCursor: null }]; await h.flush();
  assert.equal(h.calls.length, 1); assert.equal(h.cards.length, 1); assert.equal(h.cards[0].key, `account-a:${one.id}`);
  await h.click("Voir plus de favoris"); assert.equal(h.calls[1].path, "/api/vip/favorites?cursor=first-cursor"); assert.equal(h.cards.length, 2); assert.equal(h.button("Voir plus de favoris"), undefined);
});

test("removing a saved post updates the favorites view only after child confirmation", async t => {
  const h = harness("VipFavorites", { userId: "account-a" }); t.after(() => h.unmount()); await h.flush();
  assert.equal(h.cards.length, 1); h.cards[0].props.onFavoriteChange(one.id, false); await h.flush();
  assert.equal(h.cards.length, 0); assert.deepEqual(h.changes, [{ postId: one.id, favorite: false }]); assert.match(h.text(), /Vos publications à retrouver/);
});

test("a pending page cannot resurrect a favorite removed after its read started", async t => {
  const h = harness("VipFavorites", { userId: "account-a" }); t.after(() => h.unmount());
  h.state.pages = [{ posts: [{ ...one, favorite: true }], nextCursor: "next" }, { posts: [{ ...one, favorite: true }, { ...two, favorite: true }], nextCursor: null }]; await h.flush();
  h.state.hold = true; await h.click("Voir plus de favoris"); h.cards[0].props.onFavoriteChange(one.id, false); await h.flush();
  assert.equal(h.calls[1].signal.aborted, true); await h.resolve(); assert.equal(h.cards.length, 0); assert.equal(h.changes.length, 1);
});

test("refresh retains saved content while loading, and an unavailable page can be retried", async t => {
  const h = harness("VipFavorites", { userId: "account-a" }); t.after(() => h.unmount()); await h.flush();
  h.state.hold = true; await h.rerender({ refreshKey: 1 }); assert.equal(h.cards.length, 1); assert.match(h.text(), /Actualisation des favoris/); await h.resolve();
  h.state.hold = false; h.state.fail = new Error("Réseau indisponible"); await h.rerender({ refreshKey: 2 }); assert.equal(h.cards.length, 1); assert.match(h.text(), /Réseau indisponible/);
  h.state.fail = null; await h.click("Réessayer"); assert.equal(h.cards.length, 1); assert.doesNotMatch(h.text(), /Réseau indisponible/);
});

test("access expiry clears all saved content and pagination immediately", async t => {
  for (const status of [401, 403]) {
    const h = harness("VipFavorites", { userId: "account-a" }); t.after(() => h.unmount()); h.state.pages[0].nextCursor = "next"; await h.flush();
    h.state.fail = new VipApiError("Accès expiré", status); await h.click("Voir plus de favoris"); assert.equal(h.cards.length, 0); assert.equal(h.button("Voir plus de favoris"), undefined); assert.match(h.text(), /Accès expiré/);
  }
});

test("unmounted favorites reads abort and cannot install stale private content", async () => {
  const h = harness("VipFavorites", { userId: "account-a" }); h.state.hold = true; await h.flush(); assert.equal(h.cards.length, 0);
  h.unmount(); assert.equal(h.calls[0].signal.aborted, true); await h.resolve(); assert.equal(h.cards.length, 0);
});

test("switching accounts destroys prior saved content and aborts any previous private page", async t => {
  const h = harness("VipFavorites", { userId: "account-a" }); t.after(() => h.unmount()); await h.flush(); assert.equal(h.cards.length, 1);
  h.state.hold = true; await h.rerender({ refreshKey: 1 }); const oldRead = h.calls.at(-1); assert.equal(oldRead.signal.aborted, false);
  h.state.pages[0] = { posts: [{ ...two, favorite: true }], nextCursor: null };
  await h.rerender({ userId: "account-b" }); assert.equal(oldRead.signal.aborted, true); assert.equal(h.cards.length, 0);
  await h.resolve(); assert.equal(h.cards.length, 1); assert.equal(h.cards[0].props.post.id, two.id); assert.equal(h.cards[0].key, `account-b:${two.id}`);
});
