# Studio HQ — Authoritative Continuity Record

**Last reconciled:** 14 November 2026  
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


## 13. Phase 2.7N — PR #54 release-gate reconciliation (17 November 2026)

### Branch and review status
- Active candidate: PR #54, `reconcile/studio-hq-canonical-main-20261117`.
- PR remains draft, open and unmerged. No production deployment or D1 migration was performed.
- Latest review identified two release-gate issues in addition to the earlier schema/authentication reconciliation.

### Cloudflare Rate Limiting bindings restored in source configuration
- The PR #54 `wrangler.jsonc` omitted all three rate-limit bindings even though the HQ API handlers fail closed when a required binding is absent.
- Restored the existing candidate values from the earlier unmerged PR #51 configuration:
  - `HQ_SESSION_LIMITER`, namespace `620261114`, 10 requests / 60 seconds.
  - `HQ_WRITE_LIMITER`, namespace `620261115`, 30 requests / 60 seconds.
  - `HQ_RATE_LIMITER`, namespace `620261116`, 120 requests / 60 seconds.
- Commit: `c07df215e4ede7d0e61274d805e3984ad0de711c`.
- Read-only Cloudflare account inspection found two deployed Worker scripts. Neither currently exposes a Rate Limiting binding. This is not an authoritative registry of every namespace ID ever used; account-wide uniqueness must remain a deployment prerequisite.
- The source change has not yet been verified by a new Wrangler dry run or a deployed runtime test.

### AI knowledge freshness gate reviewed
- PR #54 CI failed the AI knowledge coverage validator because the recorded review date was 2026-11-14 while the tracked grounding sources `index.html` and `src/data/toolsData.ts` had later commits.
- Reviewed the homepage metadata and the tool metadata corresponding to the affected sitemap entries against the current knowledge summaries. The current summaries remain consistent with the reviewed tool descriptions/purposes; no unsupported feature claims were added.
- Updated `assets/data/ai-knowledge.json` review date to `2026-11-17`.
- Regenerated `functions/lib/ai-knowledge-data.js` from the JSON source and verified byte-for-byte expected serialization.
- Commits: `74c2bedd8d5d2a1fcf9d6b6dcb8566e58b7aed59` and `0729416dd3681e64e1ba519dd203851d69c684c4`.

### Current verification state
- Earlier PR #54 head `e5c394e22338171f4a37cdc61fa7ce45852002e9`: 8 retrieved workflow checks passed; AI Regression Gate failed on stale knowledge review metadata.
- On that earlier head, Studio HQ auth workflow reported 132 tests passed, 0 failed. Wrangler dry run recognized `HQ_DB`, but did not list any Rate Limiting bindings.
- Latest branch head: `0729416dd3681e64e1ba519dd203851d69c684c4`.
- GitHub had not yet returned workflow runs or combined status checks for the latest head when this record was written. Do not treat the latest configuration or knowledge-freshness updates as CI-verified.
- Next required verification: run the AI Regression Gate and Studio HQ Firebase Auth Tests against the latest branch head; confirm Wrangler dry-run output explicitly lists all three rate-limit bindings.
- Keep PR #54 draft and do not merge, deploy, migrate D1, enroll owners, or alter customer/financial records until all checks pass and the remaining release prerequisites are reviewed.


### Manual CI verification access — 17 November 2026
- The GitHub connector did not return workflow runs or combined status checks for the newer commits, so their validation must not be inferred from the earlier successful run.
- The AI Regression Gate already supports `workflow_dispatch`.
- Added `workflow_dispatch` to `.github/workflows/studio-hq-auth-tests.yml` so the Studio HQ auth/build/Wrangler dry-run gate can also be run manually against the current candidate branch.
- Workflow change commit: `71f046df56db9a7f7711a7682235ea6cdef9a4cb`.
- Manual runs are still pending. The exact current branch must be selected when dispatching both workflows.


## 14. Phase 2.7N — latest PR #54 CI verification (17 November 2026)

