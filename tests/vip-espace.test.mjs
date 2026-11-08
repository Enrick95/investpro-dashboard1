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

/** Renders the space as the portal does: the portal keeps the channel and passes it back when the space asks for one. */
/** The member as the space reads it: no account unless a test gives one. */
function memberFixture(overrides = {}) {
  return { status: "ready", accounts: [], account: null, risk: 1, rates: null, openTrades: [], setRisk() {}, setAccount() {}, reload() {}, ...overrides };
}
const riskSimulator = compile("lib/risk-simulator.ts", {});
const riskPreset = compile("lib/vip/signal-risk-preset.ts", { "../risk-simulator": riskSimulator });
const publicationNotice = compile("lib/vip/publication-notice.ts", {});
const sizing = compile("components/vip/vipMember.ts", {
  react: { useState: () => [], useEffect() {}, useCallback: callback => callback },
  "@/lib/supabase/client": { createClient() { throw Error("The member is a fixture in these tests"); } },
  "@/lib/risk-simulator": riskSimulator,
  "@/lib/risk-simulator-conventions": compile("lib/risk-simulator-conventions.ts", { "./risk-simulator": riskSimulator }),
  "@/lib/vip/signal-risk-preset": riskPreset,
});

function render(overrides = {}, { trades = [], failPerformance = false, member = {} } = {}) {
  const host = hookHost();
  const requests = [], selected = [];
  const seen = { journal: null, compte: null };
  const fetch = async url => {
    requests.push(url);
    if (url !== "/api/vip/performance") throw Error("Unexpected request " + url);
    if (failPerformance) throw Error("Performance offline");
    return { ok: true, json: async () => ({ trades }) };
  };
  function VipJournal(journal) { seen.journal = journal; return element("section", { "data-probe": "journal", children: journal.banner }); }
  function VipCompte(compte) { seen.compte = compte; return element("section", { "data-probe": "compte", children: compte.banner }); }
  const Espace = compile("components/vip/VipEspace.tsx", {
    react: host.hooks, "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: fragment },
    "next/link": link => element("a", link),
    "lucide-react": new Proxy({}, { get: () => icon }),
    "@/components/i18n/LocaleProvider": { useLocale: () => ({ t: identity, locale: "fr" }) },
    "@/lib/vip/client": { vipRequest: async () => { throw Error("Reactions are not part of these offline tests"); } },
    "@/lib/vip/performance-report": compile("lib/vip/performance-report.ts", {}),
    "@/lib/vip/publication-notice": compile("lib/vip/publication-notice.ts", {}),
    "@/lib/vip/signal-risk-preset": { ...riskPreset, riskSignalHref: postId => "/dashboard/simulateur?signal=" + encodeURIComponent(postId) },
    "./VipJournal": VipJournal,
    "./VipCompte": VipCompte,
    "./vipMember": { ...sizing, useVipMember: () => memberFixture(member) },
    "./espaceFont": { espaceFont: "vipFont" },
    "./VipEspace.module.css": css,
  }, { fetch }).default;
  let current;
  const onSelect = channel => { selected.push(channel); current = { ...current, view: channel }; host.start(Espace, current); };
  current = props({ ...overrides, onSelect });
  host.start(Espace, current);
  return { host, requests, selected, seen };
}

/** A section of the bottom bar; the Signaux button also carries the number of trades in progress. */
function navButton(host, label) {
  const [bar] = nodes(host.tree, node => node.type === "nav" && node.props["aria-label"] === "Navigation de l’espace VIP");
  assert.ok(bar, "The bottom bar is rendered");
  const result = nodes(bar, node => node.type === "button" && text(node).endsWith(label));
  assert.equal(result.length, 1, "Expected one section: " + label); return result[0];
}
function labelled(host, label) {
  const result = nodes(host.tree, node => node.props["aria-label"] === label);
  assert.equal(result.length, 1, "Expected one element labelled " + label); return result[0];
}
const tradeCards = host => nodes(host.tree, node => node.type === "article" && node.props.className === "trade");
const banners = host => nodes(host.tree, node => node.type === "button" && node.props.className === "live");

