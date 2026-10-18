import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const jsx = (type, props) => ({ type, props });

function load(file, expose = "") {
  const compiled = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), "utf8") + expose;
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(output, {
    module: compiled, exports: compiled.exports, Intl,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/lib/trading-plan-assets") return { planAllowsAsset: () => true };
      return {};
    },
  });
  return compiled.exports;
}

const { computeReport } = load("app/dashboard/rapport-mensuel/page.tsx", "\nexport { computeReport };\n");
const SyncReport = load("components/metasync/SyncReport.tsx").default;
const trade = (status, amount, id = 1) => ({
  id, status, result_amount: amount, result_r: null, risk_percent: null,
  account_id: 1, trade_date: "2026-10-18T10:00:00Z", symbol: "XAUUSD",
  direction: "buy", entry_price: 2000, stop_loss: null, take_profit: null,
  setup: null, session: null, timeframe: null,
});

function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return text(tree.props?.children);
}

test("monthly report: technical BE status changes outcome counts without erasing its fees", () => {
  const trades = [trade("win", 100, 1), trade("loss", -25, 2), trade("breakeven", -5, 3)];
  const report = computeReport(trades, null, null);
  assert.deepEqual([report.wins, report.losses, report.breakeven, report.winrate], [1, 1, 1, 50]);
  assert.equal(report.pnl, 70);
  assert.equal(report.profitFactor, 100 / 30);
  assert.equal(report.avgLoss, 15);
  assert.equal(report.equity.at(-1), 70);

  const confirmedLoss = computeReport(trades.map((row) => row.id === 3 ? { ...row, status: "loss" } : row), null, null);
  assert.equal(confirmedLoss.losses, 2, "A true small loss remains a loss when its status says loss");
  assert.ok(Math.abs(confirmedLoss.winrate - 100 / 3) < 1e-10);
  assert.equal(confirmedLoss.pnl, report.pnl);
  assert.equal(confirmedLoss.profitFactor, report.profitFactor);
  assert.equal(confirmedLoss.avgLoss, report.avgLoss);
});

test("monthly and sync reports: BE-only histories retain negative cash results with no winrate", () => {
  const trades = [trade("breakeven", -5)];
  const report = computeReport(trades, null, null);
  assert.equal(report.winrate, null);
  assert.equal(report.losses, 0);
  assert.equal(report.breakeven, 1);
  assert.equal(report.pnl, -5);
  const rendered = text(SyncReport({ trades, currency: "USD" }));
  assert.match(rendered, /Winrate hors BE —/);
  assert.match(rendered, /Gains \/ pertes \/ BE 0 \/ 0 \/ 1/);
  assert.match(rendered, /PnL net -5 USD/);
});
