# Phase 8.0.4 WP-2 — Canonical Leads API Progress Log

**Updated:** 2026-11-22  
**Repository:** `jawedimtiaz/jawed-website-ai-studio-lab`  
**Branch:** `feat/phase-8-0-4-wp2-canonical-leads`  
**Status:** In progress — implementation branch only; no PR, merge, deployment, or remote D1 migration.

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

## Implemented (source changes committed; not yet runtime-verified)

- Canonical route family: `/api/hq/leads`.
- Collection `GET` and `POST`; detail `GET` and `PATCH`.
- Lead actions: `archive`, `restore`, `convert`.
- List/search/pagination and stage filter.
- Lead creation uses `clients` with `lead_origin='inbound-lead'`, stage `new`, status `lead`.
- Allowlisted field validation; currency and minor-unit amount validation; follow-up date validation.
- Stage/status mapping.
- Lost stage requires a reason; UI field appears for Lost and is required.
- Editing lead uses canonical detail route.
- Conversion payload validates supported fields and types.
- Optional project creation is conditional on the conversion token being recorded by the lead update in the same D1 batch.
- Conversion checks batch result and reports conflict when update changes no rows.
- Canonical route matcher tests and integration-boundary isolation test added.
- Error responses standardized for selected API validation errors.

## Decisions recorded

- Existing `clients` table is the source of truth; no new leads table.
- Lead origin/stage are explicit fields.
- Dedicated conversion action only; converted status maps to active.
- Lost status maps to closed.
- Reopening Lost clears lost metadata.
- Conversion may optionally create a project.
- Archive is separate from pipeline stage.
- Duplicate detection is advisory; no automatic merge.
- Frontend compatibility response envelope is retained.

## Known issues / review items (not marked complete)

1. **Schema verification:** Confirm every column and constraint against the actual migration files, especially project insert columns. A schema file lookup attempted during review returned 404; this is not evidence of schema correctness.
2. **Primary contact:** Lead create currently writes contact fields to the clients row; verify whether contacts table synchronization is required and whether existing primary-contact rules must be followed.
3. **Lost reason clearing:** Inspect update SQL for stage transitions out of Lost and ensure `lost_reason` and `lost_at` are cleared consistently.
4. **Update/audit consistency:** Confirm update statements, audit conditionality, and returned row semantics under D1 batch behavior.
5. **Archive/restore:** Review idempotency, owner guard, audit behavior, and response status when no row changes.
6. **Conversion/project:** Verify schema, project-code uniqueness, project creation semantics, atomic batch behavior, and conflict handling. Test duplicate/retry requests.
7. **List filtering:** Validate stage/status mapping, pagination edge cases, and search SQL.
8. **Frontend:** Confirm Lost-reason form state/payload; converted-lead edit restrictions; archive/restore and conversion flows; legacy response compatibility.
9. **Security:** Re-review auth, origin handling, rate limiting, owner authorization guard, unknown-field rejection, and safe errors.
10. **Regression coverage:** Add handler-level tests for create/update/lost/reopen/archive/restore/convert, validation, auth, and D1 transaction results.

## Verification status

- Source reviewed through GitHub branch files.
- Commits listed above confirmed from the ongoing work.
- Tests were authored but **not executed** in this environment.
- No claim of runtime, browser, CI, or D1 test success.
- No PR opened yet.
- No merge or deployment.
- No remote D1 migrations or data changes.

## Next work

1. Inspect repository migration files and confirm schema.
2. Correct any SQL/schema mismatches.
3. Build focused handler tests and frontend contract tests.
4. Run the available test/lint/typecheck workflows where possible; record exact evidence.
5. Review branch diff and security boundaries.
6. Prepare a draft PR only after review and tests; user approval required before merge/deploy.
