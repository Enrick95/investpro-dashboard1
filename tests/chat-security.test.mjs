import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const userId = "83cfaf59-8e27-47e4-b64b-3d17fc501102";
const otherId = "18cfaf59-8e27-47e4-b64b-3d17fc501103";
const clientId = "f3cfaf59-8e27-47e4-b64b-3d17fc501104";
const messageId = "f4cfaf59-8e27-47e4-b64b-3d17fc501105";
const plain = value => JSON.parse(JSON.stringify(value));
function compile(file, modules = {}, env = {}) {
  const cjsModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module: cjsModule, exports: cjsModule.exports, Request, Response, Headers, URL, Buffer, TextDecoder, Uint8Array, Date,
    process: { env },
    require: name => { assert(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; },
  });
  return cjsModule.exports;
}
const membership = compile("lib/vip/membership.ts");
const chat = compile("lib/vip/chat.ts");
const makeRow = (id = messageId, created = "2026-10-17T12:00:00.123456+00:00") => ({ id, author_id: otherId, author_name: "PublicTrader", body: "Bonjour à tous", admin_author: false, created_at: created });

function fixture(options = {}) {
  const operations = [];
  const user = options.user === null ? null : { id: userId, email: "private@example.invalid", email_confirmed_at: "2026-10-01T10:00:00Z", is_anonymous: false, ...options.user };
  const member = options.member === null ? null : { user_id: userId, type: "affiliation", status: "active", started_at: "2020-01-01T00:00:00Z", expires_at: null, ...options.member };
  const db = {
    from(table) {
      const operation = { table, filters: [], order: [] };
      operations.push(operation);
      const query = {
        select(columns) { operation.columns = columns; return query; },
        eq(key, value) { operation.filters.push([key, value]); return query; },
        is(key, value) { operation.filters.push([key, value]); return query; },
        or(value) { operation.or = value; return query; },
        order(key, value) { operation.order.push([key, value]); return query; },
        limit(value) { operation.limit = value; return query; },
        update(value) { operation.update = value; return query; },
        async maybeSingle() {
          if (table === "vip_memberships") return { data: member, error: options.memberError || null };
          if (table === "profiles") return { data: { username: options.username || "TraderPublic" }, error: null };
          if (table === "vip_chat_messages") return { data: options.deleteMissing || (options.deletedAlready && operation.filters.some(([key, value]) => key === "deleted_at" && value === null)) ? null : { id: messageId }, error: null };
          throw Error(`Unexpected table ${table}`);
        },
        then(resolve, reject) { return Promise.resolve({ data: options.rows || [], error: options.readError || null }).then(resolve, reject); },
      };
      return query;
    },
    async rpc(name, params) {
      operations.push({ rpc: name, params });
      return { data: [{ ...makeRow(), author_id: userId, body: params.p_body, author_name: params.p_author_name, admin_author: params.p_admin_author }], error: options.rpcError ? { message: options.rpcError } : null };
    },
  };
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fake-public-key", SUPABASE_SERVICE_ROLE_KEY: "fake-service-key", VERCEL_ENV: options.preview ? "preview" : "production" };
  const authClient = { auth: { async getUser() { return { data: { user }, error: options.authError || null }; } } };
  const memberServer = compile("lib/vip/membership-server.ts", {
    "server-only": {}, "node:crypto": crypto, "next/server": { NextResponse: Response },
    "@supabase/supabase-js": { createClient: (_url, key) => key === env.SUPABASE_SERVICE_ROLE_KEY ? db : authClient },
    "@/lib/admin/permissions": { async canAdmin(id, permission) { assert.equal(id, userId); assert.equal(permission, "users_write"); return options.admin === true; } },
    "@/lib/supabase/server": { async createClient() { return authClient; } },
    "@/lib/vip/membership": membership,
  }, env);
  const chatServer = compile("lib/vip/chat-server.ts", { "server-only": {}, "./membership-server": memberServer, "./chat": chat }, env);
  const modules = { "@/lib/vip/membership-server": memberServer, "@/lib/vip/membership": membership, "@/lib/vip/chat": chat, "@/lib/vip/chat-server": chatServer };
  const route = compile("app/api/vip/chat/route.ts", modules, env);
  const deletion = compile("app/api/vip/chat/[id]/route.ts", modules, env);
  const request = (method = "GET", input, changes = {}) => new Request(`https://investprotrading.fr/api/vip/chat${changes.query || ""}`, {
    method, headers: { Origin: "https://investprotrading.fr", "Content-Type": "application/json", ...changes.headers },
    ...(input === undefined ? {} : { body: typeof input === "string" ? input : JSON.stringify(input) }),
  });
  return { route, deletion, operations, request, chatServer };
}

