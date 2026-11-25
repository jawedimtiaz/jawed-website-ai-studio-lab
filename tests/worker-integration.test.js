// tests/worker-integration.test.js
// End-to-end integration tests for Cloudflare Worker fetch handler (worker.js)
// Validates Studio HQ integration boundary wiring, enrollment rejection,
// canonical Projects routing, public route preservation, and security headers.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const TEST_ORIGIN = 'https://lab.jawed.co.in';

function createMockEnv(overrides = {}) {
  return {
    ENVIRONMENT: 'test',
    CANONICAL_ORIGIN: TEST_ORIGIN,
    ASSETS: {
      fetch: async (req) => {
        const url = new URL(req.url);
        if (url.pathname === '/' || url.pathname === '/index.html') {
          return new Response('<!DOCTYPE html><html><body>SPA Root</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' }
          });
        }
        return new Response('Not Found', { status: 404 });
      }
    },
    ...overrides
  };
}

const mockCtx = {
  waitUntil: () => {},
  passThroughOnException: () => {}
};

test('1. POST /api/hq/session/enroll returns 404 and is blocked at Worker level', async () => {
  const req = new Request(`${TEST_ORIGIN}/api/hq/session/enroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@jawed.co.in' })
  });
  const res = await worker.fetch(req, createMockEnv(), mockCtx);

  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.error, 'NOT_FOUND');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('2. POST /api/hq/session/enroll/ (trailing slash) returns 404', async () => {
  const req = new Request(`${TEST_ORIGIN}/api/hq/session/enroll/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@jawed.co.in' })
  });
  const res = await worker.fetch(req, createMockEnv(), mockCtx);

  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.error, 'NOT_FOUND');
});

