# Studio HQ Firebase authentication boundary

## Scope
Studio HQ uses the Lab site's existing Firebase app for Google sign-in, but its owner authorization is independent of the existing technician role and Firestore rules.

The browser sends its Firebase ID token as a Bearer token to `POST /api/hq/session`. The Worker verifies the token and returns only a minimal owner identity. The endpoint does not expose D1 or any business data.

## Required verification
- RS256 only, with a key ID resolved against Google's Firebase X.509 certificate endpoint.
- Cryptographic signature verification using the certificate.
- Audience: `refined-actor-skhlb`.
- Issuer: `https://securetoken.google.com/refined-actor-skhlb`.
- Valid future expiration, non-future issued-at and auth-time, non-empty Firebase UID, and verified email.
- Exact owner allowlist after trimming and lowercasing: `jawedimtiaz@gmail.com` and `jawed@jawed.co.in`.
- Fail closed for malformed tokens, unknown keys, certificate errors, and invalid claims.

## Certificate cache
The verifier honors Google's response `Cache-Control: max-age`, capped at one hour, and refreshes once when the token key ID is not in the cached certificate set. Certificate fetch or parsing failures deny the request.

## Endpoint protections
- Same-origin request check; no wildcard CORS.
- Bearer token required; no identity or role accepted from request body.
- Private/no-store response headers.
- Only POST and OPTIONS are accepted.
- Worker route is separate from existing AI and contact routes.

## Browser and service-worker isolation
- `/studio-hq/` has its own page and does not render the public Lab header, footer, AI widget, or PWA install prompt.
- Service worker bypasses the HQ route and all API requests; private pages are not stored in navigation or offline caches.
- Existing technician authentication context, Firestore rules, public Lab pages, and contact/AI APIs are not intentionally changed.

## Revocation limitation
This implementation does not perform Firebase token revocation checks. Firebase ID token signature and claim verification alone do not establish that a token has not been revoked. Before storing or accessing sensitive HQ records, choose and implement a revocation/session strategy and document its tradeoffs.

## Not yet implemented
- D1 database or binding.
- CRM, projects, finance, assets, QA, or audit modules.
- Rate limiting and durable security audit events.
- Browser end-to-end tests against a deployed Worker.
- Cloudflare deployment or production changes.

## Deployment boundary
This work remains on `feat/studio-hq-firebase-auth`. No D1 database, Cloudflare settings, secrets, or deployment are changed by this branch work.
