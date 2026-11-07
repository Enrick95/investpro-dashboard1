import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

/* Offline checks for the VIP space. The real TSX runs in a small hook host; the browser render is checked separately. */
const root = path.resolve(import.meta.dirname, "..");
const identity = value => value;
const fragment = Symbol("fragment");
const element = (type, props, key) => ({ type, props: props || {}, key });
const icon = () => null;
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };

function compile(file, modules, extra = {}) {
  const cjsModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module: cjsModule, exports: cjsModule.exports, URL, AbortController, Date, console,
    fetch: extra.fetch ?? (() => { throw Error("No network in space tests"); }),
    require(name) { assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name); return modules[name]; },
  });
  return cjsModule.exports;
}

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
      const key = location + ":" + node.type.name + (node.key === undefined ? "" : ":" + node.key);
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
      assert.fail("Offline space effects did not settle");
    },
    get tree() { return tree; },
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
// Une rubrique du fil porte une puce (« # » ou « ★ ») qui ne fait pas partie de son nom.
const buttonText = node => text(node).replace(/^[#★] /, "");
function button(host, label) {
  const result = nodes(host.tree, node => node.type === "button" && buttonText(node) === label);
  assert.equal(result.length, 1, "Expected one button: " + label); return result[0];
}

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const ago = ms => new Date(now - ms).toISOString();
const ahead = ms => new Date(now + ms).toISOString();
function parisMonth(time) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).formatToParts(new Date(time));
  return `${parts.find(part => part.type === "year").value}-${parts.find(part => part.type === "month").value}`;
}
const month = parisMonth(now);
const member = { type: "affiliation", email: "camille@example.invalid", first_name: "Camille", started_at: "2026-10-01T10:00:00Z", expires_at: null, renewal_requested_at: null, status: "active" };
const post = (id, category, extra = {}) => ({ id, category, title: "Publication " + id, body: "Texte " + id, symbol: null, direction: null, levels: {}, image_url: null, created_at: ago(3600000), ...extra });
const xau = post("xau", "signal", { symbol: "XAUUSD", direction: "buy", body: "Signal XAUUSD", levels: { entry: 2318.5, stopLoss: 2310, takeProfit: 2327, takeProfit2: 2336 }, created_at: ago(2 * 3600000) });
const nas = post("nas", "signal", { symbol: "NAS100", direction: "sell", body: "Signal NAS100", levels: { entry: 18420, stopLoss: 18510, takeProfit: 18330 }, created_at: ago(1800000) });
const analysis = post("plan", "analysis", { title: "Plan de la semaine", created_at: ago(5 * 3600000) });
const win = { id: 1, source: "telegram", trade_date: `${month}-05`, symbol: "XAUUSD", direction: "buy", status: "win", result_r: 2, pips: 0, target: 2 };
const loss = { id: 2, source: "telegram", trade_date: `${month}-07`, symbol: "EURUSD", direction: "sell", status: "loss", result_r: -1, pips: 0, target: null };

function props(overrides = {}) {
  return {
    view: "all", onSelect: () => {}, posts: [], membership: member, alertsOn: false, alertsAvailable: false,
    onEnableAlerts: () => {}, busy: false, onRenew: () => {}, refreshKey: 0, loading: false, onRefresh: () => {},
    channelContent: element("section", { "data-probe": "channel", children: "Contenu du canal" }),
    ...overrides,
  };
}

