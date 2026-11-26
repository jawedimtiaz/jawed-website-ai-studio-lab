# Controlled Preview deployment runbook

## Scope and safety

This workflow deploys only the Studio HQ Preview Worker:
- Worker: `jawed-website-ai-studio-lab-preview`
- Hostname: `https://preview.lab.jawed.co.in`
- D1: `jawed-studio-hq-preview`
- Environment: `preview`

It must never deploy the Production Worker, use Production D1, run migrations, modify Worker routes/custom domains, or promote a release to Production. The PR #78 workflow remains separate and unchanged.

## Release procedure

1. Merge an approved change to `main` through the protected PR process.
2. Confirm the `Deployment Runtime Reliability Gate` workflow completed successfully for that exact main commit.
3. Record the workflow run ID and exact 40-character commit SHA.
4. Dispatch `Controlled Preview Deployment from Main` with those two values.
5. Obtain approval through the protected GitHub `preview-deployment` environment.
6. The workflow validates repository, workflow path, push event, main branch, source SHA, successful conclusion and exact artifact identity.
7. It downloads the artifact from that run, checks the manifest and SHA-256 checksums, and validates Preview/Production separation.
8. It checks out the exact validated source commit, installs frozen dependencies, creates a Preview-only Wrangler configuration and performs a dry-run.
9. It deploys the Preview Worker and runs live read-only acceptance tests.

## Live acceptance

The workflow checks homepage HTTP 200/HTML, AI readiness JSON, unknown API JSON 404, missing asset 404, unknown browser route HTML 404, unauthenticated HQ projects HTTP 401, and required security headers. Redirects are not followed; redirects toward Production are rejected.

## Required GitHub and Cloudflare configuration

- GitHub environment `preview-deployment` must have required reviewers configured and the Cloudflare token stored as an environment secret.
- Use a Cloudflare API token scoped to the Preview Worker with the minimum Workers deployment permissions. Do not use a global account token.
- Never print token values or expose secrets in logs.
- Workflow permissions remain read-only for Actions and repository contents.
- Preview and Production D1 IDs and rate-limit namespaces must remain distinct.

These account-level settings must be verified in GitHub and Cloudflare; repository code cannot prove that reviewers or token scopes are configured correctly.

## Failure and rollback

A failed dry-run, deployment command or live acceptance makes the release unsuccessful. Do not automatically roll back or promote to Production. Record the failed source SHA and Cloudflare deployment/version identity. Any rollback is a separate operation requiring explicit approval and a verified previous accepted Preview version.

## Current implementation status

This document describes the controlled release process. It does not itself prove that the workflow has run, that GitHub environment reviewers are configured, that the Cloudflare token is correctly scoped, or that live Preview acceptance has passed.
