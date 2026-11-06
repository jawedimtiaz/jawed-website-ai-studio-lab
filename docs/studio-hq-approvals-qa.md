# Studio HQ Approvals and QA API

## Approval routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/hq/projects/:id/approvals` | List approval requests |
| POST | `/api/hq/projects/:id/approvals` | Create approval request |
| PATCH | `/api/hq/approvals/:id` | Approve, reject, or withdraw a pending request |

Approval types: scope, design, content, QA, production release, handover, other.

Only an authorized owner can decide an approval in this implementation. A customer-facing approval link or portal is not included.

## QA routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/hq/projects/:id/qa` | List QA checks |
| POST | `/api/hq/projects/:id/qa` | Create QA check |
| PATCH | `/api/hq/qa/:id` | Update QA result, notes, or evidence |

QA categories: functionality, responsive, accessibility, SEO, performance, security, browser, content, backup, other.

Results: not-run, pass, fail, blocked, not-applicable.

## Security
- Shared Firebase token verification and exact owner allowlist.
- Server-side D1 access only.
- Prepared SQL statements and input allowlists.
- Same-origin checks, no-store responses, Worker security headers.
- Mutations write audit entries in the same D1 batch.
- No public customer approval route.

## Limitations
- Production release blocking is not yet wired to the deployments API.
- No automated evidence capture.
- No rate limiting or Firebase token revocation checks yet.
- No preview deployment or live Worker API test.
