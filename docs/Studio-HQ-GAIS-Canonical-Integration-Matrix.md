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


## Phase 2I — Operations module and schema review

**Scope:** Read-only review of the GAIS Operations UI and onboarding, approvals, QA, maintenance and support handlers against canonical PR #54 migration 0001. This phase did not change application code or database state.

### 1. GAIS Operations capabilities

The GAIS Operations section exposes five submodules:

- Client/project onboarding checklist (`onboarding_items`)
- Client/project approvals (`approvals`)
- QA checks and defect tracking (`qa_checks`)
- Maintenance plans (`maintenance_plans`)
- Client support tickets (`support_tickets`)

The GAIS handlers use title-case status vocabularies and mostly return `{ success: true, ... }`. They import the GAIS-era `verifyAndAuthorizeOwner`, `jsonResponse`, `errorResponse`, `readJsonBody`, and `auditLog` helper contract.

### 2. Canonical schema coverage

Canonical PR #54 migration 0001 defines `approvals`, `qa_checks`, and `maintenance_plans`, but does not define `onboarding_items` or `support_tickets`. It also defines `assets` and `activity_notes`, which may support parts of onboarding/history but are not direct replacements for GAIS checklist and ticket workflows.

| GAIS module | GAIS table | Canonical table(s) | Assessment |
|---|---|---|---|
| Onboarding | `onboarding_items` | No direct table; `assets` and `activity_notes` are adjacent only | New additive schema/API required |
| Approvals | `approvals` | `approvals` | Same name, incompatible column model and lifecycle |
| QA | `qa_checks` | `qa_checks` | Same name, incompatible column model and lifecycle |
| Maintenance | `maintenance_plans` | `maintenance_plans` | Same name, requires field-by-field mapping |
| Support | `support_tickets` | No direct table | New additive schema/API required |

### 3. Same-name tables are not drop-in compatible

**Approvals**
- GAIS writes `client_id`, `project_id`, `stage`, `title`, `summary`, title-case `status`, `requested_by`, `reviewed_by`, `decision_notes`, and GAIS timestamps.
- Canonical schema uses `approval_type`, `status` values pending/approved/rejected/withdrawn, `requested_by` and `decided_by` as owner UID foreign keys, `requested_from_email`, `decision_note`, `requested_at`, `decided_at`, and optional deployment/evidence references.
- GAIS's stage/title and reviewer-email model must be redesigned or explicitly adapted. Do not pass email into canonical owner UID foreign-key fields.

**QA**
- GAIS writes `client_id`, `project_id`, `category`, `title`, `status`, `severity`, `defect_description`, `assigned_action`, `resolution_status`, `tested_by`, and `tested_at`.
- Canonical schema uses `project_id`, optional `deployment_id`, constrained `category`, `check_name`, `result`, `evidence_url`, `notes`, `checked_by` UID and `checked_at`.
- Canonical QA is a check/evidence record, while GAIS combines check outcome and defect workflow. Map the concepts deliberately; do not assume `title` equals `check_name` or `severity` has a canonical column.

**Maintenance**
- Both schemas define `maintenance_plans`, but GAIS fields include `plan_name`, `billing_cycle`, `amount_minor`, `start_date`, `expiry_date`, `renewal_reminder_days`, `scope_notes`, and title-case statuses.
- Canonical schema uses its own field vocabulary and constraints (including plan name/status and date/renewal metadata). A column-by-column migration map and status mapping are required before reusing the UI.
- Confirm the exact canonical maintenance columns in handler implementation before writing any adapter; the GAIS handler is not authoritative for canonical SQL.

### 4. New capabilities in GAIS migration 0003

GAIS migration 0003 creates seven tables: `leads`, `follow_ups`, `proposals`, `onboarding_items`, `support_tickets`, `expenses`, and `studio_settings`.

Canonical migration 0001 already contains `clients`, `client_contacts`, `projects`, `approvals`, `qa_checks`, `maintenance_plans`, `assets`, `activity_notes`, and `audit_logs`. It does not contain those seven GAIS 0003 tables. GAIS migration 0003 is therefore a broad feature expansion, not a safe additive migration for the canonical database. Each required capability must be redesigned against canonical foreign keys, owner UID references, audit conventions, soft-archive rules and API guards.

### 5. Integration and security risks

1. GAIS operations endpoints use the incompatible GAIS auth/helper API; the canonical owner authorization and audit statement model must be retained.
2. GAIS approval and QA endpoints insert fields that do not exist in the canonical same-name tables. They will not work unchanged against canonical D1.
3. GAIS approval and QA handlers derive client identity by looking up a project, but canonical authorization/audit semantics require actor UIDs and guard statements within mutating batches.
4. GAIS onboarding and support endpoints require tables absent from canonical schema. They must not be enabled until new canonical migrations are reviewed and tested.
5. GAIS UI exposes delete/trash affordances in Operations. Canonical business records generally use soft archive or restricted references; avoid hard deletes and preserve audit history.
6. Do not use GAIS migration 0003 as a shortcut: it includes seven unrelated tables with different FK delete behavior and lacks the canonical actor/archive constraints.

### 6. Safe Operations integration decision

1. Retain the GAIS Operations UI as a product reference.
2. Rebuild Approvals and QA adapters around canonical fields and canonical status enums; decide whether to simplify the UI to canonical concepts or add explicit presentation adapters.
3. Map Maintenance against the full canonical table and handler before connecting it.
4. Design Onboarding and Support as new canonical capabilities only after separate schema/API threat and data-retention review.
5. Keep all actor identities server-derived as owner UIDs; do not accept actor email/UID fields from the browser.
6. Use canonical owner guards, same-origin checks, bounded request parsing, rate limits, audit statements, and soft-archive semantics for every mutation.

### Phase 2I findings

- **Approvals and QA:** tables exist on both sides but have materially different columns, status models and actor semantics; GAIS endpoints are incompatible with canonical D1.
- **Maintenance:** same business concept and table name, but field-level reconciliation is still required.
- **Onboarding and Support:** GAIS-only tables; no direct canonical table exists.
- **GAIS migration 0003:** must not be applied to the existing HQ D1.
- **No application code, migrations, D1 writes, automated tests, or deployments were performed in this phase.


## Phase 2J — Development, Analytics and Settings review

**Scope:** Read-only review of GAIS Development, Analytics and Settings UI/API contracts against canonical PR #54 schema and release API. No application code, settings, D1 data or deployments were changed.

### 1. Development module — repositories, deployments and release history

GAIS UI exposes:
- Repository metadata: project, repository name/URL, main and development branches, hosting platform, preview/production URLs, health status and notes.
- Deployment log: project, repository, environment, version tag, branch, commit SHA, URL, status and release notes.
- Release History subview, which is presented as a third tab but loads the same deployment/repository collections in the current UI implementation; it does not call a distinct release-history endpoint in the inspected component.

Canonical migration 0001 already defines `repositories` and `deployments`, so these concepts have a direct schema foundation. However, the columns and allowed values differ:

| Concept | GAIS UI / handler | Canonical schema | Required mapping |
|---|---|---|---|
| Repository name | `repo_name` | `repository_full_name` | Map and validate owner/repo identifier |
| Repository URL | `repo_url` | `repository_url` | Direct concept; validate HTTPS URL |
| Main branch | `main_branch` | `default_branch` | Map |
| Development branch | `dev_branch` | No equivalent column | UI-only metadata or separately reviewed schema extension |
| Hosting platform | `hosting_platform` | `provider` (github/gitlab/other) | Not equivalent; hosting provider needs separate field if required |
| Preview/production URLs | Repository metadata fields | Deployment records carry `deployment_url` and `environment` | Model URLs as deployment history, not static repository columns |
| Health | `deployment_status` | Deployment `status` per deployment record | Derive repository health from latest verified deployment; do not duplicate unverified health |
| Deployment version | `version_tag` | No version-tag column | Store in release notes or add a reviewed field |
| Deployment status | Title-case Succeeded/Failed etc. | pending/building/success/failed/rolled-back/cancelled | Explicit enum adapter |
| Actor | GAIS stores owner email in `deployed_by` | `initiated_by` owner UID FK | Server-derived UID only |
| Verification | Not equivalent in GAIS form | `verified_by`, `verified_at`, `verification_notes` | Preserve canonical verification evidence |

