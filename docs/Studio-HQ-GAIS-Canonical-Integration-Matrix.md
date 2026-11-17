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