### Exact branch head and workflow results
- Candidate branch: `reconcile/studio-hq-canonical-main-20261117`.
- Verified head SHA: `b7ae6923caefbe6a3722df5113342a2f8eec0aa8`.
- PR #54 remains open, draft and unmerged. No merge, deployment, D1 migration, secret change or live Worker configuration change was performed.
- GitHub Actions returned 9 completed workflow runs for this exact SHA; all 9 concluded `success`:
  - Security Baseline Gate — run `44052716483`.
  - Studio HQ Firebase Auth Tests — run `44052716608`.
  - Studio HQ D1 Schema Validation — run `44052716488`.
  - AI Regression Gate — run `44052716477`.
  - PWA Reliability Gate — run `44052716563`.
  - Deployment Runtime Reliability Gate — run `44052716553`.
  - Site Integrity Gate — run `44052716562`.
  - AdSense Readiness Gate — run `44052716527`.
  - Security Supply Chain Gate — run `44052716598`.
- These were GitHub pull-request-triggered workflow runs on the exact branch head; a separate manual dispatch was not needed for this verification.

### Auth/build/Wrangler job evidence
- Studio HQ Auth job ID: `133934242552`; completed successfully.
- Test output: 132 tests, 132 passed, 0 failed.
- TypeScript and production build step passed.
- Wrangler `deploy --dry-run` passed.
- Wrangler output explicitly listed:
  - `HQ_DB` — D1 database `jawed-studio-hq`.
  - `HQ_SESSION_LIMITER` — 10 requests / 60 seconds.
  - `HQ_WRITE_LIMITER` — 30 requests / 60 seconds.
  - `HQ_RATE_LIMITER` — 120 requests / 60 seconds.
  - `AI` and `ASSETS`.
- This verifies that the PR's Wrangler configuration parses and the dry-run recognizes all three rate-limit bindings. It does not provision those bindings on the live Worker or prove live API behavior.

### AI regression gate evidence
- AI Regression Gate run `44052716477`, job `133934320052`, completed successfully on the same SHA.
- Site integrity validation and AI regression matrix steps passed.

### Remaining release blockers
1. Rate-limit namespace IDs `620261114`, `620261115`, and `620261116` were reused from an earlier unmerged candidate configuration. The deployed Worker inventory showed no currently configured rate-limit bindings, but that is not a complete account-wide historical namespace registry. Confirm uniqueness/ownership before provisioning or deployment.
2. The live Lab Worker has not been updated with these bindings; protected HQ APIs must be treated as unavailable/fail-closed until a separately approved deployment/configuration change and live verification.
3. The preview D1 database remains separate and no preview or production migration was applied.
4. The backup/restore drill and RTO/RPO remain outstanding.
5. PR #54 remains draft. Do not merge, deploy, migrate D1, enroll an owner, or alter customer/financial records without explicit approval.

### Next review
Perform a final read-only release review of rate-limit namespace provisioning/uniqueness and the preview-versus-production D1 migration plan. Keep PR #54 draft until these operational gates are resolved and an explicit approval is obtained.


## 15. Phase 2.7N — named preview environment binding gap (17 November 2026)

### Finding
- Read the Cloudflare Wrangler environments documentation: bindings and environment variables are non-inheritable. A named environment must declare the bindings it uses explicitly.
- Source: https://developers.cloudflare.com/workers/wrangler/environments/
- Current PR #54 `wrangler.jsonc` defines `env.preview` with preview Worker name, preview vars and a separate preview D1 database.
- The `env.preview` block does not declare `AI` or any of the three `ratelimits` bindings. The top-level declarations therefore cannot be assumed to be present in the named preview environment.
- The successful Auth workflow ran the default `wrangler deploy --dry-run` only. It listed `HQ_DB`, `AI`, `ASSETS` and all three rate-limit bindings for the default environment. It did not validate `--env preview`.

### Consequence
- Do not treat the preview Worker as ready for Studio HQ API testing. The missing preview rate-limit bindings can cause the HQ API's fail-closed rate limiter to return 503. Code that expects `env.AI` may also fail in the named preview environment.
- Preview assets binding behavior should be confirmed by a dedicated Wrangler preview dry-run rather than inferred from the default dry-run.

