# CI Runtime and Frontend Bundle Maintenance Review

**Date:** 15 November 2026  
**Status:** Read-only review; recommendations only  
**Scope:** Studio HQ Lab repository and PR #51 branch. No workflow or application source changes made.

## 1. GitHub Actions Node.js runtime warning

### Evidence from latest PR #51 CI

The Studio HQ Firebase Auth workflow uses immutable action commit pins corresponding to older releases:

- `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`
- `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020`

The job explicitly installs Node.js `24.12.0`, but the latest job log warns that the pinned checkout and setup-node action versions target the Node.js 20 action runtime and are being forced to run on Node.js 24.

This is an action-runtime deprecation warning, not a failure of the project's Node.js 24 application/test runtime.

### Current upstream guidance reviewed

As of 15 November 2026, the official upstream repositories document:

- `actions/checkout` v7 as current; its release history states v5 moved the action runtime to Node 24 and v6 improved credential storage.
- `actions/setup-node` v7 as current; its release history states v5 moved the action runtime to Node 24, v6 changed npm cache defaults and removed the deprecated `always-auth` input, and v7 migrated internals to ESM.
- Official references:
  - https://github.com/actions/checkout
  - https://github.com/actions/setup-node

### Recommendation

Prepare a separate CI-maintenance PR to update the pinned action commits to reviewed immutable SHAs for supported Node 24-compatible releases. Do not use floating action tags as the final security pin. Verify release notes, action inputs, runner minimum version, and every workflow's existing permissions/caching behavior.

Do not bulk-replace all workflows without inventory. Some workflows use Bun or npm and may have different setup requirements. Keep this maintenance separate from PR #51's Studio HQ auth/D1 remediation.

## 2. Vite bundle-size warning

### Source inspection

- `src/App.tsx` already uses `React.lazy()` for route-level code splitting, including `WorkPage`.
- `src/pages/WorkPage.tsx` statically imports `HardwareShowcase3D`.
- `src/components/hardware/HardwareShowcase3D.tsx` statically imports `three`, `RoomEnvironment`, and `OrbitControls`.
- This means the Three.js scene implementation is included in the WorkPage route chunk even though the 3D showcase is only rendered in the Work page's overview tab.
- The latest verified build log reports Vite chunk-size warnings; the preceding CI review recorded WorkPage at approximately 605.61 kB and the main bundle at approximately 855.91 kB. Treat these as build-output measurements from that run, not current production transfer sizes.

### Recommended bounded optimization

Consider making only the 3D showcase component a nested lazy import within WorkPage, with an accessible lightweight loading fallback and error handling. This would defer downloading the Three.js scene code until the overview tab actually renders the showcase. Keep the page route itself lazy as it is today.

Before implementation, verify whether any other WorkPage imports pull Three.js or other large libraries into the same route chunk. Do not simply raise Vite's chunk-size warning threshold; that would hide the warning rather than reduce shipped JavaScript.

### Required validation for a future implementation

- Compare before/after Vite build output and chunk composition.
- Confirm WorkPage's initial route chunk no longer contains Three.js.
- Confirm the 3D component loads when the overview tab is opened.
- Test navigation to Work experience, skills, certifications, and projects without loading the 3D chunk unnecessarily.
- Test 3D rendering, resize behavior, WebGL failure handling, reduced-motion/accessibility behavior, and mobile viewports.
- Re-run all existing CI and browser runtime checks.

No code splitting change was implemented in this review.

## 3. Existing analytics script warning

The latest build log reports:

`/assets/js/analytics.js` in `index.html` cannot be bundled without a `type="module"` attribute.

The current HTML loads this script with a classic deferred script tag. Do not change it to a module without reviewing the script's syntax, global dependencies, execution ordering, and analytics behavior. A classic deferred script may be intentional. A safe follow-up is to inspect the file and decide whether to keep it as a public static asset or migrate it to an explicit module entry.

No analytics changes were made.

## 4. Other non-blocking warnings

- Node emits a `punycode` deprecation warning.
- Node emits experimental SQLite warnings in test execution.
- These did not fail the latest Studio HQ auth test job. Identify the owning dependency/runtime and assess upgrade compatibility separately; do not suppress warnings without understanding their source.

## 5. Workstream separation and safety

