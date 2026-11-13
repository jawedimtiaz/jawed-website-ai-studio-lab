import { importX509, jwtVerify } from 'jose';

const PROJECT_ID = 'refined-actor-skhlb';
const ISSUER = 'https://securetoken.google.com/' + PROJECT_ID;
const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const OWNERS = new Set(['jawedimtiaz@gmail.com', 'jawed@jawed.co.in']);
let cache = { expiresAt: 0, certificates: null };

function denied(status, code) {
  return { ok: false, status, code };
}

function expiryFrom(response, now) {
  const value = response.headers.get('cache-control') || '';
  const match = value.match(/(?:^|,)\s*max-age=(\d+)/i);
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
  )) throw new Error('CERTIFICATE_RESPONSE_INVALID');
  cache = { certificates: Object.fromEntries(entries), expiresAt: expiryFrom(response, now) };
  return cache.certificates;
}

export async function verifyHqFirebaseToken(token, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now ?? Date.now();
  const verify = options.verify || jwtVerify;
  const importCertificate = options.importCertificate || importX509;

  if (typeof token !== 'string' || token.length < 20 || token.length > 10000) {
    return denied(401, 'AUTH_TOKEN_MISSING_OR_MALFORMED');
  }

  let verificationStage = 'token-header';
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

    verificationStage = 'certificate-fetch';
    let certificates = await loadCertificates(fetchImpl, now);
    let certificate = certificates[header.kid];
    if (!certificate) {
      cache.expiresAt = 0;
      certificates = await loadCertificates(fetchImpl, now);
      certificate = certificates[header.kid];
    }
    if (!certificate) return denied(401, 'AUTH_SIGNING_KEY_NOT_FOUND');

    verificationStage = 'certificate-key-import';
    const key = await importCertificate(certificate, 'RS256');
    verificationStage = 'jwt-signature-and-claims';
    const result = await verify(token, key, {
      algorithms: ['RS256'],
      audience: PROJECT_ID,
      issuer: ISSUER,
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
    ) return denied(401, 'AUTH_CLAIMS_INVALID');

    const email = claims.email.trim().toLowerCase();
    if (!OWNERS.has(email)) return denied(403, 'HQ_OWNER_ACCESS_DENIED');
    return { ok: true, identity: { uid: claims.sub, email } };
  } catch {
    const diagnosticCode = verificationStage === 'certificate-fetch' ? 'AUTH_CERTIFICATE_FETCH_FAILED'
      : verificationStage === 'certificate-key-import' ? 'AUTH_CERTIFICATE_KEY_IMPORT_FAILED'
        : verificationStage === 'jwt-signature-and-claims' ? 'AUTH_JWT_VERIFICATION_FAILED'
          : 'AUTH_TOKEN_VERIFICATION_FAILED';
    return denied(401, diagnosticCode);
  }
}

export function resetHqCertificateCacheForTests() {
  cache = { expiresAt: 0, certificates: null };
}