Canonical schema includes deployment environment values preview/staging/production and status values pending/building/success/failed/rolled-back/cancelled. GAIS uses its own environment/status vocabulary. A deliberate mapping is required. A deployment record must not be described as verified merely because a user entered a URL or selected a success status.

Canonical PR #54 `release.js` is a consolidated release workflow, not a drop-in version of the GAIS `repositories.js` and `deployments.js` endpoints. It includes canonical approval and QA operations with owner guards, audit statements and evidence URL validation. Repositories/deployments have schema coverage, but endpoint/UI integration still needs exact route and payload mapping.

### 2. Analytics — GAIS assumptions do not match canonical schema

GAIS `AnalyticsSection` expects `/api/hq/analytics` to return:
- Summary: total revenue, total expenses, net profit, total outstanding and overdue outstanding.
- Monthly revenue/expense series.
- Customer performance, project performance and outstanding invoices.

The GAIS analytics handler queries GAIS financial and operations columns, including `payments.payment_date`, `payments.status`, `invoices.paid_amount_minor`, `invoices.balance_due_minor`, `invoices.issue_date`, `invoices.due_date`, `expenses`, and GAIS title-case task/QA states.

Canonical schema instead uses `payments.paid_at`, `invoices.amount_paid_minor`, `invoices.issued_on`, `invoices.due_on`, canonical payment archival/refund records, and lowercase task/QA states. Canonical schema does not currently contain an `expenses` table. Therefore the GAIS analytics SQL is incompatible with canonical D1 and cannot be reused.

There is no dedicated canonical analytics handler in PR #54. Analytics should be implemented as read-only aggregates over canonical tables after financial calculations and expense support have been settled. Revenue must account for payment archival/refunds; outstanding must be derived consistently from invoice totals, payments and refunds; project metrics must use canonical task/QA enums. Expenses and profit reporting must clearly indicate whether expense tracking has been implemented—do not report a fabricated zero expense total as a true profit figure.

### 3. Settings and audit — separate configuration from security controls

GAIS Settings UI includes:
- Owner profile display (current authenticated owner).
- Security overview (allowed email list, enrolled owners, auth mode and audit count).
- Editable workspace defaults (studio name, owner name, contact email, website, currency, tax rate, invoice terms and quotation validity).
- Audit log search/list.

GAIS `settings.js` reads/writes `studio_settings` and queries audit log fields such as `actor_email`, `entity_type`, `action`, and `entity_id`. GAIS migration 0003 creates `studio_settings`; canonical PR #54 migration 0001 does not. Canonical audit log structure and shared audit statements must be used instead of assuming GAIS audit columns.

Canonical owner allowlist and authentication policy are security configuration, not editable workspace preferences. They must remain server-controlled (Worker environment/secret configuration and enrolled owner records) and must never be editable through the GAIS settings form. The canonical schema has `hq_users` and `audit_logs`, but no generic workspace settings table in the inspected migration. A safe workspace-preferences feature therefore needs a new, narrowly scoped canonical schema/API design and must exclude security-critical values.

### 4. Integration decisions

1. Preserve canonical repository/deployment schema and owner UID/verification semantics; create explicit UI adapters for names, enums and status labels.
2. Treat deployment/release history as recorded metadata, not an action that deploys code. Actual Cloudflare deployment remains a separate privileged workflow and must not be triggered by this dashboard.
3. Build a read-only canonical analytics API only after invoice/payment/refund and expense data models are stable. Do not port GAIS SQL.
4. Keep owner allowlists, auth mode, rate-limit configuration, Firebase settings and D1 bindings outside editable workspace settings.
5. If workspace preferences are needed, add a dedicated canonical preferences table with strict field allowlists, bounded values, server-derived actor UID and audit statement. Do not apply GAIS migration 0003.
6. Audit-log search must adapt to canonical audit columns and must not expose tokens, secrets or sensitive request payloads.
7. Add tests for deployment enum/actor validation, URL evidence, release approval requirements, analytics reconciliation against payments/refunds, and settings field allowlists.

### Phase 2J findings

- **Repositories/deployments:** canonical schema exists; GAIS fields and enums differ. Canonical release API is a different workflow and requires explicit route/payload integration.
- **Release History:** the GAIS UI's inspected third tab currently reuses deployment/repository data; no separate history endpoint was found in the component.
- **Analytics:** GAIS SQL is incompatible with canonical financial columns and assumes GAIS expenses; no canonical analytics endpoint exists yet.
- **Settings:** GAIS relies on a table absent from canonical schema. Security configuration must remain server-controlled; workspace preferences require a separate additive design.
- **No application code, migrations, D1 writes, automated tests, or deployments were performed in this phase.


## Phase 2K — Cross-cutting Worker routing, authentication, configuration and test readiness

**Scope:** Read-only source comparison of the GAIS main Worker/router/configuration and canonical PR #54 Worker/security/configuration. No Worker deployment, binding change, authentication change, test execution or D1 write was performed.

### 1. Worker routing is architecturally different

GAIS main `worker.js` dispatches every `/api/hq/*` request through `functions/lib/hqRouter.js`. That router statically imports the GAIS endpoint modules and maps 24 collection routes, including `/api/hq/session/enroll`.

Canonical PR #54 `worker.js` uses explicit route groups and calls canonical handlers:
- `/api/hq/session` → canonical session POST only
- clients → canonical client handler
- project/task/milestone routes → canonical project handler and compatibility aliases
- approvals/QA → canonical release handler
- quotations/invoices/payments → canonical financial handler

The canonical router does not currently expose the GAIS-only leads, contacts, notes, follow-ups, proposals, expenses, onboarding, support, repositories, deployments, analytics, settings or audit-log collection routes as GAIS expects. The route structure is not a drop-in replacement. A future integration router must explicitly map each supported path/method to a canonical handler and return a safe 404/405 for unsupported paths; it must not import the full GAIS handler tree unchanged.

### 2. Session and auth contracts must remain canonical

GAIS `hqRouter` exposes both `/api/hq/session` and `/api/hq/session/enroll`. GAIS session flow includes a controlled enrollment path. Canonical PR #54 session route is deliberately narrower and exposes POST/OPTIONS only; the canonical owner must already exist in `hq_users`.

Canonical `hqApi.js`:
- enforces same-origin request checks,
- verifies Bearer Firebase identity,
- requires the HQ D1 binding,
- verifies the owner UID/email/status against `hq_users`,
- provides bounded JSON parsing,
- provides an owner authorization guard as the first statement in every mutating D1 batch,
- writes audit statements in the same batch as mutations.

GAIS helper functions and handler return contracts are different. Do not shim canonical auth by merely adding legacy export aliases; that could let GAIS handlers skip canonical same-origin checks, database checks, write guards or transactional audit behavior. Implement endpoint-specific adapters that call canonical authorization and guards directly.

### 3. Worker configuration mismatch remains a deployment blocker

GAIS main `wrangler.jsonc` currently declares ASSETS, AI and basic vars only. It does not declare canonical `HQ_DB` or the three required rate-limit bindings.

Canonical PR #54 `wrangler.jsonc` declares:
- dedicated `HQ_DB` D1 binding for the existing HQ database,
- session, write and general rate-limit bindings,
- a separate preview environment with its own named D1 database and separate rate-limit namespaces.