### Required next action
1. Review the exact Wrangler preview configuration semantics for each binding used by the Worker.
2. Decide whether preview should have isolated rate-limit namespaces or deliberately share counters with the Lab Worker. Do not invent new namespace IDs or reuse production IDs without a documented decision.
3. Add the necessary preview bindings only after the namespace strategy is resolved.
4. Add a CI validation step for `wrangler deploy --dry-run --env preview` and inspect its output for the preview D1, AI, Assets and rate-limit bindings.
5. Keep PR #54 draft; no deployment, migration or Cloudflare resource mutation was performed during this review.

### Namespace inventory limitation
- Cloudflare's API OpenAPI search exposed zone-level WAF rate-limit rule endpoints, not a read-only account-wide inventory of Workers Rate Limiting binding namespace IDs.
- The current deployed Worker inventory is not a complete account-wide namespace registry. Namespace ID uniqueness/ownership therefore remains unverified and must not be claimed as confirmed.


## 16. Phase 2.7O — refined preview binding analysis (17 November 2026)

### Corrections to the initial preview note
- Cloudflare's Wrangler configuration reference lists `assets` as an inheritable key. Do not state that `ASSETS` must be duplicated under `env.preview`; the top-level assets configuration can be inherited.
- The definite missing preview bindings in the current config are `AI` and the rate-limiting bindings. Preview already has its own explicit `HQ_DB` D1 binding and its own `ENVIRONMENT` / `CANONICAL_ORIGIN` vars.
- Sources:
  - https://developers.cloudflare.com/workers/wrangler/configuration/
  - https://developers.cloudflare.com/workers/wrangler/environments/

### Rate-limit isolation finding
- Cloudflare documents that two bindings sharing the same `namespace_id` in one account share counters for the same key across Workers.
- Cloudflare also states that rate-limit namespace IDs are unique within the account and that rate-limit bindings are not currently visible in the Cloudflare dashboard.
- Source: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Therefore, using the three Lab namespace IDs in preview would share counters whenever the same key is used. It is not acceptable to describe that arrangement as isolated preview rate limiting.
- The current account inspection cannot provide a complete account-wide historical namespace registry. Do not invent new IDs or claim account-wide uniqueness without evidence.
- A potential code-level isolation approach is to add an explicit environment prefix to every rate-limit key while deliberately sharing the namespace IDs. This would separate counters for identical user/IP keys across `lab` and `preview`, but it still shares the same namespace resource and should be adopted only after reviewing every call site and tests. A distinct namespace per environment is cleaner if account-wide uniqueness can be established.
- No Wrangler or rate-limit code was changed as part of this review.

### Current preview config status
- `env.preview` has its own Worker name, vars and D1 database.
- `AI` is currently only declared at the top level and is a binding; Cloudflare's environment rules say bindings are non-inheritable. It must be explicitly declared in the preview environment if preview code reads `env.AI`.
- The three `ratelimits` are currently declared only at top level. Confirm Wrangler v4.160.1's exact schema/behavior for `ratelimits` inside a named environment before editing the config; do not assume the property can be nested based only on the generic binding rule.
- `assets` is inheritable and remains top-level.
- The existing auth workflow runs only the default-environment Wrangler dry-run. It does not currently run `wrangler deploy --dry-run --env preview`.

### Next technical verification
1. Resolve the exact Wrangler 4.160.1 schema behavior for `ai` and `ratelimits` in named environments using the installed package/schema or a no-deploy CI dry-run.
2. Add a preview dry-run and assertions to CI so the preview build verifies `HQ_DB`, `AI`, `ASSETS` and rate-limit bindings in the resolved preview configuration.
3. Choose and test the rate-limit isolation strategy before introducing any namespace IDs or changing limiter key construction.
4. Keep PR #54 draft and do not deploy, migrate D1 or mutate Cloudflare resources.


## 17. Phase 2.7O — preview bindings implemented and dry-run verified (17 November 2026)

### Wrangler 4.160.1 source-level confirmation
- Inspected Cloudflare Workers SDK configuration source used by Wrangler:
  - `packages/workers-utils/src/config/environment.ts` explicitly marks `ai` and `ratelimits` as `@nonInheritable` and says each must be specified in every named environment.
  - The same source explicitly marks `assets` as `@inheritable`.
