import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const userId = "11111111-1111-4111-8111-111111111111";
const source = fs.readFileSync(new URL("../components/NotificationEngine.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const drain = async () => { for (let index = 0; index < 45; index++) await Promise.resolve(); };
const trade = (id, status, amount) => Object.freeze({
  id, user_id: userId, status, result_amount: amount, symbol: "XAUUSD",
  result_r: null, risk_percent: null, entry_price: null, stop_loss: null,
  take_profit: null, setup: null, session: null, trade_date: "2026-10-18T12:00:00Z",
});

function fixture({ effectiveRows = [], readError = null, readGate = null } = {}) {
  const notifications = [];
  const queries = [];
  const channels = [];
  const removed = [];
  const timers = new Map();
  let nextTimer = 0;
  let cleanup;
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table) {
      assert(["trading_plans", "trader_preferences", "trading_journal_effective", "investpro_mt_connections", "support_tickets"].includes(table), `Unexpected read ${table}`);
      const call = { table, filters: [] };
      queries.push(call);
      const query = {
        select(columns, options) { call.columns = columns; call.options = options; return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        in(key, values) { call.ids = [...values]; call.idColumn = key; return query; },
        gte() { return query; }, lt() { return query; }, not() { return query; },
        order() { return query; }, limit() { return query; }, maybeSingle() { return query; },
        then(resolve, reject) {
          return Promise.resolve().then(async () => {
            assert(call.filters.some(([key, value]) => key === "user_id" && value === userId), "Every read must retain the authenticated owner filter");
            if (call.ids) {
              assert.equal(table, "trading_journal_effective");
              assert.equal(call.idColumn, "id");
              if (readGate) await readGate;
              return { data: effectiveRows.filter(row => call.ids.includes(row.id)), error: readError };
            }
            if (table === "trader_preferences") return { data: { notify_imports: true, notify_discipline: false, notify_reports: false }, error: null };
            return { data: table === "trading_plans" ? null : [], count: 0, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
    channel(name) {
      const channel = {
        name,
        on(event, options, callback) {
          assert.equal(event, "postgres_changes");
          Object.assign(channel, { options, callback });
          return channel;
        },
        subscribe() { return channel; },
      };
      channels.push(channel);
      return channel;
    },
    removeChannel(channel) { removed.push(channel); },
  };
  const loadedModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: loadedModule, exports: loadedModule.exports,
    fetch() { throw new Error("NETWORK_FORBIDDEN_IN_NOTIFICATION_TEST"); },
    window: {
      localStorage: { getItem: () => null, setItem() {} },
      setTimeout(callback, duration) { assert.equal(duration, 1400); const id = ++nextTimer; timers.set(id, callback); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    require(name) {
      if (name === "react") return {
        useMemo: callback => callback(), useRef: current => ({ current }),
        useEffect(callback) { cleanup = callback(); },
      };
      if (name === "@/lib/supabase/client") return { createClient: () => db };
      if (name === "@/lib/notifyStore") return { pushNotif: notification => notifications.push(notification) };
      if (name === "@/lib/trading-plan-assets") return { planAllowsAsset: () => true };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return {
    notifications, queries, removed,
    async mount() { loadedModule.exports.default(); await drain(); assert.equal(channels.length, 2); },
    insert(row) {
      const journal = channels.find(channel => channel.options.table === "trading_journal");
      assert.equal(journal.options.event, "INSERT");
      assert.equal(journal.options.filter, `user_id=eq.${userId}`);
      journal.callback({ new: row });
    },
    flushImports() {
      assert.equal(timers.size, 1, "Nearby INSERT events must share one flush timer");
      const [id, callback] = [...timers][0];
      timers.delete(id);
      return callback();
    },
    unmount() { cleanup(); },
  };
}

test("raw loss INSERT is reread as effective BE without changing its fee-negative amount", async () => {
  const raw = trade(1, "loss", -3);
  const app = fixture({ effectiveRows: [{ ...raw, status: "breakeven", automatic_be: true }] });
  await app.mount();
  app.insert(raw);
  assert.equal(app.notifications.length, 0);
  await app.flushImports();
  assert.equal(app.notifications.length, 1);
  assert.equal(app.notifications[0].title, "Nouveau trade importé");
  assert.equal(app.notifications[0].message, "XAUUSD · -3 $US");
  assert.deepEqual(app.queries.filter(query => query.ids).map(query => query.ids), [[1]]);
  assert.equal(raw.status, "loss");
  assert.equal(raw.result_amount, -3);
  app.unmount();
});

test("batched imports count the effective BE and retain its fees in net P&L", async () => {
  const sourceRows = [trade(1, "win", 100), trade(2, "loss", -2), trade(3, "loss", -3)];
  const app = fixture({ effectiveRows: sourceRows.map(row => row.id === 3 ? { ...row, status: "breakeven", automatic_be: true } : row) });
  await app.mount();
  sourceRows.forEach(app.insert);
  await app.flushImports();
  assert.equal(app.notifications.length, 1);
  assert.equal(app.notifications[0].title, "Import terminé · 3 trades");
  assert.equal(app.notifications[0].message, "1 gain(s) · 1 perte(s) · 1 BE · P&L +95 $US");
  assert.deepEqual(app.queries.filter(query => query.ids).map(query => query.ids), [[1, 2, 3]]);
  app.unmount();
});

test("failed or incomplete effective reads report cash P&L without fabricating outcome counts", async () => {
  for (const options of [{ readError: { message: "VIEW_READ_FAILURE_FIXTURE" } }, { effectiveRows: [trade(1, "breakeven", -3)] }]) {
    const app = fixture(options);
    await app.mount();
    app.insert(trade(1, "loss", -3));
    app.insert(trade(2, "loss", -2));
    await app.flushImports();
    assert.equal(app.notifications.length, 1);
    assert.equal(app.notifications[0].message, "P&L -5 $US");
    assert.doesNotMatch(app.notifications[0].message, /gain\(s\)|perte\(s\)|BE/);
    app.unmount();
  }
});

test("unmount during the effective read suppresses late notification delivery", async () => {
  let release;
  const readGate = new Promise(resolve => { release = resolve; });
  const app = fixture({ effectiveRows: [trade(1, "breakeven", -3)], readGate });
  await app.mount();
  app.insert(trade(1, "loss", -3));
  const pending = app.flushImports();
  await drain();
  assert.equal(app.queries.filter(query => query.ids).length, 1);
  app.unmount();
  release();
  await pending;
  assert.equal(app.notifications.length, 0);
  assert.equal(app.removed.length, 2);
});
