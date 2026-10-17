import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const userId = "743319c5-d9c1-4d2a-bd57-fd11f833ca01";
const otherId = "743319c5-d9c1-4d2a-bd57-fd11f833ca02";
const fxRates = { EUR: 1, USD: 1.2, CHF: 0.9 };

function compile(file, modules = {}, globals = {}) {
  const cjsModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(output, {
    module: cjsModule,
    exports: cjsModule.exports,
    console: { error() {} },
    structuredClone,
    fetch() { throw new Error("NETWORK_FORBIDDEN_IN_PLAN_TEST"); },
    require(name) {
      assert(Object.hasOwn(modules, name), `Unexpected import ${name}`);
      return modules[name];
    },
    ...globals,
  });
  return cjsModule.exports;
}

const trade = (id, accountId, amount, extra = {}) => ({
  id, user_id: userId, account_id: accountId, trade_date: "2026-10-17T10:00:00Z",
  symbol: "XAUUSD", direction: "buy", risk_percent: 1, entry_price: 2000,
  stop_loss: 1990, take_profit: 2020, result_amount: amount, result_r: 2,
  status: "win", setup: null, session: "London", ...extra,
});

function fixture({ accounts = [], trades = [], errors = {}, displayCurrency = "EUR", rates = fxRates, rateLoading = false, locale = "fr" } = {}) {
  const calls = [];
  const state = [];
  const effects = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!Object.hasOwn(state, index)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
    },
    useMemo(callback) { cursor++; return callback(); },
    useEffect(callback) {
      const index = cursor++;
      if (!Object.hasOwn(state, index)) { state[index] = true; effects.push(callback); }
    },
  };
  const plan = {
    user_id: userId, max_risk_percent: 1, max_trades_per_day: 2, minimum_rr: 1,
    allowed_sessions: ["London"], allowed_assets: ["XAUUSD"], allowed_setups: [],
  };
  const rowsByTable = { trading_accounts: accounts, trading_journal: trades, trading_plans: [plan], trade_checklists: [] };
  const db = {
    auth: { async getUser() { return { data: { user: { id: userId } }, error: null }; } },
    from(table) {
      assert(Object.hasOwn(rowsByTable, table), `Unexpected table ${table}`);
      const call = { table, filters: [] };
      calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        order() { return query; },
        limit(value) { call.limit = value; return query; },
        maybeSingle() { call.single = true; return query; },
        upsert(payload) { call.write = payload; return Promise.resolve({ error: null }); },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            assert(call.filters.some(([key, value]) => key === "user_id" && value === userId), "Every read must be scoped to the signed-in user");
            if (errors[table]) return { data: null, error: { message: "PRIVATE_PLAN_ERROR_FIXTURE" } };
            let rows = rowsByTable[table].filter((row) => call.filters.every(([key, value]) => row[key] === value));
            if (call.limit) rows = rows.slice(0, call.limit);
            if (call.columns !== "*") {
              // Respect the actual projection: removing account_id must break the currency regression test.
              const columns = call.columns.split(",").map((column) => column.trim()).filter(Boolean);
              rows = rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
            }
            return { data: call.single ? rows[0] ?? null : rows, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const assets = compile("lib/trading-plan-assets.ts");
  const icons = new Proxy({}, { get: () => () => null });
  const i18n = { useLocale: () => ({ t: (value) => value, locale }) };
  // Exercise the application's real conversion and formatting functions, while
  // keeping reference rates and the display preference deterministic/offline.
  const currency = {
    ...compile("lib/currency.ts", { react }),
    useDisplayCurrency: () => ({
      displayCurrency,
      setDisplayCurrency(next) { displayCurrency = next; },
    }),
    useCurrencyRates: () => ({ rates, rateDate: "2026-10-16", rateLoading }),
  };
  const selector = compile("components/currency/DisplayCurrencySelect.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "lucide-react": icons,
    "@/components/i18n/LocaleProvider": i18n,
    "@/lib/currency": currency,
    "./DisplayCurrencySelect.module.css": { default: {} },
  });
  const page = compile("app/dashboard/plan/page.tsx", {
    "react": react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next/link": { default: (props) => jsx("a", props) },
    "lucide-react": icons,
    "@/components/i18n/LocaleProvider": i18n,
    "@/components/currency/DisplayCurrencySelect": selector,
    "@/lib/currency": currency,
    "@/lib/supabase/client": { createClient: () => db },
    "@/lib/trading-plan-assets": assets,
  });
  const render = () => { cursor = 0; return page.default(); };
  const load = async () => {
    render();
    for (const effect of effects.splice(0)) effect();
    // loadData runs as an effect and resolves only mocked authentication/database promises.
    for (let index = 0; index < 15; index++) await Promise.resolve();
    return render();
  };
  return { calls, render, load };
}

function nodes(tree, predicate) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return text(typeof tree.type === "function" ? tree.type(tree.props) : tree.props?.children);
}