- These are maintenance findings, not release blockers that invalidate the successful latest PR CI.
- Do not fold broad CI action updates, analytics migration, or frontend refactoring into the current security/D1 PR.
- Keep PR #51 Draft and unmerged.
- No workflow, application source, Cloudflare Worker, D1 database, personal website, or Kaushal customer project was modified for this review.

## 6. Next bounded work

1. Inventory all workflows and classify action pins, package manager, Node runtime, and permissions.
2. Verify exact immutable SHAs for the intended Node 24-compatible action releases.
3. Create a separate CI maintenance proposal and run the complete workflow matrix.
4. Separately prototype the nested lazy load for `HardwareShowcase3D`, compare build artifacts, and run browser checks.
5. Review analytics script behavior before deciding whether the Vite warning requires a change.


## 7. Follow-up source inspection — 15 November 2026

### Studio HQ auth workflow inspected

The exact workflow file is `.github/workflows/studio-hq-auth-tests.yml` (blob `30f7e7b31744d9cd4909b4500e305b24ed17bd54`). Its current configuration on this branch shows:

- Workflow name: `Studio HQ Firebase Auth Tests`.
- Job: `hq-auth-unit-tests`; runner: `ubuntu-latest`.
- Workflow permissions: `contents: read` only.
- Runtime/toolchain: Node.js `24.12.0`; Bun setup; dependency install uses `bun install --frozen-lockfile --ignore-scripts`.
- Validation commands: Bun audit with the repository's narrow audit checker; `npm run test:hq-auth`; `npm run build`; Wrangler `deploy --dry-run`; production-artifact gRPC marker scan.
- Action pins: checkout `11bd71901bbe5b1630ceea73d27597364c9af683`, setup-node `49933ea5288caeca8642d1e84afbd3f7d6820020`, and setup-bun `0c5077e51419868618aeaa5fe8019c62421857d6`. All are immutable commit references. The first two correspond to the older action releases associated with the Node 20 runtime warning. The setup-bun release/runtime compatibility has not yet been independently checked.
- Push trigger: only `feat/studio-hq-firebase-auth` and `fix/phase-2-7j-hq-auth-d1-alignment`; no push path filter.
- Pull-request trigger: base branches `main`, `feat/studio-hq-projects-api`, `fix/studio-hq-owner-status-enforcement`, and `fix/studio-hq-bounded-json-body`; an explicit path filter covers HQ auth/API, tests, migrations, Worker/config, package/lock files, and this workflow.
- No `workflow_dispatch` trigger is present in this file.

This is one-workflow inspection, not the complete repository workflow inventory. The connected GitHub file-fetch interface available during this review could fetch known paths but did not expose a directory/tree listing; attempts to enumerate all `.github/workflows` entries were therefore inconclusive. Do not infer that this is the only workflow. Complete inventory remains open until the directory contents can be retrieved authoritatively.

### Analytics script path and behavior inspected

- `index.html` references `/assets/js/analytics.js` as a classic deferred script.
- The actual source file is `assets/js/analytics.js` (blob `103343a1c5dcf75d0195de7bdf104dcd030eb279`); it is not under `public/`.
- The file is a classic IIFE. It initializes `window.dataLayer` and `window.gtag`, defines `window.jawedTrack`, and schedules injection of Google's external `gtag.js` after the page load/idle period. It relies on browser globals and intentionally does not use ES module imports/exports.
- `scripts/prepare-dist.mjs` explicitly copies the root `assets` directory into `dist/assets` after Vite builds. This explains how the classic script is preserved as a static asset for the final output even though Vite warns that it cannot bundle the script as a module.
- No conversion to `type="module"` is recommended on current evidence. Preserve the classic deferred execution and static-copy behavior; a future change should test production output path, load order, duplicate initialization protection, consent/privacy requirements, and analytics event delivery.

### Bundle import confirmation

- `src/pages/WorkPage.tsx` imports `HardwareShowcase3D` statically.
- `src/components/hardware/HardwareShowcase3D.tsx` imports Three.js, `RoomEnvironment`, and `OrbitControls` directly.
- The component is rendered only in the Work overview tab. A nested lazy import remains a bounded optimisation candidate, but no build was run in this read-only review; no before/after size claim or browser validation is made here.

### Scope and status

