import { verifyHqFirebaseToken } from './hqAuth.js';

export const HQ_JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, private, max-age=0',
  'pragma': 'no-cache',
  'vary': 'Authorization, Origin'
};

export function hqJson(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HQ_JSON_HEADERS });
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
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) return { ok: false, response: hqJson({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413) };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, response: hqJson({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413) };
  }
  try {
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

// This statement only updates an already-authorized active owner.
// It deliberately cannot insert an owner or change a disabled owner's status.
export function ownerUpsertStatement(db, identity) {
  return db.prepare(`UPDATE hq_users
    SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE uid = ? AND lower(email) = ? AND status = 'active'`)
    .bind(identity.uid, identity.email);
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
