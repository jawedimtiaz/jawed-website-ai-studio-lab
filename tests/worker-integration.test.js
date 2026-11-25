// tests/worker-integration.test.js
// End-to-end integration tests for Cloudflare Worker fetch handler (worker.js)
// Validates Studio HQ integration boundary wiring, enrollment rejection,
// canonical Projects routing, public route preservation, and security headers.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../worker.js';

const TEST_ORIGIN = 'https://lab.jawed.co.in';

const wranglerConfig = JSON.parse(
  fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
    .replace(/"(?:\\.|[^"\\])*"|\/\/.*|\/\*[\s\S]*?\*\//g, (match) => (match.startsWith('"') ? match : ''))
);
const configuredAssets = wranglerConfig.assets ?? {};

function matchesAssetRoutePattern(pathname, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(pathname);
}

function shouldRunWorkerFirst(pathname, rules = configuredAssets.run_worker_first ?? []) {
  const negativeRules = rules.filter((rule) => rule.startsWith('!')).map((rule) => rule.slice(1));
  if (negativeRules.some((rule) => matchesAssetRoutePattern(pathname, rule))) {
    return false;
  }
  const positiveRules = rules.filter((rule) => !rule.startsWith('!'));
  return positiveRules.some((rule) => matchesAssetRoutePattern(pathname, rule));
}