No workflow or application files were changed. The complete workflow inventory, verification of newer immutable action SHAs, and measured bundle/lazy-load experiment remain outstanding. PR #51 remains Draft and unmerged.


## 8. Complete workflow inventory — 15 November 2026

The repository directory endpoint was used to enumerate `.github/workflows/` at the PR branch. It contains **34 workflow files**. Every file was fetched individually and its runner, action pins, Node version, top-level permissions, triggers, and path-filter presence were reviewed.

### Inventory by workflow purpose

| Group | Workflow files |
|---|---|
| Accessibility, monetization, AI and origin | `accessibility-document-contract.yml`, `adsense-readiness.yml`, `ai-regression.yml`, `canonical-origin-reliability.yml` |
| Browser, performance and finance | `career-match-browser-runtime.yml`, `core-web-vitals-protection.yml`, `finance-calculator-regression.yml`, `finance-tools-browser-runtime.yml`, `performance-baseline.yml` |
| Deployment and production reliability | `deployment-runtime-reliability.yml`, `production-404-reliability.yml`, `production-ai-get-reliability.yml`, `production-ai-post-reliability.yml`, `production-api-method-boundary.yml`, `production-availability-monitoring.yml`, `production-cache-reliability.yml`, `production-html-seo-reliability.yml`, `production-legacy-redirects.yml`, `production-media-assets.yml`, `production-robots-reliability.yml`, `production-security-headers.yml`, `production-sitemap-reliability.yml`, `production-smoke-reliability.yml`, `production-static-assets.yml` |
| Security and site integrity | `security-baseline.yml`, `security-supply-chain.yml`, `site-integrity.yml`, `pwa-reliability.yml` |
| Studio HQ | `studio-hq-approvals-qa.yml`, `studio-hq-auth-tests.yml`, `studio-hq-crm-tests.yml`, `studio-hq-d1-schema.yml`, `studio-hq-projects-tests.yml` |
| Android/TWA | `twa-engineering.yml` |

### Runner and runtime matrix

| Workflow count | Runner | Node runtime | Notes |
|---:|---|---|---|
| 28 | `ubuntu-24.04` | Node 22 | General site, browser, finance, performance, security and production validator workflows |
| 5 | `ubuntu-latest` | Node 24.12.0 | Studio HQ workflows; `studio-hq-auth-tests.yml` also installs Bun |
| 1 | `ubuntu-latest` | Node 20 | `twa-engineering.yml`; Node 20 is EOL as of 15 November 2026 and should be moved to a supported LTS after compatibility validation |

All 34 workflows declare top-level `permissions: contents: read`. No workflow-level write permission was found in this inventory. All 34 have path filters. Triggers are a mix of `pull_request`, `push`, `workflow_dispatch`, and scheduled checks; not every production workflow runs on pull requests. The production probes that are schedule/manual and/or main-push scoped should remain separated from unrelated Lab PR gating.

### Action pin matrix

All observed `uses:` references are immutable full commit SHAs, not floating tags.

| Scope | Action reference | Verified release / commit |
|---|---|---|
| 29 workflows | `actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09` | checkout v5.1.0; Node 24 runtime |
| 29 workflows | `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` | setup-node v7.0.0; Node 24 runtime |
| 5 Studio HQ workflows | `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` | checkout v4.2.2; Node 20 action runtime |
| 5 Studio HQ workflows | `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` | setup-node v4.4.0; Node 20 action runtime |
| HQ auth workflow only | `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6` | verified commit message identifies setup-bun v2.2.0 |

The five older-pinned Studio HQ files are `studio-hq-approvals-qa.yml`, `studio-hq-auth-tests.yml`, `studio-hq-crm-tests.yml`, `studio-hq-d1-schema.yml`, and `studio-hq-projects-tests.yml`. They are the source of the Node 20 action-runtime deprecation warning. The 29 other workflows already use Node-24-compatible checkout/setup-node action releases, although those pins are not the latest patch releases.

### Package-manager and execution patterns

