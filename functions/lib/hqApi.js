// functions/lib/hqApi.js
// Studio HQ Authorization & D1 Database Helpers

import { verifyFirebaseToken } from './hqAuth.js';

/**
 * Standard JSON response helper.
 * @param {object} body 
 * @param {number} status 
 * @param {object} extraHeaders 
 * @returns {Response}
 */
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

/**
 * Standard JSON error response helper.
 * @param {number} status 
 * @param {string} code 
 * @param {string} message 
 * @param {object} extra 
 * @returns {Response}
 */
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
 * Writes an audit record to hq_audit_logs table in D1.
 * @param {object} db 
 * @param {object} params 
 */
export async function auditLog(db, { userId = 'system', action, status, details = '', ipAddress = 'unknown' }) {
  if (!db || typeof db.prepare !== 'function') return;
  const id = crypto.randomUUID();
  const now = Date.now();
  const detailsStr = typeof details === 'object' ? JSON.stringify(details) : String(details);

  try {
    await db.prepare(`
      INSERT INTO hq_audit_logs (id, user_id, action, status, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, userId, action, status, detailsStr, ipAddress, now).run();
  } catch (err) {
    console.error('[HQ Audit Log Error]', err);
  }
}

/**
 * Extracts Bearer token from Request Authorization header.
 * @param {Request} request 
 * @returns {string | null}
 */
export function extractBearerToken(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

/**
 * Primary HQ Owner Verification & Authorization Pipeline.
 * Enforces Firebase identity verification, D1 owner database validation,
 * controlled first-owner enrollment, and strict status = 'active' policy.
 * 
 * @param {Request} request 
 * @param {object} env 
 * @returns {Promise<{ authorized: boolean, owner?: object, user?: object, response?: Response }>}
 */
export async function verifyAndAuthorizeOwner(request, env) {
  const ipAddress = request.headers?.get('cf-connecting-ip') || request.headers?.get('x-forwarded-for') || 'unknown';

  // 1. Extract Authorization Bearer token
  const idToken = extractBearerToken(request);
  if (!idToken) {
    return {
      authorized: false,
      response: errorResponse(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header with Bearer token')
    };
  }

  // 2. Verify Firebase Token Claims & Email Allowlist
  const authResult = await verifyFirebaseToken(idToken, env);
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
  const now = Date.now();

  // 4. Retrieve stored owner record from D1
  let userRecord;
  try {
    userRecord = await db.prepare(`
      SELECT id, email, role, status, created_at, updated_at, last_login_at
      FROM hq_users
      WHERE id = ?
    `).bind(firebaseUser.uid).first();
  } catch (dbErr) {
    console.error('[HQ DB Query Error]', dbErr);
    return {
      authorized: false,
      response: errorResponse(503, 'DATABASE_UNAVAILABLE', 'HQ database query failed')
    };
  }

  // 5. Handle First-Owner Bootstrap & Controlled Enrollment
  if (!userRecord) {
    let ownerCount = 0;
    try {
      const countResult = await db.prepare(`SELECT COUNT(*) as total FROM hq_users`).first();
      ownerCount = Number(countResult?.total || 0);
    } catch (countErr) {
      console.error('[HQ DB Count Error]', countErr);
      return {
        authorized: false,
        response: errorResponse(503, 'DATABASE_UNAVAILABLE', 'HQ database user count failed')
      };
    }

    if (ownerCount === 0) {
      // First-Owner Controlled Bootstrap Enrollment
      try {
        await db.prepare(`
          INSERT INTO hq_users (id, email, role, status, created_at, updated_at, last_login_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `).bind(firebaseUser.uid, firebaseUser.email, 'owner', 'active', now, now, now).run();

        await auditLog(db, {
          userId: firebaseUser.uid,
          action: 'OWNER_ENROLLED',
          status: 'SUCCESS',
          details: { email: firebaseUser.email, enrollmentType: 'first_owner_bootstrap' },
          ipAddress
        });

        // Re-query newly enrolled owner
        userRecord = await db.prepare(`
          SELECT id, email, role, status, created_at, updated_at, last_login_at
          FROM hq_users
          WHERE id = ?
        `).bind(firebaseUser.uid).first();
      } catch (enrollErr) {
        console.error('[HQ Enrollment Error]', enrollErr);
        return {
          authorized: false,
          response: errorResponse(503, 'DATABASE_UNAVAILABLE', 'HQ first-owner enrollment failed')
        };
      }
    } else {
      // Owners already exist in HQ, but this user UID is not registered
      await auditLog(db, {
        userId: firebaseUser.uid,
        action: 'OWNER_ENROLLMENT_REJECTED',
        status: 'DENIED',
        details: { email: firebaseUser.email, reason: 'unregistered_owner_uid' },
        ipAddress
      });

      return {
        authorized: false,
        response: errorResponse(403, 'OWNER_NOT_ENROLLED', 'User account is not enrolled as an active HQ owner')
      };
    }
  }

  // 6. Verify Email Consistency
  if (!userRecord || typeof userRecord.email !== 'string' || userRecord.email.toLowerCase() !== firebaseUser.email.toLowerCase()) {
    await auditLog(db, {
      userId: firebaseUser.uid,
      action: 'EMAIL_MISMATCH_REJECTED',
      status: 'DENIED',
      details: { tokenEmail: firebaseUser.email, dbEmail: userRecord?.email },
      ipAddress
    });

    return {
      authorized: false,
      response: errorResponse(403, 'EMAIL_MISMATCH', 'Email mismatch detected between authentication token and database record')
    };
  }

  // 7. Enforce Active Owner Status Policy
  if (userRecord.status === 'disabled') {
    await auditLog(db, {
      userId: firebaseUser.uid,
      action: 'OWNER_DISABLED_REJECTED',
      status: 'DENIED',
      details: { email: firebaseUser.email, status: userRecord.status },
      ipAddress
    });

    return {
      authorized: false,
      response: errorResponse(403, 'OWNER_DISABLED', 'Owner account is disabled. Access denied.')
    };
  }

  if (userRecord.status !== 'active') {
    await auditLog(db, {
      userId: firebaseUser.uid,
      action: 'INVALID_STATUS_REJECTED',
      status: 'DENIED',
      details: { email: firebaseUser.email, status: userRecord.status },
      ipAddress
    });

    return {
      authorized: false,
      response: errorResponse(403, 'UNAUTHORIZED_STATUS', `Owner status '${userRecord.status}' is not authorized`)
    };
  }

  // 8. Update Login Timestamp (NEVER modifies status)
  try {
    await db.prepare(`
      UPDATE hq_users
      SET last_login_at = ?, updated_at = ?
      WHERE id = ? AND status = 'active'
    `).bind(now, now, firebaseUser.uid).run();
  } catch (loginErr) {
    console.warn('[HQ Login Timestamp Update Non-Fatal Error]', loginErr);
  }

  await auditLog(db, {
    userId: firebaseUser.uid,
    action: 'OWNER_AUTHENTICATED',
    status: 'SUCCESS',
    details: { email: firebaseUser.email },
    ipAddress
  });

  return {
    authorized: true,
    owner: {
      id: userRecord.id,
      email: userRecord.email,
      role: userRecord.role || 'owner',
      status: userRecord.status,
      lastLoginAt: now
    },
    user: firebaseUser
  };
}
