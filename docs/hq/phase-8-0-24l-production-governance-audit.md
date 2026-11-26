# Phase 8.0.24L — Production Governance Read-Only Audit

**Audit date:** 26 November 2026  
**Repository:** `jawedimtiaz/jawed-website-ai-studio-lab`  
**Audited source branch:** `main`  
**Audited source commit:** `0783c22159f755c13b9fb81ecfe9c1b030192140`  
**Documentation branch:** `docs/phase-8-0-24l-production-governance-audit`  
**Status:** READ-ONLY AUDIT COMPLETE; REMEDIATION NOT STARTED

## 1. Executive summary

The controlled Preview deployment introduced in Phase 8.0.24I has been deployed and passed the recorded live Preview acceptance checks. The subsequent Production governance audit found material gaps in Production release authorization, credential isolation, database recovery rehearsal, and operational runbooks.

**Decision:** Keep Production unchanged. Do not deploy a Worker, run a Production D1 migration, restore a database, change secrets, or alter Cloudflare routes as part of this audit.

## 2. Evidence baseline

### 2.1 Main commit and CI

The audit used main commit `0783c22159f755c13b9fb81ecfe9c1b030192140`, merged through PR #88.

For that exact commit, the following main push workflows were recorded as successful:

| Workflow | Run ID | Conclusion |
|---|---:|---|
| Security Supply Chain Gate | `45766445477` | success |
| AdSense Readiness Gate | `45766445452` | success |
| Pull Request Validation | `45766445412` | success |
| Deployment Runtime Reliability Gate | `45766445390` | success |

These CI results establish repository validation for the commit. They do not establish Production account configuration or authorize a Production release.

### 2.2 Preview deployment

The controlled Preview deployment used workflow run `45766855931`, source commit `0783c22159f755c13b9fb81ecfe9c1b030192140`, and artifact `preview-worker-0783c22159f755c13b9fb81ecfe9c1b030192140` (artifact ID `15091728802`).

- Preview Worker: `jawed-website-ai-studio-lab-preview`
- Preview Version ID: `db78f60a-916b-47ea-a136-f09bb0e8e4a8`
- Preview URL: https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev
- Preview D1: `jawed-studio-hq-preview` (`623a828d-2909-47e7-a228-130b4eeefef5`)
- GitHub environment: `preview-deployment`

The deployment workflow completed successfully and the supplied live acceptance report recorded successful checks for the homepage, AI readiness endpoint, unknown API route, missing asset, unknown browser route, unauthenticated HQ API, and seven security headers. ChatGPT independently inspected the GitHub workflow and job result; the endpoint probe results were supplied by Antigravity.

### 2.3 Preview environment governance

The Antigravity account-level audit reported:

- Environment `preview-deployment` exists (ID `28501711504`).
- Required reviewer: `jawedimtiaz` (user ID `77162545`).
- Administrator bypass disabled.
- Deployment branch policy permits only branch `main`.
- Environment secret name `CLOUDFLARE_API_TOKEN` exists; its value was not read or exposed.
- Self-review prevention is disabled, consistent with the single-maintainer setup.

## 3. Production governance findings

The following account-level findings are based on the Antigravity read-only audit report supplied on 26 November 2026. Cloudflare live account details remain unverified where the browser session was unauthenticated.

| Area | Finding | Status |
|---|---|---|
| GitHub Production environment | `production-deployment` does not exist | FAIL |
| Repository-level secrets | `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist outside an environment gate | HIGH RISK / REVIEW |
| Main branch ruleset | Active PR, required-check, thread-resolution, force-push and deletion controls; empty bypass list | PASS (reported) |
| GitHub Actions native SHA pinning | Full-length SHA pinning toggle reported unchecked; CI validator provides a separate control | MEDIUM GAP |
| Fork PR approval | First-time contributors only | MEDIUM GAP |
| Cloudflare live state | Worker routes, versions, D1 live metadata and token scopes not inspected due to unauthenticated Dashboard | UNKNOWN |
| Production D1 recovery | Historical backup and Time Travel bookmark documented; remote restore drill not performed | PARTIAL |
| Production rollback | Historical Worker version rollback procedure exists; current live version history not checked | PARTIAL |
| Production release pipeline | Local interactive deployment guard exists; no protected GitHub Production environment or controlled Production workflow | FAIL |

### 3.1 Production resource identities declared in repository configuration

These are declared identities in the audited source configuration, not fresh live Cloudflare account verification.

| Resource | Production | Preview |
|---|---|---|
| Worker | `jawed-website-ai-studio-lab` | `jawed-website-ai-studio-lab-preview` |
| D1 | `jawed-studio-hq` / `d9ec83ea-7114-4179-af8e-a22ba5494508` | `jawed-studio-hq-preview` / `623a828d-2909-47e7-a228-130b4eeefef5` |
| Session limiter | `620261114` | `620261117` |
| Write limiter | `620261115` | `620261118` |
| General limiter | `620261116` | `620261119` |
| Canonical origin | `https://lab.jawed.co.in` | `https://preview.lab.jawed.co.in` |

### 3.2 Local Production deployment guard

The audited `scripts/deploy-production.mjs` requires the exact phrase:

`DEPLOY jawed-website-ai-studio-lab PRODUCTION`

On a mismatch it exits without invoking Wrangler. On a match it invokes the repository-local Wrangler entry with `deploy --env production`.

The guard is a procedural safeguard, not an access-control boundary: an operator with direct Wrangler access can invoke Production deployment separately. The Production deployment command does not run D1 migrations.

