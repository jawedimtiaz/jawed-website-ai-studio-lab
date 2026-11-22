# Studio HQ — Authoritative Continuity Record

**Last reconciled:** 22 November 2026  
**Purpose:** Resume work safely in a new ChatGPT conversation without relying on the previous chat transcript.  
**Status:** Working continuity record; update this file at every material project milestone.

## 1. Source-of-truth rules

Use this order of authority:

1. **GitHub repository state** — source code, current branches, PRs, commits, workflow runs, migrations and architecture.
2. **This continuity record** — concise project status, decisions, verified evidence, blockers and next action.
3. **Conversation history and user screenshots** — useful evidence of manual activity, but not a substitute for checking current repository or live system state.
4. **Older exported progress logs** — historical only; never assume they describe the current repository.

Every new conversation must independently verify GitHub before acting. Do not infer that a change was merged, deployed, migrated or tested just because an earlier chat said it was.

## 2. Project boundaries

| Project | Repository / URL | Hosting | Boundary |
|---|---|---|---|
| Studio HQ / Lab | `jawedimtiaz/jawed-website-ai-studio-lab`; https://lab.jawed.co.in/ | Cloudflare Worker, custom domain | Current workstream |
| Personal website | `jawedimtiaz/jawed-website`; https://jawed.co.in/ | Cloudflare Pages | Do not modify without explicit approval |
| Kaushal customer project | https://lab.jawed.co.in/kaushal | Separate customer/proxy setup | Keep code, data, config and deployment separate |

Do not mix repositories, databases, credentials, Worker names or deployment workflows between these projects.

## 3. Non-negotiable operating rules

- Explain technical work in simple language and proceed in numbered phases.
- Give one actionable user-facing step at a time; continue independent read-only investigation without repeatedly asking the user to run prompts.
- Prefer direct inspection of GitHub and connected systems over asking for screenshots or details that can be retrieved.
- Review existing files and project state before changing anything.
- Use a dedicated branch and pull request for repository changes; do not write directly to `main`.
- Do not merge PRs, deploy Workers, run D1 migrations, mutate production data, change Cloudflare settings or enroll the first owner without explicit user approval.
- Never expose secrets, tokens, private credentials or customer data.
- Never purchase domains or paid services without approval.
- Never claim a test passed unless the test result or direct evidence is available. Label user-reported results separately from independently verified results.
- Preserve existing QA test records unless the user explicitly approves cleanup.
- Do not repeat completed audits/tests without a concrete reason or changed code/state.
- For a substantial audit, prefer one consolidated review, one consolidated correction round if needed, and one final recommendation.

## 4. Verified repository checkpoint — 14 November 2026

Repository: `jawedimtiaz/jawed-website-ai-studio-lab`  
Default branch: `main`  
Verified `main` SHA: `f432865d33e30d988f070ccf0b7b8b68e9442f7f`  
Latest main commit message: merge PR #48, “test(site): align integrity checks with React routes and navigation”.

### Relevant pull requests

