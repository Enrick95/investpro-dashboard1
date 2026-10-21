import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "components/admin/useAdminInboxCount.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const session = (id = "admin-a", token = "token-a") => ({ user: { id }, access_token: token });
const response = (total, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ total }) });

function harness(fetcher = async () => response(2)) {
  let count = null, authListener, cleanup, unsubscribed = false;
  let currentSession = session(), nextTimer = 0;
  const reads = [], intervals = new Map(), timeouts = new Map();
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = "visible";
  const browserWindow = {
    addEventListener: (...args) => windowTarget.addEventListener(...args),
    removeEventListener: (...args) => windowTarget.removeEventListener(...args),
    setInterval(callback) { intervals.set(++nextTimer, callback); return nextTimer; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback) { timeouts.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timeouts.delete(id); },
  };
  const client = { auth: {
    getSession: async () => ({ data: { session: currentSession }, error: null }),
    onAuthStateChange(callback) {
      authListener = callback;
      return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } };
    },
  } };
  const cjsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: cjsModule, exports: cjsModule.exports, AbortController,
    window: browserWindow, document: documentTarget,
    fetch(url, options) { reads.push({ url, options }); return fetcher(url, options); },
    require(name) {
      if (name === "react") return {
        useMemo: callback => callback(),
        useState: initial => [initial, value => { count = value; }],
        useEffect: callback => { cleanup = callback(); },
      };
      if (name === "@/lib/supabase/client") return { createClient: () => client };
      throw new Error("Unexpected dependency: " + name);
    },
  });
  cjsModule.exports.useAdminInboxCount();
  return {
    reads, intervals, timeouts,
    get count() { return count; },
    get unsubscribed() { return unsubscribed; },
    event(type) { windowTarget.dispatchEvent(new Event(type)); },
    visible(value) { documentTarget.visibilityState = value; documentTarget.dispatchEvent(new Event("visibilitychange")); },
    poll() { for (const callback of intervals.values()) callback(); },
    auth(event, next) { currentSession = next; authListener(event, next); },
    dispose() { cleanup(); },
  };
}

test("the badge fetches only counts and refreshes after local inbox changes or return to the page", async () => {
  let total = 2;
  const hook = harness(async () => response(total));
  await flush();
  assert.equal(hook.count, 2);
  assert.equal(hook.reads[0].url, "/api/admin/inbox/count");
  assert.equal(hook.reads[0].options.headers.Authorization, "Bearer token-a");
  assert.equal(hook.reads[0].options.cache, "no-store");
  total = 1;
  hook.event("investpro-admin-inbox-updated"); await flush();
  assert.equal(hook.count, 1);
  total = 0;
  hook.event("focus"); await flush();
  assert.equal(hook.count, 0);
  hook.dispose();
});

test("temporary API and network errors preserve the last confirmed queue size", async () => {
  let fetcher = async () => response(4);
  const hook = harness((...args) => fetcher(...args));
  await flush();
  assert.equal(hook.count, 4);
  for (const next of [async () => response(null, 503), async () => { throw Error("Offline"); }, async () => response("invalid")]) {
    fetcher = next;
    hook.event("focus"); await flush();
    assert.equal(hook.count, 4);
  }
  fetcher = async () => response(1);
  hook.event("focus"); await flush();
  assert.equal(hook.count, 1);
  hook.dispose();
});

test("a revoked inbox permission clears the old badge instead of retaining privileged state", async () => {
  for (const status of [401, 403]) {
    let result = response(5);
    const hook = harness(async () => result);
    await flush(); assert.equal(hook.count, 5);
    result = response(null, status);
    hook.event("focus"); await flush();
    assert.equal(hook.count, null);
    hook.dispose();
  }
});

test("logout aborts pending reads and a late old response cannot restore the badge", async () => {
  let resolve;
  const hook = harness(() => new Promise(done => { resolve = done; }));
  await flush();
  assert.equal(hook.reads.length, 1);
  hook.auth("SIGNED_OUT", null);
  assert.equal(hook.count, null);
  assert.equal(hook.reads[0].options.signal.aborted, true);
  resolve(response(9)); await flush();
  assert.equal(hook.count, null);
  assert.equal(hook.reads.length, 1);
  hook.dispose();
});

test("changing accounts immediately clears the count and rejects stale previous-account responses", async () => {
  const resolvers = [];
  const hook = harness(() => new Promise(resolve => { resolvers.push(resolve); }));
  await flush();
  resolvers[0](response(7)); await flush(); assert.equal(hook.count, 7);
  hook.event("focus"); await flush();
  hook.auth("SIGNED_IN", session("admin-b", "token-b"));
  assert.equal(hook.count, null);
  assert.equal(hook.reads.at(-1).options.headers.Authorization, "Bearer token-b");
  resolvers[1](response(7)); await flush(); assert.equal(hook.count, null);
  resolvers[2](response(1)); await flush(); assert.equal(hook.count, 1);
  hook.dispose();
});

test("hidden tabs skip polling and unmount removes timers, listeners and subscription", async () => {
  const hook = harness(); await flush();
  const initialReads = hook.reads.length;
  hook.visible("hidden"); hook.poll(); await flush();
  assert.equal(hook.reads.length, initialReads);
  hook.visible("visible"); await flush();
  assert.equal(hook.reads.length, initialReads + 1);
  hook.dispose();
  assert.equal(hook.unsubscribed, true);
  assert.equal(hook.intervals.size, 0);
  assert.equal(hook.timeouts.size, 0);
  hook.event("focus"); hook.event("investpro-admin-inbox-updated"); hook.poll(); await flush();
  assert.equal(hook.reads.length, initialReads + 1);
});
