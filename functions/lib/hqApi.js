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
 * Standard CORS preflight response for Studio HQ endpoints.
 */
export function hqOptionsResponse(methods = 'GET, POST, PUT, PATCH, DELETE, OPTIONS') {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': methods,
      'access-control-allow-headers': 'content-type, authorization, x-idempotency-key',
      'access-control-max-age': '86400'
    }
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
          request_id, ip_address, before_json, after_json, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        String(actorUid || 'system'),
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
 * Atomically generates sequential human-friendly numbers (e.g. QUO-2026-0001, INV-2026-0001).
 */
export async function nextSequenceNumber(db, seqKey, prefix) {
  const nowIso = new Date().toISOString();
  const year = nowIso.slice(0, 4);
  const fullKey = `${seqKey}_${year}`;

  await db
    .prepare(
      `INSERT INTO financial_sequences (seq_key, current_value, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(seq_key) DO UPDATE SET
         current_value = current_value + 1,
         updated_at = excluded.updated_at`
    )
    .bind(fullKey, nowIso)
    .run();

  const row = await db
    .prepare(`SELECT current_value FROM financial_sequences WHERE seq_key = ?`)
    .bind(fullKey)
    .first();

  const num = Number(row?.current_value || 1);
  return `${prefix}-${year}-${String(num).padStart(4, '0')}`;
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
      actorUid: firebaseUser.uid,
      actorEmail: firebaseUser.email,
      action: 'OWNER_ENROLLMENT_REJECTED',
      entityType: 'hq_users',
      entityId: firebaseUser.uid,
      requestId,
      ipAddress,
      metadata: { reason: 'owner_not_enrolled' }
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
