# Phase 8.0.7 — Wrangler Deployment Safety

## Scope

This change applies only to the Studio HQ Lab Worker in this repository. It does not deploy the Worker, execute D1 migrations, change D1 data, or modify the personal website or customer projects.

## Safe deployment defaults

The root Wrangler configuration now targets:

- Worker: `jawed-website-ai-studio-lab-preview`
- Environment: `preview`
- Canonical origin: `https://preview.lab.jawed.co.in`
- D1: `jawed-studio-hq-preview`

The named `preview` environment resolves to the same Preview Worker and Preview D1.

Production is defined only under `env.production`:

- Worker: `jawed-website-ai-studio-lab`
- Environment: `lab`
- Canonical origin: `https://lab.jawed.co.in`
- D1: `jawed-studio-hq`

Preview and Production D1 IDs are asserted to be different by the deployment-safety validator.

## Wrangler CLI version control

- Wrangler is declared as an exact development dependency: `wrangler@4.166.0`.
- Deployment commands use the locally installed CLI, not an unpinned `npx` download.
- This repository currently has no tracked npm, pnpm, or Yarn lockfile. The exact direct dependency pins the CLI release, but transitive dependency resolution is not lockfile-reproducible. A lockfile policy is a separate repository-wide decision and is not introduced in this phase.

## Supported commands

From the repository root:

- Preview deployment: `npm run deploy:preview` (equivalent to `wrangler deploy --env preview`).
- Production deployment: `npm run deploy:production`. This invokes an interactive guard and requires the exact confirmation text `DEPLOY jawed-website-ai-studio-lab PRODUCTION` before it invokes Wrangler with `--env production`.

A plain `wrangler deploy` now resolves to the root Preview configuration. Do not bypass the guarded Production command for routine operations. An operator with direct Wrangler access can still explicitly run `wrangler deploy --env production`; this repository-level confirmation script is a procedural safeguard, not an access-control boundary.

## Automated controls

The deployment runtime workflow runs:

1. `scripts/validate-wrangler-deployment-safety.mjs` — verifies default Preview target, Preview D1, explicit Production target, Production D1 and database separation.
2. `node --test tests/wrangler-deployment-safety.test.js` — regression tests for the configuration and command guard.
3. Existing deployment runtime reliability validation.

The workflow is validation-only. It has read-only repository permissions and contains no Wrangler deployment command.

## Release and database safeguards

- This phase does not authorize Production deployment.
- No D1 migrations or data writes are part of this phase.
- A Worker code rollback does not restore D1 data.
- Any future Production release requires separate explicit owner authorization, a reviewed release plan, a Wrangler dry run, and live smoke verification.
- Any D1 migration or data restoration requires separate review and authorization.

## Preview Worker dry-run CI

A second, separate CI job now performs a full application build and Wrangler compile without deployment:

1. Installs project dependencies with `npm install --no-package-lock` (does not create or change a lockfile).
2. Runs `npm run build` to produce `dist/`.
3. Runs `npm exec -- wrangler deploy --dry-run --env preview --outdir .wrangler-dry-run`.

The job uses the root/Preview configuration explicitly and does not use a Cloudflare API token. It is a compile validation only; it does not publish a Worker, run D1 migrations, or modify D1 data. The dry-run and build job passed in GitHub Actions run 352 (run ID `45560816193`) on commit `e00c352124a98c74a4f947d580ba33f59534fa17`.

## Confirmation guard regression coverage

The Production confirmation logic is exported as a testable function. Mocked tests verify that incorrect confirmation does not invoke Wrangler, exact confirmation invokes only `wrangler deploy --env production`, and Windows uses shell command resolution. These tests do not launch Wrangler or contact Cloudflare.
