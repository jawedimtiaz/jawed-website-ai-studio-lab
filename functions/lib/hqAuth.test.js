import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPair, SignJWT, importX509 } from 'jose';
import { verifyHqFirebaseToken, resetHqCertificateCacheForTests } from './hqAuth.js';

const now = Date.now();
const seconds = Math.floor(now / 1000);
const project = 'refined-actor-skhlb';
const testCertificate = readFileSync(new URL('./fixtures/hq-auth-test-certificate.pem', import.meta.url), 'utf8');

async function setup() {
  resetHqCertificateCacheForTests();
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const fetchImpl = async () => new Response(JSON.stringify({ 'unit-test-key': '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----' }), {
    status: 200, headers: { 'cache-control': 'public, max-age=300' }
  });
  const importCertificate = async () => publicKey;
  return { privateKey, fetchImpl, importCertificate };
}

async function tokenFor(privateKey, overrides = {}, kid = 'unit-test-key', alg = 'RS256') {
  const claims = {
    sub: 'unit-test-firebase-uid',
    aud: project,
    iss: 'https://securetoken.google.com/' + project,
    iat: seconds - 30,
    exp: seconds + 3600,
    auth_time: seconds - 60,
    email: 'jawedimtiaz@gmail.com',
    email_verified: true,
    ...overrides
  };
  return new SignJWT(claims).setProtectedHeader({ alg, kid, typ: 'JWT' }).sign(privateKey);
}

async function verify(token, ctx) {
  return verifyHqFirebaseToken(token, {
    fetchImpl: ctx.fetchImpl,
    importCertificate: ctx.importCertificate,
    now
  });
}

test('imports a real X.509 certificate through the production jose importer', async () => {
  const key = await importX509(testCertificate, 'RS256');
  assert.equal(key.type, 'public');
  assert.equal(key.algorithm.name, 'RSASSA-PKCS1-v1_5');
});

test('allows the first owner', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey), ctx);
  assert.equal(result.ok, true);
  assert.equal(result.identity.email, 'jawedimtiaz@gmail.com');
});

test('allows the second owner', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { email: 'jawed@jawed.co.in' }), ctx);
  assert.equal(result.ok, true);
  assert.equal(result.identity.email, 'jawed@jawed.co.in');
});

test('denies another verified account', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { email: 'other@example.com' }), ctx);
  assert.equal(result.status, 403);
});

test('denies unverified email', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { email_verified: false }), ctx);
  assert.equal(result.ok, false);
});

test('denies expired token', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { exp: seconds - 1 }), ctx);
  assert.equal(result.ok, false);
});

test('denies token for another Firebase project', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { aud: 'wrong-project' }), ctx);
  assert.equal(result.ok, false);
});

test('denies missing token', async () => {
  const result = await verifyHqFirebaseToken(null, { now });
  assert.equal(result.status, 401);
});

test('fails closed when certificate endpoint is unavailable', async () => {
  const ctx = await setup();
  const token = await tokenFor(ctx.privateKey);
  const result = await verifyHqFirebaseToken(token, {
    now,
    fetchImpl: async () => new Response('unavailable', { status: 503 })
  });
  assert.equal(result.ok, false);
});

test('rejects unsupported signing algorithm before fetching certificates', async () => {
  const ctx = await setup();
  const header = btoa(JSON.stringify({ alg: 'HS256', kid: 'unit-test-key' }))
    .replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
  const token = header + '.e30.signature';
  const result = await verify(token, ctx);
  assert.equal(result.code, 'AUTH_TOKEN_ALGORITHM_OR_KEY_INVALID');
});

test('denies a token with a tampered signature', async () => {
  const ctx = await setup();
  const valid = await tokenFor(ctx.privateKey);
  const parts = valid.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  const result = await verify(parts.join('.'), ctx);
  assert.equal(result.ok, false);
});

test('denies a token issued in the future', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { iat: seconds + 60 }), ctx);
  assert.equal(result.ok, false);
});

test('denies an authentication time in the future', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { auth_time: seconds + 60 }), ctx);
  assert.equal(result.ok, false);
});

test('normalizes the allowlisted owner email', async () => {
  const ctx = await setup();
  const result = await verify(await tokenFor(ctx.privateKey, { email: '  JAWED@JAWED.CO.IN  ' }), ctx);
  assert.equal(result.ok, true);
  assert.equal(result.identity.email, 'jawed@jawed.co.in');
});

test('logs only a safe certificate-fetch diagnostic and returns a generic public error', async () => {
  const ctx = await setup();
  const token = await tokenFor(ctx.privateKey);
  let diagnostic;
  const result = await verifyHqFirebaseToken(token, {
    now,
    fetchImpl: async () => { throw new Error('sensitive transport detail'); },
    logDiagnostic: (stage, code) => { diagnostic = { stage, code }; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AUTH_TOKEN_VERIFICATION_FAILED');
  assert.deepEqual(diagnostic, { stage: 'certificate-fetch', code: 'AUTH_CERTIFICATE_FETCH_FAILED' });
  assert.equal(JSON.stringify({ result, diagnostic }).includes('sensitive transport detail'), false);
});

test('logs only a safe certificate-key-import diagnostic and returns a generic public error', async () => {
  const ctx = await setup();
  const token = await tokenFor(ctx.privateKey);
  let diagnostic;
  const result = await verifyHqFirebaseToken(token, {
    now,
    fetchImpl: ctx.fetchImpl,
    importCertificate: async () => { throw new Error('private certificate parsing detail'); },
    logDiagnostic: (stage, code) => { diagnostic = { stage, code }; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AUTH_TOKEN_VERIFICATION_FAILED');
  assert.deepEqual(diagnostic, { stage: 'certificate-key-import', code: 'AUTH_CERTIFICATE_KEY_IMPORT_FAILED' });
  assert.equal(JSON.stringify({ result, diagnostic }).includes('private certificate parsing detail'), false);
});

test('logs only a safe JWT-verification diagnostic and returns a generic public error', async () => {
  const ctx = await setup();
  const token = await tokenFor(ctx.privateKey);
  let diagnostic;
  const result = await verifyHqFirebaseToken(token, {
    now,
    fetchImpl: ctx.fetchImpl,
    importCertificate: ctx.importCertificate,
    verify: async () => { throw new Error('sensitive token verification detail'); },
    logDiagnostic: (stage, code) => { diagnostic = { stage, code }; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AUTH_TOKEN_VERIFICATION_FAILED');
  assert.deepEqual(diagnostic, { stage: 'jwt-signature-and-claims', code: 'AUTH_JWT_VERIFICATION_FAILED' });
  assert.equal(JSON.stringify({ result, diagnostic }).includes('sensitive token verification detail'), false);
});
