# Studio HQ Owner Authorization — Canonical Policy

## Source of truth

Studio HQ uses the dedicated Cloudflare D1 database `jawed-studio-hq` and the canonical schema under `migrations/hq/`.

- Firebase project ID: `refined-actor-skhlb` (from `firebase-applet-config.json`).
- Firebase ID tokens must be cryptographically verified using Google's signing certificates and RS256.
- The backend must validate issuer, audience, expiry, issued-at, auth time, subject, verified email and the configured owner allowlist.
- A verified Firebase identity is not sufficient by itself: the matching `hq_users.uid` record must already exist and have `status = 'active'`.
- Normal API requests must never enroll the first owner or create owner records.
- Owner enrollment/recovery is a separate controlled administrative operation and must not be exposed as a public request flow.

## Canonical D1 tables

Do not create parallel `hq_clients`, `hq_projects`, `hq_tasks`, `hq_milestones` or `hq_audit_logs` tables.

Use the existing tables and column names defined in:

- `migrations/hq/0001_studio_hq_schema.sql`
- `migrations/hq/0002_financial_management.sql`

In particular:

- Owner identity: `hq_users(uid, email, display_name, status, created_at, last_seen_at)`.
- CRM: `clients` and `client_contacts`.
- Delivery: `projects`, `project_milestones`, `project_tasks`.
- Audit: append-only `audit_logs`.
- Finance: quotations, invoices, line items, payments, refunds and idempotency tables use integer minor units.

Business records must use the schema's archive fields. Do not hard-delete client or project records.

## Migration safety

The old root migration `migrations/0002_hq_owner_authorization_hardening.sql` created incompatible parallel tables and has been removed from this branch. Do not run it.

The canonical migration files are restored for source control and local/in-memory validation. **No remote D1 migration has been run or authorized.** Before any remote migration, compare the migration ledger and schema read-only, then obtain explicit approval.

## Verification

Run the HQ test suite and schema validation in CI. Tests must reject unsigned, tampered, wrong-key, expired, wrong-issuer, wrong-audience, unverified-email and non-allowlisted tokens. A decoded JWT payload or fabricated signature is never proof of authentication.
