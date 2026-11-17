// tests/hq-authorization.test.js
// Automated Unit & Security Tests for Studio HQ Cryptographic Authorization & Hardening

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { verifyFirebaseToken, clearJwksCacheForTests } from '../functions/lib/hqAuth.js';
import { verifyAndAuthorizeOwner, controlledOwnerBootstrap } from '../functions/lib/hqApi.js';
import { createLocalD1, applyHqMigrations } from '../functions/lib/localD1.js';
import { onRequestGet as sessionGet } from '../functions/api/hq/session.js';
import { onRequestGet as clientsGet } from '../functions/api/hq/clients.js';
import { onRequestGet as projectsGet } from '../functions/api/hq/projects.js';

const PROJECT_ID = 'refined-actor-skhlb';
const KEY_ID = 'test-rs256-key-1';

// Generate ephemeral RSA-2048 keypair in memory for cryptographic JWT signing tests
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048
});
const publicJwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: KEY_ID,
  alg: 'RS256',
  use: 'sig'
};

function toBase64Url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createSignedJwt({
  uid = 'owner-uid-123',
  email = 'jawedimtiaz@gmail.com',
  emailVerified = true,
  exp = Math.floor(Date.now() / 1000) + 3600,
  iat = Math.floor(Date.now() / 1000) - 30,
  auth_time = Math.floor(Date.now() / 1000) - 30,
  iss = `https://securetoken.google.com/${PROJECT_ID}`,
  aud = PROJECT_ID,
  alg = 'RS256',
  kid = KEY_ID,
  tamperSignature = false
} = {}) {
  const header = { alg, typ: 'JWT', ...(kid !== undefined ? { kid } : {}) };
  const payload = {
    iss,
    aud,
    sub: uid,
    user_id: uid,
    email,
    email_verified: emailVerified,
    name: 'Jawed Owner',
    exp,
    iat,
    auth_time
  };

  const signingInput = `${toBase64Url(header)}.${toBase64Url(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  let signature = signer.sign(privateKey);

  if (tamperSignature) {
    signature[0] = signature[0] ^ 0xff;
  }

  return `${signingInput}.${toBase64Url(signature)}`;
}

function createFreshTestDb() {
  const db = createLocalD1(':memory:');
  applyHqMigrations(db);
  return db;
}

describe('Studio HQ Cryptographic Auth & Owner Authorization Suite', () => {
  let originalFetch;

  beforeEach(() => {
    clearJwksCacheForTests();
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).includes('securetoken@system.gserviceaccount.com')) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'public, max-age=3600'
          }
        });
      }
      throw new Error(`Unexpected external fetch in unit test: ${url}`);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearJwksCacheForTests();
  });

  const baseEnv = {
    ENVIRONMENT: 'test',
    FIREBASE_PROJECT_ID: PROJECT_ID,
    HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com,jawed@jawed.co.in'
  };

  test('1. Real RS256 JWKS verification succeeds for both allowlisted owner emails', async () => {
    const db = createFreshTestDb();
    const now = new Date().toISOString();
    await db
      .prepare(`INSERT INTO hq_users (uid, email, display_name, status, created_at, last_seen_at) VALUES (?, ?, ?, 'active', ?, ?)`)
      .bind('uid-gmail', 'jawedimtiaz@gmail.com', 'Jawed Gmail', now, now)
      .run();
    await db
      .prepare(`INSERT INTO hq_users (uid, email, display_name, status, created_at, last_seen_at) VALUES (?, ?, ?, 'active', ?, ?)`)
      .bind('uid-domain', 'jawed@jawed.co.in', 'Jawed Domain', now, now)
      .run();

    for (const [uid, email] of [
      ['uid-gmail', 'jawedimtiaz@gmail.com'],
      ['uid-domain', 'jawed@jawed.co.in']
    ]) {
      const token = createSignedJwt({ uid, email });
      const req = new Request('https://lab.jawed.co.in/api/hq/session', {
        headers: { authorization: `Bearer ${token}` }
      });
      const res = await verifyAndAuthorizeOwner(req, { ...baseEnv, HQ_DB: db });
      assert.equal(res.authorized, true);
      assert.equal(res.owner.uid, uid);
      assert.equal(res.owner.email, email);
      assert.equal(res.owner.status, 'active');
    }
    db.close();
  });

  test('2. Tampered RS256 signature is rejected with 401 INVALID_SIGNATURE', async () => {
    const token = createSignedJwt({ tamperSignature: true });
    const result = await verifyFirebaseToken(token, baseEnv);
    assert.equal(result.valid, false);
    assert.equal(result.code, 'INVALID_SIGNATURE');
  });

  test('3. Unknown signing key ID (kid) is rejected with 401 UNKNOWN_KID', async () => {
    const token = createSignedJwt({ kid: 'unknown-kid-999' });
    const result = await verifyFirebaseToken(token, baseEnv);
    assert.equal(result.valid, false);
    assert.equal(result.code, 'UNKNOWN_KID');
  });

  test('4. Non-RS256 algorithm (HS256) and expired tokens are rejected', async () => {
    const badAlg = createSignedJwt({ alg: 'HS256' });
    const algRes = await verifyFirebaseToken(badAlg, baseEnv);
    assert.equal(algRes.valid, false);
    assert.equal(algRes.code, 'INVALID_ALGORITHM');

    const expired = createSignedJwt({ exp: Math.floor(Date.now() / 1000) - 60 });
    const expRes = await verifyFirebaseToken(expired, baseEnv);
    assert.equal(expRes.valid, false);
    assert.equal(expRes.code, 'TOKEN_EXPIRED');

    const unverified = createSignedJwt({ emailVerified: false });
    const unvRes = await verifyFirebaseToken(unverified, baseEnv);
    assert.equal(unvRes.valid, false);
    assert.equal(unvRes.code, 'EMAIL_UNVERIFIED');
  });

  test('5. Un-enrolled owner fails closed with 403 OWNER_NOT_ENROLLED (no implicit auto-enroll)', async () => {
    const db = createFreshTestDb();
    const token = createSignedJwt({ uid: 'uid-new-1', email: 'jawedimtiaz@gmail.com' });
    const req = new Request('https://lab.jawed.co.in/api/hq/session', {
      headers: { authorization: `Bearer ${token}` }
    });

    const result = await verifyAndAuthorizeOwner(req, { ...baseEnv, HQ_DB: db });
    assert.equal(result.authorized, false);
    assert.equal(result.response.status, 403);
    const body = await result.response.json();
    assert.equal(body.error.code, 'OWNER_NOT_ENROLLED');

    const countRow = await db.prepare('SELECT COUNT(*) as total FROM hq_users').first();
    assert.equal(Number(countRow.total), 0);

    const audit = await db
      .prepare(`SELECT action FROM audit_logs WHERE action = 'OWNER_ENROLLMENT_REJECTED'`)
      .first();
    assert.ok(audit);
    db.close();
  });

  test('6. Controlled bootstrap respects ALLOW_CONTROLLED_BOOTSTRAP and non-empty hq_users gate', async () => {
    const db = createFreshTestDb();
    const token1 = createSignedJwt({ uid: 'uid-boot-1', email: 'jawedimtiaz@gmail.com' });
    const token2 = createSignedJwt({ uid: 'uid-boot-2', email: 'jawed@jawed.co.in' });

    // Disabled by default
    const disabledRes = await controlledOwnerBootstrap(
      new Request('https://lab.jawed.co.in/api/hq/session/enroll', {
        method: 'POST',
        headers: { authorization: `Bearer ${token1}` }
      }),
      { ...baseEnv, HQ_DB: db }
    );
    assert.equal(disabledRes.status, 403);
    assert.equal((await disabledRes.json()).error.code, 'BOOTSTRAP_DISABLED');

    // Enabled when explicitly set and table is empty
    const enabledRes = await controlledOwnerBootstrap(
      new Request('https://lab.jawed.co.in/api/hq/session/enroll', {
        method: 'POST',
        headers: { authorization: `Bearer ${token1}` }
      }),
      { ...baseEnv, ALLOW_CONTROLLED_BOOTSTRAP: 'true', HQ_DB: db }
    );
    assert.equal(enabledRes.status, 201);
    const bootBody = await enabledRes.json();
    assert.equal(bootBody.enrolled, true);
    assert.equal(bootBody.owner.uid, 'uid-boot-1');

    // Subsequent bootstrap rejected when owner already exists
    const secondRes = await controlledOwnerBootstrap(
      new Request('https://lab.jawed.co.in/api/hq/session/enroll', {
        method: 'POST',
        headers: { authorization: `Bearer ${token2}` }
      }),
      { ...baseEnv, ALLOW_CONTROLLED_BOOTSTRAP: 'true', HQ_DB: db }
    );
    assert.equal(secondRes.status, 403);
    assert.equal((await secondRes.json()).error.code, 'OWNER_ALREADY_EXISTS');
    db.close();
  });

  test('7. Disabled owner rejected (403 OWNER_DISABLED) and cannot be reactivated or query endpoints', async () => {
    const db = createFreshTestDb();
    const now = new Date().toISOString();
    await db
      .prepare(`INSERT INTO hq_users (uid, email, display_name, status, created_at, last_seen_at) VALUES (?, ?, ?, 'disabled', ?, ?)`)
      .bind('uid-disabled', 'jawedimtiaz@gmail.com', 'Disabled Owner', now, now)
      .run();

    const token = createSignedJwt({ uid: 'uid-disabled', email: 'jawedimtiaz@gmail.com' });
    const headers = { authorization: `Bearer ${token}` };
    const env = { ...baseEnv, HQ_DB: db };

    const sRes = await sessionGet({ request: new Request('https://lab.jawed.co.in/api/hq/session', { headers }), env });
    assert.equal(sRes.status, 403);
    assert.equal((await sRes.json()).error.code, 'OWNER_DISABLED');

    const cRes = await clientsGet({ request: new Request('https://lab.jawed.co.in/api/hq/clients', { headers }), env });
    assert.equal(cRes.status, 403);

    const pRes = await projectsGet({ request: new Request('https://lab.jawed.co.in/api/hq/projects', { headers }), env });
    assert.equal(pRes.status, 403);

    const row = await db.prepare('SELECT status FROM hq_users WHERE uid = ?').bind('uid-disabled').first();
    assert.equal(row.status, 'disabled');
    db.close();
  });

  test('8. Email mismatch between token and D1 row fails closed with 403 EMAIL_MISMATCH', async () => {
    const db = createFreshTestDb();
    const now = new Date().toISOString();
    await db
      .prepare(`INSERT INTO hq_users (uid, email, display_name, status, created_at, last_seen_at) VALUES (?, ?, ?, 'active', ?, ?)`)
      .bind('uid-mismatch', 'jawed@jawed.co.in', 'Mismatch Owner', now, now)
      .run();

    const token = createSignedJwt({ uid: 'uid-mismatch', email: 'jawedimtiaz@gmail.com' });
    const res = await verifyAndAuthorizeOwner(
      new Request('https://lab.jawed.co.in/api/hq/session', { headers: { authorization: `Bearer ${token}` } }),
      { ...baseEnv, HQ_DB: db }
    );
    assert.equal(res.authorized, false);
    assert.equal(res.response.status, 403);
    assert.equal((await res.response.json()).error.code, 'EMAIL_MISMATCH');
    db.close();
  });

  test('9. Non-allowlisted email rejected with 403 UNAUTHORIZED_EMAIL', async () => {
    const db = createFreshTestDb();
    const token = createSignedJwt({ uid: 'attacker-uid', email: 'attacker@example.com' });
    const res = await verifyAndAuthorizeOwner(
      new Request('https://lab.jawed.co.in/api/hq/session', { headers: { authorization: `Bearer ${token}` } }),
      { ...baseEnv, HQ_DB: db }
    );
    assert.equal(res.authorized, false);
    assert.equal(res.response.status, 403);
    assert.equal((await res.response.json()).error.code, 'UNAUTHORIZED_EMAIL');
    db.close();
  });

  test('10. Missing HQ_DB or missing production rate limit bindings fail closed with 503', async () => {
    const token = createSignedJwt({ uid: 'uid-active', email: 'jawedimtiaz@gmail.com' });
    const headers = { authorization: `Bearer ${token}` };

    const missingDbRes = await verifyAndAuthorizeOwner(
      new Request('https://lab.jawed.co.in/api/hq/session', { headers }),
      { ...baseEnv, HQ_DB: null }
    );
    assert.equal(missingDbRes.authorized, false);
    assert.equal(missingDbRes.response.status, 503);
    assert.equal((await missingDbRes.response.json()).error.code, 'DATABASE_UNAVAILABLE');

    const db = createFreshTestDb();
    const prodNoLimiterRes = await verifyAndAuthorizeOwner(
      new Request('https://lab.jawed.co.in/api/hq/session', { headers }),
      {
        ENVIRONMENT: 'production',
        FIREBASE_PROJECT_ID: PROJECT_ID,
        HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com,jawed@jawed.co.in',
        HQ_DB: db
      }
    );
    assert.equal(prodNoLimiterRes.authorized, false);
    assert.equal(prodNoLimiterRes.response.status, 503);
    assert.equal((await prodNoLimiterRes.response.json()).error.code, 'RATE_LIMIT_UNAVAILABLE');
    db.close();
  });
});
