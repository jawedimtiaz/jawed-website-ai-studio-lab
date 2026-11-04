# Phase 1 — Contact persistence and reliability

## Scope

This change makes the Worker contact endpoint persist a submission before acknowledging it. It also persists privacy-minimized contact-attempt events. The existing contact form UI and route are unchanged.

## Important deployment prerequisite

The Cloudflare D1 database `jawed-contact-submissions` has now been created in the APAC region. Its database ID is recorded in both Wrangler configuration files on this feature branch. The schema migration has been applied and the two application tables and indexes were verified through the Cloudflare D1 API. The live Worker has not yet been updated with this binding because no deployment was performed.

## D1 schema

Migration: `migrations/0001_contact_persistence.sql`

The D1 database has already been created and the SQL schema applied directly through the Cloudflare D1 API. The committed migration remains in `migrations/0001_contact_persistence.sql` so the schema is documented and reproducible. A direct SQL application does **not** automatically register the migration in Wrangler's `d1_migrations` history table; inspection confirmed that this history table is currently absent. Because this migration uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, the next controlled `wrangler d1 migrations apply jawed-contact-submissions --remote` can safely create the Wrangler history table and record/apply this migration without replacing the already-created tables. Verify the Wrangler migration list/history before any Worker deployment. Do not manually fabricate a migration-history row.

## Bind D1 to the Worker

Both `wrangler.toml` and `wrangler.jsonc` now contain the D1 binding named `CONTACT_DB`, using the actual database ID returned by Cloudflare:

```toml
[[d1_databases]]
binding = "CONTACT_DB"
database_name = "jawed-contact-submissions"
database_id = "645619c4-264f-4ef2-b29f-8c500434aa8f"
migrations_dir = "migrations"
```

This repository contains both `wrangler.toml` and `wrangler.jsonc`; both have been updated consistently. Confirm which config is used by the Cloudflare Worker deployment before deployment.

## Email configuration

The handler preserves the existing fallback addresses from the previous implementation:
- Recipient: `jawedimtiaz@gmail.com`
- Sender: `no-reply@jawed.co.in`

Cloudflare Worker variables `NOTIFICATION_EMAIL` and `SENDER_EMAIL` can override these values. Keep `RESEND_API_KEY` as a Worker secret; never put it in source control.

The submission is saved first. Email delivery is attempted afterwards. A provider non-2xx response is treated as failure and the handler tries the existing MailChannels fallback. The stored notification status becomes `sent` or `failed`. A saved submission is acknowledged even if email delivery fails, because the enquiry itself is safely stored. This phase does not yet implement an automatic email retry queue.

## Privacy changes

The attempt logger no longer transmits name, email, topic, user-agent, message text, or raw error details. It stores only status, reason code, submission method, message length, page path and timestamp.

Contact submissions necessarily contain the information the visitor enters. Restrict D1 access to authorized administrators and establish a retention/deletion policy before using this for customer production data.

## Verification checklist

After D1 creation and binding, verify in a non-production preview first:

1. `GET /api/contact` returns `200` and `status: ready`.
2. Submit a valid contact form and confirm the returned `id` exists in `contact_submissions`.
3. Confirm a failed email provider response does not delete the saved enquiry and records `notification_status = 'failed'`.
4. Submit invalid JSON, an oversized body, invalid email and a populated honeypot; confirm expected status/behavior.
5. Submit an attempt log and confirm one row is inserted in `contact_attempt_logs`; verify no name/email/message columns exist in that table.
6. Confirm API responses include the Worker security headers.
7. Run `npm run lint` and `npm run build` in the repository checkout. Record actual results; do not infer success from GitHub commits.

## Not included

- The D1 database was created and the schema applied; the live Worker has not yet been deployed with the binding.
- No automatic notification retry queue, admin dashboard, retention job, or rate-limit binding was added.
- No changes were made to the personal production website.
