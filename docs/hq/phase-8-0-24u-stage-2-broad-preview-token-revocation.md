# Phase 8.0.24U — Stage 2: Revocation of old broad Preview User token

**Date:** 26 November 2026  
**Scope:** One exact Cloudflare User Profile API token with account-wide Workers Scripts Edit.

## Revocation evidence (owner-supplied Antigravity report)

| Token | ID | Result | Timestamp (UTC) | Cloudflare audit event |
|---|---|---|---|---|
| Jawed Studio HQ Preview Deployment | `ad6b01a01b89248182c3b8bb52e075f7` | Revoked; HTTP 200 reported | 2026-11-26 17:59:39 | `1c18cf16-9c7e-441d-a49b-a82e1b233226` |

The report states that the audit event records a token revoke with old status active and new status deleted. A refreshed User Profile API token list reportedly showed 2 remaining tokens and no entry for the revoked token.

## Exclusions / non-mutation

The report states that the active Preview-only Account token `Jawed Studio HQ Preview Deploy Final`, Production-scoped Account token `Jawed Studio HQ GitHub Deployment`, Production Build token, Cloudflare Agent token, GitHub secrets and environment protections, Workers, Workers Builds configuration, D1, DNS, routes, deployments, repository files, personal website and customer projects were not changed.

## Verification qualification

This evidence was supplied by Antigravity after Dashboard/API and audit-log verification. ChatGPT's Cloudflare OAuth connection attempted the exact DELETE endpoint but received HTTP 403 because it lacks `API Tokens Write`; ChatGPT did not execute or independently reproduce the revocation.

## Security outcome

The account-wide Workers Scripts Edit credential used for the old broad Preview deployment path is reported revoked. The active Preview deployment continues to use the separately scoped Preview Worker-only token. The Production-scoped token is retained and is not authorized for revocation in this stage.

## Next stage

Stage 3 proposes removing only the two unused repository-level GitHub Actions secrets:
- `CLOUDFLARE_API_TOKEN` (repository scope)
- `CLOUDFLARE_ACCOUNT_ID` (repository scope)

The protected `preview-deployment` environment secret of the same name `CLOUDFLARE_API_TOKEN` must remain intact. Stage 3 requires separate explicit authorization.
