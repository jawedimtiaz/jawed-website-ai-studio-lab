# Jawed Web Studio — Studio HQ Continuity Log

**Checkpoint:** 10 November 2026  
**Repository:** `jawedimtiaz/jawed-website-ai-studio-lab`  
**Active integration branch:** `fix/studio-hq-bounded-json-body`  
**Last confirmed integration merge:** `6019e066a09288bfb59ffeaa02787f4cba5332a0`  
**Purpose:** Durable handover record for future ChatGPT sessions and local verification.

> Read this file before continuing Studio HQ work. This log records verified GitHub state separately from Antigravity-reported local results. Do not infer that a merged integration branch has been deployed.

## 1. Project boundaries and safety rules

- Personal website: `https://jawed.co.in/`, repository `jawedimtiaz/jawed-website`, Cloudflare Pages.
- Jawed Web Studio Lab: `https://lab.jawed.co.in/`, repository `jawedimtiaz/jawed-website-ai-studio-lab`, deployed as a Cloudflare Worker with a custom domain (not a separate Pages project).
- Kaushal customer website: `https://lab.jawed.co.in/kaushal`; it is a separate customer project. Never mix its code, data, credentials, or deployment with Studio HQ.
- Never modify `jawed.co.in` without explicit approval.
- Never overwrite existing projects or customer code without reviewing first.
- Keep customer code/data separated; use Git branches, PRs and preview deployments.
- Do not expose credentials, tokens, API keys or customer data.
- Do not merge, deploy, change Cloudflare settings/secrets, or run D1 migrations without explicit approval.
- Never claim tests were run unless there is direct evidence. Distinguish GitHub Actions results from Antigravity-reported local results.
- Google AI Studio Build-mode Chat model selection does not change the deployed application's runtime AI provider/model.
- Give one actionable step at a time. When continuing, resume from the pending work below rather than repeating completed audits.

## 2. Work completed and GitHub state

### PR #28 — Studio HQ integration and CI remediation

- PR: https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/28
- Status: **Merged** into `fix/studio-hq-bounded-json-body` with explicit user approval.
- Merge commit: `6019e066a09288bfb59ffeaa02787f4cba5332a0`.
- Integration head included PR #29 and was `21a2d7559db2abfd520de1707a80df6816933a5c` before merge.
- GitHub reported **9/9 checks passed** on the PR #28 merge commit:
  - HQ auth unit tests
  - Deployment runtime reliability
  - Production API method boundary
  - Career Match browser runtime
  - Site integrity
  - AI production regression matrix
  - AdSense privacy readiness (two runs)
  - Secrets and supply-chain baseline
- This verifies CI on the merged integration commit only. It does not prove a Cloudflare deployment or live runtime verification.

### PR #29 — Studio HQ security governance correction

- PR: https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/29
- Status: merged into the integration work before PR #28 merge.
- Correction commits:
  - `094fb87602d5af867d02422ba882d67262957bc9`
  - `3db4887f15ec390c3d9354fd143e0cec671f0166`
- Security corrections included:
  - Strict AI API CORS allowlist for Jawed's approved domains, localhost/127.0.0.1 development origins and the official Pages project hostnames.
  - Removal of unverified `workers.dev` origins.
  - Regression coverage for spoofed, nested and unverified `workers.dev` origins.
  - Archived-project protections, secret-hygiene documentation, HTTPS-only evidence URLs and suppression of no-op QA updates.
- Antigravity-reported local results included 75 HQ auth tests, 13 legacy validator tests, 19/19 AI regression validators, 34 contracts, AdSense readiness, site integrity, security supply-chain checks, D1 migration test discovery and a Vite build. These were not independently executed by ChatGPT.
- GitHub PR #29 checks on the corrected head passed before integration.

### PR #26 — Studio HQ approvals and QA integration

- PR: https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/26
- GitHub currently reports **merged**.
- Merge commit recorded by GitHub: `733b20d02873a0b3d0b00b88451cee10d727cc8f`.
- Important audit note: PR #26 was found merged at approximately the same time as PR #28. ChatGPT's explicit merge action in that session targeted PR #28 only. GitHub's PR #26 event timeline attributes the PR #26 merge event to the user's GitHub account. The cause of this unexpected second merge has not been established. Do not speculate or perform rollback/reset without explicit approval.
- PR #26 merge commit is an ancestor of the PR #28 integration merge.
- The merged implementation included owner-protected approvals/QA endpoints, bounded JSON bodies, allowlisted approval/QA values, audit-log no-op suppression, private HQ metadata/cache protections and tests.
- No live D1 integration test or production owner enrollment was performed as part of the recorded work.

### PR #27 — Legacy CI validator remediation

