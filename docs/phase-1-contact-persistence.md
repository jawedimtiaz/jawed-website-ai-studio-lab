# Phase 1 — Contact persistence and reliability

## Scope

This change makes the Worker contact endpoint persist a submission before acknowledging it. It also persists privacy-minimized contact-attempt events. The existing contact form UI and route are unchanged.

## Important deployment prerequisite

The Cloudflare D1 database `jawed-contact-submissions` has now been created in the APAC region. Its database ID is recorded in both Wrangler configuration files on this feature branch. The schema migration has been applied and the two application tables and indexes were verified through the Cloudflare D1 API. The live Worker has not yet been updated with this binding because no deployment was performed.

## Isolated preview environment

A separate preview environment has been created for Phase 1 validation. It is intentionally isolated from the existing lab Worker and the real contact database.

- Worker name: `jawed-contact-phase1-preview`
- Config file: `wrangler.preview.toml`
- Preview D1 database: `jawed-contact-preview`
- Preview D1 database ID: `09eba512-2949-4dec-ab58-070ac2160a6a`
- workers.dev origin configured in the preview file: `https://jawed-contact-phase1-preview.jawed-eee.workers.dev`
- `DISABLE_CONTACT_EMAIL = "true"`: submissions are persisted, but neither Resend nor MailChannels is called.
- `DISABLE_AI_API = "true"`: the AI endpoint returns a controlled 503 in preview.
- No custom domain or route is configured.

The preview database schema and Wrangler migration-history row were verified through Cloudflare. Both application tables currently contain zero rows. The preview Worker itself has **not** been deployed yet.

### Preview deployment (when using the authorized personal Windows development machine)

Run these commands from the existing repository checkout. Do not run a generic `wrangler deploy` command; the explicit preview config is mandatory.

```powershell
cd C:\Users\user\jawed-website-ai-studio-lab
git fetch origin
git checkout fix/phase-1-contact-persistence-reconcile
git pull
npm install
npm run build
npx.cmd wrangler deploy --config wrangler.preview.toml
```

After deployment, test only the workers.dev preview URL. Do not attach a custom domain, add a route, deploy with `wrangler.toml` or `wrangler.jsonc`, or deploy the existing lab Worker as part of this step.

### Preview verification

1. `GET /api/contact` should return `200` with `status: ready`.
2. `GET /api/ai` should return `503` with `AI_DISABLED_IN_PREVIEW`.
3. A valid contact form submission should return success with `notificationStatus: pending`.
4. Verify the submission exists in the preview database only.
5. Confirm no email provider request was made.
6. Confirm the existing lab Worker and the production website remain unchanged.

## D1 schema

Migration: `migrations/0001_contact_persistence.sql`

The D1 database and application tables were initially created through the Cloudflare D1 API. On 2026-11-04, Wrangler successfully ran `npx wrangler d1 migrations apply jawed-contact-submissions --remote`; the terminal reported that `0001_contact_persistence.sql` was executed successfully (5 SQL commands). A subsequent read-only Cloudflare D1 query verified the `d1_migrations` history row: `id = 1`, `name = 0001_contact_persistence.sql`, `applied_at = 2026-11-04 17:53:38`. The two application tables are present and currently contain zero records. Migration registration is verified.

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

After the migration and binding are in place, verify in a non-production preview first:

1. `GET /api/contact` returns `200` and `status: ready`.
2. Submit a valid contact form and confirm the returned `id` exists in `contact_submissions`.
3. Confirm a failed email provider response does not delete the saved enquiry and records `notification_status = 'failed'`.
4. Submit invalid JSON, an oversized body, invalid email and a populated honeypot; confirm expected status/behavior.
5. Submit an attempt log and confirm one row is inserted in `contact_attempt_logs`; verify no name/email/message columns exist in that table.
6. Confirm API responses include the Worker security headers.
7. GitHub Actions Phase 1 workflow run `41841754334` completed successfully: 12 contact API tests, `npm run lint`, and `npm run build` all passed. These tests use mocked D1 and mocked email fetch; they do not prove live Worker/D1/email-provider integration.

## Not included

- The D1 database was created and the schema applied; the live Worker has not yet been deployed with the binding.
- No automatic notification retry queue, admin dashboard, retention job, or rate-limit binding was added.
- No changes were made to the personal production website.


## Reconciliation branch note — 2026-11-07

This branch is based on the current `main` commit and ports the D1 persistence changes without replacing the newer Studio HQ Worker router. The live contact database and isolated contact preview database were re-queried read-only on 2026-11-07: both contain `contact_submissions`, `contact_attempt_logs`, and migration history row `0001_contact_persistence.sql`; both application tables have zero rows. The contact preview Worker has not been deployed. The existing Lab Worker currently has no `CONTACT_DB` binding; this branch only updates source configuration and does not deploy or alter Cloudflare resources.
