import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = n => new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString();
const plain = value => JSON.parse(JSON.stringify(value));
const post = n => ({ id: id(n), category: "analysis", title: `Analyse ${n}`, body: "Contexte privé", symbol: "XAUUSD", direction: "buy", levels: { entry: 3000, stopLoss: 2990 }, image_path: null, image_url: null, created_at: at(n), updated_at: at(n), published: true });

function compile(file, modules, extra = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, Request, Response, Headers, URL, Buffer, TextDecoder, Uint8Array, Date, console, ...extra,
    require(name) { assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; } });
  return module.exports;
}
const membership = compile("lib/vip/membership.ts", {});
const validation = compile("lib/vip/post-validation.ts", {});

// Execute the real auth, JSON/origin validation, routes and image/reaction hydration.
// The in-memory query surface records every privileged read and filters it like PostgREST.
function fixture({ signedIn = true, active = true, expired = false, anonymous = false, verifiedAdmin = false, claimedAdmin = false, preview = false, posts = [post(1)], favorites = [], dbError = false, rpcError = null, wrongRpcResult = false, badRelation = false } = {}) {
  const rows = structuredClone(posts), saved = structuredClone(favorites);
  const calls = { auth: [], permissions: [], reads: [], rpcs: [], signed: [] };
  const memberFor = uid => active ? { user_id: uid, status: "active", type: "abonnement", started_at: "2026-01-01T00:00:00Z", expires_at: new Date(Date.now() + (expired ? -60000 : 45000)).toISOString() } : null;
  const db = {
    storage: { from(bucket) { assert.equal(bucket, "vip-post-media"); return { async createSignedUrls(paths, ttl) { calls.signed.push({ paths, ttl }); return { data: paths.map(imagePath => ({ path: imagePath, signedUrl: "https://private.invalid/" + imagePath })), error: null }; } }; } },
    from(table) {
      assert.ok(["vip_memberships", "vip_posts", "vip_post_favorites"].includes(table), `Unexpected table ${table}`);
      const filters = [], orders = []; let columns = "", max = Infinity, keyset = null;
      function result() {
        calls.reads.push({ table, filters: plain(filters), columns, orders: plain(orders), max, keyset });
        if (dbError && table !== "vip_memberships") return { data: null, error: { message: "private-database-detail" } };
        let data = table === "vip_memberships" ? [memberFor(filters.find(([field]) => field === "user_id")?.[2])].filter(Boolean)
          : table === "vip_posts" ? rows.map(row => ({ ...row }))
          : saved.map(row => ({ ...row, ...(columns.includes("!inner") ? { post: badRelation ? null : rows.find(p => p.id === row.post_id) || null } : {}) }));
        if (columns.includes("!inner") && !badRelation) data = data.filter(row => row.post);
        const fieldValue = (row, field) => field.split(".").reduce((value, key) => value?.[key], row);
        for (const [field, op, value] of filters) data = data.filter(row => op === "in" ? value.includes(fieldValue(row, field)) : fieldValue(row, field) === value);
        if (keyset) {
          const match = keyset.match(/^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),post_id\.lt\.([0-9a-f-]+)\)$/);
          assert.ok(match, "Only a validated keyset expression reaches PostgREST"); assert.equal(match[1], match[2]);
          data = data.filter(row => row.created_at < match[1] || row.created_at === match[1] && row.post_id < match[3]);
        }
        data.sort((a, b) => { for (const [field, ascending] of orders) { const left = fieldValue(a, field), right = fieldValue(b, field); if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1); } return 0; });
        return { data: data.slice(0, max), error: null };
      }
      const chain = {
        select(value) { columns = value; return chain; }, eq(field, value) { filters.push([field, "eq", value]); return chain; },
        in(field, value) { filters.push([field, "in", value]); return chain; }, order(field, options) { orders.push([field, options.ascending]); return chain; },
        limit(value) { max = value; return chain; }, or(value) { keyset = value; return chain; },
        async maybeSingle() { const value = result(); return { ...value, data: value.data?.[0] || null }; },
        then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); },
      }; return chain;
    },
    async rpc(name, args) {
      calls.rpcs.push({ name, args: plain(args) });
      if (name === "vip_post_reaction_summary") return { data: rows.filter(row => row.published && args.p_post_ids.includes(row.id)).map(row => ({ post_id: row.id, counts: { like: 3, fire: 1, heart: 0 }, mine: "like", user_id: "private-reaction-owner" })), error: null };
      assert.equal(name, "vip_set_post_favorite");
      if (rpcError) return { data: null, error: rpcError };
      if (!rows.some(row => row.id === args.p_post_id && row.published)) return { data: null, error: { message: "vip_post_unavailable" } };
      const index = saved.findIndex(row => row.user_id === args.p_user_id && row.post_id === args.p_post_id);
      if (args.p_favorite && index < 0) saved.push({ user_id: args.p_user_id, post_id: args.p_post_id, created_at: at(300) });
      if (!args.p_favorite && index >= 0) saved.splice(index, 1);
      return { data: wrongRpcResult ? !args.p_favorite : args.p_favorite, error: null };
    },
  };
  const auth = { auth: { async getUser(token) { calls.auth.push(token || "cookie"); return { data: { user: signedIn ? { id: token === "user-b" ? userB : userA, is_anonymous: anonymous, user_metadata: claimedAdmin ? { role: "admin", admin: true } : {} } : null }, error: null }; } } };
  const environment = { env: { NEXT_PUBLIC_SUPABASE_URL: "https://offline.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public", SUPABASE_SERVICE_ROLE_KEY: "fixture-service", VERCEL_ENV: preview ? "preview" : "production" } };
  const server = compile("lib/vip/membership-server.ts", {
    "server-only": {}, "node:crypto": {}, "@supabase/supabase-js": { createClient(_url, key) { return key === "fixture-service" ? db : auth; } },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/admin/permissions": { async canAdmin(uid, permission) { calls.permissions.push({ uid, permission }); return verifiedAdmin; } },
    "@/lib/supabase/server": { async createClient() { return auth; } }, "@/lib/vip/membership": membership,
  }, { process: environment });
  const postsServer = compile("lib/vip/posts-server.ts", { "server-only": {}, "./membership": membership, "./membership-server": server, "./post-validation": validation }, { process: environment });
  const favoritesServer = compile("lib/vip/favorites-server.ts", { "server-only": {}, "./membership-server": server, "./post-validation": validation });
  const modules = { "@/lib/vip/membership-server": server, "@/lib/vip/posts-server": postsServer, "@/lib/vip/post-validation": validation, "@/lib/vip/favorites-server": favoritesServer };
  const putRoute = compile("app/api/vip/posts/[id]/favorite/route.ts", modules);
  const listRoute = compile("app/api/vip/favorites/route.ts", modules);
  const postsRoute = compile("app/api/vip/posts/route.ts", modules);
  const headers = { Origin: "https://investprotrading.fr", Authorization: "Bearer user-a", "Content-Type": "application/json" };
  const request = (route, { method = "GET", body, token, origin, contentType, url, extraHeaders } = {}) => new Request(url || `https://investprotrading.fr${route}`, { method, headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin !== undefined ? { Origin: origin } : {}), ...(contentType ? { "Content-Type": contentType } : {}), ...extraHeaders }, ...(method !== "GET" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
  return { calls, rows, saved, favoritesServer, request,
    put(body = { favorite: true }, options = {}) { const postId = options.postId || id(1); return putRoute.PUT(request(`/api/vip/posts/${postId}/favorite`, { ...options, method: "PUT", body }), { params: Promise.resolve({ id: postId }) }); },
    list(search = "", options = {}) { return listRoute.GET(request("/api/vip/favorites" + search, options)); },
    posts(options = {}) { return postsRoute.GET(request("/api/vip/posts", options)); },
  };
}

