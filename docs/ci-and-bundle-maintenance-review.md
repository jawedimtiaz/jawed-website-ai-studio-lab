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