function render(overrides = {}, { trades = [], failPerformance = false } = {}) {
  const host = hookHost();
  const requests = [];
  const fetch = async url => {
    requests.push(url);
    if (url !== "/api/vip/performance") throw Error("Unexpected request " + url);
    if (failPerformance) throw Error("Performance offline");
    return { ok: true, json: async () => ({ trades }) };
  };
  const Espace = compile("components/vip/VipEspace.tsx", {
    react: host.hooks, "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: fragment },
    "next/link": link => element("a", link),
    "lucide-react": new Proxy({}, { get: () => icon }),
    "@/components/i18n/LocaleProvider": { useLocale: () => ({ t: identity, locale: "fr" }) },
    "@/lib/vip/client": { vipRequest: async () => { throw Error("Reactions are not part of these offline tests"); } },
    "@/lib/vip/performance-report": compile("lib/vip/performance-report.ts", {}),
    "@/lib/vip/publication-notice": compile("lib/vip/publication-notice.ts", {}),
    "@/lib/vip/signal-risk-preset": { riskSignalHref: postId => "/dashboard/simulateur?signal=" + encodeURIComponent(postId) },
    "./VipEspace.module.css": css,
  }, { fetch }).default;
  host.start(Espace, props(overrides));
  return { host, requests };
}

test("a new account opens on Le fil with honest empty states and no placeholder figures", async () => {
  const { host, requests } = render({ membership: { ...member, first_name: null } });
  await host.settle();
  assert.deepEqual(requests, ["/api/vip/performance"], "The space reads only public performance figures");
  assert.equal(button(host, "Le fil").props["aria-pressed"], true);
  assert.equal(button(host, "La salle des signaux").props["aria-pressed"], false);
  const copy = text(host.tree);
  assert.match(copy, /Aucun signal publié ces dernières 24 heures\./);
  assert.match(copy, /Aucun trade clôturé ce mois-ci\./);
  for (const placeholder of ["[+X R]", "[X %]", "[N]", "214 membres", "Julien", "2 trades ouverts", "Enrick", "Trades ouverts"]) {
    assert.equal(copy.includes(placeholder), false, placeholder);
  }
});

test("Le fil shows the last 24 hours, the monthly figures from the Bilan logic, and the feed once", async () => {
  const { host } = render({ posts: [xau, nas, analysis] }, { trades: [win, loss] });
  await host.settle();
  const copy = text(host.tree);
  assert.match(copy, /Signaux des 24 dernières heures/);
  assert.match(copy, /XAUUSD/);
  assert.match(copy, /BUY/);
  assert.match(copy, /SELL/);
  assert.match(copy, /3 nouvelles publications/);
  assert.match(copy, /\+1,0 R/);
  assert.match(copy, /50 %/);
  assert.equal(nodes(host.tree, node => node.type === "main").length, 1, "The feed is rendered once");
});

test("channel buttons select a channel and carry the posts of the last 24 hours", async () => {
  const selected = [];
  const { host } = render({ posts: [xau, nas, analysis], onSelect: channel => selected.push(channel) });
  await host.settle();
  assert.deepEqual(nodes(host.tree, node => node.props.className === "badge").map(text), ["3", "2", "1"]);
  button(host, "Signaux").props.onClick();
  button(host, "Analyses").props.onClick();
  assert.deepEqual(selected, ["signal", "analysis"]);
});

test("La salle des signaux greets the member and shows four figures, with no invented open trades", async () => {
  const { host } = render({ posts: [xau, nas, analysis] }, { trades: [win, loss] });
  await host.settle();
  button(host, "La salle des signaux").props.onClick(); await host.settle();
  const copy = text(host.tree);
  assert.match(copy, /Bonjour Camille\./);
  for (const label of ["Signaux \\(24 h\\)", "Résultat du mois", "Taux de réussite", "Signaux ce mois", "Dernières publications", "Trades clôturés"]) {
    assert.match(copy, new RegExp(label));
  }
  assert.equal(copy.includes("Trades ouverts"), false);
  assert.equal(copy.includes("Derniers signaux"), false);
  assert.match(copy, /XAUUSD · BUY/);
  assert.match(copy, /EURUSD · SELL/);
  assert.match(copy, /Stop-1,0 R/);
  assert.match(copy, /TP1/);
  // Les signaux ont leurs cartes ; la liste des publications ne reprend que le reste.
  assert.equal(nodes(host.tree, node => node.props.className === "row").length, 1);
});

