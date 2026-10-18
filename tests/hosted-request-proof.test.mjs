import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const userId = '33333333-3333-4333-8333-333333333333';
const otherUserId = '44444444-4444-4444-8444-444444444444';
const secret = '34'.repeat(32);
const purpose = 'investpro:metasync:request-proof:v1';
const nowSeconds = 1_792_300_000;
const header = 'X-InvestPro-MT-Token';
const legacyOrigin = 'https://investpro-dashboard1.vercel.app';

function compile(file, modules, { environment = {}, now = () => nowSeconds * 1000, warnings = [] } = {}) {
  const cjsModule = { exports: {} };
  class ControlledDate extends Date { static now() { return now(); } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    module: cjsModule, exports: cjsModule.exports, URL, Request, Response, Headers, Buffer,
    Date: ControlledDate, process: { env: environment },
    console: { warn(...args) { warnings.push(args); }, error() {}, info() {}, log() {} },
    fetch() { throw Error('NETWORK_FORBIDDEN_IN_REQUEST_PROOF_TEST'); },
    require(name) { assert(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; },
  });
  return cjsModule.exports;
}

function proof({ environment = {}, now, cryptoModule = crypto } = {}) {
  return compile('lib/metasync/request-proof.ts', { 'node:crypto': cryptoModule }, {
    environment: { METASYNC_HOSTED_ENCRYPTION_KEY: secret, ...environment }, now,
  });
}

function request(token, extra = {}) {
  return new Request('https://investprotrading.fr/api/metasync/hosted', {
    method: 'POST', headers: { ...(token === undefined ? {} : { [header]: token }), ...extra },
  });
}

function signedToken({ expires = nowSeconds + 1800, nonce = Buffer.alloc(24, 7).toString('base64url'), user = userId, scope = purpose, keyScope = purpose, signingSecret = secret, version = 'v1' } = {}) {
  const key = crypto.createHmac('sha256', Buffer.from(signingSecret, 'hex')).update(keyScope).digest();
  const payload = `${version}.${expires}.${nonce}`;
  const signature = crypto.createHmac('sha256', key).update(`${scope}\n${user}\n${payload}`).digest('base64url');
  return `${payload}.${signature}`;
}

test('issued proof is bounded, random and authenticated without exposing the account or secret', () => {
  const guard = proof();
  const first = guard.issueHostedRequestToken(userId);
  const second = guard.issueHostedRequestToken(userId);
  assert.match(first, /^v1\.[1-9][0-9]{9}\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/);
  assert(first.length <= 160);
  assert.notEqual(first, second);
  assert(!first.includes(userId));
  assert(!first.includes(secret));
  assert.equal(guard.verifyHostedRequestToken(request(first), userId), true);
  assert.equal(guard.verifyHostedRequestToken(request(first), otherUserId), false);
});

test('proof uses the exact expected purpose and user-bound signature', () => {
  const guard = proof();
  assert.equal(guard.verifyHostedRequestToken(request(signedToken()), userId), true);
  for (const options of [{ scope: 'other-feature' }, { keyScope: 'other-feature' }, { user: otherUserId }, { version: 'v2' }]) {
    assert.equal(guard.verifyHostedRequestToken(request(signedToken(options)), userId), false);
  }
});

test('tampering with any signed component cannot validate', () => {
  const guard = proof();
  const token = guard.issueHostedRequestToken(userId);
  const [version, expiry, nonce, signature] = token.split('.');
  for (const altered of [
    `${version}.${Number(expiry) + 1}.${nonce}.${signature}`,
    `${version}.${expiry}.${nonce[0] === 'A' ? 'B' : 'A'}${nonce.slice(1)}.${signature}`,
    `${version}.${expiry}.${nonce}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`,
  ]) assert.equal(guard.verifyHostedRequestToken(request(altered), userId), false);
});

test('proof expires at its exact deadline and valid lifetimes are bounded', () => {
  let current = nowSeconds * 1000;
  const guard = proof({ now: () => current });
  const token = guard.issueHostedRequestToken(userId);
  current += 1799_000;
  assert.equal(guard.verifyHostedRequestToken(request(token), userId), true);
  current += 1000;
  assert.equal(guard.verifyHostedRequestToken(request(token), userId), false);
  current += 1000;
  assert.equal(guard.verifyHostedRequestToken(request(token), userId), false);
});

