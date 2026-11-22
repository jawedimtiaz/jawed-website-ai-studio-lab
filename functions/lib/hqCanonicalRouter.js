// functions/lib/hqCanonicalRouter.js
// Isolated Route Dispatcher for Canonical Studio HQ API (Projects & Clients)
// Strictly isolated from legacy GAIS hqRouter.js and shared GAIS helpers.

import { handleHqProjects } from '../api/hq/canonicalProjects.js';
import { handleHqClients } from '../api/hq/canonicalClients.js';
import { handleHqLeads } from '../api/hq/canonicalLeads.js';
import { hqJson, isHqSameOrigin, HQ_JSON_HEADERS } from './hqCanonicalApi.js';
import { checkHqRateLimit } from './hqCanonicalRateLimit.js';

export const CANONICAL_PROJECTS_BASE = '/api/hq/projects';
export const CANONICAL_CLIENTS_BASE = '/api/hq/clients';
export const CANONICAL_LEADS_BASE = '/api/hq/leads';

/**
 * Checks whether the given pathname belongs to the canonical Studio HQ Projects API route family.
 * Strictly checks prefix boundary to prevent collision with other routes (e.g. /api/hq/projects-other).
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isCanonicalProjectsRoute(pathname) {
  if (typeof pathname !== 'string') return false;
  const clean = pathname.split('?')[0];
  return clean === CANONICAL_PROJECTS_BASE ||
         clean === `${CANONICAL_PROJECTS_BASE}/` ||
         clean.startsWith(`${CANONICAL_PROJECTS_BASE}/`);
}

/**
 * Parses and validates a canonical project route.
 * Returns route match details or structural error.
 *
 * @param {string} pathname
 * @returns {{
 *   matched: boolean,
 *   route?: string,
 *   segments?: string[],
 *   allowedMethods?: string[],
 *   allowHeader?: string,
 *   error?: string,
 *   status?: number
 * }}
 */
export function matchCanonicalProjectRoute(pathname) {
  if (!isCanonicalProjectsRoute(pathname)) {
    return { matched: false };
  }

  // Strip query string if present in pathname
  const cleanPath = pathname.split('?')[0];
  // Strip trailing slash unless it's root
  const normalized = cleanPath.length > 1 && cleanPath.endsWith('/')
    ? cleanPath.slice(0, -1)
    : cleanPath;

  let segments = [];
  if (normalized.length > CANONICAL_PROJECTS_BASE.length) {
    const remainder = normalized.slice(CANONICAL_PROJECTS_BASE.length);
    segments = remainder.slice(1).split('/');
  }

  // 1. /api/hq/projects (Collection) -> segments = []
  if (segments.length === 0) {
    return {
      matched: true,
      route: 'projects.collection',
      segments: [],
      allowedMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeader: 'GET, POST, OPTIONS'
    };
  }

  const [projectId, action, childId] = segments;

  // Validate projectId format: non-empty and length <= 80
  if (!projectId || projectId.length > 80) {
    return {
      matched: true,
      error: 'PROJECT_NOT_FOUND',
      status: 404
    };
  }

  // 2. /api/hq/projects/:projectId (Detail) -> segments = [projectId]
  if (segments.length === 1) {
    return {
      matched: true,
      route: 'projects.detail',
      segments: [projectId],
      allowedMethods: ['GET', 'PATCH', 'OPTIONS'],
      allowHeader: 'GET, PATCH, OPTIONS'
    };
  }

  // 3. /api/hq/projects/:projectId/archive -> segments = [projectId, 'archive']
  if (segments.length === 2 && action === 'archive') {
    return {
      matched: true,
      route: 'projects.archive',
      segments: [projectId, 'archive'],
      allowedMethods: ['POST', 'OPTIONS'],
      allowHeader: 'POST, OPTIONS'
    };
  }

  // 4. /api/hq/projects/:projectId/restore -> segments = [projectId, 'restore']
  if (segments.length === 2 && action === 'restore') {
    return {
      matched: true,
      route: 'projects.restore',
      segments: [projectId, 'restore'],
      allowedMethods: ['POST', 'OPTIONS'],
      allowHeader: 'POST, OPTIONS'
    };
  }

  // 5. /api/hq/projects/:projectId/tasks (Tasks Collection) -> segments = [projectId, 'tasks']
  if (segments.length === 2 && action === 'tasks') {
    return {
      matched: true,
      route: 'projects.tasks.collection',
      segments: [projectId, 'tasks'],
      allowedMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeader: 'GET, POST, OPTIONS'
    };
  }

  // 6. /api/hq/projects/:projectId/tasks/:taskId (Task Detail) -> segments = [projectId, 'tasks', childId]
  if (segments.length === 3 && action === 'tasks') {
    if (!childId || childId.length > 80) {
      return { matched: true, error: 'NOT_FOUND', status: 404 };
    }
    return {
      matched: true,
      route: 'projects.tasks.detail',
      segments: [projectId, 'tasks', childId],
      allowedMethods: ['PATCH', 'OPTIONS'],
      allowHeader: 'PATCH, OPTIONS'
    };
  }

  // 7. /api/hq/projects/:projectId/milestones (Milestones Collection) -> segments = [projectId, 'milestones']
  if (segments.length === 2 && action === 'milestones') {
    return {
      matched: true,
      route: 'projects.milestones.collection',
      segments: [projectId, 'milestones'],
      allowedMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeader: 'GET, POST, OPTIONS'
    };
  }

  // 8. /api/hq/projects/:projectId/milestones/:milestoneId (Milestone Detail) -> segments = [projectId, 'milestones', childId]
  if (segments.length === 3 && action === 'milestones') {
    if (!childId || childId.length > 80) {
      return { matched: true, error: 'NOT_FOUND', status: 404 };
    }
    return {
      matched: true,
      route: 'projects.milestones.detail',
      segments: [projectId, 'milestones', childId],
      allowedMethods: ['PATCH', 'OPTIONS'],
      allowHeader: 'PATCH, OPTIONS'
    };
  }

  // Any other segments under /api/hq/projects is an unknown canonical project route
  return {
    matched: true,
    error: 'NOT_FOUND',
    status: 404
  };
}