- This confirms the correct preview binding contract: explicit preview `ai` and `ratelimits`; inherit top-level `assets`; retain the preview-specific `HQ_DB` and vars.
- Source file: https://github.com/cloudflare/workers-sdk/blob/main/packages/workers-utils/src/config/environment.ts

### Preview configuration changes
- Updated `wrangler.jsonc` on PR #54 branch:
  - Added `ai.binding = "AI"` inside `env.preview`.
  - Added preview-specific `HQ_SESSION_LIMITER`, `HQ_WRITE_LIMITER`, and `HQ_RATE_LIMITER` declarations.
  - Selected candidate preview namespace IDs `620261117`, `620261118`, and `620261119`, respectively.
  - Preserved the existing preview D1 database `jawed-studio-hq-preview` and preview vars.
  - Did not duplicate `assets`; it is inherited from top-level config.
- Config commit: `143941edfaf2a1c512be631ce3b23227eb6607a1`.
- The candidate namespace IDs were selected after read-only inspection found only two deployed Workers in the account and neither currently exposes rate-limit bindings. The inventory is not an authoritative historical namespace registry; account-wide historical uniqueness is not proven. Do not deploy or provision these namespaces until this remaining release prerequisite is accepted/verified.

### CI validation added
- Updated `.github/workflows/studio-hq-auth-tests.yml` to run:
  `npx wrangler deploy --dry-run --env preview --outdir .wrangler-preview-dry-run`.
- Added assertions that the preview dry-run output lists `HQ_DB`, `AI`, `ASSETS`, `HQ_SESSION_LIMITER`, `HQ_WRITE_LIMITER`, and `HQ_RATE_LIMITER`.
- Updated the gRPC artifact scan to inspect the preview dry-run bundle as well.
- Workflow commits: `bdc1eb6c5427b716a0e505811939afc92ebda3d6` and `1558ae97970870de15bee7e4a387f74e58246905`.

### Exact CI evidence on latest application/configuration head
- Candidate head at verification: `1558ae97970870de15bee7e4a387f74e58246905`.
- Studio HQ Firebase Auth Tests run `44054052747`, job `133938691478`: completed successfully.
- Auth/API tests: 132 passed, 0 failed.
- TypeScript and production build: passed.
- Default Wrangler dry-run: passed and listed production/default D1, AI, three rate limit bindings and ASSETS.
- Preview Wrangler dry-run: passed and listed:
  - `HQ_DB (jawed-studio-hq-preview)`
  - `AI`
  - `HQ_SESSION_LIMITER` (10/60s)
  - `HQ_WRITE_LIMITER` (30/60s)
  - `HQ_RATE_LIMITER` (120/60s)
  - `ASSETS`
  - `ENVIRONMENT="preview"`
  - `CANONICAL_ORIGIN="https://lab.jawed.co.in"`
- gRPC artifact scan inspected 48 text artifacts and found no `@grpc/grpc-js` or gRPC server-auth markers.
- These were dry-runs only. No preview Worker was deployed and no D1 migration or Cloudflare resource mutation occurred.

### Remaining workflow state
- On exact head `1558ae97970870de15bee7e4a387f74e58246905`, eight retrieved workflows had completed successfully; AdSense Readiness Gate was still pending with no job payload returned at the last check. Do not claim the full workflow set is green until that run reaches a completed success conclusion.
- The preview config and CI validation are now proven by Wrangler dry-run, but preview runtime integration/auth and D1 migration execution remain untested.
- PR #54 remains draft. Do not merge, deploy, migrate D1, enroll an owner or mutate customer/financial records without explicit approval.


### CI follow-up — AdSense workflow terminal state (17 November 2026)
- Rechecked all nine workflow runs for application/configuration head `1558ae97970870de15bee7e4a387f74e58246905`.
- Eight workflows completed successfully.
- AdSense Readiness Gate run `44054052736` completed with conclusion `cancelled`, not success and not failure. No job payload was available for that run.
- Therefore the exact result is **8 success, 1 cancelled**. Do not describe the entire nine-workflow suite as green.
- The cancellation does not invalidate the independently successful Studio HQ Auth job or preview Wrangler dry-run. The AdSense gate must be rerun successfully if the release process requires every repository gate green.