test('a correctly signed token beyond the accepted clock skew still fails', () => {
  const guard = proof();
  for (const offset of [-1, 0, 1861, 100_000]) {
    assert.equal(guard.verifyHostedRequestToken(request(signedToken({ expires: nowSeconds + offset })), userId), false);
  }
  for (const offset of [1, 1800, 1860]) {
    assert.equal(guard.verifyHostedRequestToken(request(signedToken({ expires: nowSeconds + offset })), userId), true);
  }
});

test('missing, malformed and rotated signing configuration fail closed', () => {
  const token = proof().issueHostedRequestToken(userId);
  for (const key of [undefined, '', 'secret', 'ab'.repeat(31), 'ab'.repeat(33), 'GG'.repeat(32), 'AB'.repeat(32), ' ab'.repeat(32)]) {
    const guard = proof({ environment: { METASYNC_HOSTED_ENCRYPTION_KEY: key } });
    assert.equal(guard.issueHostedRequestToken(userId), null);
    assert.equal(guard.verifyHostedRequestToken(request(token), userId), false);
  }
  const rotated = proof({ environment: { METASYNC_HOSTED_ENCRYPTION_KEY: '56'.repeat(32) } });
  assert.equal(rotated.verifyHostedRequestToken(request(token), userId), false);
  assert.equal(rotated.verifyHostedRequestToken(request(rotated.issueHostedRequestToken(userId)), userId), true);
});

test('missing, overlong, duplicate and malformed token headers fail before decoding', () => {
  const guard = proof();
  const token = guard.issueHostedRequestToken(userId);
  for (const value of [undefined, '', 'a'.repeat(161), ` ${token}suffix`, `${token}, ${token}`, token.replace('v1.', 'v0.'), token + '.', token.replaceAll('.', '/'), token.replace(/^[^.]+\.[^.]+/, 'v1.01792301800'), signedToken({ nonce: 'A'.repeat(31) }), signedToken({ nonce: 'A'.repeat(33) }), signedToken({ nonce: '+'.repeat(32) })]) {
    assert.equal(guard.verifyHostedRequestToken(request(value), userId), false, String(value));
  }
  const headers = new Headers(); headers.append(header, token); headers.append(header, token);
  assert.equal(guard.verifyHostedRequestToken(new Request('https://investprotrading.fr/api/metasync/hosted', { method: 'POST', headers }), userId), false);
});

