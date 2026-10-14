import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

// Render the real component's state/effects and events without a browser or new dependencies.
// Browser QA separately checks CSS layout and physical touch/click routing.
function mountInstall({ mobile = false, installed = false, dismissed = false } = {}) {
  const slots = [], effects = [], timers = new Map(), storage = new Map();
  let cursor = 0, dirty = true, tree, hostTree, nextTimer = 1, clock = 1000000;
  const document = new EventTarget();
  class Element extends EventTarget {
    constructor(type = "button", props = {}) { super(); this.type = type; this.props = props; this.children = []; this.style = { overflow: "" }; this.disabled = Boolean(props.disabled); this.isConnected = true; }
    focus() { document.activeElement = this; }
    contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    querySelectorAll() { return descendants(this).filter(node => ["button", "a", "input", "select", "textarea"].includes(node.type) && !node.disabled); }
    querySelector(selector) { return descendants(this).find(node => selector.startsWith(".") ? node.props.className?.split(" ").includes(selector.slice(1)) : node.type === selector) || null; }
    getClientRects() { return [{}]; }
    getAttribute(name) { return this.props[name] ?? null; }
  }
  document.body = new Element("body"); document.documentElement = new Element("html");
  const opener = new Element("button", { id: "installation-opener" });
  document.activeElement = opener;
  const window = new EventTarget();
  const media = new Map();
  function matchMedia(query) {
    if (!media.has(query)) { const item = new EventTarget(); item.matches = query.includes("max-width") ? mobile : installed; media.set(query, item); }
    return media.get(query);
  }
  window.matchMedia = matchMedia;
  window.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) };
  window.setTimeout = (fn, delay = 0) => { const id = nextTimer++; timers.set(id, { fn, at: clock + delay }); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.requestAnimationFrame = fn => window.setTimeout(fn, 0);
  window.cancelAnimationFrame = window.clearTimeout;
  if (dismissed) storage.set("investpro-install-reminder-until-v2", String(clock + 7 * 86400000));
  class TestDate extends Date { static now() { return clock; } }
  const sameDeps = (before, after) => before && after && before.length === after.length && before.every((value, index) => Object.is(value, after[index]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { state: typeof initial === "function" ? initial() : initial };
      return [slots[index].state, value => { const next = typeof value === "function" ? value(slots[index].state) : value; if (!Object.is(next, slots[index].state)) { slots[index].state = next; dirty = true; } }];
    },
    useRef(initial) { const index = cursor++; return (slots[index] ||= { current: initial }); },
    useEffect(effect, deps) {
      const index = cursor++, prior = slots[index];
      if (!prior || !sameDeps(prior.deps, deps)) { slots[index] = { deps, cleanup: prior?.cleanup }; effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); }); }
    },
    useMemo(factory, deps) { const index = cursor++; if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useId() { const index = cursor++; return `install-test-${index}`; },
  };
  hooks.useLayoutEffect = hooks.useEffect;
  hooks.useCallback = (callback, deps) => hooks.useMemo(() => callback, deps);
  const compiledModule = { exports: {} };
  const source = fs.readFileSync(new URL("../components/InstallAppExperience.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(output, {
    module: compiledModule, exports: compiledModule.exports, window, document, Event, HTMLElement: Element, Date: TestDate,
    navigator: { userAgent: mobile ? "Android Chrome" : "Windows Chrome", platform: "Win32", maxTouchPoints: 0, standalone: installed },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
      throw new Error("Unexpected import: " + name);
    },
  });
  const Component = compiledModule.exports.default;
  function materialize(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(materialize);
    if (typeof node.type === "function") return materialize(node.type(node.props));
    if (typeof node.type !== "string") return materialize(node.props?.children);
    const host = new Element(node.type, node.props);
    host.children = materialize(node.props?.children);
    if (node.props?.ref) { if (typeof node.props.ref === "function") node.props.ref(host); else node.props.ref.current = host; }
    return [host];
  }
  function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
  function flush() {
    for (let count = 0; dirty && count < 30; count++) {
      dirty = false; cursor = 0; tree = Component();
      hostTree = new Element("root"); hostTree.children = materialize(tree);
      effects.splice(0).forEach(effect => effect());
    }
    assert.equal(dirty, false, "component effects settle");
  }
  function advance(ms) {
    const end = clock + ms;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      clock = next[1].at; timers.delete(next[0]); next[1].fn(); flush();
    }
    clock = end; flush();
  }
  const find = predicate => descendants(hostTree).find(predicate);
  function open() { window.dispatchEvent(new Event("investpro:open-install-guide")); flush(); advance(0); }
  function clickClass(className) { const button = find(node => node.type === "button" && node.props.className === className); assert.ok(button, className + " exists"); button.props.onClick(new Event("click", { cancelable: true })); flush(); advance(0); }
  function escape() {
    const event = new Event("keydown", { cancelable: true }); Object.defineProperty(event, "key", { value: "Escape" });
    document.dispatchEvent(event); window.dispatchEvent(event); flush(); advance(0);
  }
  flush();
  return {
    open, advance, escape, clickClass, document, opener,
    dialog: () => find(node => node.props.role === "dialog"),
    banner: () => find(node => node.type === "aside" && node.props.className === "ip-install-banner"),
  };
}

test("the manual installation action opens the actual dialog on a desktop", () => {
  const app = mountInstall();
  app.advance(3000);
  assert.equal(app.banner(), undefined);
  assert.equal(app.dialog(), undefined);
  app.open();
  assert.ok(app.dialog());
});

test("an installed application hides automatic invitations but still permits a manual guide", () => {
  const app = mountInstall({ mobile: true, installed: true });
  app.advance(3000);
  assert.equal(app.banner(), undefined);
  app.open();
  assert.ok(app.dialog());
});

test("a remembered dismissal affects the automatic banner, not a manual action", () => {
  const app = mountInstall({ mobile: true, dismissed: true });
  app.advance(3000);
  assert.equal(app.banner(), undefined);
  app.open();
  assert.ok(app.dialog());
  app.clickClass("ip-install-later");
  assert.equal(app.dialog(), undefined);
  app.open();
  assert.ok(app.dialog());
});

test("a mobile banner can open the guide and the close button does not disable reopening", () => {
  const app = mountInstall({ mobile: true });
  app.advance(3000);
  assert.ok(app.banner());
  app.clickClass("ip-install-banner-action");
  assert.ok(app.dialog());
  assert.equal(app.banner(), undefined);
  app.clickClass("ip-install-close");
  assert.equal(app.dialog(), undefined);
  app.open();
  assert.ok(app.dialog());
});

test("Escape closes the guide and restores focus to its original action", () => {
  const app = mountInstall();
  app.open();
  assert.ok(app.dialog());
  app.escape();
  assert.equal(app.dialog(), undefined);
  assert.equal(app.document.activeElement, app.opener);
});
