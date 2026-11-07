# Studio HQ API ↔ D1 schema contract

## Purpose

The live Studio HQ D1 database uses the schema introduced by `migrations/hq/0001_studio_hq_schema.sql`. API handlers must use these exact table and column names. Do not create legacy `hq_clients`, `hq_projects`, `hq_tasks`, `hq_milestones`, or `hq_audit_logs` tables to accommodate old handlers.

## Confirmed live schema

Read-only Cloudflare inspection of `jawed-studio-hq` (UUID `d9ec83ea-7114-4179-af8e-a22ba5494508`) confirmed:
- `hq_users(uid,email,display_name,status,created_at,last_seen_at)`
- `clients`
- `projects`
- `project_tasks`
- `project_milestones`
- `audit_logs`
- Related business tables: client_contacts, repositories, deployments, approvals, qa_checks, quotations, invoices, payments, maintenance_plans, assets, activity_notes.

## API mapping

| API resource | Actual D1 table | Compatibility mapping |
|---|---|---|
| Clients | `clients` | UI `company` maps to `business_name`; deletes are soft archive |
| Projects | `projects` | UI `title` maps to `name`; `description` maps to `summary`; rupee budget maps to integer paise in `quoted_amount_minor` |
| Tasks | `project_tasks` | `project_id`, `milestone_id`, `title`, `status`, `priority`, `due_date`; creator/updater use owner UID |
| Milestones | `project_milestones` | UI `title` maps to `name`; `target_date` maps to `due_date` |
| Authentication | `hq_users` | UID key is `uid`; display name is `display_name`; activity timestamp is `last_seen_at` |
| Audit | `audit_logs` | append-only event metadata; do not use legacy `hq_audit_logs` |

## Authorization rules

- Firebase ID tokens must pass certificate-backed RS256 verification using the confirmed Firebase project ID `refined-actor-skhlb`.
- The current owner email allowlist remains unchanged.
- A valid Firebase token is not sufficient by itself. The UID must already exist in `hq_users` with the matching email and `status='active'`.
- HTTP requests do not automatically enroll the first owner. First-owner enrollment requires an explicitly reviewed operation after confirming the Firebase UID.
- Unknown UIDs are not written into `audit_logs.actor_uid` because that column references `hq_users(uid)`; a rejection event can be recorded with a null actor UID and the attempted UID in metadata.
- Do not bind the live `HQ_DB` until authentication and schema tests pass and a preview integration test is completed.

## Soft deletion and monetary values

- Client and project delete endpoints set `archived_at` and `archived_by`; they do not hard-delete business records.
- The schema stores monetary values in integer minor units. API compatibility accepts rupee amounts and converts to paise before persistence; return values are converted back to rupees.
- Project/task/milestone status and priority values must match the database CHECK constraints. Legacy UI values are normalized only where the mapping is unambiguous; unsupported values are rejected.

## Verification boundary

The current PR includes unit tests for owner authorization and the D1 owner/audit schema contract, plus a production build. These tests do not replace a D1 integration test against the isolated HQ preview database. No live D1 mutation, owner enrollment, Worker binding, or deployment is included.