test('alternate base64 encodings of identical signature bytes are refused', () => {
  const guard = proof();
  const token = guard.issueHostedRequestToken(userId);
  const parts = token.split('.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const finalIndex = alphabet.indexOf(parts[3].at(-1));
  const alternate = parts[3].slice(0, -1) + alphabet[finalIndex + 1];
  assert.deepEqual(Buffer.from(alternate, 'base64url'), Buffer.from(parts[3], 'base64url'));
  parts[3] = alternate;
  assert.equal(guard.verifyHostedRequestToken(request(parts.join('.')), userId), false);
});

test('invalid account identities and unavailable crypto fail closed', () => {
  const guard = proof();
  const token = guard.issueHostedRequestToken(userId);
  for (const id of ['', 'someone@example.test', `${userId}\nother`, 'a'.repeat(36), '../owner']) {
    assert.equal(guard.issueHostedRequestToken(id), null);
    assert.equal(guard.verifyHostedRequestToken(request(token), id), false);
  }
  const broken = proof({ cryptoModule: { ...crypto, createHmac() { throw Error('CRYPTO_UNAVAILABLE'); } } });
  assert.equal(broken.issueHostedRequestToken(userId), null);
  assert.equal(broken.verifyHostedRequestToken(request(token), userId), false);
});

test('token verification consumes neither credentials nor the submitted body', async () => {
  const guard = proof();
  const token = guard.issueHostedRequestToken(userId);
  const req = new Request('https://investprotrading.fr/api/metasync/hosted', { method: 'POST', headers: { [header]: token }, body: '{"fixture":"no real credentials"}' });
  assert.equal(guard.verifyHostedRequestToken(req, userId), true);
  assert.equal(req.bodyUsed, false);
  assert.equal(await req.text(), '{"fixture":"no real credentials"}');
});

function hostedRoute({ signedIn = true, authFailure = false, authId = userId, environment = {}, now, dependenciesUnavailable = false, successfulMutation = false, browserOrigin = 'https://investprotrading.fr' } = {}) {
  const env = { VERCEL_ENV: 'production', METASYNC_HOSTED_ENCRYPTION_KEY: secret, METASYNC_HOSTED_WORKER_TOKEN: '78'.repeat(32), ...environment };
  const counts = { auth: 0, body: 0, database: 0, catalog: 0, crypto: 0, seal: 0, writes: 0 };
  const warnings = [];
  const pairs = [];
  const realProof = proof({ environment: env, now });
  const realHosted = compile('lib/metasync/hosted.ts', {
    'node:crypto': crypto,
    '@/lib/supabase/server': { createClient() { throw Error('AUTH_IS_MOCKED_IN_REQUEST_PROOF_TEST'); } },
  }, { environment: env, now });
  const realOrigin = compile('lib/metasync/server.ts', {
    'node:crypto': crypto,
    '@/lib/supabase/server': { createClient() { throw Error('NO_AUTH_EXPECTED_IN_PURE_ORIGIN'); } },
    '@/lib/telegram/server': { database() { throw Error('NO_DB_EXPECTED_IN_PURE_ORIGIN'); } },
  }, { environment: env, now });
  const modules = {
    'node:crypto': { randomBytes(size) { counts.crypto++; if (successfulMutation) return crypto.randomBytes(size); throw Error('NO_CONNECTION_CRYPTO_EXPECTED'); } },
    '@/lib/metasync/server-catalog': { async serverCatalog() { counts.catalog++; if (dependenciesUnavailable) throw Error('CATALOG_UNAVAILABLE'); return successfulMutation ? [{ id: 'offline-fixture', label: 'Offline fixture', platform: 'MT5', server: 'Offline-Fixture' }] : []; } },
    '@/lib/metasync/server': {
      sameOrigin: realOrigin.sameOrigin,
      digest(value) { counts.crypto++; if (successfulMutation) return realOrigin.digest(value); throw Error('NO_CONNECTION_DIGEST_EXPECTED'); },
      database() {
        counts.database++;
        if (dependenciesUnavailable) throw Error('DATABASE_UNAVAILABLE');
        return {
          from(table) {
            assert.equal(table, 'investpro_mt_hosted');
            return {
              select() { return this; },
              eq(column, value) { assert.equal(column, 'user_id'); assert.equal(value, authId); return this; },
              async order() { return { data: [], error: null }; },
              insert() { counts.writes++; throw Error('NO_WRITE_ALLOWED'); },
              update() { counts.writes++; throw Error('NO_WRITE_ALLOWED'); },
            };
          },
          async rpc(name, params) {
            counts.writes++;
            if (!successfulMutation) throw Error('NO_RPC_ALLOWED');
            pairs.push({ name, params });
            return { data: '55555555-5555-4555-8555-555555555555', error: null };
          },
        };
      },
    },
    '@/lib/metasync/request-proof': realProof,
    '@/lib/metasync/hosted': {
      async hostedUser() { counts.auth++; if (authFailure) throw Error('AUTH_UNAVAILABLE'); return signedIn ? { id: authId } : null; },
      async body(req) { counts.body++; if (successfulMutation) return realHosted.body(req); throw Error('INTENTIONAL_INVALID_FIXTURE_BODY'); },
      seal(password, owner) { counts.seal++; if (successfulMutation) return realHosted.seal(password, owner); throw Error('NO_SEAL_ALLOWED'); },
    },
  };
  const route = compile('app/api/metasync/hosted/route.ts', modules, { environment: env, now, warnings });
  return {
    counts, warnings, pairs, proof: realProof, unseal: realHosted.unseal,
    async get({ proofOnly = false } = {}) { const response = await route.GET(new Request(`${browserOrigin}/api/metasync/hosted${proofOnly ? '?requestProof=1' : ''}`)); return { response, body: await response.json() }; },
    async handle(url, options, origin) {
      const headers = new Headers(options.headers);
      if (origin !== undefined) headers.set('Origin', origin);
      const req = new Request(new URL(url, browserOrigin), { ...options, headers });
      return options.method === 'POST' ? route.POST(req) : route.GET(req);
    },
    async post({ origin, token, contentType = 'application/json', fetchSite, extra = {} } = {}) {
      const headers = new Headers(extra);
      if (origin !== undefined) headers.set('Origin', origin);
      if (token !== undefined) headers.set(header, token);
      if (contentType !== null) headers.set('Content-Type', contentType);
      if (fetchSite !== undefined) headers.set('Sec-Fetch-Site', fetchSite);
      const response = await route.POST(new Request('https://internal-upstream.vercel.app/api/metasync/hosted', { method: 'POST', headers }));
      return { response, body: await response.json() };
    },
  };
}

function noConnectionSideEffects(counts) {
  assert.equal(counts.crypto + counts.seal + counts.writes, 0);
}

test('authenticated GET returns a private uncached proof and never starts a connection', async () => {
  const api = hostedRoute();
  const result = await api.get();
  assert.equal(result.response.status, 200);
  assert.equal(result.body.enabled, true);
  assert.equal(api.proof.verifyHostedRequestToken(request(result.body.requestToken), userId), true);
  assert.equal(result.response.headers.get('Cache-Control'), 'private, no-store');
  assert.match(result.response.headers.get('Vary'), /Cookie/i);
  assert.match(result.response.headers.get('Vary'), /Origin/i);
  assert.equal(result.response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(api.counts.database, 1);
  assert.equal(api.counts.body, 0);
  noConnectionSideEffects(api.counts);
});

test('unauthenticated GET cannot obtain a proof and auth failure does not expose one', async () => {
  for (const options of [{ signedIn: false }, { authFailure: true }]) {
    const api = hostedRoute(options);
    const result = await api.get();
    assert.equal(result.response.status, options.authFailure ? 503 : 200);
    assert.equal(Object.hasOwn(result.body, 'requestToken'), false);
    assert.equal(api.counts.database + api.counts.catalog + api.counts.body, 0);
    noConnectionSideEffects(api.counts);
  }
});

test('proof-only GET is authenticated and private even when connection storage and catalog are unavailable', async () => {
  const api = hostedRoute({ dependenciesUnavailable: true });
  const result = await api.get({ proofOnly: true });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.enabled, true);
  assert.equal(api.proof.verifyHostedRequestToken(request(result.body.requestToken), userId), true);
  assert.equal(Object.hasOwn(result.body, 'connections'), false);
  assert.equal(Object.hasOwn(result.body, 'brokers'), false);
  assert.equal(result.response.headers.get('Cache-Control'), 'private, no-store');
  assert.match(result.response.headers.get('Vary'), /Cookie/i);
  assert.match(result.response.headers.get('Vary'), /Origin/i);
  assert.equal(result.response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(api.counts.database + api.counts.catalog + api.counts.body, 0);
  noConnectionSideEffects(api.counts);
});

test('signed-out or unverifiable proof-only GET never reads connection storage or issues a token', async () => {
  for (const options of [{ signedIn: false }, { authFailure: true }]) {
    const api = hostedRoute({ ...options, dependenciesUnavailable: true });
    const result = await api.get({ proofOnly: true });
    assert.equal(result.response.status, options.authFailure ? 503 : 200);
    assert.equal(Object.hasOwn(result.body, 'requestToken'), false);
    assert.equal(api.counts.database + api.counts.catalog + api.counts.body, 0);
    assert.equal(result.response.headers.get('Cache-Control'), 'private, no-store');
    noConnectionSideEffects(api.counts);
  }
});

test('the real client, proof GET and hosted POST pair an own fixture exactly once through intercepted transport and DB', async () => {
  const client = compile('lib/metasync/hosted-request-client.ts', {});
  const payload = Object.freeze({ broker: 'offline-fixture', login: '123456', password: 'offline-placeholder', currency: 'USD', type: 'prop', syncConsent: true });
  for (const origin of [undefined, 'null', legacyOrigin]) {
    const api = hostedRoute({ successfulMutation: true, browserOrigin: origin === legacyOrigin ? legacyOrigin : undefined, environment: { METASYNC_SITE_ORIGIN: 'https://obsolete.example.invalid' } });
    const calls = [];
    const fetcher = async (url, options) => {
      calls.push({ url, method: options.method ?? 'GET' });
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.mode, 'same-origin');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.redirect, 'error');
      return api.handle(url, options, origin);
    };
    const result = await client.sendHostedMutation(payload, fetcher);
    assert.equal(result.ok, true);
    assert.equal(result.id, '55555555-5555-4555-8555-555555555555');
    assert.deepEqual(calls, [{ url: '/api/metasync/hosted?requestProof=1', method: 'GET' }, { url: '/api/metasync/hosted', method: 'POST' }]);
    assert.equal(api.pairs.length, 1);
    assert.equal(api.pairs[0].name, 'investpro_hosted_pair_auto');
    const params = api.pairs[0].params;
    assert.equal(params.p_user, userId);
    assert.equal(params.p_platform, 'MT5');
    assert.equal(params.p_login, payload.login);
    assert.equal(params.p_server, 'Offline-Fixture');
    assert.equal(params.p_currency, payload.currency);
    assert.equal(params.p_type, payload.type);
    assert.equal(params.p_broker, payload.broker);
    assert.notEqual(params.p_secret, payload.password);
    assert.equal(api.unseal(params.p_secret, userId), payload.password);
    assert.match(params.p_hash, /^[a-f0-9]{64}$/);
    assert.equal(api.counts.auth, 2);
    assert.equal(api.counts.database, 1); // Only the POST gets the intercepted DB.
    assert.equal(api.counts.catalog, 1);
    assert.equal(api.counts.body, 1);
    assert.equal(api.counts.seal, 1);
    assert.equal(api.counts.writes, 1);
    assert.equal(api.warnings.length, 0);
  }
});