- PR: https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/pull/27
- Branch: `fix/legacy-ci-validator-remediation`.
- Head: `292abc478309f4f30fa5bdb54b6c5fe10b6898f1`.
- **Closed unmerged on 10 November 2026, with user's explicit confirmation.**
- Five commits and branch history were preserved; no branch deletion.
- Its seven applicable GitHub Actions checks passed.
- Read-only comparison showed its useful validator, SPA route, AdSense, manifest-policy and workflow-trigger changes were already incorporated in the newer integration branch.
- The integration branch had a stronger AI API CORS allowlist and one additional explicit regression test rejecting unapproved/malformed origins.
- Decision: PR #27 was superseded. It must not be merged or cherry-picked into the current integration branch.

### PR #26 unexpected merge event — investigation status

- PR #26's merged state and event attribution were observed directly through GitHub.
- No separate PR #26 merge call was made by ChatGPT in the recorded operation; only PR #28 was explicitly merged by ChatGPT.
- Root cause remains unknown.
- Do not rewrite Git history or roll back either merge without a separate, explicit user decision.

## 3. Current branch and deployment status

- Active integration branch: `fix/studio-hq-bounded-json-body`.
- Last verified merge commit: `6019e066a09288bfb59ffeaa02787f4cba5332a0`.
- At last verification, `main` remained at `f630014aeb1414cc295986d96840d3f1dc2649d1`; PR #28 was merged into the integration branch, not into `main`.
- Branch comparison showed significant divergence: integration was 126 commits ahead and 1 behind `main` at the time of the check. Do not merge the integration branch into `main) without a fresh reconciliation.
- **No production deployment was performed.**
- **No Cloudflare Worker/Pages configuration or secrets were changed.**
- **No D1 migrations or production DB mutations were performed.**
- **No production owner bootstrap/enrollment was performed.**

## 4. Phase 2.6.15 — PR #27 reconciliation: complete

Read-only checks established:
- The current integration versions of the security supply-chain validator and contract, deployment runtime contract, site-integrity validator, four production reliability workflows and AdSense validators already contained the useful PR #27 changes.
- AI knowledge entries for the Jamf and M365 tools were present on both branches.
- Integration contained newer private Studio HQ routing, metadata, service-worker cache exclusions, Worker handlers, Wrangler HQ_DB binding and HQ auth scripts/dependencies.
- PR #27's older `functions/api/ai.js` retained permissive hosting-origin patterns; integration had the stricter allowlist.
- Integration's `tests/legacy-ci-validators.test.js` contained the shared 12 legacy test cases plus an additional strict-origin allowlist test.
- Conclusion: PR #27 was superseded and safely closed unmerged.
- No source files or deployment resources were changed during that read-only comparison.

## 5. Phase 2.6.16 — next: local integration verification

**Status: pending.** User expects to access the Windows PC after 9 PM IST. ChatGPT can perform read-only GitHub review without the Windows machine, but local build/test verification requires the user's local checkout or Antigravity workspace.

When at the Windows PC, first verify the checkout before running commands:

1. Repository path is the Lab repo `jawed-website-ai-studio-lab`, not the production website repo and not the Kaushal customer project.
2. Current branch is `fix/studio-hq-bounded-json-body`.
3. Working tree is clean before pulling/checking out the target branch.
4. Local HEAD matches the intended integration commit or a later reviewed commit.
5. Do not merge, rebase, reset, force-push, deploy, modify Cloudflare settings, or run D1 migrations as part of verification.

Then run the project's relevant local checks, based on the actual `package.json` scripts and repository instructions:
- HQ authorization tests.
- Legacy CI validator regression tests.
- AI regression/security validators.
- AdSense readiness validators (runtime remains inactive).
- Site-integrity validator.
- Deployment runtime reliability validator.
- Security supply-chain validator.
- Production API method-boundary checks.
- TypeScript/Vite production build.
- `git diff --check`.

Capture actual command output and exit codes. Do not mark a test as passed if it was not executed. Investigate failures; do not weaken tests merely to get green results.

## 6. Remaining work after local verification

In order; do not skip ahead:

1. **Complete Phase 2.6.16 local verification** and record exact results.
2. **Investigate the unexpected PR #26 merge event** read-only: confirm event timeline, merge commit parents and any applicable GitHub audit/event records available. Root cause may not be recoverable from current repository data; if so, record as unresolved.
3. **Reconcile integration branch against `main`** with a fresh compare and file-level review. Do not assume a 126-commit divergence is safe to merge. Identify whether a separate release branch/PR is required.
4. **Review Studio HQ release readiness**: authentication, owner bootstrap controls, API method boundaries, CORS, CSRF/same-origin behavior, session security, rate limits, D1 schema/migrations, error handling, privacy, accessibility and operational recovery.
5. **Review D1 migration plan** for `HQ_DB` only. First-owner enrollment and production DB mutation require explicit approval.
6. **Create a release PR only after** local verification and branch reconciliation are complete. Obtain explicit user approval before merge.
7. **Deploy only after explicit approval**, with preview/staging verification and a rollback plan. No deployment is currently authorized by this log.

## 7. Known architecture and security reminders

- Lab is a Cloudflare Worker with custom domain `lab.jawed.co.in`, not a separate Cloudflare Pages project.
- Existing personal website is separately hosted and must not be modified without explicit approval.
- `package.json` is a legitimate Vite/React/TypeScript manifest; do not remove it to satisfy an oversimplified scanner.
- Firebase Web SDK client configuration is not a service-account private key. Still apply API-key restrictions and Firebase Auth/DB security rules. Never expose actual credentials.
- The Lab has a prior known deployed route defect: `/api/hardware-diagnostic` returned 404 because the Worker did not have a matching route handler, although local Vite worked. Revisit this only when the relevant API/runtime release scope is reviewed.
- Older contact D1 and Studio HQ D1 are separate databases. Do not mix migrations or bindings.
- Studio HQ first-owner bootstrap logic was identified in `functions/lib/hqApi.js` within `verifyAndAuthorizeOwner(request, env)`. It may create the first active owner only after token, verified-email, allowlist and zero-owner checks. Approval/QA mutation endpoints require an existing active owner. Review and explicitly authorize any production first-owner enrollment separately.

## 8. How to resume in a new chat

Start by reading this file from the Lab repository. Then:
- State the current verified GitHub branch/commit and PR states.
- Resume at **Phase 2.6.16 — local integration verification**.
- Do not ask the user to repeat project context.
- Do not assume local tests ran just because GitHub Actions passed.
- Keep this file updated at meaningful milestones (local verification, PR decisions, merge, deployment, migrations), preferably through a branch and PR rather than direct edits to `main`.


## 9. Phase 2.6.16 — verified local command inventory

Checked directly against `package.json` and the current GitHub workflow definitions on `fix/studio-hq-bounded-json-body` on 10 November 2026.

### Package scripts

- `npm run test:hq-auth` — runs the HQ authorization/API test files and private HQ service-worker/page tests listed in `package.json`.
- `npm run lint` — runs `tsc --noEmit`.
- `npm run build` — runs `tsc && vite build && node scripts/prepare-dist.mjs`.
- `npm run dev` and `npm run preview) are development/preview servers.
- No generic `npm test` script is defined in the checked package manifest.