test("anonymous, missing, expired, suspended, future and unconfirmed memberships cannot read or send", async () => {
  const cases = [
    [{ user: null }, 401], [{ user: { is_anonymous: true } }, 401], [{ authError: { message: "expired" } }, 401],
    [{ member: null }, 403], [{ member: { status: "suspended" } }, 403],
    [{ member: { started_at: "2099-01-01T00:00:00Z" } }, 403],
    [{ member: { type: "abonnement", expires_at: "2021-01-01T00:00:00Z" } }, 403],
    [{ user: { email_confirmed_at: null } }, 403], [{ user: { banned_until: "2099-01-01T00:00:00Z" } }, 403],
  ];
  for (const [options, status] of cases) {
    for (const method of ["GET", "POST"]) {
      const f = fixture(options);
      const result = await f.route[method](f.request(method, method === "POST" ? { text: "Bonjour", clientId } : undefined));
      assert.equal(result.status, status, JSON.stringify(options));
      assert.equal(f.operations.some(row => row.table === "vip_chat_messages" || row.rpc), false);
    }
  }
});

test("verified VIP admins can access and moderate without a member subscription", async () => {
  const f = fixture({ admin: true, member: null, rows: [makeRow()] });
  const result = await f.route.GET(f.request());
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.canModerate, true);
  assert.equal(body.messages[0].own, false);
});

test("read responses are private no-store and do not disclose account emails or internal columns", async () => {
  const f = fixture({ rows: [{ ...makeRow(), client_id: clientId, author_email: "private@example.invalid", deleted_at: null }] });
  const response = await f.route.GET(f.request());
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  const value = await response.json();
  assert.deepEqual(Object.keys(value.messages[0]).sort(), ["id", "body", "authorId", "authorName", "createdAt", "own", "adminAuthor"].sort());
  assert(!JSON.stringify(value).includes("private@example.invalid"));
  const query = f.operations.find(row => row.table === "vip_chat_messages");
  assert.equal(query.limit, 41);
  assert(query.filters.some(([key, value]) => key === "deleted_at" && value === null));
});

test("keyset pagination is deterministic for identical timestamps and retains microseconds", async () => {
  const rows = Array.from({ length: 41 }, (_, i) => makeRow(`00000000-0000-4000-8000-${String(100 - i).padStart(12, "0")}`));
  const f = fixture({ rows });
  const body = await (await f.route.GET(f.request())).json();
  assert.equal(body.messages.length, 40);
  assert.equal(body.messages[0].id, rows[39].id);
  assert.equal(body.messages[39].id, rows[0].id);
  const decoded = f.chatServer.decodeVipChatCursor(body.nextCursor);
  assert.equal(decoded.createdAt, rows[39].created_at);
  assert.equal(decoded.id, rows[39].id);
  const older = fixture({ rows: [] });
  await older.route.GET(older.request("GET", undefined, { query: `?before=${body.nextCursor}` }));
  assert.equal(older.operations.find(row => row.table === "vip_chat_messages").or, `created_at.lt.${rows[39].created_at},and(created_at.eq.${rows[39].created_at},id.lt.${rows[39].id})`);
});

test("malformed cursor and filter injection never reach the message query", async () => {
  for (const value of ["", "a".repeat(300), "not-a-cursor", Buffer.from(JSON.stringify(["2026-10-17T00:00:00Z),body.neq.secret", messageId])).toString("base64url"), Buffer.from(JSON.stringify(["2026-10-17T00:00:00Z", "x),id.neq.x"])).toString("base64url")]) {
    const f = fixture();
    const response = await f.route.GET(f.request("GET", undefined, { query: `?before=${value}` }));
    assert.equal(response.status, 400);
    assert.equal(f.operations.some(row => row.table === "vip_chat_messages"), false);
  }
});

test("POST derives the author, team badge and display name only from verified server state", async () => {
  const f = fixture({ username: "Public Alias" });
  const response = await f.route.POST(f.request("POST", { text: "  Bonjour\r\nà tous  ", clientId, authorId: otherId, authorName: "Admin", adminAuthor: true }));
  assert.equal(response.status, 201);
  const rpc = f.operations.find(row => row.rpc);
  assert.deepEqual(plain(rpc.params), { p_author_id: userId, p_client_id: clientId, p_body: "Bonjour\nà tous", p_author_name: "Public Alias", p_admin_author: false });
  assert.equal((await response.json()).message.own, true);
});

test("email-shaped or missing display names never expose an account email", async () => {
  for (const username of ["private@example.invalid", "", "\u0000\u202e"]) {
    assert.equal(chat.vipChatPublicName(username), "Membre InvestPro");
  }
  assert.equal(chat.vipChatPublicName("  A\nB\u202e  "), "AB");
  assert.equal(Array.from(chat.vipChatPublicName("😀".repeat(80))).length, 60);
});