/**
 * Dispatches an incoming request to the canonical Projects API.
 * Returns null if the request does not match a canonical project route.
 * When matched, handles the request completely and guarantees no fallthrough.
 *
 * @param {string} pathname
 * @param {{ request: Request, env: any, ctx?: any }} context
 * @returns {Promise<Response | null>}
 */
export async function dispatchHqCanonicalProjectsRequest(pathname, context) {
  if (!isCanonicalProjectsRoute(pathname)) {
    return null;
  }

  const { request, env } = context || {};
  const match = matchCanonicalProjectRoute(pathname);

  // If route matched but was structurally invalid (e.g. unknown action, malformed id)
  if (match.error) {
    return hqJson({ ok: false, error: match.error }, match.status || 404);
  }

  const method = (request?.method || 'GET').toUpperCase();

  // OPTIONS Preflight Handling according to Canonical Security Policy
  if (method === 'OPTIONS') {
    // 1. Enforce same-origin check: external origins cannot preflight private HQ API
    if (!isHqSameOrigin(request)) {
      return hqJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
    }

    // 2. Enforce general rate limiter on OPTIONS to prevent unauthenticated flooding
    const rateLimit = await checkHqRateLimit(request, env, { type: 'general' });
    if (!rateLimit.ok) return rateLimit.response;

    // 3. Return 204 No Content with strict private headers and Allow header
    return new Response(null, {
      status: 204,
      headers: {
        ...HQ_JSON_HEADERS,
        allow: match.allowHeader
      }
    });
  }

  // Method Validation: Reject unsupported methods with 405 and Allow header
  if (!match.allowedMethods.includes(method)) {
    return hqJson(
      { ok: false, error: 'METHOD_NOT_ALLOWED' },
      405,
      { allow: match.allowHeader }
    );
  }

  // Dispatch to Canonical Projects Handler
  return handleHqProjects({ request, env, segments: match.segments });
}

/**
 * Checks whether the given pathname belongs to the canonical Studio HQ Clients API route family.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isCanonicalClientsRoute(pathname) {
  if (typeof pathname !== 'string') return false;
  const clean = pathname.split('?')[0];
  return clean === CANONICAL_CLIENTS_BASE ||
         clean === `${CANONICAL_CLIENTS_BASE}/` ||
         clean.startsWith(`${CANONICAL_CLIENTS_BASE}/`);
}

/**
 * Parses and validates a canonical client route.
 * Returns route match details or structural error.
 *
 * @param {string} pathname
 * @returns {{
 *   matched: boolean,
 *   route?: string,
 *   segments?: string[],
 *   allowedMethods?: string[],
 *   allowHeader?: string,
 *   error?: string,
 *   status?: number
 * }}
 */
