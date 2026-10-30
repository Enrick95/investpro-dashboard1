import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const compile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const componentSource = compile("components/journal/WithdrawalsSection.tsx");
const helperSource = compile("lib/journal-withdrawals.ts");
const currencySource = compile("lib/currency.ts");
const jsx = (type, props) => ({ type, props });
const initialTime = Date.parse("2026-10-30T12:00:00Z");
const account = (id, currency = "USD") => ({ id, name: `Compte ${id}`, currency });
const snapshot = (id, amount, currency = "USD", extra = {}) => ({
  active: true, status: "syncing", funding_summary: amount === null ? null : { outflows: amount },
  investpro_mt_connections: { account_id: id, currency, observed_at: new Date(initialTime).toISOString(), last_sync: new Date(initialTime).toISOString() },
  ...extra,
});
const reply = (connections = [], status = 200, extra = {}) => ({
  ok: status >= 200 && status < 300, status, json: async () => ({ enabled: true, connections, ...extra }),
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function harness({ accounts = [account(1)], responses = [], rates = null, displayCurrency = "EUR" } = {}) {
  const states = [];
  const effects = [];
  const cleanups = [];
  const calls = [];
  const events = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  let cursor = 0;
  let now = initialTime;
  let nextTimer = 0;
  const fakeDocument = { visibilityState: "visible", addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  const fakeWindow = {
    setTimeout: fn => { const id = ++nextTimer; timeouts.set(id, fn); return id; },
    clearTimeout: id => timeouts.delete(id),
    setInterval: (fn, ms) => { const id = ++nextTimer; intervals.set(id, { fn, ms }); return id; },
    clearInterval: id => intervals.delete(id),
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useEffect: fn => { effects.push(fn); },
  };
  class Clock extends Date { static now() { return now; } }
  const evaluate = (source, require) => {
    const loaded = { exports: {} };
    vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require, Date: Clock, AbortController, window: fakeWindow, document: fakeDocument,
      fetch: async (...args) => {
        calls.push(args);
        const response = responses.shift();
        if (response instanceof Error) throw response;
        if (!response) throw new Error("No queued response");
        return response;
      },
    });
    return loaded.exports;
  };
  const helper = evaluate(helperSource, () => ({}));
  const currency = evaluate(currencySource, () => react);
  const component = evaluate(componentSource, name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "lucide-react") return new Proxy({}, { get: (_, key) => String(key) });
    if (name === "@/components/i18n/LocaleProvider") return { useLocale: () => ({ t: text => text, locale: "fr" }) };
    if (name === "@/lib/journal-withdrawals") return helper;
    if (name === "@/lib/currency") return { ...currency, useDisplayCurrency: () => ({ displayCurrency }), useCurrencyRates: () => ({ rates, rateDate: null }) };
    throw new Error(`Unexpected module ${name}`);
  });
  function render() {
    cursor = 0;
    effects.length = 0;
    const wrapper = component.default({ accounts });
    return wrapper.type(wrapper.props);
  }
  return {
    calls, responses, intervals, events, document: fakeDocument,
    render,
    mount() { render(); effects.forEach(fn => cleanups.push(fn())); },
    unmount() { cleanups.splice(0).forEach(fn => fn?.()); },
    setTime(value) { now = value; },
    refresh() { nodes(render(), node => node.type === "button")[0].props.onClick(); },
    async settle() { for (let index = 0; index < 8; index++) await Promise.resolve(); return render(); },
  };
}

function nodes(tree, matches) {
  if (tree === null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, matches));
  return [...(matches(tree) ? [tree] : []), ...nodes(tree.props?.children, matches)];
}
function text(tree) {
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return text(tree.props?.children);
}
const compactText = tree => text(tree).replaceAll(/\s+/g, " ");

test("real zero is displayed, while missing funding data never becomes zero", async () => {
  for (const [amount, expected] of [[0, "0,00"], [null, "Aucune donnée de retrait disponible"]]) {
    const h = harness({ responses: [reply([snapshot(1, amount)])], displayCurrency: "USD" });
    assert.match(text(h.render()), /Chargement des retraits/);
    h.mount();
    const tree = await h.settle();
    assert.match(text(tree), new RegExp(expected));
    if (amount === null) assert.doesNotMatch(text(tree), /0,00/);
    else assert.match(text(tree), /Aucune sortie de fonds détectée/);
    h.unmount();
  }
});