Earlier read-only Cloudflare inspection confirmed the live Worker has an HQ_DB binding but not the canonical three rate-limit bindings. Earlier D1 inspection confirmed canonical migration 0001/0002 are recorded applied. These facts make the current GAIS main Wrangler config unsafe as a deployment source. Do not deploy it or run Wrangler migrations from it.

The preview D1 and preview rate-limit namespace resources must be independently verified to exist and be isolated before any preview deployment. A config declaration alone does not prove those resources exist.

### 4. Test command and dependency readiness mismatch

Canonical PR #54 `package.json` includes `test:hq-auth`, running the canonical auth, API, rate-limit, domain and private-page/service-worker tests. GAIS main `package.json` currently has only dev/build/lint/preview scripts and does not include that canonical test script. It also does not declare the canonical `jose` dependency used by the canonical Firebase verifier.

The GAIS implementation report previously stated 14 GAIS-specific tests passed in its Build environment, but those tests are not evidence that canonical PR #54 tests pass on the current GAIS main tree. No tests were run as part of this source review. Before integration, reconcile dependencies, scripts, test coverage and CI workflow requirements on the isolated integration branch.

### 5. Security header and private-route review

Both Worker versions add security headers and protect the private HQ page with noindex/no-store behavior. Their implementations differ:
- GAIS Worker adds the HQ-specific CSP and cache/robots headers when path matches `/studio-hq` or `/api/hq/*`.
- Canonical Worker applies a dedicated private page header function and endpoint-specific private/no-store response handling.
- Canonical auth adds same-origin enforcement at the API authorization layer; Worker headers alone are not a substitute for it.

Preserve the stricter canonical request authorization and response cache controls when reconciling routing. Check that every new nested HQ route is covered by no-store/noindex response policy, and do not broaden the private page CSP to public routes.

### 6. Cross-cutting integration blockers

1. GAIS router statically imports modules that depend on incompatible helper exports and incompatible schema. Routing those modules does not make them canonical.
2. GAIS `/session/enroll` must not be exposed as a compatibility alias.
3. GAIS main Wrangler config lacks required HQ bindings; current live rate-limit binding configuration was previously found incomplete.
4. Canonical `jose` dependency and canonical `test:hq-auth` script are missing from GAIS main package manifest.
5. Canonical PR #54 Worker route layout and GAIS route layout differ; do not combine the two dispatchers without a route-by-route allowlist.
6. A passing GAIS local build/test report cannot substitute for canonical CI or deployed preview evidence.

### 7. Safe integration decision and readiness gate

- Treat canonical PR #54 Worker, auth helpers, rate limiting, D1 binding configuration and test suite as the security baseline, subject to the specific handler/schema defects already documented in Phase 2G.
- Do not deploy GAIS main or the current integration branch.
- Build a minimal route manifest for the first supported UI slice only; prefer Overview read-only, Clients, Projects, Tasks and Milestones after their canonical handlers are corrected and tested.
- Remove/disable enrollment from the GAIS UI and router; use only the canonical pre-enrolled owner session.
- Reconcile package dependencies and test scripts before code integration.
- Verify preview resources independently, then run tests and preview smoke checks against an isolated preview database.
- Require separate explicit approval before any production deployment or live D1 migration.

### Phase 2K findings

- **Routing:** GAIS unified router and canonical explicit Worker routing are incompatible; a route-by-route canonical dispatcher is required.
- **Authentication:** canonical same-origin, owner enrollment, D1 owner check and mutation guard model must remain authoritative; do not expose GAIS enrollment.
- **Configuration:** GAIS main Wrangler config is missing canonical HQ D1 and rate-limit bindings; unsafe to deploy.
- **Dependencies/tests:** GAIS main package manifest lacks canonical `jose` dependency and canonical test script; GAIS reported test results do not validate canonical implementation.
- **Deployment status:** no deploy or migration occurred. The current integration work remains documentation-only.

## Phase 2L — Prioritized integration defect register and acceptance checklist

**Purpose:** Convert the read-only comparisons in Phases 2F–2K into a controlled implementation backlog. Documentation/planning only; no application code, D1 records, migrations, CI workflows or deployments were changed.

### A. Release-blocking defects

| ID | Priority | Defect | Required resolution | Acceptance evidence |
|---|---|---|---|---|
| HQ-001 | P0 | GAIS handlers use an incompatible auth/helper contract | Rebuild supported endpoints on canonical owner authorization, same-origin checks, owner guard, bounded parsing, rate limits and audit statements | Tests reject unauthenticated, wrong-origin, unenrolled and disabled owners; mutation guard and audit are atomic |
| HQ-002 | P0 | GAIS Wrangler config omits canonical HQ D1 and rate-limit bindings | Reconcile config and independently verify actual preview resources | Config validation and read-only Cloudflare inventory |
| HQ-003 | P0 | GAIS and canonical migrations 0001/0002 define different schemas | Preserve canonical migration history; never apply GAIS 0002/0003; use newly numbered reviewed migrations only | Migration diff and isolated preview D1 schema tests |
| HQ-004 | P0 | GAIS router imports incompatible handlers and exposes enrollment | Build an explicit canonical route allowlist; do not expose session enrollment | Route/method tests and enrollment denial |
| HQ-005 | P0 | Canonical task/milestone handlers conflict with canonical migration table/column names and enums | Correct handlers to project_tasks/project_milestones and canonical lowercase enums | CRUD, archive, project validation and enum tests |
| HQ-006 | P0 | GAIS financial models differ from canonical schema; proposals/expenses are absent canonically | Build typed adapters; design proposals/expenses separately; preserve refund/idempotency semantics | Totals, rounding, refunds, duplicate requests, numbering and ownership tests |
| HQ-007 | P0 | GAIS package manifest lacks canonical jose dependency and test:hq-auth script | Reconcile dependencies and canonical tests on integration branch | Clean install, build, typecheck and canonical test command pass |
| HQ-008 | P0 | Live rate-limit bindings were previously absent while canonical auth expects fail-closed bindings | Verify/provision approved bindings before preview | Read-only inventory and authorized preview limiter tests |

### B. High-priority functional gaps

| ID | Priority | Defect | Required resolution | Acceptance evidence |
|---|---|---|---|---|
| HQ-009 | P1 | Client/project/task/milestone payloads and response envelopes differ | Typed adapters for fields, enums, dates and envelopes | Contract tests for operations and UI states |
| HQ-010 | P1 | Approvals and QA same-name tables have different fields, enums and actor semantics | Adapt UI to canonical approval and QA evidence models; derive actor UID server-side | Enum, evidence URL, decision and immutable actor tests |
| HQ-011 | P1 | Maintenance field/enum differences | Complete canonical handler/table comparison and adapter | Schema/API contract and lifecycle tests |
| HQ-012 | P1 | Onboarding and Support have no canonical tables | Design canonical schema, retention and lifecycle before implementation | Threat review, additive migration and audit/archive tests |
| HQ-013 | P1 | Repository/deployment fields and enums differ | Map canonical deployment verification; keep actual deployment outside dashboard | Metadata action cannot deploy; actor UID and evidence tests |
| HQ-014 | P1 | Analytics SQL uses incompatible financial columns and absent expenses | Implement read-only aggregates after financial model stabilizes; account for refunds | Fixture-based invoice/payment/refund reconciliation |
| HQ-015 | P1 | Settings requires absent studio_settings and overlaps security configuration | Design narrowly scoped preferences; keep auth, allowlist, secrets and bindings server-controlled | Field allowlist and audit tests |
| HQ-016 | P1 | GAIS destructive delete/reversal differs from canonical archive/refund model | Replace with explicit archive/refund workflows | Financial history retained and reversal audited |

### C. Product and quality gaps