export function matchCanonicalClientRoute(pathname) {
  if (!isCanonicalClientsRoute(pathname)) {
    return { matched: false };
  }

  // Strip query string if present in pathname
  const cleanPath = pathname.split('?')[0];
  // Strip trailing slash unless it's root
  const normalized = cleanPath.length > 1 && cleanPath.endsWith('/')
    ? cleanPath.slice(0, -1)
    : cleanPath;

  let segments = [];
  if (normalized.length > CANONICAL_CLIENTS_BASE.length) {
    const remainder = normalized.slice(CANONICAL_CLIENTS_BASE.length);
    segments = remainder.slice(1).split('/');
  }

  // 1. /api/hq/clients (Collection) -> segments = []
  if (segments.length === 0) {
    return {
      matched: true,
      route: 'clients.collection',
      segments: [],
      allowedMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeader: 'GET, POST, OPTIONS'
    };
  }

  const [clientId, action, childId] = segments;

  // Validate clientId format: non-empty and length <= 80
  if (!clientId || clientId.length > 80) {
    return {
      matched: true,
      error: 'CLIENT_NOT_FOUND',
      status: 404
    };
  }

  // 2. /api/hq/clients/:clientId (Detail) -> segments = [clientId]
  if (segments.length === 1) {
    return {
      matched: true,
      route: 'clients.detail',
      segments: [clientId],
      allowedMethods: ['GET', 'PATCH', 'OPTIONS'],
      allowHeader: 'GET, PATCH, OPTIONS'
    };
  }

  // 3. /api/hq/clients/:clientId/archive -> segments = [clientId, 'archive']
  if (segments.length === 2 && action === 'archive') {
    return {
      matched: true,
      route: 'clients.archive',
      segments: [clientId, 'archive'],
      allowedMethods: ['POST', 'OPTIONS'],
      allowHeader: 'POST, OPTIONS'
    };
  }

  // 4. /api/hq/clients/:clientId/restore -> segments = [clientId, 'restore']
  if (segments.length === 2 && action === 'restore') {
    return {
      matched: true,
      route: 'clients.restore',
      segments: [clientId, 'restore'],
      allowedMethods: ['POST', 'OPTIONS'],
      allowHeader: 'POST, OPTIONS'
    };
  }

  // 5. /api/hq/clients/:clientId/contacts (Contacts Collection) -> segments = [clientId, 'contacts']
  if (segments.length === 2 && action === 'contacts') {
    return {
      matched: true,
      route: 'clients.contacts.collection',
      segments: [clientId, 'contacts'],
      allowedMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeader: 'GET, POST, OPTIONS'
    };
  }

  // 6. /api/hq/clients/:clientId/contacts/:contactId (Contact Detail) -> segments = [clientId, 'contacts', childId]
  if (segments.length === 3 && action === 'contacts') {
    if (!childId || childId.length > 80) {
      return { matched: true, error: 'NOT_FOUND', status: 404 };
    }
    return {
      matched: true,
      route: 'clients.contacts.detail',
      segments: [clientId, 'contacts', childId],
      allowedMethods: ['PATCH', 'OPTIONS'],
      allowHeader: 'PATCH, OPTIONS'
    };
  }

  // Any other segments under /api/hq/clients is an unknown canonical client route
  return {
    matched: true,
    error: 'NOT_FOUND',
    status: 404
  };
}

/**
 * Dispatches an incoming request to the canonical Clients API.
 * Returns null if the request does not match a canonical client route.
 * When matched, handles the request completely and guarantees no fallthrough.
 *
 * @param {string} pathname
 * @param {{ request: Request, env: any, ctx?: any }} context
 * @returns {Promise<Response | null>}
 */
export async function dispatchHqCanonicalClientsRequest(pathname, context) {
  if (!isCanonicalClientsRoute(pathname)) {
    return null;
  }

  const { request, env } = context || {};
  const match = matchCanonicalClientRoute(pathname);

  // If route matched but was structurally invalid (e.g. unknown action, malformed id)
  if (match.error) {
    return hqJson({ ok: false, error: match.error }, match.status || 404);
  }

  const method = (request?.method || 'GET').toUpperCase();

  // OPTIONS Preflight Handling according to Canonical Security Policy
  if (method === 'OPTIONS') {
    if (!isHqSameOrigin(request)) {
      return hqJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
    }

    const rateLimit = await checkHqRateLimit(request, env, { type: 'general' });
    if (!rateLimit.ok) return rateLimit.response;

    return new Response(null, {
      status: 204,
      headers: {
        ...HQ_JSON_HEADERS,
        allow: match.allowHeader
      }
    });
  }

  // Method Validation: Reject unsupported methods with 405 and Allow header
  if (!match.allowedMethods.includes(method)) {
    return hqJson(
      { ok: false, error: 'METHOD_NOT_ALLOWED' },
      405,
      { allow: match.allowHeader }
    );
  }

  // Dispatch to Canonical Clients Handler
  return handleHqClients({ request, env, segments: match.segments });
}

