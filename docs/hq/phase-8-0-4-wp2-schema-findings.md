# Phase 8.0.4 WP-2 — Schema & Legacy Behavior Findings

Review baseline: main at merge commit `87517bac015baa673de265959681c1e995ff291b`.

## Confirmed schema facts
- `clients` primary key is text UUID; `created_by` required owner FK; `updated_by` optional owner FK.
- Clients have `status` constrained to `lead, prospect, active, paused, completed, closed`.
- Clients have soft archive fields `archived_at`, `archived_by` with paired nullability check.
- Migration 0003 adds `lead_origin` constrained to `inbound-lead, direct-customer, legacy-existing`.
- `pipeline_stage` constrained to `new, contacted, qualified, proposal-sent, converted, lost`.
- `estimated_value_minor` integer >= 0, currency whitelist (14 codes), category, next_follow_up_at, converted_at, conversion_token, lost_at, lost_reason.
- Client contacts table has a primary-contact partial unique index: one active primary at most. It does not require a primary contact.
- Projects are linked to clients by client_id; project insert requires project_code, client_id, name, project_type, status, priority, created_by.
- No separate leads table; canonical lead API must use clients rows.

## Legacy API behavior requiring compatibility
- Legacy GET defaults to status in lead/prospect, omitting converted and lost unless requested; its search fields are business_name, name, email, source.
- Legacy response mapping maps status to UI labels; currently category, estimated value, currency and follow-up are hardcoded/omitted.
- Legacy POST creates a clients row and optional primary contact, but does not set Migration 0003 fields explicitly (therefore defaults legacy-existing/new).
- Legacy PUT/PATCH updates status and basic client fields, but does not update pipeline fields.
- Legacy conversion POST action updates status active, optional project insertion, then audit log is written separately; this is not a single atomic batch.
- Legacy DELETE archives lead and writes audit separately.
- Existing conversion accepts a status active client as already converted; stage and conversion token are not used.

## Canonical implementation requirements
- New inbound leads must explicitly set lead_origin='inbound-lead', pipeline_stage='new', status='lead'.
- Direct customers should not enter the Leads API; if conversion is requested, preserve same client UUID and set lead_origin to inbound-lead and stage converted, status active.
- Lost stage sets lost_at and lost_reason; reopening a lost lead clears lost_at/lost_reason. Conversion clears lost fields and sets converted_at.
- Stage transitions should be constrained; terminal converted stage requires explicit convert action. Lost leads can be reopened to nonterminal stages.
- Conversion uses existing lead row; repeated conversion should return idempotent success or a controlled 409 without duplicating project.
- If optional project creation is requested, project insert and lead conversion must be part of a single D1 batch with owner guard and audit statement.
- Project code generation collision must be handled safely; consider deterministic UUID-based code suffix instead of timestamp-only code.
- Lead archive is soft archive and independent of pipeline stage; archived records cannot convert.
- Duplicate matching returns advisory only, not merge/block.
- Canonical handler should include owner auth, origin guard, database guard, rate limits, strict validation, audit, no-store headers and no legacy fallthrough.

## Unresolved decisions for WP-2
1. Whether list default should show all active inbound leads excluding converted/lost or include terminal stages; propose all inbound leads with stage filters and default active pipeline only.
2. UI's current GET response `success/leads/total/page/limit` should be maintained by adapter during initial cutover.
3. Conversion project defaults: preserve existing frontend behavior but ensure project type/status/currency/amount are explicitly and safely set.
4. Contact sync: do not silently overwrite or create duplicate primary contacts; conversion should preserve contacts already attached to lead.

## Verification limits
This is a repository source audit only. No test execution, live API requests, D1 access, or deployment was performed.
