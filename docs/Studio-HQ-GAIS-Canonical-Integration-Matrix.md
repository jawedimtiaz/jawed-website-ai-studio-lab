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


## Phase 2F — core data model mapping (Clients and Projects)

**Scope:** Source-level comparison of the GAIS dashboard contracts and the canonical PR #54 data model. This is a mapping review, not a runtime test.

### Clients

| Concept | GAIS UI / TypeScript field | Canonical D1 field | Mapping |
|---|---|---|---|
| Record identifier | `id` | `clients.id` | Direct |
| Contact/person display name | `name` | `clients.name` | Direct |
| Business name | `business_name` | `clients.business_name` | Direct |
| Lifecycle | `status` | `clients.status` | Direct only after enforcing canonical allowed values: lead, onboarding, active, paused, completed, archived |
| Email / phone | `email`, `phone` | `clients.email`, `clients.phone` | Direct |
| Category / website / address | `category`, `website`, `address` | same-named columns | Direct |
| Lead source | `lead_source` | `clients.lead_source` | Direct |
| Notes | `notes` | `clients.notes` | Direct for the client-level summary; communication history belongs in `activity_notes` |
| Last contact | `last_contact_at` | `clients.last_contact_at` | Direct |
| Archive timestamp | `archived_at` | `clients.archived_at` | Direct |
| Project count | optional `project_count` | derived count from `projects` | Computed response field, not a stored client column |
| Outstanding balance | optional `outstanding_minor` | derived from invoice balance fields | Computed response field; requires canonical financial contract |

The GAIS `HqClient` interface is substantially aligned with the canonical `clients` table. Client create/update can therefore be adapted without a client-table redesign. However, the GAIS client API's detailed bundle also queries follow-ups, invoices, quotations, maintenance plans, and support tickets; those relationships must not be enabled until the corresponding canonical tables and field contracts are confirmed.

**Important contract mismatch:** GAIS `clients.js` returns `{ success: true, ... }` and uses query parameters such as `includeArchived`; canonical PR #54 uses `{ ok: true, ... }` and has a different archive/action route convention. The current GAIS CRM UI primarily consumes typed arrays from successful `hqFetch` responses, but the API envelope and archive workflows still need a single explicit contract. Do not make a blind response-key replacement.

### Projects

| Concept | GAIS UI / TypeScript field | Canonical D1 field | Mapping |
|---|---|---|---|
| Record identifier | `id` | `projects.id` | Direct |
| Parent customer | `client_id` | `projects.client_id` | Direct; required foreign key |
| Project name | `name` | `projects.name` | Direct |
| Type | `project_type` | `projects.project_type` | Direct |
| Status | `status` | `projects.status` | Requires canonical status vocabulary and case preservation |
| Priority | `priority` | `projects.priority` | Requires canonical values: Low, Medium, High, Critical |
| Summary / scope | `summary`, `scope_markdown` | same-named columns | Direct |
| Start / target date | `start_date`, `target_date` | same-named columns | Direct; validate date ordering |
| Quoted amount | `quoted_amount_minor` | `projects.quoted_amount_minor` | Direct integer minor units |
| Currency | `currency` | `projects.currency` | Direct; validate supported currency |
| Audit ownership | implicit from authenticated owner | `created_by`, `updated_by` | Server-derived only; never trust client-supplied actor IDs |
| Archive | `archived_at` | `projects.archived_at` | Direct concept; canonical archive endpoint also records `archived_by` where schema supports it |

The project table is a good fit for the dashboard's project form and list fields. Canonical PR #54's project handler performs strict field validation, requires a linked non-archived client, validates target date against start date, and writes through an owner authorization guard plus audit statement. The GAIS project handler has a different helper/auth contract and should not replace the canonical handler.

**Status vocabulary is a real integration risk:** the dashboard exposes the set `Lead`, `Planning`, `Quoted`, `Onboarding`, `In Progress`, `Review`, `Client Approval`, `Completed`, `Maintenance`, `On Hold`, and `Cancelled`. The canonical project validator and schema must be treated as the source of truth. Any UI value not accepted by the canonical validator must be mapped deliberately or rejected with a visible validation message; do not silently normalize values.

### Response and API adapter requirements

1. Keep the dashboard's `hqFetch` token acquisition, but route requests only through canonical owner authentication and same-origin protections.
2. Normalize canonical success/error envelopes once in a shared service adapter. Do not mix `success` and `ok` checks in individual components.
3. Normalize archive operations to the canonical route and method contract; preserve audit logging and authorization guards.
4. Ensure list response properties match the UI types (`clients`, `projects`, totals and status counts). Derived counts must be computed server-side.
5. Keep all money values in integer minor units end-to-end; format only at the presentation boundary.
6. Keep actor UID/email, archive actor, timestamps, and audit metadata server-derived.

### Phase 2F findings

- **Clients:** field-level data mapping is mostly direct; API envelope, archive semantics, and related-record bundle are not yet compatible.
- **Projects:** core fields are mostly direct; canonical validation, status vocabulary, authorization/audit write path, and endpoint shape must be preserved.
- **No adapter code was written.** The next safe unit is a small read-only contract adapter design for client/project list and detail responses, followed by tests against the canonical handler contracts.
- **No migrations, D1 writes, tests, Worker deployments, or changes to PR #54/#55 were performed in this phase.