### Workflow-verified validator commands

- `node scripts/validate-site-integrity.mjs`
- `node scripts/validate-ai-regression.mjs`
- `node scripts/validate-adsense-privacy.mjs`
- `node scripts/validate-adsense-inventory.mjs`
- `node scripts/validate-adsense-activation.mjs`
- `node scripts/validate-adsense-content-readiness.mjs`
- `node scripts/validate-adsense-placement-policy.mjs`
- `node scripts/validate-adsense-technical.mjs`
- `node scripts/validate-adsense-slot-architecture.mjs`
- `node scripts/validate-adsense-mobile-readiness.mjs`
- `node scripts/validate-adsense-consent-performance.mjs`
- `node scripts/validate-adsense-performance-safeguards.mjs`
- `node scripts/validate-adsense-final-performance-gate.mjs`
- `node scripts/validate-adsense-final-readiness.mjs`
- `node scripts/validate-adsense-preactivation.mjs`
- `node scripts/validate-adsense-readiness.mjs`
- `node scripts/validate-deployment-runtime-reliability.mjs`
- `node scripts/validate-security-supply-chain.mjs`
- `node scripts/validate-production-api-method.mjs`

The GitHub AI regression workflow explicitly uses Node.js 22. The Windows local verification should use Node 22 to match CI. These commands are a verified command inventory, **not evidence that they have already passed locally**.

### Suggested local sequence (after confirming clean working tree and exact branch)

1. `node --version` (confirm v22.x) and `git status --short --branch`.
2. `npm run test:hq-auth`.
3. `node --test tests/legacy-ci-validators.test.js`.
4. Run the workflow-verified validators above.
5. `npm run lint`.
6. `npm run build`.
7. `git diff --check` and `git status --short`.

If dependencies are not installed, inspect the repository's actual lockfile/package-manager state first. Do not blindly run `npm install`, generate a lockfile or change dependencies. The security contract currently says lockfiles are not applicable; resolve that policy/configuration carefully before dependency installation if the local environment lacks dependencies.

No command in this inventory authorizes deployment, Wrangler publish, Cloudflare mutation or D1 migration.
