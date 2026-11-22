import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// Le Google Sheet d'Enrick lit les inscriptions VIP et les essais toutes les 5 minutes (docs/google-sheet/inscriptions-vip.gs).
const project = path.resolve(import.meta.dirname, "..");
const read = file => fs.readFileSync(path.join(project, file), "utf8");

function compile(file, modules = {}, env = {}) {
  const cjs = { exports: {} };
  const output = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = name => { if (name in modules) return modules[name]; throw new Error(`module inattendu : ${name}`); };
  vm.runInNewContext(output, { module: cjs, exports: cjs.exports, require, process: { env }, Response, Request, Buffer, Date, JSON, Promise, Number, Math, Set, console });
  return cjs.exports;
}
const identity = compile("lib/vip/identity.ts");
const sheet = compile("lib/integrations/google-sheet.ts", { "@/lib/vip/identity": identity });

const applications = [
  { id: "app-1", created_at: "2026-11-10T09:00:00Z", first_name: "karim", last_name: "B", verified_first_name: "Karim", verified_last_name: "Benali", email: "karim@example.invalid", phone_whatsapp: "+33612345678", telegram_username: "karim_fx", affiliation_broker: "bullwaves", verified_affiliation_broker: "bullwaves", broker_account_kind: "new", deposit_range: "500-999", declared_deposit_usd: 500, verified_deposit_usd: 650, status: "claimed", reviewed_at: "2026-11-11T08:00:00Z", claim_request_id: "req-claim" },
  { id: "app-2", created_at: "2026-11-20T09:00:00Z", first_name: "Sarah", last_name: "Diallo", email: "sarah@example.invalid", phone_whatsapp: "+32470000000", telegram_username: "sarahd", affiliation_broker: "vtmarkets", broker_account_kind: "existing", deposit_range: "300-499", declared_deposit_usd: 300, verified_deposit_usd: null, status: "submitted", reviewed_at: null, claim_request_id: null },
  { id: "app-3", created_at: "2026-11-21T09:00:00Z", first_name: "=HYPERLINK(\"x\")", last_name: "Test", email: "t@example.invalid", phone_whatsapp: "+33600000000", telegram_username: "testeur", affiliation_broker: "axi", broker_account_kind: "new", deposit_range: "1000-plus", declared_deposit_usd: 1000, verified_deposit_usd: 1200, status: "denied", reviewed_at: "2026-11-21T10:00:00Z", claim_request_id: null },
];
const requests = [
  { id: "req-claim", created_at: "2026-11-11T08:05:00Z", first_name: "Karim", last_name: "Benali", email: "karim@example.invalid", type: "affiliation", request_kind: "new", status: "approved" },
  { id: "req-abo", created_at: "2026-11-05T12:00:00Z", first_name: "Lina", last_name: "Martin", email: "lina@example.invalid", phone_whatsapp: "+33700000000", telegram_username: "@lina", type: "abonnement", affiliation_broker: null, deposit_range: null, declared_deposit_usd: null, verified_deposit_usd: null, status: "approved", reviewed_at: "2026-11-05T13:00:00Z", request_kind: "new" },
  { id: "req-old", created_at: "2026-10-01T12:00:00Z", first_name: "Yanis", last_name: "K", email: "y@example.invalid", type: "affiliation", affiliation_broker: "puprime", broker_account_kind: "new", deposit_range: null, declared_deposit_usd: 750, verified_deposit_usd: null, status: "pending", request_kind: "new" },
  { id: "req-existing", created_at: "2026-10-02T12:00:00Z", first_name: "Déjà", last_name: "Membre", email: "d@example.invalid", type: "affiliation", status: "approved", request_kind: "existing" },
];

test("each VIP signup appears once, with its type, broker, declared and verified deposit, and status", () => {
  const rows = sheet.sheetSignups(applications, requests);
  assert.deepEqual(Array.from(rows, r => r.id), ["req-old", "req-abo", "app-1", "app-2", "app-3"], "du plus ancien au plus récent, sans doublon ni déjà-membre");
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.deepEqual({ ...byId["app-1"] }, {
    id: "app-1", date_inscription: "2026-11-10T09:00:00.000Z", type: "Affiliation", prenom: "Karim", nom: "Benali", email: "karim@example.invalid",
    telephone: "+33612345678", telegram: "@karim_fx", broker: "Bullwaves", depot_declare: "500 $ à 999 $", depot_verifie: 650, statut: "Validé", date_validation: "2026-11-11T08:00:00.000Z",
  });
  assert.equal(byId["app-2"].type, "Rattachement");
  assert.equal(byId["app-2"].statut, "À vérifier");
  assert.equal(byId["app-2"].depot_verifie, null);
  assert.equal(byId["app-2"].date_validation, null);
  assert.equal(byId["app-3"].statut, "Refusé");
  assert.equal(byId["app-3"].depot_verifie, null, "un dossier refusé n'a pas de dépôt vérifié");
  assert.equal(byId["app-3"].depot_declare, "1 000 $ ou plus");
  assert.equal(byId["req-abo"].type, "Abonnement");
  assert.equal(byId["req-abo"].broker, "");
  assert.equal(byId["req-abo"].depot_declare, "");
  assert.equal(byId["req-abo"].telegram, "@lina");
  assert.equal(byId["req-abo"].statut, "Validé");
  assert.equal(byId["req-old"].broker, "PU Prime");
  assert.equal(byId["req-old"].depot_declare, `${(750).toLocaleString("fr-FR")} $`);
});

