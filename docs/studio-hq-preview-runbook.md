# Studio HQ Preview D1 Runbook

## Purpose and safety boundary

This runbook is for the isolated Studio HQ preview environment only. It does not authorize a database migration, Worker creation/deployment, owner enrollment, PR merge, or changes to the existing Lab Worker/database. Obtain separate explicit approval for each of those actions.

## Environment inventory

| Resource | Existing Lab | Isolated HQ Preview |
|---|---|---|
| Worker script name | `jawed-website-ai-studio-lab` | `jawed-studio-hq-preview` (configured, not created/deployed) |
| D1 database | `jawed-studio-hq` | `jawed-studio-hq-preview` |
| D1 database ID | `d9ec83ea-7114-4179-af8e-a22ba5494508` | `623a828d-2909-47e7-a228-130b4eeefef5` |
| Wrangler config | `wrangler.toml` / `wrangler.jsonc` | `wrangler.hq-preview.toml` |
| Observed table count | 18 | 0 |

The preview database was observed empty during the PR #9 review. Re-check its identity and table count immediately before any approved migration; these values can change.

## Non-negotiable target selection

- For preview-only D1 operations, explicitly select `wrangler.hq-preview.toml`.
- Never edit the root `wrangler.toml` or `wrangler.jsonc` to point at preview.
- Never run a D1 migration command without an explicit `--config wrangler.hq-preview.toml` argument.
- Stop if the selected database name or UUID does not exactly match the preview values above.
- Do not use `--local` for a remote preview migration.

## Migration inventory

Migration file: `migrations/hq/0001_studio_hq_schema.sql`

Reviewed structure:
- 17 application tables
- 20 indexes
- 2 triggers that reject UPDATE and DELETE on `audit_logs`
- Foreign keys use `ON DELETE RESTRICT`
- Monetary amounts are stored as integer minor units
- IDs are application-generated UUID strings

Review observations before production use:
- `project_tasks.milestone_id` references a milestone, but the database does not enforce that the milestone belongs to the same `project_id` as the task. Validate this relationship in the API or add a deliberate schema constraint in a separately reviewed change.
- `activity_notes` requires at least one of `client_id` or `project_id`, while allowing both. Confirm that this is the intended business rule.
- The migration uses `IF NOT EXISTS`; this makes object creation repeat-tolerant but is not a substitute for checking migration history and schema state.
- Foreign-key enforcement should be checked for every connection/runtime path. Keep application-side authorization and validation; foreign keys are not an authorization mechanism.

## Preflight checklist — do not skip

Before a separately approved migration:
1. Confirm the checked-out branch and exact commit SHA.
2. Confirm the preview config still names `jawed-studio-hq-preview` and UUID `623a828d-2909-47e7-a228-130b4eeefef5`.
3. Confirm root Wrangler configs still name the existing Lab Worker and existing D1 UUID.
4. Read the Cloudflare D1 database record again and confirm the preview database identity.
5. Query the preview database's schema catalog read-only and confirm it is empty, or reconcile any existing objects before proceeding.
6. Confirm the Wrangler CLI version is explicitly pinned/approved. The repository's current `package.json` does not declare Wrangler, so do not rely on an unpinned `npx wrangler` download.
7. Review the complete migration diff and confirm a backup/recovery plan.
8. Obtain explicit approval to apply this exact migration to this exact preview database.

## Approved migration command template

Only after all preflight checks and separate explicit approval, use the repository's approved, pinned Wrangler CLI version and run:

```sh
npx wrangler@<APPROVED_VERSION> d1 migrations apply jawed-studio-hq-preview --remote --config wrangler.hq-preview.toml
```

Do not replace the config argument with the default config. Do not run this command as part of routine build, test, or deployment steps.

After an approved migration, verify the migration history, expected table/index/trigger inventory, and foreign-key checks using read-only queries. Record the command output and resulting commit SHA in the project evidence. A successful CLI exit alone is not sufficient verification.

## Separate approvals still required

- Applying `0001_studio_hq_schema.sql` to the preview D1 database.
- Creating or deploying the isolated preview Worker and configuring its bindings.
- Enrolling an owner UID or writing any user record.
- Merging PR #9 or any prerequisite PR.
- Any change to the existing Lab Worker, its configuration, or the existing D1 database.
