// functions/lib/hqApi.js
// Studio HQ Authorization, Canonical D1 Database Helpers, Validation & Audit Trail

import { verifyFirebaseToken } from './hqAuth.js';
import { enforceHqRateLimit } from './hqRateLimit.js';

export const MAX_JSON_BODY_BYTES = 65536; // 64 KB request payload limit

/**
 * Standard JSON response helper.
 */
export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
      ...extraHeaders
    }
  });
}

/**
 * Standard JSON error response helper.
 */
export function errorResponse(status, code, message, extra = {}) {
  return jsonResponse(
    {
      success: false,
      error: {
        code,
        message,
        status,
        timestamp: new Date().toISOString(),
        ...extra
      }
    },
    status
  );
}

/**
 * Resolves the set of allowed web origins for Studio HQ APIs based on the active environment.
 * Enforces strict environment separation:
 * - Production ('lab' / 'production'): https://lab.jawed.co.in, https://jawed.co.in
 * - Preview ('preview'): https://preview.lab.jawed.co.in, https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev
 * - Development/Test ('dev-local' / 'test'): localhost and 127.0.0.1 origins
 * - Never allows arbitrary origins; never allows wildcard '*'.
 */
export function getHqAllowedOrigins(env, requestUrl) {
  const allowed = new Set();

  if (requestUrl) {
    try {
      const parsed = new URL(requestUrl);
      if (parsed.origin && parsed.origin !== 'null') {
        allowed.add(parsed.origin.toLowerCase());
      }
    } catch {}
  }

  if (env?.CANONICAL_ORIGIN) {
    try {
      const canonical = new URL(env.CANONICAL_ORIGIN).origin.toLowerCase();
      allowed.add(canonical);
    } catch {}
  }

  const environment = (env?.ENVIRONMENT || '').toLowerCase();
  if (environment === 'lab' || environment === 'production') {
    allowed.add('https://lab.jawed.co.in');
    allowed.add('https://jawed.co.in');
  } else if (environment === 'preview') {
    allowed.add('https://preview.lab.jawed.co.in');
    allowed.add('https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev');
  } else if (environment === 'dev-local' || environment === 'test') {
    allowed.add('http://localhost:5173');
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:5173');
    allowed.add('http://127.0.0.1:3000');
  }

  if (env?.HQ_ALLOWED_ORIGINS) {
    const custom = String(env.HQ_ALLOWED_ORIGINS)
      .split(',')
      .map((o) => o.trim().toLowerCase())
      .filter(Boolean);
    for (const c of custom) {
      try {
        allowed.add(new URL(c).origin.toLowerCase());
      } catch {
        allowed.add(c);
      }
    }
  }

  return allowed;
}

/**
 * Validates whether an incoming HTTP request origin is permitted to access private Studio HQ APIs.
 */
export function isHqAllowedOrigin(request, env) {
  if (!request) return false;
  const origin = request.headers?.get('origin');

  // If no Origin header (same-origin browser navigation, cURL, or server-to-server):
  if (!origin) {
    const fetchSite = request.headers?.get('sec-fetch-site');
    if (fetchSite === 'cross-site') return false;
    return true;
  }

  const normalized = origin.trim().toLowerCase();
  // Reject wildcard or 'null' string origins
  if (normalized === '*' || normalized === 'null') return false;

  const allowed = getHqAllowedOrigins(env, request.url);
  if (allowed.has(normalized)) return true;

  try {
    const reqOrigin = new URL(request.url).origin.toLowerCase();
    if (normalized === reqOrigin) return true;
  } catch {}

  const envName = (env?.ENVIRONMENT || '').toLowerCase();
  if (envName === 'dev-local' || envName === 'test') {
    try {
      const parsed = new URL(normalized);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return true;
      }
    } catch {}
  }

  return false;
}

/**
 * Standard CORS preflight response for Studio HQ endpoints.
 * Never emits wildcard '*'. Returns 403 for disallowed origins.
 */