test('the actual route accepts missing or opaque Origin only with a fresh own proof and JSON', async () => {
  for (const origin of [undefined, 'null']) {
    for (const fetchSite of [undefined, 'same-origin', 'same-site', 'none']) {
      const api = hostedRoute();
      const result = await api.post({ origin, fetchSite, token: api.proof.issueHostedRequestToken(userId) });
      assert.equal(result.response.status, 400);
      assert.match(result.body.error, /demande reçue est invalide/);
      assert.equal(api.counts.auth, 1);
      assert.equal(api.counts.body, 1);
      assert.equal(api.counts.database + api.counts.catalog, 0);
      assert.equal(api.warnings.length, 0);
      noConnectionSideEffects(api.counts);
    }
  }
});

test('valid JSON charset forms can use the narrow proof fallback', async () => {
  for (const contentType of ['application/json; charset=utf-8', 'application/json;charset=UTF-8', 'application/json; charset="utf-8"', 'Application/JSON']) {
    const api = hostedRoute();
    const result = await api.post({ token: api.proof.issueHostedRequestToken(userId), contentType });
    assert.equal(result.response.status, 400, contentType);
    assert.equal(api.counts.body, 1);
    noConnectionSideEffects(api.counts);
  }
});

test('fallback rejects missing proof, another account, tampering, expiry and key rotation before body or DB', async () => {
  for (const origin of [undefined, 'null']) {
    const cases = [undefined, 'invalid', proof().issueHostedRequestToken(otherUserId), signedToken({ expires: nowSeconds }), signedToken({ expires: nowSeconds + 1861 }), signedToken({ signingSecret: '56'.repeat(32) })];
    for (const token of cases) {
      const api = hostedRoute();
      const result = await api.post({ origin, token });
      assert.equal(result.response.status, 403);
      assert.equal(result.body.code, token === undefined ? 'MT_REQUEST_PROOF_REQUIRED' : 'MT_REQUEST_PROOF_EXPIRED');
      assert.equal(api.counts.body + api.counts.database + api.counts.catalog, 0);
      noConnectionSideEffects(api.counts);
    }
  }
});