test("trial requests get the admin status words and the follow-up fields", () => {
  const rows = sheet.sheetTrials([
    { id: "t2", submitted_at: "2026-11-12T10:00:00Z", prenom: "Inès", nom_famille: "Haddad", email: "ines@example.invalid", telephone: "+33611111111", telegram: "ines_t", broker: "Raise FX", status: "demo_active", channel_joined: true, last_contacted_at: "2026-11-13T10:00:00Z", next_follow_up_on: "2026-11-25" },
    { id: "t1", submitted_at: "2026-11-06T10:00:00Z", nom: "Jean Pierre Dupont", email: "jp@example.invalid", telephone: "+33622222222", telegram: "@jp", broker: "Bullwaves", status: "new", channel_joined: false, last_contacted_at: null, next_follow_up_on: null, demo_password_encrypted: "ne-doit-jamais-sortir" },
  ]);
  assert.deepEqual(Array.from(rows, r => r.id), ["t1", "t2"]);
  assert.deepEqual({ ...rows[0] }, { id: "t1", date_demande: "2026-11-06T10:00:00.000Z", prenom: "Jean", nom: "Pierre Dupont", email: "jp@example.invalid", telephone: "+33622222222", telegram: "@jp", broker: "Bullwaves", statut: "Nouveau", canal_rejoint: "Non", dernier_contact: null, prochaine_relance: null });
  assert.equal(rows[1].statut, "Démo branchée");
  assert.equal(rows[1].canal_rejoint, "Oui");
  assert.equal(rows[1].prochaine_relance, "2026-11-25");
  assert.ok(!JSON.stringify(rows).includes("ne-doit-jamais-sortir"));
});

test("the export never reads proofs, passwords or MetaTrader accounts", () => {
  for (const columns of [sheet.SHEET_APPLICATION_COLUMNS, sheet.SHEET_REQUEST_COLUMNS, sheet.SHEET_TRIAL_COLUMNS]) {
    for (const forbidden of ["proof", "password", "secret", "broker_account_id", "mt_server", "compte", "serveur", "suivi_token", "broker_email", "admin_notes"]) {
      assert.ok(!columns.split(",").some(c => c.includes(forbidden)), `${forbidden} ne part jamais dans le Sheet`);
    }
  }
});

function fakeSupabase(tables, calls) {
  return {
    createClient: () => ({
      from(table) {
        const query = { table, filters: [] };
        const builder = {
          select(columns) { query.columns = columns; return builder; },
          eq(column, value) { query.filters.push([column, value]); return builder; },
          order() { return builder; },
          limit() {
            calls.push(query);
            return Promise.resolve({ data: (tables[table] ?? []).filter(row => query.filters.every(([c, v]) => row[c] === v)), error: null });
          },
        };
        return builder;
      },
    }),
  };
}

test("the Sheet route answers only with the right key, and the site keeps only its SHA-256", async () => {
  const key = crypto.randomBytes(32).toString("base64url");
  const env = { GOOGLE_SHEET_SYNC_KEY_SHA256: crypto.createHash("sha256").update(key).digest("hex"), NEXT_PUBLIC_SUPABASE_URL: "https://db.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "service" };
  const calls = [];
  const modules = { "@supabase/supabase-js": fakeSupabase({ vip_member_applications: applications, vip_access_requests: requests, essai_vip_leads: [] }, calls), "node:crypto": crypto, "@/lib/integrations/google-sheet": sheet };
  const route = compile("app/api/integrations/google-sheet/route.ts", modules, env);
  const call = headers => route.GET(new Request("https://investprotrading.fr/api/integrations/google-sheet", { headers }));
  assert.equal((await call({})).status, 401);
  assert.equal((await call({ authorization: "Bearer " + crypto.randomBytes(32).toString("base64url") })).status, 401);
  assert.equal((await call({ authorization: key })).status, 401, "Bearer obligatoire");
  assert.equal(calls.length, 0, "rien n'est lu sans la bonne clé");
  const ok = await call({ authorization: "Bearer " + key });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const body = await ok.json();
  assert.equal(body.inscriptions.length, 5);
  assert.deepEqual(body.essais, []);
  assert.deepEqual(calls.find(c => c.table === "vip_access_requests").filters, [["request_kind", "new"]]);
  const withoutHash = compile("app/api/integrations/google-sheet/route.ts", modules, { ...env, GOOGLE_SHEET_SYNC_KEY_SHA256: "" });
  assert.equal((await withoutHash.GET(new Request("https://investprotrading.fr/api/integrations/google-sheet", { headers: { authorization: "Bearer " + key } }))).status, 401);
});

test("the script kept in the repository has no real key", () => {
  const script = read("docs/google-sheet/inscriptions-vip.gs");
  assert.match(script, /var CLE = "COLLE_LA_CLE_ICI";/);
  assert.match(script, /https:\/\/investprotrading\.fr\/api\/integrations\/google-sheet/);
  assert.match(script, /everyMinutes\(5\)/);
});