### 3.3 Migration review

The three SQL migration files were inspected in the repository:

- `0001_studio_hq_schema.sql`: schema creation and indexes.
- `0002_financial_management.sql`: additive financial tables and indexes.
- `0003_leads_pipeline.sql`: additive client columns and indexes, plus data backfills.

Migration 0003 performs existing-row updates:
- Reclassifies eligible active commercial clients as `converted`.
- Reclassifies eligible closed prospects without linked projects/invoices as `lost`.
- Demotes duplicate active primary contacts deterministically.
- Promotes one active contact where a client has active contacts but no active primary contact.

The migration comments state that reconstructed `converted_at` and `lost_at` timestamps are approximations based on existing timestamps, not exact historical event times.

Therefore, although the migration does not drop or delete records, it is not accurate to describe it as having no data mutation. Any future replay, correction, or recovery plan must account for these updates.

### 3.4 Historical backup and migration evidence

The repository's historical Phase 8.0.4 WP-5C backup record documents:
- A Production D1 logical SQL export dated 22 November 2026.
- Export file size: 32,167 bytes.
- SHA-256: `1D74EF2F99DFEA2000EDF0BFF4266C89204303D10BB2AF5AA91B58141B410BA9`.
- A Cloudflare D1 Time Travel bookmark: `00000073-00000000-0000512b-e5e8c4f8ff638d5877932d998632a5c1`.
- Successful replay into an isolated in-memory SQLite database.

The subsequent WP-5E deployment record documents that migrations 0001–0003 were applied to Production and that the Worker was deployed and smoke-tested on 22 November.

These are historical repository records. They do not prove the local backup file is still available, the live `d1_migrations` table has been re-read during this audit, or that a remote restore has been rehearsed.

### 3.5 Rollback evidence

The historical WP-5E record identifies:
- Recorded active Worker version: `c707cc3a-5a76-411c-b227-94811ef5f10d`.
- Recorded previous version: `5ac4bbbf-69cf-436d-bf9d-9670e4478d66`.

The documented command uses Wrangler Worker version rollback. A Worker rollback does not restore D1 data. Compatibility between the previous Worker code and the current D1 schema must be checked before any rollback.

Current live Cloudflare version history was not verified during this audit.

## 4. Production and customer safety boundaries

This audit and its documentation apply only to `jawedimtiaz/jawed-website-ai-studio-lab`.

No changes were made to:
- Personal website repository `jawedimtiaz/jawed-website` or `jawed.co.in`.
- Kaushal customer project, its code, data, credentials or deployment.
- Production Worker, Production D1, custom domains, DNS or rate-limit namespaces.
- GitHub secrets, environment settings, rulesets or Actions settings.
- Preview deployment or Preview D1 after the completed Phase 8.0.24K acceptance.

No secret values, customer records, or backup SQL contents are included in this report.

## 5. Remediation plan — proposed, not authorized or implemented

Priority order:

1. **Complete live Cloudflare read-only verification.** Sign in to Cloudflare and verify Worker domains/routes, version history, Production and Preview D1 metadata/migration state, and API token scopes. Do not display token values.
2. **Trace repository-level secret usage.** Determine whether the legacy repository-level Cloudflare secrets are referenced by any workflow or other automation. Do not delete or rotate until dependencies and impact are established.
3. **Design a protected Production GitHub environment.** Require an explicit reviewer, disable administrator bypass, restrict deployments to `main`, and use a Production-specific least-privilege credential.
4. **Design exact-artifact Promotion.** Promote only the exact source artifact already accepted in Preview; validate repository, source run, branch, SHA, artifact identity and checksum before Production deployment.
5. **Add Production-specific smoke acceptance.** Use `https://lab.jawed.co.in`, not the personal website's `https://jawed.co.in` smoke contract. Include security headers, expected API boundaries, assets, routes, and no-redirect checks.
6. **Publish a D1 backup/recovery runbook.** Document export, integrity verification, retention, access controls, recovery decision criteria and a restore drill into a disposable D1 database. Never rehearse by restoring over Production.
7. **Gate future Production migrations.** Require a reviewed SQL diff, verified backup, explicit approval, migration dry-run/compatibility checks where supported, and post-migration integrity verification.
8. **Publish a Production deployment and rollback runbook.** Include previous-version verification, D1 compatibility, smoke checks, escalation and explicit approval requirements.
9. **Harden GitHub Actions settings.** Review enabling native full-length action SHA pinning and approval for all outside collaborators, considering workflow compatibility.

Each remediation must be implemented in a separate reviewed branch/PR. Production changes require separate explicit user authorization.

## 6. Current phase status

- Phase 8.0.24I: controlled main-to-Preview pipeline merged in PR #88.
- Phase 8.0.24K: Preview deployment and reported live acceptance completed successfully.
- Phase 8.0.24L: Production governance read-only audit completed; gaps documented.
- Phase 8.0.24M: remediation design pending; no implementation authorized by this report.

## 7. Next action

Continue with a read-only design review of the proposed remediation controls and verify Cloudflare account-level facts after authenticated access is available. Do not create the Production environment, edit secrets, run migrations, deploy, roll back, or change DNS until a specific implementation plan has been reviewed and separately approved.

---

**Audit limitation:** Account-level GitHub findings and Cloudflare access limitations in this report are attributed to the Antigravity audit report supplied by the owner. Repository file content and the Production guard/migration logic were separately inspected through the GitHub repository connector. The audit did not execute new tests or access the Cloudflare account.