test("favorite writes use verified server identity and explicit target state without notification side effects", async () => {
  const f = fixture();
  for (const favorite of [true, true, false, false]) {
    const response = await f.put({ favorite }); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { postId: id(1), favorite });
  }
  assert.equal(f.saved.length, 0); assert.equal(f.calls.rpcs.length, 4);
  assert.ok(f.calls.rpcs.every(call => call.name === "vip_set_post_favorite" && call.args.p_user_id === userA && call.args.p_is_admin === false));
  assert.equal(f.calls.signed.length, 0);
});

test("unauthenticated, anonymous, inactive, expired and self-claimed admins cannot read or write favorites", async () => {
  for (const [options, status] of [[{ signedIn: false }, 401], [{ anonymous: true }, 401], [{ active: false }, 403], [{ expired: true }, 403], [{ active: false, claimedAdmin: true }, 403]]) {
    const f = fixture(options); assert.equal((await f.list()).status, status); assert.equal((await f.put()).status, status);
    assert.equal(f.calls.rpcs.length + f.calls.signed.length, 0); assert.ok(f.calls.reads.every(read => read.table === "vip_memberships"));
  }
});

test("verified admin access remains server checked and favorites belong to the admin's own account", async () => {
  const f = fixture({ active: false, verifiedAdmin: true }); assert.equal((await f.put()).status, 200); assert.equal((await f.list()).status, 200);
  const write = f.calls.rpcs.find(call => call.name === "vip_set_post_favorite"); assert.equal(write.args.p_is_admin, true); assert.equal(write.args.p_user_id, userA);
  assert.ok(f.calls.permissions.every(call => call.permission === "users_write"));
});