test('3. POST /api/hq/session/enroll?token=abc (query string) returns 404', async () => {
  const req = new Request(`${TEST_ORIGIN}/api/hq/session/enroll?token=abc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@jawed.co.in' })
  });
  const res = await worker.fetch(req, createMockEnv(), mockCtx);

  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.error, 'NOT_FOUND');
});

test('4. Canonical projects request without authentication returns 401 AUTH_REQUIRED', async () => {
  const req = new Request(`${TEST_ORIGIN}/api/hq/projects`, {
    method: 'GET',
    headers: { origin: TEST_ORIGIN, 'sec-fetch-site': 'same-origin' }
  });
  const res = await worker.fetch(req, createMockEnv(), mockCtx);

  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.error, 'AUTH_REQUIRED');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('5. Unknown canonical projects subroute returns controlled 404', async () => {
  const req = new Request(`${TEST_ORIGIN}/api/hq/projects/p-123/unknown-subroute`, {
    method: 'GET',
    headers: { origin: TEST_ORIGIN, 'sec-fetch-site': 'same-origin' }
  });
  const res = await worker.fetch(req, createMockEnv(), mockCtx);

  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.error, 'NOT_FOUND');
});

test('6. Approved legacy route reaches legacy dispatcher', async () => {
  // Unauthenticated request to /api/hq/overview reaches legacy overview handler, which returns 401
  const req = new Request(`${TEST_ORIGIN}/api/hq/overview`, {
    method: 'GET',
    headers: { origin: TEST_ORIGIN }
  });
  const res = await worker.fetch(req, createMockEnv(), mockCtx);

  // Legacy handler returns HTTP 401 { success: false, error: { code: 'UNAUTHORIZED', ... } }
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error?.code, 'UNAUTHORIZED');
  // Confirm security headers were attached
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('6c. Canonical leads request without authentication returns 401 AUTH_REQUIRED', async () => {
  const req = new Request(`${TEST_ORIGIN}/api/hq/leads`, {
    method: 'GET',
    headers: { origin: TEST_ORIGIN }
  });
  const res = await worker.fetch(req, createMockEnv(), mockCtx);

  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.error, 'AUTH_REQUIRED');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('6b. Canonical clients request without authentication returns 401 AUTH_REQUIRED', async () => {
  const req = new Request(`${TEST_ORIGIN}/api/hq/clients`, {
    method: 'GET',
    headers: { origin: TEST_ORIGIN }
  });
  const res = await worker.fetch(req, createMockEnv(), mockCtx);

  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.error, 'AUTH_REQUIRED');
  // Confirm security headers were attached
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('7. Public /api/contact/log behavior is strictly preserved', async () => {
  // GET /api/contact/log
  const getReq = new Request(`${TEST_ORIGIN}/api/contact/log`, { method: 'GET' });
  const getRes = await worker.fetch(getReq, createMockEnv(), mockCtx);
  assert.equal(getRes.status, 200);
  const getData = await getRes.json();
  assert.equal(getData.ok, true);
  assert.equal(getData.service, 'contact-log');

  // POST /api/contact/log
  const postReq = new Request(`${TEST_ORIGIN}/api/contact/log`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'delivered', form: 'contact' })
  });
  const postRes = await worker.fetch(postReq, createMockEnv(), mockCtx);
  assert.equal(postRes.status, 200);
  const postData = await postRes.json();
  assert.equal(postData.success, true);
  assert.equal(postData.status, 'delivered');
});

test('8. Public root / static asset and SPA behavior is strictly preserved', async () => {
  const req = new Request(`${TEST_ORIGIN}/`, {
    method: 'GET',
    headers: { accept: 'text/html,application/xhtml+xml' }
  });
  const res = await worker.fetch(req, createMockEnv(), mockCtx);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /SPA Root/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
});

test('9. Security headers are strictly retained on all HQ response paths', async () => {
  const paths = [
    { url: `${TEST_ORIGIN}/api/hq/session/enroll`, method: 'POST' },
    { url: `${TEST_ORIGIN}/api/hq/projects`, method: 'GET' },
    { url: `${TEST_ORIGIN}/api/hq/clients`, method: 'GET' },
    { url: `${TEST_ORIGIN}/api/hq/nonexistent-endpoint`, method: 'GET' }
  ];

  for (const { url, method } of paths) {
    const req = new Request(url, { method });
    const res = await worker.fetch(req, createMockEnv(), mockCtx);

    assert.equal(res.headers.get('x-frame-options'), 'DENY', `Failed X-Frame-Options on ${url}`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', `Failed nosniff on ${url}`);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow', `Failed X-Robots-Tag on ${url}`);
    assert.match(res.headers.get('cache-control') || '', /no-store/, `Failed Cache-Control on ${url}`);
  }
});

test('10. End-to-end exception containment: canonical errors never fall through to legacy handlers', async () => {
  // Send a request to a canonical projects path with an env that triggers an unexpected exception in D1/JWT
  const mockExplodingEnv = createMockEnv({
    HQ_DB: {
      prepare() {
        throw new Error('Fatal simulated database crash');
      }
    }
  });

  const req = new Request(`${TEST_ORIGIN}/api/hq/projects`, {
    method: 'GET',
    headers: {
      origin: TEST_ORIGIN,
      authorization: 'Bearer valid.mock.jwt'
    }
  });

  const res = await worker.fetch(req, mockExplodingEnv, mockCtx);
  // Must return 401 (auth failure on invalid mock JWT) or controlled 500 error, NEVER a legacy 404 or legacy route hit
  assert.ok([401, 403, 500].includes(res.status));
  const data = await res.json();
  // Legacy router would return { error: 'HQ endpoint not found' } or legacy payload structure
  assert.equal(data.ok, false);
});

test('11. Known client-side routes are served while unknown browser routes return branded HTTP 404', async () => {
  const env = createMockEnv({
    ASSETS: {
      fetch: async (req) => {
        const url = new URL(req.url);
        if (url.pathname === '/app-routes.json') {
          return new Response(JSON.stringify({
            version: 1,
            routes: ['/', '/tools/:slug', '/tools/:slug/', '/studio-hq', '/studio-hq/*']
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.pathname === '/' || url.pathname === '/index.html') {
          return new Response('<!DOCTYPE html><html><body>Lab SPA Shell</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' }
          });
        }
        if (url.pathname === '/tools/portfolio-tracker/' || url.pathname === '/studio-hq') {
          return new Response('<!DOCTYPE html><html><body>Known route shell</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' }
          });
        }
        return new Response('Not Found', { status: 404 });
      }
    }
  });

  const knownPaths = ['/tools/portfolio-tracker/', '/studio-hq', '/studio-hq/projects'];
  for (const path of knownPaths) {
    const res = await worker.fetch(new Request(`${TEST_ORIGIN}${path}`, {
      headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' }
    }), env, mockCtx);
    assert.equal(res.status, 200, `Expected known route ${path} to remain available`);
  }

  const unknown = await worker.fetch(new Request(`${TEST_ORIGIN}/this-route-does-not-exist`, {
    headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' }
  }), env, mockCtx);
  assert.equal(unknown.status, 404);
  assert.match(await unknown.text(), /Lab SPA Shell/);
  assert.equal(unknown.headers.get('x-frame-options'), 'DENY');
});

test('12. Unknown API and missing static assets remain 404 and never receive the SPA shell', async () => {
  const env = createMockEnv();
  const api = await worker.fetch(new Request(`${TEST_ORIGIN}/api/unknown-route`, {
    headers: { accept: 'text/html' }
  }), env, mockCtx);
  assert.equal(api.status, 404);
  assert.match(api.headers.get('content-type') || '', /application\\/json/);

  const asset = await worker.fetch(new Request(`${TEST_ORIGIN}/assets/missing.js`, {
    headers: { accept: '*/*' }
  }), env, mockCtx);
  assert.equal(asset.status, 404);
  assert.doesNotMatch(await asset.text(), /SPA Root/);
});

