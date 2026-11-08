// Firebase ID token verification for the Studio HQ owner API.
// Uses the Worker Web Crypto API; no JWT payload is trusted before RS256 verification.

const DEFAULT_PROJECT_ID = 'refined-actor-skhlb';
const CERTIFICATE_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const DEFAULT_OWNER_EMAILS = ['jawedimtiaz@gmail.com'];
const MAX_TOKEN_LENGTH = 12_000;
const MAX_CERTIFICATE_RESPONSE_BYTES = 128 * 1024;
const CERTIFICATE_FETCH_TIMEOUT_MS = 5_000;
const MAX_CERTIFICATE_CACHE_MS = 60 * 60 * 1000;

let certificateCache = { expiresAt: 0, certificates: null };

function failure(code, error = 'Firebase authentication token could not be verified') {
  return { valid: false, code, error };
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('INVALID_BASE64URL');
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonSegment(value) {
  const bytes = decodeBase64Url(value);
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Minimal strict DER reader used only to extract SubjectPublicKeyInfo from
// Google's X.509 certificate. Signature verification itself is Web Crypto.
function readDerNode(bytes, offset) {
  const headerOffset = offset;
  if (offset >= bytes.length) throw new Error('INVALID_CERTIFICATE_DER');
  const tag = bytes[offset++];
  if (offset >= bytes.length) throw new Error('INVALID_CERTIFICATE_DER');
  let length = bytes[offset++];
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4 || offset + count > bytes.length) throw new Error('INVALID_CERTIFICATE_DER');
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[offset++];
  }
  const start = offset;
  const end = start + length;
  if (end > bytes.length) throw new Error('INVALID_CERTIFICATE_DER');
  return { tag, offset: headerOffset, start, end, next: end };
}

function derChildren(bytes, parent) {
  const children = [];
  let offset = parent.start;
  while (offset < parent.end) {
    const child = readDerNode(bytes, offset);
    children.push(child);
    offset = child.next;
  }
  if (offset !== parent.end) throw new Error('INVALID_CERTIFICATE_DER');
  return children;
}
function decodeBase64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('INVALID_CERTIFICATE_BASE64');
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getSpkiDer(pem) {
  if (typeof pem !== 'string' || pem.length > 16_384) throw new Error('INVALID_CERTIFICATE');
  const base64 = pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, '');
  const der = decodeBase64(base64);
  const root = readDerNode(der, 0);
  if (root.tag !== 0x30 || root.next !== der.length) throw new Error('INVALID_CERTIFICATE_DER');
  const certificate = derChildren(der, root);
  if (certificate.length !== 3 || certificate[0].tag !== 0x30) throw new Error('INVALID_CERTIFICATE_DER');
  const tbs = derChildren(der, certificate[0]);
  const index = tbs[0]?.tag === 0xa0 ? 1 : 0;
  const spki = tbs[index + 5];
  if (!spki || spki.tag !== 0x30) throw new Error('INVALID_CERTIFICATE_SPKI');
  return der.slice(spki.offset, spki.end);
}

function ownerEmailsFromEnv(env = {}) {
  const configured = env.HQ_ALLOWED_OWNER_EMAILS;
  const values = Array.isArray(configured)
    ? configured
    : typeof configured === 'string'
      ? configured.split(',')
      : DEFAULT_OWNER_EMAILS;
  return values.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
}

function cacheExpiry(response, now) {
  const cacheControl = response.headers.get('cache-control') || '';
  const match = cacheControl.match(/(?:^|,)\s*max-age=(\d+)/i);
  const seconds = match ? Number(match[1]) : 300;
  return now + Math.max(0, Math.min(seconds, MAX_CERTIFICATE_CACHE_MS / 1000)) * 1000;
}

