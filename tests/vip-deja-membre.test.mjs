import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const project = path.resolve(import.meta.dirname, "..");
const userId = "83cfaf59-8e27-47e4-b64b-3d17fc501102";
const requestId = "ddba72f8-8b73-409a-8628-cb427c82ef61";
const CODE = "Ab3d-Ef7g-Hk9m";

function compile(file, modules = {}, environment = {}) {
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(project, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module: compiledModule, exports: compiledModule.exports, URL, Request, Response, Date, console, process: { env: environment },
    require: name => {
      assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name);
      return modules[name];
    },
  });
  return compiledModule.exports;
}

const identity = compile("lib/vip/identity.ts");
const membership = compile("lib/vip/membership.ts");
const intake = compile("lib/vip/existing-member-intake.ts", { "@/lib/vip/identity": identity });
const accessCode = compile("lib/vip/access-code.ts");

function fixture({
  session = null, existingEmail = false, password = "Bon-Mot-De-Passe1", membershipRow = null, latestRequest = null,
  duplicate = false, limited = false, environment = "production",
} = {}) {
  const calls = { created: [], signIns: [], inserts: [], limits: 0, alerts: [], deferred: [], passwordUpdates: [] };
  const db = {
    from(table) {
      const query = { table, insert: null };
      const chain = {
        select() { return chain; }, eq() { return chain; }, order() { return chain; }, limit() { return chain; },
        insert(value) { query.insert = value; calls.inserts.push({ table, value }); return chain; },
        async maybeSingle() { return { data: table === "vip_memberships" ? membershipRow : latestRequest, error: null }; },
        async single() {
          if (duplicate) return { data: null, error: { code: "23505" } };
          return { data: { id: requestId, ...query.insert }, error: null };
        },
      };
      return chain;
    },
    auth: { admin: {
      async createUser(input) {
        calls.created.push(input);
        if (existingEmail) return { data: { user: null }, error: { message: "A user with this email address has already been registered", code: "email_exists" } };
        return { data: { user: { id: userId, email: input.email, user_metadata: input.user_metadata } }, error: null };
      },
      async updateUserById(...args) { calls.passwordUpdates.push(args); return { data: {}, error: null }; },
    } },
  };
  const cookieClient = { auth: { async signOut() { calls.signOuts = (calls.signOuts || 0) + 1; return { error: null }; }, async signInWithPassword(input) {
    calls.signIns.push(input);
    const ok = input.password === CODE || input.password === password;
    return ok ? { data: { user: { id: userId, email: input.email, user_metadata: {} }, session: { access_token: "a" } }, error: null } : { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
  } } };
  class VipRequestError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const modules = {
    "next/server": { after(callback) { calls.deferred.push(callback); } },
    "@/lib/supabase/server": { async createClient() { return cookieClient; } },
    "@/lib/vip/membership-server": {
      async authenticateVip() { return session ? { user: session, db, admin: false } : { error: "Session invalide.", status: 401 }; },
      async readVipJson(request) {
        if (request.headers.get("origin") !== "https://investprotrading.fr") throw new VipRequestError("Origine de la requête refusée.", 403);
        return request.json();
      },
      vipDatabase: () => db,
      vipJson: (body, status = 200) => Response.json(body, { status }),
      vipErrorResponse: error => Response.json({ error: error.message }, { status: error.status || 503 }),
    },
    "@/lib/vip/membership": membership,
    "@/lib/vip/access-requests": { VIP_ACCESS_REQUEST_COLUMNS: "id,user_id,email" },
    "@/lib/vip/access-account": { generateAccessCode: () => CODE },
    "@/lib/vip/access-code": accessCode,
    "@/lib/vip/existing-member-intake": intake,
    "@/lib/essai-vip-rate-limit": { async consumeEssaiVipRateLimit() { calls.limits += 1; return limited ? { allowed: false, retryAfterSeconds: 120 } : { allowed: true, retryAfterSeconds: 0 }; } },
    "@/lib/vip/admin-activity": { async queueVipAdminActivity() { return {}; } },
    "@/lib/vip/notifications": { async deliverVipNotifications() { return {}; } },
    "@/lib/vip/admin-request-alert": { async notifyAdminNewVipRequest(row) { calls.alerts.push(row); } },
  };
  const route = compile("app/api/vip/deja-membre/route.ts", modules, { VERCEL_ENV: environment });
  async function call(method, body, origin = "https://investprotrading.fr") {
    const response = await route[method](new Request("https://investprotrading.fr/api/vip/deja-membre", {
      method, headers: { "Content-Type": "application/json", Origin: origin }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { calls, get: () => call("GET"), post: (body, origin) => call("POST", body, origin), del: origin => call("DELETE", undefined, origin), flush: async () => { for (const job of calls.deferred) await job(); } };
}

const member = { firstName: "  Élodie ", lastName: "D’Ávila", email: "Member@Example.org" };
const plain = value => JSON.parse(JSON.stringify(value));

test("a channel member gets an InvestPro account and its code on the page, and a pending request for the team", async () => {
  const api = fixture();
  const response = await api.post(member);
  assert.equal(response.status, 201);
  assert.equal(response.body.accessCode, CODE);
  assert.equal(response.body.created, true);
  assert.equal(response.body.signedIn, true);
  assert.equal(response.body.state, "pending");
  assert.deepEqual(plain(api.calls.created[0]), { email: "member@example.org", password: CODE, email_confirm: true, user_metadata: { first_name: "Élodie", last_name: "D’Ávila" } });
  assert.deepEqual(plain(api.calls.signIns), [{ email: "member@example.org", password: CODE }]);
  assert.equal(api.calls.inserts.length, 1);
  assert.deepEqual(plain(api.calls.inserts[0]), { table: "vip_access_requests", value: {
    user_id: userId, email: "member@example.org", first_name: "Élodie", last_name: "D’Ávila", telegram_username: null, phone_whatsapp: null,
    type: "affiliation", affiliation_broker: null, paid_on: null, request_kind: "existing", status: "pending",
  } });
  assert.equal(api.calls.limits, 1);
  assert.equal(api.calls.alerts.length, 0);
  await api.flush();
  assert.equal(api.calls.alerts.length, 1);
  assert.equal(api.calls.alerts[0].request_kind, "existing");
});

test("WhatsApp and Telegram are optional but normalized when given", async () => {
  const api = fixture();
  const response = await api.post({ ...member, phone: "0033 6 12-34.56 78", telegram: "https://t.me/Mon_Pseudo" });
  assert.equal(response.status, 201);
  assert.equal(api.calls.inserts[0].value.phone_whatsapp, "+33612345678");
  assert.equal(api.calls.inserts[0].value.telegram_username, "mon_pseudo");
  for (const [field, value] of [["phone", "06 12 34 56 78"], ["phone", "+33 6"], ["telegram", "@ab"], ["telegram", "1abcde"]]) {
    const invalid = fixture();
    const result = await invalid.post({ ...member, [field]: value });
    assert.equal(result.status, 400, `${field}=${value}`);
    assert.equal(result.body.field, field);
    assert.equal(invalid.calls.created.length + invalid.calls.inserts.length + invalid.calls.limits, 0);
  }
});

test("the broker the member picks goes on the request; « Autre broker » leaves the origin to confirm", async () => {
  for (const [broker, saved] of [["vtmarkets", "vtmarkets"], ["raise_fx", "raise_fx"], ["puprime", "puprime"], ["axi", "axi"], ["bullwaves", "bullwaves"], ["vantage", "vantage"], ["autre", null]]) {
    const api = fixture();
    const response = await api.post({ ...member, broker });
    assert.equal(response.status, 201, broker);
    assert.equal(api.calls.inserts[0].value.affiliation_broker, saved, broker);
    assert.equal(api.calls.inserts[0].value.type, "affiliation");
    assert.equal(api.calls.inserts[0].value.paid_on, null);
  }
  const invalid = fixture();
  const result = await invalid.post({ ...member, broker: "binance" });
  assert.equal(result.status, 400);
  assert.equal(result.body.field, "broker");
  assert.equal(invalid.calls.created.length + invalid.calls.inserts.length + invalid.calls.limits, 0, "Nothing is created for an unknown broker");
});

test("a subscriber gives the date of their last payment, and the request is a subscription to check in Stripe", async () => {
  const api = fixture();
  const response = await api.post({ ...member, broker: "abonnement", paidOn: "2026-10-28" });
  assert.equal(response.status, 201);
  const row = api.calls.inserts[0].value;
  assert.equal(row.type, "abonnement");
  assert.equal(row.paid_on, "2026-10-28");
  assert.equal(row.affiliation_broker, null, "A subscription has no broker");
  // A page opened before the date field existed sends no date: the origin stays to confirm.
  const older = fixture();
  await older.post({ ...member, broker: "abonnement" });
  assert.equal(older.calls.inserts[0].value.type, "affiliation");
  assert.equal(older.calls.inserts[0].value.paid_on, null);
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  for (const paidOn of ["2026-02-30", "28/10/2026", tomorrow, "1999-12-31"]) {
    const invalid = fixture();
    const result = await invalid.post({ ...member, broker: "abonnement", paidOn });
    assert.equal(result.status, 400, paidOn);
    assert.equal(result.body.field, "paidOn", paidOn);
    assert.equal(invalid.calls.created.length + invalid.calls.inserts.length + invalid.calls.limits, 0, paidOn);
  }
});

test("right after the access code, the page offers to connect MetaTrader through the site's own connector, and never keeps the password", () => {
  const page = fs.readFileSync(path.join(project, "public/vip-deja-membre-v2.html"), "utf8");
  const screens = [...page.matchAll(/<section class="screen" data-s="(\d)"/g)].map(match => Number(match[1]));
  assert.deepEqual(screens, [1, 2, 3, 4, 5], "Infos, code, MetaTrader, alerts, waiting");
  const step = page.slice(page.indexOf('<section class="screen" data-s="3"'), page.indexOf('<section class="screen" data-s="4"'));
  assert.match(step, /<h2>Ton compte MetaTrader<\/h2>/);
  assert.match(step, /<input id="mtPwd" type="password" autocomplete="new-password"/, "The MetaTrader password is a masked field browsers do not fill with the site password");
  // Site connections accept the master password (allow_trading_password): the member gives the one they log in with,
  // and the consent box says plainly that it can also trade, and that InvestPro never shows it nor places an order.
  assert.match(step, /<label for="mtPwd">Mot de passe MetaTrader<\/label>/);
  assert.match(step, /Celui avec lequel tu te connectes à MetaTrader\. Ton mot de passe investisseur marche aussi\./);
  assert.match(step, /<input type="checkbox" id="mtOk"><span>[^<]*Je sais que le mot de passe principal permet aussi de trader : InvestPro ne l’affiche jamais et ne passe jamais d’ordre\.<\/span>/);
  assert.ok(!page.includes("le principal est refusé"), "The master password is not refused");
  assert.match(step, /<button class="back" type="button" id="mtLater">Plus tard<\/button>/, "The step can be skipped");
  assert.match(page, /var HOSTED='\/api\/metasync\/hosted'/, "The page uses the same hosted connector as the site");
  assert.match(page, /headers\['X-InvestPro-MT-Token'\]=token/, "With the fresh proof the site's own form sends");
  assert.match(page, /hostedSend\(\{broker:id,login:login,password:pwd,currency:cur,type:type,syncConsent:true\}\)/);
  assert.match(page, /if\(!\/\^\[A-Z\]\{3\}\$\/\.test\(cur\)\)return fail3\(/, "The currency must be chosen: a wrong one would never sync");
  assert.match(page, /if\(!\$\('mtOk'\)\.checked\)return fail3\(/, "The consent box is required");
  assert.match(page, /\$\('mtPwd'\)\.value='';/, "The password field is emptied once sent");
  const stored = [...page.matchAll(/(?:sessionStorage|localStorage)\.setItem\(([A-Z_]+),/g)].map(match => match[1]);
  assert.deepEqual([...new Set(stored)].sort(), ["CODE_KEY", "SEEN_KEY"], "Nothing else, and never the MetaTrader password, is stored by the page");
  assert.match(page, /else\{S\.email=data\.email\|\|mail;S\.mtAvailable=false\}/, "Without an open session the step is skipped");
  assert.match(page, /if\(n===3&&!mtOn\(\)\)n=4;/);
  assert.ok(page.includes("$('codeOk').onclick=function(){try{sessionStorage.removeItem(CODE_KEY)}catch(e){}show(3)};"), "The step comes right after the access code");
  // Only the VIP brokers are offered, each with its platforms; servers are sorted by their own names.
  const brokers = [...page.matchAll(/\{key:'([a-z_]+)',label:'([^']+)',pf:\[([^\]]+)\]/g)].map(match => `${match[1]} ${match[2]} ${match[3].replace(/'/g, "")}`);
  assert.deepEqual(brokers, ["axi Axi MT4,MT5", "bullwaves Bullwaves MT5", "puprime PU Prime MT4,MT5", "raise_fx Raise FX MT5", "vantage Vantage MT4,MT5", "vtmarkets VT Markets MT4,MT5"]);
  assert.doesNotMatch(page, /Fusion/i, "Fusion Markets is not one of the VIP brokers");
  assert.match(page, /function brokerOf\(b\)\{[^}]*x\.re\.test\(b\.server\)\|\|x\.re\.test\(b\.label\)/);
});

test("the déjà-membre page asks for the broker, a subscription with its payment date, or another broker, before sending", () => {
  const page = fs.readFileSync(path.join(project, "public/vip-deja-membre-v2.html"), "utf8");
  const choices = [...page.matchAll(/class="bk" data-bk="([a-z_]+)"/g)].map(match => match[1]);
  assert.deepEqual(choices, ["vtmarkets", "raise_fx", "puprime", "axi", "bullwaves", "vantage", "abonnement", "autre"]);
  assert.match(page, /if\(!BK\)\{[^}]*return fail\('Choisis ton broker/, "The form stops until a choice is made");
  assert.match(page, /<div id="paidBox" hidden>[\s\S]*?<input id="paid" type="date"/, "The payment date waits, hidden, under the choices");
  assert.match(page, /\$\('paidBox'\)\.hidden=BK!=='abonnement'/, "It appears only for a subscription");
  assert.match(page, /if\(BK==='abonnement'&&!paidOk\(\$\('paid'\)\.value\)\)return fail\('Indique la date de ton dernier paiement/, "A subscription cannot be sent without its date");
  assert.match(page, /broker:BK,paidOn:BK==='abonnement'\?\$\('paid'\)\.value:''/, "The choice and the date are sent with the request");
});

test("names and e-mail are required before any account or request is created", async () => {
  for (const [field, value] of [["firstName", ""], ["lastName", "   "], ["email", "pas-un-email"], ["email", ""]]) {
    const api = fixture();
    const result = await api.post({ ...member, [field]: value });
    assert.equal(result.status, 400, field);
    assert.equal(result.body.field, field);
    assert.equal(api.calls.created.length + api.calls.inserts.length + api.calls.limits, 0);
  }
});

test("an address that already has an account never receives a code or a password change", async () => {
  const api = fixture({ existingEmail: true });
  const response = await api.post(member);
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "EXISTING_ACCOUNT");
  assert.equal(api.calls.passwordUpdates.length, 0);
  assert.equal(api.calls.signIns.length, 0);
  assert.equal(api.calls.inserts.length, 0);
  assert.doesNotMatch(JSON.stringify(response.body), new RegExp(CODE));
});

test("an existing account continues with its own password, and a wrong password changes nothing", async () => {
  const wrong = fixture();
  const failed = await wrong.post({ ...member, mode: "login", password: "faux" });
  assert.equal(failed.status, 401);
  assert.equal(failed.body.code, "BAD_PASSWORD");
  assert.equal(wrong.calls.created.length + wrong.calls.inserts.length, 0);

  const api = fixture();
  const response = await api.post({ ...member, mode: "login", password: "Bon-Mot-De-Passe1" });
  assert.equal(response.status, 201);
  assert.equal(response.body.accessCode, null);
  assert.equal(response.body.created, false);
  assert.equal(api.calls.created.length, 0);
  assert.equal(api.calls.inserts.length, 1);
});

test("a returning member can type the access code without its dashes", async () => {
  const api = fixture({ password: CODE });
  const response = await api.post({ ...member, mode: "login", password: "ab3d ef7g hk9m".replace(/ab3d/, "Ab3d").replace(/ef7g/, "Ef7g").replace(/hk9m/, "Hk9m") });
  assert.equal(response.status, 201);
  assert.deepEqual(plain(api.calls.signIns.map(call => call.password)), ["Ab3d Ef7g Hk9m", CODE]);
  assert.equal(api.calls.created.length, 0);
});

test("a signed-in visitor keeps the account's own address and skips the visitor rate limit", async () => {
  const api = fixture({ session: { id: userId, email: "session@example.org", user_metadata: {} } });
  const response = await api.post({ ...member, email: "autre@example.org" });
  assert.equal(response.status, 201);
  assert.equal(api.calls.limits, 0);
  assert.equal(api.calls.created.length, 0);
  assert.equal(api.calls.inserts[0].value.email, "session@example.org");
  assert.equal(response.body.accessCode, null);
});

test("an active member is shown the unlocked card instead of a second request", async () => {
  const membershipRow = { user_id: userId, email: "member@example.org", type: "affiliation", first_name: "Élodie", last_name: "D’Ávila", started_at: "2026-11-08T10:00:00Z", expires_at: null, status: "active", member_number: 427 };
  const api = fixture({ session: { id: userId, email: "member@example.org", user_metadata: {} }, membershipRow });
  const response = await api.post(member);
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "active");
  assert.equal(response.body.memberNumber, 427);
  assert.equal(api.calls.inserts.length, 0);
  const state = await api.get();
  assert.equal(state.body.signedIn, true);
  assert.equal(state.body.state, "active");
  assert.equal(state.body.since, "2026-11-08T10:00:00Z");
});

test("a pending request is reported as pending, and a request awaiting a complement is flagged", async () => {
  const duplicate = fixture({ duplicate: true });
  const response = await duplicate.post(member);
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "pending");
  assert.equal(response.body.accessCode, CODE, "a freshly created account still shows its code");

  const completion = fixture({ session: { id: userId, email: "member@example.org", user_metadata: {} }, latestRequest: { id: requestId, status: "pending", completion_fields: ["firstName"], completion_note: "Ton nom complet stp" } });
  const state = await completion.get();
  assert.equal(state.body.state, "completion");
  assert.equal(state.body.completionNote, "Ton nom complet stp");
  const resent = await completion.post(member);
  assert.equal(resent.body.state, "completion");
  assert.equal(completion.calls.inserts.length, 0);
});

test("a denied member can send a new request and sees the reason until then", async () => {
  const denied = { id: requestId, status: "denied", rejection_reason: "Pas trouvé dans le canal", completion_fields: [] };
  const api = fixture({ session: { id: userId, email: "member@example.org", user_metadata: {} }, latestRequest: denied });
  const state = await api.get();
  assert.equal(state.body.state, "denied");
  assert.equal(state.body.rejectionReason, "Pas trouvé dans le canal");
  assert.equal((await api.post(member)).status, 201);
  assert.equal(api.calls.inserts.length, 1);
});

test("visitors are rate limited before any account is created", async () => {
  const api = fixture({ limited: true });
  const response = await api.post(member);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "120");
  assert.equal(api.calls.created.length + api.calls.inserts.length, 0);
});

test("preview deployments, other origins and the honeypot never reach accounts or requests", async () => {
  const preview = fixture({ environment: "preview" });
  assert.equal((await preview.post(member)).status, 403);
  const foreign = fixture();
  assert.equal((await foreign.post(member, "https://attacker.invalid")).status, 403);
  const robot = fixture();
  assert.equal((await robot.post({ ...member, website: "spam" })).status, 201);
  for (const api of [preview, foreign, robot]) assert.equal(api.calls.created.length + api.calls.inserts.length + api.calls.limits, 0);
});

test("a visitor without a session gets the form, not an error", async () => {
  const api = fixture();
  const state = await api.get();
  assert.equal(state.status, 200);
  assert.deepEqual(state.body, { signedIn: false });
});

test("“Ce n’est pas toi ?” signs this browser out, only from the site itself", async () => {
  const api = fixture({ session: { id: userId, email: "member@example.org", user_metadata: {} } });
  assert.equal((await api.del("https://attacker.invalid")).status, 403);
  assert.equal(api.calls.signOuts || 0, 0);
  assert.equal((await api.del()).status, 200);
  assert.equal(api.calls.signOuts, 1);
});