export function hqOptionsResponse(arg1, arg2) {
  let request = null;
  let env = null;
  let methods = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

  if (typeof arg1 === 'string') {
    methods = arg1;
  } else if (arg1 && typeof arg1 === 'object') {
    if (arg1.request) {
      request = arg1.request;
      env = arg1.env;
    } else if (typeof arg1.headers?.get === 'function') {
      request = arg1;
    }
    if (typeof arg2 === 'string') {
      methods = arg2;
    }
  }

  if (request) {
    const origin = request.headers.get('origin');
    if (origin) {
      if (!isHqAllowedOrigin(request, env)) {
        return errorResponse(403, 'ORIGIN_NOT_ALLOWED', 'Origin not allowed for Studio HQ API');
      }
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': methods,
          'access-control-allow-headers': 'content-type, authorization, x-idempotency-key',
          'access-control-max-age': '86400',
          'vary': 'Origin',
          'allow': methods,
          'cache-control': 'no-store, private, max-age=0'
        }
      });
    }
  }

  // Same-origin or non-browser preflight with no Origin header
  return new Response(null, {
    status: 204,
    headers: {
      'allow': methods,
      'cache-control': 'no-store, private, max-age=0'
    }
  });
}

/**
 * Applies environment-aware CORS headers to private HQ API responses.
 * Never emits wildcard Access-Control-Allow-Origin: *.
 * Emits Access-Control-Allow-Origin ONLY when origin is explicitly allowed.
 */
export function applyHqCorsHeaders(response, request, env) {
  if (!response || !request) return response;
  const origin = request.headers?.get('origin');
  if (!origin) return response;

  // If origin is not allowed, do NOT attach CORS headers
  if (!isHqAllowedOrigin(request, env)) {
    return response;
  }

  const newHeaders = new Headers(response.headers);
  newHeaders.set('access-control-allow-origin', origin);
  newHeaders.set('vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

/**
 * Extracts Bearer token from Authorization header.
 */
export function extractBearerToken(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

/**
 * Reads and parses a JSON request body with strict byte-size enforcement.
 */
export async function readJsonBody(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return {
        ok: false,
        response: errorResponse(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} byte limit`)
      };
    }
  }

  let rawText = '';
  try {
    rawText = await request.text();
  } catch {
    return {
      ok: false,
      response: errorResponse(400, 'INVALID_BODY', 'Unable to read request body')
    };
  }

  if (new TextEncoder().encode(rawText).byteLength > maxBytes) {
    return {
      ok: false,
      response: errorResponse(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} byte limit`)
    };
  }

  if (!rawText.trim()) {
    return { ok: true, data: {} };
  }

  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        response: errorResponse(400, 'INVALID_JSON', 'Request body must be a JSON object')
      };
    }
    return { ok: true, data: parsed };
  } catch {
    return {
      ok: false,
      response: errorResponse(400, 'INVALID_JSON', 'Malformed JSON payload')
    };
  }
}

export function cleanString(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function isValidId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

export function parsePagination(url, defaultLimit = 50, maxLimit = 200) {
  const pageRaw = Number(url.searchParams.get('page') || 1);
  const limitRaw = Number(url.searchParams.get('limit') || defaultLimit);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(Math.floor(limitRaw), maxLimit) : defaultLimit;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Writes an immutable audit record to canonical `audit_logs` table in D1.
 */
export async function auditLog(
  db,
  {
    actorUid = 'system',
    actorEmail = '',
    action,
    entityType = 'system',
    entityId = '',
    requestId = '',
    ipAddress = 'unknown',
    before = null,
    after = null,
    metadata = null
  }
) {
  if (!db || typeof db.prepare !== 'function') return;
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_uid, actor_email, action, entity_type, entity_id,
          request_id, ip_hash, before_json, after_json, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        actorUid ? String(actorUid) : null,
        String(actorEmail || ''),
        String(action || 'UNKNOWN'),
        String(entityType || 'system'),
        String(entityId || ''),
        String(requestId || ''),
        String(ipAddress || 'unknown'),
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        metadata ? JSON.stringify(metadata) : null,
        nowIso
      )
      .run();
  } catch (err) {
    console.error('[HQ Audit Log Error]', err);
  }
}