| PR | State at checkpoint | Verified summary |
|---|---|---|
| [#46](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/46) | Merged | Cloudflare Worker rate-limit binding configuration; merge commit referenced by PR #49 is `7c103f61e2692b6b18eeb9249f02d18ba3ea60a6`. |
| [#48](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/48) | Merged | React route-aware site integrity checks and related validator updates. Its merge commit is current `main` SHA `f432865d33e30d988f070ccf0b7b8b68e9442f7f`. |
| [#49](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/49) | Open, not merged | Manual-only Studio HQ Worker deployment workflow. Head branch `chore/pr47-refresh-main-20261114`, head SHA `8ba814c23e51c6182309cff5d22184084f7a1745`; base is current main. PR metadata reported mergeable at the last check. |
| [#47](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/47) | Open, not merged; dirty | Earlier deployment workflow proposal on `chore/manual-studio-hq-worker-deploy`; superseded by PR #49 and should not be treated as the active deployment candidate. |

For current checks, reviews, workflow runs and mergeability, re-fetch the live PR endpoints. The status table above is a dated snapshot, not a permanent truth.

## 5. Deployment blocker — do not bypass

A source/config mismatch was identified and must be reconciled before PR #49 can be approved for merge or deployment:

- Current `main` `wrangler.jsonc` at SHA `f432865d33e30d988f070ccf0b7b8b68e9442f7f` defines Worker `jawed-website-ai-studio-lab`, entry point `worker.js`, assets `./dist` bound as `ASSETS`, AI binding `AI`, and Lab origin variables.
- That current-main file did **not** contain `d1_databases` or `ratelimits` sections when fetched.
- PR #49's deployment workflow pins its application source to the older PR #46 merge commit `7c103f61e2692b6b18eeb9249f02d18ba3ea60a6`.
- The pinned PR #46 commit's `wrangler.jsonc` was observed to include D1 binding `HQ_DB` (database name `jawed-studio-hq`, database ID `d9ec83ea-7114-4179-af8e-a22ba5494508`) and rate-limit bindings `HQ_SESSION_LIMITER` and `HQ_WRITE_LIMITER`.
- Therefore, PR #49's pinned source is not the same as current `main`. Do not assume it includes PR #48's later changes or that current-main binding removal is intentional.

**Required resolution:** compare the complete ancestry and relevant file diffs; inspect migration history and Cloudflare Worker/D1/rate-limit configuration read-only where possible; establish the intended deployment source and binding contract; then prepare one consolidated correction if needed. Never deploy merely to discover what happens.

PR #49 workflow is manual-only (`workflow_dispatch`) and is not itself a deployment. A passing PR check does not prove a Worker deployment or live runtime test.

## 6. Studio HQ manual QA evidence and test data

### User-reported manual test sequence

The conversation records manual testing of Studio HQ CRM and Projects/Delivery:

- Created CRM client **QA Test Client** (business: Jawed Web Studio QA; email: qa-test@example.com).
- Archived the client, checked archived clients, and restored it.
- Created project **QA Test Website**, linked to QA Test Client.
- Created a Discovery & Requirements milestone and marked it completed.
- Created task **Prepare website requirements document** and marked it completed.
- Submitted and approved a Scope approval with a note.
- Changed QA check **Navigation links work correctly** from Not Run to Pass.
- Refreshed the page and reported that the QA result persisted.

A screenshot supplied on 14 November 2026 visibly shows the active QA Test Client and QA Test Website records and the “Manage tasks, approvals & QA” entry point. The screenshot alone does not prove every prior operation or the backend persistence path.

### Preservation rule

**Do not delete or archive the visible QA Test Client or QA Test Website as cleanup.** Keep them available as known manual test fixtures until the user explicitly approves cleanup. Before any future destructive test, create clearly named disposable fixtures and record the cleanup plan.

### Automated test evidence

An earlier project checkpoint reported 72/72 backend tests passing. Treat that count as historical/reported evidence until the exact current workflow run or test output is rechecked. Do not describe it as a fresh test result.

### Testing limitations

The available checkpoint does not establish a successful live D1 integration test, a fresh production D1 migration, or a live deployment verification. Keep these separate from local/unit tests and UI manual testing.

## 7. Current status — done versus pending

### Completed / verified at this checkpoint

- Current `main` SHA and PR #48 merge state verified through GitHub.
- PR #46 merge and its referenced Worker binding configuration inspected.
- PR #49 open state, branch, head SHA and base SHA inspected.
- Current-main `wrangler.jsonc` inspected.
- Studio HQ manual QA history recorded with evidence limitations.
- Project separation and approval gates documented.

### Pending

1. Complete Phase 2.7L read-only deployment-readiness audit and reconcile the PR #49 pinned-source/current-main mismatch.
2. Inspect full PR #49 diff and all required check suites/check runs; do not rely on only a subset of workflow results.
3. Inspect current migration files and compare the D1/rate-limit binding definitions between current main and the pinned commit.
4. Read-only inspect Cloudflare Worker and D1 metadata if the connected account exposes safe read access; never reveal secret values.
5. Decide whether PR #49 needs one consolidated correction. Do not create another deployment workflow or duplicate PR without need.
6. Obtain explicit approval before merging or manually triggering deployment.
7. After an approved deployment only, verify the deployed Worker, owner authentication, CRM, Projects, Tasks, Approvals, QA persistence and relevant security controls. Record exact evidence and any limitations.

## 8. New-chat handover prompt

Copy this prompt into a new conversation inside the **Jawed Web Studio — Business & Development HQ** ChatGPT Project:

> Continue Jawed Web Studio HQ from the authoritative continuity record in the GitHub repository `jawedimtiaz/jawed-website-ai-studio-lab`.
>
> First read `docs/STUDIO_HQ_CONTINUITY.md` from the current default branch. Then independently verify the latest main SHA, open/merged PRs, branch heads, PR diffs, check suites/workflow runs, Wrangler configuration, migrations and deployment status. Treat the document as a handover guide, not as proof that its dated status is still current.
>
> Resume with the pending Phase 2.7L read-only deployment-readiness audit. Resolve the PR #49 pinned-source versus current-main configuration discrepancy before recommending merge or deployment.
>
> Preserve the QA Test Client and QA Test Website records. Do not repeat completed manual tests without a reason. Keep Studio HQ, Kaushal and jawed.co.in strictly separate.
>
> Do not merge, deploy, migrate D1, change Cloudflare settings, mutate production data or enroll the first owner without my explicit approval. Do not ask me for screenshots or information that can be independently retrieved. Report evidence, uncertainty, completed work, pending work and one next action clearly.

## 9. Update procedure

At each material milestone, update this same file in a branch and PR. Include:

- Date and current main SHA.
- PR number, URL, branch, head SHA, state and merge commit (if merged).
- Workflow/check names and actual result links or run IDs.
- Files/configuration/migrations changed.
- Tests performed, environment, results and limitations.
- Whether anything was deployed or any database/configuration was mutated.
- Decisions, approvals, blockers and exact next action.

Do not create multiple competing “master” logs. Older exported logs may be retained as historical snapshots, but this file is the canonical Studio HQ handover once merged.


## 10. Phase 2.7L read-only Cloudflare and deployment audit — 14 November 2026

### Live Cloudflare inventory (read-only)

Connected Cloudflare identity was confirmed as the Jawed account. The account contains the Lab Worker and a separate `kaushal-path-proxy`; only the Lab Worker and its dedicated HQ database were inspected. No writes, deployments, migrations or setting changes were performed.

Live Worker `jawed-website-ai-studio-lab`:
- Last modified timestamp returned by the Worker inventory: `2026-11-13T17:51:38Z`.
- Live bindings returned by the Worker settings API: `AI`, `ASSETS`, `CANONICAL_ORIGIN`, `ENVIRONMENT`, and `HQ_DB`.
- The live `HQ_DB` binding points to database `jawed-studio-hq` (`d9ec83ea-7114-4179-af8e-a22ba5494508`).
- The live settings response did not list `HQ_SESSION_LIMITER` or `HQ_WRITE_LIMITER`. Treat those rate-limit bindings as **not verified/present in the live Worker**; the API response exposed five bindings and none were rate-limit bindings.
- The Worker inventory also lists `kaushal-path-proxy`; it was not modified or inspected.

Live D1 database `jawed-studio-hq`:
- Database ID: `d9ec83ea-7114-4179-af8e-a22ba5494508`.
- Read-only SQLite schema inspection found tables for clients, projects, project tasks/milestones, approvals, QA checks, users, audit logs and financial-management records, among others.
- Read-only migration ledger query returned exactly `0001_studio_hq_schema.sql` and `0002_financial_management.sql`.
- Do not use Cloudflare's deprecated `num_tables` field as evidence; inspect `sqlite_master` and the migration ledger instead.
- No customer row values or financial records were read or changed.

### Confirmed source/configuration mismatch — stronger evidence

Both current-main config files were inspected:
- `wrangler.jsonc` does not declare `d1_databases` or `ratelimits`.
- `wrangler.toml` also does not declare a D1 binding or rate-limit bindings.
- Current-main `worker.js` imports the Studio HQ API route handlers. Current-main `functions/lib/hqApi.js` explicitly checks `env.HQ_DB` and returns a database-unavailable response if it is missing.
- Therefore, deploying current main with the present Wrangler config risks removing the live `HQ_DB` binding and breaking Studio HQ database operations.
- The current-main `migrations/` directory contains `0002_hq_owner_authorization_hardening.sql`; its SQL defines tables named `hq_users`, `hq_audit_logs`, `hq_clients`, `hq_projects`, `hq_tasks`, and `hq_milestones`.
- The pinned PR #46 snapshot instead has `migrations/hq/0001_studio_hq_schema.sql` and `migrations/hq/0002_financial_management.sql`. The live D1 migration ledger matches these two pinned migration names.
- Current main's root-level migration is not present in the live database's migration ledger. Do not apply it without a schema/compatibility review; it is a different migration layout and has a different table naming scheme from the live schema.
- The live Worker currently retains `HQ_DB` despite its absence from the current repository's Wrangler files. This indicates live deployed metadata and repository configuration are out of sync.

### PR #49 and checks

- PR #49 head branch: `chore/pr47-refresh-main-20261114`, head SHA `8ba814c23e51c6182309cff5d22184084f7a1745`; base is current main.
- Its two retrieved check runs — Site integrity and Secrets and supply-chain baseline — completed successfully.
- The workflow is manual-only, but it checks out the pinned PR #46 merge SHA `7c103f61e2692b6b18eeb9249f02d18ba3ea60a6`, not current main.
- The pinned commit and current main compare as divergent (33 commits ahead on the comparison's head side and 176 behind, with merge base `6603eb25e683ebe33a8a3e44271398475e9c0edf`). Do not treat the pinned source as a simple ancestor snapshot of current main.
- The workflow's validation checks Worker name, assets directory, rate-limit binding names and build output, but it does not validate the D1 binding or migration-directory consistency.
- No PR #49 deployment workflow was run and no deployment was triggered.

### Current-main CI health at this checkpoint

The current main commit `f432865d33e30d988f070ccf0b7b8b68e9442f7f` had several retrieved check runs completed with failures:
- Production static asset reliability.
- Production smoke reliability.
- Production AI GET reliability.
- Production AI POST reliability.

Other retrieved checks on that commit included passing Site integrity, Secrets and supply-chain baseline, Deployment runtime reliability, AI production regression matrix, AdSense privacy readiness and Production availability monitoring contract. The failed job step names were retrieved, but their detailed logs/root causes were not inspected in this audit. Do not claim current main CI is fully green.

### PR #50 continuity-document check

- PR #50 remains open and unmerged at the last verification.
- Its `Secrets and supply-chain baseline` check run completed successfully.
- The commit status endpoint still reported a pending aggregate status with zero legacy statuses; therefore only the one successful check-run is claimed here, not full required-check completion.

### Phase 2.7L decision

**NO-GO for PR #49 merge/deployment in its current form.** Reasons:
1. The deployment workflow pins a divergent older source revision rather than the current reviewed main revision.
2. Current-main Wrangler files omit the live D1 binding and rate-limit configuration, while the running Worker still has D1.
3. The migration layout and schema naming differ between current main and the live database's applied migration ledger.
4. Current main has multiple failed production reliability check runs whose detailed causes remain to be investigated.
5. The live rate-limit bindings were not present in the settings response and are not verified.

### Required consolidated correction/review set

Before any deployment PR is considered ready:
1. Reconcile the intended source revision: deployment must use the reviewed current main commit, not silently deploy the older pinned PR #46 snapshot.
2. Restore/declare the correct `HQ_DB` binding in the intended canonical Wrangler config, matching the live database ID, only after reviewing the correct migration directory and compatibility.
3. Reconcile `wrangler.jsonc` and `wrangler.toml` so there is one unambiguous source of deployment configuration.
4. Reconcile rate-limit configuration against the live Worker and the security design; do not claim live enforcement until independently verified.
5. Preserve the existing D1 database and its applied migrations. Do not apply the root-level owner-hardening migration until its relationship to the live schema and migration ledger is resolved.
6. Inspect the detailed logs for the four failed current-main production reliability checks and resolve or explicitly classify them before deployment approval.
7. Re-run all relevant CI and build checks on the final deployment candidate.

**Next action:** continue read-only investigation of the four failed current-main workflow runs and inspect the exact SQL/schema compatibility before proposing one bounded correction PR. No implementation, merge, deployment or migration is authorized by this audit.


### Additional source-to-database compatibility check

A read-only fetch of the currently deployed Lab Worker script content was performed through Cloudflare. The returned script content included legacy SQL references such as `FROM clients`, `HQ_DB` and `hq_users`, consistent with the existing live D1 schema's `clients`/ `projects` / `project_tasks` / `project_milestones` naming. No secret values were extracted or displayed.

By contrast, the current-main Studio HQ route handlers explicitly query and write:
- `hq_clients`
- `hq_projects`
- `hq_tasks`
- `hq_milestones`

Those four `hq_*` business tables were not present in the live database's `sqlite_master` table listing at the time of inspection. The current-main migration `migrations/0002_hq_owner_authorization_hardening.sql` defines these `hq_*` tables, but it is not in the live D1 migration ledger.

**Implication:** do not deploy current-main Studio HQ handlers against the existing database until a deliberate data/schema migration plan has been reviewed. Existing manually tested client/project records may reside in the legacy table family; switching the application to the new `hq_*` tables without a verified data migration risks making those records appear missing. No rows were queried, changed, deleted or migrated during this check.

### Clarification on current-main production reliability failures

The four failed “Production” reliability jobs were inspected at the log and contract level. Their contracts target `https://jawed.co.in` (the separately protected personal website), not `https://lab.jawed.co.in`:
- Static asset checks expect legacy paths `/assets/css/style.css`, `/assets/js/main.js`, and `/assets/js/analytics.js`; the checks received 404 responses.
- Smoke checks expect older page markers and `/api/ai` JSON behavior on the personal site; several markers were missing and `/api/ai` returned 404.
- AI GET checks to the personal site's `/api/ai` received 404 and HTML rather than the expected JSON response.
- AI POST checks expected a JSON 403 rejection but received HTTP 405.

These are failures in repository monitoring contracts against the personal website's current public behavior. They are **not direct tests of Studio HQ or the Lab Worker**. Do not change `jawed.co.in` to make these old contracts pass without explicit approval. Classify or update the monitoring contracts in the Lab repository only after a separate, approved read-only comparison with the personal site's intended current architecture; do not silently change the protected website.


### Owner-authentication schema incompatibility confirmed

A read-only `PRAGMA table_info(hq_users)` query on the live D1 database confirmed these columns:
`uid`, `email`, `display_name`, `status`, `created_at`, `last_seen_at`.

Current-main `functions/lib/hqApi.js` selects and updates `id`, `role`, `updated_at`, and `last_login_at`, and inserts those fields during first-owner bootstrap. The current-main owner-hardening migration defines a different `hq_users` schema with `id`, `role`, `updated_at`, and `last_login_at`.

Because the existing live `hq_users` table already exists, `CREATE TABLE IF NOT EXISTS hq_users` in the un-applied migration will not transform its columns. Applying that migration as-is would not repair the mismatch. This is a confirmed schema incompatibility, not merely a missing Wrangler binding.

**Approval gate:** do not run first-owner enrollment, deploy current-main auth code, or apply the owner-hardening migration until a reviewed forward-only migration is designed to preserve existing owner/user data and all existing CRM/project/QA/financial records. The current live owner bootstrap state was not changed or queried.


### Continuity PR #50 latest head update

The continuity document was expanded on its branch with the Cloudflare inventory, live D1 migration/schema evidence, deployed Worker binding evidence, PR #49 source mismatch, current-main monitoring-check root causes and owner-authentication schema incompatibility. Latest branch head at this checkpoint: `8c20958a68f3f8ce0eadca39aa94cc098323bd75`. PR #50 remains open and unmerged. The first commit's supply-chain check passed, but no check runs had yet appeared for this latest head when it was queried. Recheck PR #50 checks before merge approval.


## 11. Phase 2.7M — database compatibility and safe migration assessment (read-only)

### Live schema verified against the applied migration lineage

The live database's migration ledger records:
- `0001_studio_hq_schema.sql`
- `0002_financial_management.sql`

These match the two files under `migrations/hq/` in the PR #46 deployment snapshot. The live database therefore follows the original canonical schema family, not the later root-level owner-hardening schema.

The live table family includes:
- CRM: `clients`, `client_contacts`
- Delivery: `projects`, `project_milestones`, `project_tasks`, `repositories`, `deployments`
- Governance: `approvals`, `qa_checks`, `audit_logs`, `activity_notes`
- Finance: `quotations`, `quotation_items`, `invoices`, `invoice_items`, `payments`, `payment_idempotency_keys`, `payment_refunds`, `refund_idempotency_keys`, `financial_sequences`
- Operations: `maintenance_plans`, `assets`
- Identity: `hq_users`

The current-main root migration `migrations/0002_hq_owner_authorization_hardening.sql` creates parallel tables `hq_clients`, `hq_projects`, `hq_tasks`, `hq_milestones`, and `hq_audit_logs`. Current-main route handlers use those parallel names. The live database's canonical records are in the original names. Do not create a second parallel business-data model or copy records into it without a specifically approved migration and reconciliation plan.

### Confirmed column-level differences

Read-only `PRAGMA table_info` checks confirmed:
- Live `hq_users`: `uid`, `email`, `display_name`, `status`, `created_at`, `last_seen_at`; current-main auth code expects `id`, `role`, `updated_at`, `last_login_at`.
- Live `clients`: includes `id`, `name`, `business_name`, `status`, `email`, `phone`, `created_by`, text `created_at`/`updated_at`, archive fields. Current-main client route expects `hq_clients.company` and integer timestamp-style fields.
- Live `projects`: includes `id`, `client_id`, `name`, `project_type`, `status`, `priority`, `summary`, `scope_markdown`, `currency`, `quoted_amount_minor`, creator/updater and archive fields. Current-main project route expects `hq_projects.title`, `description`, and `budget`.
- Live `project_tasks`: includes `project_id`, `milestone_id`, `title`, `description`, `status`, `priority`, `assigned_to`, `due_date`, sort order, creator/updater and archive fields. Current-main task route expects `hq_tasks`.
- Live `project_milestones`: includes `project_id`, `name`, `description`, `status`, `due_date`, sort order and archive fields. Current-main milestone route expects `hq_milestones.title` and `target_date`.
- Live `audit_logs`: records `actor_uid`, `actor_email`, `action`, `entity_type`, `entity_id`, request/IP metadata, before/after/metadata JSON and text `created_at`. Current-main helper inserts into `hq_audit_logs` with a different column model.

The financial tables are already part of the live canonical schema lineage. Their records must not be recreated or overwritten by a second schema.

### Recommended compatibility strategy (proposal only; not implemented)

**Preferred direction: adapt the current-main application/API to the existing canonical D1 schema**, rather than apply the root-level owner-hardening migration and create parallel `hq_*` business tables.

This is the least disruptive direction because:
1. The live database already has the canonical schema and applied financial migrations.
2. It avoids duplicating customer, project, task, milestone and audit records.
3. It preserves existing IDs, foreign keys, archive fields, audit history and integer-minor-unit financial data.
4. The API can provide a stable UI response contract by mapping canonical database fields to the existing UI names where necessary (for example `business_name` to UI `company`, `name` to UI `title`, and `quoted_amount_minor` to a formatted budget only with explicit currency/amount handling).

Before implementation, a bounded code review must determine every consumer of the current API payloads and all write/update/delete paths. It must also inspect the complete canonical schema constraints, foreign keys, triggers and indexes. Then prepare an additive, forward-only migration only for genuinely missing fields/indexes, if any. No destructive table rename/drop or automatic data copy should be part of the first correction.

### Owner authentication plan

Adapt owner authorization to the live `hq_users.uid` identity and existing text timestamp fields, while preserving the existing Firebase UID/email matching and disabled-user checks. Do not infer or invent an owner record. Do not run first-owner bootstrap. Role handling must be explicitly designed against the current owner-only authorization model because the live table has no `role` column.

Audit writes should target the existing `audit_logs` schema and preserve actor identity, action, entity, request metadata and before/after context. Do not create a parallel `hq_audit_logs` table as a shortcut.

### Safe implementation and verification sequence (future; requires approval)

1. Complete a read-only dependency review of all HQ API handlers, frontend consumers, tests, and the canonical schema.
2. Produce a field-by-field API-to-D1 mapping for clients, projects, tasks, milestones, approvals, QA and financial modules.
3. Implement the compatibility changes on a new feature branch, without changing the live database.
4. Add automated tests against a disposable local/test D1 database initialized from the canonical migrations. Test CRUD, foreign keys, archived records, timestamps, money calculations, owner authorization and audit events.
5. Verify build, static checks, security gates and browser/API regression tests against the branch.
6. Review a generated forward-only migration only if the audit proves it is necessary. Do not run it on live D1 at this stage.
7. Open one consolidated PR with the source/config correction and test evidence. Deployment remains a separate explicit approval.

### Phase 2.7M decision

**NO-GO for applying `migrations/0002_hq_owner_authorization_hardening.sql` to the live D1 database.** Its `CREATE TABLE IF NOT EXISTS` statements do not transform the existing `hq_users` schema and would create parallel business tables that the live database does not currently use.

**NO-GO for deploying current-main HQ handlers against the current live D1 schema.** Column and table-name mismatches are confirmed.

**Recommended next implementation target:** one consolidated compatibility PR that adapts current-main handlers/auth/audit logging to the already-applied canonical schema, with tests on disposable D1. No production migration should be needed unless the complete schema review identifies a specific missing requirement.

No live D1 rows were read, inserted, updated or deleted. No migration, deployment, Worker setting change or secret change was performed during Phase 2.7M.


## 12. Critical authentication regression found during Phase 2.7M source review

### Current-main auth implementation is not cryptographically verifying Firebase ID tokens

Read-only source inspection of current main found:
- `functions/lib/hqAuth.js` decodes the JWT header and payload and checks fields such as `alg`, `exp`, `auth_time`, `iss`, `aud`, `sub`, `email_verified` and the owner email allowlist.
- It does **not** verify the JWT signature with Google's published signing certificates or a trusted public key. Checking that the header says `RS256` is not signature verification.
- `tests/hq-authorization.test.js` creates test tokens ending in the literal mock signature `mockSignatureString123` and treats them as authorized when the decoded claims match.
- The current tests therefore validate claim parsing and authorization branches, but do not establish cryptographic Firebase token authenticity.

### Live Worker auth implementation is materially different

A read-only inspection of the deployed Worker script bundle found a different, more complete authentication implementation:
- Requires `RS256` and a non-empty `kid`.
- Fetches and caches Google's Firebase signing certificates.
- Imports the matching X.509 certificate and invokes the bundled JOSE `jwtVerify` implementation.
- Validates the allowed algorithm, Firebase project audience, issuer, expiry/issued-at/auth-time claims and owner email allowlist.
- Queries the existing `hq_users(uid, email, status)` schema and rejects un-enrolled owners rather than automatically bootstrapping an owner from an empty database.

This confirms that the live Worker and current GitHub main are not the same security implementation. The live Worker was inspected read-only; no source, binding, secret, user row or setting was changed.

### Security impact and deployment gate

**Critical: current main must not be deployed as-is.** Its claim-only JWT checks can accept a forged token containing the allowlisted email and fabricated claims because the signature is not authenticated. Combined with the current-main automatic first-owner bootstrap path, this can create an owner enrollment path from attacker-controlled claims if the database is empty. The live deployed Worker currently has a stronger cryptographic verification and explicit owner-enrollment check; do not overwrite it with the weaker current-main implementation.

Required remediation before any deployment:
1. Restore cryptographic Firebase ID-token verification using trusted Google signing certificates (or a correctly configured, maintained JOSE remote-JWKS/certificate verification flow).
2. Require and validate `kid`, RS256, signature, issuer, audience, expiry, issued-at, auth-time, subject and verified email.
3. Remove implicit first-owner bootstrap from normal request handling. Owner enrollment must be a separate controlled operation with an explicit authorization/approval path and must fail closed when no owner exists.
4. Update tests to use valid signed Firebase test tokens or injected test verifiers that explicitly simulate successful/failed cryptographic verification. Never use an arbitrary mock signature as proof of token authenticity.
5. Add negative tests for tampered payloads, invalid signatures, unknown `kid`, wrong issuer/audience, expired tokens, unverified email, and owner allowlist mismatch.
6. Preserve the live Worker’s current strong behavior until a reviewed replacement is proven equivalent or stronger.

### Updated Phase 2.7M recommendation

The preferred canonical-schema compatibility direction remains valid, but the implementation scope must include authentication and audit-log security before any API handler is considered deployable. Treat the authentication regression as a release-blocking security issue, not a routine migration task.


### Firebase project configuration mismatch

Additional read-only inspection confirmed:
- The Lab frontend's `firebase-applet-config.json` uses Firebase project ID `refined-actor-skhlb`.
- The deployed Worker authentication bundle also uses `refined-actor-skhlb` for its issuer and audience checks.
- Current-main `functions/lib/hqAuth.js` hardcodes a different `DEFAULT_PROJECT_ID` (`ai-studio-jawedwebsitelab-4bc53041-fd07-456d-9201-88b74a102fcb`).

Unless a valid environment override is supplied (none was established by this read-only review), current-main auth would reject tokens issued for the actual Lab Firebase project even after signature verification is repaired. The project ID must have one authoritative source and be validated against the client Firebase config and deployed Worker configuration. Do not print or expose Firebase private credentials; the client config project ID is public configuration, not a secret.

## 13. Phase 7.5 Deployment Acceptance & Verification Record — 22 November 2026

### Verified Release Lineage & Deployment Metadata
- **PR:** [#60](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/60) — `Fix Studio HQ Project Details view and harden status updates`
- **Merge commit:** `59c80425c6a5d6f4003d37cc9942316ab58c2ca2`
- **Target branch:** `main` (cleanly merged)
- **Base commit:** `77390fca3b90fd57a588812c3fb7055c89de3e86`
- **Cloudflare Worker:** `jawed-website-ai-studio-lab`
- **Deployed Version ID:** `8b37d74a-bfc7-4367-81a2-ec8d4a8c4fae`
- **Previous Version ID (Rollback target):** `01b8bbef-180c-4594-8224-ba7bbab6b4d5`
- **Previous Git Commit:** `77390fca3b90fd57a588812c3fb7055c89de3e86`
- **Production URL:** `https://lab.jawed.co.in/studio-hq`
- **Deployment Timestamp:** 21 November 2026 18:29 UTC / 23:59 IST

### Verified Test Evidence
1. **TypeScript compilation (`bun run lint` / `tsc --noEmit`):** PASS (0 errors).
2. **Project Details regression suite (`bun run test:hq-project-details`):** PASS (14/14 tests passing).
3. **Canonical integration test suites:** PASS (`bun run test:hq-canonical-projects` and operations test suites passed).
4. **Production client build (`bun run build`):** PASS (17 SPA entry points built cleanly).

### Phase 7.5.3 Authenticated Production Smoke Test
A comprehensive post-deployment smoke test was executed against `https://lab.jawed.co.in/studio-hq` using an authentic Google RS256 token session for the allowlisted owner account (tested 21 November 2026 18:40 UTC / 22 November 2026 00:10 IST):
- **UI-BUG-001 Resolved:** Project Details view rendered without crash upon selecting project `QA Test Website`. Zero unhandled runtime exceptions.
- **BUG-002 Resolved:** Project status selector accurately rendered all 10 canonical statuses mapped to their human-readable UI display labels (`discovery` -> Discovery / Planning, `in-progress` -> In Progress, `review` -> Review, `approved` -> Client Approval, `quoted` -> Quoted, `lead` -> Lead, `blocked` -> Blocked, `on-hold` -> On Hold, `completed` -> Completed, `cancelled` -> Cancelled). Zero non-canonical values accepted.
- **Sub-Tabs Verified:** Successfully loaded project-level Tasks (1 record: *Prepare website requirements document*) and Milestones (1 record: *Discovery & Requirements*). Project-scoped Approvals (0), QA Checks (0), and Notes (0) rendered graceful empty states without errors. (Historical global QA/approval test items from Section 6 were not project-scoped to this record).
- **Request Lifecycle Stability:** Verified request cancellation via `AbortController` and defensive payload normalization; zero application API failures and zero fetch loops.
- **D1 Data Integrity:** Verified zero mutations or migrations during testing. Existing business records (`QA Test Client`, `QA Test Website`) remain intact.
- **Scope Isolation:** Verified zero modifications to personal site `jawed.co.in` or Kaushal customer project.
- **Non-Fatal Observation:** Cloudflare Web Analytics beacon (`static.cloudflareinsights.com`) blocked by Content Security Policy (`connect-src`). Does not impact functionality; noted for future CSP housekeeping.
- **Acceptance Record:** Formally accepted in [Phase 7.5 Deployment Acceptance Record](phase-7-5-deployment-acceptance.md).

## 14. Phase 7.6 CRM Customer Management Remediation & Deployment Record — 22 November 2026

### Background & Confirmed Defects
Following initial deployment of Studio HQ, an HTTP 400 Bad Request error occurred during customer creation (`DEFECT-CRM-000`). Read-only investigation confirmed that `src/components/hq/CrmSection.tsx` was sending non-canonical properties (`website`, `address`, `category`, `lead_source`) and an empty string `id`, violating the canonical D1 contract enforced by `functions/api/hq/canonicalClients.js`. Additionally:
- Customer updates were using `PUT` instead of `PATCH`, returning HTTP 405 Method Not Allowed.
- Customer details crashed on missing contact/project properties.
- Archived customer filtering was missing from the status dropdown toolbar (`DEFECT-CRM-001`).

### Remediation Pull Requests
1. **[PR #62](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/62): CRM API Contract Remediation**
   - **Merge Commit:** `805b5a0656189482d93e46c3ceb4a90d259f4a2b`
   - Added pure helpers `toCanonicalClientPayload()` and `normalizeClientDetailResponse()` in `src/services/hqClientHelpers.ts`.
   - Updated customer save flow to use `POST /api/hq/clients` for creation and `PATCH /api/hq/clients/:id` for updates.
   - Enforced 1-based pagination contract (`page` and `offset = (page - 1) * limit`).
   - Corrected archive filter semantics (`archivedOnly=true` vs default active-only).
   - Added isolated error handling for customer project loading with inline retry.
   - Added 13 automated regression tests in `tests/hq-crm-clients-regression.test.js`.

2. **[PR #63](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/63): CRM Archived Customer Filter Remediation**
   - **Merge Commit:** `7069c33822bea74815719ba36f616df223fcbc10`
   - Resolved DEFECT-CRM-001: exposed "Archived" status filter option in `CLIENT_FILTER_OPTIONS`.
   - Extended `SectionToolbar` in `src/components/hq/HqUiPrimitives.tsx` to support `{ value, label }` tuples while preserving backward compatibility.
   - Preserved all 6 canonical lifecycle statuses in the data model and creation forms.
   - Added Test 14 to `tests/hq-crm-clients-regression.test.js` validating filter options, query param building, SQLite D1 filtering, and action button states.

### Phase 7.6.6 Authorized Production Deployment
- **Cloudflare Worker:** `jawed-website-ai-studio-lab`
- **Deployed Version ID:** `5ac4bbbf-69cf-436d-bf9d-9670e4478d66`
- **Deployment Timestamp:** 22 November 2026 06:51 UTC / 12:21 IST
- **Source Commit:** `7069c33822bea74815719ba36f616df223fcbc10` (Merge PR #63)
- **Previous Version ID (Rollback Target):** `eb87ecca-6711-4d00-b214-f44815cfc2ba`
- **Pre-Deployment Checks:** 43 automated tests passed (14 CRM regression, 14 Project Details, 9 Canonical Clients, 6 Canonical Projects); `bun run lint` (0 errors); `bun run build` (0 errors); `wrangler d1 migrations list HQ_DB --remote` confirmed zero migrations pending.

---

## 15. Phase 7.7 CRM Functional Acceptance Execution Record — 22 November 2026

### Test Plan & Execution Scope
- **Test Plan:** Comprehensive 22-case functional test matrix established in Phase 7.7.1.
- **Execution:** Strictly non-mutating live acceptance testing executed in Phase 7.7.2 against `https://lab.jawed.co.in/studio-hq` using the authenticated owner session (`jawedimtiaz@gmail.com`).
- **Existing Production Fixtures:** Active client `Jawed Web Studio QA` with active project `QA Test Website`; archived client `QA Test Automation Ltd` (`qa-7-6-2-20261122-01`).

### Acceptance Verification Results
1. **Multi-Tab Navigation:** Cycled through CRM > Projects > Overview > CRM without session degradation or state loss. PASS.
2. **Customer Listing & Table Headers:** Active customer `Jawed Web Studio QA` (Status: `lead`, Projects: 1) rendered with correct headers. PASS.
3. **Active/Archived Exclusivity:** Archived record `QA Test Automation Ltd` strictly excluded from "All Status" default view. PASS.
4. **Search Capabilities:** Substring searches for business name (`"Jawed"`), contact name (`"QA Test Client"`), and email (`"qa-test@example.com"`) matched cleanly (HTTP 200). Search reset immediately restored active list. PASS.
5. **Status Filtering:** Systematic check of all 8 options: "Lead" displayed active record; "Prospect", "Active", "Paused", "Completed", "Closed" displayed clean empty states; "Archived" displayed `QA Test Automation Ltd`; "All Status" restored active view. PASS.
6. **Customer Details Drawer:** Opened cleanly on both active and archived records without exceptions. Linked project `QA Test Website` displayed with click-through navigation to Projects module. PASS.
7. **Financial Empty States:** Invoices section on both customer records showed appropriate empty state `No invoices issued for this customer. (0)`. PASS.
8. **Action Buttons:** Contextual buttons correctly rendered Lucide `RotateCcw` with title "Restore Customer" for archived customer, and Lucide `Archive` with title "Archive Customer" for active customer. (Neither clicked). PASS.
9. **Console & API Stability:** Zero JavaScript console errors; zero API 4xx/5xx responses; visual evidence verified in `final_step_188.png`. PASS.

### Known Observation & Limitations
- **OBS-CRM-001 (Phone Search Limitation):** Searching by phone number (`+91 9000000000`) returned 0 results because `functions/api/hq/canonicalClients.js:198` filters `c.name`, `c.business_name`, and `c.email`, but does not query `c.phone`. Documented as a future polish enhancement; does not block acceptance.
- **Pagination Limitation:** Live multi-page pagination could not be exercised because production currently holds 2 records total (<25 records per page threshold). Handled by automated regression Test 11.
- **Mutating Operations:** Live creation, editing, and archive/restore mutations were intentionally not executed to preserve production D1 state. Covered by automated regression tests 5, 6, and 8.

**Final Acceptance Verdict:** `CRM ACCEPTANCE TESTS PASSED WITH MINOR OBSERVATIONS`

---

## 16. Phase 7.8 Milestone Status & Continuity Handoff

### Project Milestone Status
- **Phase 7.5 (Project Details Remediation):** Merged (PR #60), Deployed (`8b37d74a`), Accepted.
- **Phase 7.6 (CRM Customer Management Remediation):** Merged (PR #62, PR #63), Deployed (`5ac4bbbf`), Verified.
- **Phase 7.7 (CRM Functional Acceptance):** Test Plan & Non-Mutating Execution Complete, Accepted with Minor Observations.
- **Phase 7.8 (Documentation & Milestone Acceptance):** Formalized in [Phase 7.8 CRM Milestone Acceptance Record](phase-7-8-crm-acceptance.md) and continuity record updated.

### Current Production Identity
- **Worker:** `jawed-website-ai-studio-lab`
- **Active Worker Version ID:** `5ac4bbbf-69cf-436d-bf9d-9670e4478d66`
- **Active Git Commit:** `7069c33822bea74815719ba36f616df223fcbc10`
- **Target URL:** `https://lab.jawed.co.in/studio-hq`
- **Database:** `HQ_DB` (`jawed-studio-hq` / `d9ec83ea-7114-4179-af8e-a22ba5494508`)

### Pending Enhancements & Next Action
1. **Review & Merge Documentation PR:** Review and merge the dedicated documentation branch for Phase 7.8. (Completed)
2. **Next Milestone:** Proceeded to Phase 8.0.4 — Lead Management & Pipeline Remediation (see Section 17).

---

## 17. Phase 8.0.4 Lead Management & Pipeline Milestone Record — 22 November 2026

### Work Package Progression Summary

Phase 8.0.4 introduces canonical Lead Management and Pipeline Tracking into Studio HQ on the unified `clients` table schema, supporting pipeline stages (`new`, `contacted`, `qualified`, `proposal-sent`, `converted`, `lost`), lead qualification, lost reason tracking, duplicate advisory detection, and conversion to customer with optional project creation.

| Work Package | Scope & Objective | Deliverables | Status | Lineage & Deployment Evidence |
|---|---|---|:---:|---|
| **WP-1** | Lead Pipeline Schema & Migration | Migration `0003_leads_pipeline.sql` + automated tests | **COMPLETED** | Merged in PR #65 (`87517bac25f778d91cff3fc8e0303fcb5be7bf09`) |
| **WP-2** | Canonical Leads API Implementation | `functions/api/hq/canonicalLeads.js`, router, 43+ tests | **COMPLETED** | Merged in PR #66 (`6684682197b345ebd4216d0ea8158b7d0e3e57e4`) |
| **WP-2 D1** | Preview D1 Database Migration | Apply migration 0003 to preview database | **APPLIED** | `jawed-studio-hq-preview` (`623a828d-2909-47e7-a228-130b4eeefef5`) |
| **WP-2 Worker** | Initial Preview Deployment | Deploy merged commit `66846821` to preview worker | **DEPLOYED** | Version `b199901e-fd7d-4487-9948-ee0ac5a627a7` |
| **Defect OBS-UI-001** | CRM Tab Filter Leakage Remediation | Fix filter state leakage between Leads & Customers | **RESOLVED** | Remediated in PR #67; merged at `7dd22a5c4080faa67901b2f024beee383e538639` |
| **WP-3** | Preview Deployment of PR #67 | Deploy merged commit `7dd22a5c` to preview worker | **DEPLOYED** | Version `a50fd458-3cb8-4f4f-98eb-ead5fd19f0db` (100% preview traffic) |
| **WP-4** | CRM Regression Verification | 9-scenario browser regression suite (OBS-UI-001) | **COMPLETED / PASS / CLOSED** | 9/9 TC PASS; zero HTTP 400 errors; zero toasts; zero console errors |
| **WP-5** | Production Migration & Cutover | Apply migration 0003 to prod D1; deploy prod worker | **PENDING** | Next planned work package |

### Defect OBS-UI-001 Remediation Summary (PR #67)
- **Defect:** Navigating from Leads tab (e.g. `status=Converted` or `status=Lost`) to Customers tab temporarily leaked `status=Converted` into `GET /api/hq/clients`, causing transient HTTP 400 `STATUS_INVALID` toasts before resetting to "All".
- **Root Cause:** A single shared `statusFilter` React state variable in `src/components/hq/CrmSection.tsx` was reused across both Leads and Customers views.
- **Remediation:**
  1. Decomposed shared filter state into tab-scoped states: `leadStatusFilter`, `clientStatusFilter`, `followUpStatusFilter`.
  2. Implemented dedicated query builders (`buildClientQueryParams`, `buildLeadQueryParams`) in `src/services/hqClientHelpers.ts`.
  3. Added query sanitizers (`sanitizeClientStatusFilter`, `sanitizeLeadStageFilter`) and canonical stage normalization (`LEAD_DISPLAY_TO_CANONICAL_STAGE_MAP`), mapping display label `"Proposal Sent"` to canonical slug `"proposal-sent"`.
- **Merge Commit:** `7dd22a5c4080faa67901b2f024beee383e538639` on `main`.

### WP-4 QA Regression Verification Results (22 November 2026)
- **Test Environment:** Headless Chromium via Playwright (1280x800) against `https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev/studio-hq`.
- **Authentication:** Authenticated D1 Preview owner session (`jawedimtiaz@gmail.com`).
- **Test Execution:** All 9 test cases passed:
  - `TC-01` Converted Leads → Customers isolation: **PASS**
  - `TC-02` Lost Leads → Customers isolation: **PASS**
  - `TC-03` Qualified Leads → Customers isolation: **PASS**
  - `TC-04` Customers filter isolation: **PASS**
  - `TC-05` Contacts regression: **PASS**
  - `TC-06` Follow-ups regression: **PASS**
  - `TC-07` Projects regression: **PASS**
  - `TC-08` Rapid tab-switching (Leads → Customers → Leads → Customers): **PASS**
  - `TC-09` Filter reset and navigation: **PASS**
- **Network Validation:** Zero HTTP 400 responses, zero `STATUS_INVALID` errors, clean query strings observed across all tab transitions. Canonical mapping `Proposal Sent` → `proposal-sent` verified on live wire.
- **Console & UI Validation:** Zero JavaScript/React errors, zero unhandled promise rejections, zero error toasts.
- **Full QA Acceptance Record:** Documented in [Phase 8.0.4 WP-4 QA Acceptance Record](hq/phase-8-0-4-wp4-acceptance.md).

### Dual-Environment Operational Status

| Parameter | Preview Environment | Production Environment |
|---|---|---|
| **Worker Name** | `jawed-website-ai-studio-lab-preview` | `jawed-website-ai-studio-lab` |
| **Worker Host** | `jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev` | `lab.jawed.co.in` |
| **Active Version ID** | `a50fd458-3cb8-4f4f-98eb-ead5fd19f0db` | `5ac4bbbf-69cf-436d-bf9d-9670e4478d66` |
| **Active Git Commit** | `7dd22a5c4080faa67901b2f024beee383e538639` (PR #67) | `7069c33822bea74815719ba36f616df223fcbc10` (PR #63) |
| **D1 Database** | `jawed-studio-hq-preview` (`623a828d-...`) | `jawed-studio-hq` (`d9ec83ea-...`) |
| **Migration 0003 Status** | **APPLIED & VERIFIED** | **PENDING** (Untouched) |
| **Phase 8.0.4 Status** | Fully Deployed & Verified (WP-1 to WP-4) | Stable Phase 7.8 Baseline |

### Next Planned Action (Roadmap Handover)
**Phase 8.0.4 — WP-5: Production Cutover & Deployment**
- **WP-4 Status:** COMPLETED / PASS / CLOSED.
- **WP-5A Status:** COMPLETED / APPROVED WITH CONDITIONS (see Section 18).
- **WP-5B Status:** NEXT / NOT STARTED (Production migration preparation and backup readiness review).

---

## 18. Phase 8.0.4 WP-5A Production Cutover Security Preflight Record & Release Gate — 22 November 2026

### Preflight Overview & Scope
Prior to executing any production database migration or Worker deployment for Phase 8.0.4, an independent, comprehensive, READ-ONLY security preflight audit was conducted against candidate `main` commit `7dd22a5c4080faa67901b2f024beee383e538639`.

The audit evaluated all authentication paths, owner bootstrap controls, Firebase configuration, production vs. candidate parity, security test coverage, D1 migration safety, and environment isolation.

**Final Verdict:** `APPROVED WITH CONDITIONS`  
**Production Status:** STRICTLY UNTOUCHED (Zero migrations applied; zero deployments triggered; zero production data mutated).

### Preflight Audit Evidence Summary

1. **Authentication Integrity (PASS):**
   - Cryptographic RS256 token verification using Google's public JWKS in `functions/lib/hqAuth.js` and X.509 robot certificates in `functions/lib/hqCanonicalAuth.js`.
   - Algorithm strictly enforced to `RS256`; signing key `kid` is mandatory; unknown key IDs re-fetched once and rejected if absent; invalid signatures rejected.
   - Claims strictly validated: expiry (`exp`), future `iat` / `auth_time`, issuer (`https://securetoken.google.com/refined-actor-skhlb`), audience (`refined-actor-skhlb`), non-empty `sub`, and `email_verified === true`.
   - Hardcoded owner allowlist enforced (`jawedimtiaz@gmail.com`, `jawed@jawed.co.in`).
   - Active owner enrollment in D1 `hq_users` enforced; disabled or non-active owners rejected.
   - Database and rate-limiting failures fail closed (503).
   - Zero signature-verification bypass exists in production request dispatches.

2. **Owner Bootstrap Hardening (PASS):**
   - Normal API requests never auto-enroll owners (un-enrolled tokens return 403 `OWNER_NOT_ENROLLED`).
   - `controlledOwnerBootstrap` requires explicit `ALLOW_CONTROLLED_BOOTSTRAP === 'true'` (disabled in `wrangler.jsonc`).
   - Bootstrap requires verified owner token and checks `SELECT COUNT(*) FROM hq_users`; rejected with 403 `OWNER_ALREADY_EXISTS` if any owner exists.
   - `/api/hq/session/enroll` is permanently blocked at the Worker integration boundary (`RESERVED_FORBIDDEN_HQ_ROUTES`), returning 404 `NOT_FOUND` before reaching any application router.

3. **Firebase Configuration Alignment (PASS):**
   - Frontend `firebase-applet-config.json` and backend authentication both use Firebase Auth project ID `refined-actor-skhlb`.
   - Firestore database ID (`ai-studio-jawedwebsitelab-4bc53041-fd07-456d-9201-88b74a102fcb`) is correctly isolated to Firestore client access and not conflated with the Auth project ID.

4. **Production vs. Candidate Main Parity (PASS):**
   - Candidate `main` commit `7dd22a5c` was compared directly with production source commit `7069c338` (Worker `5ac4bbbf-69cf-436d-bf9d-9670e4478d66`).
   - Core security, authentication, and configuration files are 100% identical (0 bytes diff): `hqAuth.js`, `hqApi.js`, `hqRateLimit.js`, `hqCanonicalAuth.js`, `hqCanonicalApi.js`, `session.js`, and `wrangler.jsonc`.
   - *Explicit Technical Limitation:* Bytecode of the deployed Worker was not directly decompiled/inspected via CLI to avoid non-interactive terminal blocking. Parity is established via cryptographic Git lineage (`7069c338` $\to$ `7dd22a5c`), continuity logs, and configuration comparison.

5. **Automated Security Test Results (PASS):**
   - 135 total automated tests executed locally with 100% pass rate (0 failures):
     - `tests/hq-authorization.test.js`: 10/10 PASS
     - `tests/hq-integration-boundary.test.js`: 12/12 PASS
     - `tests/worker-integration.test.js`: 10/10 PASS
     - `tests/hq-cors-policy.test.js`: 18/18 PASS
     - `tests/hq-canonical-router.test.js`: 13/13 PASS
     - `tests/hq-migration-0003.test.js`: 9/9 PASS
     - `tests/hq-crm-tab-filter-isolation.test.js`: 11/11 PASS
     - `tests/hq-canonical-leads.test.js`: 43/43 PASS
     - `tests/hq-canonical-clients.test.js`: 9/9 PASS
   - *Recommended Future Hardening Tests (Non-blocking):* Explicit missing `kid` header fixture, explicit tampered issuer fixture, explicit arbitrary inactive statuses (`pending`, `suspended`), and additional malformed JWT string fixtures.

6. **Migration Safety & Backward Compatibility (PASS):**
   - Migration `0003_leads_pipeline.sql` is strictly additive (`ADD COLUMN` with constant defaults or nullable types).
   - Commercial account `Jawed Web Studio QA` is safely backfilled as `pipeline_stage = 'converted'`.
   - Archived account `QA Test Automation Ltd` is preserved without mutation (`archived_at IS NULL` guard).
   - Primary contacts normalized before creating `CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contacts_one_primary`.
   - Backward-compatible with active production Worker `5ac4bbbf`.
   - **CRITICAL DEPLOYMENT ORDER:**
     1. Pre-migration Production D1 backup.
     2. Apply migration 0003 to Production D1 (`jawed-studio-hq`).
     3. Verify migration status on remote database.
     4. Deploy candidate main to Production Worker (`jawed-website-ai-studio-lab`).
     5. Perform post-deployment smoke verification.
     *Deploying the Worker before migration will cause immediate HTTP 500 errors on Leads and Customers endpoints due to missing columns.*

7. **Production / Preview Isolation (PASS):**
   - Production Worker `jawed-website-ai-studio-lab` vs Preview `jawed-website-ai-studio-lab-preview`.
   - Production D1 `jawed-studio-hq` (`d9ec83ea-7114-4179-af8e-a22ba5494508`) vs Preview `jawed-studio-hq-preview` (`623a828d-2909-47e7-a228-130b4eeefef5`).
   - Production rate-limit namespaces (`620261114`, `620261115`, `620261116`) vs Preview namespaces (`620261117`, `620261118`, `620261119`).

8. **Rollback Readiness (PASS):**
   - Worker rollback target: `5ac4bbbf-69cf-436d-bf9d-9670e4478d66` (instant rollback via Cloudflare Dashboard or Wrangler).
   - D1 recovery: Pre-migration backup required via `npx wrangler d1 export jawed-studio-hq --remote --output=backup-pre-0003.sql`. *Limitation: Live restoration against production D1 was not tested.*

Full report available in [Phase 8.0.4 WP-5A Security Preflight Report](hq/phase-8-0-4-wp5a-security-preflight.md).

---

## 19. Authoritative ChatGPT Continuation & Handover Checkpoint

### Current Checkpoint Snapshot

| Parameter | Current Value |
|---|---|
| **Last Completed Work Package** | Phase 8.0.4 — WP-5D Production D1 Migration 0003 Application & Verification |
| **Last Completed Audit Verdict** | **COMPLETED / PASS / VERIFIED** (WP-5D) / **COMPLETED / PASS** (WP-5C) |
| **Current Git Commit (Candidate Main)** | `7dd22a5c4080faa67901b2f024beee383e538639` |
| **Current Documentation PRs** | PR #68 (WP-4), PR #69 (WP-5A), PR #70 (WP-5B), PR #71 (WP-5C), WP-5D PR open |
| **Preview Worker Identity** | `jawed-website-ai-studio-lab-preview` (Version `a50fd458-3cb8-4f4f-98eb-ead5fd19f0db`) |
| **Preview D1 Database** | `jawed-studio-hq-preview` (`623a828d-2909-47e7-a228-130b4eeefef5`) — Migration 0003 APPLIED |
| **Production Worker Identity** | `jawed-website-ai-studio-lab` (Version `5ac4bbbf-69cf-436d-bf9d-9670e4478d66` — Active) |
| **Production D1 Database** | `jawed-studio-hq` (`d9ec83ea-7114-4179-af8e-a22ba5494508`) — **Migration 0003 APPLIED** |
| **Production State** | **D1 Migration 0003 Applied & Verified; Production Worker Strictly Undeployed** |

### Work Package Stage Progression

- **WP-1 (Schema & Migration 0003):** COMPLETED / MERGED (PR #65)
- **WP-2 (Canonical Leads API):** COMPLETED / MERGED (PR #66)
- **WP-3 (Preview Deployment of PR #67):** COMPLETED / DEPLOYED (Version `a50fd458`)
- **WP-4 (CRM Regression Verification):** COMPLETED / PASS / CLOSED (PR #68)
- **WP-5A (Production Cutover Security Preflight):** COMPLETED / APPROVED WITH CONDITIONS (PR #69)
- **WP-5B (Production Migration Prep & Backup Readiness):** COMPLETED / READY WITH CONDITIONS (PR #70)
- **WP-5C (Production D1 Backup Execution):** COMPLETED / PASS / VERIFIED (PR #71)
- **WP-5D (Production D1 Migration 0003 Execution):** **COMPLETED / PASS / VERIFIED**
- **WP-5E (Production Worker Deployment & Smoke Verification):** **NEXT / BLOCKED** pending explicit owner approval

### Immediate Next Task: WP-5E
**WP-5E — Production Worker Deployment & Live Smoke Verification**
- Scope: Build and deploy candidate `main` commit `7dd22a5c4080faa67901b2f024beee383e538639` to Production Worker `jawed-website-ai-studio-lab`, followed by post-cutover smoke testing.
- Strict Rule: **BLOCKED** until explicit user authorization is provided.

### Prohibited Operations Until Explicit Owner Approval
- Deploying to Production Worker (`npm run build; npx wrangler deploy`).
- Mutating any production records or test accounts in `jawed-studio-hq`.
- Modifying Cloudflare bindings, secrets, or environment variables.
- Merging open Pull Requests automatically without review.

### Instructions for Resuming in a New Conversation
When continuing Studio HQ in a new chat:
1. Read `docs/STUDIO_HQ_CONTINUITY.md` from the current branch/commit.
2. Read the WP-4 Acceptance Record ([docs/hq/phase-8-0-4-wp4-acceptance.md](hq/phase-8-0-4-wp4-acceptance.md)).
3. Read the WP-5A Security Preflight Report ([docs/hq/phase-8-0-4-wp5a-security-preflight.md](hq/phase-8-0-4-wp5a-security-preflight.md)).
4. Read the WP-5B Production Readiness Report ([docs/hq/phase-8-0-4-wp5b-production-readiness.md](hq/phase-8-0-4-wp5b-production-readiness.md)).
5. Read the WP-5C Production Backup Record ([docs/hq/phase-8-0-4-wp5c-production-backup-record.md](hq/phase-8-0-4-wp5c-production-backup-record.md)).
6. Read the WP-5D Production Migration Record ([docs/hq/phase-8-0-4-wp5d-production-migration-record.md](hq/phase-8-0-4-wp5d-production-migration-record.md)).
7. Review the Phase 8.0.4 progress tracker in Section 19.
8. Independently verify the latest `main` SHA, open PRs, and deployment metadata.
9. **Resume strictly at WP-5E** (Production Worker Deployment & Smoke Verification).
10. Do not repeat completed WP-4, WP-5A, WP-5B, WP-5C, or WP-5D tasks.
11. Do not execute mutating production operations without explicit user confirmation.

---

## 20. Phase 8.0.4 WP-5B Production Migration Preparation & Backup Readiness Review — 22 November 2026

### Review Overview & Scope
Following the approval of WP-5A Security Preflight, WP-5B establishes the operational readiness plan for Phase 8.0.4 production cutover. The review was conducted strictly READ-ONLY.

**Verdict:** `READY WITH CONDITIONS`  
**Production Status:** STRICTLY UNTOUCHED (Zero migrations; zero deployments; zero backups executed).

### Key Readiness Findings

1. **Environment Verification (VERIFIED):**
   - Production Worker `jawed-website-ai-studio-lab` running active version `5ac4bbbf` from commit `7069c338`.
   - Production D1 `jawed-studio-hq` (`d9ec83ea-7114-4179-af8e-a22ba5494508`), migration 0003 unapplied/pending.
   - Preview Worker `jawed-website-ai-studio-lab-preview` running version `a50fd458`, D1 `jawed-studio-hq-preview` (`623a828d-2909-47e7-a228-130b4eeefef5`), migration 0003 applied and verified.
   - GitHub Actions automatic deployments are **disabled** (all releases are manual-only).

2. **Backup Capability (VERIFIED & PROPOSED):**
   - Supported primary method: Logical SQL export via `npx wrangler d1 export jawed-studio-hq --remote --output=./backups/jawed-studio-hq-pre-0003-<timestamp>.sql` (PROPOSED — NOT EXECUTED).
   - Secondary mechanism: Cloudflare D1 Time Travel point-in-time bookmark (`npx wrangler d1 time-travel info`).
   - Integrity verification plan: Check non-zero byte size, inspect SQL header/footer, and test parse against local SQLite.
   - *Limitation:* Remote database restoration from export has not been live-tested against production D1.

3. **Migration 0003 Safety (VERIFIED):**
   - 10 additive columns added to `clients` with safe constant defaults or nullable types.
   - Backfill Rule 1 safely converts commercial account `Jawed Web Studio QA` (`pipeline_stage = 'converted'`).
   - Backfill Rule 2 safely handles closed prospects.
   - Archived account `QA Test Automation Ltd` explicitly excluded from backfill (`archived_at IS NULL` guard).
   - Contact normalization ensures single-primary invariant before partial unique index `idx_client_contacts_one_primary` is created.
   - D1 tracks execution in `d1_migrations` table; zero locking/downtime risks for small database.

4. **Pre-Migration and Post-Migration SQL Plans (PREPARED):**
   - Pre-migration read-only verification queries formulated to confirm table schema, migration history, and record inventory.
   - Post-migration verification queries formulated to assert migration history, column existence, backfill correctness, contact invariant, and row-count consistency.

5. **Rollback Readiness Plan (ESTABLISHED):**
   - Worker rollback: Instant rollback to `5ac4bbbf-69cf-436d-bf9d-9670e4478d66` via Cloudflare Dashboard or Wrangler CLI (< 10 seconds).
   - Database rollback independence: Because migration 0003 is additive, rolling back the Worker to `5ac4bbbf` does not require rolling back the D1 database.
   - Database disaster recovery: Full restore from pre-migration SQL backup (`npx wrangler d1 execute jawed-studio-hq --remote --file=...`).

6. **Sequential Release Checklist:**
   - **WP-5C:** Production D1 backup execution (COMPLETED / PASS / VERIFIED).
   - **WP-5D:** Production D1 migration 0003 execution (BLOCKED pending explicit owner approval).
   - **WP-5E:** Production Worker deployment and live smoke verification (PENDING D1 migration).

Full readiness documentation: [Phase 8.0.4 WP-5B Production Readiness Report](hq/phase-8-0-4-wp5b-production-readiness.md).

---

## 21. Phase 8.0.4 WP-5C Production D1 Backup Execution & Integrity Record — 22 November 2026

### Backup Overview & Scope
Following explicit owner approval, Phase 8.0.4 WP-5C (Production D1 Database Backup Execution & Integrity Verification) was executed and independently audited.

**Work Package Status:** `COMPLETED / PASS / RECORDED`  
**Production Status:** STRICTLY UNTOUCHED (Backup exported to external storage; zero database mutations; zero schema modifications; Worker undeployed).

### Verified Backup Metadata

1. **Target Database Identity:**
   - Database Name: `jawed-studio-hq`
   - Database ID: `d9ec83ea-7114-4179-af8e-a22ba5494508`
   - Binding: `HQ_DB`
   - Environment: Remote Production (Preview `623a828d` untouched)
2. **Production Worker State:**
   - Worker Name: `jawed-website-ai-studio-lab`
   - Active Version: `5ac4bbbf-69cf-436d-bf9d-9670e4478d66`
   - Target URL: `https://lab.jawed.co.in/`
3. **Execution Tooling:**
   - Wrangler CLI Version: `4.166.0`
   - Authenticated Account: `jawed@jawed.co.in` (`eee02f4eb9f945c9ca139ba2847f4b39`)
4. **Captured D1 Time Travel Point-in-Time Bookmark:**
   - Command: `npx wrangler d1 time-travel info jawed-studio-hq`
   - Bookmark: `00000073-00000000-0000512b-e5e8c4f8ff638d5877932d998632a5c1`
   - Timestamp: `2026-11-22T23:26:13+05:30` (UTC: `2026-11-22T17:56:13Z`)
   - Standby Restore Command: `npx wrangler d1 time-travel restore jawed-studio-hq --bookmark=00000073-00000000-0000512b-e5e8c4f8ff638d5877932d998632a5c1`
5. **Logical SQL Export Artifact:**
   - Command: `npx wrangler d1 export jawed-studio-hq --remote --output="<output-path>"`
   - Filename: `jawed-studio-hq-pre-0003-20261122-232627.sql`
   - Full Path: `C:\Users\user\JawedStudioBackups\Phase-8-0-4\jawed-studio-hq-pre-0003-20261122-232627.sql`
   - File Size: `32,167` bytes (`0.0307` MB)
   - SHA-256 Checksum: `1D74EF2F99DFEA2000EDF0BFF4266C89204303D10BB2AF5AA91B58141B410BA9`
   - Storage Location: Local secure directory outside Git repository
6. **Multi-Layered Integrity Verification:**
   - File existence and non-zero byte size confirmed.
   - SQL header inspected (`PRAGMA defer_foreign_keys=TRUE;`).
   - Verified 24 Studio HQ tables created + `sqlite_sequence`.
   - Migration history verified: migrations 1 and 2 present; migration `0003` strictly absent / pending.
   - In-memory SQLite replay (`node:sqlite`): Executed full SQL dump with **zero syntax or constraint violations** across 25 tables and all records.
   - Zero sensitive records exposed to public logs or Git tracking.
   - `git status` verifies zero backup files staged or tracked.

Full backup documentation: [Phase 8.0.4 WP-5C Production Backup Record](hq/phase-8-0-4-wp5c-production-backup-record.md).

---

## 22. Phase 8.0.4 WP-5D Production D1 Migration 0003 Application & Verification Record — 22 November 2026

### Migration Overview & Scope
Following explicit owner approval, Phase 8.0.4 WP-5D (Production D1 Migration 0003 Application & Verification) was executed against the remote Production D1 database.

**Work Package Status:** `COMPLETED / PASS / VERIFIED`  
**Production Migration Status:** `0003_leads_pipeline.sql APPLIED & VERIFIED`  
**Production Worker Status:** `STRICTLY UNDEPLOYED` (Active version `5ac4bbbf-69cf-436d-bf9d-9670e4478d66` remains running; WP-5E gated).

### Key Execution & Verification Evidence

1. **Backup Prerequisite Verified:**
   - Pre-migration backup `C:\Users\user\JawedStudioBackups\Phase-8-0-4\jawed-studio-hq-pre-0003-20261122-232627.sql` verified.
   - Size: `32,167` bytes (Exact match).
   - SHA-256: `1D74EF2F99DFEA2000EDF0BFF4266C89204303D10BB2AF5AA91B58141B410BA9` (Exact match).
2. **Migration Execution:**
   - Command: `npx wrangler d1 migrations apply jawed-studio-hq --remote`
   - Database: `jawed-studio-hq` (`d9ec83ea-7114-4179-af8e-a22ba5494508`)
   - Result: 19 SQL commands executed in 6.81ms; status ✅.
3. **Migration Record Verification:**
   - `SELECT id, name, applied_at FROM d1_migrations`:
     - 1: `0001_studio_hq_schema.sql` (2026-11-06 05:02:32)
     - 2: `0002_financial_management.sql` (2026-11-11 06:10:07)
     - 3: `0003_leads_pipeline.sql` (2026-11-22 18:06:02)
   - `npx wrangler d1 migrations list jawed-studio-hq --remote` confirmed `✅ No migrations to apply!`.
4. **Schema Verification:**
   - 10 additive columns added to `clients`: `lead_origin`, `pipeline_stage`, `estimated_value_minor`, `currency`, `category`, `next_follow_up_at`, `converted_at`, `conversion_token`, `lost_at`, `lost_reason`.
   - 4 performance and integrity indexes active: `idx_clients_lead_pipeline`, `idx_clients_customer_isolation`, `idx_clients_follow_up`, `idx_client_contacts_one_primary`.
5. **Data Preservation & Backfill Classification:**
   - Total clients: 3 (Preserved).
   - Backfill: 2 active commercial clients converted (`pipeline_stage = 'converted'`); 1 archived client safely isolated (`pipeline_stage = 'new'`).
   - Relational counts preserved: `client_contacts` (0), `projects` (1), `project_milestones` (1), `project_tasks` (1), `invoices` (0).
6. **Database Integrity Audit:**
   - `PRAGMA foreign_key_check`: 0 violations.
   - `PRAGMA quick_check`: `ok`.
7. **Regression Test Verification:**
   - `npm run lint`: 0 errors.
   - `node --test tests/hq-migration-0003.test.js`: 9/9 PASS.
   - `node --test tests/hq-canonical-leads.test.js`: 43/43 PASS.
8. **Infrastructure Isolation Confirmation:**
   - Production Worker `jawed-website-ai-studio-lab` remains on version `5ac4bbbf-69cf-436d-bf9d-9670e4478d66` (HTTP 200 on `https://lab.jawed.co.in/studio-hq`).
   - Preview D1 `jawed-studio-hq-preview` remains untouched.
   - WP-5E (Production Worker Deployment) was NOT executed.

Full migration record: [Phase 8.0.4 WP-5D Production Migration Record](hq/phase-8-0-4-wp5d-production-migration-record.md).


