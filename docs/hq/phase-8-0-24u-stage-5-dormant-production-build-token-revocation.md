# Phase 8.0.24U — Stage 5: Revoke dormant legacy Production Build token

**Date:** 27 November 2026  
**Target:** User Profile API token `jawed-website-ai-studio-lab build token`  
**Token ID:** `46491d31f1e626954b693ba1c80a2ac4`

## Authorization and action

The account owner explicitly authorized revocation of this exact token. ChatGPT's Cloudflare OAuth connection attempted the DELETE operation but received HTTP 403 because it lacks the `API Tokens Write` scope; that attempt did not change the token. Antigravity subsequently reported that the owner revoked the exact token through the Cloudflare Dashboard/API.

Owner-provided revocation evidence:
- DELETE response: HTTP 200.
- Revocation timestamp: `2026-11-27T04:51:56Z` (10:21:56 IST).
- Audit action: `token_revoke`, result `true`.
- Audit event ID: `5062af75-3bc5-49bf-b596-b3e6a3e12f9c`.
- Audit log response/header ID: `01a21b58-86e4-73d5-a047-285764d8b093`.
- Actor: account owner `jawed@jawed.co.in`.
- Refreshed User Profile API Tokens page reportedly showed one remaining token; target ID absent.

## Preserved credentials and resources

Antigravity reports the following remained active and unchanged:
- Preview Account token `665bc2b6276be4b163993c2a9099ddc2`, scoped to Preview Worker.
- Production Account token `541c00f5dacb4ae59d59a7b0e25af26d`, scoped to Production Worker.
- Read-only Cloudflare Agent User token `d15435aa60b060da9523d553983df908`.
- GitHub `preview-deployment` environment secret and its reviewer/branch/bypass protections.
- Workers, D1, DNS, routes and deployments.

No token secret values were displayed. No customer project or `jawed.co.in` resource was accessed or modified.

## Evidence qualification

The HTTP 200 response, refreshed token inventory, and token-revocation audit event are supplied in the Antigravity report. ChatGPT's Cloudflare OAuth session cannot access User Profile token endpoints: its DELETE attempt returned HTTP 403 for missing `API Tokens Write`, and a subsequent GET token-list attempt returned HTTP 403 for missing `API Tokens Read/Write`. A narrow audit-log query by ChatGPT returned no matching rows, so the event details have not been independently reproduced through this OAuth connection.

## Stage outcome

**Stage 5: owner-reported complete; exact target token reported revoked and absent from active listings.** The previously broad, non-expiring legacy Build token is decommissioned. Preserve the three remaining tokens above. Do not interpret this token cleanup as authorization to deploy Production or alter any other credential or infrastructure.

