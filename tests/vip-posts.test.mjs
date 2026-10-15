import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const userId = "83cfaf59-8e27-47e4-b64b-3d17fc501102";
const adminId = "e4e87147-61a9-47b0-bdb1-8b694a337917";
const postId = "08fa3092-7c2a-4a7c-b3f3-4e9fef3851aa";
const imagePath = `${adminId}/${postId}.png`;
const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=", "base64"));
const GIF = new Uint8Array(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));

function compile(file, modules = {}, extra = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, URL, Request, Response, Headers, FormData, File, Blob, Uint8Array, DataView, Buffer, TextEncoder, TextDecoder, console, Date, ...extra,
    require: name => { assert.ok(Object.hasOwn(modules, name), "Unexpected import: " + name); return modules[name]; } });
  return module.exports;
}
const validation = compile("lib/vip/post-validation.ts");
const membership = compile("lib/vip/membership.ts");
class VipRequestError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const current = { id: postId, category: "signal", title: "Signal initial", body: "Entrée : 7701 - 7671\nTP3 : OPEN", symbol: "US500", direction: "buy", levels: { entry: 7701, stopLoss: 7622.89 }, image_path: null, image_url: "https://legacy.example/graph.png", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", published: true, created_by: adminId };

function fixture({ authorized = true, vip = true, preview = false, expired = false, dbError = false, posts = [current], storedBytes = PNG, storedMime = "image/png", infoSize = storedBytes.length } = {}) {
  const calls = { reads: [], updates: [], inserts: [], rpcs: [], uploads: [], signed: [], uploadSigns: [], downloads: [], after: [], limits: [], permissions: [] };
  const rows = structuredClone(posts);
  const bucket = {
    async info(path) { calls.reads.push({ path }); return { data: path.startsWith(`${adminId}/${postId}.`) ? { size: infoSize, contentType: storedMime } : null, error: null }; },
    async download(path) { calls.downloads.push(path); return { data: new Blob([storedBytes], { type: storedMime }), error: null }; },
    async createSignedUploadUrl(path, options) { calls.uploadSigns.push({ path, options }); return { data: { path, token: "storage-fixture-token", signedUrl: "https://private.example/upload/sign/" + path }, error: null }; },
    async upload(path, bytes, options) { calls.uploads.push({ path, bytes, options }); return { error: null }; },
    async createSignedUrl(path, ttl) { calls.signed.push({ path, ttl }); return { data: { signedUrl: "https://private.example/signed/" + path }, error: null }; },
    async createSignedUrls(paths, ttl) { calls.signed.push({ paths, ttl }); return { data: paths.map(path => ({ path, signedUrl: "https://private.example/signed/" + path, error: null })), error: null }; },
  };
  const db = {
    storage: { from(name) { assert.equal(name, "vip-post-media"); return bucket; } },
    from(table) {
      assert.equal(table, "vip_posts");
      const filters = new Map(); let operation = "read", payload;
      const matching = () => rows.filter(row => [...filters].every(([key, value]) => row[key] === value));
      const resolve = () => {
        if (dbError) return { data: null, error: new Error("Fixture DB error") };
        if (operation === "insert") { const row = { ...payload, id: postId, created_at: "2026-10-15T10:00:00Z", updated_at: "2026-10-15T10:00:00Z" }; rows.push(row); return { data: row, error: null }; }
        if (operation === "update") { const row = matching()[0]; if (row) Object.assign(row, payload); return { data: row || null, error: null }; }
        return { data: matching(), error: null };
      };
      const chain = {
        select() { return chain; }, eq(key, value) { filters.set(key, value); return chain; }, order() { return chain; }, limit() { return chain; },
        insert(value) { operation = "insert"; payload = value; calls.inserts.push(value); return chain; },
        update(value) { operation = "update"; payload = value; calls.updates.push(value); return chain; },
        async maybeSingle() { const result = resolve(); return { ...result, data: Array.isArray(result.data) ? result.data[0] || null : result.data }; },
        async single() { return resolve(); }, then(resolvePromise) { calls.reads.push({ table, filters: Object.fromEntries(filters) }); return Promise.resolve(resolve()).then(resolvePromise); },
      };
      return chain;
    },
    async rpc(name, args) {
      calls.rpcs.push({ name, args });
      if (name === "vip_post_reaction_summary") return { data: rows.filter(row => row.published && args.p_post_ids.includes(row.id)).map(row => ({ post_id: row.id, counts: { like: 2, fire: 1, heart: 0 }, mine: "like", user_id: "never-expose" })), error: null };
      assert.equal(name, "vip_set_post_reaction");
      return { data: { counts: { like: args.p_reaction === "like" ? 1 : 0, fire: args.p_reaction === "fire" ? 1 : 0, heart: args.p_reaction === "heart" ? 1 : 0 }, mine: args.p_reaction }, error: null };
    },
  };
  const member = { type: "abonnement", expires_at: new Date(Date.now() + (expired ? -1000 : 120000)).toISOString() };
  const server = {
    VipRequestError, vipJson: (body, status = 200) => Response.json(body, { status }),
    async readVipJson(request, limit) { calls.limits.push(limit); if (!membership.isSameVipOrigin(request)) throw new VipRequestError("Origin denied", 403); const text = await request.text(); if (Buffer.byteLength(text) > limit) throw new VipRequestError("Body too large", 413); return JSON.parse(text); },
    async requireVipAccess() { return !authorized ? { error: "Unauthorized", status: 401 } : !vip || expired ? { error: "VIP inactive", status: 403 } : { user: { id: userId }, db, admin: false, membership: member }; },
  };
  const environment = { env: { VERCEL_ENV: preview ? "preview" : "production", SUPABASE_SERVICE_ROLE_KEY: "vip-offline-fixture-secret-" + "x".repeat(48) } };
  const postsServer = compile("lib/vip/posts-server.ts", { "server-only": {}, "./membership": membership, "./membership-server": server, "./post-validation": validation }, { process: environment });
  const uploadTickets = compile("lib/vip/media-upload.ts", { "server-only": {}, "node:crypto": crypto, "./membership-server": server, "./post-validation": validation }, { process: environment });
  const common = { "@/lib/vip/membership-server": server, "@/lib/vip/posts-server": postsServer, "@/lib/vip/post-validation": validation };
  const adminPosts = compile("app/api/admin/vip/posts/route.ts", { ...common, "@/lib/admin/permissions": { async authenticateAdmin(_request, permission) { calls.permissions.push(permission); return authorized ? { user: { id: adminId }, admin: db } : { error: "Unauthorized", status: 401 }; } }, "@/lib/vip/notifications": { deliverVipNotifications() { throw Error("Real notification must never run in tests"); } }, "next/server": { after(callback) { calls.after.push(callback); } } });
  const adminMedia = compile("app/api/admin/vip/media/route.ts", { ...common, "@/lib/admin/permissions": { async authenticateAdmin() { return authorized ? { user: { id: adminId }, admin: db } : { error: "Unauthorized", status: 401 }; } }, "node:crypto": { randomUUID: () => postId } });
  const signedMedia = compile("app/api/admin/vip/media/upload/route.ts", { ...common, "@/lib/vip/media-upload": uploadTickets, "@/lib/admin/permissions": { async authenticateAdmin(_request, permission) { calls.permissions.push(permission); return authorized ? { user: { id: adminId }, admin: db } : { error: "Unauthorized", status: 401 }; } }, "node:crypto": { randomUUID: () => postId } });
  const memberPosts = compile("app/api/vip/posts/route.ts", common);
  const reaction = compile("app/api/vip/posts/[id]/reaction/route.ts", common);
  const request = (body, method = "POST", origin = "https://investprotrading.fr") => new Request("https://investprotrading.fr/api/admin/vip/posts", { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { calls, db, postsServer, uploadTickets, server, request, adminPosts, adminMedia, signedMedia, memberPosts, reaction };
}

test("PATCH changes only supplied fields and preserves legacy levels/direction/image URL", () => {
  const patch = validation.validateVipPostInput({ title: "Titre corrigé" }, current);
  assert.deepEqual(Object.keys(patch), ["title"]); assert.equal(patch.title, "Titre corrigé");
  assert.equal(current.levels.entry, 7701);
});
test("Bilan and image-only publications are accepted; text signal zones and OPEN remain intact", () => {
  const post = validation.validateVipPostInput({ category: "performance", title: "Bilan", body: "", imagePath });
  assert.equal(post.body, ""); assert.equal(post.image_path, imagePath);
  assert.equal(validation.validateVipPostInput({ category: "signal", title: "Signal", body: current.body }).body, current.body);
});
test("invalid titles/categories/body/levels and external new image URLs fail validation", () => {
  const base = { category: "signal", title: "Signal", body: "Texte" };
  for (const change of [{ title: "" }, { category: "unknown" }, { body: "" }, { body: "a".repeat(12001) }, { levels: [] }, { levels: { entry: -1 } }, { imagePath: "../secret.png" }, { imagePath: "https://external.example/a.png" }, { imageUrl: "https://external.example/a.png" }]) assert.throws(() => validation.validateVipPostInput({ ...base, ...change }));
});
test("null removes both attachment formats; omission preserves an existing private attachment", () => {
  const attached = { ...current, image_path: imagePath };
  assert.equal(validation.validateVipPostInput({ title: "Modifié" }, attached).image_path, undefined);
  const removed = validation.validateVipPostInput({ imagePath: null }, attached); assert.equal(removed.image_path, null); assert.equal(removed.image_url, null);
  assert.throws(() => validation.validateVipPostInput({ imagePath: null }, { ...attached, body: "" }));
});
test("PNG bytes are verified against MIME/extension, SVG/spoofs/oversize refused", () => {
  assert.equal(validation.validateVipMedia(PNG, "image/png", "graph.png").extension, "png");
  for (const [bytes, mime, filename] of [[PNG, "image/jpeg", "graph.jpg"], [PNG, "image/png", "graph.jpg"], [new TextEncoder().encode('<svg onload="alert(1)"/>'), "image/png", "graph.png"], [new Uint8Array(10 * 1024 * 1024 + 1), "image/png", "graph.png"]]) assert.throws(() => validation.validateVipMedia(bytes, mime, filename));
});
test("signed image TTL is floored and capped by the actual subscription expiry", () => {
  const { postsServer } = fixture(), now = Date.now();
  assert.equal(postsServer.vipImageTtl({ type: "abonnement", expires_at: new Date(now + 42300).toISOString() }, false, now), 42);
  assert.equal(postsServer.vipImageTtl({ type: "affiliation" }, false, now), 600);
  assert.throws(() => postsServer.vipImageTtl({ type: "abonnement", expires_at: new Date(now + 999).toISOString() }, false, now));
});
test("private read signs images only after VIP guard and returns aggregate counts without identities/paths", async () => {
  const f = fixture({ posts: [{ ...current, image_path: imagePath, image_url: null }] });
  const response = await f.memberPosts.GET(new Request("https://investprotrading.fr/api/vip/posts")); const { posts } = await response.json();
  assert.equal(response.status, 200); assert.match(posts[0].image_url, /^https:\/\/private.example\/signed\//);
  assert.deepEqual(posts[0].reactions, { counts: { like: 2, fire: 1, heart: 0 }, mine: "like" });
  assert.equal(Object.hasOwn(posts[0], "created_by"), false); assert.equal(Object.hasOwn(posts[0], "image_path"), false);
  assert.equal(JSON.stringify(posts).includes("never-expose"), false); assert(f.calls.signed[0].ttl <= 120);
});
test("anonymous, non-VIP and expired reads do not query posts, aggregate reactions or sign URLs", async () => {
  for (const options of [{ authorized: false }, { vip: false }, { expired: true }]) { const f = fixture(options); assert([401, 403].includes((await f.memberPosts.GET(new Request("https://investprotrading.fr/api/vip/posts"))).status)); assert.equal(f.calls.rpcs.length + f.calls.signed.length + f.calls.reads.length, 0); }
});
test("admin published-post list explicitly filters published rows and never returns an unpublished draft", async () => {
  const draft = { ...current, id: "16c94c86-3d04-47a5-a492-8dd768763ad9", published: false, title: "Unpublished draft" };
  const f = fixture({ posts: [current, draft] });
  const response = await f.adminPosts.GET(new Request("https://investprotrading.fr/api/admin/vip/posts"));
  assert.equal(response.status, 200);
  const { posts } = await response.json();
  assert.equal(posts.length, 1); assert.equal(posts[0].id, postId);
  assert.equal(f.calls.reads.find(call => call.table === "vip_posts").filters.published, true);
  assert.equal(JSON.stringify(posts).includes("Unpublished draft"), false);
});
test("PATCH updates the existing row, checks the version, preserves metadata and never queues an alert", async () => {
  const f = fixture(); const response = await f.adminPosts.PATCH(f.request({ id: postId, title: "Corrigé", expectedUpdatedAt: current.updated_at, created_by: "attacker", published: false }, "PATCH"));
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.post.title, "Corrigé"); assert.equal(body.notifications.queued, false); assert.equal(body.post.levels.entry, 7701);
  assert.deepEqual(Object.keys(f.calls.updates[0]).sort(), ["title", "updated_at"]); assert.equal(f.calls.inserts.length + f.calls.after.length, 0);
});
test("a stale edit returns 409 without overwriting the stored post", async () => {
  const f = fixture(); const response = await f.adminPosts.PATCH(f.request({ id: postId, title: "Stale", expectedUpdatedAt: "2000-01-01T00:00:00Z" }, "PATCH")); assert.equal(response.status, 409);
});
test("preview blocks publication, editing, image upload and reaction before any mutation", async () => {
  const f = fixture({ preview: true });
  assert.equal((await f.adminPosts.POST(f.request({ category: "signal", title: "Signal", body: "Texte" }))).status, 403);
  assert.equal((await f.adminPosts.PATCH(f.request({ id: postId, title: "Modifié" }, "PATCH"))).status, 403);
  assert.equal((await f.adminMedia.POST(f.request({}))).status, 403);
  assert.equal((await f.reaction.PUT(f.request({ reaction: "like" }, "PUT"), { params: Promise.resolve({ id: postId }) })).status, 403);
  assert.equal(f.calls.updates.length + f.calls.inserts.length + f.calls.rpcs.length + f.calls.uploads.length + f.calls.after.length, 0);
});
test("unauthorized mutations fail before database/storage access", async () => {
  const f = fixture({ authorized: false }); assert.equal((await f.adminPosts.POST(f.request({}))).status, 401); assert.equal((await f.adminPosts.PATCH(f.request({}, "PATCH"))).status, 401); assert.equal((await f.adminMedia.POST(f.request({}))).status, 401); assert.equal(f.calls.uploads.length + f.calls.inserts.length + f.calls.updates.length, 0);
});
test("creation accepts a 12000-character UTF-8 body, remains admin-only, and queues creation delivery only", async () => {
  const f = fixture({ posts: [] }); const response = await f.adminPosts.POST(f.request({ category: "performance", title: "Bilan", body: "界".repeat(12000) })); assert.equal(response.status, 201); assert.equal(f.calls.limits[0], 65536); assert.equal(f.calls.after.length, 1); assert.equal(f.calls.inserts[0].created_by, adminId); assert.equal(f.calls.inserts[0].published, true);
});
test("reaction endpoint uses trusted identity, accepts only supported choices/null and never emits notification", async () => {
  for (const reaction of ["like", "fire", "heart", null]) { const f = fixture(); const response = await f.reaction.PUT(f.request({ reaction, user_id: "attacker", admin: true }, "PUT"), { params: Promise.resolve({ id: postId }) }); assert.equal(response.status, 200); assert.equal(f.calls.rpcs[0].args.p_user_id, userId); assert.equal(f.calls.rpcs[0].args.p_is_admin, false); assert.equal(f.calls.rpcs[0].args.p_reaction, reaction); assert.equal(f.calls.after.length, 0); }
  for (const reaction of ["laugh", 1, "👍"]) { const f = fixture(); assert.equal((await f.reaction.PUT(f.request({ reaction }, "PUT"), { params: Promise.resolve({ id: postId }) })).status, 400); assert.equal(f.calls.rpcs.length, 0); }
});
test("reaction mutations require same-origin and active VIP; invalid IDs never reach RPC", async () => {
  const f = fixture(); assert.equal((await f.reaction.PUT(f.request({ reaction: "like" }, "PUT", "https://evil.example"), { params: Promise.resolve({ id: postId }) })).status, 403);
  assert.equal((await f.reaction.PUT(f.request({ reaction: "like" }, "PUT"), { params: Promise.resolve({ id: "not-a-post" }) })).status, 400); assert.equal(f.calls.rpcs.length, 0);
});
test("multipart upload accepts one private PNG with verified bytes and rejects foreign origin/extra files", async () => {
  const f = fixture(); const form = new FormData(); form.append("file", new File([PNG], "graph.png", { type: "image/png" }));
  const response = await f.adminMedia.POST(new Request("https://investprotrading.fr/api/admin/vip/media", { method: "POST", headers: { Origin: "https://investprotrading.fr" }, body: form }));
  assert.equal(response.status, 201); assert.equal((await response.json()).imagePath, imagePath); assert.equal(f.calls.uploads[0].options.upsert, false); assert.equal(f.calls.uploads[0].options.contentType, "image/png");
  const other = fixture(); await assert.rejects(() => other.postsServer.readVipImageUpload(new Request("https://investprotrading.fr/api/admin/vip/media", { method: "POST", headers: { Origin: "https://evil.example" }, body: form })), error => error.status === 403);
  form.append("file", new File([PNG], "second.png", { type: "image/png" })); await assert.rejects(() => other.postsServer.readVipImageUpload(new Request("https://investprotrading.fr/api/admin/vip/media", { method: "POST", headers: { Origin: "https://investprotrading.fr" }, body: form })), error => error.status === 400);
});

test("signed upload preparation accepts GIF up to 10 MiB using JSON metadata only and prohibits overwriting", async () => {
  const f = fixture();
  const response = await f.signedMedia.POST(f.request({ action: "prepare", filename: "analysis.gif", mimeType: "image/gif", sizeBytes: 10 * 1024 * 1024, imagePath: "attacker/path.gif", upsert: true }));
  assert.equal(response.status, 200);
  const prepared = await response.json();
  assert.equal(prepared.imagePath, `${adminId}/${postId}.gif`); assert.equal(prepared.sizeBytes, 10485760); assert.equal(prepared.token, "storage-fixture-token"); assert(prepared.uploadTicket.length > 40);
  assert.equal(f.calls.uploadSigns[0].options.upsert, false); assert.deepEqual(f.calls.permissions, ["users_write"]);
  assert.equal(f.calls.uploads.length + f.calls.downloads.length + f.calls.inserts.length, 0); assert.equal(f.calls.limits[0], 8192);
});
test("signed upload prepare/complete require admin permission, same-origin and production", async () => {
  for (const settings of [{ authorized: false }, { preview: true }]) {
    const f = fixture(settings);
    for (const action of ["prepare", "complete"]) assert([401, 403].includes((await f.signedMedia.POST(f.request({ action, filename: "graph.png", mimeType: "image/png", sizeBytes: PNG.length }))).status));
    assert.equal(f.calls.uploadSigns.length + f.calls.downloads.length + f.calls.signed.length, 0);
  }
  const f = fixture(); assert.equal((await f.signedMedia.POST(f.request({ action: "prepare", filename: "graph.png", mimeType: "image/png", sizeBytes: PNG.length }, "POST", "https://evil.example"))).status, 403); assert.equal(f.calls.uploadSigns.length, 0);
});
test("prepare rejects oversized, fractional, missing, unknown and mismatched metadata before signing", async () => {
  const base = { action: "prepare", filename: "graph.gif", mimeType: "image/gif", sizeBytes: GIF.length };
  for (const change of [{ sizeBytes: 10485761 }, { sizeBytes: 0 }, { sizeBytes: 1.5 }, { sizeBytes: "20" }, { mimeType: "image/svg+xml" }, { mimeType: "__proto__" }, { filename: "graph.png" }, { filename: undefined }]) {
    const f = fixture(); assert([400, 413, 415].includes((await f.signedMedia.POST(f.request({ ...base, ...change }))).status)); assert.equal(f.calls.uploadSigns.length, 0);
  }
});
test("GIF87a and GIF89a signatures are accepted while invalid headers, missing trailer and MIME spoofs are refused", () => {
  assert.equal(validation.validateVipMedia(GIF, "image/gif", "graph.gif").extension, "gif");
  const old = GIF.slice(); old.set(new TextEncoder().encode("GIF87a")); assert.equal(validation.validateVipMedia(old, "image/gif", "graph.GIF").extension, "gif");
  const invalid = GIF.slice(); invalid[0] = 0;
  const noTrailer = GIF.slice(); noTrailer[noTrailer.length - 1] = 0;
  for (const [bytes, mime, name] of [[invalid, "image/gif", "graph.gif"], [noTrailer, "image/gif", "graph.gif"], [GIF, "image/png", "graph.png"]]) assert.throws(() => validation.validateVipMedia(bytes, mime, name));
});
test("complete validates the real GIF bytes before returning a signed preview and can safely be retried", async () => {
  const f = fixture({ storedBytes: GIF, storedMime: "image/gif" });
  const prepared = await (await f.signedMedia.POST(f.request({ action: "prepare", filename: "graph.gif", mimeType: "image/gif", sizeBytes: GIF.length }))).json();
  for (let i = 0; i < 2; i++) {
    const response = await f.signedMedia.POST(f.request({ action: "complete", imagePath: prepared.imagePath, uploadTicket: prepared.uploadTicket, userId: "attacker" }));
    assert.equal(response.status, 200); const complete = await response.json(); assert.equal(complete.mimeType, "image/gif"); assert.equal(complete.sizeBytes, GIF.length); assert.match(complete.imageUrl, /^https:\/\/private.example\/signed\//);
  }
  assert.equal(f.calls.downloads.length, 2); assert.equal(f.calls.uploads.length + f.calls.inserts.length + f.calls.after.length, 0);
});
test("HMAC upload ticket rejects tampering, ownership/path substitutions and expiry before reading an object", async () => {
  const f = fixture(); const prepared = await (await f.signedMedia.POST(f.request({ action: "prepare", filename: "graph.png", mimeType: "image/png", sizeBytes: PNG.length }))).json();
  const [payload, signature] = prepared.uploadTicket.split("."); const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); claims.sizeBytes++;
  const tampered = Buffer.from(JSON.stringify(claims)).toString("base64url") + "." + signature;
  for (const change of [{ uploadTicket: tampered }, { uploadTicket: "made-up" }, { imagePath: `${userId}/${postId}.png` }, { imagePath: `${adminId}/16c94c86-3d04-47a5-a492-8dd768763ad9.png` }]) assert.equal((await f.signedMedia.POST(f.request({ action: "complete", imagePath: prepared.imagePath, uploadTicket: prepared.uploadTicket, ...change }))).status, 400);
  const expired = f.uploadTickets.createVipUploadTicket(adminId, imagePath, "image/png", PNG.length, 1000);
  assert.throws(() => f.uploadTickets.readVipUploadTicket(expired, adminId, imagePath, 1000 + 7200000));
  assert.equal(f.calls.downloads.length + f.calls.signed.length, 0);
});
test("completion rejects mismatched size and forged image bytes without returning a signed preview", async () => {
  for (const settings of [{ storedBytes: new TextEncoder().encode("<svg onload='alert(1)'/>"), storedMime: "image/gif" }, {}]) {
    const f = fixture(settings); const mime = settings.storedMime || "image/png", filename = mime === "image/gif" ? "graph.gif" : "graph.png";
    const size = settings.storedBytes?.length || PNG.length + 1;
    const prepared = await (await f.signedMedia.POST(f.request({ action: "prepare", filename, mimeType: mime, sizeBytes: size }))).json();
    assert([400, 415].includes((await f.signedMedia.POST(f.request({ action: "complete", imagePath: prepared.imagePath, uploadTicket: prepared.uploadTicket }))).status));
    assert.equal(f.calls.signed.length + f.calls.inserts.length, 0);
  }
});
test("post save cannot bypass completion with a forged attachment, and edits recheck the real current file", async () => {
  const forged = new TextEncoder().encode("not an image, despite the metadata");
  const f = fixture({ storedBytes: forged, storedMime: "image/png" });
  assert.equal((await f.adminPosts.POST(f.request({ category: "analysis", title: "Forged", body: "", imagePath }))).status, 415);
  assert.equal(f.calls.inserts.length + f.calls.after.length, 0); assert.equal(f.calls.downloads.length, 1);
  const edited = fixture({ posts: [{ ...current, image_path: imagePath, image_url: null }], storedBytes: forged, storedMime: "image/png" });
  assert.equal((await edited.adminPosts.PATCH(edited.request({ id: postId, title: "Changed" }, "PATCH"))).status, 415); assert.equal(edited.calls.updates.length, 0);
});
test("valid GIF can be published directly only after actual content validation, and declared/actual sizes must agree", async () => {
  const gifPath = `${adminId}/${postId}.gif`; const f = fixture({ posts: [], storedBytes: GIF, storedMime: "image/gif" });
  assert.equal((await f.adminPosts.POST(f.request({ category: "analysis", title: "GIF", body: "", imagePath: gifPath }))).status, 201); assert.equal(f.calls.downloads.length, 1);
  const mismatch = fixture({ storedBytes: PNG, infoSize: PNG.length + 1 }); await assert.rejects(() => mismatch.postsServer.assertVipImageExists(mismatch.db, imagePath), error => error.status === 400);
});
