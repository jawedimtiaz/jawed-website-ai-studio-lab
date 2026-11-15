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