- The 28 Node 22 workflows and the TWA workflow primarily run repository-owned `node scripts/*.mjs` validators. No dependency-install step was identified in the sampled workflow files; most validation scripts are intentionally lightweight and operate directly on checked-out source/assets.
- The Studio HQ auth workflow uses Bun for deterministic installation: `bun install --frozen-lockfile --ignore-scripts`; it then runs the HQ test suite/build through npm scripts and Wrangler via `npx`.
- The remaining four Studio HQ workflows use the older checkout/setup-node action pins and run their dedicated tests/validation scripts. Their individual YAML files were inspected; they do not share the auth workflow's Bun install step.
- Browser runtime workflows execute dedicated validation scripts; inspect their embedded setup steps before changing browser tooling or caching. Current workflows explicitly disable setup-node package-manager caching where configured, avoiding implicit cache behavior.

### Verified current action releases and candidate immutable SHAs

Official upstream release pages identify checkout v7.0.1 and setup-node v7.1.0 as latest at review time. Their exact tag refs were resolved through the GitHub API to immutable commit SHAs:

- `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` — v7.0.1.
- `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` — v7.1.0.

These are verified candidate pins, not applied changes. Checkout v5 and later use the Node 24 action runtime; setup-node v5 and later also use Node 24. Checkout v7 changes fork-PR safety defaults for `pull_request_target` and `workflow_run`; none of the 34 inventoried workflows declares either trigger. Setup-node v7 migrates internals to ESM and changes the no-token `NODE_AUTH_TOKEN` fallback; review release notes and runner compatibility in a separate maintenance PR before applying.

Official references:
- https://github.com/actions/checkout/releases
- https://github.com/actions/setup-node/releases
- https://github.com/actions/checkout
- https://github.com/actions/setup-node
- https://nodejs.org/en/about/previous-releases
- https://nodejs.org/en/about/eol

### CI maintenance recommendations

1. Prepare a separate, narrowly scoped PR to update the five Studio HQ workflows from checkout v4.2.2/setup-node v4.4.0 to reviewed Node-24-compatible immutable pins. Consider updating all 34 to the latest verified patch SHAs only after release-note compatibility review; do not mix this with PR #51.
2. Move `twa-engineering.yml` from Node 20 to a supported LTS (Node 22 or 24) after running its validation and verifying any Android tooling compatibility. Node 20 is EOL and no longer receives upstream security fixes.
3. Preserve `contents: read` least-privilege permissions. Keep `persist-credentials: false` where the workflow does not need authenticated git operations.
4. Keep production live-probe workflows scheduled/manual or main-scoped as currently designed; avoid accidentally adding them to unrelated pull-request checks.
5. After changes, run the full workflow matrix, including browser and Studio HQ jobs, and inspect action-runtime warnings. No workflow file has been changed in PR #51 as part of this inventory.

### Inventory completeness and limitations

- Directory enumeration returned exactly 34 workflow files; all 34 were individually fetched and reviewed for the matrix above.
- The summary is a configuration inventory, not a runtime test of all workflows. It does not prove every scheduled workflow currently succeeds or that every browser dependency works on a different Node runtime.
- No GitHub Actions workflow was edited or triggered manually for this review.
- PR #51 remains Draft and unmerged.


## 9. Nested Three.js lazy-loading design review — 15 November 2026

Additional source inspection confirms:

- `src/App.tsx` already lazy-loads `WorkPage` and wraps route rendering in `Suspense` with an accessible page loading fallback.
- The route tree is also wrapped in `RouteErrorBoundary` and a top-level `ErrorBoundary`; the shared error boundary explicitly detects failed dynamic imports/chunk loads and provides refresh/retry UI.
- `src/pages/WorkPage.tsx` imports `HardwareShowcase3D` at module scope but only renders it inside the overview-tab branch. Experience, skills, certifications, and projects tabs do not render the showcase.
- `HardwareShowcase3D.tsx` imports Three.js, `RoomEnvironment`, and `OrbitControls` plus the icon package. The Three.js dependencies therefore enter the Work route's module graph before the user opens the showcase.

### Proposed bounded implementation (not applied)

1. Replace the static import in `WorkPage.tsx` with a nested `React.lazy(() => import(...))` import.
2. Wrap only the showcase element in a local `Suspense` boundary, with a compact, accessible fallback that preserves the section's approximate layout and clearly says the interactive 3D model is loading. Avoid showing the full-page fallback for a nested component load.
3. Keep the existing route-level `WorkPage` lazy import unchanged.
4. Rely on the existing route error boundary for chunk-load/render failures, but verify the exact boundary nesting and reset behavior during implementation. Do not add duplicate global error handlers.
5. Ensure the dynamic import occurs only in the overview-tab render branch; navigation to Experience, Skills, Certifications, and Projects should not fetch the Three.js chunk.

