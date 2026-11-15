# Studio HQ — Phase 2.7M Remediation Checkpoint

**Date:** 14 November 2026  
**Active PR:** [#51 — Restore canonical Studio HQ security and D1 compatibility](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/51)  
**Branch:** `fix/phase-2-7m-canonical-d1-compatibility-20261114`  
**Status:** Draft, open, not merged. Keep deployment and remote D1 migration disabled.

## Implemented on the feature branch

- Restored Firebase RS256 token verification with Google signing certificates, JOSE verification, and Firebase project ID `refined-actor-skhlb`.
- Authorization requires a matching active, pre-enrolled owner in canonical `hq_users(uid,email,status)`; normal API requests do not auto-enroll owners.
- Restored canonical HQ D1 migration files matching the live migration ledger: `migrations/hq/0001_studio_hq_schema.sql` and `migrations/hq/0002_financial_management.sql`.
- Restored canonical CRM, project/task/milestone, approvals/QA, and financial API handlers using existing tables and audit history.
- Removed the incompatible parallel-table migration `migrations/0002_hq_owner_authorization_hardening.sql`.
- Restored the private `/studio-hq` dashboard and session lifecycle handling.
- Added task/milestone compatibility aliases that reuse project-scoped canonical handlers and enforce a bounded project ID.
- Restored HQ test fixtures, test suites, schema validation, CI workflows, and the `test:hq-auth` script.
- Added the `HQ_DB` D1 binding and three rate-limit declarations to `wrangler.jsonc`: `HQ_SESSION_LIMITER` (10/60 seconds), `HQ_WRITE_LIMITER` (30/60 seconds), and `HQ_RATE_LIMITER` (120/60 seconds). These declarations are source configuration only; they do not establish that the bindings are active on the currently deployed Worker.
- Added private-route noindex behavior, removed public canonical/JSON-LD metadata from the private page, aligned Firebase popup security headers, and excluded the private dashboard from service-worker caching.

## Verified CI evidence

These results are commit-specific; recheck the latest PR head before treating them as current.

- HQ Firebase authorization test suite and TypeScript production build: success on commit `934dd078e7f364c44c291c8fb3f68bc5bcaaed7f`.
- Canonical D1 schema validation: success on commit `2e38406e2d005bad536aa97d3002d2f930019319`.
- Deployment runtime route contract: success on commit `2e38406e2d005bad536aa97d3002d2f930019319`.
- Site integrity, AI regression, PWA reliability, performance baseline, AdSense readiness, and security supply-chain checks: success on commit `2e38406e2d005bad536aa97d3002d2f930019319`.

## Remaining validation findings

- Static accessibility checks still report legacy HTML documents without a `<main>` landmark. The React SPA index shell was handled separately; remaining static-page findings need a separate bounded accessibility remediation.
- Production HTML SEO, cache, and security-header monitors probe `https://jawed.co.in`, the protected personal website. They reported live 404/metadata issues during this PR. Do not modify or deploy the personal website as part of this Studio HQ PR.
- Security baseline and Core Web Vitals validation contracts were updated to reflect the Firebase popup frame allowlist and offline-page analytics exclusion; latest results must be rechecked.
- No remote D1 migration, live database write, Cloudflare deployment, or Cloudflare settings change was performed as part of this Phase 2.7M PR work. This statement describes changes made by this phase; it does not mean the Worker has never been deployed or that the database has never been migrated. Read-only live-state reconciliation is recorded below.

## Next safe action

Recheck every workflow on the latest PR #51 head, review remaining failures by scope, and keep PR #51 in draft until Studio HQ-specific checks are green and unrelated personal-site monitor failures are clearly separated. Do not merge or deploy without separate explicit approval.


## Read-only live-state reconciliation — 15 November 2026

The following observations were obtained after the original checkpoint was written:

- The live D1 migration ledger contains both `0001_studio_hq_schema.sql` and `0002_financial_management.sql`. Both were already applied; no migration was run during this reconciliation.
- The live D1 database contains one `hq_users` row. Identity fields were not retrieved for this documentation update. Do not treat the count alone as proof of owner authorization; the application still requires a matching active owner record.
- Cloudflare has existing Worker deployment/version history for `jawed-website-ai-studio-lab`. The latest observed active version was `cf1dba45-c28c-4865-9571-dc508f6863d2`, carrying 100% traffic. Its metadata did not contain a source commit SHA, so the exact deployed source commit remains unverified.
- The active version's binding metadata contained `AI`, `ASSETS`, `CANONICAL_ORIGIN`, `ENVIRONMENT`, and `HQ_DB`. It did not contain the three rate-limit bindings declared by this PR's `wrangler.jsonc`. Live rate limiting therefore remains a release blocker.
- A D1 Time Travel bookmark was observed, but no separate export or restore test was performed. Do not describe this as a tested backup/recovery plan.
- GitHub reports the repository's `main` branch as unprotected, with required status checks disabled; no repository rulesets were returned. The dedicated branch-protection endpoint was inaccessible to the integration, but the branch metadata endpoint reported `protected: false`.
- PR #51 remains open, Draft, mergeable, and unmerged at the time of this reconciliation. Do not merge, deploy, change Cloudflare settings, or run remote migrations without separate explicit approval.

## Documentation reconciliation commit — 15 November 2026

- Updated `docs/studio-hq-d1-schema.md` to distinguish verified live D1 state from the repository's intended schema and to record the observed Worker deployment/binding evidence.
- Corrected this checkpoint's rate-limit declaration wording and clarified that no changes by this PR phase does not mean no historical Worker deployment or D1 migration exists.
- These are documentation-only changes. Re-run the PR checks on the resulting head; prior CI results do not automatically verify this new commit.


## Phase 2.7N — Rate-limit safeguard and Cloudflare reconciliation — 15 November 2026

### Code safeguard committed

- Updated `functions/lib/hqRateLimit.js`: if `ENVIRONMENT` is `lab` or `production` and no supported limiter binding is present, the request now fails closed with HTTP 503 `RATE_LIMIT_UNAVAILABLE`. Isolated local/test environments without those deployed environment values retain the existing pass-through behavior.
- Added a regression test in `functions/lib/hqRateLimit.test.js` for missing bindings in both deployed environments.
- Commits: `36760f52d1988376351f6ad5184b07581c19520c` (middleware) and `cd6c5da738f08447c6bfcdd33efc8ccb1d407b03` (test).
- On exact head `cd6c5da738f08447c6bfcdd33efc8ccb1d407b03`, all 14 listed GitHub Actions workflow runs completed successfully. The `hq-auth-unit-tests` job reports 131 tests, and its TypeScript/production build step succeeded.

### Read-only Cloudflare evidence

- Current Worker settings GET and active version 13 metadata both show only `AI`, `ASSETS`, `CANONICAL_ORIGIN`, `ENVIRONMENT`, and `HQ_DB`. Neither contains `HQ_SESSION_LIMITER`, `HQ_WRITE_LIMITER`, or `HQ_RATE_LIMITER`.
- Active deployment remains `739b15b1-22b5-499c-a738-7830cb394579`, with 100% traffic on version `cf1dba45-c28c-4865-9571-dc508f6863d2`. Version 13 has no source commit SHA annotation.
- The PR's `wrangler.jsonc` declares namespace IDs `620261114`, `620261115`, and `620261116`, each a positive integer string and distinct from the other two within this configuration. Each uses period 60 seconds, which is a supported period.
- Cloudflare documentation states namespace IDs must be unique within the Cloudflare account. Account-wide uniqueness was not verified because doing so would require inspecting other Worker configurations, including the separate Kaushal customer Worker, which is out of scope and must remain untouched. Treat account-wide namespace uniqueness as an outstanding pre-deployment check.
- Cloudflare's Workers Rate Limiting API is approximate and location-scoped; requests can exceed the configured threshold while counters synchronize. It is not a strict global quota mechanism.
- The settings and version inspections were GET-only. No Cloudflare setting, Worker version, deployment, route, D1 record, or migration was changed.

### Release implications and guardrails

- Deploying the new code without the three bindings would cause protected Studio HQ API requests to fail closed with HTTP 503. Do not deploy until the intended bindings are configured and verified.
- CI success validates the repository checks; it does not activate the bindings or prove the live Worker has the PR's source.
- Do not inspect or modify the Kaushal Worker to establish namespace uniqueness. Resolve the account-wide uniqueness question through an authorized account-level inventory that does not disclose or alter customer configuration, or choose a safe account-wide namespace allocation with explicit owner approval.
- PR #51 remains Draft, open, unmerged. No merge or deployment is authorized by this checkpoint.