test("the space opens on Signaux with honest empty states, and nothing but the lot calculator leaves the space", async () => {
  const { host, requests } = render({ membership: { ...member, first_name: null } });
  await host.settle();
  assert.deepEqual(requests, ["/api/vip/performance"], "The space reads only public performance figures");
  assert.equal(navButton(host, "Signaux").props["aria-current"], "page");
  for (const label of ["Canal", "Journal", "Compte"]) assert.equal(navButton(host, label).props["aria-current"], undefined);
  const copy = text(host.tree);
  assert.match(copy, /Aucun trade en cours/);
  assert.match(copy, /Tu seras prévenu dès que l’équipe publie un signal\./);
  assert.match(copy, /Les trades clôturés apparaîtront ici\./);
  assert.equal(banners(host).length, 0, "No trade in progress, no banner");
  assert.equal(nodes(host.tree, node => node.props.className === "navBadge").length, 0);
  for (const placeholder of ["[+X R]", "[X %]", "[N]", "214 membres", "Julien", "Enrick", "10 470"]) {
    assert.equal(copy.includes(placeholder), false, placeholder);
  }
  const hrefs = nodes(host.tree, node => typeof node.props.href === "string").map(node => node.props.href);
  assert.deepEqual(hrefs, ["/dashboard/simulateur"], "The lot calculator is the only page outside the space");
});

test("a trade in progress leads Signaux with its levels at their price and their value in R, and is flagged on every other section", async () => {
  const { host } = render({ posts: [xau] });
  await host.settle();
  assert.equal(text(nodes(host.tree, node => node.type === "h1")[0]), "Trade en cours");
  const [card] = tradeCards(host);
  assert.ok(card, "The trade has its card");
  assert.match(text(card), /XAUUSD · Achat · publié il y a 2 h/);
  assert.match(text(card), /En cours/);
  const [ladder] = nodes(card, node => node.props.role === "img");
  assert.equal(ladder.props["aria-label"], "TP2 2 336, TP1 2 327, Entrée 2 318.50, Stop 2 310", "The highest price is at the top");
  const rungs = text(ladder);
  assert.match(rungs, /\+2,1 R/);
  assert.match(rungs, /\+1,0 R/);
  assert.match(rungs, /−1,0 R/);
  assert.match(text(card), /Ajoute ton compte de trading pour voir ton lot sur chaque signal\./, "Without an account, the lot asks for one");
  assert.equal(labelled(host, "1 trade en cours").props.className, "navBadge", "The bottom bar counts the trade");
  for (const label of ["Canal", "Journal", "Compte"]) {
    navButton(host, label).props.onClick(); await host.settle();
    assert.equal(banners(host).length, 1, label + " shows the trade in progress");
    assert.match(text(banners(host)[0]), /1 trade en cours/);
    assert.match(text(banners(host)[0]), /XAUUSD · Achat/);
  }
  banners(host)[0].props.onClick(); await host.settle();
  assert.equal(navButton(host, "Signaux").props["aria-current"], "page", "The banner leads back to the trade");
  assert.equal(banners(host).length, 0, "Signaux itself needs no banner");
});

test("a sell trade reads from the highest price down and counts its R on the sell side", async () => {
  const { host } = render({ posts: [nas] });
  await host.settle();
  const [card] = tradeCards(host);
  const [ladder] = nodes(card, node => node.props.role === "img");
  assert.equal(ladder.props["aria-label"], "Stop 18 510, Entrée 18 420, TP1 18 330");
  assert.match(text(ladder), /\+1,0 R/);
  assert.match(text(ladder), /−1,0 R/);
  assert.match(text(card), /Vente/);
});

