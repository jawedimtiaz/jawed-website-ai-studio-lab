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

export async function authorizeHqOwner(request) {
  if (!isHqSameOrigin(request)) {
    return { ok: false, response: hqJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403) };
  }
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, response: hqJson({ ok: false, error: 'AUTH_REQUIRED' }, 401) };

  const result = await verifyHqFirebaseToken(match[1]);
  if (!result.ok) {
    return { ok: false, response: hqJson({ ok: false, error: result.code }, result.status) };
  }
  return { ok: true, identity: result.identity };
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

export function ownerUpsertStatement(db, identity) {
  return db.prepare(`INSERT INTO hq_users (uid, email, status, last_seen_at)
    VALUES (?, ?, 'active', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(uid) DO UPDATE SET
      email = excluded.email,
      status = 'active',
      last_seen_at = excluded.last_seen_at`).bind(identity.uid, identity.email);
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