### AdSense workflow dispatch experiment and rollback (17 November 2026)
- To obtain a fresh AdSense readiness result after the earlier cancelled run, briefly added `workflow_dispatch` to `.github/workflows/adsense-readiness.yml`.
- The resulting push-triggered run `44054326158` failed immediately with the workflow path as its run name and returned no job payload. No validator job ran and no AdSense readiness result was produced.
- Reverted the trigger change in commit `4c6782236e7a10a602a3839ca9a8b6fa003a4829`; the workflow's original trigger configuration is restored.
- Do not count run `44054326158` as a test failure in the AdSense validator itself; it produced no job result. The earlier AdSense run `44054052736` remains cancelled, so a fresh successful AdSense result is still outstanding.
- No production or Cloudflare resources were affected by this workflow-only experiment.


## 18. Phase 2.7P — financial migration test coverage gap corrected (17 November 2026)

### Read-only migration review
- Reviewed `migrations/hq/0001_studio_hq_schema.sql` and `migrations/hq/0002_financial_management.sql`.
- Both migrations are additive in their current content: table/index creation and append-only audit triggers. No `DROP TABLE`, `DROP COLUMN`, or destructive data rewrite was found in these two files.
- The preview D1 database remains separate; no remote D1 query or migration was run as part of this review.

### Test coverage defect identified
- The prior `scripts/test-hq-migration.mjs` read and executed only `0001_studio_hq_schema.sql`.
- The CI workflow `.github/workflows/studio-hq-d1-schema.yml` invoked that script, so the financial migration `0002_financial_management.sql` was not being executed by the schema CI test despite being present in the migration directory.
- This was a test-coverage gap, not an observed production schema failure.

### Correction and exact evidence
- Updated `scripts/test-hq-migration.mjs` to execute both migrations in order against an isolated in-memory SQLite database.
- Expanded expected schema validation from 17 to 23 tables, including the six financial tables introduced by migration 0002.
- Added a financial constraint test that creates a quotation and line item, creates an invoice linked to the quotation, and verifies the unique one-invoice-per-quotation constraint rejects a second invoice.
- Commit: `e99df0d211ba81029a271e5260e8d52983451cd8`.
- GitHub Actions D1 Schema Validation run `44054536233`, job `133940373492`: migration test completed successfully.
- Exact output: `Studio HQ D1 schema validation passed: both migrations, 23 tables, archive/restore, financial constraints, FK restrictions, append-only audit, JSON validation.`
- This test uses isolated in-memory SQLite. It does not migrate or write to the live or preview D1 databases.

### Current verification boundary
- This is stronger local/CI migration evidence, but not a remote D1 compatibility test. Keep preview and production migration execution behind explicit approval and a backup/restore plan.

## 19. Phase 3.0 — Studio HQ UI workstream handoff (17 November 2026)

### Purpose and scope
- The next development priority is the Studio HQ dashboard UI, not further expansion of backend scope.
- Target: improve the private `/studio-hq` experience with a professional, responsive business-management dashboard while preserving the existing API contracts, Firebase authentication, server-side owner authorization, data model and security controls.
- Intended dashboard areas include overview, clients/CRM, projects and delivery, tasks/milestones, approvals, QA, quotations, invoices, payments and business operations. Do not assume every module is already exposed in the current UI; inspect API and page capabilities before implementing each area.
- Treat all data as private business/customer information. Use synthetic/mock data for visual development until an explicitly approved and verified test environment is available.

### New isolated UI development branch
- Created GitHub branch: `feat/studio-hq-ui-20261117`.
- Repository: `jawedimtiaz/jawed-website-ai-studio-lab`.
- Branch starting commit: `9d795a2f1adea44a9ca38acc8cadcf1f09ac83a9`, the exact canonical PR #54 head verified immediately before branch creation.
- Branch creation succeeded through the GitHub connector.
- No application source files, configuration, database migrations, secrets or deployment settings were changed when creating this branch.
- The existing continuity document is being updated on this new branch to preserve the handoff.