async function loadCertificates(fetchImpl, now, forceRefresh = false) {
  if (!forceRefresh && certificateCache.certificates && certificateCache.expiresAt > now) {
    return certificateCache.certificates;
  }
  const response = await fetchImpl(CERTIFICATE_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(CERTIFICATE_FETCH_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error('CERTIFICATE_FETCH_FAILED');
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_CERTIFICATE_RESPONSE_BYTES) throw new Error('CERTIFICATE_RESPONSE_TOO_LARGE');
  const body = await response.text();
  if (body.length > MAX_CERTIFICATE_RESPONSE_BYTES) throw new Error('CERTIFICATE_RESPONSE_TOO_LARGE');
  const certificates = JSON.parse(body);
  if (!certificates || typeof certificates !== 'object' || Array.isArray(certificates)) {
    throw new Error('CERTIFICATE_RESPONSE_INVALID');
  }
  const entries = Object.entries(certificates);
  if (!entries.length || entries.length > 20 || entries.some(([kid, pem]) =>
    !kid || kid.length > 256 || typeof pem !== 'string' || !pem.includes('BEGIN CERTIFICATE')
  )) throw new Error('CERTIFICATE_RESPONSE_INVALID');
  certificateCache = { certificates, expiresAt: cacheExpiry(response, now) };
  return certificates;
}

export async function importFirebaseCertificate(pem) {
  const spki = getSpkiDer(pem);
  return crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/**
 * Verifies Firebase Secure Token ID tokens.
 * Optional third argument provides deterministic fetch/key hooks for unit tests only.
 */
export async function verifyFirebaseToken(idToken, env = {}, options = {}) {
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > MAX_TOKEN_LENGTH) {
    return failure('UNAUTHORIZED', 'Missing or malformed Firebase ID token');
  }

  const projectId = typeof env.FIREBASE_PROJECT_ID === 'string' ? env.FIREBASE_PROJECT_ID.trim() : DEFAULT_PROJECT_ID;
  if (!/^[a-z0-9-]{1,128}$/.test(projectId)) return failure('FIREBASE_PROJECT_ID_INVALID');
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;

  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return failure('INVALID_TOKEN', 'Malformed JWT structure');
    const header = decodeJsonSegment(parts[0]);
    if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
      return failure('INVALID_TOKEN_HEADER', 'Unsupported JWT algorithm or missing signing key ID');
    }
    const payload = decodeJsonSegment(parts[1]);
    const signature = decodeBase64Url(parts[2]);
    const nowMs = options.now ?? Date.now();
    const nowSeconds = Math.floor(nowMs / 1000);
    const fetchImpl = options.fetchImpl || fetch;
    const importCertificate = options.importCertificate || importFirebaseCertificate;
    let certificates = await loadCertificates(fetchImpl, nowMs);
    let certificate = certificates[header.kid];
    if (!certificate) {
      certificates = await loadCertificates(fetchImpl, nowMs, true);
      certificate = certificates[header.kid];
    }
    if (!certificate) return failure('SIGNING_KEY_NOT_FOUND', 'Firebase signing key was not found');

    const publicKey = await importCertificate(certificate);
    const signingInput = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    const verified = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signature,
      signingInput
    );
    if (!verified) return failure('INVALID_SIGNATURE', 'Firebase ID token signature is invalid');

    // Claims are trusted only after the cryptographic signature succeeds.
    if (payload.iss !== expectedIssuer) return failure('INVALID_ISSUER', 'Firebase token issuer mismatch');
    if (payload.aud !== projectId) return failure('INVALID_AUDIENCE', 'Firebase token audience mismatch');
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= nowSeconds) {
      return failure('TOKEN_EXPIRED', 'Firebase authentication token has expired');
    }
    if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) || payload.iat > nowSeconds + 5) {
      return failure('INVALID_ISSUED_AT', 'Firebase token issued-at claim is invalid');
    }
    if (typeof payload.auth_time !== 'number' || !Number.isFinite(payload.auth_time) || payload.auth_time > nowSeconds + 5) {
      return failure('INVALID_AUTH_TIME', 'Firebase token auth_time claim is invalid');
    }
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) {
      return failure('MISSING_UID', 'Firebase token subject is invalid');
    }
    if (payload.email_verified !== true || typeof payload.email !== 'string' || !payload.email.trim()) {
      return failure('EMAIL_UNVERIFIED', 'Firebase email must be verified');
    }
    const email = payload.email.trim().toLowerCase();
    if (!ownerEmailsFromEnv(env).includes(email)) {
      return failure('UNAUTHORIZED_EMAIL', 'Email address is not in the authorized owner allowlist');
    }
    return {
      valid: true,
      user: {
        uid: payload.sub,
        email,
        emailVerified: true,
        authTime: payload.auth_time,
        projectId
      }
    };
  } catch {
    // Includes certificate network/timeout/parse errors and crypto failures.
    return failure('TOKEN_VERIFICATION_FAILED', 'Firebase token verification failed closed');
  }
}

export function resetFirebaseCertificateCacheForTests() {
  certificateCache = { expiresAt: 0, certificates: null };
}
