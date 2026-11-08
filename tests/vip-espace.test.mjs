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
/** Calendar day in Paris, as YYYY-MM-DD: the day of a publication or of a trade. */
function parisDate(time) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
}
const month = parisMonth(now);
// The fixed trades sit far from today, so that they never close the signals of these tests by accident.
const tradeDay = Number(parisDate(now).slice(8, 10)) <= 15 ? "28" : "01";
const member = { type: "affiliation", email: "camille@example.invalid", first_name: "Camille", started_at: "2026-10-01T10:00:00Z", expires_at: null, renewal_requested_at: null, status: "active" };
const post = (id, category, extra = {}) => ({ id, category, title: "Publication " + id, body: "Texte " + id, symbol: null, direction: null, levels: {}, image_url: null, created_at: ago(3600000), ...extra });
const xau = post("xau", "signal", { symbol: "XAUUSD", direction: "buy", body: "Signal XAUUSD", levels: { entry: 2318.5, stopLoss: 2310, takeProfit: 2327, takeProfit2: 2336 }, created_at: ago(2 * 3600000) });
const nas = post("nas", "signal", { symbol: "NAS100", direction: "sell", body: "Signal NAS100", levels: { entry: 18420, stopLoss: 18510, takeProfit: 18330 }, created_at: ago(1800000) });
const analysis = post("plan", "analysis", { title: "Plan de la semaine", created_at: ago(5 * 3600000) });
const win = { id: 1, source: "telegram", trade_date: `${month}-${tradeDay}`, symbol: "XAUUSD", direction: "buy", status: "win", result_r: 2, pips: 0, target: 2 };
const loss = { id: 2, source: "telegram", trade_date: `${month}-${tradeDay}`, symbol: "EURUSD", direction: "sell", status: "loss", result_r: -1, pips: 0, target: null };

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
  host.start(Espace, props({ initialTab: "fil", ...overrides }));
  return { host, requests };
}

/** The section of the trades still open, as the side of Le fil shows them. */
const openTrades = host => text(nodes(host.tree, node => node.props["aria-labelledby"] === "vip-espace-open")[0]);

test("a new account opens on La salle des signaux with honest empty states and no placeholder figures", async () => {
  const { host, requests } = render({ initialTab: undefined, membership: { ...member, first_name: null } });
  await host.settle();
  assert.deepEqual(requests, ["/api/vip/performance"], "The space reads only public performance figures");
  assert.equal(button(host, "La salle des signaux").props["aria-pressed"], true);
  assert.equal(button(host, "Le fil").props["aria-pressed"], false);
  const copy = text(host.tree);
  assert.match(copy, /Les publications de l’équipe apparaîtront ici\./);
  assert.match(copy, /Aucun trade en cours pour l’instant\./);
  assert.match(copy, /Les trades clôturés apparaîtront ici\./);
  assert.match(copy, /Résultat du mois/);
  for (const placeholder of ["[+X R]", "[X %]", "[N]", "214 membres", "Julien", "2 trades ouverts", "Enrick"]) {
    assert.equal(copy.includes(placeholder), false, placeholder);
  }
});

