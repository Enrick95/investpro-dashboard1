import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const userId = "83cfaf59-8e27-47e4-b64b-3d17fc501102";
const otherUserId = "e4e87147-61a9-47b0-bdb1-8b694a337917";
const postId = "08fa3092-7c2a-4a7c-b3f3-4e9fef3851aa";

function compile(file, modules = {}) {
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, { module: compiledModule, exports: compiledModule.exports, URL, Request, Response, Headers,
    require: name => { assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name); return modules[name]; } });
  return compiledModule.exports;
}

const publication = compile("lib/vip/publication-notice.ts", { "server-only": {} });
const feed = compile("lib/vip/notification-feed.ts", { "server-only": {}, "./publication-notice": publication });
const plain = value => JSON.parse(JSON.stringify(value));
const notice = (change = {}) => ({
  id: "notice-1", title: "InvestPro VIP · Nouvelle publication", message: "Ancien texte générique",
  href: "/dashboard/vip", read_at: null, created_at: "2026-10-16T10:00:00Z",
  event_key: `vip:post:${postId}:${userId}`, ...change,
});
const post = { id: postId, category: "signal", title: "Nouveau signal", body: "🟡 Actif : XAUUSD\n📈 Direction : BUY\n📍 Entrée : 2670 - 2672\n🛑 Stop Loss : 2664\n🎯 TP1 : 2678\n🎯 TP2 : 2684\n🎯 TP3 : OPEN", symbol: null, direction: null, levels: {} };

