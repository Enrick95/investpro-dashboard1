import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "app/dashboard/journal/page.tsx"), "utf8");
const compiled = ts.transpileModule(source + "\nexport { calculateTradeResult, manualBreakevenError, emptyTradeForm };\n", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsx = (type, props) => ({ type, props });

function fixture({ amount = "-3.25", confirmed = true, status = "breakeven", existing = null } = {}) {
  const writes = [];
  const notifications = [];
  const account = { id: 1, name: "Manual", currency: "USD", current_balance: 10000, initial_balance: 10000 };
  const states = [];
  let cursor = 0;
  let exports;
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } }, error: null }) },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; },
        maybeSingle: async () => ({ data: null, error: null }),
        insert: async payload => { writes.push({ table, payload }); return { error: null }; },
        update(payload) { writes.push({ table, payload }); return query; },
        then(resolve, reject) { return Promise.resolve({ data: table === "trading_accounts" ? [account] : [], error: null }).then(resolve, reject); },
      };
      return query;
    },
  };
  const overrides = {
    0: "owner", 1: existing ? [existing] : [], 2: [account], 4: false, 6: !existing, 9: confirmed,
  };
  const loadedModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: loadedModule, exports: loadedModule.exports, console,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return {
        useMemo: callback => callback(), useEffect() {},
        useState(initial) {
          const index = cursor++;
          if (!(index in states)) {
            states[index] = index === 8 ? { ...exports.emptyTradeForm, account_id: "1", symbol: "XAUUSD", entry_price: "2000", stop_loss: "1990", take_profit: "2020", status, breakeven_net: amount }
              : Object.hasOwn(overrides, index) ? overrides[index] : initial;
          }
          return [states[index], value => { states[index] = value; }];
        },
      };
      if (name === "@/lib/supabase/client") return { createClient: () => db };
      if (name === "@/components/i18n/LocaleProvider") return { useLocale: () => ({ t: value => value, locale: "fr" }) };
      if (name === "@/lib/notifyStore") return { pushNotif: notification => notifications.push(notification) };
      if (name === "@/lib/metasync/loadJournal") return { loadJournal: async () => ({ data: [], error: null }) };
      if (name === "@/lib/currency") return {
        useCurrencyRates: () => ({ rates: null, rateDate: null, rateLoading: false }),
        useDisplayCurrency: () => ({ displayCurrency: "USD" }),
        rateDateLabel: () => "", convertCurrency: value => value, formatDisplayCurrency: String,
      };
      return {};
    },
  });
  exports = loadedModule.exports;
  return { exports, writes, notifications, render() { cursor = 0; return exports.default(); } };
}

function nodes(tree, matches) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, matches));
  return [...(matches(tree) ? [tree] : []), ...nodes(tree.props?.children, matches)];
}
function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return text(tree.props?.children);
}
function saveButton(tree, editing = false) {
  return nodes(tree, node => node.type === "button" && text(node) === (editing ? "Enregistrer les modifications" : "Ajouter le trade"))[0];
}

test("manual BE saves the actual fee-negative amount and actual net R", async () => {
  const f = fixture();
  const tree = f.render();
  assert.match(text(tree), /BE = résultat net réel, frais inclus/);
  const button = saveButton(tree);
  assert.equal(button.props.disabled, false);
  await button.props.onClick();
  assert.equal(f.writes.length, 1);
  const payload = f.writes[0].payload;
  assert.equal(payload.status, "breakeven");
  assert.equal(payload.result_amount, -3.25);
  assert.equal(payload.result_r, -3.25 / 100);
});

test("manual BE never saves a missing confirmation or an invalid financial amount", async () => {
  for (const options of [{ confirmed: false }, ...["", "abc", "NaN", "Infinity", "1e309"].map(amount => ({ amount }))]) {
    const f = fixture(options);
    const button = saveButton(f.render());
    assert.equal(button.props.disabled, true);
    await button.props.onClick(); // Exercise the guard even when bypassing the disabled UI.
    assert.equal(f.writes.length, 0, JSON.stringify(options));
    assert.equal(f.notifications[0].kind, "warning");
  }
});

test("manual BE defaults to zero and retains cash when its risk amount is unavailable", () => {
  const { calculateTradeResult, emptyTradeForm } = fixture().exports;
  assert.equal(emptyTradeForm.breakeven_net, "0");
  const result = calculateTradeResult({ balance: 0, riskPercent: 1, entry: 2000, stopLoss: 1990, takeProfit: 2020, status: "breakeven", breakevenNet: -3.25 });
  assert.equal(result.resultAmount, -3.25);
  assert.equal(result.resultR, 0);
});

test("editing an existing manual BE prefills its financial net and requests confirmation again", () => {
  const existing = { id: 25, user_id: "owner", account_id: 1, symbol: "XAUUSD", direction: "buy", trade_date: "2026-10-18T12:00:00Z", status: "breakeven", source_status: "breakeven", result_amount: -4.5, risk_percent: 1 };
  const f = fixture({ existing });
  const row = nodes(f.render(), node => node.props?.trade?.id === 25)[0];
  row.props.onEdit();
  const editTree = f.render();
  const input = nodes(editTree, node => node.type === "input" && node.props["aria-describedby"] === "manual-be-net-help")[0];
  assert.equal(input.props.value, "-4.5");
  assert.equal(saveButton(editTree, true).props.disabled, true);
});

test("WIN and LOSS formulas ignore the BE net field and do not require BE confirmation", async () => {
  for (const [status, amount, r] of [["win", 200, 2], ["loss", -100, -1]]) {
    const f = fixture({ status, amount: "-3.25", confirmed: false });
    const button = saveButton(f.render());
    assert.equal(button.props.disabled, false);
    await button.props.onClick();
    assert.equal(f.writes[0].payload.result_amount, amount);
    assert.equal(f.writes[0].payload.result_r, r);
  }
});