test('a real GET-issued proof expires and a fresh GET repairs verification without any mutation', async () => {
  let current = nowSeconds * 1000;
  const api = hostedRoute({ now: () => current });
  const issued = await api.get();
  current += 1800_000;
  const expired = await api.post({ origin: 'null', token: issued.body.requestToken });
  assert.equal(expired.response.status, 403);
  assert.equal(expired.body.code, 'MT_REQUEST_PROOF_EXPIRED');
  assert.equal(api.counts.body, 0);
  const refreshed = await api.get();
  const accepted = await api.post({ origin: 'null', token: refreshed.body.requestToken });
  assert.equal(accepted.response.status, 400);
  assert.equal(api.counts.body, 1);
  assert.equal(api.counts.database, 2); // Only the two explicit GET reads.
  noConnectionSideEffects(api.counts);
});

test('a missing signing configuration cannot enable the fallback path', async () => {
  const api = hostedRoute({ environment: { METASYNC_HOSTED_ENCRYPTION_KEY: undefined } });
  const result = await api.post({ token: proof().issueHostedRequestToken(userId) });
  assert.equal(result.response.status, 403);
  assert.equal(result.body.code, 'MT_REQUEST_PROOF_EXPIRED');
  assert.equal(api.counts.body + api.counts.database + api.counts.catalog, 0);
  noConnectionSideEffects(api.counts);
});

