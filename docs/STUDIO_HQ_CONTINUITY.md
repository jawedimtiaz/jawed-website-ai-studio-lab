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
