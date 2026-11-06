# Studio HQ CRM API

## Scope
First private CRM slice: client records only. It depends on the Firebase owner verifier and the dedicated D1 binding `HQ_DB` prepared in the preceding branches.

## Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/hq/clients` | List active clients |
| GET | `/api/hq/clients?archivedOnly=true` | List archived clients |
| POST | `/api/hq/clients` | Create a client |
| GET | `/api/hq/clients/:id` | Read one client |
| PATCH | `/api/hq/clients/:id` | Update allowed client fields |
| POST | `/api/hq/clients/:id/archive` | Soft-archive a client |
| POST | `/api/hq/clients/:id/restore` | Restore an archived client |

## Request security
- Every route requires a Firebase ID token in the Authorization Bearer header.
- Worker verifies the token signature and Firebase claims, then checks the exact two-owner allowlist.
- Same-origin request context is enforced; no wildcard CORS.
- D1 is accessed only by the Worker after authorization.
- Private responses use `Cache-Control: no-store`.
- Request JSON is limited to 16 KiB.
- SQL values use prepared statement bindings; dynamic update field names come only from a fixed allowlist.
- Unknown fields and invalid status/email/URL values are rejected.
- There is no permanent-delete endpoint.
- Mutations upsert the verified owner row and write an audit log in the same D1 batch.

## Client fields
`name`, `business_name`, `status`, `email`, `phone`, `website_url`, `billing_address`, `notes`, and `source`.

Statuses: `lead`, `prospect`, `active`, `paused`, `completed`, `closed`.

## Current limitations
- This API is implemented on a feature branch and has not been deployed.
- No live Worker-to-D1 request has been exercised yet.
- Rate limiting is not yet implemented.
- Customer-contact records and project linking are not yet exposed through the UI.
- Firebase token revocation checks are not implemented; the authentication design document records this limitation.
- Do not store passwords, API keys, payment card data, or customer credentials in CRM notes.

## Verification before enabling
1. Pass branch CI (auth tests, CRM validation tests, D1 migration tests, TypeScript and production build).
2. Deploy only to a preview environment after PR review.
3. Test both owner accounts and a denied third account.
4. Verify create/list/read/update/archive/restore against the dedicated D1 database.
5. Confirm audit rows and no-store headers.
