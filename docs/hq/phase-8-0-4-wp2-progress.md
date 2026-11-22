# Phase 8.0.4 WP-2 — Canonical Leads API Progress Log

**Updated:** 2026-11-22  
**Repository:** `jawedimtiaz/jawed-website-ai-studio-lab`  
**Branch:** `feat/phase-8-0-4-wp2-canonical-leads` (Merged into `main` via PR #66)  
**Status:** COMPLETED / MERGED (PR #66) — Preview D1 Migration Applied & Verified

## Baseline and scope

WP-1 schema work was merged previously. WP-2 implements the canonical Leads API on the existing `clients` table, preserving compatibility with the CRM UI. It does not introduce a separate leads table.

## Commits recorded on the feature branch

| Commit | Change |
|---|---|
| `c78ff486087e9c9cd2d7e8278f1c61fb2240c0d5` | Canonical leads design |
| `559d57f3b8f22c2aaab487a6a2ba3902694e44e5` | CRM frontend compatibility audit |
| `80377647e75e004716114e3a0a3e9ec30c087efa` | WP-2 decisions |
| `ca721e472a4ce433a82e085b972c2c483c3ad6b6` | Normalize canonical lead API errors |
| `cab31889b58267e0fb86de4e4f6f8becd7b68564` | Frontend edit uses canonical detail endpoint |
| `7314646c2d41c547be75877f7d85a095336335c4` | Canonical leads route tests |
| `7f8e2cf15a67b950fa3ac3358bf12fb0170d33ca` | Lost lead reason required in UI |
| `6274db8f03267a22114265bc5838d77edbeeb514` | Validate conversion payload |
| `65a1e76c8559f7aa54760ddd49f29cb7f81e4723` | Conditional project creation during conversion |
| `40cda7774fc51fd609bebe112a60da248371a993` | Boundary regression test for canonical leads |
| `10210fe83d4864c56a108cc88c6f2016c8298e4f` | Report conversion conflicts from batch result |
| `fccfc501a7fc7cde69984348b4b1c9241d4089e3` | Create primary contact atomically with inbound lead |
| `d0bc8449622d99723ec0872fcb1b0b57173b2a26` | Update WP-2 progress and contact sync |

## Defects Discovered & Remediation

1. **Syntax error in `functions/api/hq/canonicalLeads.js`:**
   - *Defect:* A literal `\n` broke JS module parsing at line 27.
   - *Remediation:* Cleanly refactored the file with proper multiline JS statements and exports (`validateLead`, `handleAuthorizedHqLeads`, `handleHqLeads`).
2. **Empty segment route matcher failure:**
   - *Defect:* `matchCanonicalLeadRoute('/api/hq/leads//archive')` returned `LEAD_NOT_FOUND` instead of `NOT_FOUND`.
   - *Remediation:* Added empty segment check `if (segments.some(s => !s)) return { matched: true, error: 'NOT_FOUND', status: 404 };` to `functions/lib/hqCanonicalRouter.js`.
3. **Database source constraint mismatch:**
   - *Defect:* Frontend sent `source: 'Website Enquiry'`, which failed against `clients.source` schema CHECK constraint `CHECK (source IN ('direct-client','referral','partner','inbound','outbound','repeat','other'))`.
   - *Remediation:* Added `normalizeSource()` helper to map incoming source strings to schema CHECK values (`Website Enquiry` -> `inbound`).
4. **List filtering and stage query semantics:**
   - *Defect:* `stage='All'` or `stage='all'` was filtering out converted and lost leads; default view was not explicitly excluding terminal stages.
   - *Remediation:* In `functions/api/hq/canonicalLeads.js`, `stage='all'` now explicitly omits terminal-stage exclusion to return all stages. Default view explicitly sets `pipeline_stage NOT IN ('converted', 'lost')`. `archivedOnly=true` and `stage=Archived` properly filter `archived_at IS NOT NULL`.
5. **Primary contact synchronization on lead updates:**
   - *Defect:* Updating `contact_name`, `email`, or `phone` on a lead PATCH only updated the `clients` table, leaving `client_contacts` unsynchronized.
   - *Remediation:* Added atomic update to `client_contacts` for the primary contact in the same D1 batch.
6. **Lost reason requirement and metadata clearing on reopen:**
   - *Defect:* Transitioning to `lost` did not strictly enforce a non-empty `lost_reason`, and reopening a lost lead did not clear `lost_at` and `lost_reason` to `NULL`.
   - *Remediation:* Enforced `LOST_REASON_REQUIRED` when marking as `lost`. Reopening clears `lost_at = NULL` and `lost_reason = NULL`.
7. **Converted lead editing protection:**
   - *Defect:* PATCH on an already converted lead was previously allowed.
   - *Remediation:* Returns `409 LEAD_ALREADY_CONVERTED`.
8. **Frontend CRM leads archive/restore vs legacy delete:**
   - *Defect:* `CrmSection.tsx` was calling legacy `DELETE /api/hq/leads?id=...`.
   - *Remediation:* Replaced legacy delete with canonical archive/restore toggle (`POST /api/hq/leads/:id/archive` and `restore`). Added `LEAD_FILTER_STAGES` with `Archived` filter option.
9. **TypeScript `lost_reason` and lead type properties missing:**
   - *Defect:* `src/types/hq.ts` did not declare `lost_reason`, `archived_at`, `pipeline_stage`, `canonical_status`, `converted_at`, `lost_at`, causing `tsc --noEmit` error TS2339.
   - *Remediation:* Updated `HqLead` interface in `src/types/hq.ts`.
10. **Integration Boundary & Worker Integration Test Targets:**
    - *Defect:* `tests/hq-integration-boundary.test.js` and `tests/worker-integration.test.js` used `/api/hq/leads` as their example of an approved legacy route. Now that `/api/hq/leads` is canonical, it reaches the canonical dispatcher rather than the legacy router.
    - *Remediation:* Updated approved legacy route tests to target `/api/hq/overview`, and added explicit tests verifying canonical leads routes reach the canonical dispatcher and enforce auth.
11. **Lead Update Audit Statement Sequencing:**
    - *Defect:* `conditionalAuditStatement` in `update()` was pushed to `batch` after the `client_contacts` UPDATE, causing `changes() = 1` to inspect contact rows rather than the client record update.
    - *Remediation:* Positioned `conditionalAuditStatement` immediately following the `clients` UPDATE in the D1 batch. Added regression test asserting audit logging when contact details remain unchanged.
12. **Archive / Restore Idempotency & Changed Flag:**
    - *Defect:* Archive and restore returned `{ success: true, id, archived }` without indicating whether the record state actually changed.
    - *Remediation:* Inspected D1 batch result (`results?.[1]?.meta?.changes === 1`) and added `changed: true` on state change vs `changed: false` on idempotent repeats. Added regression tests verifying 404 on nonexistent records, 401 unauthenticated guard, and audit record suppression on redundant calls.
13. **Primary Contact Fallback on Lead Update:**
    - *Defect:* Updating contact details on a lead that lacked an active primary contact only executed an `UPDATE` on `client_contacts` matching 0 rows, silently failing to synchronize contact details.
    - *Remediation:* Added atomic, concurrency-safe fallback insert `INSERT INTO client_contacts (...) SELECT ... WHERE NOT EXISTS (...)` in the same D1 batch. Added regression test verifying contact creation and single-primary preservation.
14. **Project Code Entropy on Conversion:**
    - *Defect:* Project code derived 8 hex characters (`PRJ-[0-9A-F]{8}`) from `projectId`.
    - *Remediation:* Increased entropy to 12 hex characters (`PRJ-[0-9A-F]{12}`), expanding collision resistance to ~2.81e14 combinations while maintaining deterministic generation from `projectId`.
15. **Conversion Concurrency & Terminal Predicate Guard (PR #66 Review):**
    - *Defect:* `UPDATE clients` predicate only excluded `pipeline_stage <> 'converted'`. A concurrent transition to `lost` between initial lookup and batch execution could have permitted conversion.
    - *Remediation:* Changed UPDATE predicate to `WHERE id = ? AND pipeline_stage NOT IN ('converted', 'lost') AND archived_at IS NULL`. Added post-batch inspection returning 409 `LOST_LEAD_CANNOT_CONVERT` if concurrently marked lost, or 409 `LEAD_ALREADY_CONVERTED`. Added simulated concurrency regression tests.
16. **Duplicate Advisory Match Classification (PR #66 Review):**
    - *Defect:* `match_type` ternary evaluated `r.phone === phone`, which evaluated to `true` when both phone values were `null`, incorrectly classifying business-name matches as phone matches.
    - *Remediation:* Refactored to explicitly check non-empty matching: `Boolean(email && r.email && r.email.toLowerCase() === email.toLowerCase())` for email, `Boolean(phone && r.phone && r.phone === phone)` for phone, falling back to `business_name`. Added regression tests for all 4 match variations.

## Verification & QA Evidence

- **TypeScript Compilation:**
  - `npm.cmd run lint` (`tsc --noEmit`): PASSED (0 errors).
- **Production Build:**
  - `npm.cmd run build`: PASSED (Built in 9.37s, 17 SPA tool entry points generated, dist/ prepared).
- **Targeted WP-2 Tests:**
  - `node --test tests/hq-canonical-leads.test.js`: 43/43 tests PASSED (+5 targeted remediation tests).
  - `node --test tests/hq-canonical-leads-router.test.js`: 5/5 tests PASSED.
  - `node --test tests/hq-integration-boundary.test.js`: 12/12 tests PASSED.
  - `node --test tests/hq-migration-0003.test.js`: 9/9 tests PASSED.
  - `node --test tests/worker-integration.test.js`: 12/12 tests PASSED.
- **CRM Regression Suites:**
  - `tests/hq-crm-clients-regression.test.js` (14/14 tests PASSED)
  - `tests/hq-crm-financial-foundation.test.js` (21/21 tests PASSED)
  - `tests/hq-project-details-regression.test.js` (14/14 tests PASSED)
  - `tests/hq-overview-invoices.test.js` (5/5 tests PASSED)
  - `tests/hq-canonical-clients.test.js` (8/8 tests PASSED)
  - `tests/hq-canonical-projects.test.js` (7/7 tests PASSED)
- **Core Suite Total:**
  - Total: 150/150 tests PASSED (0 failures, duration 2.25s).
- **Broader Suite (19 test files):**
  - Total: 281/281 tests PASSED (0 failures, 0 regressions).
  - Note on `tests/studio-hq-api.test.js`: Diagnosed as legacy Phase 3Y tests querying old pre-canonical endpoint expecting non-canonical column names (`name` instead of `full_name` in `client_contacts`); not part of WP-2, left unmodified per safety rules.

## PR Readiness Assessment & Merge Record

- **PR #66:** Created, reviewed, and merged into `main` at commit `6684682197b345ebd4216d0ea8158b7d0e3e57e4`.
- **Review Remediations Completed:**
  1. Handled conversion race condition terminal state exclusion in `functions/api/hq/canonicalLeads.js`.
  2. Fixed duplicate advisory phone/null match classification.
  3. All 150 core tests and 281 broader suite tests verified passing.

## Post-Merge & Preview Lifecycle Progression

1. **Preview D1 Migration Applied (WP-2 Step 2):**
   - Migration `migrations/hq/0003_leads_pipeline.sql` applied to remote Preview database `jawed-studio-hq-preview` (Database ID: `623a828d-2909-47e7-a228-130b4eeefef5`).
   - Schema validation confirmed: `pipeline_stage` check constraints, `converted_at`, `lost_at`, `lost_reason` columns active.
2. **Initial Preview Worker Deployment (WP-2 Step 3):**
   - Deployed commit `66846821` to `jawed-website-ai-studio-lab-preview` (Version ID: `b199901e-fd7d-4487-9948-ee0ac5a627a7`).
3. **Defect OBS-UI-001 Discovered & Remediated (PR #67):**
   - *Observation:* Navigating from Leads tab (with filter `status=Converted`) to Customers tab leaked `status=Converted` to `/api/hq/clients`, causing transient HTTP 400 `STATUS_INVALID` toasts.
   - *Fix:* PR #67 isolated CRM filter states (`leadStatusFilter`, `clientStatusFilter`, `followUpStatusFilter`), added query sanitizers/builders, and mapped display values to canonical stage slugs (`Proposal Sent` → `proposal-sent`).
   - *Merge:* PR #67 merged to `main` at commit `7dd22a5c4080faa67901b2f024beee383e538639`.
4. **WP-3 Preview Deployment:**
   - Deployed commit `7dd22a5c` to `jawed-website-ai-studio-lab-preview` (Version ID: `a50fd458-3cb8-4f4f-98eb-ead5fd19f0db`).
5. **WP-4 CRM Regression Verification:**
   - Executed 9-scenario browser regression suite against Preview environment (`https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev/studio-hq`).
   - **Result:** 9/9 PASS. Zero HTTP 400 errors, zero UI toasts, zero console exceptions. Defect OBS-UI-001 closed.
   - Formal record: See [Phase 8.0.4 WP-4 QA Acceptance Record](phase-8-0-4-wp4-acceptance.md).
6. **WP-5A Production Cutover Security Preflight Audit:**
   - Completed comprehensive, READ-ONLY preflight audit of authentication, bootstrap controls, Firebase config, parity, test coverage, migration safety, and environment isolation.
   - 135/135 security tests verified passing locally.
   - **Verdict:** APPROVED WITH CONDITIONS.
   - Formal record: See [Phase 8.0.4 WP-5A Security Preflight Report](phase-8-0-4-wp5a-security-preflight.md).
7. **WP-5B Production Migration Preparation & Backup Readiness Review:**
   - Completed comprehensive, READ-ONLY assessment of backup capability, migration 0003 safety, pre/post-migration queries, rollback plan, and sequential release checklist.
   - Verified GitHub automatic deployments disabled; verified environment isolation.
   - Formulated non-destructive backup commands (PROPOSED — NOT EXECUTED).
   - **Verdict:** READY WITH CONDITIONS.
   - Formal record: See [Phase 8.0.4 WP-5B Production Readiness Report](phase-8-0-4-wp5b-production-readiness.md).
8. **WP-5C Production D1 Backup Execution & Integrity Verification:**
   - Captured Time Travel baseline bookmark: `00000073-00000000-0000512b-e5e8c4f8ff638d5877932d998632a5c1`.
   - Executed logical SQL export of `jawed-studio-hq` (`d9ec83ea-7114-4179-af8e-a22ba5494508`) to local secure storage outside Git.
   - File: `jawed-studio-hq-pre-0003-20261122-232627.sql` (32,167 bytes, SHA-256: `1D74EF2F99DFEA2000EDF0BFF4266C89204303D10BB2AF5AA91B58141B410BA9`).
   - Verified all 24 tables + sequence; verified migration 0003 strictly pending; replayed against in-memory SQLite with 0 syntax or constraint errors.
   - **Verdict:** COMPLETED / PASS / RECORDED.
   - Formal record: See [Phase 8.0.4 WP-5C Production Backup Record](phase-8-0-4-wp5c-production-backup-record.md).
9. **WP-5D Production D1 Migration 0003 Application & Verification:**
   - Preflight backup checksum and size verified.
   - Applied migration `0003_leads_pipeline.sql` to remote Production D1 database `jawed-studio-hq` (`d9ec83ea-7114-4179-af8e-a22ba5494508`).
   - 19 SQL commands executed in 6.81ms; status ✅.
   - Verified in `d1_migrations`: 1, 2, and 3 present; 0 migrations pending.
   - Verified 10 new columns and 4 new indexes in schema; verified 0 FK violations and quick_check ok.
   - Verified baseline counts intact (3 clients, 2 converted, 1 new archived; 0 contacts; 1 project; 1 milestone; 1 task; 0 invoices).
   - Verified regression tests: `npm run lint` (0 errors), `tests/hq-migration-0003.test.js` (9/9 pass), `tests/hq-canonical-leads.test.js` (43/43 pass).
   - Production Worker version `5ac4bbbf` remains unchanged (deployment not performed); Preview environment untouched.
   - **Verdict:** COMPLETED / PASS / VERIFIED.
   - Formal record: See [Phase 8.0.4 WP-5D Production Migration Record](phase-8-0-4-wp5d-production-migration-record.md).
10. **Phase 8.0.4 WP-5 Work Package Stage Progression:**
    - **WP-5A (Security Preflight):** COMPLETED / APPROVED WITH CONDITIONS.
    - **WP-5B (Migration Prep & Backup Readiness):** COMPLETED / READY WITH CONDITIONS.
    - **WP-5C (Production D1 Backup Execution):** COMPLETED / PASS / VERIFIED.
    - **WP-5D (Production D1 Migration 0003 Execution):** **COMPLETED / PASS / VERIFIED**.
    - **WP-5E (Production Worker Deployment & Smoke Verification):** **NEXT / BLOCKED** pending explicit owner approval.