| ID | Priority | Defect | Required resolution | Acceptance evidence |
|---|---|---|---|---|
| HQ-017 | P2 | Release History tab reuses deployment/repository data | Decide whether a separate release timeline is required | Real canonical records distinguish release approval from deployment |
| HQ-018 | P2 | UI status labels differ from canonical enums | Centralize typed conversion and reject unknown states | Unit tests for valid and unknown values |
| HQ-019 | P2 | Integrated dashboard responsive/accessibility behavior not verified | Browser QA after preview is functional | Desktop/mobile, keyboard and accessibility evidence |
| HQ-020 | P2 | Private page/API headers differ between Worker versions | Preserve canonical auth and private response policy on every route | Header tests for private page and nested API routes |

### D. Implementation order and gates

**Gate 0 — Repository and environment protection**
- Work only on feat/studio-hq-gais-integration-20261117.
- Keep PR #54, PR #55, PR #26 and PR #27 unchanged.
- Do not push integration work to main.
- No production deployment, live D1 migration, owner enrollment or paid service changes.
- Inspect branch base and changed-file diff before each implementation batch.

**Gate 1 — Repair canonical foundation**
- Resolve HQ-005 task/milestone handler/schema mismatch.
- Reconcile canonical auth/rate-limit dependencies, test scripts and Worker config.
- Define allowlisted routes for session, clients, projects, tasks, milestones and read-only overview.
- Do not expose enrollment.
- Run canonical tests and build; record actual output.

**Gate 2 — Connect the first UI slice**
- Adapt dashboard shell/navigation to canonical session and service contracts.
- Connect read-only Overview, Clients, Projects, Tasks and Milestones.
- Hide unsupported modules or clearly mark unavailable; never render fabricated data.
- Verify owner-only access and private headers in isolated preview.

**Gate 3 — Add business and operations**
- Financial adapters and tests.
- Approvals/QA/Maintenance adapters.
- Add proposals, expenses, onboarding and support only through separately reviewed additive schema/API changes.

**Gate 4 — Governance and analytics**
- Repository/deployment/release adapters.
- Read-only analytics after financial integrity is proven.
- Workspace preferences and audit-log UI using canonical schema.
- Responsive, accessibility, security and regression QA.

### E. Definition of done for each implementation batch

1. Exact changed files and rationale recorded.
2. Canonical schema and route contract reviewed.
3. Typecheck and production build pass.
4. Relevant unit/API/auth/rate-limit tests pass.
5. No secrets in source, logs, bundles or committed artifacts.
6. Unauthorized, wrong-origin and invalid-payload cases fail safely.
7. Owner guard and audit behavior verified for mutations.
8. Preview uses isolated D1 and rate-limit resources.
9. Public Lab tools and customer project separation remain intact.
10. No production action without explicit approval.

### Phase 2L conclusion

- The implementation is **not ready for deployment**.
- First resolve the canonical task/milestone handler/schema mismatch and establish the canonical auth/config/test foundation before connecting the GAIS dashboard.
- Clients/Projects have the clearest path after adapters; Financial, Operations, Analytics and Settings need additional canonical design.
- This register is a plan, not evidence that defects have been fixed.
- No application code, D1 data, migrations, tests, PRs or deployments were changed in this phase.


## Phase 3A — Isolated canonical project API implementation design

**Scope:** Further source inspection of the canonical project/task/milestone implementation and its imports. No application code was changed and no tests were run.

### 1. Verified canonical implementation structure

The canonical PR #54 implementation is not split into standalone task and milestone endpoint modules. It is implemented in `functions/api/hq/projects.js` and exposes:
- `handleHqProjects` — performs IP-level rate limiting, owner authorization, then delegates.
- `handleAuthorizedHqProjects` — performs database availability checks, owner-scoped rate limiting and routes the authorized request.
- `validateProject`, `validateTask`, `validateMilestone` — strict allowlist and value validation.

Project-scoped task and milestone routes are handled as nested paths:
- `/api/hq/projects/:projectId/tasks` — GET/POST
- `/api/hq/projects/:projectId/tasks/:taskId` — PATCH
- `/api/hq/projects/:projectId/milestones` — GET/POST
- `/api/hq/projects/:projectId/milestones/:milestoneId` — PATCH

The canonical implementation uses lowercase database enums, project-scoped validation, owner UID assignment, D1 mutation guard statements, and audit statements in the same D1 batch. It uses soft archival rather than hard deletion.

### 2. Required canonical dependencies

The canonical `projects.js` imports:
- `authorizeHqOwner`, `hqJson`, `readHqJson`, `requireHqDatabase`, `ownerAuthorizationGuardStatement`, `auditStatement`, and `conditionalAuditStatement` from `functions/lib/hqApi.js`.
- `checkHqRateLimit` from `functions/lib/hqRateLimit.js`.

The canonical `hqApi.js` imports Firebase verification from `functions/lib/hqAuth.js`; that verifier imports `jose`. Therefore a safe isolated copy requires the complete compatible helper/auth dependency set and the declared `jose` package dependency. Copying only `projects.js` would leave unresolved or unsafe imports.

The current GAIS main `functions/lib/hqApi.js` is a different implementation with legacy helper names and behavior. Replacing it in place would break GAIS endpoint modules that still import those legacy names. Do not overwrite the shared helper file as a shortcut.

### 3. Route and method behavior

Canonical nested task/milestone operations are project-scoped and do not support hard DELETE:
- Task/milestone list and create are nested under a project.
- Updates use PATCH with both project ID and child ID.
- Unsupported method/path combinations return 404/405 from the canonical dispatcher.
- The existing Worker has top-level compatibility aliases for task/milestone collections that require a projectId query parameter; those aliases still call the canonical project handler.

GAIS task/milestone components and older standalone endpoint files expect different request shapes, status labels and CRUD affordances. A UI adapter is required; do not route GAIS calls directly to the canonical handlers without adapting them.

### 4. Integration design decision

Use a separately named canonical module family on the integration branch so existing GAIS imports remain stable:
- `functions/lib/hqCanonicalAuth.js`
- `functions/lib/hqCanonicalApi.js`
- `functions/lib/hqCanonicalRateLimit.js`
- `functions/api/hq/canonicalProjects.js`

The copied modules must preserve the reviewed canonical implementation and only change relative import paths needed for isolation. Do not rename exports or relax authorization behavior. Add the canonical `jose` dependency and test command through a separately reviewed package manifest update.

Then route only the supported project/task/milestone path patterns to `canonicalProjects.js` in the integration Worker, before the legacy GAIS catch-all router. Preserve canonical session behavior and do not expose GAIS enrollment. Before route activation, add tests proving:
- canonical routes reach the canonical dispatcher;
- unsupported paths/methods do not fall through to GAIS handlers;
- canonical auth, same-origin, rate-limit and D1 owner guards remain in force;
- project/task/milestone CRUD uses the canonical schema and lowercase enums;
- no DELETE route hard-deletes project tasks or milestones.

### 5. Important implementation caveat

The canonical source has project detail aggregation that references adjacent modules/tables, including onboarding items. Before enabling the entire project-detail GET response on the GAIS branch, verify every referenced table exists in canonical D1. The integration should initially limit scope to the project/task/milestone operations required by the UI and avoid querying GAIS-only tables.

### Phase 3A conclusion

- Canonical project/task/milestone code can be isolated without replacing GAIS shared helpers, but the complete helper/auth/rate-limit dependency family must be isolated with it.
- The route integration must be explicit and must precede the legacy GAIS router.
- The first implementation batch is now sufficiently specified; it is still not implemented or tested.
- No application code, D1 data, migrations, tests, PRs or deployments were changed.


## Phase 3B — Isolated canonical API foundation added

**Scope:** Added a separate copy of the canonical auth/API/rate-limit/project implementation and a test-only canonical schema fixture on the integration branch. The existing GAIS helpers, router, Worker route dispatch and Wrangler configuration were not changed.

### 1. Files added

