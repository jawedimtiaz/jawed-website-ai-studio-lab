# Phase 8.0.4 WP-2 — Decisions Locked Before Implementation

## Decisions
1. List defaults to active inbound leads excluding converted/lost; explicit stage filter can request terminal stages. Archived excluded unless an explicit archived filter is used.
2. Maintain legacy response envelope `success, leads, total, page, limit` during frontend cutover; canonical fields are included on each row.
3. Lead create always sets `lead_origin='inbound-lead'`, `pipeline_stage='new'`, `status='lead'`; no client status override.
4. Stage/status synchronization:
   - new/contacted/qualified/proposal-sent => legacy status `lead` or `prospect` mapping: new/contacted = lead, qualified/proposal-sent = prospect.
   - converted => `active`.
   - lost => `closed`.
5. Only dedicated convert action can set converted; PATCH stage cannot convert.
6. Conversion is same-row UUID-preserving, requires non-archived inbound lead and non-terminal stage. Repeated conversion is controlled conflict; optional project creation only once.
7. Lost stage requires reason; reopening clears lost_at and lost_reason.
8. Estimated value accepts either integer minor units in canonical API or legacy major-unit input converted with currency precision. Canonical API rejects floating-point minor values, unsafe integer and negatives.
9. Duplicate advisories based on normalized email/phone/business name; advisory only and no automatic merge.
10. Archive and restore are dedicated actions, separate from pipeline stage.
11. Existing contacts are preserved. Create lead may create a primary contact only if contact name is supplied; conversion does not duplicate contacts.
12. Audit and owner guard must be included in the same D1 batch as every mutation. Conversion with optional project must batch lead update, project insert, owner guard and audit.

## Implementation gate
Build handler and route dispatcher first; then integration boundary; then frontend adapter; then tests. Keep all changes on feature branch and do not apply remote migrations/deploy.
