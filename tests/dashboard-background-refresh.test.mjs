import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const userId = "743319c5-d9c1-4d2a-bd57-fd11f833ca01";

function compile(file, modules = {}, globals = {}) {
  const cjs = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(output, {
    module: cjs, exports: cjs.exports, URL, Intl, console: { error() {} },
    fetch() { throw new Error("NETWORK_FORBIDDEN_IN_REFRESH_TEST"); },
    require(name) {
      assert(Object.hasOwn(modules, name), `Unexpected import ${name}`);
      return modules[name];
    },
    ...globals,
  });
  return cjs.exports;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const flush = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };
const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const jsx = (type, props, key) => ({ type, props: props || {}, key });

function nodes(tree, predicate) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return text(tree.props?.children);
}

const screens = [
  { name: "dashboard", file: "app/dashboard/page.tsx", loading: "Chargement de ton espace InvestPro", heading: "Vue d’ensemble", metric: "P&L du mois" },
  { name: "reports", file: "app/dashboard/rapports/page.tsx", loading: "Chargement des rapports", heading: "Rapports & Analytics", metric: "P&L net" },
  { name: "insights", file: "components/intelligence/SmartDashboardInsights.tsx", heading: "Ce qu’InvestPro détecte dans ton trading", metric: "P&L aujourd’hui" },
];