### Required evidence before acceptance

- Run the same production build before and after and record exact output sizes for the Work route chunk, Three.js/vendor chunk, main entry, and gzip sizes if available.
- Inspect the generated manifest/chunk graph to prove Three.js is no longer in the initial Work route chunk and the 3D module is a separate deferred chunk.
- Use a browser runtime check on desktop and mobile: load each Work subroute, verify no 3D chunk request for non-overview tabs, open overview and verify the 3D scene renders, exercise rack/motherboard controls, resize, and simulate a failed dynamic import if feasible.
- Verify fallback accessibility (status announcement, readable text, no layout collapse) and error recovery (refresh/retry). Confirm no regression to route navigation or page-level error boundary.

This remains a design review only. No local build was executed, no before/after measurements exist, and no source code was changed. The optimization is not yet validated and must be a separate change from PR #51.


## 10. Analytics script warning — source-level diagnosis — 15 November 2026

The exact referenced file was located at `assets/js/analytics.js` (not a guessed `public/` path) and fetched from the current PR branch. `index.html` references it as:

```html
<script src="/assets/js/analytics.js" defer></script>
<script type="module" src="/src/main.tsx"></script>
```

The analytics file is a one-line classic-script IIFE. It:
- Defines a guarded one-time loader using `window.__jawedGaLoaded`.
- Initializes `window.dataLayer` and `window.gtag` if absent.
- Queues the Google Analytics `js` and `config` calls for measurement ID `G-14C5DCPM15`.
- Exposes `window.jawedTrack` as a guarded event helper.
- Appends the Google Tag Manager gtag script asynchronously.
- Defers the loader until the window load event, then schedules it with `requestIdleCallback` (3-second timeout) or a 1.5-second timer fallback.

### Diagnosis

The Vite warning is consistent with Vite encountering a classic external script in HTML that it cannot transform/bundle as a module. The source itself is intentionally classic and uses browser globals; the warning does not by itself indicate a runtime defect. The script is explicitly deferred and loaded outside the app module graph.

Do **not** change it to `type="module"` merely to silence the warning. Before any such change, compare execution timing, global exposure, CSP behavior, analytics consent/privacy policy, duplicate-load protection, and event ordering with the React entry point. A more suitable resolution may be to leave it as a static public asset and use a Vite-supported public-asset reference/layout so it is copied unchanged without being parsed as a module, but this must be demonstrated by a clean build and production preview. Do not change the path or script attributes speculatively.

### Acceptance checks for a separate maintenance change

1. Build output contains exactly one analytics script at the expected URL, with the source preserved byte-for-byte if the static asset approach is chosen.
2. No duplicate Google tag injection; `window.__jawedGaLoaded`, `window.gtag`, and `window.jawedTrack` remain available as intended.
3. Confirm the analytics request is still deferred until after the load/idle schedule and is not moved into the critical rendering path.
4. Verify CSP permits the external Google tag endpoint under the current policy and confirm the deployed analytics behavior in a consent/privacy-compliant test session.
5. Confirm no new console errors, duplicate page_view events, or changed navigation event behavior.

This is a source-level diagnosis only. No build was run, no analytics request was made, and no runtime behavior was tested. No file was changed.

## 11. CI maintenance proposal — bounded separate PR

Based on the complete 34-file inventory, the lowest-risk first CI maintenance change is:

- In the five Studio HQ workflow files only, replace checkout v4.2.2 pin `11bd71901bbe5b1630ceea73d27597364c9af683` with the already-used checkout v5.1.0 pin `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`.
- Replace setup-node v4.4.0 pin `49933ea5288caeca8642d1e84afbd3f7d6820020` with the already-used setup-node v7.0.0 pin `820762786026740c76f36085b0efc47a31fe5020`.
- Keep the existing full SHA pinning, runner, Node version, scripts, permissions, trigger filters and job behavior unchanged in this first pass. This isolates the action-runtime update from app runtime changes.
- The five files are: `studio-hq-approvals-qa.yml`, `studio-hq-auth-tests.yml`, `studio-hq-crm-tests.yml`, `studio-hq-d1-schema.yml`, and `studio-hq-projects-tests.yml`.
- Keep `twa-engineering.yml` Node 20 runtime upgrade as a separate, independently tested change to Node 24.12.0 (or another supported LTS explicitly selected after validation). The validator is a standalone Node script and the workflow does not install Android build tooling, but compatibility still needs to be executed rather than assumed.

