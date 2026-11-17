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


## Phase 2G — Tasks and Milestones data-model review

**Scope:** Read-only source comparison of the GAIS task/milestone UI and handlers, the PR #54 canonical handlers, and the canonical PR #54 migration schema.

### 1. GAIS UI contract

The GAIS Projects module exposes these task fields:

- `project_id`, `title`, `description`
- `status`: Todo, In Progress, Review, Blocked, Done, Completed, Cancelled
- `priority`: Low, Medium, High, Critical
- `assigned_to`, `due_date`

Milestone fields:

- `project_id`, `name`, `description`
- `status`: Pending, In Progress, Completed, Delayed
- `due_date`

The UI loads `GET /api/hq/tasks` and `GET /api/hq/milestones`, and the project detail bundle expects task/milestone arrays. GAIS handlers operate on `project_tasks` and `project_milestones`.

### 2. Canonical D1 schema contract (PR #54 migration 0001)

The canonical migration defines `project_tasks` with `project_id`, `milestone_id`, `title`, `description`, `status`, `priority`, `assigned_to`, `due_date`, `completed_at`, `sort_order`, `created_by`, `updated_by`, timestamps and archive fields.

It defines `project_milestones` with `project_id`, `name`, `description`, `status`, `due_date`, `completed_at`, `sort_order`, timestamps and archive fields.

**The table and core column concepts match the GAIS handlers.** But the canonical migration constrains status and priority values to lowercase enums:
- Task status: `todo`, `in-progress`, `blocked`, `done`, `cancelled`
- Task priority: `low`, `normal`, `high`, `urgent`
- Milestone status: `not-started`, `in-progress`, `blocked`, `completed`, `skipped`

This differs from GAIS's title-case status/priority labels. A deliberate bidirectional enum adapter is required. In particular, GAIS `Review`, `Completed` (task), and `Delayed` (milestone) have no exact canonical enum equivalent. They must not be silently coerced. Product decision required for mapping or UI option changes.

### 3. Critical inconsistency discovered in the canonical PR #54 branch

The canonical PR #54 endpoint files currently named `functions/api/hq/tasks.js` and `functions/api/hq/milestones.js` do **not** query the tables defined in the canonical migration:

- `tasks.js` queries `hq_tasks`, while migration 0001 defines `project_tasks`.
- `milestones.js` queries `hq_milestones`, while migration 0001 defines `project_milestones`.
- The endpoint fields are also older contracts: task handler uses a reduced field list; milestone handler expects `title` and `target_date`, whereas the migration uses `name` and `due_date`.
- The canonical endpoint handlers use the GAIS-era `verifyAndAuthorizeOwner` helper contract, whereas the canonical shared security helper `hqApi.js` exports `authorizeHqOwner`, `hqJson`, `readHqJson`, and owner-guard/audit statement helpers. The endpoint imports are therefore not aligned with the current shared helper contract either.

This is a source-level defect/inconsistency in the PR #54 branch, not a live database test result. Do not connect these handlers to the live Worker or deploy them as-is. Do not assume the existence of `hq_tasks` or `hq_milestones` in the live D1 database.

### 4. Safe integration decision

1. Treat canonical migration 0001's `project_tasks` and `project_milestones` tables as the intended data model, subject to final reconciliation against the live D1 schema already inspected earlier.
2. Do not reuse the current PR #54 task/milestone handlers without correction.
3. Implement replacement handlers only after explicitly using canonical `authorizeHqOwner`, same-origin checks, bounded JSON parsing, `requireHqDatabase`, owner-authorization guard statements in every mutating D1 batch, and audit statements.
4. Use the canonical lowercase enum values in API/database contracts. Decide whether the UI should adopt canonical values directly or use a tested, explicit label adapter. Never map unsupported statuses to a different meaning silently.
5. Use soft-archive semantics consistent with the canonical schema; avoid GAIS hard DELETE endpoints for business records.
6. Keep task/milestone actor IDs server-derived. Validate that referenced project and milestone belong together before insert/update.

### Phase 2G findings