// Run the application's compiled components and effects. Only browser timing,
// React's hook storage, authentication and transport are replaced; the polling
// effect, render branches, calculations and account scoping remain real code.
function fixture(screen) {
  const slots = [];
  const pendingEffects = [];
  const timers = new Map();
  const listeners = new Map();
  const stateWritesAfterUnmount = [];
  const calls = [];
  let cursor = 0;
  let mounted = true;
  let nextTimerId = 0;
  let nextAuthGate = null;
  let nextQueryGate = null;
  let authCalls = 0;
  let authFailure = false;
  const date = new Date().toISOString();
  const account = { id: 1, user_id: userId, name: "Compte de test", broker: "Fixture", account_type: "real", platform: "MT5", currency: "USD", initial_balance: 1000, current_balance: 1123, connection_type: "automatic" };
  const trade = { id: 1, user_id: userId, account_id: 1, trade_date: date, symbol: "XAUUSD", direction: "buy", risk_percent: 1, entry_price: 2000, stop_loss: 1990, take_profit: 2020, result_amount: 123, result_r: 2, status: "win", setup: "Retest", session: "london", timeframe: "M15", notes: null, screenshot_url: null };
  const rows = {
    profiles: [{ id: userId, username: "Trader de test", plan: "pro", xp: 10 }],
    trading_accounts: [account],
    trading_journal: [trade],
    trading_plans: [{ user_id: userId, max_risk_percent: 1, max_trades_per_day: 2, minimum_rr: 1, weekly_goal: null, allowed_sessions: ["london"], allowed_assets: ["XAUUSD"], allowed_setups: [] }],
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!Object.hasOwn(slots, index)) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next) => {
        if (!mounted) stateWritesAfterUnmount.push(index);
        slots[index].value = typeof next === "function" ? next(slots[index].value) : next;
      }];
    },
    useMemo(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { value: callback(), deps };
      return slots[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps, cleanup: previous?.cleanup };
        pendingEffects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  const db = {
    auth: { async getUser() {
      authCalls++;
      const gate = nextAuthGate;
      nextAuthGate = null;
      if (gate) await gate.promise;
      if (authFailure) throw new TypeError("OFFLINE_FIXTURE");
      return { data: { user: { id: userId, email: "test@example.test", user_metadata: {} } }, error: null };
    } },
    from(table) {
      assert(Object.hasOwn(rows, table), `Unexpected table ${table}`);
      const call = { table, filters: [] };
      calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        gte() { return query; },
        order() { return query; },
        single() { call.single = true; return query; },
        maybeSingle() { call.single = true; return query; },
        then(resolve, reject) {
          const gate = nextQueryGate;
          nextQueryGate = null;
          return Promise.resolve().then(async () => {
            if (gate) await gate.promise;
            const selected = rows[table].filter((row) => call.filters.every(([key, value]) => row[key] === value));
            return { data: structuredClone(call.single ? selected[0] ?? null : selected), error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const document = {
    visibilityState: "visible",
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
  };
  const window = {
    location: { href: "https://investprotrading.fr/dashboard", origin: "https://investprotrading.fr" },
    setInterval(callback, ms) { assert.equal(ms, 30000); const id = ++nextTimerId; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); },
  };
  const icons = new Proxy({}, { get: () => () => null });
  const currency = {
    useCurrencyRates: () => ({ rates: { EUR: 1, USD: 1, CHF: 1 }, rateDate: "2026-10-18", rateLoading: false }),
    useDisplayCurrency: () => ({ displayCurrency: "USD" }),
    convertCurrency: (amount) => amount,
    formatDisplayCurrency: (amount) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }).format(amount),
    rateDateLabel: () => "Taux de test",
  };
  const page = compile(screen.file, {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next/link": { default: "a" },
    "framer-motion": { motion: new Proxy({}, { get: (_, name) => `motion.${String(name)}` }), useReducedMotion: () => true },
    "lucide-react": icons,
    "@/components/i18n/LocaleProvider": { useLocale: () => ({ t: (value) => value, locale: "fr" }) },
    "@/lib/supabase/client": { createClient: () => db },
    "@/lib/trading/activeScope": compile("lib/trading/activeScope.ts"),
    "@/lib/trading-plan-assets": compile("lib/trading-plan-assets.ts"),
    "@/components/currency/DisplayCurrencySelect": { default: () => null },
    "@/lib/currency": currency,
  }, {
    window, document,
    fetch: async () => ({ json: async () => ({ ok: false }) }),
  });
  const render = () => { cursor = 0; return page.default(); };
  return {
    render, calls, stateWritesAfterUnmount,
    get authCalls() { return authCalls; },
    get timerCount() { return timers.size; },
    get listenerCount() { return [...listeners.values()].reduce((sum, group) => sum + group.size, 0); },
    metric(tree = render()) { const node = nodes(tree, (item) => item.props?.label === screen.metric)[0]; assert(node, `Missing ${screen.metric}`); return String(node.props.value); },
    async mount() { const initial = render(); for (const effect of pendingEffects.splice(0)) effect(); await flush(); return { initial, loaded: render() }; },
    holdNextRefresh() { const gate = deferred(); nextAuthGate = gate; return gate; },
    holdNextQuery() { const gate = deferred(); nextQueryGate = gate; return gate; },
    poll() { for (const callback of [...timers.values()]) callback(); },
    visibility(value) { document.visibilityState = value; for (const callback of [...listeners.get("visibilitychange") || []]) callback(); },
    update(amount) { rows.trading_journal[0].result_amount = amount; rows.trading_accounts[0].current_balance = 1000 + amount; },
    offline(value) { authFailure = value; },
    unmount() { mounted = false; for (const slot of slots) slot?.cleanup?.(); },
  };
}

for (const screen of screens) {
  test(`${screen.name}: scheduled refresh retains rendered content and applies new data without the initial loader`, async () => {
    const app = fixture(screen);
    const { initial, loaded } = await app.mount();
    if (screen.loading) assert.match(text(initial), new RegExp(screen.loading));
    else assert.equal(initial, null);
    assert.match(text(loaded), new RegExp(screen.heading));
    assert.match(app.metric(), /123/);
    const rootType = loaded.type;
    const gate = app.holdNextRefresh();
    app.poll();
    await flush();
    const pending = app.render();
    assert.equal(pending?.type, rootType, "The content root must remain mounted while fetching");
    assert.match(text(pending), new RegExp(screen.heading));
    if (screen.loading) assert.doesNotMatch(text(pending), new RegExp(screen.loading));
    assert.match(app.metric(pending), /123/, "Last successful values remain visible");
    app.update(456);
    gate.resolve();
    await flush();
    assert.match(app.metric(), /456/, "Background results still refresh the displayed statistics");
    app.unmount();
  });

  test(`${screen.name}: hidden tabs skip polling, resume once visible, and coalesce concurrent triggers`, async () => {
    const app = fixture(screen);
    await app.mount();
    const calls = app.authCalls;
    app.visibility("hidden");
    app.poll(); app.poll();
    await flush();
    assert.equal(app.authCalls, calls);
    const gate = app.holdNextRefresh();
    app.visibility("visible");
    app.poll(); app.visibility("visible"); app.poll();
    await flush();
    assert.equal(app.authCalls, calls + 1, "There must be only one request in flight");
    assert.match(app.metric(), /123/);
    gate.resolve();
    await flush();
    app.poll();
    await flush();
    assert.equal(app.authCalls, calls + 2, "Polling recovers after the pending request finishes");
    app.unmount();
  });

  test(`${screen.name}: a background network failure preserves the last successful screen and next poll recovers`, async () => {
    const app = fixture(screen);
    await app.mount();
    app.offline(true);
    app.poll();
    await flush();
    assert.match(text(app.render()), new RegExp(screen.heading));
    assert.match(app.metric(), /123/);
    app.offline(false);
    app.update(456);
    app.poll();
    await flush();
    assert.match(app.metric(), /456/);
    app.unmount();
  });

  test(`${screen.name}: unmount removes polling/listeners and late refresh completion cannot update state`, async () => {
    const app = fixture(screen);
    await app.mount();
    const gate = app.holdNextRefresh();
    app.poll();
    await flush();
    app.unmount();
    assert.equal(app.timerCount, 0);
    assert.equal(app.listenerCount, 0);
    gate.resolve();
    await flush();
    assert.deepEqual(app.stateWritesAfterUnmount, []);
  });

  test(`${screen.name}: a late database response after unmount cannot replace the previous snapshot`, async () => {
    const app = fixture(screen);
    await app.mount();
    const gate = app.holdNextQuery();
    app.poll();
    await flush();
    assert.match(app.metric(), /123/);
    app.update(456);
    app.unmount();
    gate.resolve();
    await flush();
    assert.deepEqual(app.stateWritesAfterUnmount, []);
  });
}

test("reports: account, period, search, and calendar month survive background refresh", async () => {
  const app = fixture(screens[1]);
  await app.mount();
  let tree = app.render();
  const select = nodes(tree, (node) => node.type === "select")[0];
  select.props.onChange({ target: { value: "1" } });
  const input = nodes(tree, (node) => node.type === "input")[0];
  input.props.onChange({ target: { value: "XAUUSD" } });
  const periodButton = nodes(tree, (node) => node.type === "button" && text(node) === "Tout")[0];
  periodButton.props.onClick();
  tree = app.render();
  const calendarLabel = (view) => text(nodes(view, (node) => node.type === "div" && node.props.className?.includes("min-w-[145px]"))[0]);
  const originalMonth = calendarLabel(tree);
  const previousMonth = nodes(tree, (node) => node.type === "button" && node.props.className === "calBtn")[0];
  previousMonth.props.onClick();
  tree = app.render();
  const chosenMonth = calendarLabel(tree);
  assert.notEqual(chosenMonth, originalMonth, "The user has chosen another calendar month");
  const gate = app.holdNextRefresh();
  app.poll();
  await flush();
  tree = app.render();
  assert.equal(nodes(tree, (node) => node.type === "select")[0].props.value, 1);
  assert.equal(nodes(tree, (node) => node.type === "input")[0].props.value, "XAUUSD");
  assert.match(nodes(tree, (node) => node.type === "button" && text(node) === "Tout")[0].props.className, /gold-soft/);
  assert.equal(calendarLabel(tree), chosenMonth);
  gate.resolve();
  await flush();
  tree = app.render();
  assert.equal(nodes(tree, (node) => node.type === "select")[0].props.value, 1);
  assert.equal(nodes(tree, (node) => node.type === "input")[0].props.value, "XAUUSD");
  assert.equal(calendarLabel(tree), chosenMonth);
  app.unmount();
});
