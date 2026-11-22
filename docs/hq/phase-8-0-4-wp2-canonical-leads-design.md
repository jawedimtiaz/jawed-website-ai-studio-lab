# Phase 8.0.4 WP-2 — Canonical Leads API Design & Acceptance

Status: Draft implementation contract. No production changes, deployments, or D1 migrations authorized.

## Objective
Replace the legacy Leads endpoint behavior with a canonical API that uses the Phase 8.0.4 lead-pipeline fields on the existing `clients` table. Keep existing customer/project records and UUIDs intact. Canonical dispatch must prevent legacy fallthrough.

## Canonical record model
- Lead is a row in `clients`; no separate leads table.
- New leads use `lead_origin='inbound-lead'`, `pipeline_stage='new'`, `status='lead'`.
- Direct customer creation is not part of the Leads API unless explicitly defined in the approved contract.
- Existing records retain their UUIDs and origin classifications.
- Allowed origins: `inbound-lead`, `direct-customer`, `legacy-existing`.
- Allowed pipeline stages: `new`, `contacted`, `qualified`, `proposal-sent`, `converted`, `lost`.
- Currency is restricted by Migration 0003's currency registry.
- Estimated value is stored as non-negative integer minor units; never accept floating-point money.

## API surface proposal
- `GET /api/hq/leads`: paginated/filterable active lead records, query, origin, stage, follow-up, total.
- `POST /api/hq/leads`: validate and create an inbound lead; reject unknown fields; include duplicate advisory matches but do not silently merge.
- `GET /api/hq/leads/:id`: lead detail.
- `PATCH /api/hq/leads/:id`: bounded updates to allowed lead fields; stage changes validated; audit before/after.
- `POST /api/hq/leads/:id/archive` and `/restore`: explicit archive lifecycle; archive state is not a pipeline stage.
- `POST /api/hq/leads/:id/convert`: atomic conversion to a client/customer, preserving the existing client UUID; optionally create a project in the same transaction/batch if supported by the approved contract.
- Converted/lost records remain queryable with explicit filters; archived records are excluded by default.

## Conversion invariants
- Conversion is idempotent and guarded against repeat conversion.
- Conversion uses existing client ID; never duplicate the client.
- Pipeline stage and canonical client status must be consistent.
- Conversion token/guard must prevent duplicate project creation on retry.
- Audit log records conversion and project association.
- Archived records cannot be converted until restored.
- No remote D1 migration is run as part of WP-2 code delivery.

## Security / consistency
- Reuse canonical owner authentication, same-origin validation, rate limiting, database-binding checks, owner authorization guard in mutating batches, and audit helpers.
- Strict input allowlists, text bounds, valid dates, currency whitelist, safe integer validation.
- No raw error details or secrets in responses/logs.
- Canonical routes must intercept and never fall through to legacy handlers.
- Preserve no-store/private response headers and noindex policy.

## Acceptance tests
1. Route boundary and trailing-slash behavior; unknown routes return controlled 404.
2. OPTIONS same-origin enforcement, rate-limit and Allow header.
3. Method allowlist.
4. Auth, owner enrollment, disabled-owner and database-unavailable behavior.
5. Create payload validation; unknown fields rejected.
6. Create/list/detail, pagination, query and stage/origin filters.
7. Duplicate advisory behavior without destructive merge.
8. PATCH allowlist, stage transitions, invalid currency/value/date.
9. Archive/restore semantics; archived excluded from default list.
10. Conversion preserves UUID, changes stage/status, optional project behavior.
11. Repeated conversion is safe and does not duplicate project.
12. Audit and owner guard remain atomic.
13. Archived conversion is rejected.
14. Legacy regression suite passes; no fallthrough.
15. Tests for migration 0003 and CRM/projects remain green.

## Implementation files expected
- `functions/api/hq/canonicalLeads.js`
- `functions/lib/hqCanonicalRouter.js`
- `functions/lib/hqIntegrationBoundary.js`
- `tests/hq-canonical-leads.test.js`
- Relevant regression tests and continuity documentation.

## Review gate
WP-2 must be implemented on `feat/phase-8-0-4-wp2-canonical-leads`, independently reviewed, tested, and delivered in a PR. Do not merge, deploy, or apply migrations to HQ_DB without explicit approval.