test("text is bounded, unicode-safe plaintext; executable-looking text stays literal data", async () => {
  assert.equal(chat.vipChatText("😀".repeat(2000)).length, 4000);
  for (const text of ["", "  ", "a".repeat(2001), "x\u0000y", "x\u202ey"]) assert.equal(chat.vipChatText(text), null);
  const payload = '<script>alert("x")</script> https://example.invalid';
  assert.equal(chat.vipChatText(payload), payload);
  const f = fixture();
  const response = await f.route.POST(f.request("POST", { text: payload, clientId }));
  assert.equal((await response.json()).message.body, payload);
});

test("cross-site, missing origin, wrong MIME and oversize streams cannot send", async () => {
  for (const [changes, status] of [
    [{ headers: { Origin: "https://evil.invalid" } }, 403],
    [{ headers: { "Sec-Fetch-Site": "cross-site" } }, 403],
    [{ headers: { "Content-Type": "text/plain" } }, 415],
  ]) {
    const f = fixture();
    assert.equal((await f.route.POST(f.request("POST", { text: "Bonjour", clientId }, changes))).status, status);
    assert.equal(f.operations.some(row => row.rpc), false);
  }
  const f = fixture();
  const missingOrigin = new Request("https://investprotrading.fr/api/vip/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Bonjour", clientId }) });
  assert.equal((await f.route.POST(missingOrigin)).status, 403);
  assert.equal((await f.route.POST(f.request("POST", { text: "😀".repeat(3000), clientId }))).status, 413);
  assert.equal(f.operations.some(row => row.rpc), false);
});

test("preview is read-only for POST and DELETE while permitted reads still work", async () => {
  const f = fixture({ preview: true });
  assert.equal((await f.route.GET(f.request())).status, 200);
  assert.equal((await f.route.POST(f.request("POST", { text: "Bonjour", clientId }))).status, 403);
  assert.equal((await f.deletion.DELETE(f.request("DELETE"), { params: Promise.resolve({ id: messageId }) })).status, 403);
  assert.equal(f.operations.some(row => row.rpc || row.update), false);
});

test("posting limits and idempotency conflicts return actionable statuses, never DB details", async () => {
  for (const [rpcError, status] of [["vip_chat_rate_limited", 429], ["vip_chat_message_deleted", 409], ["vip_chat_client_conflict", 409], ["private_database_secret", 503]]) {
    const f = fixture({ rpcError });
    const response = await f.route.POST(f.request("POST", { text: "Bonjour", clientId }));
    assert.equal(response.status, status);
    assert(!JSON.stringify(await response.json()).includes(rpcError));
  }
});

test("member deletion is constrained to their own ID while current admins may moderate", async () => {
  for (const admin of [false, true]) {
    const f = fixture({ admin });
    assert.equal((await f.deletion.DELETE(f.request("DELETE"), { params: Promise.resolve({ id: messageId }) })).status, 200);
    const change = f.operations.find(row => row.update);
    assert.equal(change.update.body, "");
    assert(change.update.deleted_at);
    assert.equal(change.filters.some(([key, value]) => key === "author_id" && value === userId), !admin);
    assert(change.filters.some(([key, value]) => key === "id" && value === messageId));
  }
});

test("DELETE rejects revoked access, cross-origin calls, unknown IDs and malformed IDs", async () => {
  const revoked = fixture({ member: { status: "suspended" } });
  assert.equal((await revoked.deletion.DELETE(revoked.request("DELETE"), { params: Promise.resolve({ id: messageId }) })).status, 403);
  const foreign = fixture();
  assert.equal((await foreign.deletion.DELETE(foreign.request("DELETE", undefined, { headers: { Origin: "https://evil.invalid" } }), { params: Promise.resolve({ id: messageId }) })).status, 403);
  assert.equal(foreign.operations.some(row => row.update), false);
  const invalid = fixture();
  assert.equal((await invalid.deletion.DELETE(invalid.request("DELETE"), { params: Promise.resolve({ id: "bad" }) })).status, 400);
  const missing = fixture({ deleteMissing: true });
  assert.equal((await missing.deletion.DELETE(missing.request("DELETE"), { params: Promise.resolve({ id: messageId }) })).status, 404);
});

test("retrying a previously deleted own message succeeds without broadening ownership", async () => {
  for (const admin of [false, true]) {
    const f = fixture({ admin, deletedAlready: true });
    const result = await f.deletion.DELETE(f.request("DELETE"), { params: Promise.resolve({ id: messageId }) });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: true });
    const change = f.operations.find(row => row.update);
    assert.equal(change.filters.some(([key, value]) => key === "author_id" && value === userId), !admin);
  }
});
