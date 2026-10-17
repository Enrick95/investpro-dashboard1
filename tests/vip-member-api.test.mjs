import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import ts from "typescript";

const project = path.resolve(import.meta.dirname, "..");
const userId = "83cfaf59-8e27-47e4-b64b-3d17fc501102";

function compile(file, modules = {}) {
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(project, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module: compiledModule, exports: compiledModule.exports, URL, Request, Response,
    process: { env: { VERCEL_ENV: "production" } },
    require: name => {
      assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name);
      return modules[name];
    },
  });
  return compiledModule.exports;
}

function fixture({ authorized = true, membershipType = "affiliation", existingInvitationMember = false } = {}) {
  const calls = { inserts: [], updates: [], rpcs: [], permissions: [] };
  const admin = {
    from(table) {
      const filters = new Map();
      let inserted;
      const chain = {
        select() { return chain; },
        eq(column, value) { filters.set(column, value); return chain; },
        async maybeSingle() {
          assert.equal(table, "vip_memberships");
          return { data: filters.has("user_id") || existingInvitationMember ? { user_id: userId, type: membershipType } : null, error: null };
        },
        insert(value) { inserted = value; calls.inserts.push({ table, value }); return chain; },
        update(value) { calls.updates.push({ table, value }); return chain; },
        async single() { return { data: { id: "fixture-invitation", ...inserted }, error: null }; },
      };
      return chain;
    },
    async rpc(name, args) {
      calls.rpcs.push({ name, args });
      return { data: { user_id: userId, type: membershipType, first_name: args.p_first_name, last_name: args.p_last_name, affiliation_broker: args.p_affiliation_broker }, error: null };
    },
  };
  const route = compile("app/api/admin/vip/members/route.ts", {
    "next/server": { after() { /* Deferred provider work is covered by vip-access-confirmations tests. */ } },
    "@/lib/vip/access-confirmations": { async deliverVipAccessConfirmations() { return { sent: 0 }; } },
    "@/lib/vip/notifications": { async deliverVipNotifications() { return { sent: 0 }; } },
    "@/lib/admin/permissions": { async authenticateAdmin(_request, permission) {
      calls.permissions.push(permission);
      return authorized ? { user: { id: "admin-fixture" }, admin } : { error: "Non authentifié", status: 401 };
    } },
    "@/lib/vip/membership": compile("lib/vip/membership.ts"),
    "@/lib/vip/identity": compile("lib/vip/identity.ts"),
    "@/lib/vip/membership-server": {
      async readVipJson(request) { return request.json(); },
      createVipInvitationCode: type => `IP-${type === "affiliation" ? "AFF" : "ABO"}-${"F".repeat(48)}`,
      hashVipInvitationCode: code => createHash("sha256").update(code).digest("hex"),
      VIP_INVITATION_COLUMNS: "id,email,type,first_name,last_name,affiliation_broker",
      VIP_MEMBERSHIP_COLUMNS: "user_id,email,type,first_name,last_name,affiliation_broker",
      vipJson: (body, status = 200) => Response.json(body, { status }),
      vipErrorResponse: () => Response.json({ error: "Fixture unexpected failure" }, { status: 503 }),
    },
  });
  async function post(body) {
    const response = await route.POST(new Request("https://investprotrading.fr/api/admin/vip/members", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://investprotrading.fr" }, body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  }
  return { calls, post };
}

const invitation = { action: "invite", email: "member@example.invalid", type: "affiliation", firstName: "Élodie", lastName: "D’Ávila", affiliationBroker: "axi" };

test("every supported affiliation broker and Unicode identity is stored on a new invitation", async () => {
  for (const affiliationBroker of ["raise_fx", "vantage", "puprime", "axi"]) {
    const { post, calls } = fixture();
    const response = await post({ ...invitation, firstName: "  Jean-Luc  ", lastName: "  D’Ávila  ", affiliationBroker });
    assert.equal(response.status, 201);
    assert.equal(calls.inserts.length, 1);
    const inserted = calls.inserts[0];
    assert.equal(inserted.table, "vip_invitations");
    assert.equal(inserted.value.first_name, "Jean-Luc");
    assert.equal(inserted.value.last_name, "D’Ávila");
    assert.equal(inserted.value.affiliation_broker, affiliationBroker);
    assert.match(inserted.value.code_hash, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(inserted.value, "code"), false);
    assert.deepEqual(calls.permissions, ["users_write"]);
  }
});

test("missing or invalid affiliation origins and identities never insert an invitation", async () => {
  for (const changes of [
    { affiliationBroker: undefined }, { affiliationBroker: "" }, { affiliationBroker: "unknown" }, { affiliationBroker: ["axi"] },
    { firstName: undefined }, { firstName: "" }, { firstName: "   " }, { firstName: 123 }, { firstName: { name: "Anne" } },
    { lastName: undefined }, { lastName: [] }, { lastName: "Du\npont" }, { lastName: "Du\u202Epont" }, { lastName: "A".repeat(81) },
  ]) {
    const { post, calls } = fixture();
    const response = await post({ ...invitation, ...changes });
    assert.equal(response.status, 400, JSON.stringify(changes));
    assert.equal(calls.inserts.length, 0);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.rpcs.length, 0);
  }
});

test("names are trimmed and Unicode-normalized without restricting international printable names", async () => {
  const { post, calls } = fixture();
  const response = await post({ ...invitation, firstName: "  E\u0301lodie  ", lastName: "  O'Connor-李  " });
  assert.equal(response.status, 201);
  assert.equal(calls.inserts[0].value.first_name, "Élodie");
  assert.equal(calls.inserts[0].value.last_name, "O'Connor-李");
});

test("subscription invitations clear any stale affiliation choice without changing monthly scheduling", async () => {
  const { post, calls } = fixture();
  const response = await post({ ...invitation, type: "abonnement", affiliationBroker: "vantage", expires_at: "2099-01-01", started_at: "1900-01-01" });
  assert.equal(response.status, 201);
  const inserted = calls.inserts[0].value;
  assert.equal(inserted.affiliation_broker, null);
  assert.equal(inserted.type, "abonnement");
  for (const field of ["expires_at", "started_at", "status", "renewal_requested_at"]) assert.equal(Object.hasOwn(inserted, field), false, field);
});

test("anonymous requests cannot create invitations or change an identity", async () => {
  for (const body of [invitation, { action: "updateIdentity", userId, firstName: "Anne", lastName: "Dupont", affiliationBroker: "axi" }]) {
    const { post, calls } = fixture({ authorized: false });
    assert.equal((await post(body)).status, 401);
    assert.equal(calls.inserts.length + calls.updates.length + calls.rpcs.length, 0);
  }
});

test("identity edits use the service-only RPC and never forward client-supplied access dates or role fields", async () => {
  const { post, calls } = fixture();
  const response = await post({
    action: "updateIdentity", userId, firstName: "  Anne-Marie ", lastName: " O'Connor ", affiliationBroker: "puprime",
    type: "abonnement", status: "active", started_at: "1900-01-01", expires_at: "2099-01-01", renewal_requested_at: null, admin: true,
  });
  assert.equal(response.status, 200);
  assert.equal(calls.inserts.length + calls.updates.length, 0);
  assert.equal(calls.rpcs.length, 1);
  assert.equal(calls.rpcs[0].name, "vip_update_identity");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.rpcs[0].args)), {
    p_user_id: userId, p_first_name: "Anne-Marie", p_last_name: "O'Connor", p_affiliation_broker: "puprime",
  });
  assert.deepEqual(calls.permissions, ["users_write"]);
});

test("identity validation uses the stored membership type instead of an arbitrary request type", async () => {
  const affiliation = fixture({ membershipType: "affiliation" });
  const rejected = await affiliation.post({ action: "updateIdentity", userId, firstName: "Anne", lastName: "Dupont", type: "abonnement" });
  assert.equal(rejected.status, 400);
  assert.equal(affiliation.calls.rpcs.length, 0);

  const subscription = fixture({ membershipType: "abonnement" });
  const accepted = await subscription.post({ action: "updateIdentity", userId, firstName: "Anne", lastName: "Dupont", type: "affiliation", affiliationBroker: "axi" });
  assert.equal(accepted.status, 200);
  assert.equal(subscription.calls.rpcs[0].args.p_affiliation_broker, null);
});