This first-pass proposal intentionally uses the same immutable action pins already exercised by 29 workflows in the repository, rather than combining a fleet-wide latest-patch upgrade with the Node 20 runtime changes. After the five-workflow change passes, a later separate update can evaluate checkout v7.0.1 and setup-node v7.1.0. Those exact SHAs were verified against their upstream tag refs but have not been exercised in this repository.

### Required verification

- Run all five Studio HQ workflow jobs on the maintenance branch, including the Bun setup/auth test, npm build and Wrangler dry-run in the auth job.
- Run the TWA validation after its separate Node upgrade.
- Inspect actual job logs for Node 20 action-runtime warnings and ensure they disappear from the five updated workflows.
- Ensure all workflow permissions remain `contents: read`, SHA pins remain immutable, and no deployment, secrets access, or D1 writes are introduced.
- Do not apply any of these workflow edits to PR #51; create a separate maintenance branch/PR after the current PR's intended disposition is decided.

No workflow files have been edited and no workflow was manually triggered. This section is a proposal, not an implementation or test result.


## 12. Live Lab Worker / D1 metadata recheck — 15 November 2026 (read-only)

A fresh Cloudflare API GET was made against only the Studio HQ Worker `jawed-website-ai-studio-lab` and its dedicated D1 database. No other Worker was inspected. All operations in this section were GET requests; no writes, uploads, deployments, SQL queries, migrations, exports, restores or configuration changes were made.

### Current Worker settings response

The settings API returned exactly these five bindings:

- `AI`
- `ASSETS`
- `CANONICAL_ORIGIN = https://lab.jawed.co.in`
- `ENVIRONMENT = lab`
- `HQ_DB` → D1 database ID `d9ec83ea-7114-4179-af8e-a22ba5494508`

The response did **not** contain `HQ_SESSION_LIMITER`, `HQ_WRITE_LIMITER`, or `HQ_RATE_LIMITER`. Thus rate-limit bindings remain absent from the current active settings response. This is a live metadata observation, not a test of rate-limit request behavior.

### Current D1 metadata

GET database metadata confirms:
- Name: `jawed-studio-hq`
- ID: `d9ec83ea-7114-4179-af8e-a22ba5494508`
- Created: `2026-11-06T04:59:09.004Z`
- Version: `production`
- Running region: `APAC`
- File size: `401408` bytes
- Read replication: disabled

This confirms the Worker `HQ_DB` binding and D1 database metadata still refer to the same database. It does not inspect schema rows, migration state or customer/business records.

### Deployment/version metadata recheck

GET deployments returned 13 deployment records. The latest deployment remains:
- Deployment ID `739b15b1-22b5-499c-a738-7830cb394579`
- Created `2026-11-13T17:51:34.266866Z`
- Version `cf1dba45-c28c-4865-9571-dc508f6863d2` (version number 13)
- Traffic allocation: 100%

The latest version metadata still has no source commit SHA annotation. Version 12 remains annotated with commit `590d562b8f2a5547929a5f0132d5988c53836b9b` (PR #43). Therefore the exact source commit serving the active version 13 remains unproven. No deployment corresponding to PR #51 has been identified.

### Release-readiness interpretation

1. D1 is still attached to the live Lab Worker, despite the previously observed repository configuration drift; do not assume the live binding has disappeared.
2. Rate-limit bindings are absent from the current settings response, so the current production/lab configuration does not yet match the rate-limit binding declarations in the reviewed branch. This is a release-readiness discrepancy to resolve before any future deployment.
3. The latest active Worker version is still not traceable to a source commit from metadata alone. Establishing source provenance requires a separate controlled process; do not upload code or deploy merely to attach annotations.
4. The D1 database metadata is consistent with the Worker binding ID. No D1 SQL/schema or migration-ledger recheck was performed in this pass.
5. The Kaushal Worker and personal website were not inspected.

No configuration was changed and no deployment was triggered. PR #51 remains Draft and unmerged.