- **Schema tables/columns:** GAIS and canonical migration mostly align at the structural level.
- **Enums:** incompatible and need explicit mapping or UI adjustment.
- **Canonical endpoint handlers:** currently inconsistent with the canonical migration and shared security helper; must be corrected before integration.
- **Risk:** deploying the existing PR #54 task/milestone handlers could produce missing-table or missing-export failures.
- **No code changes, migrations, D1 writes, automated tests, or deployments were performed in this phase.


## Phase 2H — Financial data model and API review

**Scope:** Read-only comparison of the GAIS Business module, its financial endpoints and GAIS migrations against the canonical PR #54 financial handler and migrations. No financial records were created or changed.

### 1. GAIS Business module contract

The UI has five submodules: Quotations, Proposals, Invoices, Payments and Expenses. It expects separate endpoints and response arrays:

- `/api/hq/quotations` → `{ quotations }`, detail response `{ quotation, items }`
- `/api/hq/proposals` → `{ proposals }`
- `/api/hq/invoices` → `{ invoices }`, detail response `{ invoice, items, payments }`
- `/api/hq/payments` → `{ payments }`
- `/api/hq/expenses` → `{ expenses }`

GAIS forms collect major currency units in the browser and convert them to integer minor units for API calls. GAIS uses paise for INR, and its quotation/invoice line items use decimal `quantity`, `unit_price_minor`, and server-computed `line_total_minor`.

### 2. Canonical financial schema and handler

Canonical PR #54 uses one consolidated `functions/api/hq/financial.js` handler rather than five separate endpoint modules. The canonical migration 0001 defines the base tables `quotations`, `invoices`, and `payments`; canonical migration 0002 adds item detail, financial sequence, payment idempotency and refund support.

| Concept | GAIS schema / API | Canonical PR #54 schema / API | Integration impact |
|---|---|---|---|
| Quotation number | `quotation_number` | `quote_number` | Must map field and printable document label |
| Quotation lifecycle | Title-case: Draft, Sent, Approved, Declined, Expired, Converted | Lowercase: draft, sent, accepted, rejected, expired, withdrawn | Not equivalent; decide UI vocabulary and explicit mapping |
| Quotation terms | `terms` | `terms_markdown` | Field adapter needed |
| Invoice issue date | `issue_date` | `issued_on` | Field adapter needed |
| Invoice due date | `due_date` | `due_on` | Field adapter needed |
| Paid amount | `paid_amount_minor` | `amount_paid_minor` | Field adapter needed |
| Invoice balance | Stored `balance_due_minor` | Derived from payments less refunds | Do not treat GAIS stored balance as canonical source of truth |
| Invoice status | Title-case incl. Partially Paid / Overdue | Lowercase incl. partially-paid / overdue | Explicit UI/API mapping required |
| Line item quantity | REAL decimal `quantity` | Integer `quantity_milli` (thousandths) | Conversion and rounding contract required |
| Line item discount/tax | Document-level discount and tax rate fields | Per-item discount and tax basis points | Calculation semantics differ; totals must be reconciled |
| Payment date | `payment_date` | `paid_at` | Field and timestamp semantics differ |
| Payment method | Free-form/title-case | Constrained: bank-transfer, upi, cash, card, other | Validate and map explicitly |
| Payment reversal | Status `Reversed`, invoice totals updated | Archive/refund model with refund records and idempotency | Do not implement canonical reversal as hard delete |
| Numbering | Generic sequence helper with QUO/INV prefix | Financial-year sequence, e.g. `QUO/YYYY-YY/NNNN` and `INV/YYYY-YY/NNNN` | UI must display canonical generated number |
| Monetary precision | Integer minor units | Integer minor units, bounded safe amounts | Common principle; validation/calculation differs |

Canonical migration 0002 stores quantity in thousandths, uses per-line discount and tax, and constrains monetary amounts. Canonical `calculateItems` uses integer/BigInt arithmetic and explicit bounds. GAIS `computeTotals` / `computeInvoiceTotals` use floating-point decimal quantity multiplication and document-level discount/tax. A shared adapter must not simply rename fields: the calculation model and rounding point need an explicit decision and regression tests.

### 3. Features with no canonical counterpart