### Canonical source review on the new branch
- Read `src/pages/StudioHqPage.tsx`, `src/App.tsx`, `src/data/toolsData.ts` and the existing continuity document from `feat/studio-hq-ui-20261117`.
- Confirmed that `StudioHqPage.tsx` already implements Google sign-in, server-side session verification through `/api/hq/session`, and owner-only rendering after the server returns an authorized identity.
- Confirmed that the page contains existing client management, project management, project tasks and milestones, customer approvals and QA checklist workflows.
- Confirmed `src/App.tsx` already lazy-loads the Studio HQ page at `/studio-hq` and suppresses the public site header/footer on that route.
- The current page is a large component with substantial inline styling. This is the primary UI refactoring/design target; do not rewrite its authentication or data operations merely to change presentation.
- The existing Tools listing is driven by `src/data/toolsData.ts`; PR #55 is a separate proposed entry-card change and remains dependent on PR #54.

### GAIS workspace warning
- The previously inspected Google AI Studio Build workspace `jawed-website-Lab` is stale, connected to the Lab repository's `main` branch, and lacks Git metadata in its local `/app/applet` snapshot.
- Its code snapshot predates PR #51 and does not represent the canonical PR #54 source.
- The GAIS import dialog previously showed no branch selector and warned that imported code would not remain synced with GitHub.
- Do not edit the stale workspace, import it as if it were the new branch, unlink/relink GitHub, force-sync, or assume Build mode has switched branches.
- Although the new GitHub branch now exists, a safe and verified way to open that exact branch in GAIS has not yet been established. Do not claim GAIS is connected to the new branch.

### Current pull-request and release boundaries
- PR #54 remains the canonical backend/security/schema foundation, open, draft and unmerged. Latest verified head at branch creation: `9d795a2f1adea44a9ca38acc8cadcf1f09ac83a9`.
- PR #55 remains a separate draft proposal for the private Studio HQ entry card and is based on the PR #54 canonical branch. It must not be merged ahead of its dependency.
- Do not merge PR #54 or #55, deploy a Worker, run D1 migrations, provision/change rate-limit resources, enroll an owner, change secrets, or use real customer/financial records without explicit approval.
- Existing CI evidence and its boundaries are recorded in the preceding sections. In particular, successful dry-runs and in-memory SQLite tests do not prove preview/live Worker runtime behavior or remote D1 migration compatibility.

### Pending work — execute in this order
1. **Resolve the GAIS source workflow.** Establish whether GAIS can open the exact `feat/studio-hq-ui-20261117` branch. If it cannot, use GAIS only for design/specification or generated component proposals and apply reviewed changes through GitHub on this branch. Do not use the stale workspace.
2. **Baseline the current UI.** Inspect the complete existing Studio HQ page, styles, shared components, icon library and package scripts on this branch. Record existing behavior and API calls before editing.
3. **Agree the dashboard information architecture.** Define sidebar/navigation, overview KPIs, module sections, responsive behavior, empty/loading/error states and visual design tokens. Do not invent live metrics or imply unavailable backend modules work.
4. **Implement in small UI-only increments.** Preserve authentication, authorization, API request semantics, validation and data contracts. Avoid backend, Wrangler, D1, secrets and customer data changes unless a separately identified defect blocks the UI and is approved.
5. **Run evidence-based checks.** Run the repository's relevant lint/typecheck/build/tests and inspect the diff. Report exact commands and outcomes; do not claim browser/device testing unless actually performed.
6. **Review the branch and prepare a draft PR** targeting the canonical PR #54 branch. Do not merge or deploy without explicit approval.
7. **Later release readiness:** resolve rate-limit namespace ownership/uniqueness, complete preview runtime/auth verification, prepare and approve the D1 backup/restore and migration plan, establish controlled owner enrollment, and resolve the AdSense workflow status if all repository gates are required.

### Handoff rule for a new chat
- Start from repository `jawedimtiaz/jawed-website-ai-studio-lab`, branch `feat/studio-hq-ui-20261117`.
- Treat GitHub as the source of truth. First fetch the branch head and this continuity document before making changes.
- The immediate next task is pending item 1: safely resolve GAIS access to this exact branch. No dashboard UI implementation has started on this branch.
- Keep Studio HQ Lab, Kaushal (`jawedimtiaz/advocate-kaushal-kishor`), Jewellery (`jawedimtiaz/ka-sons-jewellers`) and personal production website (`jawedimtiaz/jawed-website`) strictly separate.

