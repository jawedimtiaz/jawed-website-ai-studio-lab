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

- Updated `functions/lib/hqRateLimit.js`: if `ENVIRONMENT` is `lab` or `production` and no supported limiter binding is present, the request now fails closed with HTTP 503 `RATE_LIMIT_UNAVAILABLE`. A subsequent hardening commit makes explicit `ENVIRONMENT=test` the only no-binding pass-through case; missing or unexpected environment values also fail closed.
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


### Follow-up fail-closed default hardening — 15 November 2026

- Review identified that checking only for `ENVIRONMENT=lab` or `production` could still allow a missing or unexpected environment value to bypass rate limiting.
- Tightened `functions/lib/hqRateLimit.js`: no supported binding now returns 503 by default. Pass-through is permitted only when `ENVIRONMENT` is explicitly `test`.
- Updated `functions/lib/hqRateLimit.test.js` to cover missing, null, unrelated, staging, lab, and production environment cases, and to mark the relevant isolated fixtures explicitly as test environments.
- Commits: `64eb9232e85d1ce2017e2976380a802f68408349` (fail-closed default) and `7e4b914b60af3be694c8f9cd72ea089d01e03d59` (regression tests).
- The 14/14 CI result reported above applies to the earlier head `cd6c5da738f08447c6bfcdd33efc8ccb1d407b03`, not these follow-up changes.
- CI for the new head must complete before the strengthened behavior is considered verified. No deployment, merge, Cloudflare settings write, or D1 operation was performed.


## Phase 2.7N — latest-head CI verification and continuation checkpoint — 15 November 2026

### GitHub PR state rechecked

