import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const compiled = ts.transpileModule(fs.readFileSync(path.join(root, "lib/metasync/hosted-request-client.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const cjsModule = { exports: {} };
vm.runInNewContext(compiled, { module: cjsModule, exports: cjsModule.exports, Error, JSON, Response });
const { HostedRequestError, sendHostedMutation } = cjsModule.exports;

// All requests are intercepted here. Nothing contacts a broker or stores credentials.
const payload = Object.freeze({ broker: "offline-fixture", login: "123456", password: "offline-placeholder", currency: "USD", type: "prop", syncConsent: true });
const json = (body, status = 200) => Response.json(body, { status });
function fixture(replies) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.ok(replies.length, "Unexpected extra request");
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(calls.at(-1)) : next;
  };
  return { calls, fetcher };
}
function secureTransport(calls) {
  for (const { url, options } of calls) {
    assert.equal(url, options.method === "POST" ? "/api/metasync/hosted" : "/api/metasync/hosted?requestProof=1");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.mode, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
  }
}

test("connecting uses one fresh proof and one non-redirecting POST with the original form values", async () => {
  const f = fixture([json({ enabled: true, requestToken: "proof-a" }), json({ ok: true, id: "recorded-fixture" })]);
  const result = await sendHostedMutation(payload, f.fetcher);
  assert.equal(result.id, "recorded-fixture");
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].options.body, undefined);
  assert.equal(f.calls[0].options.headers, undefined);
  assert.equal(f.calls[1].options.method, "POST");
  assert.equal(f.calls[1].options.headers["X-InvestPro-MT-Token"], "proof-a");
  assert.equal(f.calls[1].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(f.calls[1].options.body), payload);
  secureTransport(f.calls);
});

test("an explicit expired-proof rejection refreshes once and retries exactly the same body", async () => {
  const f = fixture([json({ enabled: true, requestToken: "old-proof" }), json({ error: "expired", code: "MT_REQUEST_PROOF_EXPIRED" }, 403), json({ enabled: true, requestToken: "fresh-proof" }), json({ ok: true })]);
  await sendHostedMutation(payload, f.fetcher);
  assert.equal(f.calls.length, 4);
  assert.equal(f.calls[1].options.headers["X-InvestPro-MT-Token"], "old-proof");
  assert.equal(f.calls[3].options.headers["X-InvestPro-MT-Token"], "fresh-proof");
  assert.equal(f.calls[1].options.body, f.calls[3].options.body);
  secureTransport(f.calls);
});

test("a repeated proof expiry stops after the single authorized retry", async () => {
  const failure = () => json({ error: "expired again", code: "MT_REQUEST_PROOF_EXPIRED" }, 401);
  const f = fixture([json({ enabled: true, requestToken: "first" }), failure(), json({ enabled: true, requestToken: "second" }), failure()]);
  await assert.rejects(sendHostedMutation(payload, f.fetcher), error => error instanceof HostedRequestError && error.code === "MT_REQUEST_PROOF_EXPIRED");
  assert.equal(f.calls.length, 4);
});

test("ordinary authorization, origin and database failures never retry a possible account mutation", async () => {
  for (const [status, code] of [[401, "MT_SESSION_EXPIRED"], [403, "MT_REQUEST_ORIGIN"], [409, undefined], [429, undefined], [500, "MT_REQUEST_PROOF_EXPIRED"], [503, undefined]]) {
    const f = fixture([json({ enabled: true, requestToken: "proof" }), json({ error: "Known safe error", ...(code ? { code } : {}) }, status)]);
    await assert.rejects(sendHostedMutation(payload, f.fetcher), error => error instanceof HostedRequestError && error.message === "Known safe error" && error.code === code);
    assert.equal(f.calls.length, 2, String(status));
  }
});

test("ambiguous POST networking and unreadable responses never retry", async () => {
  for (const outcome of [new Error("NETWORK_OR_REDIRECT_FAILED"), new Response("not JSON", { status: 503 })]) {
    const f = fixture([json({ enabled: true, requestToken: "proof" }), outcome]);
    await assert.rejects(sendHostedMutation(payload, f.fetcher));
    assert.equal(f.calls.length, 2);
  }
});

