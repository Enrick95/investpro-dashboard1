import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const compiled = ts.transpileModule(readFileSync(new URL("../components/vip/VipChat.tsx", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
class VipApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
const first = { id: "00000000-0000-4000-8000-000000000001", body: "Question du groupe", authorId: "other", authorName: "Membre exemple", createdAt: "2026-10-17T10:00:00Z", own: false, adminAuthor: false };
const mine = { ...first, id: "00000000-0000-4000-8000-000000000002", body: "Mon message", authorId: "me", authorName: "Moi", createdAt: "2026-10-17T10:01:00Z", own: true };

// This harness executes the real component's handlers/effects, with deterministic hook state
// and a tiny ref surface. It intentionally does not claim to verify browser layout or paint.
function harness({ admin = false, messages = [first, mine], status = 200 } = {}) {
  let slots = [], index = 0, effects = [], dirty = true, tree, stopped = false, intervalId = 0;
  const intervals = new Map(), listeners = new Map(), calls = [];
  const state = { messages: structuredClone(messages), status, canModerate: admin, sendFailure: false, deleteFailure: false, pauseRead: false, paused: null };
  const hooks = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; dirty = true; }]; },
    useRef(initial) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(callback, deps) { const i = index++; if (!slots[i] || deps.some((value, n) => !Object.is(value, slots[i].deps[n]))) slots[i] = { callback, deps }; return slots[i].callback; },
    useEffect(callback, deps) { const i = index++; if (!slots[i] || !deps || deps.some((value, n) => !Object.is(value, slots[i].deps[n]))) { const previous = slots[i]; slots[i] = { deps, cleanup: previous?.cleanup }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = callback(); }); } },
    useId() { const i = index++; if (!(i in slots)) slots[i] = { value: `chat-id-${i}` }; return slots[i].value; },
  };
  hooks.useLayoutEffect = hooks.useEffect;
  const jsx = (type, props, key) => {
    if (props?.ref && !props.ref.current) props.ref.current = type === "textarea" ? { focus() {} } : { scrollHeight: 800, scrollTop: 800, clientHeight: 250, getBoundingClientRect: () => ({ top: 0 }), querySelectorAll: () => [] };
    return { type, props: props || {}, key };
  };
  const windowMock = {
    setInterval(callback) { const id = ++intervalId; intervals.set(id, callback); return id; }, clearInterval(id) { intervals.delete(id); },
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
  };
  const documentMock = { ...windowMock, visibilityState: "visible" };
  async function vipRequest(path, init = {}) {
    calls.push({ path, ...init });
    const method = init.method || "GET";
    if (state.status !== 200) throw new VipApiError("Fixture error", state.status);
    if (method === "POST") {
      if (state.sendFailure) throw new Error("Connection lost");
      const input = JSON.parse(init.body);
      const message = { ...mine, id: `00000000-0000-4000-8000-${String(state.messages.length + 1).padStart(12, "0")}`, body: input.text, createdAt: "2026-10-17T15:00:00Z" };
      state.messages = [...state.messages, message]; return { message };
    }
    if (method === "DELETE") {
      if (state.deleteFailure) throw new Error("Connection lost");
      state.messages = state.messages.filter(message => message.id !== path.split("/").at(-1)); return { ok: true };
    }
    const payload = { messages: structuredClone(state.messages), nextCursor: null, canModerate: state.canModerate };
    if (state.pauseRead) { state.pauseRead = false; return new Promise(resolve => { state.paused = () => resolve(payload); }); }
    return payload;
  }
  const context = { exports: {}, require(name) {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name === "next/link") return { __esModule: true, default: "link" };
    if (name === "lucide-react") return new Proxy({}, { get: (_object, key) => `icon-${String(key)}` });
    if (name === "@/lib/vip/client") return { VipApiError, vipRequest };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_object, key) => key }) };
    throw new Error(`Unmocked dependency ${name}`);
  }, window: windowMock, document: documentMock, AbortController, DOMException, crypto: webcrypto, Date, Intl, URL, Map, Set, console };
  vm.runInNewContext(compiled, context, { filename: "VipChat.cjs" });
  function render() { index = 0; dirty = false; tree = context.exports.default({ userId: "me", admin, locale: "fr" }); }
  async function flush() { for (let pass = 0; pass < 18; pass++) { if (dirty && !stopped) render(); effects.splice(0).forEach(effect => effect()); await Promise.resolve(); } }
  function nodes(value = tree) { if (value === null || value === undefined || typeof value === "boolean") return []; if (Array.isArray(value)) return value.flatMap(nodes); if (typeof value !== "object") return []; return [value, ...nodes(value.props?.children ?? null)]; }
  function text(value = tree) { if (value === null || value === undefined || typeof value === "boolean") return ""; if (Array.isArray(value)) return value.map(text).join(" "); if (typeof value !== "object") return String(value); return text(value.props?.children ?? null); }
  return { state, calls, flush, nodes, text, document: documentMock,
    get input() { return nodes().find(node => node.type === "textarea"); },
    button(label) { return nodes().find(node => node.type === "button" && text(node).trim() === label); },
    async type(value) { this.input.props.onChange({ target: { value } }); await flush(); },
    async click(label) { const button = this.button(label); assert.ok(button, `Button ${label} exists`); assert.ok(!button.props.disabled, `Button ${label} is enabled`); button.props.onClick(); await flush(); },
    async tick() { [...intervals.values()].forEach(callback => callback()); await flush(); },
    async event(name) { [...listeners.get(name) || []].forEach(callback => callback()); await flush(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); stopped = true; },
    get timerCount() { return intervals.size; },
  };
}

