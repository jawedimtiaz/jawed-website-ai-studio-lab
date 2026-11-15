# Studio HQ D1 Backup and Recovery Runbook

**Status:** Prepared for review; not yet executed  
**Database:** `jawed-studio-hq`  
**Database ID:** `d9ec83ea-7114-4179-af8e-a22ba5494508`  
**Region:** APAC  
**Purpose:** Define a controlled backup, recovery, and validation procedure for the Studio HQ D1 database.

> **Safety boundary:** This document is a runbook, not authorization to run it. No export, import, restore, migration, database write, or Cloudflare configuration change was performed while preparing it. A D1 Time Travel restore overwrites the live database in place. Obtain explicit approval for the exact operation and maintenance window before any destructive step.

## 1. Current known state

The latest read-only reconciliation recorded:

- Database name and ID match the repository's `HQ_DB` binding.
- Applied migration ledger contains `0001_studio_hq_schema.sql` and `0002_financial_management.sql`.
- `PRAGMA quick_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows at the time checked.
- A Time Travel bookmark was observed, but no SQL export, import, restore, or recovery drill has been performed.
- The database contains business/customer and financial application tables. Treat exports as sensitive customer and financial data.

Re-run read-only checks before relying on these observations; database state can change.

## 2. Cloudflare D1 recovery mechanisms

### Time Travel

Cloudflare documents D1 Time Travel as point-in-time recovery. It is enabled automatically on supported production-storage databases. The retention window depends on plan: up to 30 days on Workers Paid and up to 7 days on Workers Free. Confirm the actual database storage version and account plan before setting recovery objectives.

Read-only bookmark inspection:

```bash
npx wrangler d1 info jawed-studio-hq
npx wrangler d1 time-travel info jawed-studio-hq
```

The first command should be reviewed for the database `version`; Time Travel requires the production storage backend. Record the returned current bookmark and timestamp in the incident/change record. A bookmark is a recovery point reference, not an independently stored export.

**Do not run a restore command during routine checks.** Restore is destructive and overwrites the database in place:

```bash
# DESTRUCTIVE — DO NOT RUN without explicit approval and a change window.
npx wrangler d1 time-travel restore jawed-studio-hq --bookmark="<approved-bookmark>"
```

Cloudflare returns a `previous_bookmark` after restore; retain it so a rollback of the restore can be considered if required. This is not a substitute for a separately stored export.

### SQL export

A D1 SQL export can provide a separate artifact for retention and recovery. Cloudflare documents:

```bash
# DATA EXPORT — accesses live database; schedule and approve first.
npx wrangler d1 export jawed-studio-hq --remote --output=./secure-backups/jawed-studio-hq-<UTC_TIMESTAMP>.sql
```

Important operational considerations:

- A running D1 export can block other database requests while it runs. Assess database size and choose a maintenance window.
- Store the export outside the Git repository in an access-controlled, encrypted backup location.
- Never commit SQL dumps, customer records, owner records, invoices, payments, refunds, or secrets to GitHub.
- Record export completion, file size, SHA-256 checksum, timestamp, and the bookmark/backup point associated with it.
- Confirm the export completed successfully and that the file is non-empty before treating it as a backup.
- Protect the backup with retention and access controls appropriate for customer and financial data.

## 3. Pre-backup checklist

Before any approved export:

1. Confirm the target database name and UUID against the current Cloudflare D1 record and `wrangler.jsonc`.
2. Confirm the Cloudflare account and authenticated Wrangler identity; do not paste tokens or credentials into chat, GitHub, logs, or this document.
3. Confirm the database storage version and Time Travel retention window.
4. Review database size and expected export duration.
5. Choose a low-traffic maintenance window because export can temporarily block queries.
6. Notify affected users/operators and pause sensitive write activity if required by the approved plan.
7. Confirm the secure backup destination, encryption, access permissions, retention period, and recovery owner.
8. Capture the current Time Travel bookmark and UTC timestamp.
9. Obtain explicit approval for the export operation.

## 4. Export verification and evidence

After an approved export:

- Confirm Wrangler reports successful completion.
- Confirm the expected SQL file exists in the secure backup location and is non-empty.
- Calculate a SHA-256 checksum and store it with the backup metadata.
- Inspect the dump header and schema statements without exposing row data.
- Confirm the dump contains the expected canonical HQ tables and migration ledger entries.
- Keep a record of the database UUID, export timestamp, bookmark, checksum, tool version, operator, and outcome.
- Do not claim recovery readiness solely because an export file exists. A restore/import test is required.

## 5. Recovery decision

Choose the recovery method based on the incident:

- **Recent accidental data change or failed migration:** consider Time Travel to a known-good bookmark, subject to explicit approval and a controlled restore window.
- **Longer-term recovery or recovery beyond the Time Travel retention window:** use a separately stored SQL export, subject to import compatibility and validation.
- **Uncertain target point or suspected ongoing compromise:** stop writes and preserve evidence before choosing a recovery point. Do not restore over the live database until the incident owner approves the point and rollback plan.

## 6. Restore controls — destructive

Before restoring the live database:

1. Open a change/incident record with business owner approval for the exact database UUID, target bookmark/export, reason, and time.
2. Confirm the latest available backup/export and capture the current bookmark as a potential rollback point.
3. Identify all application writers and schedule a maintenance window; prevent concurrent writes during recovery.
4. Confirm the selected recovery point predates the incident and is within the supported retention period if using Time Travel.
5. Confirm a separate recovery copy exists where practical. Do not assume Time Travel creates a clone.
6. Have a second reviewer verify the database ID, target bookmark/file, and command.
7. Execute only the specifically approved restore/import procedure.
8. Record the returned bookmark and previous bookmark, command result, operator, UTC time, and any errors.

**Never test a restore against the live Studio HQ database.** A meaningful restore drill should use a separate, explicitly approved disposable D1 database with a controlled copy of the export. Creating that database and importing customer data requires separate authorization and data-handling review. Until such a drill is completed, restore capability remains unproven.

## 7. Post-recovery validation

After an approved recovery, keep application writes disabled until the following checks pass:

- `PRAGMA quick_check` returns `ok`.
- `PRAGMA foreign_key_check` returns no rows.
- `d1_migrations` contains the expected canonical migrations in the correct order.
- Expected HQ tables, indexes, and triggers are present.
- Owner authorization prerequisite is present; validate it using a boolean-only check and do not print owner email, UID, or other identity fields into logs.
- Run the repository's isolated schema and HQ test suites against a safe test environment; do not point local tests at the live database.
- Perform approved application-level read-only smoke checks.
- Confirm audit-log append-only protections and financial consistency checks.
- Re-enable writes only after the incident owner accepts the validation evidence.
- Monitor errors and reconcile the Worker/database state after service restoration.

## 8. Recovery drill plan — not yet performed

A future drill should:

1. Obtain approval to create/use a disposable D1 database and to place a controlled copy of the export there.
2. Use a non-production environment and synthetic or explicitly approved sanitized data.
3. Import the SQL export into the disposable database using the documented Wrangler D1 import/execute procedure appropriate to the dump format.
4. Verify schema, migration ledger, foreign keys, triggers, and representative application queries.
5. Record duration, errors, row/table-level validation results without exposing personal or financial data.
6. Delete the disposable database only after explicit approval and evidence retention.
7. Update this runbook with actual measured recovery time and any gaps.

Until this drill is completed, **RTO and RPO are not established**, and backup/restore must not be described as tested.

## 9. Change record template

Record these fields in the approved change/incident system (not in a public repository if they contain sensitive data):

- Change/incident ID:
- Approver:
- Operator and reviewer:
- Database name and UUID:
- Database storage version / plan retention:
- Operation: export / Time Travel restore / import / drill
- UTC start/end:
- Source bookmark or export checksum:
- Previous bookmark (if restore):
- Result bookmark (if restore):
- Validation results:
- Application write freeze/re-enable times:
- Exceptions, errors, and follow-up actions:

## 10. Official references

- [Cloudflare D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Cloudflare D1 import and export data](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [Cloudflare D1 export API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/)
- [Cloudflare D1 Time Travel restore API](https://developers.cloudflare.com/api/resources/d1/subresources/time_travel/methods/restore/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

Cloudflare documentation reviewed on 15 November 2026. Recheck the current documentation and Wrangler version before executing any procedure.
