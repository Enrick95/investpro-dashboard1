import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function compile(file, modules = {}) {
  const cjs = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: cjs, exports: cjs.exports, Date, Set, require(name) { assert.ok(Object.hasOwn(modules, name)); return modules[name]; } });
  return cjs.exports;
}
const metadata = compile('lib/metasync/execution-metadata.ts');
const { validateSnapshot } = compile('lib/metasync/payload.ts', { './execution-metadata': metadata });
const source = { external_id: 'mt5:123', entry_price: 2000 };
const proof = () => ({ version: 1, platform: 'MT5', source: 'mt5_history_deal_sl', position_id: '123', price_step: 0.01,
  entries: [{ ticket: '10', time_msc: 1, price: 2000, volume: 1 }],
  exits: [{ ticket: '20', time_msc: 2, price: 1999.98, volume: 1, reason: 'sl', stop_loss: 2000 }],
});
const confirmed = value => metadata.isConfirmedBreakeven(metadata.validateExecutionMetadata(value, source, 'MT5'));

test('SL set to entry and triggered stays BE despite adverse fill, commissions or a negative net', () => {
  assert.equal(confirmed(proof()), true);
  const trade = { ...source, symbol: 'XAUUSD', direction: 'buy', trade_date: new Date().toISOString(), result_amount: -3.25, execution_metadata: proof() };
  const snapshot = { platform: 'MT5', login: '1234', server: 'offline', currency: 'USD', balance: 9996.75, equity: 9996.75,
    observed_at: new Date().toISOString(), trades: [trade], warnings: [] };
  assert.equal(validateSnapshot(snapshot).trades[0].result_amount, -3.25);
  assert.equal(validateSnapshot(snapshot).balance, 9996.75);
});

test('manual closure is not BE even at entry, with a recorded entry-level SL or a tiny loss', () => {
  for (const reason of ['manual', 'tp', 'other']) {
    const value = proof(); value.exits[0].reason = reason; value.exits[0].price = 2000;
    assert.equal(confirmed(value), false, reason);
  }
});

test('an SL one actual price step away is a real loss, independent of small cash result', () => {
  const value = proof(); value.exits[0].stop_loss = 1999.99;
  assert.equal(confirmed(value), false);
});

test('absent or zero SL does not prove BE; an adverse fill alone does not prove an SL level', () => {
  for (const stop_loss of [null, 0, 1990]) {
    const value = proof(); value.exits[0].stop_loss = stop_loss;
    assert.equal(confirmed(value), false);
  }
});

test('partial TP then entry-level SL remainder is not BE for the full position', () => {
  const value = proof(); value.exits[0].volume = 0.5;
  value.exits.push({ ...value.exits[0], ticket: '21', volume: 0.5, reason: 'tp', price: 2010 });
  assert.equal(confirmed(value), false);
  value.exits[1].reason = 'sl'; value.exits[1].stop_loss = 2000;
  assert.equal(confirmed(value), true);
});

test('weighted opening fills before exits are supported; scale-ins after an exit are ambiguous', () => {
  const value = proof(); value.entries = [{ ticket: '10', time_msc: 1, price: 1999, volume: 0.5 }, { ticket: '11', time_msc: 1, price: 2001, volume: 0.5 }];
  assert.equal(confirmed(value), true);
  value.entries[1].time_msc = 3;
  assert.equal(confirmed(value), false);
});

test('an incomplete volume record cannot imply a fully closed BE position', () => {
  const value = proof(); value.exits[0].volume = 0.99;
  assert.equal(confirmed(value), false);
});

test('proof cannot be moved across positions, platforms, entry basis, or duplicated deals', () => {
  const changes = [v => { v.position_id = '124'; }, v => { v.platform = 'MT4'; }, v => { v.entries[0].price = 2001; },
    v => { v.exits[0].ticket = '10'; }, v => { v.exits[0].ticket = '010'; }, v => { v.position_id = '0'; }, v => { v.automatic_be = true; }];
  for (const change of changes) { const value = proof(); change(value); assert.throws(() => metadata.validateExecutionMetadata(value, source, 'MT5')); }
  assert.throws(() => metadata.validateExecutionMetadata(proof(), source, 'MT4'));
});

test('invalid optional fields reject the complete snapshot before persistence', () => {
  for (const change of [v => { v.price_step = Infinity; }, v => { v.exits[0].reason = 'guess'; }, v => { v.exits[0].stop_loss = -1; },
    v => { v.entries[0].volume = NaN; }, v => { v.entries[0].time_msc = Number.MAX_SAFE_INTEGER + 1; }, v => { v.exits = []; }]) {
    const value = proof(); change(value); assert.throws(() => metadata.validateExecutionMetadata(value, source, 'MT5'));
  }
});

test('old worker snapshots still import without guessed BE metadata', () => {
  const trade = { ...source, symbol: 'XAUUSD', direction: 'buy', trade_date: new Date().toISOString(), result_amount: -0.01 };
  const snapshot = validateSnapshot({ login: '1234', server: 'offline', currency: 'USD', balance: 100, equity: 100,
    observed_at: new Date().toISOString(), trades: [trade], warnings: [] });
  assert.equal(snapshot.platform, 'MT5'); assert.equal(snapshot.trades[0].result_amount, -0.01);
  assert.equal(Object.hasOwn(snapshot.trades[0], 'execution_metadata'), false);
});

test('the actual Python connector contract fixtures agree with the website classification', () => {
  const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/metasync-execution-contract.json', import.meta.url), 'utf8'));
  for (const fixture of fixtures) {
    const value = metadata.validateExecutionMetadata(fixture.trade.execution_metadata, fixture.trade, 'MT5');
    assert.equal(metadata.isConfirmedBreakeven(value), fixture.expected_be, fixture.name);
  }
});
