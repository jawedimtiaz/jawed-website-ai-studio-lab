// tests/hq-cors-policy.test.js
// Focused automated test suite for Phase 3AB.4: Studio HQ CORS Policy Hardening

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { clearJwksCacheForTests } from '../functions/lib/hqAuth.js';
import { dispatchHqApiRequest } from '../functions/lib/hqRouter.js';
import {
  isHqAllowedOrigin,
  getHqAllowedOrigins,
  hqOptionsResponse,
  applyHqCorsHeaders
} from '../functions/lib/hqApi.js';
import { createLocalD1, applyHqMigrations } from '../functions/lib/localD1.js';

const PROJECT_ID = 'test-cors-hardening-project';
const KEY_ID = 'cors-test-key-1';
const OWNER_UID = 'owner-uid-cors-hardening';
const OWNER_EMAIL = 'jawed@jawed.co.in';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: KEY_ID,
  alg: 'RS256',
  use: 'sig'
};

function toB64Url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signTestToken(uid = OWNER_UID, email = OWNER_EMAIL) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: KEY_ID };
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: uid,
    user_id: uid,
    email,
    email_verified: true,
    name: 'Jawed Imtiaz',
    iat: now - 30,
    auth_time: now - 30,
    exp: now + 3600
  };
  const signingInput = `${toB64Url(header)}.${toB64Url(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${toB64Url(signer.sign(privateKey))}`;
}

