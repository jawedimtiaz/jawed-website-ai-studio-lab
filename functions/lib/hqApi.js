import { verifyHqFirebaseToken } from './hqAuth.js';

export const HQ_JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, private, max-age=0',
  'pragma': 'no-cache',
  'vary': 'Authorization, Origin'
};

export function hqJson(body, status = 200, extraHeaders = {}) {
  const headers = Object.keys(extraHeaders).length
    ? { ...HQ_JSON_HEADERS, ...extraHeaders }
    : HQ_JSON_HEADERS;
  return new Response(JSON.stringify(body), { status, headers });
}

export function isHqSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  const fetchSite = request.headers.get('sec-fetch-site');
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

export async function authorizeHqOwner(request, env, options = {}) {
  if (!isHqSameOrigin(request)) {
    return { ok: false, response: hqJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403) };
  }
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, response: hqJson({ ok: false, error: 'AUTH_REQUIRED' }, 401) };

  const verifyToken = options.verifyToken || verifyHqFirebaseToken;
  const result = await verifyToken(match[1]);
  if (!result.ok) {
    return { ok: false, response: hqJson({ ok: false, error: result.code }, result.status) };
  }

  const dbResult = requireHqDatabase(env);
  if (!dbResult.ok) return { ok: false, response: dbResult.response };

  try {
    const owner = await dbResult.db.prepare(
      'SELECT uid, email, status FROM hq_users WHERE uid = ?'
    ).bind(result.identity.uid).first();

    if (!owner) {
      return { ok: false, response: hqJson({ ok: false, error: 'OWNER_NOT_ENROLLED' }, 403) };
    }
    if (typeof owner.email !== 'string' ||
        owner.email.trim().toLowerCase() !== result.identity.email) {
      return { ok: false, response: hqJson({ ok: false, error: 'OWNER_EMAIL_MISMATCH' }, 403) };
    }
    if (owner.status !== 'active') {
      return { ok: false, response: hqJson({ ok: false, error: 'OWNER_DISABLED' }, 403) };
    }
    return { ok: true, identity: result.identity };
  } catch {
    return { ok: false, response: hqJson({ ok: false, error: 'HQ_DATABASE_UNAVAILABLE' }, 503) };
  }
}

export async function readHqJson(request, maxBytes = 16384) {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > maxBytes) {
      return { ok: false, response: hqJson({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413) };
    }
  }

  const chunks = [];
  let totalBytes = 0;
  if (request.body) {
    let reader;
    try {
      reader = request.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          try { await reader.cancel(); } catch {}
          return { ok: false, response: hqJson({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413) };
        }
        chunks.push(value);
      }
    } catch {
      try { await reader?.cancel(); } catch {}
      return { ok: false, response: hqJson({ ok: false, error: 'REQUEST_BODY_UNREADABLE' }, 400) };
    } finally {
      try { reader?.releaseLock(); } catch {}
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(raw || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return { ok: true, value };
  } catch {
    return { ok: false, response: hqJson({ ok: false, error: 'INVALID_JSON' }, 400) };
  }
}

export function requireHqDatabase(env) {
  if (!env?.HQ_DB || typeof env.HQ_DB.prepare !== 'function' || typeof env.HQ_DB.batch !== 'function') {
    return { ok: false, response: hqJson({ ok: false, error: 'HQ_DATABASE_UNAVAILABLE' }, 503) };
  }
  return { ok: true, db: env.HQ_DB };
}

// This statement is the first statement in every mutating D1 batch.
// An invalid JSON value deliberately raises a SQLite error if the owner is
// absent, disabled, or no longer matches the verified Firebase identity.
// D1 rolls back the complete batch when this guard fails.
export function ownerAuthorizationGuardStatement(db, identity) {
  return db.prepare(`SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM hq_users
      WHERE uid = ? AND lower(email) = ? AND status = 'active'
    ) THEN 1
    ELSE json('invalid-owner-authorization')
  END`).bind(identity.uid, identity.email);
}

export function auditStatement(db, identity, action, entityType, entityId, requestId, before, after) {
  return db.prepare(`INSERT INTO audit_logs
    (id, actor_uid, actor_email, action, entity_type, entity_id, request_id, before_json, after_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(),
      identity.uid,
      identity.email,
      action,
      entityType,
      entityId,
      requestId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null
    );
}

export function conditionalAuditStatement(db, identity, action, entityType, entityId, requestId, before, after) {
  return db.prepare(`INSERT INTO audit_logs
    (id, actor_uid, actor_email, action, entity_type, entity_id, request_id, before_json, after_json)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE changes() = 1`).bind(
      crypto.randomUUID(),
      identity.uid,
      identity.email,
      action,
      entityType,
      entityId,
      requestId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null
    );
}