- PR [#51](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/51) remains open, Draft, mergeable, and unmerged.
- Branch: `fix/phase-2-7m-canonical-d1-compatibility-20261114`.
- Exact PR head inspected: `90040797cca8e26234446e207f51d180efbeb342`.
- The PR description still contains historical status notes from earlier commits. This section records the latest evidence and supersedes older pending-CI statements where they refer to earlier heads.

### Latest-head CI evidence

- The commit-scoped GitHub Actions query returned 13 pull-request workflow runs for this exact head; all 13 returned runs were completed with conclusion `success`. No returned run was pending or failed.
- Studio HQ Firebase Auth Tests run: [43738084618](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/actions/runs/43738084618).
- Studio HQ job: `hq-auth-unit-tests`, job ID `132885017632`, completed successfully.
- The downloaded job log confirms **131 tests, 131 passed, 0 failed**.
- TypeScript and production build step completed successfully.
- Wrangler Worker configuration validation completed using `npx wrangler deploy --dry-run --outdir .wrangler-dry-run`; the log ended with `--dry-run: exiting now.`. This did not publish a Worker version.
- The gRPC artifact regression check inspected 45 text build artifacts and found no `@grpc/grpc-js` or gRPC server-auth markers. The workflow itself correctly warns that this is not proof that every upstream advisory scenario is inapplicable.
- Career Match Browser Runtime Gate completed successfully.
- Combined-status endpoint returned no status entries; workflow-run and job evidence above are the evidence used here.

### Non-blocking CI warnings observed

- Vite reports that `/assets/js/analytics.js` cannot be bundled without a `type="module"` attribute.
- Vite reports large chunks (including WorkPage and the main bundle).
- GitHub Actions warns that the pinned checkout/setup-node actions target Node.js 20 and are being forced to run on Node.js 24.
- Node emits a `punycode` deprecation warning and experimental SQLite warnings during tests.
- These warnings did not fail this run. Keep them as separate maintenance work; do not mix unrelated changes into the current security/remediation patch without a scoped review.

### Current release blockers remain unchanged

- The live Worker was previously observed without `HQ_SESSION_LIMITER`, `HQ_WRITE_LIMITER`, and `HQ_RATE_LIMITER`. The PR code fails closed if required bindings are absent, so deploying before the live bindings are configured would cause protected HQ requests to return HTTP 503.
- Account-wide uniqueness of namespace IDs `620261114`, `620261115`, and `620261116` remains unverified. Do not inspect the Kaushal customer Worker to answer this.
- The active Cloudflare Worker version's exact source commit remains unverified; its metadata had no source SHA annotation.
- GitHub `main` remains unprotected based on the last read-only branch metadata check. No branch protection settings were changed.
- The Firebase/gRPC dependency advisory exception remains narrowly scoped; no forced override, major Firebase downgrade, or automatic dependency upgrade was applied.
- D1 backup/export and restore have not been tested. The observed Time Travel bookmark is not evidence of a tested recovery procedure.
- These are release-readiness issues, not failures in the latest PR CI run.

### Actions and safety

- This checkpoint update is documentation-only and is being committed to the existing PR branch.
- No merge, deployment, Worker settings change, D1 migration/write, branch-protection change, personal-site change, or Kaushal-project inspection/change is authorized or performed.
- Keep PR #51 Draft and unmerged pending separate owner approval and resolution of release prerequisites.

### Next continuation tasks

1. **D1 runbook review:** Have the owner review `docs/studio-hq-d1-backup-recovery-runbook.md`. Backup export and a disposable-database restore drill remain unperformed and require separate approval.
2. **Workflow inventory:** Complete an inventory of all `.github/workflows/*.yml` files, recording action pins, runner/runtime, package manager, permissions, and trigger paths. Then prepare a separate CI maintenance proposal using verified immutable SHAs. Do not update workflow pins in PR #51.
3. **Bundle optimization proposal:** Evaluate nested lazy loading for `HardwareShowcase3D` with measured before/after build output and browser checks in a separate change. No optimization has been implemented yet.
4. **Analytics warning:** Inspect `public/assets/js/analytics.js` (or its actual repository path) and determine why Vite warns about the classic deferred script. Preserve execution semantics; do not convert it to a module without evidence.
5. **Release-readiness reconciliation:** Recheck current live Worker bindings/version, D1 recovery evidence, branch protection and dependency advisory status using read-only access. Do not inspect the Kaushal customer Worker.
6. Keep PR #51 Draft and unmerged. Stop before merge, deployment, live Cloudflare configuration changes, D1 export/import/restore/migration/writes, branch-protection mutations, or any customer/personal-site changes unless the user explicitly approves that exact operation.

### Continuation protocol

For a new chat, start in the Jawed Web Studio — Business & Development HQ project and ask the assistant to read this checkpoint from the PR branch, verify the current PR head and workflow status, then continue the listed tasks. A screenshot is optional context only; GitHub's current branch, PR and workflow data are authoritative.

### D1 backup/recovery runbook prepared — 15 November 2026

- Added [`docs/studio-hq-d1-backup-recovery-runbook.md`](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/blob/fix/phase-2-7m-canonical-d1-compatibility-20261114/docs/studio-hq-d1-backup-recovery-runbook.md).
- The runbook documents Time Travel, SQL export, secure backup handling, destructive restore controls, post-recovery validation, and a future disposable-database restore drill.
- It explicitly states that no export/import/restore/drill has been performed, that RTO/RPO are not established, and that a Time Travel bookmark alone is not a tested backup.
- Cloudflare documentation reviewed on 15 November 2026: Time Travel/backup retention, D1 export/import, export API behavior, restore API, and D1 limits.
- Export can temporarily block database requests; live restore overwrites the database in place. The runbook therefore requires a maintenance window and explicit approval.
- No live D1 operation or Cloudflare change was performed. The runbook is documentation only and remains subject to review.
- Runbook commit: `70dcd6ccc3e2cfd7fc98cd9c92251872c4390cf3`.

### CI and bundle maintenance review — 15 November 2026

- Added [`docs/ci-and-bundle-maintenance-review.md`](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/blob/fix/phase-2-7m-canonical-d1-compatibility-20261114/docs/ci-and-bundle-maintenance-review.md).
- Read-only review confirmed the Studio HQ auth workflow pins older `actions/checkout` and `actions/setup-node` commits. Latest CI warns their action runtime targets Node 20 and is being forced to Node 24, although the job itself explicitly installs Node 24.12.0.
- Official upstream action documentation currently shows checkout v7 and setup-node v7; a separate maintenance PR should use reviewed immutable SHAs and verify runner requirements, release notes, inputs, permissions, and package-manager caching before updating the workflow matrix.
- Bundle review found `src/App.tsx` already lazy-loads WorkPage, but `src/pages/WorkPage.tsx` statically imports `HardwareShowcase3D`, which imports Three.js and addons. A bounded follow-up is to lazy-load that 3D component inside WorkPage so the large Three.js payload is deferred until the overview showcase is rendered.
- The Vite warning for classic deferred `/assets/js/analytics.js` requires script-behavior review before any module conversion.
- No workflow, application, analytics, Worker, D1, personal-site, or Kaushal changes were made. These are separate maintenance recommendations, not edits to the current remediation.
- Review document commit: `54a46baeb7eb1ac32d49aec6b7a92cf620f4b437`.


### Workflow and analytics source inspection — 15 November 2026

- Follow-up findings are recorded in `docs/ci-and-bundle-maintenance-review.md`; update commit: `3574cfbb2fdab2be28d19ed015c657e793ab2916`.
- Inspected `.github/workflows/studio-hq-auth-tests.yml`: Ubuntu runner, Node 24.12.0, Bun frozen-lockfile install, `contents: read`, immutable action SHAs, HQ tests/build/Wrangler dry-run/artifact scan, push branch filters, and PR base/path filters. The file does not define `workflow_dispatch`.
- This is not the full workflow inventory. The available GitHub file-fetch interface did not provide an authoritative directory/tree listing, so other workflow filenames and their configuration remain unverified. Do not claim all workflows have been inventoried.
- Confirmed `index.html` references classic deferred `/assets/js/analytics.js`; the source is `assets/js/analytics.js`, a browser-global IIFE. `scripts/prepare-dist.mjs` copies the root `assets` directory into `dist/assets`, preserving the static script in the build output. Do not convert it to a module based only on Vite's warning.
- Confirmed `WorkPage.tsx` statically imports `HardwareShowcase3D`, which imports Three.js and add-ons. A nested lazy import remains a candidate, but no before/after build or browser validation has been run.
- No workflow/application source changes, live Cloudflare changes, D1 operations, merge, or deployment were performed.
- Next: obtain an authoritative workflow directory listing, finish the inventory and verify candidate immutable action SHAs; then treat bundle lazy-loading as a separate measured experiment. Keep PR #51 Draft and unmerged.


### Complete GitHub Actions workflow inventory — 15 November 2026

- Enumerated `.github/workflows/` through the GitHub directory endpoint: **34 workflow files**. All 34 were individually fetched and reviewed. Full filenames, action pins, runner/Node matrix, permissions, triggers, package-manager patterns, candidate immutable action SHAs, and limitations are documented in `docs/ci-and-bundle-maintenance-review.md`.
- Matrix: 28 general workflows use `ubuntu-24.04` + Node 22; five Studio HQ workflows use `ubuntu-latest` + Node 24.12.0; `twa-engineering.yml` uses `ubuntu-latest` + Node 20 (EOL). All 34 declare `contents: read`; all have path filters. Triggers vary across PR, push, manual dispatch, and scheduled probes.
- 29 workflows use immutable checkout v5.1.0 and setup-node v7.0.0 pins (Node 24 action runtime). Five Studio HQ workflows still use checkout v4.2.2 and setup-node v4.4.0 pins (Node 20 action runtime); these explain the action-runtime deprecation warning. The HQ auth workflow additionally pins setup-bun v2.2.0.
- Verified candidate latest immutable pins by resolving upstream tag refs: checkout v7.0.1 = `3d3c42e5aac5ba805825da76410c181273ba90b1`; setup-node v7.1.0 = `949feb2413d6458794dcd2491c4babbbce0c15c1`. These are proposals only; no workflow file was changed. Review checkout v7 fork-PR safety behavior and setup-node v7 ESM / NODE_AUTH_TOKEN changes before a separate maintenance PR.
- Node 20 in `twa-engineering.yml` is EOL as of 15 November 2026; move to supported LTS only after compatibility validation. Do not change this in PR #51.
- Inventory commit: `476c353cb65922ac2be780cfbad5277ae030d0f2`.
- No workflow was manually triggered or modified; no live Cloudflare/D1 changes, merge, or deployment occurred. PR #51 remains Draft and unmerged.
- Next tasks: separate CI-maintenance proposal and measured Three.js lazy-load experiment; continue read-only release-readiness checks. Do not conflate workflow inventory with proof that every scheduled workflow has recently passed.


### Nested Three.js lazy-load design review — 15 November 2026

- Inspected `src/App.tsx`, `src/pages/WorkPage.tsx`, `src/components/common/ErrorBoundary.tsx`, and `src/components/hardware/HardwareShowcase3D.tsx`.
- Confirmed WorkPage is already route-lazy; HardwareShowcase3D is statically imported but rendered only in Work overview. App already provides route Suspense, RouteErrorBoundary, and a shared chunk-load-aware ErrorBoundary.
- A bounded proposal is a nested lazy import of HardwareShowcase3D with a local accessible Suspense fallback, retaining existing route lazy loading and error recovery. Non-overview tabs should not request the Three.js chunk.
- Detailed implementation and acceptance criteria recorded in `docs/ci-and-bundle-maintenance-review.md`; update commit: `ef330faf021d047b0755efcf4cc3f753db65910e`.
- No code change, local build, before/after measurement, or browser validation was performed. This remains a proposal for a separate change; do not implement in PR #51.
- PR #51 remains Draft and unmerged. No deployment or D1/Cloudflare mutation occurred.


### Base-branch drift and authoritative continuity record — 15 November 2026

- Rechecked PR #51 after documentation updates. Current PR head: `360aa831e43f456862a8e84bb3cf9971f13a0a09`; state open, Draft, unmerged. GitHub PR metadata currently reports `mergeable: false` (this is a current API observation; the precise reason has not been established).
- Compared PR head with `main`: branch is 146 commits ahead and 1 commit behind; the single newer main commit is `022f8ab41285834d9f8fe149e05f1c3b6d8fe6ae`, message `docs(hq): record Firebase project ID mismatch`, which adds `docs/STUDIO_HQ_CONTINUITY.md`.
- Read the new main-branch continuity record. It establishes GitHub repository state as the primary source of truth, reiterates project boundaries and explicit approval gates, and records a separate dated Phase 2.7L / PR #49 deployment-readiness audit. That document's dated PR #49 and deployment findings must be independently refreshed before use; do not substitute its 14 November snapshot for current live state or conflate PR #49 with PR #51.
- No branch update, rebase, merge, or cherry-pick was performed. PR #51 remains Draft and unmerged. Do not attempt to make it mergeable automatically; first determine why GitHub reports `mergeable: false` and review the new main commit's context.
- The current docs-only commits have no associated workflow runs returned by the PR-triggered workflow-run endpoint. Do not claim new CI coverage for these documentation commits.


### Analytics script diagnosis and bounded CI proposal — 15 November 2026

- Re-fetched PR #51 current head and full repository tree. PR remains open, Draft, unmerged, mergeable; current head at start of this task was `f39f7ca92c88da2bba70ec96e906ea7882148021`.
- Located the exact analytics source at `assets/js/analytics.js` and confirmed `index.html` references it as a classic deferred script. Source-level review confirms it uses `window.dataLayer`, `window.gtag`, `window.jawedTrack`, a one-time guard, and delayed/idle injection of the external Google tag. The Vite warning is consistent with a classic external script not being bundled as a module; no evidence yet of a runtime defect. Do not convert it to `type=module` just to silence the warning. Full diagnosis and acceptance criteria are in `docs/ci-and-bundle-maintenance-review.md`.
- Prepared a bounded CI maintenance proposal: update only the five Studio HQ workflow files from checkout v4.2.2/setup-node v4.4.0 to the already-used immutable checkout v5.1.0/setup-node v7.0.0 pins, keeping runtime, scripts, permissions, triggers and job behavior unchanged. Handle TWA Node 20 to Node 24.12.0 as a separate validated change. No workflow files changed.
- Documentation update commit: `fcbef1ee086020b524f3f09bb680f50907264261`.
- No build or browser tests were run; no analytics network request was made; no workflows were triggered; no application/workflow code changed. Docs-only CI is not claimed.
- Next: inspect live Studio HQ Worker/D1 status read-only only if a safe current query can clarify the existing release-readiness blockers; continue to keep PR #51 Draft/unmerged and avoid Cloudflare/D1 mutations. A separate CI maintenance branch/PR is deferred until the current PR disposition is decided.


### Fresh Cloudflare Worker / D1 metadata check — 15 November 2026

- Read-only Cloudflare GETs rechecked only the Studio HQ Worker and its dedicated D1 database. Worker settings returned exactly five bindings: AI, ASSETS, CANONICAL_ORIGIN, ENVIRONMENT and HQ_DB. The HQ_DB ID matches the dedicated D1 database ID `d9ec83ea-7114-4179-af8e-a22ba5494508`.
- The current Worker settings response does not list HQ_SESSION_LIMITER, HQ_WRITE_LIMITER or HQ_RATE_LIMITER. Rate-limit binding absence is confirmed in current metadata; live request enforcement was not tested.
- D1 metadata: `jawed-studio-hq`, APAC, production version, 401408 bytes, read replication disabled. No SQL, schema rows, migration ledger or customer data was read in this pass.
- Worker deployment GET still shows 13 records. Latest active deployment `739b15b1-22b5-499c-a738-7830cb394579` routes 100% to version 13 `cf1dba45-c28c-4865-9571-dc508f6863d2`, created 2026-11-13T17:51:34.266866Z. Version 13 still has no source commit SHA annotation; exact source provenance remains unverified. Version 12 has commit annotation `590d562b8f2a5547929a5f0132d5988c53836b9b` (PR #43).
- Full metadata interpretation and limitations documented in `docs/ci-and-bundle-maintenance-review.md` (commit `9b3148d247725d3ab2554f047cc7dd825f6feb31`).
- No Cloudflare writes, D1 query/export/import/restore/migration, Worker upload or deployment occurred. Kaushal and personal website resources were not inspected.


### Live D1 schema / migration / integrity recheck — 15 November 2026

- Read-only D1 catalog query returned 25 tables (including `_cf_KV` and `d1_migrations`) and two audit-log append-only triggers. The table names include `assets`, `activity_notes`, CRM, projects, approvals/QA, and financial-management structures.
- Live migration ledger still lists exactly `0001_studio_hq_schema.sql` (2026-11-06 05:02:32) and `0002_financial_management.sql` (2026-11-11 06:10:07). The separate root-level `0002_hq_owner_authorization_hardening.sql` is not recorded as applied; do not run it without compatibility review.
- `PRAGMA quick_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows. Each query's Cloudflare metadata reported `changed_db: false` and `rows_written: 0`.
- No application/customer/financial row contents were queried. No writes, export, backup, restore or migration performed. This does not count as a backup/restore drill.
- Full result and scope limitations documented in `docs/ci-and-bundle-maintenance-review.md` (commit `f117c8e0e815afcdda43dcf83193598eda2045b6`).


### Rate-limit dry-run vs active Worker version reconciliation — 15 November 2026

- Retrieved the exact successful GitHub Actions job log for run `43738084618`, job `hq-auth-unit-tests` (job ID `132885017632`) on application-code commit `90040797cca8e26234446e207f51d180efbeb342`.
- The actual `npx wrangler deploy --dry-run --outdir .wrangler-dry-run` output listed all three rate-limit bindings with intended limits: HQ_SESSION_LIMITER 10/60s, HQ_WRITE_LIMITER 30/60s, HQ_RATE_LIMITER 120/60s, then exited with `--dry-run: exiting now.` This proves source config recognition in dry-run only; it does not upload or deploy bindings.
- Fetched the exact active Cloudflare version 13 resource `cf1dba45-c28c-4865-9571-dc508f6863d2`. Its API `resources.bindings` array and current settings response both list only AI, ASSETS, CANONICAL_ORIGIN, ENVIRONMENT and HQ_DB. All three rate-limit binding names are absent from the active-version response. 100% traffic remains on version 13.
- Cloudflare docs (updated 2026-11-12) say rate-limit bindings are not currently visible in the dashboard. The evidence here is from the Cloudflare API active-version resource, not dashboard UI. API omission remains a discrepancy, not proof of exact runtime behavior; no live endpoint request or controlled deployment was performed.
- Current branch code inspection confirms session limiter is checked before owner auth; general limiter after owner auth; CRM/project/release/financial handlers apply general limits after auth and write limits on POST/PATCH. Missing bindings fail closed by default except explicit test environment fixtures.
- Account-wide uniqueness of namespace IDs `620261114`, `620261115`, `620261116` remains unverified. Do not inspect Kaushal customer Worker configuration. Keep this as an owner-level pre-deployment prerequisite.
- Full evidence, limitations and conclusion documented in `docs/ci-and-bundle-maintenance-review.md` (commit `beae3b39978e7d7a528859a00371781b26611d81`).
- No Worker upload/deployment/settings write, D1 write/migration, or live HQ API request was performed.

### Controlled rate-limit deployment preflight documented — 15 November 2026

- Added Section 15 to `docs/ci-and-bundle-maintenance-review.md`, defining four owner-reviewed gates: source/CI freeze, D1/application safety, explicit deployment approval/execution, and rollback readiness.
- The procedure requires exact source SHA, account-wide namespace uniqueness attestation without inspecting Kaushal resources, tested disposable D1 restore, explicit Worker/environment approval, version/deployment provenance, active binding metadata verification, non-mutating smoke tests, and a pre-approved rollback plan.
- Current release gates remain unmet: namespace uniqueness unverified; D1 restore drill not performed; PR base drift remains; no deployment approval; rollback plan not recorded.
- This is documentation only. No Worker upload/version/deployment, traffic change, binding/settings mutation, D1 export/restore/write/migration, live HQ endpoint request, or customer/personal-site inspection occurred.
- Review document commit: `b40356301d8f3116c3eae9bf9f33674d4973a6ee`.

**Continuation state:** PR #51 must remain Draft and unmerged. Next safe work is read-only reconciliation of PR base drift and review of the current main-branch continuity document; do not update/rebase the PR branch without explicit owner direction.

## 17. Current GitHub verification and release-readiness continuation — 15 November 2026

This section supersedes earlier PR-head and behind-count values in prior sections where they conflict with the live GitHub state recorded below.

### Exact PR and branch state (fresh GitHub reads)

- PR #51 remains **open, Draft, unmerged**.
- Branch: `fix/phase-2-7m-canonical-d1-compatibility-20261114`.
- Exact current PR head: `ad37138c70dabe88c992bfff02a8dfdaa78dd55c`.
- Exact current base/main head: `355341935a8ba87011e52d0c862852900aefe9db`.
- Compare result: `diverged`; PR branch is **157 commits ahead and 3 commits behind** current main. Merge base: `f432865d33e30d988f070ccf0b7b8b68e9442f7f`.
- GitHub PR metadata reports `mergeable: false`. This is consistent with the branch divergence and must not be interpreted as a request to update/rebase.
- The branch API reports `protected: false`; main branch API also reports `protected: false`, and required status checks are disabled in the returned branch metadata.
- No submitted PR reviews, review threads, or PR conversation comments were returned.
- No branch update, merge, PR conversion, review request, or protection mutation was performed.

### Latest-head CI verification

For exact head `ad37138c70dabe88c992bfff02a8dfdaa78dd55c`, the commit-scoped GitHub Actions query returned 13 pull-request workflow runs. All 13 completed with conclusion `success`; none of the returned runs was pending or failed:

- AdSense Readiness Gate
- Accessibility Document Contract
- AI Regression Gate
- PWA Reliability Gate
- Deployment Runtime Reliability Gate
- Security Baseline Gate
- Studio HQ D1 Schema Validation
- Site Integrity Gate
- Security Supply Chain Gate
- Core Web Vitals Protection Gate
- Performance Baseline Gate
- Studio HQ Firebase Auth Tests
- Career Match Browser Runtime Gate

The combined commit-status endpoint returned an empty status list; workflow-run records are the supporting CI evidence.

The exact Studio HQ Firebase Auth job is run `43741854105`, job `hq-auth-unit-tests`, job ID `132896529919`. Its steps all completed successfully: frozen Bun lockfile installation, dependency-audit report capture, dependency version report, HQ test command, TypeScript/production build, Wrangler dry-run, and gRPC artifact scan. The log records that the audit exception matched only the two documented `@grpc/grpc-js` advisory IDs and that the production artifact scan inspected 45 text artifacts without finding gRPC server-auth markers. The job log contains `fail 0`; the workflow succeeded.

This does not mean the upstream dependency advisories are fixed. The exception remains limited to GHSA-m9gg-hp2v-232j (high) and GHSA-f596-whhp-79r4 (low), both in `@grpc/grpc-js`. No dependency override, downgrade, or package change was made during this review.

### D1 backup/recovery runbook review

Read `docs/studio-hq-d1-backup-recovery-runbook.md` from this PR branch.

- It correctly distinguishes a Time Travel bookmark from a separately stored SQL export.
- It warns that export can temporarily block database requests and a Time Travel restore overwrites the live database in place.
- It requires explicit approval, a maintenance window, secure backup handling, verification/checksum evidence, and a second reviewer for destructive restore.
- It explicitly records that no SQL export, import, restore, or disposable-database recovery drill has been performed.
- RTO and RPO are not established; backup/restore must not be described as tested.
- The runbook prohibits testing a restore against the live Studio HQ database.
- The current D1 integrity observations (`quick_check=ok`, empty foreign-key check) do not establish recoverability.

No export, import, restore, D1 write, migration, or Cloudflare operation was performed in this continuation.

### CI and bundle maintenance review

Read `docs/ci-and-bundle-maintenance-review.md` from the PR branch.

- The repository workflow inventory is recorded as 34 files, individually reviewed.
- Five Studio HQ workflows still use older checkout/setup-node immutable pins that produce Node 20 action-runtime deprecation warnings despite Node 24.12.0 being selected for the job.
- The recommended action-pin refresh is a separate CI-maintenance PR; no workflow pins were changed.
- The TWA workflow's Node 20 application runtime requires a separate compatibility-validated update.
- The Work page's static import of `HardwareShowcase3D` brings Three.js into its route chunk. A nested lazy import is a candidate, but no before/after build or browser experiment has yet been performed.
- `assets/js/analytics.js` is an intentional classic IIFE copied into `dist/assets`; it relies on browser globals. Do not convert it to an ES module merely to suppress the Vite warning.
- Punycode and experimental SQLite messages remain non-blocking warnings.

These are separate maintenance workstreams and must not be folded into PR #51 without a deliberate scope decision.

### Current release-readiness decision

**HOLD — PR #51 remains Draft and unmerged.**

Latest CI is green, but that alone is insufficient for approval:

1. PR branch has diverged from current main by 3 commits; current mergeability is false. Do not update/rebase until a deliberate reconciliation plan is reviewed.
2. Account-wide uniqueness of the three configured Rate Limiting namespace IDs remains unverified; do not inspect the Kaushal customer Worker to resolve it.
3. Earlier read-only Cloudflare metadata did not expose the three rate-limit bindings on the currently active Worker version/settings. Wrangler dry-run proves source-config parsing only, not live activation.
4. Active Worker version source commit remains unverified.
5. D1 export and disposable-database restore drill remain unperformed; RTO/RPO unknown.
6. A deployment rollback plan and explicit deployment approval are not recorded.
7. The two Firebase/gRPC dependency advisories remain an explicitly documented exception, not a patched dependency.
8. No independent PR review is present in the current GitHub review list.

### Actions and scope

This update is documentation-only on the existing PR branch. It records current GitHub state and reconciles stale head/behind-count information. No application code, workflow, package, migration, D1 data, Cloudflare setting, Worker version, traffic allocation, personal website, or Kaushal customer project was changed or inspected. No merge or deployment was performed. PR #51 remains Draft and unmerged.

### Next action

Do not rebase/update PR #51 yet. First prepare a read-only reconciliation plan for the three commits now on main, comparing their exact changed paths/content against the PR branch and identifying any overlap or conflict risk. Present a merge-base-aware recommendation before any branch mutation. Continue to keep all release prerequisites separate from CI success.
