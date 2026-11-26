# Phase 8.0.24T — Least-Privilege Preview Token & Controlled Deployment Verification

**Date:** 26 November 2026  
**Repository:** `jawedimtiaz/jawed-website-ai-studio-lab`  
**Status:** COMPLETE — controlled Preview deployment succeeded.

## Outcome

The replacement Preview credential was exercised by the protected, manually dispatched Preview deployment workflow. GitHub reports the workflow and deployment job as successful, and the live read-only acceptance script passed. This phase does not authorize or perform Production deployment.

## Credential configuration (owner/Antigravity evidence)

- Cloudflare token name: `Jawed Studio HQ Preview Deploy Final`.
- Reported scope: `Individual Workers: Editor`, restricted to Worker `jawed-website-ai-studio-lab-preview` only.
- Reported absence of account-wide Worker permissions, routes permissions, Pages permissions, D1 permissions or other additional product permissions.
- Expiry reported: 24 February 2027.
- GitHub Environment secret: `preview-deployment / CLOUDFLARE_API_TOKEN`.
- Antigravity reported the secret update succeeded (HTTP 200). GitHub secret values are write-only and were not read back.
- Environment protection reportedly remained: reviewer `jawedimtiaz`, allowed deployment branch `main`, administrator bypass disabled.
- No token value is included in this document.

## Source artifact provenance

- Source workflow run: `45766445390`, Deployment Runtime Reliability Gate; event `push`, branch `main`, conclusion `success`.
- Source commit SHA: `0783c22159f755c13b9fb81ecfe9c1b030192140`.
- Source artifact: `preview-worker-0783c22159f755c13b9fb81ecfe9c1b030192140`.
- Artifact ID: `15091728802`.
- SHA-256: `ddb7f5eb22c7c0bb6d06eacf595d84a2e9ff92d5b556990e32f43e30e5cc27ff`.
- The deployment job downloaded that exact artifact from the source run and checked out the exact source SHA. No application code was committed by this deployment operation.

## Controlled Preview deployment

- Workflow: [Controlled Preview Deployment from Main](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/actions/workflows/deploy-preview-main.yml).
- Run: [45866856115](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/actions/runs/45866856115), run number 2.
- Job: [Verify source, deploy isolated Preview, run live acceptance](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/actions/runs/45866856115/job/140071804339).
- Dispatch inputs: source run `45766445390`; expected source SHA `0783c22159f755c13b9fb81ecfe9c1b030192140`.
- Environment: `preview-deployment`; owner approval reported through authenticated GitHub session.
- GitHub run metadata independently fetched: event `workflow_dispatch`; actor `jawedimtiaz`; status `completed`; conclusion `success`; run head branch `main`; dispatch commit `9038895da0981e4d3ba96be1d11107910b399fd7`. The dispatch commit is the workflow revision on main; the deployed code bundle was the separately validated source artifact at `0783c221...`.
- Job ID `140071804339`: all listed steps completed successfully, including source identity, artifact download, checkout, provenance/isolation, frozen dependency installation, dry-run, Preview deployment and live acceptance.
- Job log independently confirms the artifact ID/digest, the masked `CLOUDFLARE_API_TOKEN` environment variable, and command `wrangler deploy --config wrangler.preview-only.jsonc --env preview`. No credential value appeared in the inspected log.
- Dry-run reported 96 assets (561.51 KiB; gzip 104.22 KiB) and Preview D1 binding `jawed-studio-hq-preview` (`623a828d-2909-47e7-a228-130b4eeefef5`).
- Deployed Worker: `jawed-website-ai-studio-lab-preview`.
- Preview Workers.dev URL: https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev
- Preview custom origin configured in generated configuration: https://preview.lab.jawed.co.in
- Cloudflare Version ID from job log: `ce792ec5-1008-47a8-9cde-2edc0b205d0d`.

## Live read-only acceptance

The job log confirms `scripts/validate-preview-acceptance.mjs` completed and emitted:

> Live Preview acceptance passed: homepage, AI readiness, API 404, missing asset, browser 404, HQ 401 and security headers.

This records the scripted acceptance contract's success against the Preview Workers.dev origin. The inspected log contains a validator summary rather than a per-header value matrix; this record does not expand the summary into unobserved per-header values.

## Production and customer isolation

- The deployment step used a generated Preview-only Wrangler config and explicit `--env preview`.
- No Production deployment, Production D1 migration/write, Production DNS/custom-route change, or customer-project deployment was part of this phase.
- The previously disconnected/removed Production Builds configuration remains as recorded in Phase 8.0.24S; this phase did not modify it.
- No Cloudflare token was revoked in this phase. Retirement of old broad tokens remains a separate cleanup action requiring identity/usage verification and explicit owner authorization.
- No repository source files or branches were changed by the deployment run itself.

## Evidence classification and limitations

**Independently verified through GitHub connector:** run metadata, dispatch actor/event/conclusion, job and step conclusions, job log content, exact source artifact ID/digest, Preview deployment command, Preview Worker Version ID, and acceptance script success output.

**Owner/Antigravity supplied:** Cloudflare token permission screenshot and expiry details; GitHub Environment secret update HTTP 200; environment reviewer approval interaction; Cloudflare-side no-change attestations.

GitHub Environment secret values cannot be read back through the available connector. The connected Cloudflare API integration lacks API-token read/write permission, so token scope was not independently queried after creation. The successful run proves the configured secret authenticated this Preview deployment; least-privilege scope details rely on the supplied Cloudflare token configuration evidence.

## Release decision

**Preview deployment pipeline: PASS.** The replacement credential worked for the intended Preview deployment and the gated workflow's live acceptance suite passed. Keep Production unchanged. Do not revoke any previous broad Preview, Production or build token until its identity and current usage have been checked and the owner separately authorizes revocation.