| File | Purpose |
|---|---|
| `functions/lib/hqCanonicalAuth.js` | Isolated Firebase/JWT verifier copied from canonical PR #54 |
| `functions/lib/hqCanonicalApi.js` | Isolated same-origin, owner authorization, bounded JSON, D1 guard and audit helpers |
| `functions/lib/hqCanonicalRateLimit.js` | Isolated fail-closed canonical rate-limit implementation |
| `functions/api/hq/canonicalProjects.js` | Isolated canonical projects/tasks/milestones handler |
| `tests/fixtures/hq-canonical-schema.sql` | Test-only copy of canonical migration 0001; not configured as a Wrangler migration |
| `tests/hq-canonical-projects.test.js` | Canonical project/task/milestone tests adapted to the isolated module and fixture |

The package manifest now declares `jose@6.1.2` and a `test:hq-canonical-projects` command.

### 2. Isolation and safety verification

- All four canonical modules use the isolated `hqCanonical*` helper family; they do not import the GAIS legacy `hqApi.js`, `hqAuth.js` or `hqRateLimit.js`.
- The GAIS legacy helper files were not overwritten.
- Existing `functions/lib/hqRouter.js` and `worker.js` were not changed; the new canonical project handler is not yet reachable from live routes.
- Existing `migrations/hq/0001...` and other migration files were not changed.
- The copied SQL is under `tests/fixtures`; Wrangler does not use this path as its migrations directory.
- No D1 query, migration, data write, owner enrollment, Worker binding change or deployment was performed.
- No existing PR was modified.

### 3. Verification status

**Source-level checks completed:** inspected the new module imports, confirmed canonical helper imports resolve within the isolated family, confirmed the test import points to `functions/api/hq/canonicalProjects.js`, and confirmed the fixture path is separate from Wrangler migrations.

**Not yet verified:** dependency installation, Node runtime compatibility, TypeScript/build, execution of `npm run test:hq-canonical-projects`, route dispatch, preview D1 compatibility, and browser UI behavior. GitHub source writes are not evidence that these tests passed.

### 4. Next safe gate

Before adding Worker routes:
1. Run dependency installation and `npm run test:hq-canonical-projects` in a clean checkout of this branch using Node 22 or compatible Workers tooling.
2. Fix any test/runtime failures on this branch only.
3. Add route dispatch tests and then wire only the project-scoped canonical paths.
4. Keep the canonical module family isolated until the rest of the GAIS handlers are migrated or retired.

### Phase 3B conclusion

The isolated canonical API foundation and its test fixture are committed, but are **not yet routed or deployment-ready**. No test execution is claimed.


## Phase 3C — Studio HQ Canonical Route Dispatch Design & Isolation Tests

**Scope:** Designed and implemented an isolated route-dispatcher layer (`functions/lib/hqCanonicalRouter.js`) for the canonical Studio HQ Projects API family and an automated isolation test suite (`tests/hq-canonical-router.test.js`). No changes were made to `worker.js`, `functions/lib/hqRouter.js`, existing GAIS shared helpers, migrations, or Wrangler configuration.

### 1. Phase 3C Architecture & Route Matching Rules

The canonical router provides a strict, bounded dispatch layer that handles all canonical Projects API requests and prevents fallthrough to the legacy GAIS router.

- **Base Prefix:** `/api/hq/projects` (`CANONICAL_PROJECTS_BASE`).
- **Route Detection (`isCanonicalProjectsRoute`):** Matches exact `/api/hq/projects`, `/api/hq/projects/`, and subpaths starting with `/api/hq/projects/`. Rejects sibling prefixes (e.g. `/api/hq/projects-other`) and unassociated routes (e.g. `/api/hq/session/enroll`).
- **Segment Normalization (`matchCanonicalProjectRoute`):**
  - Query parameters are cleanly separated from path routing via `split('?')[0]`.
  - Trailing slashes are normalized deterministically (`/api/hq/projects/` $\rightarrow$ `/api/hq/projects`).
  - Path segments are extracted strictly following `/api/hq/projects/`.
  - Empty identifiers (e.g. `//tasks`) or identifiers exceeding 80 characters immediately yield 404 (`PROJECT_NOT_FOUND` / `NOT_FOUND`).
- **Controlled Fallthrough Guarantee:** If a route is claimed by `isCanonicalProjectsRoute`, `dispatchHqCanonicalProjectsRequest` handles the request completely and returns a controlled `Response`. It never yields execution to legacy `hqRouter.js`. Unmatched routes return `null`.

### 2. Supported Canonical Routes & Methods

| Canonical Route | Handler Segment Mapping | Allowed Methods | 405 Allow Header |
|---|---|---|---|
| `GET /api/hq/projects` | `segments = []` | `GET`, `POST`, `OPTIONS` | `GET, POST, OPTIONS` |
| `POST /api/hq/projects` | `segments = []` | `GET`, `POST`, `OPTIONS` | `GET, POST, OPTIONS` |
| `GET /api/hq/projects/:projectId` | `segments = [projectId]` | `GET`, `PATCH`, `OPTIONS` | `GET, PATCH, OPTIONS` |
| `PATCH /api/hq/projects/:projectId` | `segments = [projectId]` | `GET`, `PATCH`, `OPTIONS` | `GET, PATCH, OPTIONS` |
| `POST /api/hq/projects/:projectId/archive` | `segments = [projectId, 'archive']` | `POST`, `OPTIONS` | `POST, OPTIONS` |
| `POST /api/hq/projects/:projectId/restore` | `segments = [projectId, 'restore']` | `POST`, `OPTIONS` | `POST, OPTIONS` |
| `GET /api/hq/projects/:projectId/tasks` | `segments = [projectId, 'tasks']` | `GET`, `POST`, `OPTIONS` | `GET, POST, OPTIONS` |
| `POST /api/hq/projects/:projectId/tasks` | `segments = [projectId, 'tasks']` | `GET`, `POST`, `OPTIONS` | `GET, POST, OPTIONS` |
| `PATCH /api/hq/projects/:projectId/tasks/:taskId` | `segments = [projectId, 'tasks', taskId]` | `PATCH`, `OPTIONS` | `PATCH, OPTIONS` |
| `GET /api/hq/projects/:projectId/milestones` | `segments = [projectId, 'milestones']` | `GET`, `POST`, `OPTIONS` | `GET, POST, OPTIONS` |
| `POST /api/hq/projects/:projectId/milestones` | `segments = [projectId, 'milestones']` | `GET`, `POST`, `OPTIONS` | `GET, POST, OPTIONS` |
| `PATCH /api/hq/projects/:projectId/milestones/:milestoneId` | `segments = [projectId, 'milestones', milestoneId]` | `PATCH`, `OPTIONS` | `PATCH, OPTIONS` |

Unknown subpaths under `/api/hq/projects/*` (e.g. `/api/hq/projects/:id/unknown`) return HTTP 404 `NOT_FOUND`. Hard `DELETE` operations are rejected across all canonical project routes with HTTP 405 `METHOD_NOT_ALLOWED`.

### 3. Files Created

| File | Purpose |
|---|---|
| `functions/lib/hqCanonicalRouter.js` | Isolated route matcher and dispatcher for the canonical Studio HQ Projects API |
| `tests/hq-canonical-router.test.js` | Focused automated test suite verifying isolation, dispatch, error propagation, and security policy |

### 4. Isolation & Safety Guarantees

- **No Legacy Handler Overwrite:** `functions/lib/hqRouter.js` and legacy GAIS endpoint modules (`functions/api/hq/projects.js`, etc.) remain completely untouched.
- **Worker Isolation Preserved:** `worker.js` was not modified in this phase. The new dispatcher remains completely decoupled and independently testable.
- **No Insecure Fallback:** Any request matching `/api/hq/projects*` returns a definitive Response from the canonical layer.
- **No Session Enrollment Exposure:** `/api/hq/session/enroll` is not matched by the canonical dispatcher and cannot be routed through it.
- **Dependency Isolation:** `functions/lib/hqCanonicalRouter.js` imports exclusively from `functions/api/hq/canonicalProjects.js`, `functions/lib/hqCanonicalApi.js`, and `functions/lib/hqCanonicalRateLimit.js`.