function fixture({ authenticated = true, rows = [notice()], posts = [post], listError = false, postError = false, throwPostRead = false } = {}) {
  const calls = { auth: 0, notices: [], posts: [], adminClients: 0 };
  const db = {
    auth: { async getUser() { calls.auth++; return { data: { user: authenticated ? { id: userId } : null } }; } },
    from(table) {
      const query = { table, columns: "", filters: {}, ids: [], limit: null, order: null };
      assert(["investpro_notifications", "vip_posts"].includes(table));
      if (table === "investpro_notifications") assert.equal(calls.auth, 1, "the user is validated before notices are read");
      const chain = {
        select(columns) { query.columns = columns; return chain; },
        eq(key, value) { query.filters[key] = value; return chain; },
        in(key, ids) { assert.equal(key, "id"); query.ids = Array.from(ids); return chain; },
        order(column, options) { query.order = { column, ...options }; return chain; },
        limit(value) { query.limit = value; return chain; },
        then(resolve, reject) {
          if (table === "investpro_notifications") {
            calls.notices.push(query);
            return Promise.resolve({ data: listError ? null : rows, error: listError ? new Error("List fixture failure") : null }).then(resolve, reject);
          }
          calls.posts.push(query);
          if (throwPostRead) return Promise.reject(new Error("Post fixture rejection")).then(resolve, reject);
          return Promise.resolve({ data: posts, error: postError ? new Error("Post fixture failure") : null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const route = compile("app/api/notifications/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabase/server": { async createClient() { return db; } },
    "@supabase/supabase-js": { createClient() { calls.adminClients++; throw new Error("GET must never create a privileged client"); } },
    "@/lib/vip/notification-feed": feed,
  });
  return { db, route, calls };
}

test("notification GET rejects anonymous requests before all feed reads", async () => {
  const f = fixture({ authenticated: false });
  const response = await f.route.GET();
  assert.equal(response.status, 401);
  assert.equal(f.calls.notices.length, 0);
  assert.equal(f.calls.posts.length, 0);
  assert.equal(f.calls.adminClients, 0);
});

test("notification GET binds own notifications and enriches published posts with the same session/RLS client", async () => {
  const f = fixture();
  const response = await f.route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.notifications[0].title, publication.formatVipPublicationNotice(post).title);
  assert.equal(body.notifications[0].message, publication.formatVipPublicationNotice(post).body);
  assert.equal(body.notifications[0].event_key, undefined);
  assert.deepEqual(f.calls.notices[0].filters, { user_id: userId });
  assert.equal(f.calls.notices[0].limit, 30);
  assert(f.calls.notices[0].columns.includes("event_key"));
  assert.deepEqual(f.calls.posts[0].filters, { published: true });
  assert.deepEqual(f.calls.posts[0].ids, [postId]);
  assert.equal(f.calls.posts[0].columns, "id,category,title,body,symbol,direction,levels");
  assert.equal(f.calls.adminClients, 0);
});

test("a failed notice read returns 503 without looking up private posts", async () => {
  const f = fixture({ listError: true });
  const response = await f.route.GET();
  assert.equal(response.status, 503);
  assert.equal(f.calls.posts.length, 0);
});

test("empty feeds and unrelated renewal/support notices do not query VIP content and retain their fields", async () => {
  const renewal = notice({ event_key: `vip:renewal:${userId}:2026-10-20 00:00:00+00:j3`, title: "Renouvellement à prévoir", message: "Votre échéance actuelle", href: "/dashboard/vip", read_at: "2026-10-16T12:00:00Z" });
  const support = notice({ id: "support-1", event_key: "support_reply:fixture", title: "Nouvelle réponse du support", href: "/dashboard/copieur" });
  const f = fixture();
  assert.deepEqual(plain(await feed.hydrateVipNotificationFeed(f.db, [], userId)), []);
  const hydrated = await feed.hydrateVipNotificationFeed(f.db, [renewal, support], userId);
  const expected = [renewal, support].map(row => { const visible = { ...row }; delete visible.event_key; return visible; });
  assert.deepEqual(plain(hydrated), expected);
  assert.equal(f.calls.posts.length, 0);
});

test("invalid or different-recipient publication events never look up a post or expose stored details", async () => {
  for (const eventKey of [`vip:post:${postId}:${otherUserId}`, `vip:post:invalid:${userId}`, `vip:post:${postId}:${userId}:extra`]) {
    const f = fixture();
    const [result] = await feed.hydrateVipNotificationFeed(f.db, [notice({ event_key: eventKey, title: "Private snapshot", message: "Secret trade levels" })], userId);
    assert.equal(f.calls.posts.length, 0);
    assert.equal(result.title, "Publication VIP");
    assert.equal(result.message, "Retrouvez les publications disponibles dans votre espace VIP.");
    assert.equal(result.event_key, undefined);
  }
});

test("expired access or a withdrawn post is handled as a missing RLS-visible post with no private fallback", async () => {
  const f = fixture({ posts: [] });
  const response = await f.route.GET();
  const { notifications } = await response.json();
  assert.equal(response.status, 200);
  assert.equal(notifications[0].title, "Publication VIP");
  assert.equal(notifications[0].message, "Retrouvez les publications disponibles dans votre espace VIP.");
  assert(!JSON.stringify(notifications).includes("XAUUSD"));
});

test("failed post reads discard partial data while keeping non-VIP notifications intact", async () => {
  for (const settings of [{ postError: true }, { throwPostRead: true }]) {
    const renewal = notice({ id: "renewal-1", event_key: "vip:renewal:fixture", title: "Renouvellement", message: "Échéance actuelle" });
    const f = fixture({ ...settings, rows: [notice({ title: "Private snapshot", message: "Secret trade levels" }), renewal] });
    const response = await f.route.GET();
    assert.equal(response.status, 200);
    const { notifications } = await response.json();
    assert.equal(notifications[0].title, "Publication VIP");
    assert(!JSON.stringify(notifications).includes("Secret trade levels"));
    assert(!JSON.stringify(notifications).includes("XAUUSD"));
    assert.equal(notifications[1].title, "Renouvellement");
    assert.equal(notifications[1].message, "Échéance actuelle");
  }
});

test("shared references are read once and unexpected returned posts cannot hydrate another event", async () => {
  const unrelatedId = "f4e87147-61a9-47b0-bdb1-8b694a337918";
  const f = fixture({ posts: [post, { ...post, id: unrelatedId, body: "Unexpected private row" }] });
  const results = await feed.hydrateVipNotificationFeed(f.db, [notice(), notice({ id: "notice-2", event_key: `VIP:POST:${postId.toUpperCase()}:${userId.toUpperCase()}` })], userId);
  assert.equal(f.calls.posts.length, 1);
  assert.deepEqual(f.calls.posts[0].ids, [postId]);
  assert.equal(results.length, 2);
  assert.equal(results[0].message, results[1].message);
  assert(!JSON.stringify(results).includes("Unexpected private row"));
});
