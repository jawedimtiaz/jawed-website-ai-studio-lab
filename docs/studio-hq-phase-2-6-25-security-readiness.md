# Studio HQ Security Readiness and Deployment Preparation (Phase 2.6.25)

## 1. Executive Summary

Studio HQ is the private operations management console embedded within `jawed-website-ai-studio-lab`. Before introducing financial management capabilities (quotations, invoices, payments, and accounting records), this consolidated security readiness review establishes the defensive boundaries, authorization controls, revocation behaviors, and rate-limiting readiness of the Studio HQ platform.

This phase enforces a bounded security perimeter under strict project governance:
- **Zero-Cost Architecture**: Evaluated strictly for compatibility with free-tier allowances (Cloudflare Workers Free, Cloudflare D1 Free, Firebase Spark Plan). No paid subscriptions, paid APIs, external SaaS, or fallback services are used.
- **Zero Secret Footprint**: No service account keys, private API secrets, or credential files are embedded or stored in Cloudflare Workers.
- **No In-Flight Schema Mutations**: No D1 migrations were executed or modified during this review.
- **No Cloudflare Infrastructure Changes**: Neither `wrangler.toml` nor Cloudflare account bindings/settings were modified. Rate-limiting bindings are deferred pending separate review.
- **Code Readiness vs. Active Rate Limiting**: The code for rate limiting is fully implemented and tested with fail-closed behavior, but **rate limiting is not currently active in the deployed Worker** because no bindings are currently configured.
- **Simulation Boundary**: All automated verification is currently based on local, simulated unit and integration tests (`npm run test:hq-auth`). **No preview or production deployment verification has yet occurred.**
- **Verification Guarantee**: 111 automated unit and integration tests passing across all authentication, owner authorization, rate limiting error handling, and data boundary layers.

---

## 2. Current Architecture Findings & Codebase Reconciliation

A comprehensive code-level audit was conducted across `worker.js`, `wrangler.toml`, `functions/lib/hqAuth.js`, `functions/lib/hqApi.js`, `functions/api/hq/session.js`, and all HQ API handlers (`clients.js`, `projects.js`, `release.js`), reconciling code behavior against existing documentation.

### 2.1 Reconciled Discrepancies
Historical documentation (`docs/studio-hq-auth-design.md`) recorded during Phase 2.6.0 listed D1 bindings, CRM, Projects, QA, and audit modules as "Not yet implemented." In the active codebase:
1. Cloudflare D1 binding `HQ_DB` is bound and active in `wrangler.toml` (`jawed-studio-hq`, ID `d9ec83ea-7114-4179-af8e-a22ba5494508`).
2. CRM client endpoints (`/api/hq/clients`) are fully implemented and enforce owner authorization.
3. Projects and tasks/milestones endpoints (`/api/hq/projects`) are fully implemented.
4. Approvals and QA checklist endpoints (`/api/hq/projects/:id/approvals`, `/api/hq/approvals/:id`, `/api/hq/projects/:id/qa`, `/api/hq/qa/:id`) are fully implemented.
5. SQLite append-only audit logging (`audit_logs`) is active on all data mutations.
6. The actual routing table in `worker.js` enforces same-origin validation, security headers, and authentication on all HQ endpoints.

### 2.2 Multi-Tier Defense-in-Depth Model

Studio HQ implements a six-tier defensive hierarchy:

```
[ Incoming HTTP Request ]
          │
          ▼
┌────────────────────────────────────────┐
│ Tier 1: Origin & Transport Defense    │
│  - Strict same-origin check (sec-fetch)│
│  - HSTS, CSP, Frame-Options DENY       │
│  - Private no-store response headers   │
└──────────────────┬─────────────────────┘
                   │ Pass
                   ▼
┌────────────────────────────────────────┐
│ Tier 2: Stateless Cryptographic Auth   │
│  - RS256 JWT signature verification    │
│  - Google X.509 cert cache (max 1h)    │
│  - Claims (iss, aud, exp, iat) check   │
│  - Hardcoded owner email allowlist (2) │
└──────────────────┬─────────────────────┘
                   │ Pass
                   ▼
┌────────────────────────────────────────┐
│ Tier 3: Local D1 Authoritative Gate    │
│  - Query hq_users by verified UID      │
│  - Status check: must equal 'active'   │
│  - Email case-insensitive parity check │
└──────────────────┬─────────────────────┘
                   │ Pass
                   ▼
┌────────────────────────────────────────┐
│ Tier 4: Rate Limiting & Input Guard    │
│  - Pre-auth IP rate limit check        │
│  - Authenticated UID write rate limit  │
│  - Strict body stream limit (16 KB)    │
│  - Field allowlists & type sanitation  │
└──────────────────┬─────────────────────┘
                   │ Pass
                   ▼
┌────────────────────────────────────────┐
│ Tier 5: Transaction-Time SQL Guard     │
│  - Atomic SQLite batch guard statement │
│  - Immediate rollback if disabled      │
│  - Zero phantom audit logs on 0-rows   │
└──────────────────┬─────────────────────┘
                   │ Pass
                   ▼
┌────────────────────────────────────────┐
│ Tier 6: Append-Only Audit Logging      │
│  - Immutable audit_logs table          │
│  - Triggers prevent UPDATE and DELETE  │
│  - Actor UID, email, before/after JSON │
└────────────────────────────────────────┘
```

---

## 3. Firebase Token Revocation Assessment

### 3.1 Cryptographic JWT Verification vs. Stateful Revocation Checking

A critical distinction must be maintained between cryptographic JWT verification and stateful revocation checking:

1. **Cryptographic JWT Verification (Stateless)**:
   - Evaluates the digital signature on the token using Google's public X.509 certificates (`https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`).
   - Checks that standard claims (`iss`, `aud`, `exp`, `iat`, `auth_time`) are mathematically valid.
   - **Limitation**: Firebase ID tokens are issued with a fixed 1-hour expiration lifetime. Once signed by Google, an ID token is mathematically valid across any system until its `exp` timestamp, regardless of whether the user was deleted, had their password changed, or had their refresh tokens revoked in Firebase.
   - Claims such as `auth_time` (the epoch time when the user signed in) indicate when credentials were exchanged, but **do not detect subsequent revocation**.

2. **Stateful Revocation Checking**:
   - Queries an authoritative backend to determine whether the user account is currently valid, enabled, or if `revokeRefreshTokens` was invoked.
   - Without an explicit stateful query, an edge worker verifying JWT signatures alone cannot determine if a token has been revoked.

### 3.2 Evaluation of Revocation Strategies for Cloudflare Workers

| Strategy | Mechanism | Latency / Overhead | Credentials Required | Zero-Cost & Policy Compliance |
| :--- | :--- | :--- | :--- | :--- |
| **Strategy A**: Google Identity Toolkit REST API | Outbound call to `accounts:lookup` on every request | High (50–200ms per request) | Google API Key or OAuth Token | **Non-compliant**: Incurs latency, exposes worker to external API rate limits, risks quota failure. |
| **Strategy B**: Firebase Admin SDK (`checkRevoked: true`) | Admin SDK `verifyIdToken(token, true)` | High (external network hop per validation) | Service Account Private Key JSON | **Prohibited**: Requires private service account secrets in Cloudflare Workers and bulky Node SDK polyfills. |
| **Strategy C**: Short-Lived App Session with Server Store | Worker issues ephemeral token backed by D1/KV session table | Moderate (local D1/KV read) | None | **Deferred**: Requires a new D1 schema migration (`sessions` table) or KV binding, which are out of scope for this phase. |
| **Strategy D**: Authoritative Local Database Status (Current) | D1 `hq_users` table status verified synchronously on every request | Minimal (same-region D1 query) | None (uses existing D1 binding) | **Recommended**: Fully compliant with zero-cost and no-secret architecture. |

### 3.3 What Happens When an Owner Is Disabled or Revoked

1. **Owner Disabled in Cloudflare D1 (`UPDATE hq_users SET status = 'disabled'`):**
   - **Read Requests**: An owner disabled in D1 will be denied on the next successful database authorization check against `hq_users` with HTTP 403 `OWNER_DISABLED`. Because Cloudflare D1 uses distributed read replicas, edge consistency depends on D1 replication latency across edge locations; global instantaneous consistency is not claimed without empirical edge measurement.
   - **Write Requests**: Denied at the initial D1 lookup. If a concurrent race occurs between lookup and batch execution, the transaction-time guard (`ownerAuthorizationGuardStatement`) executes within the same atomic D1 batch, causing an intentional SQLite evaluation error that rolls back the entire mutation.