### 5. Automated Test Coverage & Results

Executed via Node.js native test runner:
```bash
node --test tests/hq-canonical-router.test.js
node --test tests/hq-canonical-projects.test.js
npm run build
```

**Results:**
- `tests/hq-canonical-router.test.js`: **12 passed, 0 failed** (duration: 323 ms)
  1. Valid canonical Projects route matching and dispatch (GET, POST, GET :id, PATCH :id, POST archive, POST restore).
  2. Valid nested Tasks route dispatch (POST task, GET tasks, PATCH task).
  3. Valid nested Milestones route dispatch (POST milestone, GET milestones, PATCH milestone).
  4. Unknown canonical project routes return controlled 404 (unknown action, extra segments, empty ID, overlong ID).
  5. Unsupported HTTP methods return controlled 405 with Allow header (DELETE collection, PUT detail, GET archive, DELETE task, DELETE milestone).
  6. Canonical route cannot fall through to legacy GAIS router (pipeline simulation verifies zero legacy router hits).
  7. `/api/hq/session/enroll` is not exposed by canonical dispatcher (returns null, isCanonicalProjectsRoute = false).
  8. Query strings do not break route matching (status filters, pagination parameters preserved).
  9. Trailing slash handling is deterministic across all 8 route variants.
  10. Authentication and authorization failures propagated correctly (401 AUTH_REQUIRED, 401 malformed token, 403 foreign origin).
  11. Rate-limit failures propagated correctly (429 RATE_LIMIT_EXCEEDED with retry-after, 503 RATE_LIMIT_UNAVAILABLE on limiter failure).
  12. OPTIONS handling complies strictly with security policy (403 foreign origin, 204 same-origin, no wildcard CORS, 404 unknown route, rate-limited).
- `tests/hq-canonical-projects.test.js`: **6 passed, 0 failed** (duration: 266 ms).
- Production Build (`npm run build`): **0 TypeScript errors, 2,177 modules transformed, production dist ready**.

### 6. Security Review Findings

| Risk Category | Evaluation & Mitigation | Residual Severity |
|---|---|---|
| **Route Prefix Collisions** | Prefix match checks exact boundary or `/` delimiter; prevents matching `/api/hq/projects-other`. | Low (Mitigated) |
| **Authentication Bypass** | Every non-OPTIONS request delegates to `handleHqProjects`, enforcing same-origin check, Bearer token extraction, Firebase RS256 signature verification, and D1 active owner enrollment. | Low (Mitigated) |
| **Method Confusion** | Method allowlist checked prior to handler execution. Prohibited methods (e.g. DELETE) return 405 with explicit `allow` header. | Low (Mitigated) |
| **Path Traversal / Malformed IDs** | Parameterized extraction, empty segment check (`//`), and strict length bounds ($\le 80$) prevent path traversal and malformed SQL lookups. | Low (Mitigated) |
| **Legacy Fallback** | All project routes return a terminal HTTP response from canonical dispatcher; zero requests fall through to legacy router. | Low (Mitigated) |
| **Information / Error Leakage** | Controlled error codes (`NOT_FOUND`, `METHOD_NOT_ALLOWED`, `AUTH_REQUIRED`); internal exceptions caught and returned as `HQ_REQUEST_FAILED`. All responses include `no-store, private, max-age=0`. | Low (Mitigated) |
| **CORS & OPTIONS Preflight** | Cross-origin preflights rejected with 403 `ORIGIN_NOT_ALLOWED`. Same-origin preflight returns 204 with `allow` header and private caching headers; no `Access-Control-Allow-Origin: *` wildcard is ever returned. OPTIONS requests are subject to general rate limiting. | Low (Mitigated) |
| **Rate-Limit Bypass** | General IP rate limit checked for all requests (including OPTIONS); write rate limit checked on POST/PATCH. Missing bindings fail closed with 503 in production. | Low (Mitigated) |
| **Accidental Enrollment Exposure** | `/api/hq/session/enroll` is excluded from canonical route recognition and returns `null`. | Low (Mitigated) |

### 7. Outstanding Blockers & Next Actions

1. **Worker Route Wiring:** `worker.js` still routes `/api/hq/*` through legacy `hqRouter.js`. Wiring `dispatchHqCanonicalProjectsRequest` ahead of `dispatchHqApiRequest` is the required next implementation step once authorized.
2. **Wrangler Bindings:** Configuration of `HQ_DB` and rate limiters (`HQ_RATE_LIMITER`, `HQ_WRITE_LIMITER`, `HQ_SESSION_LIMITER`) in `wrangler.jsonc` remains pending for preview deployment.
3. **Frontend UI Adapters:** Dashboard CRM and Projects components currently expect legacy envelopes and title-case enums; client-side adapters are required to consume canonical `ok: true` responses and lowercase enums.
4. **Dependency Advisories:** 8 high-severity vulnerabilities (`picomatch`, `@grpc/grpc-js`) remain documented for controlled remediation.

### Phase 3C Conclusion

The bounded, isolated canonical route dispatcher and its automated test suite are fully implemented, verified, and documented. The dispatcher is **fully isolated, tested, and ready for future route integration in `worker.js`**, but **remains unrouted and undeployed** per safety boundaries.


## Phase 3D — Studio HQ Worker Integration Boundary Preparation

**Scope:** Prepared and verified an isolated, testable Worker integration-boundary gatekeeper (`functions/lib/hqIntegrationBoundary.js`) and regression test suite (`tests/hq-integration-boundary.test.js`). The boundary design resolves `SEC-BLOCKER-001` by explicitly intercepting and rejecting `/api/hq/session/enroll` before any legacy router fallback, routes canonical Projects API requests strictly to `functions/lib/hqCanonicalRouter.js`, and preserves approved legacy endpoints without modifying `worker.js` or `functions/lib/hqRouter.js`.

### 1. Worker Routing Injection Point Analysis

Inspection of `worker.js` identified lines 160–165 as the exact insertion point:
```javascript
// worker.js: Existing legacy dispatch
if (pathname.startsWith('/api/hq/')) {
  const context = { request, env, ctx, params: {}, waitUntil: (p) => ctx?.waitUntil?.(p) };
  const res = await dispatchHqApiRequest(pathname, context);
  return addSecurityHeaders(res, pathname);
}
```

**Target Integration Boundary:** Replace line 163 with `dispatchHqIntegrationBoundary(pathname, context, { addSecurityHeaders })`. In Phase 3D, this gatekeeper logic was implemented and tested in complete isolation.

### 2. Integration Boundary Architecture & Gatekeeper Logic

The boundary module (`functions/lib/hqIntegrationBoundary.js`) enforces a three-stage filter:

1. **Stage 1 — Reserved/Forbidden Route Interception (`SEC-BLOCKER-001` Resolution):**
   - Matches `/api/hq/session/enroll` and `/api/hq/session/enroll/` (including query string variants).
   - Returns an immediate controlled HTTP 404 response (`{ ok: false, error: 'NOT_FOUND', code: 'NOT_FOUND' }`).
   - Guarantees zero execution of `dispatchHqApiRequest` or legacy `session.js:controlledOwnerBootstrap`.
2. **Stage 2 — Canonical Route Isolation:**
   - Evaluates `isCanonicalProjectsRoute(pathname)`.
   - Delegates exclusively to `dispatchHqCanonicalProjectsRequest(pathname, context)`.
   - Returns the canonical response without fallback.
   - Catches unexpected dispatcher errors and returns HTTP 500 `{ ok: false, error: 'HQ_REQUEST_FAILED' }` to prevent exceptions from falling through to legacy handlers.