test("mutations reject foreign/null origins, cross-site requests and preview deployments", async () => {
  for (const options of [{ origin: "https://evil.invalid" }, { origin: "null" }, { origin: "https://investprotrading.fr/" }, { extraHeaders: { "Sec-Fetch-Site": "cross-site" } }]) {
    const f = fixture(); assert.equal((await f.put({ favorite: true }, options)).status, 403); assert.equal(f.calls.rpcs.length, 0);
  }
  const f = fixture({ preview: true }); assert.equal((await f.put()).status, 403); assert.equal(f.calls.rpcs.length, 0);
  assert.equal((await f.list()).status, 200, "read-only previews remain possible after verified access");
});

test("official www alias is accepted, and strict schema rejects body identity/admin overrides", async () => {
  const f = fixture(); assert.equal((await f.put({ favorite: true }, { origin: "https://www.investprotrading.fr" })).status, 200);
  for (const input of [{}, { favorite: 1 }, { favorite: "true" }, { favorite: null }, [], null, { favorite: true, user_id: userB }, { favorite: true, admin: true }, { favorite: true, p_is_admin: true }]) {
    const invalid = fixture(); assert.equal((await invalid.put(input)).status, 400); assert.equal(invalid.calls.rpcs.length, 0);
  }
});

test("malformed UUID, JSON, content type and streamed oversize bodies never reach the RPC", async () => {
  for (const [body, options, status] of [[{ favorite: true }, { postId: "not-a-uuid" }, 400], ["{", {}, 400], [{ favorite: true }, { contentType: "text/plain" }, 415], [{ favorite: true, padding: "é".repeat(600) }, {}, 413]]) {
    const f = fixture(); assert.equal((await f.put(body, options)).status, status); assert.equal(f.calls.rpcs.length, 0);
  }
});

test("withdrawn or absent posts cannot be saved and access revoked during the RPC fails closed", async () => {
  for (const posts of [[], [{ ...post(1), published: false }]]) { const f = fixture({ posts }); assert.equal((await f.put()).status, 404); assert.equal(f.saved.length, 0); }
  const revoked = fixture({ rpcError: { message: "vip_access_inactive" } }); assert.equal((await revoked.put()).status, 403);
  const failed = fixture({ rpcError: { message: "private-database-detail" } }); const response = await failed.put(); assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(await response.json()), /private-database-detail/);
  assert.equal((await fixture({ wrongRpcResult: true }).put()).status, 503, "only a confirmed matching database result is success");
});

test("favorite lists contain only the current account's published saves without private identities", async () => {
  const posts = [post(1), post(2), { ...post(3), published: false }];
  const favorites = [{ user_id: userA, post_id: id(1), created_at: at(40) }, { user_id: userB, post_id: id(2), created_at: at(50) }, { user_id: userA, post_id: id(3), created_at: at(60) }];
  const f = fixture({ posts, favorites }); const a = await f.list(); assert.equal(a.status, 200); const bodyA = await a.json();
  assert.deepEqual(bodyA.posts.map(row => row.id), [id(1)]); assert.equal(bodyA.posts[0].favorite, true);
  assert.deepEqual(bodyA.posts[0].reactions, { counts: { like: 3, fire: 1, heart: 0 }, mine: "like" });
  assert.doesNotMatch(JSON.stringify(bodyA), /user_id|created_by|private-reaction-owner|image_path/);
  const b = await f.list("", { token: "user-b" }); assert.deepEqual((await b.json()).posts.map(row => row.id), [id(2)]);
  const reads = f.calls.reads.filter(read => read.table === "vip_post_favorites"); assert.ok(reads.every(read => read.filters.some(([key, _op, value]) => key === "user_id" && [userA, userB].includes(value))));
});

