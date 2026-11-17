# Studio HQ GAIS / Canonical Integration Matrix

**Status:** Read-only source inventory; no runtime verification implied.  
**Working branch:** `feat/studio-hq-gais-integration-20261117`  
**Comparison baseline:** `reconcile/studio-hq-canonical-main-20261117` (PR #54 branch)

## Safety boundaries

- Do not deploy this integration branch to the production Worker.
- Do not apply, edit, rename, or reorder migrations against the existing HQ D1 database until schema drift is reconciled.
- Do not replace GAIS handlers wholesale with canonical handlers.
- Preserve PR #54 and PR #55 unchanged.
- Preserve the current GAIS dashboard UI as the feature/design reference.
- Keep the personal website and Kaushal customer project separate.

## Frontend module to GAIS API mapping

| Dashboard module | GAIS API paths found in source | Canonical API files found on PR #54 branch | Status |
|---|---|---|---|
| Overview | overview, approvals | session, clients, projects, tasks, milestones, financial, release | Overview response needs a canonical aggregate design; approvals is GAIS-only |
| CRM | leads, clients, contacts, follow-ups, notes | clients | Only client management has a direct canonical domain counterpart; remaining CRM endpoints need design and schema mapping |
| Projects | projects, tasks, milestones | projects, tasks, milestones | Domain overlap exists; request/response fields and authorization contracts differ and require adapters |
| Business | quotations, proposals, invoices, payments, expenses | financial | Canonical financial API is consolidated; GAIS separate endpoints and proposal/expense features need explicit mapping |
| Operations | onboarding, approvals, qa, maintenance, support | no matching canonical domain handlers found | GAIS-specific features; require schema, API, and authorization design |
| Development | repositories, deployments | release | Release history overlaps partially; repository and deployment records need integration design |
| Analytics | analytics | no matching canonical analytics handler found | Build read-only aggregates from canonical schema; do not rely on GAIS SQL until schema is mapped |
| Settings | settings, audit-logs | session and shared audit/security helpers | Keep security configuration server-controlled; audit logs must use canonical audit semantics |

## Source inventory

### GAIS branch

The following endpoint modules exist under `functions/api/hq/`:

`analytics.js`, `approvals.js`, `clients.js`, `contacts.js`, `deployments.js`, `expenses.js`, `follow-ups.js`, `invoices.js`, `leads.js`, `maintenance.js`, `milestones.js`, `notes.js`, `onboarding.js`, `overview.js`, `payments.js`, `projects.js`, `proposals.js`, `qa.js`, `quotations.js`, `repositories.js`, `session.js`, `settings.js`, `support.js`, `tasks.js`.

The eight UI sections call these APIs through `src/services/hqService.ts`, which obtains a Firebase ID token and sends it as a Bearer token.

### Canonical PR #54 branch

The following domain endpoint files exist under `functions/api/hq/`:

`clients.js`, `financial.js`, `milestones.js`, `projects.js`, `release.js`, `session.js`, `tasks.js`.

Canonical shared security modules include `hqAuth.js`, `hqApi.js`, and `hqRateLimit.js`.

## Known incompatibilities requiring resolution

1. **Auth helper contract:** GAIS handlers import `verifyAndAuthorizeOwner`, `jsonResponse`, `errorResponse`, `readJsonBody`, and `auditLog`. Canonical handlers use `authorizeHqOwner`, `hqJson`, `readHqJson`, `requireHqDatabase`, owner-guard statements, and canonical audit statements. These are not drop-in compatible.
2. **Session/enrollment:** GAIS exposes `/api/hq/session/enroll` and a controlled bootstrap flow. Canonical session flow does not expose that enrollment endpoint. Do not carry the GAIS enrollment path into the production architecture without a separate security review.
3. **Schema drift:** GAIS migration files `0001` and `0002` differ from canonical files with the same names. The live D1 database has canonical 0001/0002 recorded. Never apply GAIS migration 0003 or replay GAIS 0001/0002 against that database.
4. **Worker bindings:** GAIS `wrangler.jsonc` currently lacks the HQ D1 and rate-limit bindings required by the canonical backend.
5. **Response shapes:** GAIS frontend expects `success` / `owner` session response fields and GAIS-specific payload names. Canonical session and domain handlers use different response and identity shapes. An explicit frontend adapter or endpoint adapter is required.
6. **Currency and amounts:** GAIS frontend formats integer minor units as paise. Canonical schema uses integer minor units too, but field names and financial sequence models differ. Validate each mapping; do not assume same columns.

## Recommended integration order

1. Freeze the API contract and data model mapping for clients, projects, tasks, milestones, and financial records.
2. Build a compatibility layer that uses canonical owner authorization and canonical D1 write guards.
3. Add missing CRM and operations capabilities through new, additive canonical migrations only after schema review and preview-database isolation are proven.
4. Adapt dashboard API calls and response types to the canonical contract.
5. Reconcile Worker routing and bindings, including a genuinely isolated preview D1 and rate-limit namespaces.
6. Run unit, API, migration, build, authorization, and browser smoke tests on the integration branch.
7. Deploy only to an isolated preview Worker after all preview resources and secrets/configuration are verified. Production deployment requires separate explicit approval.

## Verification status at time of writing

- Source files and directory inventories were read from the two Git branches.
- No code was changed by this inventory.
- No automated tests were run during this inventory.
- No live D1 migration or data write was performed.
- No Worker deployment was performed.
- The public `/studio-hq` route has not been verified as deployed.