test("mixed currencies retain native subtotals and visibly disclose missing accounts", async () => {
  const h = harness({ accounts: [account(1, "EUR"), account(2), account(3)], responses: [reply([snapshot(1, 917, "EUR"), snapshot(2, 4592.88)])] });
  h.mount();
  const value = compactText(await h.settle());
  assert.match(value, /917,00/);
  assert.match(value, /4 592,88/);
  assert.match(value, /4 592,88[^·]*\(partiel\)/);
  assert.match(value, /Total partiel/);
  assert.match(value, /Conversion indisponible/);
  assert.doesNotMatch(value, /5 509,88/);
  assert.match(value, /ne modifient pas le P&L des trades/);
  h.unmount();
});

test("indicative conversion keeps its original amounts visible and account filtering recomputes totals", async () => {
  const h = harness({ accounts: [account(1, "EUR"), account(2)], responses: [reply([snapshot(1, 10, "EUR"), snapshot(2, 20)])], rates: { EUR: 1, USD: 2, CHF: 1 }, displayCurrency: "EUR" });
  h.mount();
  let tree = await h.settle();
  assert.match(text(tree), /≈ .*20,00/);
  assert.match(text(tree), /10,00/);
  assert.match(text(tree), /Conversion indicative des retraits/);
  const filter = nodes(tree, node => node.type === "select")[0];
  filter.props.onChange({ target: { value: "2" } });
  tree = h.render();
  assert.equal(nodes(tree, node => node.type === "li").length, 1);
  assert.match(text(tree), /≈ .*10,00/);
  h.unmount();
});

test("failed refresh keeps last successful amounts and marks old snapshots honestly", async () => {
  const h = harness({ responses: [reply([snapshot(1, 125)]), reply([], 503)], displayCurrency: "USD" });
  h.mount();
  await h.settle();
  h.setTime(initialTime + 240_000);
  h.refresh();
  const value = text(await h.settle());
  assert.match(value, /125,00/);
  assert.match(value, /Impossible d’actualiser les retraits/);
  assert.match(value, /dernières données chargées restent affichées/);
  assert.match(value, /dernière synchronisation disponible/);
  assert.match(value, /Dernier montant connu/);
  h.unmount();
});

test("session loss clears prior private amounts for disabled, unauthorized and forbidden responses", async () => {
  for (const failure of [reply([], 200, { enabled: false }), reply([], 401), reply([], 403)]) {
    const h = harness({ responses: [reply([snapshot(1, 345)]), failure], displayCurrency: "USD" });
    h.mount();
    await h.settle();
    h.refresh();
    const value = text(await h.settle());
    assert.doesNotMatch(value, /345,00/);
    assert.match(value, /Impossible de charger les retraits/);
    assert.doesNotMatch(value, /dernières données chargées restent affichées/);
    h.unmount();
  }
});

test("a late response from an aborted effect cannot overwrite the newer snapshot", async () => {
  const older = deferred();
  const newer = deferred();
  const h = harness({ responses: [older.promise, newer.promise], displayCurrency: "USD" });
  h.mount();
  h.unmount();
  assert.equal(h.calls[0][1].signal.aborted, true);
  h.mount();
  newer.resolve(reply([snapshot(1, 222)]));
  await h.settle();
  older.resolve(reply([snapshot(1, 111)]));
  const value = text(await h.settle());
  assert.match(value, /222,00/);
  assert.doesNotMatch(value, /111,00/);
  h.unmount();
});

test("polling pauses while hidden, refreshes when visible and cleans up subscriptions", async () => {
  const h = harness({ responses: [reply([snapshot(1, 10)]), reply([snapshot(1, 11)])] });
  h.mount();
  await h.settle();
  const timer = [...h.intervals.values()][0];
  assert.equal(timer.ms, 30000);
  h.document.visibilityState = "hidden";
  timer.fn();
  assert.equal(h.calls.length, 1);
  h.document.visibilityState = "visible";
  h.events.get("visibilitychange")();
  await h.settle();
  assert.equal(h.calls.length, 2);
  h.unmount();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.events.size, 0);
});

test("an initial source failure shows an error without zero or invented withdrawal rows", async () => {
  const h = harness({ responses: [new Error("network unavailable")] });
  h.mount();
  const tree = await h.settle();
  assert.match(text(tree), /Impossible de charger les retraits/);
  assert.doesNotMatch(text(tree), /0,00/);
  assert.equal(nodes(tree, node => node.type === "li").length, 0);
  h.unmount();
});
