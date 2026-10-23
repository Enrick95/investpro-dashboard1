import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../app/dashboard/comptes/page.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name) {
  let result;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(parsed);
    if (!result) ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(result, "Missing real page function: " + name);
  return result;
}
function compile(names, globals = {}) {
  const cjs = { exports: {} };
  const code = names.map(declaration).join("\n") + "\nmodule.exports = {" + names.join(",") + "};";
  vm.runInNewContext(ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: cjs, exports: cjs.exports, require, ...globals });
  return cjs.exports;
}
const { unconfirmedHostedAccountStates: states } = compile(["unconfirmedHostedAccountStates"]);
const plain = value => JSON.parse(JSON.stringify(value));
const row = (status = "queued", connection = {}, extra = {}) => ({
  active: true, status, investpro_mt_connections: { account_id: 7, last_sync: null, observed_at: null, ...connection }, ...extra,
});

test("new active accounts stay unconfirmed across queued, connecting, syncing and error states", () => {
  for (const status of ["queued", "connecting", "syncing", "active"]) {
    assert.deepEqual(plain(states([row(status)])), { 7: "pending" });
  }
  for (const status of ["error", "failed", "disconnected"]) {
    assert.deepEqual(plain(states([row(status)])), { 7: "error" });
  }
});

test("either confirmed broker timestamp permits a real zero; a refresh is not itself confirmation", () => {
  for (const timestamp of ["last_sync", "observed_at"]) {
    assert.deepEqual(plain(states([row("syncing", { [timestamp]: "2026-10-23T15:30:00Z" })])), {});
  }
  assert.deepEqual(plain(states([row("syncing", { last_sync: "invalid", observed_at: "" })])), { 7: "pending" });
});

test("pending markers remain account-scoped and never affect manual or inactive accounts", () => {
  assert.deepEqual(plain(states([row(), row("queued", { account_id: 8 }, { active: false })])), { 7: "pending" });
  for (const input of [null, {}, undefined, [], [null], [row("queued", { account_id: null })], [row("queued", { account_id: "" })], [row("queued", { account_id: false })], [row("queued", { account_id: 0 })], [row("queued", { account_id: 7.5 })]]) {
    assert.deepEqual(plain(states(input)), {});
  }
});

test("nested relation arrays work and duplicate placeholders cannot override a confirmed read", () => {
  const confirmed = row("syncing", { observed_at: "2026-10-23T15:30:00Z" });
  assert.deepEqual(plain(states([row("queued", {}, { investpro_mt_connections: [{ account_id: "7", last_sync: null }] })])), { 7: "pending" });
  assert.deepEqual(plain(states([row(), confirmed])), {});
  assert.deepEqual(plain(states([confirmed, row()])), {});
});

const { AccountCard } = compile(["formatMoney", "accountTypeLabel", "AccountCard"], {
  useLocale: () => ({ t: text => text }),
  ...require("lucide-react"),
});
const account = { id: 7, name: "REAL3", account_type: "real", platform: "MT5", broker: "offline-test", currency: "EUR", current_balance: 0, initial_balance: 0, connection_type: "automatic" };
const renderCard = (readState) => renderToStaticMarkup(React.createElement(AccountCard, {
  account, readState, deleting: false, deleteDisabled: false, onEdit() {}, onDelete() {},
}));

test("the actual account card hides both unconfirmed zeros with the first-read explanation", () => {
  const html = renderCard("pending");
  assert.equal((html.match(/>—</g) || []).length, 2);
  assert.match(html, /En attente du premier relevé MetaTrader\./);
  assert.doesNotMatch(html, /0,00/);
});

test("the actual error card explains the unavailable read without guessing its cause", () => {
  const html = renderCard("error");
  assert.equal((html.match(/>—</g) || []).length, 2);
  assert.match(html, /Premier relevé MetaTrader indisponible/);
  assert.doesNotMatch(html, /mot de passe|authentification|0,00/i);
});

test("the actual card preserves a confirmed zero and an unchanged manual account", () => {
  const html = renderCard(undefined);
  assert.equal((html.match(/0,00/g) || []).length, 2);
  assert.doesNotMatch(html, /relevé MetaTrader/);
});

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