test("favorites beyond the newest 100 publications are accessible and paginated without duplicates", async () => {
  const posts = Array.from({ length: 140 }, (_, index) => post(index + 1));
  const favorites = posts.slice(0, 123).map(p => ({ user_id: userA, post_id: p.id, created_at: "2026-10-18T10:00:00.123456+00:00" }));
  const f = fixture({ posts, favorites }); const latest = await f.posts(); assert.equal(latest.status, 200); assert.equal((await latest.json()).posts.some(p => p.id === id(1)), false);
  const found = []; let search = "", pages = 0;
  do { const response = await f.list(search); assert.equal(response.status, 200); const body = await response.json(); pages++; assert.ok(body.posts.length <= 50); found.push(...body.posts.map(p => p.id)); search = body.nextCursor ? "?cursor=" + encodeURIComponent(body.nextCursor) : ""; } while (search && pages < 8);
  assert.equal(pages, 3); assert.equal(found.length, 123); assert.equal(new Set(found).size, 123); assert.ok(found.includes(id(1))); assert.deepEqual(found, favorites.map(row => row.post_id).sort().reverse());
  assert.ok(f.calls.reads.filter(read => read.table === "vip_post_favorites" && read.columns.includes("!inner")).every(read => read.max === 51));
});

test("favorite cursor preserves submillisecond ordering and rejects forged syntax before favorite access", async () => {
  const f = fixture(); const original = { createdAt: "2026-10-18T10:00:00.123456+00:00", postId: id(1) };
  assert.deepEqual(plain(f.favoritesServer.decodeVipFavoriteCursor(f.favoritesServer.encodeVipFavoriteCursor(original))), original);
  const forged = ["", "%%%", "A".repeat(300), Buffer.from(JSON.stringify(["2026-02-30T10:00:00Z", id(1)])).toString("base64url"), Buffer.from(JSON.stringify(["2026-10-18T10:00:00Z),published.eq.false", id(1)])).toString("base64url"), Buffer.from(JSON.stringify([at(1), "x),user_id.neq.x"])).toString("base64url"), Buffer.from(JSON.stringify([at(1), id(1), userB])).toString("base64url")];
  for (const cursor of forged) { const invalid = fixture(); assert.equal((await invalid.list("?cursor=" + encodeURIComponent(cursor))).status, 400); assert.ok(invalid.calls.reads.every(read => read.table === "vip_memberships")); }
  for (const search of ["?cursor=x&cursor=y", "?user_id=" + userB, "?limit=10000"]) { const invalid = fixture(); assert.equal((await invalid.list(search)).status, 400); assert.equal(invalid.calls.rpcs.length, 0); }
});

test("private favorite attachments retain membership expiry TTL and reaction aggregation boundaries", async () => {
  const imagePath = `${userA}/${id(1)}.png`; const f = fixture({ posts: [{ ...post(1), image_path: imagePath }], favorites: [{ user_id: userA, post_id: id(1), created_at: at(30) }] });
  const response = await f.list(); const result = await response.json(); assert.equal(response.status, 200); assert.match(result.posts[0].image_url, /^https:\/\/private.invalid\//);
  assert.ok(f.calls.signed[0].ttl > 0 && f.calls.signed[0].ttl <= 45); assert.equal(result.posts[0].image_path, undefined);
  const summary = f.calls.rpcs.find(call => call.name === "vip_post_reaction_summary"); assert.deepEqual(summary.args.p_post_ids, [id(1)]); assert.equal(summary.args.p_user_id, userA);
  assert.match(response.headers.get("cache-control"), /private.*no-store/); assert.match(response.headers.get("vary"), /Authorization.*Cookie/);
});

test("the main published feed marks only its viewer's favorites and never exposes who saved a post", async () => {
  const f = fixture({ posts: [post(1), post(2)], favorites: [{ user_id: userA, post_id: id(1), created_at: at(5) }, { user_id: userB, post_id: id(2), created_at: at(6) }] });
  const a = await (await f.posts()).json(); assert.deepEqual(Object.fromEntries(a.posts.map(p => [p.id, p.favorite])), { [id(1)]: true, [id(2)]: false });
  const b = await (await f.posts({ token: "user-b" })).json(); assert.deepEqual(Object.fromEntries(b.posts.map(p => [p.id, p.favorite])), { [id(1)]: false, [id(2)]: true });
  assert.doesNotMatch(JSON.stringify([a, b]), new RegExp(`${userA}|${userB}|private-reaction-owner`));
});

test("empty favorites avoid media/reaction reads and persistence failures return a private error", async () => {
  const empty = fixture(); const response = await empty.list(); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { posts: [], nextCursor: null }); assert.equal(empty.calls.rpcs.length + empty.calls.signed.length, 0);
  const broken = fixture({ dbError: true }); const failure = await broken.list(); assert.equal(failure.status, 503); assert.doesNotMatch(JSON.stringify(await failure.json()), /private-database-detail/);
});
