// functions/lib/hqIntegrationBoundary.js
// Studio HQ Worker Integration Boundary Gatekeeper
// Enforces canonical-first dispatch, blocks forbidden enrollment paths,
// prevents legacy fallthrough, and preserves approved legacy endpoints.

import {
  isCanonicalProjectsRoute,
  dispatchHqCanonicalProjectsRequest,
  isCanonicalClientsRoute,
  dispatchHqCanonicalClientsRequest,
  isCanonicalLeadsRoute,
  dispatchHqCanonicalLeadsRequest,
  isCanonicalHqRoute,
  dispatchHqCanonicalRequest
} from './hqCanonicalRouter.js';
import { dispatchHqApiRequest } from './hqRouter.js';
import { hqJson } from './hqCanonicalApi.js';

export const RESERVED_FORBIDDEN_HQ_ROUTES = new Set([
  '/api/hq/session/enroll'
]);

const BOUNDARY_SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Strict-Transport-Security': 'max-age=31536000'
};

/**
 * Checks if a pathname matches a reserved or forbidden Studio HQ route that must
 * never be handled by the legacy router (e.g. /api/hq/session/enroll).
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isReservedForbiddenHqRoute(pathname) {
  if (typeof pathname !== 'string') return false;
  const clean = pathname.split('?')[0];
  const normalized = clean.length > 1 && clean.endsWith('/') ? clean.slice(0, -1) : clean;
  return RESERVED_FORBIDDEN_HQ_ROUTES.has(normalized);
}

/**
 * Applies security and cache headers consistent with Cloudflare Worker security policy.
 *
 * @param {Response} response
 * @param {string} pathname
 * @returns {Response}
 */
export function applyHqSecurityHeaders(response, pathname = '') {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(BOUNDARY_SECURITY_HEADERS)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
  }
  if (pathname.startsWith('/api/hq/')) {
    newHeaders.set('X-Robots-Tag', 'noindex, nofollow');
    if (!newHeaders.has('Cache-Control')) {
      newHeaders.set('Cache-Control', 'no-store, private, max-age=0');
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

/**
 * Generates a standard controlled 404 response for forbidden enrollment routes.
 *
 * @param {string} pathname
 * @returns {Response}
 */
export function createForbiddenEnrollmentResponse(pathname = '') {
  const baseRes = hqJson(
    { ok: false, error: 'NOT_FOUND', code: 'NOT_FOUND' },
    404
  );
  return applyHqSecurityHeaders(baseRes, pathname);
}

/**
 * Main Worker Integration Boundary Dispatcher.
 * Sits ahead of legacy hqRouter.js, orchestrating:
 * 1. Immediate rejection of reserved/forbidden enrollment routes (SEC-BLOCKER-001).
 * 2. Exclusive delegation of canonical project routes to canonical dispatcher (no fallthrough).
 * 3. Controlled error handling preventing exceptions from triggering legacy fallback.
 * 4. Safe pass-through of remaining approved legacy routes.
 * 5. Security header wrapping across all response paths.
 *
 * @param {string} pathname
 * @param {{ request: Request, env: any, ctx?: any }} context
 * @param {{
 *   canonicalProjectsDispatcher?: Function,
 *   canonicalClientsDispatcher?: Function,
 *   canonicalDispatcher?: Function,
 *   legacyRouter?: Function,
 *   isCanonicalRoute?: Function,
 *   addSecurityHeaders?: Function
 * }} [options]
 * @returns {Promise<Response>}
 */
export async function dispatchHqIntegrationBoundary(pathname, context, options = {}) {
  const wrapHeaders = options.addSecurityHeaders || applyHqSecurityHeaders;
  const isCanonical = options.isCanonicalRoute || isCanonicalHqRoute;

  let canonicalDispatcher = options.canonicalDispatcher;
  if (!canonicalDispatcher) {
    if (isCanonicalClientsRoute(pathname)) {
      canonicalDispatcher = options.canonicalClientsDispatcher || dispatchHqCanonicalClientsRequest;
    } else if (isCanonicalLeadsRoute(pathname)) {
      canonicalDispatcher = options.canonicalLeadsDispatcher || dispatchHqCanonicalLeadsRequest;
    } else {
      canonicalDispatcher = options.canonicalProjectsDispatcher || dispatchHqCanonicalProjectsRequest;
    }
  }

  const legacyRouter = options.legacyRouter || dispatchHqApiRequest;

  // 1. Gatekeeper Check: Explicitly intercept and reject forbidden enrollment routes
  if (isReservedForbiddenHqRoute(pathname)) {
    return wrapHeaders(createForbiddenEnrollmentResponse(pathname), pathname);
  }

  // 2. Canonical Route Interception: Canonical routes must NEVER fall through to legacy router
  if (isCanonical(pathname)) {
    try {
      const canonicalRes = await canonicalDispatcher(pathname, context);
      if (canonicalRes) {
        return wrapHeaders(canonicalRes, pathname);
      }
      // If canonical dispatcher returned null despite route matching, return controlled 404
      const notFoundRes = hqJson({ ok: false, error: 'NOT_FOUND', code: 'NOT_FOUND' }, 404);
      return wrapHeaders(notFoundRes, pathname);
    } catch (error) {
      // Catch unexpected dispatcher errors; do NOT fall through to legacy handlers
      console.error('[Studio HQ Boundary] Canonical dispatcher error:', error);
      const errorRes = hqJson({ ok: false, error: 'HQ_REQUEST_FAILED' }, 500);
      return wrapHeaders(errorRes, pathname);
    }
  }

  // 3. Approved Legacy Routes Pass-through
  try {
    const legacyRes = await legacyRouter(pathname, context);
    return wrapHeaders(legacyRes, pathname);
  } catch (error) {
    console.error('[Studio HQ Boundary] Legacy router error:', error);
    const errorRes = hqJson({ error: 'HQ endpoint failed', code: 'INTERNAL_ERROR' }, 500);
    return wrapHeaders(errorRes, pathname);
  }
}