test("Canal brings the feed and its chips together; chat, favourites and Telegram come from the portal", async () => {
  const { host, selected } = render({ posts: [xau, nas, analysis] });
  await host.settle();
  navButton(host, "Canal").props.onClick(); await host.settle();
  const [chips] = nodes(host.tree, node => node.props.role === "group" && node.props["aria-label"] === "Rubriques du canal");
  assert.equal(chips.props.children.map(text).join(" | "), "Tout | Signaux · 2 | Analyses | Discussion");
  const publications = () => nodes(host.tree, node => typeof node.props.id === "string" && node.props.id.startsWith("publication-")).map(node => node.props.id);
  assert.deepEqual(publications(), ["publication-nas", "publication-xau", "publication-plan"], "Newest first");
  assert.match(text(nodes(host.tree, node => node.props.id === "publication-xau")[0]), /XAUUSD · Achat à 2 318\.50/);
  button(host, "Signaux · 2").props.onClick(); await host.settle();
  assert.deepEqual(publications(), ["publication-nas", "publication-xau"], "Signaux shows only the signals");
  button(host, "Discussion").props.onClick(); await host.settle();
  assert.equal(nodes(host.tree, node => node.props["data-probe"] === "channel").length, 1, "The portal draws the chat");
  assert.deepEqual(publications(), []);
  labelled(host, "Mes favoris").props.onClick(); await host.settle();
  assert.deepEqual(selected, ["signal", "chat", "favorites"]);
});

test("a signal of the feed opens the thread of its trade on Signaux", async () => {
  const { host } = render({ posts: [xau] });
  await host.settle();
  navButton(host, "Canal").props.onClick(); await host.settle();
  button(host, "Le fil du trade ›").props.onClick(); await host.settle();
  assert.equal(navButton(host, "Signaux").props["aria-current"], "page");
  assert.match(text(host.tree), /Signal publié/);
});

test("the lot is calculated in the space from the member’s account and risk, with the simulator’s rules", async () => {
  const account = { id: 1, name: "Compte principal", platform: "MT5", broker: null, currency: "EUR", current_balance: 10470, connection_type: "automatic" };
  const { host } = render({ posts: [xau] }, { member: { accounts: [account], account, rates: { EUR: 1, USD: 1.08 }, risk: 1 } });
  await host.settle();
  const card = text(tradeCards(host)[0]);
  assert.match(card, /Ton lot0,13 lot/, "1 % of 10 470 € with a stop 8.5 dollars away is 0.13 lot");
  assert.match(card, /≈ 102\s€ de risque/);
  assert.match(card, /1 % · Compte principal/);
  assert.match(card, /Place l’ordre à 0,13 lot/);
  const index = render({ posts: [nas] }, { member: { accounts: [account], account, rates: { EUR: 1, USD: 1.08 }, risk: 0.5 } });
  await index.host.settle();
  assert.match(text(tradeCards(index.host)[0]), /Ton volume0,62 USD\/point/, "0.5 % of 10 470 € over a 90-point stop: 0.62 dollar per point, never broker lots");
});

test("Copier les niveaux gives the levels in the order MetaTrader asks for them", async () => {
  const { host } = render({ posts: [xau] });
  await host.settle();
  button(host, "Copier les niveaux").props.onClick(); await host.settle();
  const [toast] = nodes(host.tree, node => node.props.role === "status" && node.props.className === "toast");
  assert.match(text(toast), /XAUUSD BUY 2318\.5 SL 2310 TP1 2327 TP2 2336/);
});

test("Le fil du trade gathers the signal, the team’s updates and the member’s position, and asks to move a stop left behind", async () => {
  const update = post("fu", "followup", { symbol: "XAUUSD", title: "XAUUSD · TP1 touché", body: "Stop déplacé au point d’entrée (BE).", created_at: ago(3600000) });
  const account = { id: 1, name: "Compte principal", platform: "MT5", broker: null, currency: "EUR", current_balance: 10470, connection_type: "automatic" };
  const position = { id: "p1", symbol: "XAUUSD", direction: "buy", date: parisDate(Date.parse(xau.created_at)), entry: 2318.7, stop: 2310, accountId: 1 };
  const { host, selected } = render({ posts: [xau, update] }, { member: { accounts: [account], account, openTrades: [position] } });
  await host.settle();
  button(host, "Le fil du trade").props.onClick(); await host.settle();
  const copy = text(host.tree);
  assert.match(copy, /Ta position · détectée sur MetaTraderentrée 2 318\.70 · stop 2 310/);
  assert.match(copy, /Compte principal/);
  assert.match(copy, /Signal publié/);
  assert.match(copy, /Tu es en position/);
  // Inside the thread the instrument is the heading already: the update reads « TP1 touché ».
  assert.match(copy, /TP1 touchéStop déplacé au point d’entrée \(BE\)\./);
  assert.equal(copy.includes("XAUUSD · TP1 touché"), false);
  assert.match(copy, /Ton stop est encore à 2 310/);
  assert.match(copy, /Remonte-le à ton point d’entrée \(2 318\.70\) pour être sans risque\./);
  assert.match(copy, /Objectifs en attente/);
  button(host, "Discuter de ce trade").props.onClick(); await host.settle();
  assert.deepEqual(selected, ["chat"]);
  assert.equal(navButton(host, "Canal").props["aria-current"], "page");

  const moved = render({ posts: [xau, update] }, { member: { accounts: [account], account, openTrades: [{ ...position, stop: 2318.7 }] } });
  await moved.host.settle();
  button(moved.host, "Le fil du trade").props.onClick(); await moved.host.settle();
  assert.equal(text(moved.host.tree).includes("Ton stop est encore"), false, "A stop already at the entry needs no reminder");
});

