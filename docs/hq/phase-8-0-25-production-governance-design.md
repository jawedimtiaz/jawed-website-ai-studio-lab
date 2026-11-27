# Phase 8.0.25 — Production Release Governance Design

**Status:** Design proposal only — not implemented  
**Date:** 27 November 2026  
**Repository:** `jawedimtiaz/jawed-website-ai-studio-lab`  
**Hosting target:** Cloudflare Worker `jawed-website-ai-studio-lab`

## 1. Scope and safety boundary

This phase defines the proposed governance model for the Studio HQ Lab Production release path. It does not change GitHub rulesets, environments, Actions secrets, Cloudflare tokens, Worker configuration, D1 databases, DNS, routes, or deployments.

The personal website repository (`jawedimtiaz/jawed-website`) and all customer repositories, including Kaushal, are out of scope.

## 2. Repository visibility and plan consideration

The GitHub repository was inspected through the connected GitHub integration on 27 November 2026 and returned `visibility: public`. This makes GitHub's public-repository deployment protection availability relevant. Before implementation, re-check the actual account/repository plan and the current GitHub UI because feature availability and policy can change.

## 3. Main branch governance proposal

Retain the existing pull-request and CI requirements and propose these additional protections:

- Require at least one approving review before merging.
- Dismiss stale approvals when new commits are pushed.
- Require approval of the most recent reviewable push.
- Require all review conversations to be resolved.
- Retain required CI checks and branch-up-to-date enforcement.
- Retain force-push and branch-deletion restrictions.

### Solo-maintainer constraint

The repository owner may be the only available maintainer/reviewer. A one-approval rule can block the owner's own pull requests if no independent reviewer is available. Do not create a self-approval workaround or silently reduce the control. Before changing the ruleset, decide whether to add a trusted independent reviewer with appropriate repository access or adopt a documented, explicitly accepted solo-maintainer policy. Confirm that the selected GitHub ruleset can enforce the intended policy.

## 4. Protected Production environment proposal

Create a separate GitHub Actions environment named `production`; do not reuse `preview-deployment`.

Proposed controls:

- Restrict deployments to the `main` branch.
- Configure required reviewer approval before Production jobs receive environment secrets.
- Enable prevention of self-review where supported.
- Disable administrator bypass where supported.
- Keep the existing Preview environment and Preview credential separate.
- Store only the Worker-scoped Production deployment token in the Production environment after the workflow and permissions have been reviewed.
- Never put token values in repository files, logs, prompts, or documentation.

The existing Production token was reported by the owner-provided audit as restricted to the single Production Worker and expiring 12 February 2027. Its metadata and current status must be revalidated in Cloudflare before any implementation. Do not rotate or revoke it as part of this design-only phase.

## 5. Immutable Preview-to-Production promotion

Proposed release sequence:

1. A reviewed commit is merged to `main` after required CI succeeds.
2. A single build job creates the deployable artifact and a manifest containing file checksums, source commit SHA, and build metadata.
3. The exact artifact is deployed to the Preview Worker.
4. Preview live acceptance tests run against the deployed Preview version.
5. A Production workflow is manually initiated with the validated source run ID and expected commit SHA.
6. The workflow verifies repository, workflow identity, `main` branch, successful source run, exact commit SHA, artifact identity, expiry, and all artifact checksums.
7. The Production environment approval gate is reached before the Production credential is made available to the deployment job.
8. The workflow deploys the same validated artifact to only `jawed-website-ai-studio-lab`; it must not rebuild the application.
9. Production smoke tests run and the deployed Worker version, commit SHA, artifact digest, and test results are recorded.

The Production workflow must fail closed if the source run, artifact, manifest, checksum, commit, branch, or environment does not match. It must not fall back to a fresh build or a Preview credential.

## 6. Production acceptance and rollback

At minimum, post-deployment acceptance should verify:

- Homepage returns expected successful HTML.
- Core readiness endpoint returns its expected response.
- Unknown API paths return the expected JSON 404.
- Missing assets return the expected 404.
- Unknown browser routes return the expected response.
- Protected HQ routes remain protected.
- Required security headers are present.
- Critical application paths are checked without exposing personal or customer data.

Before implementation, define the exact expected status/body/header contracts from the current Production application and confirm that each probe is safe and read-only.

Rollback proposal:

- Stop promotion and capture the failed release's commit, artifact digest, Worker version, and smoke-test output.
- Identify the last known-good Production Worker version.
- Use a controlled rollback mechanism that restores that exact known-good version.
- Re-run the Production acceptance contract.
- Record the incident, cause, rollback version, and final verification.

Do not assume a rollback is safe until the Cloudflare version history and a non-production rollback rehearsal have been reviewed. D1 schema/data migrations require a separate compatibility and recovery plan; Worker rollback alone does not reverse database writes.

## 7. Implementation gates

Implementation must be split into separately reviewed changes:

1. Confirm the independent reviewer / solo-maintainer policy.
2. Re-inspect current GitHub ruleset and environment capabilities.
3. Review the existing Preview workflow and artifact contract.
4. Design the Production workflow without adding a live Production credential.
5. Validate the workflow using a safe dry-run or test environment.
6. Configure the protected Production environment and secret only after explicit owner approval.
7. Perform a controlled Production release only after a separate explicit deployment approval.

No step in this document grants authorization to change settings, credentials, Cloudflare resources, or deploy.

## 8. Evidence and limitations

- Repository visibility was returned as `public` by the connected GitHub repository search on 27 November 2026.
- The current main-branch audit reported zero required approvals and no protected Production environment or GitHub Actions Production deployment workflow. Settings inventory was supplied by the owner/Antigravity; it must be rechecked before implementation.
- The prior audit identified `deploy:production` in `package.json` and `scripts/deploy-production.mjs` as a local interactive CLI path. This is not equivalent to a protected GitHub Actions release workflow.
- This document is a proposal, not proof that any control is currently configured or tested.