test("Discussion from La salle des signaux opens the feed on the chat, once", async () => {
  const selected = [];
  const { host } = render({ onSelect: channel => selected.push(channel) });
  await host.settle();
  button(host, "La salle des signaux").props.onClick(); await host.settle();
  button(host, "Discussion").props.onClick(); await host.settle();
  assert.deepEqual(selected, ["chat"]);
  assert.equal(button(host, "Le fil").props["aria-pressed"], true);
});

test("Le téléphone is one column with channel chips, the portal content, and alerts only when available", async () => {
  const alerts = [];
  const { host } = render({ view: "chat", alertsAvailable: true, onEnableAlerts: () => alerts.push("on") });
  await host.settle();
  button(host, "Le téléphone").props.onClick(); await host.settle();
  assert.equal(button(host, "Discussion").props["aria-pressed"], true);
  assert.equal(nodes(host.tree, node => node.props["data-probe"] === "channel").length, 1);
  nodes(host.tree, node => node.type === "button" && node.props["aria-label"] === "Activer les alertes")[0].props.onClick();
  assert.deepEqual(alerts, ["on"]);

  const feed = render({ view: "signal" });
  button(feed.host, "Le téléphone").props.onClick(); await feed.host.settle();
  assert.equal(button(feed.host, "Signaux").props["aria-pressed"], true);
  assert.equal(nodes(feed.host.tree, node => node.props["data-probe"] === "channel").length, 0);

  const quiet = render({ alertsAvailable: false });
  button(quiet.host, "Le téléphone").props.onClick(); await quiet.host.settle();
  assert.equal(nodes(quiet.host.tree, node => node.props["aria-label"] === "Activer les alertes").length, 0);
});

test("renewal is offered only close to the end of an abonnement, and a request is shown as pending", async () => {
  const soon = ahead(10 * DAY);
  const requests = [];
  const abonnement = render({ membership: { ...member, type: "abonnement", expires_at: soon }, onRenew: () => requests.push("renew") });
  await abonnement.host.settle();
  button(abonnement.host, "Demander mon renouvellement").props.onClick();
  assert.deepEqual(requests, ["renew"]);

  const affiliation = render({ membership: { ...member, type: "affiliation", expires_at: soon } });
  await affiliation.host.settle();
  assert.match(text(affiliation.host.tree), /Votre accès se termine le/);
  assert.equal(nodes(affiliation.host.tree, node => node.type === "button" && text(node) === "Demander mon renouvellement").length, 0);

  const far = render({ membership: { ...member, type: "abonnement", expires_at: ahead(200 * DAY) } });
  await far.host.settle();
  assert.equal(text(far.host.tree).includes("Votre accès se termine le"), false);

  const pending = render({ membership: { ...member, type: "abonnement", expires_at: soon, renewal_requested_at: ago(3600000) } });
  await pending.host.settle();
  assert.match(text(pending.host.tree), /Renouvellement demandé · en attente de vérification par l’équipe\./);
  assert.equal(nodes(pending.host.tree, node => node.type === "button" && text(node) === "Demander mon renouvellement").length, 0);
});

test("when public performance cannot load, the figures say so instead of showing zeros", async () => {
  const { host } = render({ posts: [xau] }, { failPerformance: true });
  await host.settle();
  const unavailable = "Performances indisponibles pour le moment.";
  assert.equal(text(host.tree).split(unavailable).length - 1, 1);
  assert.equal(text(host.tree).includes("+0,00 R"), false);
  button(host, "La salle des signaux").props.onClick(); await host.settle();
  assert.equal(text(host.tree).split(unavailable).length - 1, 1);
});

test("the account tools sit inside the space, above the channel panel", async () => {
  const tools = element("details", { "data-probe": "account", children: "Mon accès" });
  const { host } = render({ accountTools: tools });
  await host.settle();
  const [account] = nodes(host.tree, node => node.props.className === "account");
  assert.ok(account, "The account strip is rendered");
  assert.equal(nodes(account, node => node.props["data-probe"] === "account").length, 1);
});
