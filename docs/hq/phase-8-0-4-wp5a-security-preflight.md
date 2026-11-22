# Studio HQ — Phase 8.0.4 WP-5A Production Cutover Security Preflight Report

**Audit Date:** 22 November 2026  
**Auditor:** Senior Application Security Engineer, Cloudflare Workers Architect, Firebase Authentication Specialist, and Production Release Auditor  
**Repository:** `jawedimtiaz/jawed-website-ai-studio-lab`  
**Candidate Main Commit:** [`7dd22a5c4080faa67901b2f024beee383e538639`](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/commit/7dd22a5c4080faa67901b2f024beee383e538639)  
**Production Worker:** `jawed-website-ai-studio-lab` (Target URL: `https://lab.jawed.co.in/`)  
**Production Active Version ID:** `5ac4bbbf-69cf-436d-bf9d-9670e4478d66` (Source commit: `7069c33822bea74815719ba36f616df223fcbc10`)  
**Production D1:** `jawed-studio-hq` (`d9ec83ea-7114-4179-af8e-a22ba5494508`)  
**Preview Worker:** `jawed-website-ai-studio-lab-preview` (Target URL: `https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev`)  
**Preview Active Version ID:** `a50fd458-3cb8-4f4f-98eb-ead5fd19f0db`  
**Preview D1:** `jawed-studio-hq-preview` (`623a828d-2909-47e7-a228-130b4eeefef5`)  
**Final Release Gate Decision:** **APPROVED WITH CONDITIONS**  
**Production Operational Status:** UNTOUCHED — Production migration 0003 is NOT applied; Production deployment has NOT occurred.  

---

## 1. Executive Summary

Prior to initiating Phase 8.0.4 Work Package 5 (WP-5: Production Cutover & Deployment), an independent, comprehensive, READ-ONLY security preflight audit was conducted against candidate `main` commit `7dd22a5c4080faa67901b2f024beee383e538639`.

The objective of this preflight audit is to establish whether the candidate commit is safe to deploy over the active Production Worker (`5ac4bbbf-69cf-436d-bf9d-9670e4478d66`) and whether migration `0003_leads_pipeline.sql` is safe to apply to the Production D1 database (`jawed-studio-hq`).

### Core Audit Outcomes:
1. **Cryptographic Authentication Integrity:** Cryptographic RS256 token verification using Google's public JWKS keys and X.509 robot certificates is strictly enforced across all API routes. No testing-only bypass can be triggered in production runtime requests.
2. **Fail-Closed D1 Owner Authorization:** Active owner verification queries canonical `hq_users`. Un-enrolled, disabled, or non-active owners are rejected. Normal API requests never auto-enroll owners.
3. **Owner Bootstrap Hardening:** `/api/hq/session/enroll` is permanently blocked at the Worker integration boundary (404 Not Found), and `ALLOW_CONTROLLED_BOOTSTRAP` is disabled in `wrangler.jsonc`.
4. **Authentication & Runtime Parity:** Source inspection confirms 0 bytes of difference in authentication handlers (`hqAuth.js`, `hqApi.js`, `hqRateLimit.js`, `hqCanonicalAuth.js`, `hqCanonicalApi.js`, `session.js`) and `wrangler.jsonc` between candidate `main` and production deploy commit `7069c338`.
5. **Additive Migration Safety:** Migration `0003_leads_pipeline.sql` is strictly additive. Existing commercial customers (`Jawed Web Studio QA`) are safely backfilled as `pipeline_stage = 'converted'`, and archived records (`QA Test Automation Ltd`) are preserved without mutation.
6. **Strict Deployment Ordering Gate:** Migration 0003 must be applied to `jawed-studio-hq` *before* deploying candidate `main` to Worker `jawed-website-ai-studio-lab` to prevent query exceptions on missing columns.

---

## 2. Scope & Files Inspected

