import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const cjs = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(new URL('../lib/journal-metrics.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, { module: cjs, exports: cjs.exports });
const { summarizeKnownR, hasCompletePlanInputs } = cjs.exports;
const summary = trades => JSON.parse(JSON.stringify(summarizeKnownR(trades)));
const trade = overrides => ({ status: 'win', result_r: 2, risk_percent: 1, ...overrides });
const complete = overrides => ({ risk_percent: 1, entry_price: 2000, stop_loss: 1990, take_profit: 2020,
  symbol: 'XAUUSD', session: 'london', setup: 'Breakout', ...overrides });
const plan = overrides => ({ max_risk_percent: 1, minimum_rr: 1, allowed_assets: ['XAUUSD'],
  allowed_sessions: ['london'], allowed_setups: ['Breakout'], ...overrides });

test('R excludes open and cancelled trades from both the average and closed denominator', () => {
  assert.deepEqual(summary([trade(), trade({ status: 'open', result_r: 50 }), trade({ status: 'cancelled' })]),
    { average: 2, evaluatedCount: 1, closedCount: 1 });
});

test('real zero R and negative net BE are known results rather than missing values', () => {
  assert.deepEqual(summary([trade({ status: 'breakeven', result_r: 0 })]),
    { average: 0, evaluatedCount: 1, closedCount: 1 });
  assert.deepEqual(summary([trade({ status: 'breakeven', result_r: -0.04 }), trade({ status: 'loss', result_r: -1 })]),
    { average: -0.52, evaluatedCount: 2, closedCount: 2 });
});

test('one synchronized import with missing initial risk does not suppress known manual R', () => {
  assert.deepEqual(summary([trade({ result_r: 2 }), trade({ status: 'loss', result_r: -1 }),
    trade({ result_r: null, risk_percent: null, setup: 'MT5 synchronisé' }),
    trade({ result_r: 0, risk_percent: null, setup: 'MT4 synchronisé' })]),
  { average: 0.5, evaluatedCount: 2, closedCount: 4 });
});

test('unknown R or risk is never coerced into zero, including blank and nonfinite values', () => {
  const unknown = [undefined, null, '', ' ', NaN, Infinity, -Infinity, 'Infinity', false, [], '0x10'];
  for (const value of unknown) {
    assert.equal(summarizeKnownR([trade({ result_r: value })]).average, null, `R ${String(value)}`);
    assert.equal(summarizeKnownR([trade({ risk_percent: value })]).average, null, `risk ${String(value)}`);
  }
  for (const risk_percent of [0, -1, '0', '-1']) {
    assert.equal(summarizeKnownR([trade({ risk_percent })]).evaluatedCount, 0);
  }
});

test('database numeric strings are accepted and empty selections stay unavailable', () => {
  assert.deepEqual(summary([trade({ result_r: '0', risk_percent: '1' }), trade({ result_r: '2.5', risk_percent: '.5' })]),
    { average: 1.25, evaluatedCount: 2, closedCount: 2 });
  assert.deepEqual(summary([]), { average: null, evaluatedCount: 0, closedCount: 0 });
  assert.deepEqual(summary([trade({ result_r: null })]), { average: null, evaluatedCount: 0, closedCount: 1 });
});

test('averaging finite R values does not overflow their raw sum', () => {
  assert.equal(summarizeKnownR([trade({ result_r: Number.MAX_VALUE }), trade({ result_r: Number.MAX_VALUE })]).average,
    Number.MAX_VALUE);
});

test('discipline requires a saved plan and known valid numeric inputs', () => {
  assert.equal(hasCompletePlanInputs(complete(), null), false);
  assert.equal(hasCompletePlanInputs(complete(), plan()), true);
  assert.equal(hasCompletePlanInputs(complete({ risk_percent: '1', entry_price: '2000', stop_loss: '1990', take_profit: '2020' }), plan()), true);
  for (const key of ['risk_percent', 'entry_price', 'stop_loss', 'take_profit']) {
    for (const value of [undefined, null, '', ' ', 0, -1, NaN, Infinity, false]) {
      assert.equal(hasCompletePlanInputs(complete({ [key]: value }), plan()), false, `${key}: ${String(value)}`);
    }
  }
  assert.equal(hasCompletePlanInputs(complete({ stop_loss: 2000 }), plan()), false);
  assert.equal(hasCompletePlanInputs(complete({ take_profit: 2000 }), plan()), false);
});

test('missing configured asset, session or actual setup makes discipline unavailable', () => {
  for (const key of ['symbol', 'session', 'setup']) {
    for (const value of [undefined, null, '', '  ']) {
      assert.equal(hasCompletePlanInputs(complete({ [key]: value }), plan()), false, key);
    }
  }
  for (const setup of ['MT5 synchronisé', 'MT4 synchronisé', ' mt5 SYNCHRONISÉ ', 'MT5 synchronise']) {
    assert.equal(hasCompletePlanInputs(complete({ setup }), plan()), false, setup);
  }
});

test('unconfigured optional dimensions are not required; known breaches remain eligible for evaluation', () => {
  assert.equal(hasCompletePlanInputs(complete({ symbol: null, session: null, setup: 'MT5 synchronisé' }),
    plan({ allowed_assets: [], allowed_sessions: [], allowed_setups: [] })), true);
  // Eligibility must not hide known breaches as if their inputs were missing.
  assert.equal(hasCompletePlanInputs(complete({ risk_percent: 2, symbol: 'EURUSD', session: 'asian', setup: 'Reversal' }), plan()), true);
});

test('invalid saved numeric rules cannot produce a discipline percentage', () => {
  for (const max_risk_percent of [null, '', 0, -1, NaN, Infinity]) {
    assert.equal(hasCompletePlanInputs(complete(), plan({ max_risk_percent })), false);
  }
  for (const minimum_rr of [null, '', -1, NaN, Infinity]) {
    assert.equal(hasCompletePlanInputs(complete(), plan({ minimum_rr })), false);
  }
});

// Execute the actual page's memo and evaluator, rather than duplicate their formulas.
const journalSource = fs.readFileSync(new URL('../app/dashboard/journal/page.tsx', import.meta.url), 'utf8');
const journalAst = ts.createSourceFile('journal.tsx', journalSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let statsCallback;
function findStats(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'stats'
      && node.initializer && ts.isCallExpression(node.initializer)) {
    const callback = node.initializer.arguments[0];
    if (callback && ts.isArrowFunction(callback)) statsCallback = callback;
  }
  ts.forEachChild(node, findStats);
}
findStats(journalAst);
assert.ok(statsCallback, 'The journal has an actual stats memo to exercise');
const helperNames = new Set(['calculateRR', 'normalizeSession', 'normalizeText', 'evaluatePlan']);
const evaluatorSource = journalAst.statements.filter(node => ts.isFunctionDeclaration(node)
  && node.name && helperNames.has(node.name.text)).map(node => node.getText(journalAst)).join('\n');
assert.equal(journalAst.statements.filter(node => ts.isFunctionDeclaration(node)
  && node.name && helperNames.has(node.name.text)).length, helperNames.size);
const assetsModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/trading-plan-assets.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: assetsModule, exports: assetsModule.exports });
const statsModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(`${evaluatorSource}\nexport function runStats(trades, tradingPlan) {
  return (${statsCallback.getText(journalAst)})();
}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
{ module: statsModule, exports: statsModule.exports, summarizeKnownR, hasCompletePlanInputs,
  planAllowsAsset: assetsModule.exports.planAllowsAsset, normalizePlanAsset: assetsModule.exports.normalizePlanAsset });
const actualStats = statsModule.exports.runStats;
const manual = overrides => ({ ...complete(), ...trade(), result_amount: 200, ...overrides });
const imported = overrides => manual({ risk_percent: null, result_r: null, stop_loss: null, take_profit: null,
  setup: 'MT5 synchronisé', session: null, ...overrides });

test('actual journal stats keep known manual R and discipline in a mixed imported history', () => {
  const stats = actualStats([manual(), manual({ status: 'loss', risk_percent: 2, result_r: -1, result_amount: -100 }), imported()], plan());
  assert.equal(stats.avgR, 0.5);
  assert.equal(stats.rEvaluatedCount, 2);
  assert.equal(stats.closedCount, 3);
  assert.equal(stats.discipline, 50);
  assert.equal(stats.evaluatedCount, 2);
});

test('actual journal stats leave all-unknown metrics unavailable rather than zero', () => {
  const stats = actualStats([imported(), imported({ status: 'loss', result_amount: -20 })], plan());
  assert.equal(stats.avgR, null);
  assert.equal(stats.discipline, null);
  assert.equal(stats.rEvaluatedCount, 0);
  assert.equal(stats.evaluatedCount, 0);
  assert.equal(stats.closedCount, 2);
});

test('actual journal stats display true zero R and exclude incomplete trades from discipline', () => {
  const zero = actualStats([manual({ status: 'breakeven', result_r: 0, result_amount: 0 })], plan());
  assert.equal(zero.avgR, 0);
  assert.equal(zero.discipline, 100);
  const stats = actualStats([manual(), manual({ symbol: 'EURUSD', session: null, stop_loss: null }),
    manual({ status: 'open', risk_percent: 2 }), manual({ status: 'cancelled', risk_percent: 2 })], plan());
  assert.equal(stats.evaluatedCount, 1);
  assert.equal(stats.discipline, 100);
  assert.equal(stats.closedCount, 2);
});

test('actual journal stats never invent discipline without a saved plan', () => {
  const stats = actualStats([manual()], null);
  assert.equal(stats.avgR, 2);
  assert.equal(stats.discipline, null);
  assert.equal(stats.evaluatedCount, 0);
});