/** The card of a publication in Canal, and its « Le fil du trade › » link when it has one. */
function card(host, postId) {
  const [found] = nodes(host.tree, node => node.props.id === `publication-${postId}`);
  assert.ok(found, "Expected the card of " + postId); return found;
}
const threadLink = (host, postId) => nodes(card(host, postId), node => node.type === "button" && text(node) === "Le fil du trade ›")[0];

test("a reply posted on Telegram stays in the thread of its own signal, even beside another trade of the same instrument", async () => {
  const older = post("xau-old", "signal", { ...xau, id: "xau-old", body: "Signal XAUUSD du matin", created_at: ago(5 * 3600000) });
  const reply = post("tp", "followup", { symbol: "XAUUSD", direction: "buy", title: "XAUUSD · TP1 touché", body: "TP1 TOUCHER ✅", thread_post_id: "xau-old", created_at: ago(3600000) });
  const { host } = render({ posts: [xau, older, reply] });
  await host.settle();
  assert.equal(text(nodes(host.tree, node => node.props.className === "bigTitle")[0]), "2 trades en cours");
  navButton(host, "Canal").props.onClick(); await host.settle();
  threadLink(host, "tp").props.onClick(); await host.settle();
  let copy = text(host.tree);
  assert.match(copy, /Signal XAUUSD du matin/);
  assert.match(copy, /TP1 touchéTP1 TOUCHER ✅/);
  // The newer XAUUSD trade, opened after it, does not borrow the update of the morning trade.
  navButton(host, "Canal").props.onClick(); await host.settle();
  threadLink(host, "xau").props.onClick(); await host.settle();
  copy = text(host.tree);
  assert.match(copy, /Signal XAUUSD/);
  assert.equal(copy.includes("TP1 TOUCHER"), false);
});

test("an order cancelled on Telegram is no longer a trade in progress, and its thread says so", async () => {
  const cancel = post("cancel", "followup", { symbol: "NAS100", direction: "sell", title: "NAS100 · Ordre annulé", body: "Ordre annulé", thread_post_id: "nas", created_at: ago(600000) });
  const { host } = render({ posts: [nas, cancel] });
  await host.settle();
  assert.equal(text(nodes(host.tree, node => node.props.className === "bigTitle")[0]), "Aucun trade en cours");
  assert.equal(nodes(host.tree, node => node.props.className === "navBadge").length, 0);
  navButton(host, "Canal").props.onClick(); await host.settle();
  assert.match(text(card(host, "nas")), /Annulé/);
  assert.equal(threadLink(host, "nas"), undefined, "Only a trade in progress offers its thread from the signal card");
  threadLink(host, "cancel").props.onClick(); await host.settle();
  const copy = text(host.tree);
  assert.match(copy, /^SignauxAnnulé/);
  assert.match(copy, /Ordre annuléOrdre annulé/);
  assert.equal(copy.includes("Objectifs en attente"), false);
});

/** "2026-10" moved by a number of months. */
function shiftMonth(key, offset) {
  const [year, monthNumber] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 15));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