test("Le fil shows the trades still open, oldest first, the monthly figures from the Bilan logic, and the feed once", async () => {
  const { host } = render({ posts: [xau, nas, analysis] }, { trades: [win, loss] });
  await host.settle();
  const copy = text(host.tree);
  assert.match(copy, /Trades en cours/);
  assert.match(copy, /XAUUSD · BUY/);
  assert.match(copy, /NAS100 · SELL/);
  const side = openTrades(host);
  assert.ok(side.indexOf("XAUUSD") < side.indexOf("NAS100"), "The open trades are listed oldest first");
  assert.match(copy, /Ce mois-ci/);
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

test("La salle des signaux greets the member, shows the four figures and the trades still open", async () => {
  const { host } = render({ posts: [xau, nas, analysis] }, { trades: [win, loss] });
  await host.settle();
  button(host, "La salle des signaux").props.onClick(); await host.settle();
  const copy = text(host.tree);
  assert.match(copy, /Bonjour Camille, 2 trades sont ouverts/);
  assert.match(copy, /Trades ouverts2/);
  assert.match(copy, /Résultat du mois\+1,0 R/);
  assert.match(copy, /Taux de réussite50 %/);
  assert.match(copy, /Signaux ce mois2/);
  for (const label of ["Dernières publications", "Trades clôturés"]) assert.match(copy, new RegExp(label));
  assert.equal(copy.includes("Signaux (24 h)"), false);
  assert.equal(copy.includes("Derniers signaux"), false);
  const cards = nodes(host.tree, node => node.type === "article" && String(node.props.className).startsWith("sigCard "));
  assert.equal(cards.length, 2);
  assert.match(text(cards[0]), /^XAUUSD/, "The older trade comes first, as in the maquette");
  assert.match(text(cards[1]), /^NAS100/);
  assert.match(copy, /TP1 2 327/);
  assert.match(copy, /TP2 2 336/);
  assert.match(copy, /TP1 18 330/);
  assert.match(copy, /XAUUSD · BUY/);
  assert.match(copy, /EURUSD · SELLStop/);
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
  button(abonnement.host, "Renouveler").props.onClick();
  assert.deepEqual(requests, ["renew"]);

  const affiliation = render({ membership: { ...member, type: "affiliation", expires_at: soon } });
  await affiliation.host.settle();
  assert.match(text(affiliation.host.tree), /Ton accès se termine le/);
  assert.equal(nodes(affiliation.host.tree, node => node.type === "button" && text(node) === "Renouveler").length, 0);

  const far = render({ membership: { ...member, type: "abonnement", expires_at: ahead(200 * DAY) } });
  await far.host.settle();
  assert.equal(text(far.host.tree).includes("se termine le"), false);

  const pending = render({ membership: { ...member, type: "abonnement", expires_at: soon, renewal_requested_at: ago(3600000) } });
  await pending.host.settle();
  assert.match(text(pending.host.tree), /Renouvellement demandé · en attente de vérification par l’équipe\./);
  assert.equal(nodes(pending.host.tree, node => node.type === "button" && text(node) === "Renouveler").length, 0);
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

test("a signal stays open for two weeks unless a trade of its instrument and side closes it", async () => {
  const closedAt = ago(2 * DAY);
  const closedSignal = post("closed", "signal", { symbol: "GBPJPY", direction: "buy", body: "Signal GBPJPY", levels: { entry: 1.9 }, created_at: closedAt });
  const closure = { ...win, id: 9, symbol: "GBPJPY", direction: "buy", trade_date: parisDate(Date.parse(closedAt)), status: "loss", result_r: -1, target: null };
  const stale = post("stale", "signal", { symbol: "NAS100", direction: "sell", body: "Signal ancien", levels: {}, created_at: ago(15 * DAY) });
  const { host } = render({ posts: [xau, closedSignal, stale] }, { trades: [closure] });
  await host.settle();
  assert.match(openTrades(host), /XAUUSD · BUY/);
  assert.equal(openTrades(host).includes("GBPJPY"), false, "A signal closed by a trade is not open");
  assert.equal(openTrades(host).includes("NAS100"), false, "A signal older than two weeks is not open");
  button(host, "La salle des signaux").props.onClick(); await host.settle();
  assert.match(text(host.tree), /GBPJPY · BUY/, "The closed trade is in the closed list");
});

test("a trade closes a signal only with the same instrument and side, on the same day or the day after", async () => {
  const signalAt = ago(3 * 3600000);
  const sell = post("sell", "signal", { symbol: "NAS100", direction: "sell", body: "Signal NAS100", levels: {}, created_at: signalAt });
  const otherSide = { ...win, id: 10, symbol: "NAS100", direction: "buy", trade_date: parisDate(Date.parse(signalAt)), status: "win", result_r: 1, target: 1 };
  const threeDaysBefore = { ...win, id: 11, symbol: "NAS100", direction: "sell", trade_date: parisDate(Date.parse(signalAt) - 3 * DAY), status: "loss", result_r: -1, target: null };
  const stillOpen = render({ posts: [sell] }, { trades: [otherSide, threeDaysBefore] });
  await stillOpen.host.settle();
  assert.match(openTrades(stillOpen.host), /NAS100 · SELL/, "A trade of the other side, or three days away, does not close it");
  const dayAfter = { ...win, id: 12, symbol: "NAS100", direction: "sell", trade_date: parisDate(Date.parse(signalAt) + DAY), status: "win", result_r: 1, target: 1 };
  const closed = render({ posts: [sell] }, { trades: [dayAfter] });
  await closed.host.settle();
  assert.equal(openTrades(closed.host).includes("NAS100"), false, "A trade of the same side the day after closes it");
});

test("the TP3 and the team’s note come from the signal text, without its template lines", async () => {
  const update = post("update", "signal", { symbol: "XAUUSD", direction: "buy", body: "Entrée : 2 318\nTP3 : 2 350\nMise à jour 11:05 · TP1 touché, stop déplacé au point d’entrée (BE).", levels: { entry: 2318, stopLoss: 2310, takeProfit: 2327 }, created_at: ago(3600000) });
  const closure = { ...win, id: 9, symbol: "XAUUSD", direction: "buy", trade_date: parisDate(Date.parse(update.created_at)), status: "win", result_r: 1, target: 1 };
  const template = post("template", "signal", { symbol: "NAS100", direction: "sell", body: "TP3 : 18 120", levels: { entry: 18420, stopLoss: 18510, takeProfit: 18330 }, created_at: ago(1800000) });
  const { host } = render({ posts: [update, template] }, { trades: [closure] });
  await host.settle();
  const copy = text(host.tree);
  assert.match(copy, /Mise à jour 11:05 · TP1 touché, stop déplacé au point d’entrée \(BE\)\./);
  assert.equal(copy.includes("Entrée : 2 318"), false, "A template line is not repeated as a note");
  assert.equal(copy.includes("TP3 : 18 120"), false, "A template line is not repeated as a note");
  assert.match(copy, /TP1 ✓2 327/, "A reached target is ticked");
  const card = nodes(host.tree, node => node.props.id === "publication-update")[0];
  assert.match(card.props.className, /signalNews/, "A signal with a closing result takes the gold frame");
  button(host, "La salle des signaux").props.onClick(); await host.settle();
  assert.match(text(host.tree), /TP3 18 120/, "La salle des signaux shows the third target under its bar");
});