- **Proposals:** GAIS has a `proposals` table and API (proposal number, executive summary, scope, timeline, deliverables, amount and lifecycle). Canonical PR #54 has no proposals table or endpoint. This requires a separately reviewed additive schema/API design; do not assume migration 0003 is safe to apply.
- **Expenses:** GAIS has an `expenses` table and API with client/project, category, vendor, billable flag, incurred date and status. Canonical PR #54 has no expenses table or endpoint. Add only through a new canonical migration after schema and access-control review.
- **Quotation-to-invoice conversion:** GAIS implements conversion in the quotations POST action. Canonical handler needs its own reviewed conversion workflow and uniqueness/idempotency safeguards before the UI exposes this action.
- **Refunds:** Canonical migration supports payment refunds and refund idempotency; GAIS payment endpoint only records or reverses a payment. The UI needs a deliberate refund/reversal workflow, not a destructive shortcut.

### 4. Important integrity and security observations

1. GAIS payment creation checks for an idempotency key, but its lookup-and-insert flow and schema are not the canonical idempotency contract. Canonical keys bind invoice, payment and request fingerprint.
2. GAIS payment reversal marks a payment reversed and updates invoice totals; GAIS endpoint exposes a DELETE action. Canonical records are designed around archival/refunds and restrictive foreign keys. Do not wire a UI trash/delete action to canonical financial records.
3. GAIS invoice/quotation update handlers and canonical financial handlers have different field allowlists, validation, response envelopes and write-guard patterns.
4. Canonical financial mutations must retain canonical owner authorization, rate limiting, owner guard statements, and audit statements. GAIS handlers use the incompatible `verifyAndAuthorizeOwner` / `auth.owner` helper contract.
5. The canonical handler validates that a selected project belongs to the selected active client. GAIS handlers check client existence but must not be assumed to enforce the same relationship.
6. The GAIS `expenses` and `proposals` handlers depend on tables from GAIS migration 0003. That migration also adds multiple unrelated operations tables and is not an approved migration for the live database.

### 5. Migration collision — do not apply GAIS financial migration

The GAIS `migrations/hq/0002_financial_management.sql` creates complete financial tables and columns (including `quotation_number`, `issue_date`, `due_date`, `paid_amount_minor`, decimal `quantity`, and a different `financial_sequences` shape).

The canonical PR #54 migration `0001_studio_hq_schema.sql` already creates the base financial tables with different names/columns; canonical `0002_financial_management.sql` is an additive migration that assumes those canonical tables and adds item/sequence/idempotency/refund support. These files are not interchangeable despite sharing the filename and migration number.

The live D1 was previously verified to have canonical migrations 0001 and 0002 recorded as applied. Therefore:
- Never apply GAIS 0002 or GAIS 0003 to the live HQ D1.
- Never rename or replace canonical migration files to make GAIS SQL fit.
- Any new proposal/expense capability must use a newly numbered canonical additive migration after a schema review and isolated preview test.
- No migration was run in this phase.

### 6. Safe financial integration decision

1. Keep the GAIS Business UI as a visual/functional reference, not as a direct consumer of its current handlers.
2. Make canonical financial schema and handler the authority for quotations, invoices and payments, after the canonical handler is fully reconciled and tested against migrations 0001/0002.
3. Define a typed UI adapter for canonical response envelopes, document numbers, lifecycle values, dates, quantities, line totals and payment summaries.
4. Decide whether to adapt the UI to canonical lowercase statuses and milli-quantity contract, or maintain explicit presentation labels with tested conversion functions.
5. Design proposal and expense support separately, with additive migrations and canonical auth/audit/soft-archive rules.
6. Replace destructive payment deletion with an auditable reversal/refund flow; preserve idempotency.
7. Add unit tests for monetary calculations, rounding, quantity conversion, invoice balance/status derivation, duplicate payment/refund requests, and quotation conversion before preview deployment.

### Phase 2H findings

- **Quotations / invoices / payments:** same business concepts, but substantial schema, API, status, date, quantity and calculation differences; adapters and tests are mandatory.
- **Proposals / expenses:** GAIS-only capabilities; no canonical table/handler currently exists in PR #54.
- **Financial migration:** GAIS 0002 is incompatible with canonical 0001/0002 and must never be applied to the existing HQ D1.
- **Risk:** direct deployment of GAIS financial handlers against canonical D1 would encounter mismatched columns and helper contracts; financial write/delete semantics also differ.
- **No application code, migrations, D1 writes, automated tests, or deployments were performed in this phase.