test("a failed, signed-out or invalid proof GET never serializes or sends account credentials", async () => {
  const unsubmittedPayload = { toJSON() { throw new Error("CREDENTIALS_SERIALIZED_BEFORE_AUTH"); } };
  for (const outcome of [new Error("GET_FAILED"), json({ error: "Session unavailable" }, 503), json({ enabled: false, requestToken: null }), json({}), json({ enabled: "true" }), json(null), new Response("not JSON")]) {
    const f = fixture([outcome]);
    await assert.rejects(sendHostedMutation(unsubmittedPayload, f.fetcher), error => error.message !== "CREDENTIALS_SERIALIZED_BEFORE_AUTH");
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].options.body, undefined);
  }
});

test("a failed proof refresh after explicit rejection never sends a second POST", async () => {
  const f = fixture([json({ enabled: true, requestToken: "proof" }), json({ code: "MT_REQUEST_PROOF_EXPIRED" }, 403), json({ enabled: false })]);
  await assert.rejects(sendHostedMutation(payload, f.fetcher));
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls.filter(call => call.options.method === "POST").length, 1);
});

test("missing or malformed proofs are never copied into a request header", async () => {
  for (const requestToken of [null, undefined, "", "a\r\nb", "x".repeat(161), 42, {}]) {
    const f = fixture([json({ enabled: true, requestToken }), json({ ok: true })]);
    await sendHostedMutation(payload, f.fetcher);
    assert.equal(f.calls[1].options.headers["X-InvestPro-MT-Token"], undefined);
    assert.equal(f.calls.length, 2);
  }
});

test("simultaneous operations keep their own proof even when responses arrive out of order", async () => {
  let releaseFirst;
  const firstProof = new Promise(resolve => { releaseFirst = resolve; });
  const first = fixture([() => firstProof, json({ ok: true })]);
  const second = fixture([json({ enabled: true, requestToken: "second-user-proof" }), json({ ok: true })]);
  const pending = sendHostedMutation(payload, first.fetcher);
  await sendHostedMutation({ action: "stop", id: "second-operation" }, second.fetcher);
  releaseFirst(json({ enabled: true, requestToken: "first-user-proof" }));
  await pending;
  assert.equal(first.calls[1].options.headers["X-InvestPro-MT-Token"], "first-user-proof");
  assert.equal(second.calls[1].options.headers["X-InvestPro-MT-Token"], "second-user-proof");
  assert.deepEqual(JSON.parse(second.calls[1].options.body), { action: "stop", id: "second-operation" });
});

test("the real form offers the fixed official-site link only after an explicit origin rejection", async () => {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, "components/metasync/HostedSyncPanel.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const walk = (node, predicate) => !node || typeof node !== "object" ? [] : Array.isArray(node)
    ? node.flatMap(child => walk(child, predicate))
    : [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
  for (const code of ["MT_REQUEST_ORIGIN", "MT_REQUEST_PROOF_REQUIRED", "MT_REQUEST_PROOF_EXPIRED", undefined]) {
    const values = [];
    let index = 0;
    const react = {
      useState(initial) {
        const current = index++;
        if (!(current in values)) values[current] = current === 0 ? true : initial;
        return [values[current], value => { values[current] = typeof value === "function" ? value(values[current]) : value; }];
      },
      useEffect() {}, useCallback: value => value, useMemo: callback => callback(),
    };
    const jsx = (type, props) => ({ type, props });
    const cjs = { exports: {} };
    const dependencies = {
      react,
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "lucide-react": new Proxy({}, { get: (_target, name) => String(name) }),
      "@/components/i18n/LocaleProvider": { useLocale: () => ({ t: value => value, locale: "fr" }) },
      "@/lib/metasync/hosted-request-client": { HostedRequestError, async sendHostedMutation() { throw new HostedRequestError("Connexion refusée", code); } },
    };
    vm.runInNewContext(output, {
      module: cjs, exports: cjs.exports, Error, Date,
      require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
      fetch() { throw new Error("NETWORK_FORBIDDEN"); },
    });
    const render = () => { index = 0; return cjs.exports.default({}); };
    const form = walk(render(), node => node.type === "form")[0];
    form.props.onSubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    const links = walk(render(), node => node.type === "a");
    assert.equal(links.length, code === "MT_REQUEST_ORIGIN" ? 1 : 0);
    if (links.length) {
      assert.equal(links[0].props.href, "https://investprotrading.fr/dashboard/connexions/metatrader");
      assert.equal(links[0].props.children, "Ouvrir InvestPro officiel");
      assert.equal(links[0].props.onClick, undefined);
    }
  }
});