const longMonth = key => new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`));
const capitalized = value => value.charAt(0).toUpperCase() + value.slice(1);

test("Historique mois par mois shows every month since the first trade with the Bilan figures, and lets the member go back", async () => {
  const before = shiftMonth(month, -2), last = shiftMonth(month, -1);
  const trades = [
    { id: 11, source: "telegram", trade_date: `${before}-10`, symbol: "XAUUSD", direction: "buy", status: "win", result_r: 1.5, pips: 0, target: 1 },
    { id: 12, source: "telegram", trade_date: `${last}-03`, symbol: "NAS100", direction: "sell", status: "loss", result_r: -1, pips: 0, target: null },
    { id: 13, source: "telegram", trade_date: `${last}-20`, symbol: "XAUUSD", direction: "buy", status: "win", result_r: 2.4, pips: 0, target: 2 },
    { id: 14, source: "telegram", trade_date: `${last}-21`, symbol: "EURUSD", direction: "buy", status: "breakeven", result_r: 0, pips: 0, target: null },
  ];
  const { host } = render({}, { trades });
  await host.settle();
  button(host, "Historique mois par mois ›").props.onClick(); await host.settle();
  const stats = () => nodes(host.tree, node => node.props.className === "stat").map(text);
  const bars = () => nodes(host.tree, node => node.type === "button" && (node.props.className === "historyMonth" || node.props.className === "historyMonthOn"));
  const title = () => text(nodes(host.tree, node => node.props.className === "historyTitle")[0]);
  const rows = () => nodes(host.tree, node => node.type === "li" && node.props.className === "row").map(row => text(row));

  assert.match(text(host.tree), new RegExp(`Performances.*Depuis ${longMonth(before)} · \\+2,9 R · 4 trades clôturés`));
  // Every month from the first trade to this one; the latest month with a closed trade opens first.
  assert.deepEqual(bars().map(bar => bar.props["aria-pressed"]).join(), "false,true,false");
  assert.equal(bars()[1].props["aria-label"], `${capitalized(longMonth(last))} · +1,4 R`);
  assert.equal(title(), capitalized(longMonth(last)));
  assert.equal(stats().join(" | "), "Résultat+1,4 R | Réussite50 % | Trades3");
  assert.match(text(host.tree), /1 gagnant · 1 stop · 1 BE/);
  assert.deepEqual(rows().map(row => row.split(" ")[0]).join(), "EURUSD,XAUUSD,NAS100");
  assert.match(rows()[1], /XAUUSD Achat · TP2.*\+2,4 R$/);
  assert.match(rows()[2], /NAS100 Vente · Stop.*−1,0 R$/);

  labelled(host, "Mois précédent").props.onClick(); await host.settle();
  assert.equal(title(), capitalized(longMonth(before)));
  assert.equal(stats().join(" | "), "Résultat+1,5 R | Réussite100 % | Trades1");
  assert.equal(labelled(host, "Mois précédent").props.disabled, true, "Nothing before the first month");

  bars()[2].props.onClick(); await host.settle();
  assert.equal(title(), capitalized(longMonth(month)));
  assert.equal(stats().join(" | "), "Résultat— | Réussite— | Trades0");
  assert.match(text(host.tree), /Aucun trade clôturé ce mois-ci\./);
  assert.equal(labelled(host, "Mois suivant").props.disabled, true, "Nothing after the current month");

  // The back button, not the bottom bar, returns to Signaux.
  nodes(host.tree, node => node.type === "button" && node.props.className === "back")[0].props.onClick(); await host.settle();
  assert.equal(text(nodes(host.tree, node => node.props.className === "bigTitle")[0]), "Aucun trade en cours");
});

test("the history says when the figures are loading or unavailable instead of showing empty months", async () => {
  const offline = render({}, { failPerformance: true });
  await offline.host.settle();
  button(offline.host, "Historique mois par mois ›").props.onClick(); await offline.host.settle();
  assert.match(text(offline.host.tree), /Performances indisponibles pour le moment\./);
  assert.equal(nodes(offline.host.tree, node => node.props.className === "historyTitle").length, 0);
});

test("a GOLD signal finds the member’s XAUUSD.r position: the names of an instrument are recognised as one", async () => {
  const gold = post("gold", "signal", { symbol: "GOLD", direction: "buy", body: "Direction : BUY", levels: { entry: 2318.5, stopLoss: 2310, takeProfit: 2327 }, created_at: ago(2 * 3600000) });
  const account = { id: 1, name: "Compte principal", platform: "MT5", broker: null, currency: "EUR", current_balance: 10470, connection_type: "automatic" };
  const position = { id: "p1", symbol: "XAUUSD.R", direction: "buy", date: parisDate(Date.parse(gold.created_at)), entry: 2318.7, stop: 2310, accountId: 1 };
  const { host } = render({ posts: [gold] }, { member: { accounts: [account], account, openTrades: [position] } });
  await host.settle();
  button(host, "Le fil du trade").props.onClick(); await host.settle();
  assert.match(text(host.tree), /Ta position · détectée sur MetaTraderentrée 2 318\.70 · stop 2 310/);
  // A sell position on the same instrument, or a buy on silver, is not this trade.
  for (const other of [{ ...position, direction: "sell" }, { ...position, symbol: "XAGUSD" }]) {
    const view = render({ posts: [gold] }, { member: { accounts: [account], account, openTrades: [other] } });
    await view.host.settle();
    button(view.host, "Le fil du trade").props.onClick(); await view.host.settle();
    assert.equal(text(view.host.tree).includes("Ta position"), false);
  }
});

test("a limit or stop order is named with its side, so nobody enters at market by mistake", async () => {
  const btc = post("btc", "signal", { symbol: "BTCUSD", direction: "buy", body: "🟡 Actif : BTCUSD\n📈 Direction : BUY LIMIT\n📍 Entrée : 75231 – 75056\n🛑 Stop Loss : 74760\n🎯 TP1 : 75744", levels: { entry: 75143.5, stopLoss: 74760, takeProfit: 75744 }, created_at: ago(3600000) });
  const { host } = render({ posts: [btc] });
  await host.settle();
  assert.match(text(host.tree), /BTCUSD · Achat limite/);
  button(host, "Le fil du trade").props.onClick(); await host.settle();
  assert.equal(text(nodes(host.tree, node => node.props.className === "pageTitle")[0]), "BTCUSD · Achat limite");

  // A quantity of crypto reads with four significant digits, rounded down.
  const account = { id: 1, name: "Compte crypto", platform: "MT5", broker: null, currency: "USD", current_balance: 10000, connection_type: "automatic" };
  const sized = render({ posts: [btc] }, { member: { accounts: [account], account } });
  await sized.host.settle();
  assert.match(text(sized.host.tree), /0,2607 BTC/);
  assert.equal(text(sized.host.tree).includes("0,26075"), false);
});

test("the Journal counts a member’s XAUUSD trade as following the team’s GOLD signal", async () => {
  const host = hookHost();
  const gold = post("gold", "signal", { symbol: "GOLD", direction: "buy", body: "Direction : BUY", created_at: ago(2 * 3600000) });
  const day = parisDate(Date.parse(gold.created_at));
  const rows = [
    { id: 1, trade_date: day, symbol: "XAUUSD", direction: "buy", status: "win", result_r: 1.5 },
    { id: 2, trade_date: day, symbol: "EURUSD", direction: "sell", status: "loss", result_r: -1 },
  ];
  const Journal = compile("components/vip/VipJournal.tsx", {
    react: host.hooks, "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: fragment },
    "lucide-react": new Proxy({}, { get: () => icon }),
    "@/components/i18n/LocaleProvider": { useLocale: () => ({ t: identity, locale: "fr" }) },
    "@/lib/supabase/client": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) },
    "@/lib/metasync/loadJournal": { loadJournal: async () => ({ data: rows, error: null }) },
    "@/lib/vip/publication-notice": publicationNotice,
    "@/lib/vip/signal-risk-preset": riskPreset,
    "./VipEspace.module.css": css,
  }).default;
  host.start(Journal, { banner: null, posts: [gold], signalsMonthR: 2, onOpenCompte() {} });
  await host.settle();
  const trades = nodes(host.tree, node => node.type === "li" && node.props.className === "row").map(text);
  assert.ok(trades.some(row => /^XAUUSD Achat · signal suivi/.test(row)), trades.join(" | "));
  assert.ok(trades.some(row => /^EURUSD Vente · perso/.test(row)), trades.join(" | "));
  assert.ok(nodes(host.tree, node => node.props.className === "stat").map(text).includes("Suivis1 / 1"));
});

test("each class of the space is styled in a single rule, so one view cannot restyle another by reusing a name", () => {
  const styles = fs.readFileSync(path.join(root, "components/vip/VipEspace.module.css"), "utf8");
  const names = [...styles.matchAll(/^\.([A-Za-z]+) \{/gm)].map(match => match[1]);
  const repeated = names.filter((name, index) => names.indexOf(name) !== index);
  assert.deepEqual(repeated, []);
});

test("a member who was in a channel when the space reloads finds Canal again", async () => {
  const { host } = render({ view: "chat" });
  await host.settle();
  assert.equal(navButton(host, "Canal").props["aria-current"], "page");
  assert.equal(nodes(host.tree, node => node.props["data-probe"] === "channel").length, 1);
});

test("the month comes from the public figures of the Bilan logic, in the loss colour when it is negative", async () => {
  const stats = host => nodes(host.tree, node => node.props.className === "stat");
  const positive = render({}, { trades: [win, loss] });
  await positive.host.settle();
  assert.deepEqual(stats(positive.host).map(text), ["Ce mois+1,0 R", "Réussite50 %", "Signaux0"]);
  const negative = render({}, { trades: [loss] });
  await negative.host.settle();
  const [figure] = stats(negative.host);
  assert.match(text(figure), /−1,0 R/);
  assert.equal(nodes(figure, node => node.type === "b")[0].props.className, "loss");
});

test("when public performance cannot load, the figures say so instead of showing zeros", async () => {
  const { host } = render({ posts: [xau] }, { failPerformance: true });
  await host.settle();
  const copy = text(host.tree);
  assert.equal(copy.split("Performances indisponibles pour le moment.").length - 1, 1);
  assert.equal(copy.includes("+0,0 R"), false);
});

test("alerts are offered from Signaux only when the phone can receive them", async () => {
  const calls = [];
  const available = render({ alertsAvailable: true, onEnableAlerts: () => calls.push("alerts") });
  await available.host.settle();
  labelled(available.host, "Activer les alertes").props.onClick();
  assert.deepEqual(calls, ["alerts"]);
  const on = render({ alertsOn: true, alertsAvailable: true });
  await on.host.settle();
  assert.match(text(on.host.tree), /Alertes activées sur ce téléphone\./);
  assert.equal(nodes(on.host.tree, node => node.props["aria-label"] === "Activer les alertes").length, 0);
  const none = render();
  await none.host.settle();
  assert.equal(nodes(none.host.tree, node => node.props["aria-label"] === "Activer les alertes").length, 0);
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

test("Journal and Compte live inside the space and get what they need from it", async () => {
  const tools = element("details", { "data-probe": "account", children: "Application et aide" });
  const language = element("select", { "aria-label": "Langue" });
  const { host, seen, selected } = render({ posts: [xau], accountTools: tools, languageControl: language }, { trades: [win, loss] });
  await host.settle();
  navButton(host, "Journal").props.onClick(); await host.settle();
  assert.equal(nodes(host.tree, node => node.props["data-probe"] === "journal").length, 1);
  assert.deepEqual(seen.journal.posts.map(item => item.id), ["xau"]);
  assert.equal(seen.journal.signalsMonthR, 1, "The journal compares with the month of the signals");
  seen.journal.onOpenCompte(); await host.settle();
  assert.equal(navButton(host, "Compte").props["aria-current"], "page");
  assert.equal(seen.compte.membership, member);
  assert.equal(seen.compte.member.risk, 1, "Compte sets the risk the lot is calculated with");
  assert.equal(seen.compte.accountTools, tools);
  assert.equal(seen.compte.languageControl, language);
  seen.compte.onTelegram(); await host.settle();
  assert.deepEqual(selected, ["telegram"]);
  assert.equal(navButton(host, "Canal").props["aria-current"], "page");
  assert.equal(nodes(host.tree, node => node.props["data-probe"] === "channel").length, 1, "The portal draws Telegram");
});

test("a signal stays open for two weeks unless a trade of its instrument and side closes it", async () => {
  const closedAt = ago(2 * DAY);
  const closedSignal = post("closed", "signal", { symbol: "GBPJPY", direction: "buy", body: "Signal GBPJPY", levels: { entry: 1.9 }, created_at: closedAt });
  const closure = { ...win, id: 9, symbol: "GBPJPY", direction: "buy", trade_date: parisDate(Date.parse(closedAt)), status: "loss", result_r: -1, target: null };
  const stale = post("stale", "signal", { symbol: "NAS100", direction: "sell", body: "Signal ancien", levels: {}, created_at: ago(15 * DAY) });
  const { host } = render({ posts: [xau, closedSignal, stale] }, { trades: [closure] });
  await host.settle();
  const open = tradeCards(host).map(text).join(" | ");
  assert.match(open, /XAUUSD/);
  assert.equal(open.includes("GBPJPY"), false, "A signal closed by a trade is not in progress");
  assert.equal(open.includes("NAS100"), false, "A signal older than two weeks is not in progress");
  assert.equal(text(nodes(host.tree, node => node.type === "h1")[0]), "Trade en cours");
  assert.match(text(nodes(host.tree, node => node.props["aria-labelledby"] === "vip-closed")[0]), /GBPJPY/, "The closed trade is in the closed list");
});

test("a trade closes a signal only with the same instrument and side, on the same day or the day after", async () => {
  const signalAt = ago(3 * 3600000);
  const sell = post("sell", "signal", { symbol: "NAS100", direction: "sell", body: "Signal NAS100", levels: {}, created_at: signalAt });
  const otherSide = { ...win, id: 10, symbol: "NAS100", direction: "buy", trade_date: parisDate(Date.parse(signalAt)), status: "win", result_r: 1, target: 1 };
  const threeDaysBefore = { ...win, id: 11, symbol: "NAS100", direction: "sell", trade_date: parisDate(Date.parse(signalAt) - 3 * DAY), status: "loss", result_r: -1, target: null };
  const stillOpen = render({ posts: [sell] }, { trades: [otherSide, threeDaysBefore] });
  await stillOpen.host.settle();
  assert.match(tradeCards(stillOpen.host).map(text).join(" "), /NAS100/, "A trade of the other side, or three days away, does not close it");
  const dayAfter = { ...win, id: 12, symbol: "NAS100", direction: "sell", trade_date: parisDate(Date.parse(signalAt) + DAY), status: "win", result_r: 1, target: 1 };
  const closed = render({ posts: [sell] }, { trades: [dayAfter] });
  await closed.host.settle();
  assert.equal(tradeCards(closed.host).length, 0, "A trade of the same side the day after closes it");
});

test("the TP3 and the team’s note come from the signal text, without its template lines", async () => {
  const update = post("update", "signal", { symbol: "XAUUSD", direction: "buy", body: "Entrée : 2 318\nTP3 : 2 350\nMise à jour 11:05 · TP1 touché, stop déplacé au point d’entrée (BE).", levels: { entry: 2318, stopLoss: 2310, takeProfit: 2327 }, created_at: ago(3600000) });
  const closure = { ...win, id: 9, symbol: "XAUUSD", direction: "buy", trade_date: parisDate(Date.parse(update.created_at)), status: "win", result_r: 1, target: 1 };
  const template = post("template", "signal", { symbol: "NAS100", direction: "sell", body: "TP3 : 18 120", levels: { entry: 18420, stopLoss: 18510, takeProfit: 18330 }, created_at: ago(1800000) });
  const { host } = render({ posts: [update, template] }, { trades: [closure] });
  await host.settle();
  navButton(host, "Canal").props.onClick(); await host.settle();
  const copy = text(host.tree);
  assert.match(copy, /Mise à jour 11:05 · TP1 touché, stop déplacé au point d’entrée \(BE\)\./);
  assert.equal(copy.includes("Entrée : 2 318"), false, "A template line is not repeated as a note");
  assert.equal(copy.includes("TP3 : 18 120"), false, "A template line is not repeated as a note");
  assert.match(copy, /TP3 18 120/, "The third target is one of the levels");
  const card = text(nodes(host.tree, node => node.props.id === "publication-update")[0]);
  assert.match(card, /TP1/, "A closed signal shows its outcome");
  assert.equal(card.includes("En cours"), false);
});