3. **Stage 3 — Approved Legacy Route Pass-through:**
   - Routes that are neither forbidden nor canonical (e.g. `/api/hq/clients`, `/api/hq/financial`) pass through to `dispatchHqApiRequest(pathname, context)`.
   - Wraps all responses with `applyHqSecurityHeaders` / `addSecurityHeaders`.

### 3. Files Created

| File | Purpose |
|---|---|
| `functions/lib/hqIntegrationBoundary.js` | Isolated Worker integration boundary gatekeeper module |
| `tests/hq-integration-boundary.test.js` | Comprehensive 10-test automated regression suite verifying boundary gating, enrollment denial, canonical routing, error containment, and security header preservation |

### 4. Automated Regression Test Coverage & Results

Executed via Node.js native test runner:
```bash
node --test tests/hq-integration-boundary.test.js tests/hq-canonical-router.test.js tests/hq-canonical-projects.test.js
npm run build
```

**Results:**
- `tests/hq-integration-boundary.test.js`: **10 passed, 0 failed** (duration: 280 ms)
  1. Canonical project request reaches canonical dispatcher and never reaches legacy router.
  2. Session enrollment returns 404 and never reaches legacy router.
  3. Session enrollment trailing-slash variant returns 404 and never reaches legacy router.
  4. Existing approved legacy route reaches legacy router and bypasses canonical dispatcher.
  5. Unknown canonical subroute returns 404 and does not fall through to legacy router.
  6. Canonical dispatcher exception returns controlled 500 without legacy fallback.
  7. Query strings do not change route classification or boundary security.
  8. Security headers are strictly retained on all response paths (`X-Robots-Tag`, `Cache-Control`, `X-Frame-Options`, `nosniff`, `COOP`, `HSTS`).
  9. Compatibility with Worker `addSecurityHeaders` wrapper function.
  10. End-to-end integration: real canonical router and real legacy router.
- `tests/hq-canonical-router.test.js`: **13 passed, 0 failed** (duration: 307 ms).
- `tests/hq-canonical-projects.test.js`: **6 passed, 0 failed** (duration: 271 ms).
- **Combined Test Total: 29 passed, 0 failed** across all Studio HQ suites.
- Production Build (`npm run build`): **0 TypeScript errors, 2,177 modules transformed, production dist ready**.

### 5. Security Review Findings

| Risk Category | Evaluation & Boundary Mitigation | Residual Severity |
|---|---|---|
| **SEC-BLOCKER-001 (Enrollment Fallthrough)** | Stage 1 gate intercepts `/api/hq/session/enroll` and `/api/hq/session/enroll/` prior to legacy router. Fully resolved in boundary architecture. | **Resolved at Boundary Layer** (Pending live Worker wiring) |
| **Canonical Fallthrough on Error** | `try...catch` around `canonicalProjectsDispatcher` intercepts unhandled runtime exceptions and returns controlled 500; prevents legacy fallback. | **Low (Mitigated)** |
| **Path Parameter & Query Pollution** | `split('?')[0]` and trailing slash normalization isolate path matching from query injection. | **Low (Mitigated)** |
| **Security Header Stripping** | All boundary return paths wrap responses with `applyHqSecurityHeaders` / `addSecurityHeaders`. | **Low (Mitigated)** |

### 6. Outstanding Blockers

1. **Worker Route Wiring Execution:** `worker.js` remains unmodified in this phase per strict safety restrictions. The integration boundary must be wired into `worker.js` in an authorized wiring task.
2. **SEC-BLOCKER-002 (Wrangler Bindings):** `wrangler.jsonc` requires `HQ_DB` D1 binding and rate limiters (`HQ_SESSION_LIMITER`, `HQ_WRITE_LIMITER`, `HQ_RATE_LIMITER`).
3. **SEC-BLOCKER-003 (Dependencies):** 8 high-severity vulnerabilities (`picomatch`, `@grpc/grpc-js`) remain documented for scheduled dependency updates.
4. **Frontend UI Adapters:** Dashboard CRM and Projects components currently expect legacy envelopes and title-case enums; client-side adapters are required to consume canonical `ok: true` responses and lowercase enums.

### Phase 3D Conclusion

The Worker integration boundary is **fully implemented, tested, and ready for deployment into `worker.js`**. Live routing remains unchanged and undeployed per safety restrictions.


## Phase 3E — Cloudflare Preview Infrastructure Readiness Audit

**Scope:** Read-only infrastructure readiness and environment isolation audit for Studio HQ canonical integration on branch `feat/studio-hq-gais-integration-20261117`. Verified D1 database configurations, rate-limit namespaces, and Wrangler environment isolation without modifying `worker.js`, `hqRouter.js`, or `wrangler.jsonc`, and without executing any live Cloudflare API mutations, D1 migrations, or deployments.

### 1. Executive Summary & Verification State

| Infrastructure Component | Documented Canonical Contract | Live Cloudflare Verification Status | Isolation Status |
|---|---|---|---|
| **Preview D1 Database** | `jawed-studio-hq-preview`<br>UUID: `623a828d-2909-47e7-a228-130b4eeefef5` | **Unverified against live Cloudflare API** (Local Wrangler CLI token expired / unauthenticated). Verified in canonical branches `feat/hq-s1b-preview-d1-isolation` and `reconcile/studio-hq-canonical-main-20261117`. | **Isolated**: Distinct UUID from Production (`d9ec83ea-7114-4179-af8e-a22ba5494508`). |
| **Preview Rate Limiter: Session** | `HQ_SESSION_LIMITER`<br>Namespace: `620261117`<br>(10 req / 60s) | **Unverified against live Cloudflare API** (CLI unauthenticated). Documented in canonical configuration contracts. | **Isolated**: Distinct namespace from Production (`620261114`). |
| **Preview Rate Limiter: Write** | `HQ_WRITE_LIMITER`<br>Namespace: `620261118`<br>(30 req / 60s) | **Unverified against live Cloudflare API** (CLI unauthenticated). Documented in canonical configuration contracts. | **Isolated**: Distinct namespace from Production (`620261115`). |
| **Preview Rate Limiter: General** | `HQ_RATE_LIMITER`<br>Namespace: `620261119`<br>(120 req / 60s) | **Unverified against live Cloudflare API** (CLI unauthenticated). Documented in canonical configuration contracts. | **Isolated**: Distinct namespace from Production (`620261116`). |
| **Current Branch `wrangler.jsonc`** | Missing `d1_databases`, missing `ratelimits`, missing `env.preview`. | **Confirmed from source**: Current branch configuration contains 0 D1 bindings and 0 rate limit bindings. | **Deployment Blocker (`SEC-BLOCKER-002`)**: Production & preview bindings must be declared prior to deployment. |

> [!IMPORTANT]
> **Strict Verification Note:** Per architectural security protocol, a resource is only reported as live when confirmed via authenticated Cloudflare API calls. Because local Wrangler credentials are currently expired (`Not logged in. Your auth token has expired and could not be refreshed`), the preview D1 and rate-limit namespace IDs are confirmed from **authoritative repository configuration contracts and runbooks**, but are designated **unverified against live Cloudflare infrastructure** until live authentication is established.

---

### 2. D1 Database Isolation Matrix

| Attribute | Production D1 | Documented Preview D1 | Isolation Verification |
|---|---|---|---|
| **Database Name** | `jawed-studio-hq` | `jawed-studio-hq-preview` | Distinct resource naming |
| **Database UUID** | `d9ec83ea-7114-4179-af8e-a22ba5494508` | `623a828d-2909-47e7-a228-130b4eeefef5` | **Zero UUID overlap**: Mutations in preview D1 cannot write to or corrupt production data |
| **Binding Name** | `HQ_DB` | `HQ_DB` | Uniform API handler contract across tiers |
| **Migrations Directory** | `migrations/hq` | `migrations/hq` | Shared canonical schema (`0001_studio_hq_schema.sql`, `0002_studio_hq_compatibility.sql`) |
| **Status in Live Worker** | Attached in live Cloudflare Worker | Not attached in current branch `wrangler.jsonc` | Pending approved preview configuration |

