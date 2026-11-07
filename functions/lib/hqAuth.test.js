import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyFirebaseToken, verifyHqFirebaseToken, resetHqCertificateCacheForTests } from './hqAuth.js';

const now = Date.now();
const seconds = Math.floor(now / 1000);
const project = 'refined-actor-skhlb';
const allowedEmails = ['jawedimtiaz@gmail.com'];

async function setup() {
  resetHqCertificateCacheForTests();
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const fetchImpl = async () => new Response(JSON.stringify({
    'unit-test-key': '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----'
  }), { status: 200, headers: { 'cache-control': 'public, max-age=300' } });
  return { publicKey, privateKey, fetchImpl, importCertificate: async () => publicKey };
}

async function tokenFor(privateKey, overrides = {}, kid = 'unit-test-key', alg = 'RS256') {
  const claims = {
    sub: 'unit-test-firebase-uid',
    aud: project,
    iss: `https://securetoken.google.com/${project}`,
    iat: seconds - 30,
    exp: seconds + 3600,
    auth_time: seconds - 60,
    email: 'jawedimtiaz@gmail.com',
    email_verified: true,
    ...overrides
  };
  return new SignJWT(claims).setProtectedHeader({ alg, kid, typ: 'JWT' }).sign(privateKey);
}

async function verify(token, ctx, extra = {}) {
  return verifyHqFirebaseToken(token, {
    fetchImpl: ctx.fetchImpl,
    importCertificate: ctx.importCertificate,
    now,
    allowedEmails,
    ...extra
  });
}

test('accepts a correctly signed token for the configured owner', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey), ctx);
  assert.equal(result.ok, true);
  assert.equal(result.identity.email, 'jawedimtiaz@gmail.com');
});

test('adapter preserves the existing HQ helper contract', async () => {
  const ctx = await setup();
  const token = await tokenFor(ctx.privateKey);
  const result = await verifyFirebaseToken(token, {
    FIREBASE_PROJECT_ID: project,
    HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com'
  }, {
    fetchImpl: ctx.fetchImpl,
    importCertificate: ctx.importCertificate,
    now
  });
  assert.equal(result.valid, true);
  assert.equal(result.user.uid, 'unit-test-firebase-uid');
});

test('denies a correctly signed token for a non-allowlisted email', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { email: 'other@example.com' }), ctx);
  assert.equal(result.status, 403);
});

test('denies an email that is not verified', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { email_verified: false }), ctx);
  assert.equal(result.ok, false);
});

test('denies an expired token', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { exp: seconds - 1 }), ctx);
  assert.equal(result.ok, false);
});

test('denies a token for another Firebase project', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { aud: 'wrong-project' }), ctx);
  assert.equal(result.ok, false);
});

test('denies a token with a tampered signature', async () => {
  const ctx = await setup();
  const valid = await tokenFor(ctx.privateKey);
  const parts = valid.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  const result = await verify(parts.join('.'), ctx);
  assert.equal(result.ok, false);
});

test('fails closed when the signing certificate endpoint is unavailable', async () => {
  const ctx = await setup();
  const token = await tokenFor(ctx.privateKey);
  const result = await verifyHqFirebaseToken(token, {
    now,
    allowedEmails,
    fetchImpl: async () => new Response('unavailable', { status: 503 })
  });
  assert.equal(result.ok, false);
});

test('rejects unsupported signing algorithms before certificate retrieval', async () => {
  const ctx = await setup();
  let fetchCalls = 0;
  const fetchImpl = async (...args) => { fetchCalls += 1; return ctx.fetchImpl(...args); };
  const header = btoa(JSON.stringify({ alg: 'HS256', kid: 'unit-test-key' }))
    .replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
  const result = await verify(header + '.e30.signature', { ...ctx, fetchImpl });
  assert.equal(result.code, 'AUTH_TOKEN_ALGORITHM_OR_KEY_INVALID');
  assert.equal(fetchCalls, 0);
});

test('denies a token with a future issued-at claim', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { iat: seconds + 60 }), ctx);
  assert.equal(result.ok, false);
});

test('denies a token with a future authentication time', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { auth_time: seconds + 60 }), ctx);
  assert.equal(result.ok, false);
});

test('denies a token signed by an unknown key id', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, {}, 'unknown-key'), ctx);
  assert.equal(result.ok, false);
});

test('normalizes allowlisted owner email addresses', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { email: ' JAWEDIMTIAZ@GMAIL.COM ' }), ctx);
  assert.equal(result.ok, true);
});