## 20. Phase 3.1 — Google AI Studio GitHub workflow research (17 November 2026)

### Current official documentation reviewed
- Reviewed Google's current Build mode documentation: https://ai.google.dev/gemini-api/docs/aistudio-build-mode
- The documentation describes importing an existing GitHub repository through Build mode's Add files (+) menu, and describes GitHub two-way sync: push changes from AI Studio and pull changes made externally through the GitHub tab in Settings.
- Google Developers also announced support for syncing to and from GitHub: https://www.linkedin.com/posts/googledevelopers_syncing-to-and-from-github-is-now-supported-activity-7497759644719816707-ETWy
- The current public documentation does not clearly specify whether the Import from GitHub dialog supports selecting a non-default branch at import time. Therefore branch-selection support for `feat/studio-hq-ui-20261117` is not yet proven.
- The prior UI screenshot evidence from the user's GAIS workspace showed an import flow with a warning that the imported copy would not stay synced. The current documented two-way sync capability may have evolved since that screenshot; do not assume the old behavior or new behavior without inspecting the live UI.

### New branch integrity check
- Read GitHub branch ref `feat/studio-hq-ui-20261117` after the continuity-document update.
- Latest commit at verification: `ddc1b4c3f44a621e440de182390f64aef2576d9e`.
- Its parent is exactly the canonical PR #54 starting commit: `9d795a2f1adea44a9ca38acc8cadcf1f09ac83a9`.
- The branch exists and points to the documentation commit. No UI source implementation has been committed.
- Branch protection is not enabled on this feature branch. Continue to use careful PR review and do not push unreviewed or force-pushed changes.

### Safe next verification in the user's GAIS UI
1. Open Google AI Studio Build mode.
2. Use Add files (+) → Import from GitHub and select repository `jawedimtiaz/jawed-website-ai-studio-lab`.
3. Inspect the repository/branch selection UI. If the exact branch `feat/studio-hq-ui-20261117` is explicitly selectable, verify that exact branch is selected before proceeding.
4. Stop before confirming import if the branch cannot be selected, if the interface warns that the copy will not sync, or if the selected ref is `main` or another branch. Do not import the wrong branch.
5. If the exact branch is selectable and the import screen confirms the expected source, proceed only after reviewing any displayed sync/overwrite warning. Do not push or overwrite anything yet.
6. After opening the workspace, verify the imported source includes the latest continuity document and the canonical Studio HQ page/auth implementation. Check GitHub settings/status for the connected repository and selected branch before any code edit.

### Source and evidence
- Google AI Studio Build mode documentation: https://ai.google.dev/gemini-api/docs/aistudio-build-mode
- Google Developers GitHub sync announcement: https://www.linkedin.com/posts/googledevelopers_syncing-to-and-from-github-is-now-supported-activity-7497759644719816707-ETWy
- Google AI Developers Forum discussion confirms the import workflow and GitHub linking flow can vary by workspace state: https://discuss.ai.google.dev/t/github-sync-fails-and-existing-repository-cannot-be-reconnected-in-google-ai-studio/179488
- Treat community forum reports as operational anecdotes, not as authoritative product specifications.

### Current status
- Official two-way sync capability: documented by Google.
- Exact feature-branch selection during import: not yet verified.
- GAIS workspace connected to the new feature branch: not yet verified.
- No GAIS import, sync, push, pull, code edit or deployment has been performed in this phase.
- Immediate next action: user inspects the Import from GitHub dialog and reports whether the exact feature branch is available. Stop before importing if not.


## 21. Phase 3.2 — Studio HQ frontend/backend dependency inventory (17 November 2026)

### Verified branch checkpoint
- Feature branch: `feat/studio-hq-ui-20261117`.
- Latest branch commit verified by GitHub: `f74502308a8f62119b9e400ba1f89c1b799bab11`.
- The branch remains a documentation-only continuation of the PR #54 head; no application UI source files have been changed on this branch.
- Correction to Phase 3.1: its “latest commit” reference `ddc1b4c3f44a621e440de182390f64aef2576d9e` is the parent of the current documentation commit, not the current branch head.

