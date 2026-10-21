import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
function loadModule(file, imports = {}) {
  const cjsModule = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module: cjsModule, exports: cjsModule.exports, Response,
    require(name) {
      if (!Object.hasOwn(imports, name)) throw Error(`Unexpected dependency: ${name}`);
      return imports[name];
    },
  }, { filename: file });
  return cjsModule.exports;
}
const performance = loadModule("lib/performance.ts");
const engine = loadModule("lib/telegram/engine.ts");
const period = loadModule("lib/vip/performance-report-period.ts", { "../performance": performance });
const helpers = loadModule("lib/vip/public-performance.ts", {
  "@/lib/performance": performance,
  "@/lib/vip/performance-report-period": period,
});
const plain = value => JSON.parse(JSON.stringify(value));
const manual = changes => ({
  id: 1, trade_date: "2026-10-20", symbol: "XAUUSD", direction: "buy",
  status: "win", result_r: 2.5, pips: 100, ...changes,
});
const telegram = changes => ({
  id: 10, date: "2026-10-20", asset: "GOLD", side: "BUY", status: "win", r: 2,
  target: 1, entry: 100, sl: 90, targets: [120, 130], ...changes,
});

test("the public projection keeps losses and BE, excludes active/uncertain/cancelled trades and private data", () => {
  const rows = helpers.publicVipPerformanceTrades([
    manual({ comment: "private", screenshot_url: "https://private.test/chart", created_by: "private-user", entry_price: 100, stop_loss: 90 }),
    manual({ id: 2, direction: "sell", status: "loss", result_r: -1 }),
    manual({ id: 3, status: "breakeven", result_r: 0 }),
    ...["open", "review", "cancelled"].map((status, i) => manual({ id: i + 4, status })),
  ], [
    telegram({ chat_id: "private-channel", received_at: "private-date", issues: ["private"] }),
    telegram({ id: 11, status: "loss", r: -1 }),
    telegram({ id: 12, status: "be", r: 0 }),
    ...["pending", "review", "cancelled"].map((status, i) => telegram({ id: i + 13, status })),
  ]);
  assert.equal(rows.length, 6);
  assert.equal(rows.filter(row => row.status === "loss").length, 2);
  assert.equal(rows.filter(row => row.status === "breakeven").length, 2);
  const keys = ["id", "source", "trade_date", "symbol", "direction", "status", "result_r", "pips", "target"].sort();
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), keys);
  assert.equal(rows.find(row => row.id === -10).source, "telegram");
  assert.equal(rows.find(row => row.id === -10).target, 1);
  assert.equal(rows.find(row => row.id === 1).source, "manual");
});

test("unknown or invalid R is never reported as a known zero, while an explicit BE zero survives", () => {
  for (const result_r of [null, undefined, NaN, Infinity, -Infinity, "2", "", false, -1, 0]) {
    assert.equal(helpers.publicVipPerformanceTrades([manual({ result_r })], [])[0].result_r, null);
  }
  assert.equal(helpers.publicVipPerformanceTrades([manual({ status: "breakeven", result_r: -0 })], [])[0].result_r, 0);
  assert.equal(helpers.publicVipPerformanceTrades([], [telegram({ status: "loss", r: null })])[0].result_r, null);
  assert.throws(() => helpers.publicVipPerformanceTrades([manual({ id: NaN })], []));
  assert.throws(() => helpers.publicVipPerformanceTrades([manual({ direction: "unknown" })], []));
  assert.throws(() => helpers.publicVipPerformanceTrades([manual({ trade_date: "2026-02-31" })], []));
  assert.throws(() => helpers.publicVipPerformanceTrades([manual({ symbol: "\u0001" })], []));
  assert.equal(helpers.publicVipPerformanceTrades([manual({ trade_date: "2026-10-20T23:30:00+00:00" })], [])[0].trade_date, "2026-10-21");
});