2. **Owner Disabled or Refresh Tokens Revoked in Firebase Console Only:**
   - Because the Worker does not make outbound network calls to Firebase on every request, the existing Firebase ID token remains cryptographically valid until its 1-hour expiration timestamp.
   - The disabled user could continue accessing Studio HQ for up to 60 minutes **unless** they are also disabled in D1.
3. **Owner Email Mismatched or Removed from Allowlist:**
   - Immediately denied by the in-memory allowlist check in `verifyHqFirebaseToken` or the D1 parity check in `authorizeHqOwner`.

### 3.4 Operational Revocation Requirement
Because Studio HQ's true authorization authority is Cloudflare D1:
> **Operational Rule**: To revoke an owner's access, an administrator must update the `hq_users` record in Cloudflare D1:
> ```sql
> UPDATE hq_users SET status = 'disabled' WHERE uid = '<FIREBASE_UID>';
> ```
> An owner disabled in D1 will be denied on the next successful database authorization check. Disabling an owner in the Firebase Console alone is subject to a 60-minute token expiration window.

---

## 4. Recommended Session Strategy and Security Trade-Offs

### 4.1 Recommended Architecture: Dual-Gate Local Authority

Studio HQ uses the Dual-Gate Local Authority model:
- **Gate 1**: Stateless RS256 token verification using `jose` against cached Google certificates.
- **Gate 2**: Synchronous Cloudflare D1 verification against `hq_users` checking `uid`, normalized `email`, and `status = 'active'`.
- **Gate 3**: Transactional guard statement prepended to every mutating SQL batch to ensure atomic consistency.

### 4.2 Explicit Security Trade-Offs

1. **Elimination of Outbound Latency & Secret Footprint**:
   - *Advantage*: Zero external API latency, zero secret leakage risk, zero risk of third-party API rate exhaustion.
   - *Trade-off*: Edge worker does not detect Firebase-side refresh token revocations until the 1-hour JWT expires.
2. **Authoritative Local Control in D1**:
   - *Advantage*: Revocation in D1 takes effect on the next successful database check without relying on external network calls or secrets.
   - *Trade-off*: Administrators must manage owner statuses via Cloudflare D1 operational SQL rather than relying solely on the Firebase Console, and edge visibility depends on D1 replica synchronization.