function cards(tree) {
  return nodes(tree, (node) => node.type?.name === "ResultCompareCard");
}

function resolvedNodes(tree, predicate) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => resolvedNodes(child, predicate));
  const child = typeof tree.type === "function" ? tree.type(tree.props) : tree.props?.children;
  return [...(predicate(tree) ? [tree] : []), ...resolvedNodes(child, predicate)];
}

function currencySelect(tree) {
  const selectors = resolvedNodes(tree, (node) => node.type === "select" && node.props["aria-label"] === "Devise d’affichage des totaux");
  assert.equal(selectors.length, 1, "A labelled currency selector must be available beside the discipline summary");
  return selectors[0];
}

function assertCardTotal(card, value, currency, locale = "fr") {
  assert.equal(card.props.total, value);
  assert.equal(card.props.displayCurrency, currency);
  const expected = new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
  const expectedSigned = `${value > 0 ? "+" : ""}${expected}`;
  assert(text(card).replace(/\s/g, "").includes(expectedSigned.replace(/\s/g, "")), `Expected ${currency} result ${expected}, got ${text(card)}`);
  return text(card);
}

test("Plan converts mixed account results into the selected currency and updates through the actual selector", async () => {
  const f = fixture({
    accounts: [{ id: 11, user_id: userId, currency: " usd " }, { id: 12, user_id: userId, currency: "eur" }, { id: 13, user_id: userId, currency: "CHF" }],
    trades: [trade(1, 11, 100), trade(2, 11, -25), trade(3, 12, -2), trade(4, 13, 9)],
  });
  let tree = await f.load();
  let [compliant, outside] = cards(tree);
  assert.equal(compliant.props.count, 4);
  const euroResult = assertCardTotal(compliant, 70.5, "EUR");
  assert.equal(/\$|CHF/.test(euroResult), false, "No unconverted native currency result is shown beside the EUR total");
  assert.equal(outside.props.total, null);
  assert.equal(currencySelect(tree).props.value, "EUR");
  assert.deepEqual(resolvedNodes(currencySelect(tree), (node) => node.type === "option").map((option) => option.props.value), ["EUR", "USD", "CHF"]);

  currencySelect(tree).props.onChange({ target: { value: "USD" } });
  tree = f.render();
  [compliant] = cards(tree);
  assertCardTotal(compliant, 84.6, "USD");
  assert.equal(text(compliant).includes("€"), false);
  assert.equal(currencySelect(tree).props.value, "USD");

  currencySelect(tree).props.onChange({ target: { value: "CHF" } });
  tree = f.render();
  [compliant] = cards(tree);
  assertCardTotal(compliant, 63.45, "CHF");
  assert.equal(/[€$]/.test(text(compliant)), false);
  assert.equal(compliant.props.count, 4, "Changing the display currency does not reclassify trades");
  assert.equal(/Devise indisponible|UNKNOWN/.test(text(tree)), false);
  assert.equal(f.calls.some((call) => call.write), false);
});

test("a stored account remains included when its connection is offline, stale or revoked", async () => {
  const f = fixture({
    accounts: [{ id: 11, user_id: userId, currency: "USD", revoked: true, active: false, last_sync: "2020-01-01T00:00:00Z" }],
    trades: [trade(1, 11, 20)],
    displayCurrency: "USD",
  });
  const [compliant] = cards(await f.load());
  assert.equal(compliant.props.count, 1);
  assertCardTotal(compliant, 20, "USD");
  assert.equal(f.calls.some((call) => /connection|hosted|sync/.test(call.table)), false);
});