/**
 * Atomically generates sequential human-friendly numbers (e.g. QUO-2627-0001, INV-2627-0001)
 * aligned with canonical financial_sequences schema (0002_financial_management.sql).
 */
export async function nextSequenceNumber(db, docType = 'invoice', prefix = 'INV') {
  const now = new Date();
  const year = now.getFullYear();
  const nextYearShort = String((year + 1) % 100).padStart(2, '0');
  const fy = `${year}-${nextYearShort}`;
  const nowIso = now.toISOString();
  const canonicalType = docType === 'quotation' ? 'quotation' : 'invoice';

  let updated = await db
    .prepare(
      `UPDATE financial_sequences
       SET next_number = next_number + 1, updated_at = ?
       WHERE document_type = ? AND financial_year = ?
       RETURNING next_number`
    )
    .bind(nowIso, canonicalType, fy)
    .first();

  if (updated && typeof updated.next_number === 'number') {
    const allocatedNum = updated.next_number - 1;
    return `${prefix}-${fy.slice(2, 4)}${fy.slice(5, 7)}-${String(allocatedNum).padStart(4, '0')}`;
  }

  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO financial_sequences (id, document_type, prefix, financial_year, next_number, updated_at)
         VALUES (?, ?, ?, ?, 2, ?)`
      )
      .bind(id, canonicalType, prefix, fy, nowIso)
      .run();
    return `${prefix}-${fy.slice(2, 4)}${fy.slice(5, 7)}-0001`;
  } catch {
    updated = await db
      .prepare(
        `UPDATE financial_sequences
         SET next_number = next_number + 1, updated_at = ?
         WHERE document_type = ? AND financial_year = ?
         RETURNING next_number`
      )
      .bind(nowIso, canonicalType, fy)
      .first();

    if (updated && typeof updated.next_number === 'number') {
      const allocatedNum = updated.next_number - 1;
      return `${prefix}-${fy.slice(2, 4)}${fy.slice(5, 7)}-${String(allocatedNum).padStart(4, '0')}`;
    }

    const yr = String(year).slice(-2);
    return `${prefix}-${yr}-${Date.now().toString().slice(-6)}`;
  }
}

/**
 * Primary HQ Owner Verification & Authorization Pipeline.
 * Enforces cryptographic Firebase RS256 verification, allowlist validation,
 * canonical D1 `hq_users` enrollment verification (FAIL-CLOSED — no implicit auto-enroll),
 * strict `status = 'active'` enforcement, and fail-closed rate limiting.
 */
export async function verifyAndAuthorizeOwner(request, env, options = {}) {
  const ipAddress =
    request.headers?.get('cf-connecting-ip') ||
    request.headers?.get('x-forwarded-for') ||
    'unknown';
  const requestId = request.headers?.get('cf-ray') || crypto.randomUUID();
  const rateKind = options.rateLimitKind || (request.method === 'GET' ? 'general' : 'write');

  // 0. Pre-auth rate limit for session endpoints
  if (rateKind === 'session') {
    const preLimit = await enforceHqRateLimit(request, env, 'session');
    if (!preLimit.allowed) {
      return { authorized: false, response: preLimit.response };
    }
  }

  // 0a. Origin validation: reject cross-origin requests from unauthorized origins
  const origin = request.headers?.get('origin');
  if (origin && !isHqAllowedOrigin(request, env)) {
    return {
      authorized: false,
      response: errorResponse(403, 'ORIGIN_NOT_ALLOWED', 'Origin not allowed for Studio HQ API')
    };
  }

  // 1. Extract Bearer token
  const idToken = extractBearerToken(request);
  if (!idToken) {
    return {
      authorized: false,
      response: errorResponse(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header with Bearer token')
    };
  }

  // 2. Cryptographically verify Firebase RS256 ID Token & email allowlist
  const authResult = await verifyFirebaseToken(idToken, env, options.authOptions || {});
  if (!authResult.valid) {
    const status = authResult.code === 'UNAUTHORIZED_EMAIL' ? 403 : 401;
    return {
      authorized: false,
      response: errorResponse(status, authResult.code, authResult.error)
    };
  }

  const firebaseUser = authResult.user;

  // 3. Require D1 Database Binding
  if (!env || !env.HQ_DB || typeof env.HQ_DB.prepare !== 'function') {
    console.error('[HQ Auth Error] HQ_DB binding missing or unavailable');
    return {
      authorized: false,
      response: errorResponse(503, 'DATABASE_UNAVAILABLE', 'HQ database service is unavailable')
    };
  }

  const db = env.HQ_DB;

  // 4. Enforce post-auth rate limiting
  if (rateKind !== 'session') {
    const postLimit = await enforceHqRateLimit(request, env, rateKind, firebaseUser.uid);
    if (!postLimit.allowed) {
      return { authorized: false, response: postLimit.response };
    }
  }

  // 5. Retrieve pre-enrolled owner record from canonical `hq_users`
  let userRecord;
  try {
    userRecord = await db
      .prepare(
        `SELECT uid, email, display_name, status, created_at, last_seen_at
         FROM hq_users
         WHERE uid = ?`
      )
      .bind(firebaseUser.uid)
      .first();
  } catch (dbErr) {
    console.error('[HQ DB Query Error]', dbErr);
    return {
      authorized: false,
      response: errorResponse(503, 'DATABASE_UNAVAILABLE', 'HQ database query failed')
    };
  }

  // 6. Fail closed if owner is not enrolled in D1 (NEVER auto-enroll on normal API requests)
  if (!userRecord) {
    await auditLog(db, {
      actorUid: null,
      actorEmail: firebaseUser.email,
      action: 'OWNER_ENROLLMENT_REJECTED',
      entityType: 'hq_users',
      entityId: firebaseUser.uid,
      requestId,
      ipAddress,
      metadata: { reason: 'owner_not_enrolled', attemptedUid: firebaseUser.uid }
    });

    return {
      authorized: false,
      response: errorResponse(
        403,
        'OWNER_NOT_ENROLLED',
        'User account is not enrolled as an active Studio HQ owner'
      )
    };
  }

  // 7. Verify Email Consistency
  if (
    typeof userRecord.email !== 'string' ||
    userRecord.email.toLowerCase() !== firebaseUser.email.toLowerCase()
  ) {
    await auditLog(db, {
      actorUid: firebaseUser.uid,
      actorEmail: firebaseUser.email,
      action: 'EMAIL_MISMATCH_REJECTED',
      entityType: 'hq_users',
      entityId: firebaseUser.uid,
      requestId,
      ipAddress,
      metadata: { tokenEmail: firebaseUser.email, dbEmail: userRecord.email }
    });

    return {
      authorized: false,
      response: errorResponse(
        403,
        'EMAIL_MISMATCH',
        'Email mismatch detected between authentication token and database record'
      )
    };
  }

  // 8. Enforce Active Owner Status Policy
  if (userRecord.status === 'disabled') {
    await auditLog(db, {
      actorUid: firebaseUser.uid,
      actorEmail: firebaseUser.email,
      action: 'OWNER_DISABLED_REJECTED',
      entityType: 'hq_users',
      entityId: firebaseUser.uid,
      requestId,
      ipAddress,
      metadata: { status: userRecord.status }
    });

    return {
      authorized: false,
      response: errorResponse(403, 'OWNER_DISABLED', 'Owner account is disabled. Access denied.')
    };
  }

  if (userRecord.status !== 'active') {
    await auditLog(db, {
      actorUid: firebaseUser.uid,
      actorEmail: firebaseUser.email,
      action: 'INVALID_STATUS_REJECTED',
      entityType: 'hq_users',
      entityId: firebaseUser.uid,
      requestId,
      ipAddress,
      metadata: { status: userRecord.status }
    });

    return {
      authorized: false,
      response: errorResponse(
        403,
        'UNAUTHORIZED_STATUS',
        `Owner status '${userRecord.status}' is not authorized`
      )
    };
  }

  // 9. Update last_seen_at ONLY when status = 'active'
  const nowIso = new Date().toISOString();
  try {
    await db
      .prepare(
        `UPDATE hq_users
         SET last_seen_at = ?
         WHERE uid = ? AND status = 'active'`
      )
      .bind(nowIso, firebaseUser.uid)
      .run();
  } catch (loginErr) {
    console.warn('[HQ Login Timestamp Update Non-Fatal Error]', loginErr);
  }

  return {
    authorized: true,
    requestId,
    ipAddress,
    owner: {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.display_name || firebaseUser.displayName,
      status: userRecord.status,
      createdAt: userRecord.created_at,
      lastSeenAt: nowIso
    },
    user: firebaseUser
  };
}

/**
 * Explicit, gated owner bootstrap endpoint helper.
 * Only permitted when `env.ALLOW_CONTROLLED_BOOTSTRAP === 'true'` and `hq_users` is empty.
 */
export async function controlledOwnerBootstrap(request, env, options = {}) {
  const ipAddress =
    request.headers?.get('cf-connecting-ip') ||
    request.headers?.get('x-forwarded-for') ||
    'unknown';
  const requestId = request.headers?.get('cf-ray') || crypto.randomUUID();

  if (env?.ALLOW_CONTROLLED_BOOTSTRAP !== 'true') {
    return errorResponse(
      403,
      'BOOTSTRAP_DISABLED',
      'Owner bootstrap is disabled. Owners must be provisioned through controlled D1 migration.'
    );
  }

  const idToken = extractBearerToken(request);
  if (!idToken) {
    return errorResponse(401, 'UNAUTHORIZED', 'Missing Bearer token');
  }

  const authResult = await verifyFirebaseToken(idToken, env, options.authOptions || {});
  if (!authResult.valid) {
    return errorResponse(authResult.code === 'UNAUTHORIZED_EMAIL' ? 403 : 401, authResult.code, authResult.error);
  }

  const db = env?.HQ_DB;
  if (!db || typeof db.prepare !== 'function') {
    return errorResponse(503, 'DATABASE_UNAVAILABLE', 'HQ database unavailable');
  }

  const countRow = await db.prepare(`SELECT COUNT(*) as total FROM hq_users`).first();
  if (Number(countRow?.total || 0) > 0) {
    return errorResponse(403, 'OWNER_ALREADY_EXISTS', 'Controlled bootstrap is only permitted on an empty hq_users table');
  }

  const nowIso = new Date().toISOString();
  const { uid, email, displayName } = authResult.user;

  await db
    .prepare(
      `INSERT INTO hq_users (uid, email, display_name, status, created_at, last_seen_at)
       VALUES (?, ?, ?, 'active', ?, ?)
       ON CONFLICT(uid) DO NOTHING`
    )
    .bind(uid, email, displayName, nowIso, nowIso)
    .run();

  await auditLog(db, {
    actorUid: uid,
    actorEmail: email,
    action: 'OWNER_ENROLLED',
    entityType: 'hq_users',
    entityId: uid,
    requestId,
    ipAddress,
    after: { uid, email, status: 'active' },
    metadata: { enrollmentType: 'explicit_controlled_bootstrap' }
  });

  return jsonResponse(
    {
      success: true,
      enrolled: true,
      owner: { uid, email, displayName, status: 'active', createdAt: nowIso, lastSeenAt: nowIso }
    },
    201
  );
}