test("chat displays server messages as plaintext and only verified team badges", async t => {
  const h = harness({ messages: [{ ...first, authorName: "Équipe prétendue", body: '<img src=x onerror="alert(1)">' }, { ...mine, adminAuthor: true }] }); t.after(() => h.unmount()); await h.flush();
  assert.match(h.text(), /<img src=x onerror="alert\(1\)">/);
  assert.equal(h.nodes().filter(node => node.type === "img").length, 0);
  assert.equal(h.nodes().filter(node => node.props.className === "team").length, 1);
  assert.equal(h.nodes().filter(node => node.props["aria-label"] === "Supprimer le message").length, 1);
});

test("Enter keeps multiline editing; Ctrl+Enter sends server-confirmed text with UUID", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); await h.type("  Bonjour\nle groupe  ");
  let prevented = false;
  h.input.props.onKeyDown({ key: "Enter", ctrlKey: false, metaKey: false, nativeEvent: { isComposing: false }, preventDefault() { prevented = true; } }); await h.flush();
  assert.equal(prevented, false); assert.equal(h.calls.filter(call => call.method === "POST").length, 0);
  h.input.props.onKeyDown({ key: "Enter", ctrlKey: true, metaKey: false, nativeEvent: { isComposing: false }, preventDefault() { prevented = true; } }); await h.flush();
  const input = JSON.parse(h.calls.find(call => call.method === "POST").body);
  assert.equal(input.text, "Bonjour\nle groupe"); assert.match(input.clientId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(h.input.props.value, ""); assert.match(h.text(), /Bonjour\nle groupe/);
});

test("IME composition never submits a message", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); await h.type("Composition");
  h.input.props.onKeyDown({ key: "Enter", ctrlKey: true, metaKey: false, nativeEvent: { isComposing: true }, preventDefault() { assert.fail("Composition must not be interrupted"); } }); await h.flush();
  assert.equal(h.calls.filter(call => call.method === "POST").length, 0);
});

test("failed send keeps draft and idempotency UUID across a background read and retry", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); await h.type("Un texte conservé"); h.state.sendFailure = true;
  await h.click("Envoyer"); assert.equal(h.input.props.value, "Un texte conservé"); assert.match(h.text(), /n’a pas été confirmé/);
  await h.tick(); assert.match(h.text(), /n’a pas été confirmé/);
  h.state.sendFailure = false; await h.click("Réessayer");
  const writes = h.calls.filter(call => call.method === "POST").map(call => JSON.parse(call.body));
  assert.equal(writes.length, 2); assert.equal(writes[0].clientId, writes[1].clientId); assert.equal(h.input.props.value, "");
});