test("legacy entries keep their discipline classification without assigning them an arbitrary account currency", async () => {
  const f = fixture({
    accounts: [
      { id: 11, user_id: userId, currency: "USD" },
      { id: 12, user_id: userId, currency: "EUR" },
      { id: 99, user_id: otherId, currency: "CHF" },
    ],
    trades: [
      trade(1, 11, 100), trade(2, 12, -2), trade(3, null, 50),
      trade(4, 98, -20, { risk_percent: 2 }),
      trade(5, 99, -30, { risk_percent: 2 }),
      trade(6, 11, 500, { user_id: otherId }),
    ],
  });
  const tree = await f.load();
  const [compliant, outside] = cards(tree);
  assert.equal(compliant.props.count, 3);
  assert.equal(outside.props.count, 2);
  assertCardTotal(compliant, 100 / 1.2 - 2, "EUR");
  assert.equal(outside.props.total, null, "A missing or foreign-user account does not borrow the selected currency");
  assert.match(text(outside), /—/);
  assert.equal(/Devise indisponible|UNKNOWN/.test(text(tree)), false);
  const note = "Les montants affichés correspondent aux trades dont la devise du compte est connue. Le score de discipline inclut aussi les anciennes entrées sans compte.";
  const details = nodes(tree, (node) => node.type === "details" && text(node).includes(note));
  assert.equal(details.length, 1, "The currency scope belongs inside the existing disclosure");
  assert.notEqual(details[0].props.open, true, "The detail remains collapsed initially");
  const summary = nodes(details[0], (node) => node.type === "summary");
  assert.equal(summary.length, 1);
  assert.match(text(summary), /Voir le détail du score et les derniers trades/);
  assert.equal(text(summary).includes(note), false);
  assert.equal(f.calls.some((call) => call.write), false);
});

test("fully attributed account results need no legacy scope note", async () => {
  const f = fixture({ accounts: [{ id: 11, user_id: userId, currency: "USD" }], trades: [trade(1, 11, 20)] });
  const tree = await f.load();
  assert.equal(text(tree).includes("Le score de discipline inclut aussi les anciennes entrées sans compte."), false);
});

test("missing exchange rates never display a zero or a partial mixed-currency total", async () => {
  for (const rateLoading of [true, false]) {
    const f = fixture({
      accounts: [{ id: 11, user_id: userId, currency: "USD" }, { id: 12, user_id: userId, currency: "EUR" }],
      trades: [trade(1, 11, 120), trade(2, 12, 50)],
      rates: null, rateLoading,
    });
    const [compliant] = cards(await f.load());
    assert.equal(compliant.props.count, 2);
    assert.equal(compliant.props.total, null);
    assert.equal(/[€$]|0,00|50,00|120,00/.test(text(compliant)), false);
    if (!rateLoading) assert.match(text(compliant), /—/);
  }
});

test("a native-currency result still displays without exchange rates, including real zero and negative totals", async () => {
  for (const [currency, amount] of [["EUR", 0], ["USD", -25], ["CHF", 15]]) {
    const f = fixture({
      accounts: [{ id: 11, user_id: userId, currency }], trades: [trade(1, 11, amount)],
      displayCurrency: currency, rates: null, rateLoading: true,
    });
    const [compliant] = cards(await f.load());
    assertCardTotal(compliant, amount, currency);
    assert.equal(text(compliant).includes("—"), false);
    if (amount < 0) assert(resolvedNodes(compliant, (node) => node.props?.className?.includes("text-red-400") && text(node).includes("25,00")).length > 0);
  }
});

test("an unsupported attributed currency blocks a misleading partial total", async () => {
  const f = fixture({
    accounts: [{ id: 11, user_id: userId, currency: "USD" }, { id: 12, user_id: userId, currency: "GBP" }],
    trades: [trade(1, 11, 120), trade(2, 12, 50)],
  });
  const [compliant] = cards(await f.load());
  assert.equal(compliant.props.count, 2);
  assert.equal(compliant.props.total, null);
  assert.match(text(compliant), /—/);
  assert.equal(/[€$]|100,00/.test(text(compliant)), false);
});

test("selected-currency totals use the current interface locale", async () => {
  const f = fixture({
    accounts: [{ id: 11, user_id: userId, currency: "USD" }], trades: [trade(1, 11, 120)],
    displayCurrency: "USD", locale: "en",
  });
  const [compliant] = cards(await f.load());
  assertCardTotal(compliant, 120, "USD", "en");
});

test("a failed account read blocks saving and never fabricates currency totals", async () => {
  const f = fixture({ accounts: [{ id: 11, user_id: userId, currency: "USD" }], trades: [trade(1, 11, 20)], errors: { trading_accounts: true } });
  const tree = await f.load();
  const save = nodes(tree, (node) => node.type === "button" && text(node).includes("Enregistrer mon plan"))[0];
  assert.equal(save.props.disabled, true);
  await save.props.onClick();
  assert.equal(f.calls.some((call) => call.write), false);
  assert.match(text(tree), /Impossible de charger toutes les données/);
  assert.deepEqual(cards(tree).map((card) => card.props.total), [null, null]);
});