export function isCanonicalLeadsRoute(pathname) {
  if (typeof pathname !== 'string') return false;
  const clean = pathname.split('?')[0];
  return clean === CANONICAL_LEADS_BASE ||
         clean === `${CANONICAL_LEADS_BASE}/` ||
         clean.startsWith(`${CANONICAL_LEADS_BASE}/`);
}

export function matchCanonicalLeadRoute(pathname) {
  if (!isCanonicalLeadsRoute(pathname)) return { matched: false };
  const clean = pathname.split('?')[0];
  const normalized = clean.length > 1 && clean.endsWith('/') ? clean.slice(0, -1) : clean;
  const segments = normalized.length > CANONICAL_LEADS_BASE.length
    ? normalized.slice(CANONICAL_LEADS_BASE.length + 1).split('/')
    : [];

  if (!segments.length) {
    return {
      matched: true,
      route: 'leads.collection',
      segments: [],
      allowedMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeader: 'GET, POST, OPTIONS'
    };
  }

  if (segments.some(s => !s)) {
    return { matched: true, error: 'NOT_FOUND', status: 404 };
  }

  const [id, action] = segments;
  if (!id || id.length > 80) {
    return { matched: true, error: 'LEAD_NOT_FOUND', status: 404 };
  }

  if (segments.length === 1) {
    return {
      matched: true,
      route: 'leads.detail',
      segments: [id],
      allowedMethods: ['GET', 'PATCH', 'OPTIONS'],
      allowHeader: 'GET, PATCH, OPTIONS'
    };
  }

  if (segments.length === 2 && ['archive', 'restore', 'convert'].includes(action)) {
    return {
      matched: true,
      route: `leads.${action}`,
      segments: [id, action],
      allowedMethods: ['POST', 'OPTIONS'],
      allowHeader: 'POST, OPTIONS'
    };
  }

  return { matched: true, error: 'NOT_FOUND', status: 404 };
}

export async function dispatchHqCanonicalLeadsRequest(pathname, context) {
  if (!isCanonicalLeadsRoute(pathname)) return null;
  const { request, env } = context || {};
  const match = matchCanonicalLeadRoute(pathname);
  if (match.error) {
    return hqJson({ ok: false, error: match.error }, match.status || 404);
  }
  const method = (request?.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    if (!isHqSameOrigin(request)) {
      return hqJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
    }
    const limit = await checkHqRateLimit(request, env, { type: 'general' });
    if (!limit.ok) return limit.response;
    return new Response(null, {
      status: 204,
      headers: { ...HQ_JSON_HEADERS, allow: match.allowHeader }
    });
  }
  if (!match.allowedMethods.includes(method)) {
    return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { allow: match.allowHeader });
  }
  return handleHqLeads({ request, env, segments: match.segments });
}

/**
 * Checks whether pathname belongs to any canonical Studio HQ route (projects, clients or leads).
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isCanonicalHqRoute(pathname) {
  return isCanonicalProjectsRoute(pathname) || isCanonicalClientsRoute(pathname) || isCanonicalLeadsRoute(pathname);
}

/**
 * Dispatches request to the appropriate canonical route handler.
 *
 * @param {string} pathname
 * @param {{ request: Request, env: any, ctx?: any }} context
 * @returns {Promise<Response | null>}
 */
export async function dispatchHqCanonicalRequest(pathname, context) {
  if (isCanonicalProjectsRoute(pathname)) {
    return dispatchHqCanonicalProjectsRequest(pathname, context);
  }
  if (isCanonicalClientsRoute(pathname)) {
    return dispatchHqCanonicalClientsRequest(pathname, context);
  }
  if (isCanonicalLeadsRoute(pathname)) {
    return dispatchHqCanonicalLeadsRequest(pathname, context);
  }
  return null;
}