---

### 3. Rate-Limiting Namespace Isolation Matrix

| Binding Name | Production Namespace | Preview Namespace | Threshold & Interval | Isolation Verification |
|---|---|---|---|---|
| `HQ_SESSION_LIMITER` | `620261114` | `620261117` | 10 requests / 60s | Independent namespace ID: High-frequency preview session testing will not consume production session quotas |
| `HQ_WRITE_LIMITER` | `620261115` | `620261118` | 30 requests / 60s | Independent namespace ID: Automated integration test suites will not throttle production mutation capacity |
| `HQ_RATE_LIMITER` | `620261116` | `620261119` | 120 requests / 60s | Independent namespace ID: Load testing preview endpoints cannot degrade production public availability |

---

### 4. Configuration Discrepancy Analysis (Current vs. Canonical)

Inspection of `feat/studio-hq-gais-integration-20261117:wrangler.jsonc` revealed the following critical gaps against canonical PR #54 / `reconcile/studio-hq-canonical-main-20261117`:

```
Current branch wrangler.jsonc:
- [MISSING] account_id
- [MISSING] d1_databases binding for HQ_DB (neither production nor preview)
- [MISSING] ratelimits bindings for HQ_SESSION_LIMITER, HQ_WRITE_LIMITER, HQ_RATE_LIMITER
- [MISSING] env.preview configuration section
- [INCOMPLETE] vars: only ENVIRONMENT ("lab") and CANONICAL_ORIGIN ("https://lab.jawed.co.in") declared
```

Deploying the current branch directly to Cloudflare would result in runtime failures on all canonical endpoints due to missing `env.HQ_DB` and missing rate-limiting namespaces.

---

### 5. Proposed Preview-Only Wrangler Configuration

To ensure strict environment isolation and allow preview testing without touching production configurations, two configuration patterns are recommended:

#### Option A: Unified `wrangler.jsonc` with Dedicated `env.preview` (Recommended)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "jawed-website-ai-studio-lab",
  "main": "worker.js",
  "compatibility_date": "2026-03-01",
  "compatibility_flags": [
    "nodejs_compat"
  ],
  "account_id": "9a8264379ca2d59648935cbbdcf22b82",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS"
  },
  "ai": {
    "binding": "AI"
  },
  "d1_databases": [
    {
      "binding": "HQ_DB",
      "database_name": "jawed-studio-hq",
      "database_id": "d9ec83ea-7114-4179-af8e-a22ba5494508",
      "migrations_dir": "migrations/hq"
    }
  ],
  "ratelimits": [
    {
      "binding": "HQ_SESSION_LIMITER",
      "namespace_id": "620261114",
      "simple": { "limit": 10, "period": 60 }
    },
    {
      "binding": "HQ_WRITE_LIMITER",
      "namespace_id": "620261115",
      "simple": { "limit": 30, "period": 60 }
    },
    {
      "binding": "HQ_RATE_LIMITER",
      "namespace_id": "620261116",
      "simple": { "limit": 120, "period": 60 }
    }
  ],
  "vars": {
    "ENVIRONMENT": "lab",
    "CANONICAL_ORIGIN": "https://lab.jawed.co.in"
  },
  "env": {
    "preview": {
      "name": "jawed-website-ai-studio-lab-preview",
      "d1_databases": [
        {
          "binding": "HQ_DB",
          "database_name": "jawed-studio-hq-preview",
          "database_id": "623a828d-2909-47e7-a228-130b4eeefef5",
          "migrations_dir": "migrations/hq"
        }
      ],
      "ratelimits": [
        {
          "binding": "HQ_SESSION_LIMITER",
          "namespace_id": "620261117",
          "simple": { "limit": 10, "period": 60 }
        },
        {
          "binding": "HQ_WRITE_LIMITER",
          "namespace_id": "620261118",
          "simple": { "limit": 30, "period": 60 }
        },
        {
          "binding": "HQ_RATE_LIMITER",
          "namespace_id": "620261119",
          "simple": { "limit": 120, "period": 60 }
        }
      ],
      "vars": {
        "ENVIRONMENT": "preview",
        "CANONICAL_ORIGIN": "https://preview.lab.jawed.co.in",
        "ENABLE_HQ_SESSION_BOOTSTRAP": "false"
      }
    }
  }
}
```

#### Option B: Standalone Preview Config File (`wrangler.hq-preview.jsonc`)

For completely isolated execution without modifying the root `wrangler.jsonc`:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "jawed-studio-hq-preview",
  "main": "worker.js",
  "compatibility_date": "2026-03-01",
  "compatibility_flags": [
    "nodejs_compat"
  ],
  "account_id": "9a8264379ca2d59648935cbbdcf22b82",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS"
  },
  "ai": {
    "binding": "AI"
  },
  "d1_databases": [
    {
      "binding": "HQ_DB",
      "database_name": "jawed-studio-hq-preview",
      "database_id": "623a828d-2909-47e7-a228-130b4eeefef5",
      "migrations_dir": "migrations/hq"
    }
  ],
  "ratelimits": [
    {
      "binding": "HQ_SESSION_LIMITER",
      "namespace_id": "620261117",
      "simple": { "limit": 10, "period": 60 }
    },
    {
      "binding": "HQ_WRITE_LIMITER",
      "namespace_id": "620261118",
      "simple": { "limit": 30, "period": 60 }
    },
    {
      "binding": "HQ_RATE_LIMITER",
      "namespace_id": "620261119",
      "simple": { "limit": 120, "period": 60 }
    }
  ],
  "vars": {
    "ENVIRONMENT": "preview",
    "CANONICAL_ORIGIN": "https://preview.lab.jawed.co.in",
    "ENABLE_HQ_SESSION_BOOTSTRAP": "false"
  }
}
```

---

### 6. Actions & Approvals Required Prior to Preview Deployment

The following operational actions require explicit user approval and credentials before live preview provisioning:

1. **Wrangler Authentication:**
   - Execute `npx wrangler login` or supply a valid `CLOUDFLARE_API_TOKEN` with permissions:
     - Account: Cloudflare D1 (Edit), Workers Scripts (Edit), Workers KV / Rate Limiting (Edit).
2. **Live Cloudflare Resource Verification:**
   - Run `npx wrangler d1 list` to confirm database `jawed-studio-hq-preview` exists and matches UUID `623a828d-2909-47e7-a228-130b4eeefef5`. If non-existent, create via `npx wrangler d1 create jawed-studio-hq-preview`.
   - Verify rate-limiting namespaces `620261117`, `620261118`, `620261119` exist on the Cloudflare dashboard or API.
3. **Preview D1 Schema Migration:**
   - Execute canonical migrations against preview D1:
     ```bash
     npx wrangler d1 migrations apply jawed-studio-hq-preview --remote
     ```
   - Verify application of `0001_studio_hq_schema.sql` and `0002_studio_hq_compatibility.sql`.
4. **Wrangler Configuration Authorization:**
   - Approve adding the `d1_databases`, `ratelimits`, and `env.preview` blocks to `wrangler.jsonc` (or creating standalone `wrangler.hq-preview.jsonc`).
5. **Worker Routing Wire-Up Authorization:**
   - Authorize modifying `worker.js` line 163 to invoke `dispatchHqIntegrationBoundary` (from Phase 3D).

---

### Phase 3E Conclusion

The Cloudflare preview infrastructure audit confirms that **authoritative preview contracts provide 100% environment isolation from production resources** across D1 databases, rate-limiting namespaces, and origin domains. However, **current branch `wrangler.jsonc` lacks all canonical bindings (`SEC-BLOCKER-002`)**, and live Cloudflare resources remain unverified due to expired CLI session authentication. No resources, files, or migrations were modified during this read-only audit.