### Frontend inventory
- `src/pages/StudioHqPage.tsx` is approximately 79 KB and currently combines authentication/session handling, CRM, project/task/milestone workflows, approvals and QA in one React component.
- It uses Firebase Auth directly via `src/lib/firebase.ts`, obtains Firebase ID tokens, and sends same-origin requests with `credentials: 'same-origin'` and `cache: 'no-store'`.
- The page authenticates through `POST /api/hq/session`; it only loads CRM and project data after the server returns an authorized identity.
- `src/lib/hqSessionLifecycle.ts` tracks session generations and request sequence tokens to prevent stale approval/QA responses being applied after a session change.
- `src/App.tsx` lazy-loads the page at `/studio-hq` and suppresses the public Header, Footer, AI widget and PWA prompt on this private route.
- `src/context/AuthContext.tsx` is a separate site-wide Firebase/Firestore admin context. It checks a Firestore `admins` document and is not the Studio HQ API's authoritative owner authorization. Do not substitute it for server-side HQ authorization.
- `src/data/toolsData.ts` does not contain the private HQ entry card; PR #55 keeps its proposed card separate from the public tools catalogue.

### Backend/API inventory
- Worker routes include session, clients, projects, project tasks/milestones, project approvals/QA, quotations, invoices and payments/refunds.
- Backend modules: `functions/api/hq/session.js`, `clients.js`, `projects.js`, `release.js`, `financial.js`; shared auth/API/rate-limit modules are under `functions/lib/`.
- All protected handlers depend on the same-origin guard, Firebase ID-token verification, the `hq_users` owner enrollment row, the dedicated `HQ_DB` D1 binding, and rate-limit bindings. Mutation handlers use owner authorization guards and audit statements in D1 batches.
- Firebase token verification is pinned to Firebase project `refined-actor-skhlb`, validates RS256 signatures/claims and a two-email allowlist. The database enrollment check is an additional independent requirement.
- `wrangler.jsonc` on this branch declares `HQ_DB` as `jawed-studio-hq`, preview D1 as `jawed-studio-hq-preview`, and candidate rate-limit namespaces. Namespace ownership/uniqueness and live binding availability remain unresolved deployment gates.
- Financial API operations include quotation list/create/get/update/status/convert; invoice list/create/get/issue; invoice payment list/create; and payment refunds. Financial operations also use the same owner auth, D1 and rate-limit foundation. The current StudioHqPage does not yet provide a financial UI.
- Migrations are `migrations/hq/0001_studio_hq_schema.sql` and additive `0002_financial_management.sql`. They are source files only; no remote D1 migration was run during this phase.

### UI redesign implications
- First UI iteration should be a presentation/layout refactor of the existing private page, preserving its auth lifecycle, request paths, request payloads, validation, loading/error states and current CRM/project/approval/QA interactions.
- Do not add financial screens to the UI until a separate financial workflow review and acceptance criteria are completed.
- Suggested navigation areas for design review: Overview, Clients, Projects & Delivery, Approvals, QA. Financial Management can remain a future/locked module until its UI and workflows are reviewed.
- Dashboard KPI cards must be derived from loaded API data only. Do not fabricate revenue, pipeline, task or client counts.
- The current component's 79 KB size makes incremental extraction into focused components safer than a wholesale rewrite. First extract visual components without changing API behavior, then redesign one section at a time.

### Current PR and branch safeguards
- PR #54 remains open and draft; do not merge, deploy or migrate.
- PR #55 remains open and draft, targeting the PR #54 branch; do not merge before its dependency is resolved.
- Feature branch `feat/studio-hq-ui-20261117` is not protected. Continue to use reviewed commits and a draft PR; do not force-push.
- No new repository, Firebase project, Worker, D1 database, domain, secret, owner enrollment or live Cloudflare setting was created/changed in this phase.

### Next action
- Resolve the GAIS GitHub import workflow for the exact feature branch. The user must inspect whether `feat/studio-hq-ui-20261117` is selectable and whether the import is synchronized. Stop before importing if the exact branch or sync behavior is unclear.
- Once the source workspace is safely connected, prepare the UI information architecture and visual specification before editing application files.
