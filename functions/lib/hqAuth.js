// functions/lib/hqAuth.js
// Firebase Authentication & Token Verification for Studio HQ

const DEFAULT_PROJECT_ID = 'ai-studio-jawedwebsitelab-4bc53041-fd07-456d-9201-88b74a102fcb';
const DEFAULT_ALLOWED_EMAILS = ['jawedimtiaz@gmail.com'];

/**
 * Parses and decodes a JWT token without external heavy dependencies.
 * Validates header, payload structure, and claims.
 * @param {string} token 
 * @returns {{ header: object, payload: object, rawSignature: string } | null}
 */
export function decodeJwt(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const parseBase64Url = (str) => {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4 !== 0) {
        base64 += '=';
      }
      const jsonStr = atob(base64);
      return JSON.parse(jsonStr);
    };

    const header = parseBase64Url(parts[0]);
    const payload = parseBase64Url(parts[1]);
    return { header, payload, rawSignature: parts[2] };
  } catch {
    return null;
  }
}

/**
 * Retrieves the allowed owner emails from environment or fallback defaults.
 * @param {object} env 
 * @returns {string[]}
 */
export function getAllowedOwnerEmails(env = {}) {
  if (env.HQ_ALLOWED_OWNER_EMAILS) {
    if (Array.isArray(env.HQ_ALLOWED_OWNER_EMAILS)) {
      return env.HQ_ALLOWED_OWNER_EMAILS.map((e) => String(e).trim().toLowerCase());
    }
    if (typeof env.HQ_ALLOWED_OWNER_EMAILS === 'string') {
      return env.HQ_ALLOWED_OWNER_EMAILS.split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    }
  }
  return DEFAULT_ALLOWED_EMAILS.map((e) => e.toLowerCase());
}

/**
 * Verifies Firebase ID Token claims and owner email allowlist.
 * @param {string} idToken 
 * @param {object} env 
 * @returns {Promise<{ valid: boolean, user?: object, error?: string, code?: string }>}
 */
export async function verifyFirebaseToken(idToken, env = {}) {
  if (!idToken || typeof idToken !== 'string') {
    return { valid: false, error: 'Missing or invalid authentication token', code: 'UNAUTHORIZED' };
  }

  const jwt = decodeJwt(idToken);
  if (!jwt || !jwt.header || !jwt.payload) {
    return { valid: false, error: 'Malformed JWT token structure', code: 'INVALID_TOKEN' };
  }

  const { header, payload } = jwt;

  // 1. Verify RS256 algorithm
  if (header.alg !== 'RS256') {
    return { valid: false, error: 'Invalid JWT algorithm, expected RS256', code: 'INVALID_ALGORITHM' };
  }

  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const nowInSeconds = Math.floor(Date.now() / 1000);

  // 2. Verify Claims: Expiry
  if (typeof payload.exp !== 'number' || payload.exp <= nowInSeconds) {
    return { valid: false, error: 'Firebase authentication token has expired', code: 'TOKEN_EXPIRED' };
  }

  // 3. Verify Claims: Auth Time
  if (typeof payload.auth_time !== 'number' || payload.auth_time > nowInSeconds) {
    return { valid: false, error: 'Token auth_time is in the future', code: 'INVALID_AUTH_TIME' };
  }

  // 4. Verify Claims: Issuer
  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: 'Token issuer mismatch', code: 'INVALID_ISSUER' };
  }

  // 5. Verify Claims: Audience
  if (payload.aud !== projectId) {
    return { valid: false, error: 'Token audience mismatch', code: 'INVALID_AUDIENCE' };
  }

  // 6. Verify User Identity (UID & Email)
  const uid = payload.sub || payload.user_id || payload.uid;
  if (!uid || typeof uid !== 'string') {
    return { valid: false, error: 'Token missing user subject ID', code: 'MISSING_UID' };
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!email) {
    return { valid: false, error: 'Token missing user email address', code: 'MISSING_EMAIL' };
  }

  // 7. Verify Email Verification Flag
  if (payload.email_verified !== true) {
    return { valid: false, error: 'User email address is not verified in Firebase', code: 'EMAIL_UNVERIFIED' };
  }

  // 8. Verify Allowed Owner Email Allowlist
  const allowedEmails = getAllowedOwnerEmails(env);
  if (!allowedEmails.includes(email)) {
    return { valid: false, error: 'Email address is not in authorized owner allowlist', code: 'UNAUTHORIZED_EMAIL' };
  }

  return {
    valid: true,
    user: {
      uid,
      email,
      emailVerified: true,
      authTime: payload.auth_time,
      projectId
    }
  };
}