function createMockAssets(options = {}) {
  const notFoundHandling = options.notFoundHandling ?? configuredAssets.not_found_handling ?? 'none';
  const htmlHandling = options.htmlHandling ?? 'auto-trailing-slash';
  const requestedPaths = options.requestedPaths;
  const staticFiles = new Map([
    ['/app-routes.json', {
      body: JSON.stringify({
        version: 1,
        routes: ['/', '/about', '/about/', '/tools/:slug', '/tools/:slug/', '/studio-hq', '/studio-hq/*']
      }),
      contentType: 'application/json'
    }],
    ['/', {
      body: '<!DOCTYPE html><html><body>SPA Root</body></html>',
      contentType: 'text/html; charset=utf-8'
    }],
    ['/tools/portfolio-tracker/', {
      body: '<!DOCTYPE html><html><body>Known route shell</body></html>',
      contentType: 'text/html; charset=utf-8'
    }],
    ['/assets/index-test.js', {
      body: 'console.log("jawed-lab-asset");',
      contentType: 'application/javascript; charset=utf-8'
    }],
    ['/assets/index-test.css', {
      body: 'body { color: #111; }',
      contentType: 'text/css; charset=utf-8'
    }]
  ]);

  return {
    fetch: async (req) => {
      const url = new URL(req.url);
      requestedPaths?.push(url.pathname);
      if (htmlHandling === 'auto-trailing-slash' && url.pathname === '/index.html') {
        return new Response(null, {
          status: 301,
          headers: { location: '/' }
        });
      }
      const asset = staticFiles.get(url.pathname);
      if (asset) {
        return new Response(asset.body, {
          status: 200,
          headers: { 'content-type': asset.contentType }
        });
      }
      if (notFoundHandling === 'single-page-application') {
        const shell = staticFiles.get('/');
        return new Response(shell.body, {
          status: 200,
          headers: { 'content-type': shell.contentType }
        });
      }
      return new Response('Not Found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }
  };
}

function createMockEnv(overrides = {}) {
  return {
    ENVIRONMENT: 'test',
    CANONICAL_ORIGIN: TEST_ORIGIN,
    ASSETS: createMockAssets(),
    ...overrides
  };
}

async function simulateCloudflareEdge(req, env, ctx = mockCtx) {
  const pathname = new URL(req.url).pathname;
  if (shouldRunWorkerFirst(pathname)) {
    return worker.fetch(req, env, ctx);
  }
  return env.ASSETS.fetch(req);
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
  assert.match(api.headers.get('content-type') || '', /application\/json/);

  const asset = await worker.fetch(new Request(`${TEST_ORIGIN}/assets/missing.js`, {
    headers: { accept: '*/*' }
  }), env, mockCtx);
  assert.equal(asset.status, 404);
  assert.doesNotMatch(await asset.text(), /SPA Root/);
});

test('13. Wrangler assets config and edge routing return 404 for missing static assets while preserving SPA and API routing', async () => {
  assert.equal(configuredAssets.not_found_handling, 'none');
  assert.ok(Array.isArray(configuredAssets.run_worker_first));
  assert.ok(configuredAssets.run_worker_first.includes('/*'));
  assert.ok(configuredAssets.run_worker_first.includes('!/assets/*'));

  const env = createMockEnv();

  // 1. Missing /assets/nonexistent.js (served directly by Cloudflare Assets via !/assets/*) -> 404
  const missingJs = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/assets/nonexistent.js`, {
    headers: { accept: '*/*' }
  }), env);
  assert.equal(missingJs.status, 404);
  assert.doesNotMatch(await missingJs.text(), /SPA Root/);

  // 2. Missing /assets/nonexistent.css -> 404
  const missingCss = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/assets/nonexistent.css`, {
    headers: { accept: 'text/css,*/*;q=0.1' }
  }), env);
  assert.equal(missingCss.status, 404);
  assert.doesNotMatch(await missingCss.text(), /SPA Root/);

  // 3. Missing non-asset static resource /missing-script.js (runs through worker.js) -> 404 even with HTML Accept header
  for (const accept of ['*/*', 'text/html']) {
    const missingRootScript = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/missing-script.js`, {
      headers: { accept }
    }), env);
    assert.equal(missingRootScript.status, 404, `Expected 404 for /missing-script.js with Accept: ${accept}`);
    assert.doesNotMatch(await missingRootScript.text(), /SPA Root/);
  }

  // 4. Known SPA routes -> HTTP 200 HTML shell
  for (const route of ['/', '/studio-hq', '/studio-hq/projects', '/tools/portfolio-tracker/']) {
    const spaRes = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}${route}`, {
      headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' }
    }), env);
    assert.equal(spaRes.status, 200, `Expected HTTP 200 for known SPA route ${route}`);
    assert.match(spaRes.headers.get('content-type') || '', /text\/html/);
  }

  // 5. Unknown browser navigation route -> HTTP 404 React shell
  const unknownRoute = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/this-route-does-not-exist`, {
    headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' }
  }), env);
  assert.equal(unknownRoute.status, 404);
  assert.match(unknownRoute.headers.get('content-type') || '', /text\/html/);
  assert.match(await unknownRoute.text(), /SPA Root/);

  // 6. Unknown API route -> JSON HTTP 404
  const unknownApi = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/api/unknown-route`, {
    headers: { accept: 'text/html' }
  }), env);
  assert.equal(unknownApi.status, 404);
  assert.match(unknownApi.headers.get('content-type') || '', /application\/json/);

  // 7. Existing static assets -> HTTP 200 with real asset bodies
  const existingJs = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/assets/index-test.js`), env);
  assert.equal(existingJs.status, 200);
  assert.match(existingJs.headers.get('content-type') || '', /application\/javascript/);
  assert.match(await existingJs.text(), /jawed-lab-asset/);

  const existingCss = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/assets/index-test.css`), env);
  assert.equal(existingCss.status, 200);
  assert.match(existingCss.headers.get('content-type') || '', /text\/css/);
  assert.match(await existingCss.text(), /color: #111/);

  // Guard check: verify the realistic mock reproduces the pre-fix regression under single-page-application mode
  const buggyEnv = createMockEnv({
    ASSETS: createMockAssets({ notFoundHandling: 'single-page-application' })
  });
  const buggyMissingAsset = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/assets/nonexistent.js`), buggyEnv);
  assert.equal(buggyMissingAsset.status, 200);
  assert.match(await buggyMissingAsset.text(), /SPA Root/);
});

test('14. SPA fallback fetches / rather than /index.html so known routes return 200 and unknown routes return 404 HTML without Location: /', async () => {
  const requestedPaths = [];
  const env = createMockEnv({
    ASSETS: createMockAssets({ requestedPaths })
  });

  // Verify the realistic Cloudflare Assets mock itself redirects /index.html -> 301 Location: /
  const directIndexAsset = await env.ASSETS.fetch(new Request(`${TEST_ORIGIN}/index.html`, {
    headers: { accept: 'text/html' }
  }));
  assert.equal(directIndexAsset.status, 301);
  assert.equal(directIndexAsset.headers.get('location'), '/');

  requestedPaths.length = 0;

  // 1-4 & 13: Homepage and known SPA routes (without static HTML files) -> HTTP 200 HTML shell, zero Location header
  for (const route of ['/', '/studio-hq', '/studio-hq/projects', '/about', '/about/']) {
    const res = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}${route}`, {
      headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' }
    }), env);
    assert.equal(res.status, 200, `Expected HTTP 200 for ${route}`);
    assert.equal(res.headers.get('location'), null, `Expected no Location header for ${route}`);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
    assert.match(await res.text(), /SPA Root/);
  }

  // 5-6: Unknown browser route -> HTTP 404 with non-empty HTML shell and zero Location header
  const unknownRes = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/this-route-does-not-exist-8016s`, {
    headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' }
  }), env);
  assert.equal(unknownRes.status, 404);
  assert.equal(unknownRes.headers.get('location'), null);
  assert.match(unknownRes.headers.get('content-type') || '', /text\/html/);
  const unknownBody = await unknownRes.text();
  assert.ok(unknownBody.length > 0);
  assert.match(unknownBody, /SPA Root/);

  // 7: Worker fallback never fetches /index.html from ASSETS
  assert.ok(!requestedPaths.includes('/index.html'), `Worker must not fetch /index.html from ASSETS; saw ${requestedPaths.join(', ')}`);
  assert.ok(requestedPaths.includes('/'));

  // 8-12: Missing static assets, existing assets, and unknown API routes remain intact
  const missingJs = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/assets/nonexistent.js`), env);
  assert.equal(missingJs.status, 404);
  const missingCss = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/assets/nonexistent.css`), env);
  assert.equal(missingCss.status, 404);
  const missingRootJs = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/missing-script.js`, {
    headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' }
  }), env);
  assert.equal(missingRootJs.status, 404);

  const existingJs = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/assets/index-test.js`), env);
  assert.equal(existingJs.status, 200);
  const existingCss = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/assets/index-test.css`), env);
  assert.equal(existingCss.status, 200);

  const api404 = await simulateCloudflareEdge(new Request(`${TEST_ORIGIN}/api/unknown-route`, {
    headers: { accept: 'text/html' }
  }), env);
  assert.equal(api404.status, 404);
  assert.match(api404.headers.get('content-type') || '', /application\/json/);
});