function harness(options = {}) {
  const data = { readStates: { 7: "pending" }, accounts: [{ id: 7, current_balance: 0 }], origins: {}, notifications: [], loading: [], events: [] };
  const refs = { mountedRef: { current: true }, accountLoadRequestRef: { current: 0 }, accountLoadBusyRef: { current: false }, deletingRef: { current: false } };
  let hostedIndex = 0;
  let accountIndex = 0;
  const globals = {
    ...refs,
    console: { error() {} },
    window: { location: { href: "" } },
    pushNotif: value => data.notifications.push(value),
    setLoading: value => data.loading.push(value),
    setUserId: () => {},
    setAccounts: value => { data.accounts = value; },
    setAccountReadStates: value => { data.readStates = value; },
    setCopierOrigins: value => { data.origins = value; },
    fetch: async url => {
      data.events.push(url);
      if (url.includes("hosted")) {
        const entry = options.hosted?.[hostedIndex++] ?? { ok: true, body: { connections: [row()] } };
        const result = await entry;
        return { ok: result.ok, json: async () => result.body };
      }
      return { ok: true, json: async () => ({ requests: [] }) };
    },
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "offline-user" } }, error: null }) },
      from(table) {
        if (table === "copier_receivers") return { select: () => ({ eq: async () => ({ data: [] }) }) };
        assert.equal(table, "trading_accounts");
        return { select: () => ({ order: async () => {
          data.events.push("balances");
          return await (options.accounts?.[accountIndex++] ?? { data: [{ id: 7, current_balance: 325 }], error: null });
        } }) };
      },
    },
  };
  const { loadAccounts } = compile(["unconfirmedHostedAccountStates", "loadAccounts"], globals);
  return { loadAccounts, data, refs };
}

test("silent refresh keeps pending metadata during API failure and does not flash loading or a toast", async () => {
  const h = harness({ hosted: [{ ok: false }] });
  await h.loadAccounts(true);
  assert.deepEqual(plain(h.data.readStates), { 7: "pending" });
  assert.deepEqual(h.data.loading, []);
  assert.deepEqual(h.data.notifications, []);
  assert.equal(h.refs.accountLoadBusyRef.current, false);
});

test("a first confirmation is read before its balance, then clears pending and preserves broker zero", async () => {
  const read = deferred();
  const h = harness({ hosted: [read.promise], accounts: [{ data: [{ id: 7, current_balance: 0 }], error: null }] });
  const pending = h.loadAccounts(true);
  await flush();
  assert.equal(h.data.events.includes("balances"), false);
  read.resolve({ ok: true, body: { connections: [row("syncing", { last_sync: "2026-10-23T15:30:00Z" })] } });
  await pending;
  assert.deepEqual(plain(h.data.readStates), {});
  assert.equal(h.data.accounts[0].current_balance, 0);
  assert.deepEqual(h.data.loading, []);
});

test("a later foreground refresh wins over an older delayed response", async () => {
  const old = deferred();
  const h = harness({ hosted: [old.promise, { ok: true, body: { connections: [row("error")] } }] });
  const first = h.loadAccounts(true);
  await flush();
  await h.loadAccounts();
  assert.deepEqual(plain(h.data.readStates), { 7: "error" });
  old.resolve({ ok: true, body: { connections: [row()] } });
  await first;
  assert.deepEqual(plain(h.data.readStates), { 7: "error" });
  assert.equal(h.data.events.filter(value => value === "balances").length, 1);
  assert.deepEqual(h.data.loading, [true, false]);
});

test("overlapping silent polls and polls during deletion are skipped", async () => {
  const wait = deferred();
  const h = harness({ hosted: [wait.promise] });
  const first = h.loadAccounts(true);
  await flush();
  await h.loadAccounts(true);
  assert.equal(h.data.events.filter(value => value.includes("hosted")).length, 1);
  wait.resolve({ ok: true, body: { connections: [row()] } });
  await first;
  h.refs.deletingRef.current = true;
  await h.loadAccounts(true);
  assert.equal(h.data.events.filter(value => value.includes("hosted")).length, 1);
});

test("an unmounted or invalidated load cannot apply its delayed balances or metadata", async () => {
  for (const mode of ["unmounted", "invalidated"]) {
    const balance = deferred();
    const h = harness({ accounts: [balance.promise] });
    const pending = h.loadAccounts(true);
    await flush();
    if (mode === "unmounted") h.refs.mountedRef.current = false;
    else h.refs.accountLoadRequestRef.current += 1;
    balance.resolve({ data: [{ id: 7, current_balance: 9999 }], error: null });
    await pending;
    assert.equal(h.data.accounts[0].current_balance, 0);
    assert.deepEqual(plain(h.data.readStates), { 7: "pending" });
  }
});
