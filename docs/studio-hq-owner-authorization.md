# Studio HQ owner authorization operations

## Authorization policy

Every Studio HQ session, CRM, and Projects API request must pass both gates:

1. A Firebase ID token with a valid RS256 signature, verified against Google's Secure Token signing certificates and the configured Firebase project.
2. A matching `hq_users` row in the environment's `HQ_DB` binding with the same Firebase UID, a case-insensitive matching email, and `status = 'active'`.

Missing database bindings, failed database lookups, unregistered UIDs, email mismatches, and disabled owners are denied. Ordinary API requests cannot enroll an owner or change owner status.

## Initial owner enrollment (manual administrator operation)

There is intentionally no public first-owner bootstrap endpoint.

Before enabling Studio HQ in a new environment:

1. Confirm the exact Cloudflare D1 database bound as `HQ_DB` for that environment. Do not use production credentials or a production database for local/preview testing.
2. Apply the existing Studio HQ schema migration to that environment only after reviewing the migration and receiving explicit approval.
3. Obtain the owner's Firebase UID from the Firebase Authentication user record. Do not accept a UID supplied by a browser request.
4. Have an authorized database administrator insert the owner record using the UID and verified email obtained from trusted administrator consoles.

Example SQL template (replace placeholders only after independently verifying them):

```sql
INSERT INTO hq_users (uid, email, status)
VALUES ('<VERIFIED_FIREBASE_UID>', '<VERIFIED_OWNER_EMAIL>', 'active');
```

Do not run this statement against a database until the environment and owner identity have been confirmed. The application does not automatically enroll the first caller.

## Disable an owner

An authorized database administrator can disable an owner:

```sql
UPDATE hq_users
SET status = 'disabled'
WHERE uid = '<VERIFIED_FIREBASE_UID>';
```

The next HQ API request is denied. The login/session path does not reactivate disabled owners.

## Restore an owner

Re-enabling access requires a separate, authorized administrator action after identity verification:

```sql
UPDATE hq_users
SET status = 'active'
WHERE uid = '<VERIFIED_FIREBASE_UID>';
```

Record the administrator, reason, approval, target environment, and timestamp in the organization's operational audit record.

## Verification

Run:

```sh
npm run test:hq-auth
npm run lint
npm run build
```

The authorization tests cover active owner access, disabled owner rejection, missing owner rejection, email mismatch, missing/unavailable D1, and the transaction-time SQL guard. A successful CI run does not replace deployed lab verification.


## Transaction-time authorization guard

Every mutating CRM and project D1 batch starts with an owner authorization guard. The guard checks the verified Firebase UID, normalized email, and active D1 status inside the same D1 transaction as the data mutation and audit insert. If the owner is missing, disabled, or mismatched, the guard raises a SQL error; Cloudflare D1 rolls back the complete batch. This closes the gap where an owner could be disabled after the initial request authorization check but before the write batch executes.