test("editing a failed draft uses a fresh idempotency UUID", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); await h.type("Premier texte"); h.state.sendFailure = true; await h.click("Envoyer");
  await h.type("Texte corrigé"); h.state.sendFailure = false; await h.click("Envoyer");
  const writes = h.calls.filter(call => call.method === "POST").map(call => JSON.parse(call.body));
  assert.notEqual(writes[0].clientId, writes[1].clientId); assert.equal(writes[1].text, "Texte corrigé");
});

test("access revocation clears messages and draft, disables composer and stops polling", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); await h.type("Ne doit pas persister"); h.state.status = 403; await h.tick();
  assert.equal(h.input.props.value, ""); assert.equal(h.input.props.disabled, true); assert.doesNotMatch(h.text(), /Question du groupe|Mon message/);
  const count = h.calls.length; await h.tick(); assert.equal(h.calls.length, count);
});

test("owner deletion requires inline confirmation and removes only the confirmed message", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush();
  const trigger = h.nodes().find(node => node.props["aria-label"] === "Supprimer le message"); trigger.props.onClick(); await h.flush();
  assert.match(h.text(), /définitivement/); assert.equal(h.calls.filter(call => call.method === "DELETE").length, 0);
  await h.click("Annuler"); assert.equal(h.calls.filter(call => call.method === "DELETE").length, 0);
  h.nodes().find(node => node.props["aria-label"] === "Supprimer le message").props.onClick(); await h.flush(); await h.click("Supprimer");
  assert.equal(h.calls.filter(call => call.method === "DELETE").length, 1); assert.match(h.text(), /Question du groupe/); assert.doesNotMatch(h.text(), /Mon message/);
});

test("moderation controls depend on verified server canModerate, not admin prop alone", async t => {
  const h = harness({ admin: true }); h.state.canModerate = false; t.after(() => h.unmount()); await h.flush();
  assert.equal(h.nodes().filter(node => node.props["aria-label"] === "Supprimer le message").length, 1);
  h.state.canModerate = true; await h.tick(); assert.equal(h.nodes().filter(node => node.props["aria-label"] === "Supprimer le message").length, 2);
});

test("a pre-send poll cannot remove a newly server-confirmed message", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); h.state.pauseRead = true; await h.tick();
  assert.equal(typeof h.state.paused, "function"); await h.type("Confirmé après le poll"); await h.click("Envoyer");
  h.state.paused(); await h.flush(); assert.match(h.text(), /Confirmé après le poll/);
});

test("a pre-delete poll cannot restore a deleted message", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); h.state.pauseRead = true; await h.tick();
  h.nodes().find(node => node.props["aria-label"] === "Supprimer le message").props.onClick(); await h.flush(); await h.click("Supprimer");
  h.state.paused(); await h.flush(); assert.doesNotMatch(h.text(), /Mon message/);
});

test("new messages show a catch-up button while reading older messages", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush();
  const scroll = h.nodes().find(node => node.props.onScroll); scroll.props.ref.current.scrollTop = 0; scroll.props.onScroll(); await h.flush();
  h.state.messages = [...h.state.messages, { ...first, id: "00000000-0000-4000-8000-000000000005", body: "Un nouvel échange", createdAt: "2026-10-17T16:00:00Z" }];
  await h.tick(); assert.ok(h.button("Nouveau message")); await h.click("Nouveau message"); assert.equal(h.button("Nouveau message"), undefined);
  assert.equal(scroll.props.ref.current.scrollTop, scroll.props.ref.current.scrollHeight);
});

test("hidden pages do not poll, focus refreshes visible pages, cleanup removes timers", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); const initial = h.calls.length;
  h.document.visibilityState = "hidden"; await h.tick(); assert.equal(h.calls.length, initial);
  h.document.visibilityState = "visible"; await h.event("focus"); assert.equal(h.calls.length, initial + 1);
  h.unmount(); assert.equal(h.timerCount, 0); const count = h.calls.length; await h.tick(); await h.event("focus"); assert.equal(h.calls.length, count);
});