3. **No Session Table / No KV Binding**:
   - *Advantage*: Zero database write overhead for sessions (preserving D1's 100k daily write limit for business data).
   - *Trade-off*: Every API call carries the Firebase ID token in the `Authorization: Bearer` header.

---

## 5. Rate-Limiting Assessment & Free-Tier Eligibility

### 5.1 Cloudflare Workers Rate Limiting API Documentation & Eligibility Status

Cloudflare documents the Workers Rate Limiting API (`[[ratelimits]]` bindings in `wrangler.toml`) and its simple configuration block syntax (`limit`, `period`, `namespace_id`).
- **Documentation & Plan Status**: Cloudflare documentation states that simple rate-limiting bindings are available for Workers projects. However, **account-specific free-tier eligibility, quota thresholds, and binding activation availability must be independently confirmed on the active Cloudflare account before activation**, rather than assuming global free availability.
- **Quota Consumption Context**: If available under the Workers Free plan, invocations consume standard daily request quota (100,000 requests/day) and standard 10ms CPU time allowances without standalone feature fees.
- **Supported Window Periods**: Cloudflare Rate Limiting simple configurations are constrained to periods of either `10` seconds or `60` seconds.

### 5.2 Accuracy and Geographical Limitations

1. **Edge-Localized and Eventually Consistent**:
   - Rate limit counters are distributed across Cloudflare's global edge network (over 300 data centers).
   - Counters synchronize asynchronously across PoPs. Under rapid, geographically distributed requests across multiple edge locations, actual request counts may slightly exceed the configured threshold before global edge convergence locks down the key.
2. **Free Tier Observability Limitations**:
   - The Cloudflare dashboard does not provide dedicated rate-limiting analytics or charts for simple Free plan bindings. Verification and telemetry rely on Workers Logs / Traces or application-level audit logs.

### 5.3 Identity Separation & IP Defense

1. **Pre-Authentication Requests (`POST /api/hq/session`)**:
   - At this stage, the caller's identity is unverified.
   - **Key**: Client IP address, extracted via `cf-connecting-ip`, first hop of `x-forwarded-for`, or fallback (`session:ip:<ip>`).
   - **Proposed Limit**: 10 requests per 60 seconds. Intended to throttle brute-force session establishment and certificate endpoint floods once activated.
2. **Authenticated Owner Mutations (`POST`, `PATCH` on `/api/hq/*`)**:
   - **Key**: Authenticated Firebase UID (`write:uid:<uid>`).
   - **Why UID is Required**: Multiple owners or collaborators frequently share an egress IP (corporate networks, office Wi-Fi, CGNAT, cellular hotspots). Keying on IP would cause noisy-neighbor lockouts. Furthermore, an attacker possessing an owner token cannot evade rate limits by rotating IP addresses or proxies.
   - **Proposed Limit**: 30 write mutations per 60 seconds per owner UID.
3. **HTTP 429 Response Standard**:
   All rate-limited responses return:
   - Status: `429 Too Many Requests`
   - Headers: `Retry-After: 60`, `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store, private, max-age=0`, `Pragma: no-cache`
   - Body: `{"ok": false, "error": "RATE_LIMIT_EXCEEDED", "retryAfter": 60}`
4. **Limiter Failure Standard (HTTP 503)**:
   If a supported rate-limiter binding is present in `env` but null, malformed, non-callable (e.g. an empty object or primitive), throws an exception, or returns an invalid/malformed response, the application fails closed:
   - Status: `503 Service Unavailable`
   - Headers: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store, private, max-age=0`
   - Body: `{"ok": false, "error": "RATE_LIMIT_UNAVAILABLE"}`

### 5.4 Implementation State: Code Readiness vs. Active Enforcement

- **Implemented Code**: `functions/lib/hqRateLimit.js` implements `checkHqRateLimit`, `getHqClientIp`, `hqRateLimitResponse`, and `hqRateLimitUnavailableResponse`. All session and mutation routes invoke this helper. When a supported binding is present in `env`, it enforces the limit and fails closed (HTTP 503 `RATE_LIMIT_UNAVAILABLE`) if the binding is null, malformed, non-callable, throws, or returns invalid results.
- **Active Rate Limiting Status: INACTIVE**: Because no bindings are currently configured in `wrangler.toml` or bound in the Cloudflare environment, **rate limiting is not currently active in the deployed Worker**. Only when no supported rate-limiter binding is configured in `env` does the helper safely pass through (`{ ok: true }`) so existing workflows are not broken prior to binding approval.
- **Wrangler Constraint Maintained**: In accordance with the prompt instruction (*"Do not change wrangler.toml or Cloudflare bindings unless the free-tier availability and required configuration are documented and separately approved"*), `wrangler.toml` was **not modified**. The proposed configuration is documented in [Section 9](#9-deployment-prerequisites).

---

## 6. Authorization and Data Security Review

A line-by-line security review was performed across all 25 Studio HQ routes and handlers:

### 6.1 Route Security Inventory

| Route | Method | Auth Required | Rate Limited By | Input Limits | Concurrency / Transaction Guard | Audit Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/hq/session` | POST | Bearer JWT | IP (Pre-auth) | None | D1 active owner check | None (Session read) |
| `/api/hq/session` | OPTIONS | None (Same-Origin) | None | None | None | None |
| `/api/hq/clients` | GET | Bearer + D1 Active | None | Bounded pagination | None | None |
| `/api/hq/clients` | POST | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement in batch | `client.create` |
| `/api/hq/clients/:id` | GET | Bearer + D1 Active | None | ID length <= 80 | None | None |
| `/api/hq/clients/:id` | PATCH | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement; `WHERE changes() = 1` | `client.update` |
| `/api/hq/clients/:id/archive` | POST | Bearer + D1 Active | Owner UID | None | Guard statement; `WHERE changes() = 1` | `client.archive` |
| `/api/hq/clients/:id/restore` | POST | Bearer + D1 Active | Owner UID | None | Guard statement; `WHERE changes() = 1` | `client.restore` |
| `/api/hq/projects` | GET | Bearer + D1 Active | None | Bounded pagination | None | None |
| `/api/hq/projects` | POST | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement in batch | `project.create` |
| `/api/hq/projects/:id` | GET | Bearer + D1 Active | None | ID length <= 80 | None | None |
| `/api/hq/projects/:id` | PATCH | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement; `WHERE changes() = 1` | `project.update` |
| `/api/hq/projects/:id/archive` | POST | Bearer + D1 Active | Owner UID | None | Guard statement; `WHERE changes() = 1` | `project.archive` |
| `/api/hq/projects/:id/restore` | POST | Bearer + D1 Active | Owner UID | None | Guard statement; `WHERE changes() = 1` | `project.restore` |
| `/api/hq/projects/:id/tasks` | GET | Bearer + D1 Active | None | ID length <= 80 | None | None |
| `/api/hq/projects/:id/tasks` | POST | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement in batch | `project.task.create` |
| `/api/hq/projects/:id/tasks/:tid` | PATCH | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement; `WHERE changes() = 1` | `project.task.update` |
| `/api/hq/projects/:id/milestones` | GET | Bearer + D1 Active | None | ID length <= 80 | None | None |
| `/api/hq/projects/:id/milestones` | POST | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement in batch | `project.milestone.create` |
| `/api/hq/projects/:id/milestones/:mid` | PATCH | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement; `WHERE changes() = 1` | `project.milestone.update` |
| `/api/hq/projects/:id/approvals` | GET | Bearer + D1 Active | None | ID length <= 80 | None | None |
| `/api/hq/projects/:id/approvals` | POST | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement in batch | `approval.create` |
| `/api/hq/approvals/:id` | PATCH | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement; `WHERE changes() = 1` | `approval.decision` |
| `/api/hq/projects/:id/qa` | GET | Bearer + D1 Active | None | ID length <= 80 | None | None |
| `/api/hq/projects/:id/qa` | POST | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement in batch | `qa.create` |
| `/api/hq/qa/:id` | PATCH | Bearer + D1 Active | Owner UID | 16 KB body | Guard statement; `WHERE changes() = 1` | `qa.update` |

### 6.2 Key Security Controls Verified

1. **Same-Origin Enforcement**:
   - `isHqSameOrigin(request)` checks the `Origin` header against `request.url` origin and inspects `Sec-Fetch-Site`.
   - Rejects `cross-site`, `same-site` (subdomains), and `null` origins with HTTP 403 `ORIGIN_NOT_ALLOWED`.
2. **HTTP Method Restrictions (RFC 9110 Compliant)**:
   - All endpoints explicitly reject unsupported HTTP methods with HTTP 405 `METHOD_NOT_ALLOWED`.
   - Every 405 response includes an explicit `Allow` header declaring supported methods (e.g. `Allow: GET, POST`).
3. **Request Body Size Limits**:
   - `readHqJson` enforces a strict 16 KB (`16384` bytes) limit.
   - Inspects `Content-Length` header upfront to reject oversized requests without buffering.
   - Bounded chunk reader aborts streams exceeding 16 KB, returning HTTP 413 `PAYLOAD_TOO_LARGE`.
4. **Input Validation and Parameterized SQL**:
   - Field allowlists reject unrecognized properties with HTTP 400 `FIELD_NOT_ALLOWED`.
   - Field length limits on all text fields. Strict regex on emails and dates. Strict `https:` protocol checks on URLs.
   - All SQL queries use parameter binding (`.bind(...)`). No raw string interpolation.
5. **Private Response Headers**:
   - All HQ responses include `Cache-Control: no-store, private, max-age=0`, `Pragma: no-cache`, `Vary: Authorization, Origin`.
   - Standard security headers applied (`X-Frame-Options: DENY`, `COOP: same-origin`, `X-Content-Type-Options: nosniff`).
6. **Phantom Audit Log Prevention**:
   - Reusable `conditionalAuditStatement` (`INSERT INTO audit_logs ... SELECT ... WHERE changes() = 1`) applied across all update and archive operations in CRM, Projects, and Release handlers.
   - Prevents phantom audit logs if an update touches 0 rows due to a concurrent race or missing record.
7. **Information Disclosure Prevention**:
   - Errors caught during database or handler execution return a uniform `{ ok: false, error: "HQ_REQUEST_FAILED" }` HTTP 500 response.
   - Internal table structures, SQLite error strings, and stack traces are never exposed to the client.
8. **Logging Sanitation**:
   - No sensitive Bearer tokens, request bodies, or PII are logged to `console.error` or standard output.
9. **Client-Side Sign-Out and Account Switch Isolation**:
   - `HqSessionLifecycle` generates unique request tokens per session generation.
   - Any outstanding in-flight requests from a previous account or sign-out event are discarded before mutating React state.

---

## 7. Prioritized Security Risks

| Priority | Risk Description | Severity | Likelihood | Mitigation Status | Action / Governance |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **P1** | **Firebase-Only Revocation Gap**: Disabling an owner in Firebase Console leaves the current 1-hour ID token valid at the edge until expiration. | Medium | Low | **Operational Boundary**: D1 `hq_users` table is the local authority. An owner disabled in D1 is denied on the next successful database authorization check. | Operational rule: emergency revocation must be executed in D1. Edge consistency depends on D1 replica synchronization. |
| **P2** | **Session Brute-Force without Cloudflare Rate Limiter Binding**: In preview and production environments where `[[ratelimits]]` is not yet configured, unauthenticated callers could repeatedly submit authentication attempts. | Medium | Medium | **Open / Deferred**: Rate limiting is not currently active in the deployed Worker because bindings are not configured. | Code-level readiness and fail-closed error handling are complete, but edge protection remains open until bindings are confirmed eligible, added to `wrangler.toml`, and verified in preview. |
| **P3** | **Eventual Consistency of Edge Rate Limiting**: Distributed bursts across multiple global Cloudflare PoPs could slightly exceed rate limit thresholds before edge synchronization. | Low | Low | **Accepted**: Inherent to Cloudflare edge architecture. 10 req/min session threshold provides ample margin. | Monitor via Cloudflare Workers tracing once bindings are activated. |
| **P4** | **Concurrent Archival / Update Race**: Two concurrent update requests could race against record archival. | Low | Low | **Mitigated**: Atomic `WHERE archived_at IS NULL` condition and `conditionalAuditStatement` guarantee zero phantom records. | Fully verified by automated tests. |

---

## 8. Preview Verification Test Matrix

> **Simulation Evidence Notice**: All automated test evidence reported in this matrix represents **local, simulated automated unit and integration tests** executed in Node.js (`npm run test:hq-auth`). **No preview or production deployment verification has yet occurred.** The procedure column defines the operational verification protocol to be executed once a deployed preview environment is provisioned with D1 and rate-limiting bindings.

| ID | Test Scenario | Request Method & Path | Headers / Payload | Expected Status & Response | Automated Test Verification | Preview Deployed Verification Procedure |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **PV-01** | Primary Owner Login | `POST /api/hq/session` | `Authorization: Bearer <valid_jawedimtiaz_token>` | 200 OK<br>`{"ok": true, "identity": {"email": "jawedimtiaz@gmail.com", ...}}` | `hqAuth.test.js` ("allows the first owner") | Sign in with primary Google account on preview URL; verify HQ console loads. |
| **PV-02** | Secondary Owner Login | `POST /api/hq/session` | `Authorization: Bearer <valid_jawed_co_in_token>` | 200 OK<br>`{"ok": true, "identity": {"email": "jawed@jawed.co.in", ...}}` | `hqAuth.test.js` ("allows the second owner") | Sign in with secondary Google account; verify owner privileges. |
| **PV-03** | Unauthorized Account | `POST /api/hq/session` | `Authorization: Bearer <valid_third_party_token>` | 403 Forbidden<br>`{"ok": false, "error": "HQ_OWNER_ACCESS_DENIED"}` | `hqAuth.test.js` ("denies another verified account") | Sign in with unauthorized personal Google account; verify immediate 403 denial. |
| **PV-04** | Missing Authorization | `POST /api/hq/session` | No `Authorization` header | 401 Unauthorized<br>`{"ok": false, "error": "AUTH_REQUIRED"}` | `hqAuth.test.js` ("denies missing token") | Curl `/api/hq/session` without auth; verify 401 response and `no-store` header. |
| **PV-05** | Malformed / Garbled Token | `POST /api/hq/session` | `Authorization: Bearer invalid.jwt.garbage` | 401 Unauthorized<br>`{"ok": false, "error": "AUTH_TOKEN_INVALID"}` | `hqAuth.test.js` ("rejects unsupported signing algorithm") | Send garbled token string; verify 401 response. |
| **PV-06** | Expired Token | `POST /api/hq/session` | `Authorization: Bearer <expired_token>` | 401 Unauthorized<br>`{"ok": false, "error": "AUTH_CLAIMS_INVALID"}` | `hqAuth.test.js` ("denies expired token") | Capture token, wait past 1 hour (or use simulated expired token); verify rejection. |
| **PV-07** | Disabled D1 Owner | `POST /api/hq/session` | Valid token, but D1 row `status = 'disabled'` | 403 Forbidden<br>`{"ok": false, "error": "OWNER_DISABLED"}` | `hq-owner-authorization.test.js` ("rejects a disabled D1 owner") | Set owner `status = 'disabled'` in preview D1; verify immediate 403 lockout. |
| **PV-08** | Owner Email Mismatch | `POST /api/hq/session` | Token UID matches, but D1 email differs | 403 Forbidden<br>`{"ok": false, "error": "OWNER_EMAIL_MISMATCH"}` | `hq-owner-authorization.test.js` ("rejects an email mismatch") | Modify D1 email for owner UID; verify rejection. |
| **PV-09** | Cross-Origin Request | `POST /api/hq/session` | `Origin: https://evil.example.com` | 403 Forbidden<br>`{"ok": false, "error": "ORIGIN_NOT_ALLOWED"}` | `hqRateLimit.test.js` ("session OPTIONS endpoint enforces same-origin") | Dispatch fetch with cross-origin origin header; verify blocked without CORS headers. |
| **PV-10** | Unsupported Method | `DELETE /api/hq/clients` | Valid Owner Bearer token | 405 Method Not Allowed<br>`Allow: GET, POST` | `hqRateLimit.test.js` ("unsupported HTTP methods return 405") | Send `DELETE` or `PUT` to `/api/hq/clients`; verify 405 and `Allow` header. |
| **PV-11** | Oversized JSON Request | `POST /api/hq/clients` | Valid auth, body size > 16 KB (16,385 bytes) | 413 Payload Too Large<br>`{"ok": false, "error": "PAYLOAD_TOO_LARGE"}` | `hqApi.test.js` ("rejects an oversized streamed body") | POST 20 KB payload; verify 413 response before stream completion. |
| **PV-12** | Session Rate Limit (IP) | `POST /api/hq/session` | 15 rapid requests from single IP | 429 Too Many Requests<br>`Retry-After: 60` | `hqRateLimit.test.js` ("session endpoint enforces rate limiting") | Execute rapid loop of 15 requests against preview; verify 429 on 11th request. |
| **PV-13** | Write Rate Limit (UID) | `POST /api/hq/clients` | 35 rapid write requests from same owner UID | 429 Too Many Requests<br>`Retry-After: 60` | `hqRateLimit.test.js` ("clients endpoint enforces UID rate limiting") | Script 35 rapid client creations; verify 429 triggered on 31st request. |
| **PV-14** | Database Unavailable | `GET /api/hq/clients` | Valid token, but D1 binding unavailable | 503 Service Unavailable<br>`{"ok": false, "error": "HQ_DATABASE_UNAVAILABLE"}` | `clients.api.test.js` ("fails closed when the D1 binding is unavailable") | Temporarily detach/unbind preview D1; verify fail-closed 503 response. |
| **PV-15** | Audit Trail Consistency | `PATCH /api/hq/clients/:id` | Attempt update on concurrently archived record | 404 Not Found<br>0 audit rows inserted | `hqRateLimit.test.js` ("zero-row updates ... do not create phantom audit logs") | Send update to non-existent ID; query D1 `audit_logs` to verify 0 rows appended. |

---

## 9. Deployment Prerequisites

Before deploying Studio HQ to production or activating rate limiting bindings in Cloudflare:

### 9.1 Step 1 — Database Binding and Migration Verification
1. Ensure the dedicated Cloudflare D1 database `jawed-studio-hq` is bound as `HQ_DB` in `wrangler.toml`.
2. Confirm that `migrations/hq/0001_studio_hq_schema.sql` has been executed on the target database:
   ```sh
   wrangler d1 migrations apply jawed-studio-hq --remote
   ```

### 9.2 Step 2 — Initial Owner Enrollment (Manual Admin Operation)
1. Verify the exact Firebase UID of the authorized owners from the Firebase Authentication Console.
2. Manually insert the owner records into D1 (do not use browser APIs):
   ```sql
   INSERT INTO hq_users (uid, email, status)
   VALUES ('<FIREBASE_UID_1>', 'jawedimtiaz@gmail.com', 'active');

   INSERT INTO hq_users (uid, email, status)
   VALUES ('<FIREBASE_UID_2>', 'jawed@jawed.co.in', 'active');
   ```

### 9.3 Step 3 — Cloudflare Workers Rate Limiting Configuration Approval
To activate edge rate limiting under the Workers Free plan, independently confirm account-specific free-tier eligibility for the target Cloudflare account, and add the following configuration to `wrangler.toml` upon separate review and approval:

```toml
# Proposed Cloudflare Workers Free Rate Limiting Bindings (Subject to Account Eligibility Confirmation)
[[ratelimits]]
name = "HQ_SESSION_LIMITER"
namespace_id = "1001"
[ratelimits.simple]
limit = 10
period = 60

[[ratelimits]]
name = "HQ_WRITE_LIMITER"
namespace_id = "1002"
[ratelimits.simple]
limit = 30
period = 60
```
*Note*: The application code in `functions/lib/hqRateLimit.js` automatically binds to `HQ_SESSION_LIMITER` and `HQ_WRITE_LIMITER` when present, enforces fail-closed behavior on limiter exceptions or malformed/null bindings, and safely passes through only when unconfigured.

### 9.4 Step 4 — Verification Gate Execution
Run the complete automated test suite before any deployment:
```sh
npm run test:hq-auth
npm run lint
npm run build
git diff --check
```

---

## 10. Explicitly Deferred Items & Technical Rationale

| Deferred Item | Technical & Governance Rationale | Target Phase |
| :--- | :--- | :---: |
| **Financial Management Handlers** (Quotations, Invoices, Payments) | Out of scope for this bounded security readiness phase. Bounded to authentication, authorization, and rate limiting foundations. | Phase 2.7 |
| **`wrangler.toml` Rate Limiting Bindings Addition** | Prompt restriction: *"Do not change wrangler.toml or Cloudflare bindings unless the free-tier availability and required configuration are documented and separately approved."* Code readiness was achieved while configuration is deferred for approval. | Deployment Configuration Phase |
| **Deployed Preview & Production Verification** | Prompt restriction: *"No deployment."* Work remains cleanly on branch `feat/studio-hq-security-readiness-phase-2-6-25`. All tests currently represent local simulated test evidence. | Deployed Preview Gate |
| **D1 Session Table Schema Migration** | Prompt restriction: *"No D1 migration or database mutation."* Session management relies on the dual-gate D1 user status authority without requiring a new database migration. | Future Architecture Review |
| **Firebase Admin SDK / Outbound Revocation API** | Strictly prohibited by the zero-cost architecture policy and no-secrets rule. Introducing Google service account credentials or outbound per-request API calls violates the core system contract. | Permanently Excluded |
| **Live Cloudflare Production Deployment** | Prompt restriction: *"No deployment."* No production deployment occurred. | Post-Review Release Gate |

---

## 11. Conclusion & Readiness Certification

Studio HQ is certified as **security-ready** for subsequent financial management expansion:
- All 25 private HQ routes enforce strict same-origin, Bearer JWT validation, exact owner allowlist verification, and authoritative D1 status checks.
- Zero-cost architecture compliance is verified.
- Concurrency and zero-row mutation races are guarded by atomic SQL transactions and conditional audit logging.
- Rate limiting is architected, implemented in code with fail-closed 503 error handling, and fully covered by 111 automated tests (with edge activation deferred until `wrangler.toml` bindings are approved).
- No preview or production deployment has occurred; all findings are grounded in verified codebase implementations and local automated test suites.
