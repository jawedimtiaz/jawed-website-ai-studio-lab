# Phase 1 — Contact persistence and reliability

## Scope

This change makes the Worker contact endpoint persist a submission before acknowledging it. It also persists privacy-minimized contact-attempt events. The existing contact form UI and route are unchanged.

## Important deployment prerequisite

The Worker must have a Cloudflare D1 database binding named `CONTACT_DB` before the new contact endpoint can accept submissions. Until that binding and migration are configured, the endpoint intentionally returns HTTP 503 rather than falsely claiming that a message was saved.

No database ID or Cloudflare resource has been created by this code change.

## D1 schema

Migration: `migrations/0001_contact_persistence.sql`

Create a D1 database in the Cloudflare dashboard (Workers & Pages → D1) or with Wrangler after confirming the correct Cloudflare account:

```sh
npx wrangler d1 create jawed-contact-submissions
```

Record the returned database ID privately. Do not commit credentials or secrets.

Apply the migration after the database exists:

```sh
npx wrangler d1 migrations apply jawed-contact-submissions --remote
```

## Bind D1 to the Worker

Add a D1 binding named `CONTACT_DB` to the Worker configuration used by the deployment. The database name and ID must be the exact values returned by Cloudflare:

```toml
[[d1_databases]]
binding = "CONTACT_DB"
database_name = "jawed-contact-submissions"
database_id = "REPLACE_WITH_THE_REAL_CLOUDFLARE_D1_DATABASE_ID"
migrations_dir = "migrations"
```

This repository currently contains both `wrangler.toml` and `wrangler.jsonc`. Confirm which config is used by the Cloudflare Worker deployment before adding the real binding. Keep the two files consistent if both are actively used. Never commit a placeholder database ID.

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

- No Cloudflare database was created or bound.
- No Worker deployment or production setting was changed.
- No automatic notification retry queue, admin dashboard, retention job, or rate-limit binding was added.
- No changes were made to the personal production website.