async function apiCall(env, path, { method = 'GET', body, token = signTestToken(), headers = {} } = {}) {
  const reqHeaders = new Headers(headers);
  if (token && !reqHeaders.has('Authorization')) {
    reqHeaders.set('Authorization', `Bearer ${token}`);
  }
  if (body !== undefined && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json');
  }

  // Choose appropriate host based on environment
  let baseUrl = 'https://lab.jawed.co.in';
  if (env?.ENVIRONMENT === 'preview') {
    baseUrl = 'https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev';
  } else if (env?.ENVIRONMENT === 'dev-local') {
    baseUrl = 'http://localhost:5173';
  }

  const url = `${baseUrl}${path}`;
  const req = new Request(url, {
    method,
    headers: reqHeaders,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
  const pathname = new URL(url).pathname;
  const response = await dispatchHqApiRequest(pathname, { request: req, env });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, headers: response.headers, data };
}

describe('Phase 3AB.4 — Studio HQ CORS Policy Hardening Suite', () => {
  let db;
  let originalFetch;

  beforeEach(async () => {
    clearJwksCacheForTests();
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).includes('securetoken@system.gserviceaccount.com')) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' }
        });
      }
      throw new Error(`Unexpected external fetch: ${url}`);
    };

    db = createLocalD1(':memory:');
    applyHqMigrations(db);

    const nowIso = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO hq_users (uid, email, display_name, status, created_at, last_seen_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      )
      .bind(OWNER_UID, OWNER_EMAIL, 'Jawed Imtiaz', nowIso, nowIso)
      .run();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearJwksCacheForTests();
    db.close();
  });

  // =========================================================================
  // 1. Production Environment CORS Validation
  // =========================================================================
  describe('1. Production Environment CORS Policy (ENVIRONMENT=lab)', () => {
    const prodEnv = () => ({
      ENVIRONMENT: 'lab',
      CANONICAL_ORIGIN: 'https://lab.jawed.co.in',
      FIREBASE_PROJECT_ID: PROJECT_ID,
      HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com,jawed@jawed.co.in',
      HQ_DB: db,
      HQ_RATE_LIMITER: { limit: async () => ({ success: true }) },
      HQ_WRITE_LIMITER: { limit: async () => ({ success: true }) },
      HQ_SESSION_LIMITER: { limit: async () => ({ success: true }) }
    });

    test('1.1 OPTIONS preflight with allowed Production origin returns 204 with exact origin and Vary: Origin', async () => {
      const res = await apiCall(prodEnv(), '/api/hq/overview', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'https://lab.jawed.co.in' }
      });

      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://lab.jawed.co.in');
      assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
      assert.equal(res.headers.get('vary'), 'Origin');
      assert.ok(res.headers.get('access-control-allow-methods'));
      assert.ok(res.headers.get('access-control-allow-headers')?.includes('authorization'));
      assert.equal(res.headers.get('access-control-max-age'), '86400');
    });

    test('1.2 Secondary allowed Production origin (https://jawed.co.in) is permitted', async () => {
      const res = await apiCall(prodEnv(), '/api/hq/overview', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'https://jawed.co.in' }
      });

      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://jawed.co.in');
      assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
    });

    test('1.3 Preview origin is REJECTED in Production environment with HTTP 403 and zero CORS header', async () => {
      const res = await apiCall(prodEnv(), '/api/hq/overview', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev' }
      });

      assert.equal(res.status, 403);
      assert.equal(res.data.error.code, 'ORIGIN_NOT_ALLOWED');
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    test('1.4 Localhost origin is REJECTED in Production environment', async () => {
      const res = await apiCall(prodEnv(), '/api/hq/overview', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'http://localhost:5173' }
      });

      assert.equal(res.status, 403);
      assert.equal(res.data.error.code, 'ORIGIN_NOT_ALLOWED');
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    test('1.5 Authenticated GET in Production with allowed origin attaches CORS headers', async () => {
      const res = await apiCall(prodEnv(), '/api/hq/overview', {
        method: 'GET',
        headers: { Origin: 'https://lab.jawed.co.in' }
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://lab.jawed.co.in');
      assert.equal(res.headers.get('vary'), 'Origin');
    });
  });

  // =========================================================================
  // 2. Preview Environment CORS Validation
  // =========================================================================
  describe('2. Preview Environment CORS Policy (ENVIRONMENT=preview)', () => {
    const previewEnv = () => ({
      ENVIRONMENT: 'preview',
      CANONICAL_ORIGIN: 'https://preview.lab.jawed.co.in',
      FIREBASE_PROJECT_ID: PROJECT_ID,
      HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com,jawed@jawed.co.in',
      HQ_DB: db
    });

    test('2.1 OPTIONS preflight with allowed Preview workers.dev origin returns 204 with exact origin', async () => {
      const res = await apiCall(previewEnv(), '/api/hq/invoices', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev' }
      });

      assert.equal(res.status, 204);
      assert.equal(
        res.headers.get('access-control-allow-origin'),
        'https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev'
      );
      assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
      assert.equal(res.headers.get('vary'), 'Origin');
    });

    test('2.2 Production origin (https://lab.jawed.co.in) is REJECTED in Preview environment', async () => {
      const res = await apiCall(previewEnv(), '/api/hq/invoices', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'https://lab.jawed.co.in' }
      });

      assert.equal(res.status, 403);
      assert.equal(res.data.error.code, 'ORIGIN_NOT_ALLOWED');
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    test('2.3 Localhost origin is REJECTED in Preview environment', async () => {
      const res = await apiCall(previewEnv(), '/api/hq/invoices', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'http://localhost:3000' }
      });

      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  });

  // =========================================================================
  // 3. Local Development & Test Environment CORS Validation
  // =========================================================================
  describe('3. Local Development & Test CORS Policy', () => {
    const devEnv = () => ({
      ENVIRONMENT: 'dev-local',
      FIREBASE_PROJECT_ID: PROJECT_ID,
      HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com,jawed@jawed.co.in',
      HQ_DB: db
    });

    test('3.1 Localhost development origin (http://localhost:5173) is permitted in dev-local', async () => {
      const res = await apiCall(devEnv(), '/api/hq/session', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'http://localhost:5173' }
      });

      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.equal(res.headers.get('vary'), 'Origin');
    });

    test('3.2 Localhost alternate port (http://localhost:3000) is permitted in dev-local', async () => {
      const res = await apiCall(devEnv(), '/api/hq/session', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'http://localhost:3000' }
      });

      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    });

    test('3.3 127.0.0.1 loopback origin is permitted in dev-local', async () => {
      const res = await apiCall(devEnv(), '/api/hq/session', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'http://127.0.0.1:5173' }
      });

      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
    });

    test('3.4 Arbitrary external origin (https://evil.com) is REJECTED in dev-local', async () => {
      const res = await apiCall(devEnv(), '/api/hq/session', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'https://evil.com' }
      });

      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  });

  // =========================================================================
  // 4. Unauthorized Origin Rejection & Anti-Wildcard Verification
  // =========================================================================
  describe('4. Unauthorized Origin Rejection & Anti-Wildcard Enforcement', () => {
    const testEnv = () => ({
      ENVIRONMENT: 'test',
      FIREBASE_PROJECT_ID: PROJECT_ID,
      HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com,jawed@jawed.co.in',
      HQ_DB: db
    });

    test('4.1 Wildcard origin ("*") in Origin header is strictly rejected', async () => {
      const res = await apiCall(testEnv(), '/api/hq/overview', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: '*' }
      });

      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    test('4.2 "null" string origin is strictly rejected', async () => {
      const res = await apiCall(testEnv(), '/api/hq/overview', {
        method: 'OPTIONS',
        token: null,
        headers: { Origin: 'null' }
      });

      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    test('4.3 Malicious origin cannot perform authenticated API mutations', async () => {
      const res = await apiCall(testEnv(), '/api/hq/notes', {
        method: 'POST',
        headers: { Origin: 'https://attacker.example' },
        body: { client_id: 'any-id', content: 'Malicious note' }
      });

      assert.equal(res.status, 403);
      assert.equal(res.data.error.code, 'ORIGIN_NOT_ALLOWED');
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    test('4.4 Error response on unauthorized origin NEVER exposes permissive CORS headers', async () => {
      const res = await apiCall(testEnv(), '/api/hq/contacts', {
        method: 'GET',
        headers: { Origin: 'https://unauthorized-third-party.com' }
      });

      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  });

  // =========================================================================
  // 5. Missing Origin Header (Same-Origin / Direct CLI / cURL)
  // =========================================================================
  describe('5. Missing Origin Header Handling', () => {
    const testEnv = () => ({
      ENVIRONMENT: 'test',
      FIREBASE_PROJECT_ID: PROJECT_ID,
      HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com,jawed@jawed.co.in',
      HQ_DB: db
    });

    test('5.1 OPTIONS without Origin header returns 204 with Allow and NO CORS headers', async () => {
      const res = await apiCall(testEnv(), '/api/hq/overview', {
        method: 'OPTIONS',
        token: null
      });

      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      assert.ok(res.headers.get('allow'));
      assert.equal(res.headers.get('cache-control'), 'no-store, private, max-age=0');
    });

    test('5.2 Authenticated GET without Origin header proceeds normally without CORS headers', async () => {
      const res = await apiCall(testEnv(), '/api/hq/overview', { method: 'GET' });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  });

  // =========================================================================
  // 6. Direct Helper Functions Unit Tests
  // =========================================================================
  describe('6. Direct CORS Helper Verification', () => {
    test('6.1 hqOptionsResponse never emits wildcard without explicit authorized origin', () => {
      const resDefault = hqOptionsResponse('GET, POST, OPTIONS');
      assert.equal(resDefault.status, 204);
      assert.equal(resDefault.headers.get('access-control-allow-origin'), null);
      assert.equal(resDefault.headers.get('allow'), 'GET, POST, OPTIONS');
    });

    test('6.2 hqOptionsResponse with unauthorized origin returns 403', () => {
      const req = new Request('https://lab.jawed.co.in/api/hq/tasks', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.attacker.com' }
      });
      const env = { ENVIRONMENT: 'lab', CANONICAL_ORIGIN: 'https://lab.jawed.co.in' };

      const res = hqOptionsResponse({ request: req, env }, 'GET, POST, OPTIONS');
      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    test('6.3 applyHqCorsHeaders only reflects allowed origins and sets Vary: Origin', () => {
      const baseResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
      const env = { ENVIRONMENT: 'lab', CANONICAL_ORIGIN: 'https://lab.jawed.co.in' };

      // Case A: Disallowed origin
      const reqBad = new Request('https://lab.jawed.co.in/api/hq/leads', {
        headers: { Origin: 'https://rogue.example' }
      });
      const resBad = applyHqCorsHeaders(baseResponse, reqBad, env);
      assert.equal(resBad.headers.get('access-control-allow-origin'), null);

      // Case B: Allowed origin
      const reqGood = new Request('https://lab.jawed.co.in/api/hq/leads', {
        headers: { Origin: 'https://lab.jawed.co.in' }
      });
      const resGood = applyHqCorsHeaders(baseResponse, reqGood, env);
      assert.equal(resGood.headers.get('access-control-allow-origin'), 'https://lab.jawed.co.in');
      assert.equal(resGood.headers.get('vary'), 'Origin');
    });
  });
});
