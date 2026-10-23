import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function compile(file, modules = {}) {
  const cjs = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: cjs, exports: cjs.exports, Date, Set, require(name) {
    assert.ok(Object.hasOwn(modules, name)); return modules[name];
  } });
  return cjs.exports;
}
const metadata = compile('lib/metasync/execution-metadata.ts');
const { validateSnapshot } = compile('lib/metasync/payload.ts', { './execution-metadata': metadata });
const { validateHostedSnapshot } = compile('lib/metasync/hosted-capital.ts', { './payload': { validateSnapshot } });
const snapshot = () => ({ platform: 'MT5', login: '1234', server: 'offline-test', currency: 'EUR',
  balance: 1000, equity: 1011, observed_at: new Date().toISOString(), trades: [], warnings: [] });

test('legacy MT4 and MT5 snapshots retain absent account metrics as null', () => {
  for (const platform of ['MT4', 'MT5', undefined]) {
    const input = snapshot(); input.platform = platform;
    const result = validateSnapshot(input);
    assert.equal(result.platform, platform || 'MT5');
    assert.equal(result.floating_pnl, null);
    assert.equal(result.open_positions, null);
    assert.equal(result.balance, 1000);
    assert.equal(result.equity, 1011);
    assert.equal(Object.hasOwn(input, 'floating_pnl'), false);
  }
});

test('explicit null metrics stay unknown, including independently optional fields', () => {
  for (const fields of [{ floating_pnl: null, open_positions: null }, { floating_pnl: 4 }, { open_positions: 2 }]) {
    const result = validateSnapshot({ ...snapshot(), ...fields });
    assert.equal(result.floating_pnl, fields.floating_pnl ?? null);
    assert.equal(result.open_positions, fields.open_positions ?? null);
  }
});

test('signed broker profit is preserved independently of equity and balance', () => {
  for (const floating_pnl of [-999999999999.999, -2.03, 0, 3.42, 999999999999.999]) {
    const result = validateSnapshot({ ...snapshot(), floating_pnl, open_positions: 1 });
    assert.equal(result.floating_pnl, floating_pnl);
    assert.equal(result.equity, 1011);
    assert.equal(result.balance, 1000);
  }
});

test('valid zero profit and zero positions remain confirmed zeros', () => {
  const result = validateSnapshot({ ...snapshot(), floating_pnl: 0, open_positions: 0 });
  assert.equal(result.floating_pnl, 0);
  assert.equal(result.open_positions, 0);
  assert.equal(validateSnapshot({ ...snapshot(), open_positions: 100000 }).open_positions, 100000);
});

test('invalid broker profit rejects the snapshot without coercion', () => {
  for (const floating_pnl of [NaN, Infinity, -Infinity, 1e12, -1e12, '2.04', '', true, [], {}]) {
    assert.throws(() => validateSnapshot({ ...snapshot(), floating_pnl }), /P&L invalide/);
  }
});

test('invalid positions reject the snapshot without rounding or coercion', () => {
  for (const open_positions of [NaN, Infinity, -Infinity, -1, 0.5, 1.5, 100001, '0', '', true, [], {}]) {
    assert.throws(() => validateSnapshot({ ...snapshot(), open_positions }), /Positions invalides/);
  }
});

test('optional metrics cannot bypass snapshot account, time or trade validation', () => {
  for (const changes of [{ login: 'foreign-account' }, { observed_at: 'bad-date' }, { trades: [{ external_id: 'mt5:1' }] }]) {
    assert.throws(() => validateSnapshot({ ...snapshot(), floating_pnl: 1, open_positions: 1, ...changes }));
  }
});

test('hosted funding validation preserves optional metrics and still rejects an invalid capital reference', () => {
  const input = { ...snapshot(), floating_pnl: -3.25, open_positions: 2,
    funding: { inflows: 1000, outflows: 0, reference_balance: 1000, reference_method: 'first_deposit' } };
  const result = validateHostedSnapshot(input);
  assert.equal(result.floating_pnl, -3.25);
  assert.equal(result.open_positions, 2);
  assert.equal(result.funding.reference_balance, 1000);
  assert.throws(() => validateHostedSnapshot({ ...input, funding: { ...input.funding, reference_balance: 1001 } }), /funding/);
});
