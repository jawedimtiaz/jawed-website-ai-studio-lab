# Phase 8.0.24U — Stage 1: Revocation of unused Preview tokens

**Date:** 26 November 2026  
**Scope:** Two exact, never-used Preview Account API tokens only.

## Revocation evidence (owner-supplied Antigravity report)

| Token | ID | Result | UTC timestamp | Cloudflare audit event |
|---|---|---|---|---|
| Jawed Studio HQ Preview Deploy Replacement | `a58739d10dd1bc1f623aa580ec5935b7` | Revoked; HTTP 200 reported | 2026-11-26 17:48:53 | `0e840917-6d3d-441b-962a-fa64cd46e902` |
| Jawed Studio HQ Preview Deploy | `9a7219338ff51d2e93f30ef1e222fab0` | Revoked; HTTP 200 reported | 2026-11-26 17:49:08–09 | `a044a4d7-a916-4c04-9a31-64ab089e0445` |

The report states that both audit events recorded `token_revoke` with `result: true`, and a subsequent Account API token listing returned `total_count: 2`, with neither token present.

## Exclusions / non-mutation

The report states that the active Preview token `Jawed Studio HQ Preview Deploy Final`, Production-scoped `Jawed Studio HQ GitHub Deployment`, old broad User Profile Preview token, Production Build token, Cloudflare Agent token, GitHub secrets/environment protections, Workers, D1, DNS, routes, deployments, repository files, personal website and customer projects were not changed.

## Verification qualification

This Stage 1 evidence was supplied by Antigravity after Dashboard/API verification. ChatGPT's Cloudflare OAuth connection cannot access the User API Tokens Write endpoint (HTTP 403), so it did not perform or independently reproduce the revocations.

## Next controlled stage

Stage 2 proposes revoking only the separate old broad User Profile token `Jawed Studio HQ Preview Deployment` (ID `ad6b01a01b89248182c3b8bb52e075f7`). This token is not the active Final Preview deployment token. Stage 2 requires its own explicit authorization and post-revocation evidence.
