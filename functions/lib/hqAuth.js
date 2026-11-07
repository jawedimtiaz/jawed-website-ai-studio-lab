// functions/lib/hqAuth.js
// Cryptographic Firebase ID-token verification for Studio HQ.

import { importX509, jwtVerify } from 'jose';

const DEFAULT_PROJECT_ID = 'refined-actor-skhlb';
const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const DEFAULT_ALLOWED_EMAILS = ['jawedimtiaz@gmail.com'];
let cache = { expiresAt: 0, certificates: null };

export function getAllowedOwnerEmails(env = {}) {
  const configured = env.HQ_ALLOWED_OWNER_EMAILS;
  if (Array.isArray(configured)) {
    return configured.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof configured === 'string') {
    return configured.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_EMAILS.map((email) => email.toLowerCase());
}

function denied(status, code) {
  return { ok: false, status, code };
}

function certificateExpiry(response, now) {
  const cacheControl = response.headers.get('cache-control') || '';
  const match = cacheControl.match(/(?:^|,)\s*max-age=(\d+)/i);
  const seconds = match ? Number(match[1]) : 300;
  return now + Math.max(0, Math.min(seconds, 3600)) * 1000;
}

async function loadCertificates(fetchImpl, now) {
  if (cache.certificates && cache.expiresAt > now) return cache.certificates;

  const response = await fetchImpl(CERT_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('CERTIFICATE_FETCH_FAILED');

  const data = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('CERTIFICATE_RESPONSE_INVALID');
  }

  const entries = Object.entries(data);
  if (!entries.length || entries.some(([kid, pem]) =>
    !kid || typeof pem !== 'string' || !pem.includes('BEGIN CERTIFICATE')
  )) {
    throw new Error('CERTIFICATE_RESPONSE_INVALID');
  }

  cache = {
    certificates: Object.fromEntries(entries),
    expiresAt: certificateExpiry(response, now)
  };
  return cache.certificates;
}

/**
 * Verifies a Firebase ID token using Google's published X.509 signing certificates.
 * Optional dependencies/time are injectable for deterministic unit tests.
 */
export async function verifyHqFirebaseToken(token, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now ?? Date.now();
  const verify = options.verify || jwtVerify;
  const importCertificate = options.importCertificate || importX509;
  const projectId = options.projectId || DEFAULT_PROJECT_ID;
  const allowedEmails = options.allowedEmails || DEFAULT_ALLOWED_EMAILS;

  if (typeof token !== 'string' || token.length < 20 || token.length > 10000) {
    return denied(401, 'AUTH_TOKEN_MISSING_OR_MALFORMED');
  }

  try {
    const encodedHeader = token.split('.')[0];
    if (!encodedHeader) return denied(401, 'AUTH_TOKEN_INVALID');

    let header;
    try {
      const normalized = encodedHeader.replace(/-/g, '+').replace(/_/g, '/');
      header = JSON.parse(atob(normalized));
    } catch {
      return denied(401, 'AUTH_TOKEN_INVALID');
    }

    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
      return denied(401, 'AUTH_TOKEN_ALGORITHM_OR_KEY_INVALID');
    }

    let certificates = await loadCertificates(fetchImpl, now);
    let certificate = certificates[header.kid];
    if (!certificate) {
      cache.expiresAt = 0;
      certificates = await loadCertificates(fetchImpl, now);
      certificate = certificates[header.kid];
    }
    if (!certificate) return denied(401, 'AUTH_SIGNING_KEY_NOT_FOUND');

    const key = await importCertificate(certificate, 'RS256');
    const result = await verify(token, key, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
      clockTolerance: 5
    });

    const claims = result.payload;
    const seconds = Math.floor(now / 1000);
    if (
      typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= seconds ||
      typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat > seconds + 5 ||
      typeof claims.auth_time !== 'number' || !Number.isFinite(claims.auth_time) || claims.auth_time > seconds + 5 ||
      typeof claims.sub !== 'string' || !claims.sub ||
      claims.email_verified !== true || typeof claims.email !== 'string'
    ) {
      return denied(401, 'AUTH_CLAIMS_INVALID');
    }

    const email = claims.email.trim().toLowerCase();
    const normalizedAllowlist = new Set(allowedEmails.map((value) => String(value).trim().toLowerCase()));
    if (!normalizedAllowlist.has(email)) return denied(403, 'UNAUTHORIZED_EMAIL');

    return { ok: true, identity: { uid: claims.sub, email } };
  } catch {
    return denied(401, 'AUTH_TOKEN_VERIFICATION_FAILED');
  }
}

/**
 * Backward-compatible adapter used by the existing HQ authorization helper.
 */
export async function verifyFirebaseToken(idToken, env = {}, options = {}) {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const result = await verifyHqFirebaseToken(idToken, {
    projectId,
    allowedEmails: getAllowedOwnerEmails(env),
    fetchImpl: options.fetchImpl,
    importCertificate: options.importCertificate,
    verify: options.verify,
    now: options.now
  });

  if (!result.ok) {
    return { valid: false, error: result.code, code: result.code };
  }

  return {
    valid: true,
    user: {
      uid: result.identity.uid,
      email: result.identity.email,
      emailVerified: true,
      projectId
    }
  };
}

export function resetHqCertificateCacheForTests() {
  cache = { expiresAt: 0, certificates: null };
}
