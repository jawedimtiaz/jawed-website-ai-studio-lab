# Studio HQ Firebase authentication boundary

## Scope
This is an isolated authentication foundation. It does not register Worker routes, initialize D1, change the existing technician authentication context, or change deployment configuration.

## Required verification
- RS256 only, with a key ID resolved against Google's Firebase X.509 certificate endpoint.
- Cryptographic signature verification using the certificate.
- Audience: refined-actor-skhlb.
- Issuer: https://securetoken.google.com/refined-actor-skhlb.
- Valid future expiration, non-future issued-at and auth-time, non-empty Firebase UID, and verified email.
- Exact owner allowlist after trimming and lowercasing: jawedimtiaz@gmail.com and jawed@jawed.co.in.
- Fail closed for malformed tokens, unknown keys, certificate errors, and invalid claims.

## Certificate cache
The verifier honors Google response Cache-Control max-age, capped at one hour, and refreshes once when the token key ID is not in the cached certificate set.

## Revocation limitation
This implementation does not perform Firebase token revocation checks. Firebase ID token signature and claim verification alone do not establish that a token has not been revoked. A later integration decision must document the revocation strategy.

## Isolation guarantees
- No Worker routing changes.
- No technician auth or Firestore rules changes.
- No D1 database or binding.
- No service-worker or CSP changes.
- No secrets or service-account credentials.
