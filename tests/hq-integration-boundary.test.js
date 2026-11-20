// tests/hq-integration-boundary.test.js
// Automated Regression Tests for Studio HQ Worker Integration Boundary
// Covers all Phase 3D requirements:
// - Canonical project request reaches canonical dispatcher
// - Canonical project request never reaches legacy router
// - Session enrollment returns 404
// - Session enrollment never reaches legacy router
// - Session enrollment trailing-slash variant returns 404
// - Existing approved legacy route reaches legacy router
// - Unknown canonical subroute returns 404
// - Dispatcher exception returns controlled error without legacy fallback
// - Query strings do not change route classification
// - Security headers are retained on all response paths

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  dispatchHqIntegrationBoundary,
  isReservedForbiddenHqRoute,
  applyHqSecurityHeaders,
  createForbiddenEnrollmentResponse,
  RESERVED_FORBIDDEN_HQ_ROUTES
} from '../functions/lib/hqIntegrationBoundary.js';
import { dispatchHqCanonicalProjectsRequest } from '../functions/lib/hqCanonicalRouter.js';
import { dispatchHqApiRequest } from '../functions/lib/hqRouter.js';

function createRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const reqHeaders = new Headers(headers);
  if (body !== undefined && !reqHeaders.has('content-type')) {
    reqHeaders.set('content-type', 'application/json');
  }
  return new Request(`https://lab.jawed.co.in${path}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

// -----------------------------------------------------------------------------
// Test Suite: Studio HQ Worker Integration Boundary
// -----------------------------------------------------------------------------

test('1. Canonical project request reaches canonical dispatcher and never reaches legacy router', async () => {
  let canonicalCalled = false;
  let legacyCalled = false;

  const mockCanonicalDispatcher = async (pathname, context) => {
    canonicalCalled = true;
    return new Response(JSON.stringify({ ok: true, source: 'canonical', path: pathname }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const mockLegacyRouter = async (pathname, context) => {
    legacyCalled = true;
    return new Response(JSON.stringify({ success: true, source: 'legacy' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const pathname = '/api/hq/projects';
  const context = { request: createRequest(pathname), env: { ENVIRONMENT: 'test' } };

  const res = await dispatchHqIntegrationBoundary(pathname, context, {
    canonicalProjectsDispatcher: mockCanonicalDispatcher,
    legacyRouter: mockLegacyRouter
  });

  assert.equal(canonicalCalled, true, 'Canonical project request must reach canonical dispatcher');
  assert.equal(legacyCalled, false, 'Canonical project request must NEVER reach legacy router');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.source, 'canonical');
});

test('2. Session enrollment returns 404 and never reaches legacy router', async () => {
  let legacyCalled = false;
  let canonicalCalled = false;

  const mockCanonicalDispatcher = async () => {
    canonicalCalled = true;
    return null;
  };

  const mockLegacyRouter = async () => {
    legacyCalled = true;
    return new Response(JSON.stringify({ success: true, bootstrapped: true }), { status: 201 });
  };

  const pathname = '/api/hq/session/enroll';
  const context = { request: createRequest(pathname, { method: 'POST' }), env: { ENVIRONMENT: 'test' } };

  const res = await dispatchHqIntegrationBoundary(pathname, context, {
    canonicalProjectsDispatcher: mockCanonicalDispatcher,
    legacyRouter: mockLegacyRouter
  });

  assert.equal(res.status, 404, 'Session enrollment must be rejected with 404');
  assert.equal(legacyCalled, false, 'Session enrollment must NEVER reach legacy router');
  assert.equal(canonicalCalled, false, 'Session enrollment must not be routed to canonical projects');
  const body = await res.json();
  assert.equal(body.error, 'NOT_FOUND');
});

test('3. Session enrollment trailing-slash variant returns 404 and never reaches legacy router', async () => {
  let legacyCalled = false;

  const mockLegacyRouter = async () => {
    legacyCalled = true;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  const pathname = '/api/hq/session/enroll/';
  const context = { request: createRequest(pathname, { method: 'POST' }), env: { ENVIRONMENT: 'test' } };

  const res = await dispatchHqIntegrationBoundary(pathname, context, {
    legacyRouter: mockLegacyRouter
  });

  assert.equal(res.status, 404, 'Trailing-slash session enrollment must return 404');
  assert.equal(legacyCalled, false, 'Trailing-slash session enrollment must NEVER reach legacy router');
  const body = await res.json();
  assert.equal(body.error, 'NOT_FOUND');
});

test('4. Existing approved legacy route reaches legacy router and bypasses canonical dispatcher', async () => {
  let legacyCalled = false;
  let canonicalCalled = false;

  const mockCanonicalDispatcher = async () => {
    canonicalCalled = true;
    return null;
  };

  const mockLegacyRouter = async (pathname) => {
    legacyCalled = true;
    return new Response(JSON.stringify({ success: true, clients: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const pathname = '/api/hq/leads';
  const context = { request: createRequest(pathname), env: { ENVIRONMENT: 'test' } };

  const res = await dispatchHqIntegrationBoundary(pathname, context, {
    canonicalProjectsDispatcher: mockCanonicalDispatcher,
    legacyRouter: mockLegacyRouter
  });

  assert.equal(legacyCalled, true, 'Approved legacy route must reach legacy router');
  assert.equal(canonicalCalled, false, 'Approved legacy route must not invoke canonical projects dispatcher');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
});

test('4b. Canonical clients request reaches canonical clients dispatcher and never reaches legacy router', async () => {
  let clientsCalled = false;
  let legacyCalled = false;

  const mockClientsDispatcher = async (pathname) => {
    clientsCalled = true;
    return new Response(JSON.stringify({ ok: true, source: 'canonical-clients', path: pathname }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const mockLegacyRouter = async () => {
    legacyCalled = true;
    return new Response(JSON.stringify({ success: true, source: 'legacy' }), { status: 200 });
  };

  const pathname = '/api/hq/clients';
  const context = { request: createRequest(pathname), env: { ENVIRONMENT: 'test' } };

  const res = await dispatchHqIntegrationBoundary(pathname, context, {
    canonicalClientsDispatcher: mockClientsDispatcher,
    legacyRouter: mockLegacyRouter
  });

  assert.equal(clientsCalled, true, 'Canonical clients request must reach canonical clients dispatcher');
  assert.equal(legacyCalled, false, 'Canonical clients request must NEVER reach legacy router');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.source, 'canonical-clients');
});

test('5. Unknown canonical subroute returns 404 and does not fall through to legacy router', async () => {
  let legacyCalled = false;

  const mockLegacyRouter = async () => {
    legacyCalled = true;
    return new Response('legacy reached', { status: 200 });
  };

  const pathname = '/api/hq/projects/proj-123/unsupported-action';
  const context = { request: createRequest(pathname), env: { ENVIRONMENT: 'test' } };

  // Use actual canonical dispatcher with mock legacy router
  const res = await dispatchHqIntegrationBoundary(pathname, context, {
    legacyRouter: mockLegacyRouter
  });

  assert.equal(res.status, 404, 'Unknown canonical subroute must return 404');
  assert.equal(legacyCalled, false, 'Unknown canonical subroute must NEVER reach legacy router');
  const body = await res.json();
  assert.equal(body.error, 'NOT_FOUND');
});

test('6. Canonical dispatcher exception returns controlled 500 without legacy fallback', async () => {
  let legacyCalled = false;

  const explodingCanonicalDispatcher = async () => {
    throw new Error('Database connection suddenly aborted');
  };

  const mockLegacyRouter = async () => {
    legacyCalled = true;
    return new Response('legacy reached', { status: 200 });
  };

  const pathname = '/api/hq/projects';
  const context = { request: createRequest(pathname), env: { ENVIRONMENT: 'test' } };

  const res = await dispatchHqIntegrationBoundary(pathname, context, {
    canonicalProjectsDispatcher: explodingCanonicalDispatcher,
    legacyRouter: mockLegacyRouter
  });

  assert.equal(res.status, 500, 'Dispatcher crash must yield controlled 500 response');
  assert.equal(legacyCalled, false, 'Dispatcher crash must NEVER fall through to legacy router');
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'HQ_REQUEST_FAILED');
});

test('7. Query strings do not change route classification or boundary security', async () => {
  let canonicalCalled = false;
  let legacyCalled = false;

  const mockCanonical = async () => { canonicalCalled = true; return new Response('{}', { status: 200 }); };
  const mockLegacy = async () => { legacyCalled = true; return new Response('{}', { status: 200 }); };

  // A. Canonical route with query string
  canonicalCalled = false; legacyCalled = false;
  const pathProjectQuery = '/api/hq/projects?status=in-progress&archived=false';
  await dispatchHqIntegrationBoundary(pathProjectQuery, { request: createRequest(pathProjectQuery), env: {} }, {
    canonicalProjectsDispatcher: mockCanonical, legacyRouter: mockLegacy
  });
  assert.equal(canonicalCalled, true, 'Query string on canonical path must still reach canonical dispatcher');
  assert.equal(legacyCalled, false);

  // B. Forbidden enrollment with query string
  canonicalCalled = false; legacyCalled = false;
  const pathEnrollQuery = '/api/hq/session/enroll?redirect=/studio-hq&force=true';
  const resEnroll = await dispatchHqIntegrationBoundary(pathEnrollQuery, { request: createRequest(pathEnrollQuery, { method: 'POST' }), env: {} }, {
    canonicalProjectsDispatcher: mockCanonical, legacyRouter: mockLegacy
  });
  assert.equal(resEnroll.status, 404, 'Forbidden enrollment with query string must still return 404');
  assert.equal(legacyCalled, false, 'Forbidden enrollment with query string must NEVER reach legacy router');
  assert.equal(canonicalCalled, false);

  // C. Legacy route with query string
  canonicalCalled = false; legacyCalled = false;
  const pathLegacyQuery = '/api/hq/leads?limit=25&offset=50';
  await dispatchHqIntegrationBoundary(pathLegacyQuery, { request: createRequest(pathLegacyQuery), env: {} }, {
    canonicalProjectsDispatcher: mockCanonical, legacyRouter: mockLegacy
  });
  assert.equal(legacyCalled, true, 'Query string on legacy route must reach legacy router');
  assert.equal(canonicalCalled, false);
});

test('8. Security headers are strictly retained on all response paths', async () => {
  const env = { ENVIRONMENT: 'test' };

  // A. Forbidden enrollment response headers
  const resEnroll = await dispatchHqIntegrationBoundary('/api/hq/session/enroll', {
    request: createRequest('/api/hq/session/enroll', { method: 'POST' }),
    env
  });
  assert.equal(resEnroll.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.ok(resEnroll.headers.get('cache-control').includes('no-store'));
  assert.equal(resEnroll.headers.get('x-frame-options'), 'DENY');
  assert.equal(resEnroll.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(resEnroll.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(resEnroll.headers.get('strict-transport-security'), 'max-age=31536000');

  // B. Canonical dispatcher response headers
  const mockCanonicalDispatcher = async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
  const resCanonical = await dispatchHqIntegrationBoundary('/api/hq/projects', {
    request: createRequest('/api/hq/projects'),
    env
  }, { canonicalProjectsDispatcher: mockCanonicalDispatcher });
  assert.equal(resCanonical.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.ok(resCanonical.headers.get('cache-control').includes('no-store'));
  assert.equal(resCanonical.headers.get('x-frame-options'), 'DENY');
  assert.equal(resCanonical.headers.get('x-content-type-options'), 'nosniff');

  // C. Controlled error response headers
  const crashingDispatcher = async () => { throw new Error('Crash'); };
  const resError = await dispatchHqIntegrationBoundary('/api/hq/projects', {
    request: createRequest('/api/hq/projects'),
    env
  }, { canonicalProjectsDispatcher: crashingDispatcher });
  assert.equal(resError.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.ok(resError.headers.get('cache-control').includes('no-store'));
  assert.equal(resError.headers.get('x-frame-options'), 'DENY');
  assert.equal(resError.headers.get('x-content-type-options'), 'nosniff');
});

test('9. Compatibility with Worker addSecurityHeaders wrapper function', async () => {
  // Test that when Worker passes its custom addSecurityHeaders function, it is respected
  let workerSecurityWrapperCalled = false;
  const customSecurityWrapper = (response, pathname) => {
    workerSecurityWrapperCalled = true;
    const headers = new Headers(response.headers);
    headers.set('x-custom-worker-protection', 'active');
    return new Response(response.body, { status: response.status, headers });
  };

  const res = await dispatchHqIntegrationBoundary('/api/hq/session/enroll', {
    request: createRequest('/api/hq/session/enroll', { method: 'POST' }),
    env: {}
  }, {
    addSecurityHeaders: customSecurityWrapper
  });

  assert.equal(workerSecurityWrapperCalled, true, 'Worker custom addSecurityHeaders must be invoked');
  assert.equal(res.headers.get('x-custom-worker-protection'), 'active');
  assert.equal(res.status, 404);
});

test('10. End-to-end integration: real canonical router and real legacy router', async () => {
  const env = { ENVIRONMENT: 'test' };

  // Real enrollment check against real hqRouter (demonstrates complete gatekeeper interception)
  const resRealEnroll = await dispatchHqIntegrationBoundary('/api/hq/session/enroll', {
    request: createRequest('/api/hq/session/enroll', { method: 'POST' }),
    env
  });
  assert.equal(resRealEnroll.status, 404);
  assert.equal((await resRealEnroll.json()).error, 'NOT_FOUND');

  // Real canonical project route (options)
  const resRealOptions = await dispatchHqIntegrationBoundary('/api/hq/projects', {
    request: createRequest('/api/hq/projects', { method: 'OPTIONS' }),
    env
  });
  assert.equal(resRealOptions.status, 204);
  assert.equal(resRealOptions.headers.get('allow'), 'GET, POST, OPTIONS');
});