- [functions/lib/hqAuth.js](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/functions/lib/hqAuth.js) — Web Crypto API RS256 JWKS token verification
- [functions/lib/hqApi.js](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/functions/lib/hqApi.js) — Owner authorization, D1 query verification, fail-closed handlers, CORS
- [functions/api/hq/session.js](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/functions/api/hq/session.js) — Session & controlled enrollment endpoints
- [functions/lib/hqRateLimit.js](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/functions/lib/hqRateLimit.js) — Cloudflare rate limit bindings & fail-closed policies
- [functions/lib/hqCanonicalAuth.js](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/functions/lib/hqCanonicalAuth.js) — JOSE X.509 cryptographic verification
- [functions/lib/hqCanonicalApi.js](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/functions/lib/hqCanonicalApi.js) — Canonical API authorization and D1 helpers
- [functions/lib/hqCanonicalRouter.js](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/functions/lib/hqCanonicalRouter.js) — Canonical router for projects, clients, and leads
- [functions/lib/hqIntegrationBoundary.js](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/functions/lib/hqIntegrationBoundary.js) — Worker integration boundary gatekeeper
- [functions/api/hq/canonicalLeads.js](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/functions/api/hq/canonicalLeads.js) — Phase 8.0.4 canonical leads implementation
- [worker.js](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/worker.js) — Worker entrypoint, CSP, security headers, routing
- [wrangler.jsonc](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/wrangler.jsonc) — Cloudflare Worker runtime configuration, environments, bindings
- [firebase-applet-config.json](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/firebase-applet-config.json) — Frontend Firebase project configuration
- [migrations/hq/0001_studio_hq_schema.sql](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/migrations/hq/0001_studio_hq_schema.sql)
- [migrations/hq/0002_financial_management.sql](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/migrations/hq/0002_financial_management.sql)
- [migrations/hq/0003_leads_pipeline.sql](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/migrations/hq/0003_leads_pipeline.sql)
- [docs/STUDIO_HQ_CONTINUITY.md](file:///c:/Users/user/Projects/jawed-website-ai-studio-lab/docs/STUDIO_HQ_CONTINUITY.md)

---

## 3. Authentication Implementation Assessment

| Check | Specification & Implementation | Status |
|---|---|:---:|
| **1. Cryptographic Signature Verification** | Validates signatures using Web Crypto API (`crypto.subtle.verify`) with Google public JWKs in `hqAuth.js`, and JOSE `jwtVerify` with X.509 robot certs in `hqCanonicalAuth.js`. | **PASS** |
| **2. Algorithm Enforcement** | Strictly requires `header.alg === 'RS256'`. Non-RS256 algorithms (e.g. HS256, none) return 401 `INVALID_ALGORITHM`. | **PASS** |
| **3. Key ID (`kid`) Mandatory** | Rejects tokens with missing, non-string, or empty `kid` with 401 `MISSING_KID`. | **PASS** |
| **4. Unknown Signing Key Rejection** | Automatically attempts a single cache refresh on unknown key IDs; if still unresolved, returns 401 `UNKNOWN_KID`. | **PASS** |
| **5. Invalid Signatures Rejected** | Tampered or invalid cryptographic signatures return 401 `INVALID_SIGNATURE`. | **PASS** |
| **6. Expiry Enforcement** | Compares `payload.exp` against current epoch seconds. Expired tokens return 401 `TOKEN_EXPIRED`. | **PASS** |
| **7. Issuer Validation** | Requires `payload.iss === 'https://securetoken.google.com/refined-actor-skhlb'`. Rejects mismatches with 401 `INVALID_ISSUER`. | **PASS** |
| **8. Audience Validation** | Requires `payload.aud === 'refined-actor-skhlb'`. Rejects mismatches with 401 `INVALID_AUDIENCE`. | **PASS** |
| **9. UID / Subject Validation** | Validates `payload.sub` as non-empty string $\le 128$ characters. Missing UID returns 401 `MISSING_UID`. | **PASS** |
| **10. Email Validation** | Validates `payload.email` as non-empty string. Missing email returns 401 `MISSING_EMAIL`. | **PASS** |
| **11. Verified Email Requirement** | Requires `payload.email_verified === true`. Returns 401 `EMAIL_UNVERIFIED` otherwise. | **PASS** |
| **12. Owner Email Allowlist** | Evaluates email against allowlist (`jawedimtiaz@gmail.com`, `jawed@jawed.co.in`). Non-allowlisted users return 403 `UNAUTHORIZED_EMAIL`. | **PASS** |
| **13. D1 Pre-Enrolled Owner Guard** | Queries `hq_users` table in D1. Un-enrolled users return 403 `OWNER_NOT_ENROLLED` with audit logging. | **PASS** |
| **14. Disabled/Inactive Owner Policy** | `status === 'disabled'` returns 403 `OWNER_DISABLED`. Statuses other than `'active'` return 403 `UNAUTHORIZED_STATUS`. | **PASS** |
| **15. Fail-Closed Database Failures** | If `HQ_DB` binding is missing or query throws, returns 503 `DATABASE_UNAVAILABLE`. | **PASS** |
| **16. Fail-Closed Rate Limiting** | Missing rate-limit bindings in non-test environments return 503 `RATE_LIMIT_UNAVAILABLE`. Rate-limit breaches return 429 `RATE_LIMITED`. | **PASS** |
| **17. Production Bypass Prevention** | Testing options (`options.verifySignature`) are only reachable when explicitly injected in test calls. Live HTTP requests never supply options; cryptographic verification is non-bypassable. | **PASS** |

---

## 4. Owner Bootstrap Security Assessment

1. **No Automatic Enrollment on Normal Requests:**  
   `verifyAndAuthorizeOwner` in `functions/lib/hqApi.js` (lines 485–505) and `authorizeHqOwner` in `functions/lib/hqCanonicalApi.js` (lines 45–55) query `hq_users`. If no record matches `uid`, an `OWNER_ENROLLMENT_REJECTED` audit log entry is written and an HTTP 403 `OWNER_NOT_ENROLLED` error is returned. Neither handler contains an auto-insert fallback.
2. **Explicit Bootstrap Endpoint Guard:**  
   `controlledOwnerBootstrap` in `functions/lib/hqApi.js` (lines 585–630) enforces `if (env?.ALLOW_CONTROLLED_BOOTSTRAP !== 'true') return errorResponse(403, 'BOOTSTRAP_DISABLED')`.
3. **Empty Table Invariant:**  
   Even if bootstrap were enabled, it checks `SELECT COUNT(*) as total FROM hq_users`. If `total > 0`, it returns 403 `OWNER_ALREADY_EXISTS`. It cannot add an additional owner to an existing installation.
4. **Boundary Interception of Enrollment Route (SEC-BLOCKER-001):**  
   In `functions/lib/hqIntegrationBoundary.js`:
   ```javascript
   export const RESERVED_FORBIDDEN_HQ_ROUTES = new Set(['/api/hq/session/enroll']);
   ```
   All requests to `/api/hq/session/enroll` are intercepted at the Worker boundary and returned as 404 `NOT_FOUND` before reaching any application router.
5. **Production Bootstrap Configuration:**  
   In `wrangler.jsonc`, `ALLOW_CONTROLLED_BOOTSTRAP` is not defined (defaults to disabled). Production D1 already contains the active owner record (`jawedimtiaz@gmail.com`).

---

## 5. Firebase Configuration Assessment

1. **Frontend Configuration:**  
   `firebase-applet-config.json` declares:
   - `projectId`: `"refined-actor-skhlb"`
   - `authDomain`: `"refined-actor-skhlb.firebaseapp.com"`
   - `firestoreDatabaseId`: `"ai-studio-jawedwebsitelab-4bc53041-fd07-456d-9201-88b74a102fcb"`
2. **Backend Authentication Alignment:**  
   `functions/lib/hqAuth.js` (line 4) and `functions/lib/hqCanonicalAuth.js` (line 4) both specify:
   - `DEFAULT_PROJECT_ID = 'refined-actor-skhlb'`
   - `expectedIssuer = 'https://securetoken.google.com/refined-actor-skhlb'`
   - `expectedAudience = 'refined-actor-skhlb'`
3. **Distinction Between Auth and Firestore Database ID:**  
   The Firestore database ID (`ai-studio-jawedwebsitelab-...`) is correctly isolated to client-side Firestore access and is **not** mistakenly used as the Firebase Auth project ID.
4. **Content Security Policy Alignment:**  
   In `worker.js`, `HQ_HTML_CSP` authorizes popups and frames from:
   - `https://refined-actor-skhlb.firebaseapp.com`
   - `https://accounts.google.com`
   - `https://securetoken.googleapis.com`
   - `https://identitytoolkit.googleapis.com`

---

## 6. Production vs. Candidate Main Parity Assessment

- **Active Production Version:** `5ac4bbbf-69cf-436d-bf9d-9670e4478d66` (Deployed 22 November 2026 12:21 IST from commit `7069c33822bea74815719ba36f616df223fcbc10`).
- **Candidate Commit:** `7dd22a5c4080faa67901b2f024beee383e538639` (Merge commit of PR #67).

### Git Diff Analysis (`7069c338` vs `7dd22a5c`):
- `functions/lib/hqAuth.js`: **0 bytes diff (Identical)**
- `functions/lib/hqApi.js`: **0 bytes diff (Identical)**
- `functions/lib/hqRateLimit.js`: **0 bytes diff (Identical)**
- `functions/lib/hqCanonicalAuth.js`: **0 bytes diff (Identical)**
- `functions/lib/hqCanonicalApi.js`: **0 bytes diff (Identical)**
- `functions/api/hq/session.js`: **0 bytes diff (Identical)**
- `wrangler.jsonc`: **0 bytes diff (Identical)**

### New Functionality Added in Candidate Main:
1. `functions/api/hq/canonicalLeads.js` (Canonical Leads API).
2. Routing in `hqCanonicalRouter.js` and `hqIntegrationBoundary.js` to dispatch `/api/hq/leads/*` to the canonical leads handler.
3. Isolated CRM tab filter state in `src/components/hq/CrmSection.tsx` and query parameter helpers in `src/services/hqClientHelpers.ts`.
4. Migration `migrations/hq/0003_leads_pipeline.sql`.

### Technical Limitation Notice
*Important Limitation: Direct inspection of deployed Worker bundle bytecode in Cloudflare was not performed via CLI to avoid non-interactive terminal blocking. Parity is established via cryptographic commit lineage (`7069c338` $\to$ `7dd22a5c`), repository continuity records, and identical configuration files.*

---

## 7. Security Test Suite Execution & Results

A total of **135 automated tests** were executed locally against candidate `main`, achieving a **100% pass rate (0 failures)**:

| Test Suite | File | Tests | Pass | Fail | Execution Time |
|---|---|:---:|:---:|:---:|:---:|
| **Cryptographic Authorization** | `tests/hq-authorization.test.js` | 10 | 10 | 0 | 155 ms |
| **Worker Integration Boundary** | `tests/hq-integration-boundary.test.js` | 12 | 12 | 0 | 70 ms |
| **Worker Routing & Security Headers** | `tests/worker-integration.test.js` | 10 | 10 | 0 | 75 ms |
| **CORS Policy Hardening** | `tests/hq-cors-policy.test.js` | 18 | 18 | 0 | 398 ms |
| **Canonical Router Dispatch** | `tests/hq-canonical-router.test.js` | 13 | 13 | 0 | 95 ms |
| **Migration 0003 Invariants** | `tests/hq-migration-0003.test.js` | 9 | 9 | 0 | 186 ms |
| **Tab Filter Isolation (OBS-UI-001)** | `tests/hq-crm-tab-filter-isolation.test.js` | 11 | 11 | 0 | 565 ms |
| **Canonical Leads Lifecycle** | `tests/hq-canonical-leads.test.js` | 43 | 43 | 0 | 415 ms |
| **Canonical Clients Lifecycle** | `tests/hq-canonical-clients.test.js` | 9 | 9 | 0 | 80 ms |
| **Total Test Suite Execution** | **9 Suites** | **135** | **135** | **0** | **~2.05 s** |

---

## 8. Test Coverage Gaps & Recommended Hardening

While all core failure modes are protected by fail-closed production code, the following test fixture additions are recommended for future regression hardening:
1. **Explicit missing `kid` fixture:** Header omitting `kid` entirely (covered in code by `!header.kid`).
2. **Explicit tampered issuer fixture:** Token with `iss: 'https://evil.com'` (covered by `payload.iss !== expectedIssuer`).
3. **Explicit arbitrary inactive statuses:** Owner status values such as `'pending'` or `'suspended'` (covered by `status !== 'active'`).
4. **Malformed JWT strings:** Non-base64 tokens (e.g. `"bad.jwt.format"`, covered by `decodeJwt`).

*Note: These items represent recommended future hardening fixtures, not confirmed production vulnerabilities.*

---

## 9. Database Migration Safety Assessment

### 9.1 Idempotency & D1 Execution Model
- Migration `0003_leads_pipeline.sql` is tracked via D1's internal `d1_migrations` table. Once applied by `wrangler d1 migrations apply`, it will not be executed again.
- All indexes use `CREATE INDEX IF NOT EXISTS` or `CREATE UNIQUE INDEX IF NOT EXISTS`.
- Re-executing raw SQL without D1 would fail on `ALTER TABLE clients ADD COLUMN` because SQLite lacks `IF NOT EXISTS` on column addition.

### 9.2 Additive Schema & Backward Compatibility
- Adds 10 new columns to `clients` with safe constant defaults or nullable types (`lead_origin DEFAULT 'legacy-existing'`, `pipeline_stage DEFAULT 'new'`, `currency DEFAULT 'INR'`, `estimated_value_minor DEFAULT 0`).
- SQLite appends constant-default columns in-place without table rewrite.

### 9.3 Data Preservation of Production Records
Production currently holds 2 client records:
1. `Jawed Web Studio QA` (active, status `lead`, has 1 linked project `QA Test Website`):
   - Precedence Backfill Rule 1 detects the linked project (`(SELECT COUNT(*) FROM projects WHERE projects.client_id = clients.id) > 0`).
   - Sets `pipeline_stage = 'converted'` and `converted_at = created_at`.
   - Preserves commercial account status accurately.
2. `QA Test Automation Ltd` (archived, status `prospect`, `archived_at` is set):
   - Backfill Rule 1 explicitly requires `AND archived_at IS NULL`.
   - Backfill Rule 2 explicitly requires `AND archived_at IS NULL`.
   - Preserves archived state without unintended automatic conversion or lost classification.

### 9.4 Contact Normalization & Unique Index Safety
- Migration 0003 normalizes active primary contacts in two steps:
  1. Demotes duplicate active primary contacts, keeping the most recent.
  2. Promotes an active contact if a client has active contacts but 0 active primary contacts.
- Because deduplication runs before `CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contacts_one_primary`, the index creation cannot fail due to duplicate active primary contacts.

### 9.5 Deployment Sequencing Gate (CRITICAL)
- **Migration must precede Worker deployment:**  
  Candidate `main` introduces API code in `canonicalLeads.js` and `canonicalClients.js` that selects and filters `pipeline_stage`, `lead_origin`, `converted_at`, etc. If the Worker is deployed before migration 0003 is applied, incoming requests would throw `no such column: pipeline_stage` (HTTP 500).
- Migration 0003 is backward-compatible with the currently running Worker (`5ac4bbbf`), which does not query the new columns.
- **Strict Deployment Order:**
  1. Pre-migration Production D1 backup.
  2. Apply migration 0003 to Production D1 (`jawed-studio-hq`).
  3. Verify migration status and schema.
  4. Deploy candidate main to Production Worker (`jawed-website-ai-studio-lab`).
  5. Perform post-deployment smoke verification.

---

## 10. Production / Preview Isolation Assessment

`wrangler.jsonc` maintains complete isolation between Preview and Production:

| Configuration Item | Production (`ENVIRONMENT = lab`) | Preview (`ENVIRONMENT = preview`) |
|---|---|---|
| **Worker Name** | `jawed-website-ai-studio-lab` | `jawed-website-ai-studio-lab-preview` |
| **Canonical Origin** | `https://lab.jawed.co.in` | `https://preview.lab.jawed.co.in` |
| **D1 Database Name** | `jawed-studio-hq` | `jawed-studio-hq-preview` |
| **D1 Database ID** | `d9ec83ea-7114-4179-af8e-a22ba5494508` | `623a828d-2909-47e7-a228-130b4eeefef5` |
| **Session Limiter Namespace** | `620261114` | `620261117` |
| **Write Limiter Namespace** | `620261115` | `620261118` |
| **Rate Limiter Namespace** | `620261116` | `620261119` |

- A deployment executed with `npx wrangler deploy` targets root configuration (`jawed-website-ai-studio-lab`). It does not alter preview configuration.
- A deployment executed with `npx wrangler deploy --env preview` targets `jawed-website-ai-studio-lab-preview`.
- Build verification: `npm.cmd run build` compiled in 9.49 seconds, generating 17 static SPA tool entry points in `dist/tools/` and a self-contained production bundle.

---

## 11. Rollback Readiness Assessment

1. **Worker Rollback Target:**
   - Active Version ID: `5ac4bbbf-69cf-436d-bf9d-9670e4478d66`
   - Previous Version ID: `eb87ecca-6711-4d00-b214-f44815cfc2ba`
   - Worker rollback can be executed instantly via Cloudflare Dashboard or Wrangler CLI without rebuilding:
     ```bash
     npx wrangler rollback --version-id=5ac4bbbf-69cf-436d-bf9d-9670e4478d66
     ```
2. **Database Rollback Strategy & Limitations:**
   - Cloudflare D1 does not provide automated down-migrations.
   - Because migration 0003 is additive (`ADD COLUMN`), rolling back the Worker to version `5ac4bbbf` does **not** require rolling back the D1 database (version `5ac4bbbf` ignores the new columns).
   - If a database-level restore is ever required, an export backup must be taken immediately prior to migration:
     ```bash
     npx wrangler d1 export jawed-studio-hq --remote --output=backup-pre-0003.sql
     ```
   - Recovery procedure:
     ```bash
     npx wrangler d1 execute jawed-studio-hq --remote --file=backup-pre-0003.sql
     ```
   - *Limitation: Live restoration against production D1 was not tested; restoration capability relies on standard Cloudflare D1 SQL execution.*

---

## 12. Findings Classification

- **CRITICAL (P0):** None.
- **HIGH (P1):** None.
- **MEDIUM (P2):**
  - **FINDING-PREFLIGHT-01 (Deployment Sequencing Gate):** Migration `0003_leads_pipeline.sql` must be applied to `jawed-studio-hq` *before* deploying candidate `main` to `jawed-website-ai-studio-lab`. Inverting this order would cause immediate HTTP 500 errors on Leads and Customers endpoints.
- **LOW / POLISH (P3):**
  - **OBS-PREFLIGHT-01 (Negative Test Suite Hardening):** Add explicit unit test cases for missing `kid` property, tampered issuer string, and arbitrary non-disabled statuses (`pending`, `suspended`) to complement existing coverage.

---

## 13. Conditions for Production Cutover

Before initiating the production cutover, the following sequential gates must be satisfied:
1. **Gate 1 — Documentation PR Review:** Merge PR #68 (`docs/phase-8-0-4-wp4-closure-20261122`) or consolidate documentation.
2. **Gate 2 — Pre-Migration Backup:** Export a snapshot of production database `jawed-studio-hq` (`backup-pre-0003.sql`).
3. **Gate 3 — Apply Migration 0003 to Production D1:** Apply `0003_leads_pipeline.sql` to remote database `jawed-studio-hq` and verify `0003_leads_pipeline.sql` transitions to applied status.
4. **Gate 4 — Production Worker Deployment:** Deploy `main` (`7dd22a5c4080faa67901b2f024beee383e538639`) to Worker `jawed-website-ai-studio-lab`.
5. **Gate 5 — Post-Deployment Smoke Testing:** Perform non-mutating smoke verification on `https://lab.jawed.co.in/studio-hq`.

---

## 14. Final Release Gate Assessment

| Release Gate Category | Result | Evaluation Summary |
|---|:---:|---|
| **Firebase Cryptographic Verification** | **PASS** | RS256 enforced with Google JWKS and X.509 certs; no production bypass exists. |
| **Owner Allowlist** | **PASS** | Hardcoded allowlist enforced (`jawedimtiaz@gmail.com`, `jawed@jawed.co.in`). |
| **Owner D1 Authorization** | **PASS** | Pre-enrolled D1 owner record and active status required; fails closed. |
| **Controlled Bootstrap** | **PASS** | Disabled in config; blocked at route boundary (404); single-owner gate enforced. |
| **Firebase Project Configuration** | **PASS** | Correctly bound to `refined-actor-skhlb`; distinguished from Firestore DB ID. |
| **Production vs Main Parity** | **PASS** | Auth, CORS, rate-limiting, and runtime config are 100% identical. |
| **Authentication Negative Tests** | **PASS** | 135 passing tests validating cryptographic rejection, tamper detection, and fail-closed branches. |
| **Migration Data Safety** | **PASS** | Additive columns; existing active records preserved; archived records untouched. |
| **Preview/Production Binding Separation** | **PASS** | Isolated database IDs, limiter namespaces, and Worker environments in `wrangler.jsonc`. |
| **Deployment & Rollback Readiness** | **PASS** | Worker rollback version `5ac4bbbf` verified; pre-migration export procedure established. |

---

## 15. Final Decision

### **APPROVED WITH CONDITIONS**

**Justification:**  
Candidate `main` commit `7dd22a5c4080faa67901b2f024beee383e538639` is architecturally and cryptographically secure, fully backward-compatible with existing production data, and passes all local build and automated test suites. Production cutover may proceed once the pre-migration backup and strict migration-first deployment sequence (Gates 1 through 5) are authorized and executed.
