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
