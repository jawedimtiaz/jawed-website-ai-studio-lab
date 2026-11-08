# Studio HQ Approvals and QA API (Hardened Specification)

## Overview
Studio HQ Approvals and QA APIs provide owner-protected delivery control, scope sign-offs, and quality assurance checkpoints for projects tracked in the canonical Studio HQ database (`jawed-studio-hq`).

---

## 1. Endpoints

### 1.1 Approval Routes
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/hq/projects/:id/approvals` | List all approval requests for a project | Owner (Bearer Token) |
| `POST` | `/api/hq/projects/:id/approvals` | Create an approval request for a project | Owner (Bearer Token) |
| `PATCH` | `/api/hq/approvals/:id` | Decide a pending approval request (`approved`, `rejected`, `withdrawn`) | Owner (Bearer Token) |

* **Approval Types:** `scope`, `design`, `content`, `qa`, `production-release`, `handover`, `other`.
* **Approval Decisions:** `approved`, `rejected`, `withdrawn`.
* **State Transition:** Approvals can only be decided once when in `'pending'` status. Repeated decision attempts return `409 APPROVAL_ALREADY_DECIDED`.

### 1.2 QA Routes
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/hq/projects/:id/qa` | List QA checks for a project | Owner (Bearer Token) |
| `POST` | `/api/hq/projects/:id/qa` | Create a QA check item for a project | Owner (Bearer Token) |
| `PATCH` | `/api/hq/qa/:id` | Update QA check result, notes, or evidence URL | Owner (Bearer Token) |

* **QA Categories:** `functionality`, `responsive`, `accessibility`, `seo`, `performance`, `security`, `browser`, `content`, `backup`, `other`.
* **QA Results:** `not-run`, `pass`, `fail`, `blocked`, `not-applicable`.
* **Auditing:** Marking a test as `pass`, `fail`, or `blocked` automatically stamps `checked_by` with the verified owner UID and records `checked_at`.

---

## 2. Security Architecture

### 2.1 Elimination of `ownerUpsertStatement()`
* The legacy `ownerUpsertStatement()` performed `INSERT INTO hq_users ... ON CONFLICT(uid) DO UPDATE SET status = 'active'`. This created an unacceptable vulnerability: an un-enrolled user could automatically provision an account, or a disabled owner could silently reactivate their account whenever any write occurred.
* In this hardened implementation, `ownerUpsertStatement()` is completely eliminated.

### 2.2 Transaction-Time Owner Status Guard (`ownerAuthorizationGuardStatement`)
* Every mutating operation (`createApproval`, `decideApproval`, `createQaCheck`, `updateQaCheck`) executes inside an atomic Cloudflare D1 batch (`db.batch([...])`).
* The **first statement** in the batch is `ownerAuthorizationGuardStatement(db, identity)`:
  ```sql
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM hq_users
      WHERE uid = ? AND lower(email) = ? AND status = 'active'
    ) THEN 1
    ELSE json('invalid-owner-authorization')
  END
  ```
* If the owner is not pre-enrolled or is marked `status = 'disabled'`, SQLite evaluates `json('invalid-owner-authorization')`, triggering a fatal `ERR_SQLITE_ERROR: malformed JSON`.
* D1 rolls back the entire batch atomically. Neither the approval/QA record nor the audit log is committed.
* Disabled owner accounts are **never reactivated**.

### 2.3 Bounded Request Streaming
* All incoming JSON bodies are parsed using `readHqJson(request, 16384)`, which bounds request payload streams to a maximum of 16 KB. Payloads exceeding this limit are aborted early with `413 PAYLOAD_TOO_LARGE`.

### 2.4 Same-Origin Enforcement
* Request-time checks via `authorizeHqOwner(request, env)` enforce same-origin semantics (`sec-fetch-site` and `origin` matching). Cross-origin callers are denied with `403 ORIGIN_NOT_ALLOWED`.

### 2.5 Defense-in-Depth Authentication
* JWT tokens are verified using `jose` against Google's live X.509 public certificates (`CERT_URL`).
* Tokens are validated for RS256 algorithm, project ID (`refined-actor-skhlb`), audience, issuer, expiration, not-before, auth-time, verified email, and inclusion in the hard-coded owner allowlist (`jawedimtiaz@gmail.com`, `jawed@jawed.co.in`).

### 2.6 Audit Transaction Consistency & Zero-Row Update Protection
* Mutating endpoints that perform conditional updates (`decideApproval` where `status = 'pending'`, and `updateQaCheck` where `id = ?`) use `conditionalAuditStatement()`.
* The audit log statement is structured with a conditional clause:
  ```sql
  INSERT INTO audit_logs (...)
  SELECT ?, ?, ...
  WHERE changes() = 1
  ```
* If a concurrent modification or deletion causes the preceding `UPDATE` to modify 0 rows, SQLite evaluates `changes() = 0`. The audit insert selects 0 rows and inserts nothing.
* This guarantees that audit log records are strictly committed only when the business update actually succeeds, eliminating phantom audit log creation and ensuring HTTP 409 / 404 responses leave the audit trail untouched.

---

## 3. Database Schema Alignment
* Target Database: Dedicated Cloudflare D1 `jawed-studio-hq` (`d9ec83ea-7114-4179-af8e-a22ba5494508`).
* Relies on the canonical 17-table schema defined in `migrations/hq/0001_studio_hq_schema.sql`.
* Tables used:
  - `approvals`: Foreign keys to `projects(id)` and `hq_users(uid)` with `ON DELETE RESTRICT`.
  - `qa_checks`: Foreign key to `projects(id)` and `hq_users(uid)` with `ON DELETE RESTRICT`.
  - `audit_logs`: Append-only audit table protected by SQLite triggers against update and delete.

---

## 4. Test Coverage
Comprehensive automated test suites cover all security and functional boundaries:
* Contract validation: Field allowlists, URL safety, enum checks.
* End-to-end lifecycle: Creating, listing, and deciding approvals; creating, listing, and updating QA checks; verifying append-only audit entries.
* Security negative paths:
  - Disabled owner creating approval -> transaction roll back, 0 records created, status remains disabled.
  - Disabled owner deciding approval -> transaction roll back, status remains pending, 0 audit logs created.
  - Disabled owner creating QA check -> transaction roll back, 0 records created.
  - Disabled owner updating QA check -> transaction roll back, result unchanged.
  - Un-enrolled owner mutation -> fails closed, 0 rows in `hq_users`, 0 records created.
  - Missing database binding -> fails closed with HTTP 503 `HQ_DATABASE_UNAVAILABLE`.
  - Worker route dispatch -> trailing slash normalization and 401 unauthenticated challenge verification.

---

## 5. Known Limitations
1. Customer Approval Link: Customer-facing public review links or email token portals are not implemented; decisions are currently owner-only.
2. Automated Evidence: Evidence URLs are stored as strings pointing to external resources (e.g., GitHub PR, screenshot URL); file asset binary upload is not integrated into this endpoint.
3. Deployment Binding: Deployment gate enforcement (e.g. blocking deployment if QA fails) is currently an operational process, not hard-wired to external CI webhooks.

---

## 6. Remaining Deployment Prerequisites
1. Dedicated D1 binding (`HQ_DB`) must be active on the deployed Cloudflare Worker.
2. Initial owner record (`uid`, `email`, `status = 'active'`) must be pre-enrolled via D1 admin console/CLI before the owner signs in for the first time.
3. Preview Worker deployment verification on `jawed-studio-hq-preview` prior to production routing.
