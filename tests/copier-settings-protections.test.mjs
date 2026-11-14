import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// Réglage d'un compte copieur : le moteur de copie n'applique automatiquement que les lots fixes. Une protection
// modifiée (SL/TP, ordres en attente, perte du jour, symboles…) part en demande à l'équipe, même en lots fixes,
// au lieu d'être enregistrée comme si elle était active.
const project = path.resolve(import.meta.dirname, "..");
const userId = "6f1c1b7e-58a4-4b7e-9d3c-0d4f2b1a9e11";
const receiverId = "c0ffee00-0000-4000-8000-000000000001";
const DEFAULTS = {
  mode: "fixed", fixed_lots: 0.01, mirror_multiplier: 1, balance_multiplier: 1, equity_multiplier: 1, risk_percent: 1,
  copy_sl: true, copy_tp: true, copy_pending: true, copy_modifications: true, slippage_pips: 2, max_lots: 100,
  drawdown_enabled: false, max_drawdown_percent: 5, symbol_mapping: "",
};
const SOURCE = [{ id: "master-1", name: "Compte perso", lots: 0.05 }];

function compile(file, modules, environment = {}) {
  const cjs = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(project, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module: cjs, exports: cjs.exports, Request, Response, URL, console, process: { env: environment },
    require(name) { assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name); return modules[name]; },
  });
  return cjs.exports;
}

function fixture({ savedRisk = null } = {}) {
  const calls = { receiverUpdates: [], requestInserts: [], notices: 0 };
  const receiverRow = { id: receiverId, config: savedRisk ? { risk_engine: savedRisk } : {} };
  const updateChain = (client) => (value) => {
    calls.receiverUpdates.push({ client, value });
    return { eq: () => ({ eq: async () => ({ error: null }) }) };
  };
  const userClient = {
    auth: { async getUser() { return { data: { user: { id: userId } }, error: null }; } },
    from(table) {
      assert.equal(table, "copier_receivers");
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: receiverRow, error: null }), update: updateChain("member") };
      return chain;
    },
  };
  const adminClient = {
    from(table) {
      if (table === "copier_receivers") return { update: updateChain("admin") };
      assert.equal(table, "copier_configuration_requests");
      const chain = {
        select: () => chain, eq: () => chain, in: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => ({ data: null }),
        insert(value) { calls.requestInserts.push(value); return { select: () => ({ single: async () => ({ data: { id: "request-1" }, error: null }) }) }; },
      };
      return chain;
    },
  };
  const route = compile("app/api/copier/settings/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabase/server": { createClient: async () => userClient },
    "@supabase/supabase-js": { createClient: () => adminClient },
    "@/lib/copier/masterOwnership": { assertOwnedMasters: async () => undefined },
    "@/lib/copier/notifications": {
      copierAdminUserIds: async () => [],
      createCopierNotice: async () => { calls.notices += 1; return { inserted: true }; },
      sendCopierEmail: async () => ({ sent: false, reason: "email_not_configured" }),
      sendCopierPush: async () => ({ sent: false, reason: "push_not_configured" }),
    },
  }, { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" });
  async function save(settings, masters = SOURCE) {
    const response = await route.PATCH(new Request("https://investprotrading.fr/api/copier/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiverId, settings, masters }),
    }));
    return { status: response.status, body: await response.json() };
  }
  return { calls, save };
}

test("fixed lots with unchanged protections are saved directly, without a team request", async () => {
  const api = fixture();
  const result = await api.save({ ...DEFAULTS });
  assert.equal(result.status, 200);
  assert.equal(result.body.requestStatus, "not_required");
  assert.equal(api.calls.requestInserts.length, 0);
  assert.equal(api.calls.receiverUpdates.length, 1);
  assert.equal(api.calls.receiverUpdates[0].client, "member");
  assert.equal(api.calls.receiverUpdates[0].value.config.risk_engine.mode, "fixed");
});

test("a protection changed in fixed lots becomes a team request and is not stored as active", async () => {
  for (const change of [{ copy_pending: false }, { copy_sl: false, copy_tp: false }, { drawdown_enabled: true, max_drawdown_percent: 3 }, { symbol_mapping: "XAUUSD = GOLD" }]) {
    const api = fixture();
    const result = await api.save({ ...DEFAULTS, ...change });
    assert.equal(result.status, 200, JSON.stringify(change));
    assert.equal(result.body.requestStatus, "pending", JSON.stringify(change));
    assert.equal(api.calls.requestInserts.length, 1, JSON.stringify(change));
    const requested = api.calls.requestInserts[0].requested_config;
    assert.equal(requested.risk.mode, "fixed");
    for (const [key, value] of Object.entries(change)) assert.equal(requested.risk[key], value, key);
    assert.deepEqual(JSON.parse(JSON.stringify(requested.masters)), [{ id: "master-1", name: "Compte perso", lots: 0.05 }]);
    // Seul l'état de la demande est noté sur le compte : aucune protection n'est enregistrée comme active.
    assert.ok(api.calls.receiverUpdates.every((update) => update.client === "admin" && !("risk_engine" in update.value.config)), JSON.stringify(change));
    assert.equal(api.calls.receiverUpdates[0].value.config.configuration_status, "pending");
  }
});

test("the maximum volume and an unused loss threshold never trigger a request in fixed lots", async () => {
  for (const change of [{ max_lots: 0.5 }, { max_drawdown_percent: 9 }]) {
    const api = fixture();
    const result = await api.save({ ...DEFAULTS, ...change });
    assert.equal(result.body.requestStatus, "not_required", JSON.stringify(change));
    assert.equal(api.calls.requestInserts.length, 0, JSON.stringify(change));
  }
});

test("protections already applied by the team do not trigger a new request when only the lots change", async () => {
  const applied = { ...DEFAULTS, copy_pending: false, drawdown_enabled: true, max_drawdown_percent: 4, symbol_mapping: "US30 = DJ30", provider_sync: "manually_confirmed_applied" };
  const api = fixture({ savedRisk: applied });
  const result = await api.save({ ...DEFAULTS, copy_pending: false, drawdown_enabled: true, max_drawdown_percent: 4, symbol_mapping: "US30 = DJ30\n" });
  assert.equal(result.body.requestStatus, "not_required");
  assert.equal(api.calls.requestInserts.length, 0);
});

test("every other volume mode is a request, and a request needs a source account", async () => {
  for (const mode of ["mirror", "balance", "equity", "percent"]) {
    const api = fixture();
    const result = await api.save({ ...DEFAULTS, mode });
    assert.equal(result.body.requestStatus, "pending", mode);
    assert.equal(api.calls.requestInserts[0].requested_config.risk.mode, mode);
  }
  const api = fixture();
  const refused = await api.save({ ...DEFAULTS, copy_pending: false }, []);
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /au moins un compte source/);
  assert.equal(api.calls.requestInserts.length + api.calls.receiverUpdates.length, 0);
});