test('an explicit foreign or malformed Origin cannot be overridden by a valid proof or trusted hints', async () => {
  for (const origin of ['', 'https://evil.example.invalid', 'https://investprotrading.fr.evil.example.invalid', 'http://investprotrading.fr', 'https://investprotrading.fr/', 'https://user@investprotrading.fr', 'https://investprotrading.fr, https://www.investprotrading.fr', 'https://investprotrading.fr:443', 'http://investpro-dashboard1.vercel.app', legacyOrigin + ':443', legacyOrigin + ':444', legacyOrigin + '/', 'https://user@investpro-dashboard1.vercel.app', legacyOrigin + '.evil.example.invalid', 'https://investpro-dashboard1-foreign.vercel.app', 'https://investpro-dashboard1-invest-pronos.vercel.app', 'https://investpro-dashboard1-preview-invest-pronos.vercel.app', 'https://unrelated.vercel.app']) {
    const api = hostedRoute();
    const result = await api.post({ origin, token: api.proof.issueHostedRequestToken(userId), fetchSite: 'same-origin', extra: { Referer: 'https://investprotrading.fr/dashboard/connexions/metatrader', Host: 'investprotrading.fr', 'X-Forwarded-Host': 'investprotrading.fr' } });
    assert.equal(result.response.status, 403, origin);
    assert.equal(result.body.code, 'MT_REQUEST_ORIGIN');
    assert.equal(api.counts.body + api.counts.database + api.counts.catalog, 0);
    noConnectionSideEffects(api.counts);
  }
});

test('cross-site and ambiguous fetch metadata always block fallback even with the valid proof', async () => {
  for (const origin of [undefined, 'null']) {
    for (const fetchSite of ['cross-site', 'Same-Origin', 'same-origin, same-site', '', 'unexpected']) {
      const api = hostedRoute();
      const result = await api.post({ origin, fetchSite, token: api.proof.issueHostedRequestToken(userId) });
      assert.equal(result.response.status, 403, `${origin}/${fetchSite}`);
      assert.equal(result.body.code, 'MT_REQUEST_ORIGIN');
      assert.equal(api.counts.body + api.counts.database + api.counts.catalog, 0);
      noConnectionSideEffects(api.counts);
    }
  }
  for (const origin of ['https://investprotrading.fr', legacyOrigin]) {
    const api = hostedRoute();
    const result = await api.post({ origin, fetchSite: 'cross-site', token: api.proof.issueHostedRequestToken(userId) });
    assert.equal(result.response.status, 403);
    assert.equal(api.counts.body, 0);
  }
});

test('form submissions and non-JSON fallback requests cannot use even a valid proof', async () => {
  for (const contentType of [null, '', 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=fixture', 'application/json-patch+json', 'application/json, text/plain', 'application/json; charset=iso-8859-1', 'application/json; arbitrary=value', 'application/json; charset=utf-8; charset=utf-8', 'application/json; charset="utf-8"suffix', 'application/json;']) {
    const api = hostedRoute();
    const result = await api.post({ contentType, token: api.proof.issueHostedRequestToken(userId) });
    assert.equal(result.response.status, 403, contentType);
    assert.equal(result.body.code, 'MT_REQUEST_ORIGIN');
    assert.equal(api.counts.body + api.counts.database + api.counts.catalog, 0);
    noConnectionSideEffects(api.counts);
  }
});

test('a valid proof does not bypass session verification or preview isolation', async () => {
  for (const [options, origin, status] of [[{ signedIn: false }, undefined, 401], [{ authFailure: true }, 'null', 503], [{ environment: { VERCEL_ENV: 'preview', VERCEL_URL: 'preview.vercel.app' } }, undefined, 403], [{ environment: { VERCEL_ENV: 'preview', VERCEL_URL: 'preview.vercel.app' } }, 'https://preview.vercel.app', 503]]) {
    const api = hostedRoute(options);
    const result = await api.post({ origin, token: api.proof.issueHostedRequestToken(userId) });
    assert.equal(result.response.status, status);
    assert.equal(api.counts.body + api.counts.database + api.counts.catalog, 0);
    noConnectionSideEffects(api.counts);
  }
});

test('fallback rejection diagnostics contain only coarse reasons, never a token, account or raw headers', async () => {
  const api = hostedRoute();
  const token = api.proof.issueHostedRequestToken(userId);
  await api.post({ origin: 'https://evil.example.invalid/?secret=do-not-log', token, extra: { Cookie: 'session=do-not-log' } });
  assert.equal(api.warnings.length, 1);
  const warning = JSON.parse(JSON.stringify(api.warnings[0]));
  assert.deepEqual(warning, ['METASYNC_REQUEST_REJECTED', { reason: 'foreign_origin' }]);
  const output = JSON.stringify(warning);
  for (const value of [token, userId, 'evil.example.invalid', 'session=do-not-log']) assert(!output.includes(value));
});
