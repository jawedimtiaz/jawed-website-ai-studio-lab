# Phase 8.0.4 WP-2 — CRM Frontend/API Compatibility Audit

Audit basis: GitHub main at 87517bac015baa673de265959681c1e995ff291b; files inspected: `src/components/hq/CrmSection.tsx`, `src/services/hqService.ts`, `src/types/hq.ts`, `functions/api/hq/leads.js`, `functions/lib/hqCanonicalRouter.js`, `functions/lib/hqIntegrationBoundary.js`, `functions/api/hq/canonicalClients.js`, `functions/api/hq/canonicalProjects.js`.

## Existing frontend contract
- Leads UI is in `src/components/hq/CrmSection.tsx`.
- Lead list requests `GET /api/hq/leads?page=&limit=25&q=&status=`.
- Lead creation/editing uses existing lead form fields: business_name, contact_name, email, phone, category, website, source, status, estimated_major, currency, next_follow_up_at, notes.
- Lead conversion is currently POST to `/api/hq/leads` with action `convert`, leadId, createProject, projectName.
- Type `HqLead` uses display statuses New, Contacted, Qualified, Proposal Sent, Converted, Lost and fields converted_client_id, estimated_value_minor, etc.
- UI also uses clients API for customers, reference client list, contacts, follow-ups, and notes. These endpoints must remain unaffected.

## Legacy backend behavior and risks
- Legacy `functions/api/hq/leads.js` queries `clients` rows by legacy status values lead/prospect/active/closed.
- Legacy mapping does not read `pipeline_stage` and does not map `lead_origin`.
- Legacy conversion sets `status='active'`, with optional project insertion, and uses the existing lead/client ID.
- Legacy estimated value is hard-coded to 0 in response mapping; currency hard-coded INR; category and next_follow_up_at are not represented in the query mapping.
- Canonical clients API is strict allowlist-based and has its own owner authorization, database guard, audit, archive/restore, and contacts routes.
- Canonical router currently handles only `/api/hq/projects` and `/api/hq/clients`; leads must be added with boundary interception to avoid legacy fallthrough.

## Compatibility requirements
1. Preserve existing UI shape initially, or make a deliberate, tested UI adapter to canonical response shape.
2. Keep current lead creation/editing UX functional while introducing canonical data fields.
3. Make stage mappings explicit and reversible where feasible:
   - New -> new
   - Contacted -> contacted
   - Qualified -> qualified
   - Proposal Sent -> proposal-sent
   - Converted -> converted
   - Lost -> lost
4. Maintain current `estimated_major` input compatibility but convert strictly to integer minor units; reject invalid, negative, non-finite, or unsafe amounts. Do not silently default invalid input to zero.
5. Preserve category as a supported field in the canonical lead API; Migration 0003 includes category.
6. Preserve follow-up date handling with strict date/time validation.
7. Duplicate matching should return advisory data only, not merge or block without a documented policy.
8. Conversion must preserve client UUID and handle optional project creation without duplicate project side effects on retry.
9. Lead archive/restore should use canonical endpoint actions and not conflate archive with Lost.
10. Ensure lead records and direct customers are distinguished by `lead_origin`, not solely legacy `status`.

## Implementation plan
- Implement canonical handler with collection/detail/archive/restore/convert endpoints.
- Add canonical router matching and boundary dispatch.
- Adapt existing frontend service/UI payload and response mapping.
- Add unit, route, authorization, D1 behavior and frontend contract regression tests.
- Run targeted test suite and full relevant regressions, then open review-only PR.
- No production deploy or remote HQ_DB migration.

## Open schema checks before implementation
Confirm exact `clients` column names and constraints from migration 0003 and the canonical schema fixture, including archive fields, conversion token semantics, primary contact relationship, and lead/client status invariants. Do not guess column names.
