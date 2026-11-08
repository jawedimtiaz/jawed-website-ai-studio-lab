import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFirebaseToken, resetFirebaseCertificateCacheForTests } from '../functions/lib/hqAuth.js';

const projectId = 'refined-actor-skhlb';
const now = Date.now();
const nowSeconds = Math.floor(now / 1000);
const ownerEnv = {
  FIREBASE_PROJECT_ID: projectId,
  HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com'
};

function base64url(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function fixture() {
  resetFirebaseCertificateCacheForTests();
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount++;
    return new Response(JSON.stringify({ 'test-kid': '-----BEGIN CERTIFICATE-----\nTEST FIXTURE\n-----END CERTIFICATE-----' }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' }
    });
  };
  const importCertificate = async () => pair.publicKey;
  async function makeToken(overrides = {}, { kid = 'test-kid', alg = 'RS256' } = {}) {
    const header = base64url(JSON.stringify({ alg, typ: 'JWT', kid }));
    const payload = base64url(JSON.stringify({
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      sub: 'firebase-owner-uid',
      iat: nowSeconds - 30,
      exp: nowSeconds + 3600,
      auth_time: nowSeconds - 60,
      email: 'jawedimtiaz@gmail.com',
      email_verified: true,
      ...overrides
    }));
    const signingInput = new TextEncoder().encode(header + '.' + payload);
    const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, signingInput));
    return header + '.' + payload + '.' + base64url(signature);
  }
  return { makeToken, fetchImpl, importCertificate, getFetchCount: () => fetchCount };
}

async function verify(token, ctx, env = ownerEnv) {
  return verifyFirebaseToken(token, env, {
    now,
    fetchImpl: ctx.fetchImpl,
    importCertificate: ctx.importCertificate
  });
}

test('accepts a correctly signed Firebase token for the configured owner', async () => {
  const ctx = await fixture();
  const result = await verify(await ctx.makeToken(), ctx);
  assert.equal(result.valid, true);
  assert.equal(result.user.uid, 'firebase-owner-uid');
  assert.equal(result.user.email, 'jawedimtiaz@gmail.com');
});

test('rejects a token whose payload was changed after signing', async () => {
  const ctx = await fixture();
  const token = await ctx.makeToken();
  const parts = token.split('.');
  parts[1] = base64url(JSON.stringify({ sub: 'attacker', email: 'jawedimtiaz@gmail.com' }));
  const result = await verify(parts.join('.'), ctx);
  assert.equal(result.valid, false);
});

test('rejects a token signed by a different RSA key', async () => {
  const ctx = await fixture();
  const token = await ctx.makeToken();
  const other = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const parts = token.split('.');
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', other.privateKey, new TextEncoder().encode(parts[0] + '.' + parts[1])));
  const forged = parts[0] + '.' + parts[1] + '.' + base64url(signature);
  const result = await verify(forged, ctx);
  assert.equal(result.valid, false);
});

test('rejects an unknown key ID after refreshing Firebase certificates', async () => {
  const ctx = await fixture();
  const token = await ctx.makeToken({}, { kid: 'not-in-certificate-set' });
  const result = await verify(token, ctx);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'SIGNING_KEY_NOT_FOUND');
  assert.equal(ctx.getFetchCount(), 2);
});

test('rejects a token with the wrong Firebase audience', async () => {
  const ctx = await fixture();
  const result = await verify(await ctx.makeToken({ aud: 'wrong-project' }), ctx);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'INVALID_AUDIENCE');
});

test('rejects a token with the wrong issuer', async () => {
  const ctx = await fixture();
  const result = await verify(await ctx.makeToken({ iss: 'https://securetoken.google.com/attacker' }), ctx);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'INVALID_ISSUER');
});

test('rejects an expired token', async () => {
  const ctx = await fixture();
  const result = await verify(await ctx.makeToken({ exp: nowSeconds - 1 }), ctx);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'TOKEN_EXPIRED');
});

test('rejects a token issued in the future', async () => {
  const ctx = await fixture();
  const result = await verify(await ctx.makeToken({ iat: nowSeconds + 60 }), ctx);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'INVALID_ISSUED_AT');
});

test('rejects future auth_time', async () => {
  const ctx = await fixture();
  const result = await verify(await ctx.makeToken({ auth_time: nowSeconds + 60 }), ctx);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'INVALID_AUTH_TIME');
});

test('rejects an unverified email', async () => {
  const ctx = await fixture();
  const result = await verify(await ctx.makeToken({ email_verified: false }), ctx);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'EMAIL_UNVERIFIED');
});

test('rejects a verified email outside the owner allowlist', async () => {
  const ctx = await fixture();
  const result = await verify(await ctx.makeToken({ email: 'attacker@example.com' }), ctx);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'UNAUTHORIZED_EMAIL');
});

test('fails closed when Firebase certificate service is unavailable', async () => {
  const ctx = await fixture();
  const token = await ctx.makeToken();
  resetFirebaseCertificateCacheForTests();
  const result = await verifyFirebaseToken(token, ownerEnv, {
    now,
    fetchImpl: async () => new Response('unavailable', { status: 503 })
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'TOKEN_VERIFICATION_FAILED');
});

test('rejects unsupported JWT algorithms before certificate lookup', async () => {
  const ctx = await fixture();
  const token = await ctx.makeToken({}, { alg: 'HS256' });
  const result = await verify(token, ctx);
  assert.equal(result.valid, false);
  assert.equal(result.code, 'INVALID_TOKEN_HEADER');
});

test('rejects malformed and oversized tokens without certificate lookup', async () => {
  const ctx = await fixture();
  assert.equal((await verify('not-a-jwt', ctx)).valid, false);
  assert.equal((await verify('x'.repeat(12001), ctx)).valid, false);
  assert.equal(ctx.getFetchCount(), 0);
});
