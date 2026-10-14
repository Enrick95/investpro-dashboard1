import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyPlanAsset, normalizePlanAsset, parsePlanAssets, planAllowsAsset } from '../lib/trading-plan-assets.ts';

test('Forex groups allow currency pairs and broker suffixes, not metals or crypto', () => {
  for (const symbol of ['EURUSD', 'GBPCHF', 'EURCAD.a', 'USDJPYm']) assert.equal(planAllowsAsset(['group:forex'], symbol), true, symbol);
  for (const symbol of ['XAUUSD', 'XAGUSD', 'BTCUSD', 'NAS100', 'MYSTERY']) assert.equal(planAllowsAsset(['group:forex'], symbol), false, symbol);
});
test('index aliases and broker suffixes are recognized', () => {
  for (const symbol of ['NAS100', 'US30.cash', 'DAX40', 'FR40', 'USTECm']) assert.equal(classifyPlanAsset(symbol), 'group:indices', symbol);
  assert.equal(planAllowsAsset(['group:indices'], 'AAPL'), false);
});
test('families can be combined with exact symbols', () => {
  const plan = ['group:forex', 'XAUUSD'];
  assert.equal(planAllowsAsset(plan, 'EURUSD'), true);
  assert.equal(planAllowsAsset(plan, 'GOLD'), true);
  assert.equal(planAllowsAsset(plan, 'XAGUSD'), false);
});
test('unknown instruments are never guessed but can be authorized exactly', () => {
  assert.equal(classifyPlanAsset('BROKER_CUSTOM'), null);
  assert.equal(planAllowsAsset(['group:stocks'], 'BROKER_CUSTOM'), false);
  assert.equal(planAllowsAsset(['BROKER_CUSTOM'], 'broker_custom'), true);
});
test('other recognized families remain separate', () => {
  assert.equal(classifyPlanAsset('BTCUSD'), 'group:crypto');
  assert.equal(classifyPlanAsset('ETHUSDT'), 'group:crypto');
  assert.equal(classifyPlanAsset('USOIL'), 'group:energy');
  assert.equal(classifyPlanAsset('XAUUSD.a'), 'group:metals');
  assert.equal(classifyPlanAsset('AAPL.US'), 'group:stocks');
});
test('multi-symbol input normalizes aliases and removes duplicates', () => {
  assert.deepEqual(parsePlanAssets('gold, EURUSD; XAUUSD NAS100'), ['XAUUSD', 'EURUSD', 'NAS100']);
  assert.equal(normalizePlanAsset(' silver '), 'XAGUSD');
});
test('existing empty or exact-symbol plans keep their meaning', () => {
  assert.equal(planAllowsAsset([], 'UNKNOWN'), true);
  assert.equal(planAllowsAsset(['XAUUSD'], 'EURUSD'), false);
  assert.equal(planAllowsAsset(['EURUSD.a'], 'EURUSD'), false);
});
test('serialized category markers preserve evaluation', () => {
  const plan = JSON.parse(JSON.stringify(['group:forex', 'group:indices', 'XAUUSD']));
  assert.equal(planAllowsAsset(plan, 'NAS100'), true);
  assert.equal(planAllowsAsset(plan, 'GBPCHF'), true);
  assert.equal(planAllowsAsset(plan, 'XAGUSD'), false);
});
