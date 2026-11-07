// functions/lib/hqApi.js
// Studio HQ owner authorization and D1 helpers aligned with migrations/hq schema.

import { verifyFirebaseToken } from './hqAuth.js';

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  });
}

export function errorResponse(status, code, message, extra = {}) {
  return jsonResponse({
    success: false,
    error: {
      code,
      message,
      status,
      timestamp: new Date().toISOString(),
      ...extra
    }
  }, status);
}

/**
 * Append an authentication/security event to the live audit_logs schema.
 * Raw IP addresses and request bodies are deliberately not stored.
 */
export async function auditLog(db, {
  userId = null,
  actorEmail = 'unknown',
  action,
  status = 'INFO',
  details = {}
} = {}) {
  if (!db || typeof db.prepare !== 'function' || !action) return;

  const detailObject = details && typeof details === 'object'
    ? details
    : { detail: String(details) };
  const email = typeof detailObject.email === 'string' ? detailObject.email : actorEmail;
  const metadata = JSON.stringify({ status, ...detailObject });

  try {
    await db.prepare(`
      INSERT INTO audit_logs
        (id, actor_uid, actor_email, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (?, ?, ?, ?, 'auth', ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      userId,
      email || 'unknown',
      action,
      userId,
      metadata,
      new Date().toISOString()
    ).run();
  } catch (error) {
    // Audit failure must not disclose internals or turn a denied request into access.
    console.error('[HQ Audit Log Error]', String(error?.message || error));
  }
}

export function extractBearerToken(request) {
  const header = request?.headers?.get('authorization') || '';
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  return match ? match[1] : null;
}

/**
 * Requires a cryptographically verified Firebase ID token and a pre-enrolled,
 * active owner row in hq_users(uid,email,display_name,status,created_at,last_seen_at).
 *
 * First-owner enrollment is intentionally not performed by an HTTP request.
 * Seed the first owner only through a separately reviewed, explicit D1 operation
 * after confirming the Firebase UID and owner email.
 */
export async function verifyAndAuthorizeOwner(request, env, options = {}) {
  const idToken = extractBearerToken(request);
  if (!idToken) {
    return {
      authorized: false,
      response: errorResponse(401, 'UNAUTHORIZED', 'A valid Bearer token is required')
    };
  }

  const verifyToken = options.verifyToken || verifyFirebaseToken;
  const authResult = await verifyToken(idToken, env);
  if (!authResult?.valid || !authResult.user?.uid || !authResult.user?.email) {
    const code = authResult?.code || 'INVALID_FIREBASE_TOKEN';
    const status = code === 'UNAUTHORIZED_EMAIL' ? 403 : 401;
    return {
      authorized: false,
      response: errorResponse(status, code, 'Firebase authentication could not be verified')
    };
  }

  const firebaseUser = authResult.user;
  if (!env?.HQ_DB || typeof env.HQ_DB.prepare !== 'function') {
    return {
      authorized: false,
      response: errorResponse(503, 'DATABASE_UNAVAILABLE', 'HQ database service is unavailable')
    };
  }

  const db = env.HQ_DB;
  let userRecord;
  try {
    userRecord = await db.prepare(`
      SELECT uid, email, display_name, status, created_at, last_seen_at
      FROM hq_users
      WHERE uid = ?
      LIMIT 1
    `).bind(firebaseUser.uid).first();
  } catch (error) {
    console.error('[HQ DB Query Error]', String(error?.message || error));
    return {
      authorized: false,
      response: errorResponse(503, 'DATABASE_UNAVAILABLE', 'HQ owner record could not be checked')
    };
  }

  if (!userRecord) {
    await auditLog(db, {
      userId: firebaseUser.uid,
      actorEmail: firebaseUser.email,
      action: 'OWNER_ENROLLMENT_REJECTED',
      status: 'DENIED',
      details: { email: firebaseUser.email, reason: 'owner_uid_not_pre_enrolled' }
    });
    return {
      authorized: false,
      response: errorResponse(403, 'OWNER_NOT_ENROLLED', 'This Firebase account has not been explicitly enrolled as an HQ owner')
    };
  }

  if (typeof userRecord.email !== 'string' ||
      userRecord.email.trim().toLowerCase() !== firebaseUser.email.trim().toLowerCase()) {
    await auditLog(db, {
      userId: firebaseUser.uid,
      actorEmail: firebaseUser.email,
      action: 'EMAIL_MISMATCH_REJECTED',
      status: 'DENIED',
      details: { email: firebaseUser.email, reason: 'firebase_email_does_not_match_owner_record' }
    });
    return {
      authorized: false,
      response: errorResponse(403, 'EMAIL_MISMATCH', 'Firebase email does not match the enrolled owner record')
    };
  }

  if (userRecord.status !== 'active') {
    await auditLog(db, {
      userId: firebaseUser.uid,
      actorEmail: firebaseUser.email,
      action: 'OWNER_STATUS_REJECTED',
      status: 'DENIED',
      details: { email: firebaseUser.email, ownerStatus: userRecord.status }
    });
    return {
      authorized: false,
      response: errorResponse(403, 'OWNER_DISABLED', 'HQ owner access is not active')
    };
  }

  const lastSeenAt = new Date().toISOString();
  try {
    await db.prepare(`
      UPDATE hq_users
      SET last_seen_at = ?
      WHERE uid = ? AND status = 'active'
    `).bind(lastSeenAt, firebaseUser.uid).run();
  } catch (error) {
    // last_seen_at is telemetry only; failure must not grant or revoke access.
    console.warn('[HQ Last Seen Update Error]', String(error?.message || error));
  }

  await auditLog(db, {
    userId: firebaseUser.uid,
    actorEmail: firebaseUser.email,
    action: 'OWNER_AUTHENTICATED',
    status: 'SUCCESS',
    details: { email: firebaseUser.email }
  });

  return {
    authorized: true,
    owner: {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.display_name || '',
      status: userRecord.status,
      lastSeenAt
    },
    user: firebaseUser
  };
}