function fakeDatabase(tables, fail = () => false) {
  const reads = [];
  return {
    reads,
    db: {
      from(table) {
        const read = { table, fields: null, filters: [], order: null };
        const query = {
          select(fields) { read.fields = fields; return query; },
          in(column, values) { read.filters.push({ kind: "in", column, values }); return query; },
          eq(column, value) { read.filters.push({ kind: "eq", column, value }); return query; },
          order(column, options) { read.order = { column, ...options }; return query; },
          range(start, end) {
            reads.push({ ...read, start, end });
            if (fail(table, start)) return Promise.resolve({ data: null, error: { message: "private database secret" } });
            let rows = tables[table] ?? [];
            for (const filter of read.filters) rows = rows.filter(row => filter.kind === "eq"
              ? row[filter.column] === filter.value : filter.values.includes(row[filter.column]));
            rows = [...rows].sort((a, b) => a[read.order.column] - b[read.order.column]);
            return Promise.resolve({ data: rows.slice(start, end + 1), error: null });
          },
        };
        return query;
      },
    },
  };
}

function routeFor(database) {
  const server = new Proxy({ database: () => database, channel: () => "-1001234567890" }, {
    get(object, key) {
      if (key === "access" || key === "auth") throw Error("The public endpoint must not consult authentication");
      return object[key];
    },
  });
  return loadModule("app/api/vip/performance/route.ts", {
    "@/lib/telegram/server": server,
    "@/lib/telegram/engine": engine,
    "@/lib/vip/public-performance": helpers,
  });
}

const event = (id, parsed, reply_to = null) => ({
  chat_id: "-1001234567890", message_id: id, date: 1792500000 + id, reply_to, parsed,
});
const signal = { kind: "signal", signal: { asset: "GOLD", side: "BUY", entry: 100, sl: 90, targets: [120] } };

test("a visitor without login receives complete public results beyond 1,000 rows from both sources", async () => {
  const manualRows = Array.from({ length: 1001 }, (_, i) => manual({ id: i + 1 }));
  manualRows[1000] = manual({ id: 1001, status: "loss", result_r: -1 });
  const events = Array.from({ length: 1000 }, (_, i) => event(i + 1, { kind: "ignore" }));
  events.push(event(1001, signal), event(1002, { kind: "sl" }, 1001));
  // A different channel must not enter the performance feed.
  events.push({ ...event(1003, signal), chat_id: "-1009999999999" });
  const fake = fakeDatabase({ vip_trades: manualRows, investpro_telegram_events: events });
  const route = routeFor(fake.db);
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["trades"]);
  assert.equal(body.trades.length, 1002);
  assert.equal(body.trades.find(row => row.id === 1001).status, "loss");
  assert.equal(body.trades.find(row => row.id === -1001).result_r, -1);
  assert.equal(body.trades.some(row => row.id === -1003), false);
  assert.equal(fake.reads.filter(read => read.table === "vip_trades").length, 2);
  assert.equal(fake.reads.filter(read => read.table === "investpro_telegram_events").length, 2);
  for (const read of fake.reads) assert.equal(read.fields.includes("*"), false);
  assert.equal(fake.reads.find(read => read.table === "vip_trades").fields, "id,trade_date,symbol,direction,status,result_r,pips");
  assert.equal(fake.reads.find(read => read.table === "investpro_telegram_events").fields, "message_id,date,reply_to,parsed");
});

test("a source failure after a full page produces a generic 503 with no misleading partial totals", async () => {
  for (const table of ["vip_trades", "investpro_telegram_events"]) {
    const rows = Array.from({ length: 1000 }, (_, i) => table === "vip_trades" ? manual({ id: i + 1 }) : event(i + 1, { kind: "ignore" }));
    const fake = fakeDatabase({ [table]: rows }, (name, start) => name === table && start === 1000);
    const response = await routeFor(fake.db).GET();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ["error"]);
    assert.equal(JSON.stringify(body).includes("private database secret"), false);
  }
});

test("the read bound fails closed instead of silently publishing 100,000 rows as the complete history", async () => {
  let reads = 0;
  await assert.rejects(helpers.readCompletePerformancePages(async () => {
    reads++;
    return { data: Array(1000).fill({ id: 1 }), error: null };
  }), /history limit/);
  assert.equal(reads, 100);
  assert.deepEqual(plain(await helpers.readCompletePerformancePages(async () => ({ data: [], error: null }))), []);
});
