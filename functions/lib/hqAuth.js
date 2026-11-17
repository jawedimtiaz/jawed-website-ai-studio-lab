// functions/lib/hqAuth.js
// Cryptographic Firebase Authentication & Owner Allowlist Verification for Studio HQ

const DEFAULT_PROJECT_ID = 'refined-actor-skhlb';
const DEFAULT_ALLOWED_EMAILS = ['jawedimtiaz@gmail.com', 'jawed@jawed.co.in'];
const GOOGLE_FIREBASE_JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let cachedJwks = { keys: null, expiresAt: 0 };

function base64UrlToUint8Array(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseBase64UrlJson(str) {
  const bytes = base64UrlToUint8Array(str);
  const jsonStr = new TextDecoder().decode(bytes);
  return JSON.parse(jsonStr);
}

/**
 * Parses and decodes a JWT token without trusting its claims.
 * @param {string} token
 * @returns {{ header: object, payload: object, signingInput: string, signatureBytes: Uint8Array, rawSignature: string } | null}
 */
export function decodeJwt(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;

  try {
    const header = parseBase64UrlJson(parts[0]);
    const payload = parseBase64UrlJson(parts[1]);
    const signatureBytes = base64UrlToUint8Array(parts[2]);
    return {
      header,
      payload,
      signingInput: `${parts[0]}.${parts[1]}`,
      signatureBytes,
      rawSignature: parts[2]
    };
  } catch {
    return null;
  }
}

/**
 * Retrieves the allowed owner emails from environment or canonical Studio HQ defaults.
 * @param {object} env
 * @returns {string[]}
 */
export function getAllowedOwnerEmails(env = {}) {
  if (env?.HQ_ALLOWED_OWNER_EMAILS) {
    if (Array.isArray(env.HQ_ALLOWED_OWNER_EMAILS)) {
      return env.HQ_ALLOWED_OWNER_EMAILS.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
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
 * Fetches and caches Google's Firebase Auth JWK public signing keys.
 */
async function fetchGoogleFirebaseJwks(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedJwks.keys && cachedJwks.expiresAt > now) {
    return cachedJwks.keys;
  }

  const res = await fetch(GOOGLE_FIREBASE_JWK_URL, {
    headers: { accept: 'application/json' }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase JWKS (${res.status})`);
  }

  const data = await res.json();
  if (!data || !Array.isArray(data.keys)) {
    throw new Error('Malformed Firebase JWKS payload');
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) * 1000 : 3600 * 1000;

  cachedJwks = {
    keys: data.keys,
    expiresAt: now + ttlMs
  };

  return data.keys;
}

/**
 * Verifies RS256 cryptographic signature using Web Crypto API and JWK public keys.
 */
async function verifyRs256WithJwks(jwt, options = {}) {
  const { header, signingInput, signatureBytes } = jwt;
  if (!header.kid || typeof header.kid !== 'string' || !header.kid.trim()) {
    return { verified: false, code: 'MISSING_KID', error: 'Token header missing signing key ID (kid)' };
  }

  let keys = options.jwks || null;
  if (!keys) {
    try {
      keys = await fetchGoogleFirebaseJwks(false);
    } catch (err) {
      return { verified: false, code: 'KEY_FETCH_FAILED', error: err.message || 'Unable to fetch signing keys' };
    }
  }

  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk && !options.jwks) {
    // Key rotation fallback: refresh cache once on unknown kid
    try {
      keys = await fetchGoogleFirebaseJwks(true);
      jwk = keys.find((k) => k.kid === header.kid);
    } catch {
      // Ignore refresh error, fall through to UNKNOWN_KID
    }
  }

  if (!jwk) {
    return { verified: false, code: 'UNKNOWN_KID', error: 'Unknown Firebase signing key ID' };
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const dataBytes = new TextEncoder().encode(signingInput);
    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signatureBytes,
      dataBytes
    );
    if (!isValid) {
      return { verified: false, code: 'INVALID_SIGNATURE', error: 'Firebase token signature verification failed' };
    }
    return { verified: true };
  } catch {
    return { verified: false, code: 'INVALID_SIGNATURE', error: 'Cryptographic signature verification failed' };
  }
}

/**
 * Verifies Firebase ID Token cryptographic signature, standard claims, and owner email allowlist.
 * @param {string} idToken
 * @param {object} env
 * @param {object} [options] - Optional { jwks, verifySignature, nowSeconds } for unit testing
 * @returns {Promise<{ valid: boolean, user?: object, error?: string, code?: string }>}
 */
export async function verifyFirebaseToken(idToken, env = {}, options = {}) {
  if (!idToken || typeof idToken !== 'string') {
    return { valid: false, error: 'Missing or invalid authentication token', code: 'UNAUTHORIZED' };
  }

  const jwt = decodeJwt(idToken);
  if (!jwt || !jwt.header || !jwt.payload) {
    return { valid: false, error: 'Malformed JWT token structure', code: 'INVALID_TOKEN' };
  }

  const { header, payload } = jwt;

  // 1. Verify RS256 algorithm and kid
  if (header.alg !== 'RS256') {
    return { valid: false, error: 'Invalid JWT algorithm, expected RS256', code: 'INVALID_ALGORITHM' };
  }

  if (!header.kid || typeof header.kid !== 'string' || !header.kid.trim()) {
    return { valid: false, error: 'JWT header missing key ID (kid)', code: 'MISSING_KID' };
  }

  // 2. Cryptographic signature verification (ALWAYS required; never skipped in production)
  if (typeof options.verifySignature === 'function') {
    const sigOk = await options.verifySignature(jwt, env);
    if (!sigOk) {
      return { valid: false, error: 'Firebase token signature verification failed', code: 'INVALID_SIGNATURE' };
    }
  } else {
    const sigCheck = await verifyRs256WithJwks(jwt, options);
    if (!sigCheck.verified) {
      return { valid: false, error: sigCheck.error, code: sigCheck.code };
    }
  }

  const projectId = env?.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const nowInSeconds = typeof options.nowSeconds === 'number' ? options.nowSeconds : Math.floor(Date.now() / 1000);

  // 3. Verify Claims: Expiry, Issued-At, Auth-Time
  if (typeof payload.exp !== 'number' || payload.exp <= nowInSeconds) {
    return { valid: false, error: 'Firebase authentication token has expired', code: 'TOKEN_EXPIRED' };
  }

  if (typeof payload.iat === 'number' && payload.iat > nowInSeconds + 300) {
    return { valid: false, error: 'Token iat is in the future', code: 'INVALID_IAT' };
  }

  if (typeof payload.auth_time !== 'number' || payload.auth_time > nowInSeconds + 300) {
    return { valid: false, error: 'Token auth_time is invalid or in the future', code: 'INVALID_AUTH_TIME' };
  }

  // 4. Verify Claims: Issuer & Audience
  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: 'Token issuer mismatch', code: 'INVALID_ISSUER' };
  }

  if (payload.aud !== projectId) {
    return { valid: false, error: 'Token audience mismatch', code: 'INVALID_AUDIENCE' };
  }

  // 5. Verify User Identity (UID & Email)
  const uid = payload.sub || payload.user_id || payload.uid;
  if (!uid || typeof uid !== 'string' || uid.length > 128) {
    return { valid: false, error: 'Token missing valid user subject ID', code: 'MISSING_UID' };
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!email) {
    return { valid: false, error: 'Token missing user email address', code: 'MISSING_EMAIL' };
  }

  // 6. Verify Email Verification Flag
  if (payload.email_verified !== true) {
    return { valid: false, error: 'User email address is not verified in Firebase', code: 'EMAIL_UNVERIFIED' };
  }

  // 7. Verify Allowed Owner Email Allowlist
  const allowedEmails = getAllowedOwnerEmails(env);
  if (!allowedEmails.includes(email)) {
    return { valid: false, error: 'Email address is not in authorized owner allowlist', code: 'UNAUTHORIZED_EMAIL' };
  }

  return {
    valid: true,
    user: {
      uid,
      email,
      displayName: typeof payload.name === 'string' ? payload.name.trim() : email.split('@')[0],
      emailVerified: true,
      authTime: payload.auth_time,
      projectId
    }
  };
}

export function clearJwksCacheForTests() {
  cachedJwks = { keys: null, expiresAt: 0 };
}
