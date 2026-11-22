-- Jawed Web Studio HQ — Migration 0003: Leads Pipeline, Contact Invariant & Segregation
-- Apply only to dedicated database jawed-studio-hq (HQ_DB).
-- Fully additive, non-destructive, and backward-compatible.
-- Preserves existing CRM clients, projects, invoices, quotations, contacts and notes.

-- 1. Additive columns to clients table
ALTER TABLE clients ADD COLUMN lead_origin TEXT NOT NULL DEFAULT 'legacy-existing'
  CHECK (lead_origin IN ('inbound-lead', 'direct-customer', 'legacy-existing'));

ALTER TABLE clients ADD COLUMN pipeline_stage TEXT NOT NULL DEFAULT 'new'
  CHECK (pipeline_stage IN ('new', 'contacted', 'qualified', 'proposal-sent', 'converted', 'lost'));

ALTER TABLE clients ADD COLUMN estimated_value_minor INTEGER NOT NULL DEFAULT 0
  CHECK (estimated_value_minor >= 0);

ALTER TABLE clients ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'
  CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'AED', 'SAR', 'JPY', 'KRW', 'KWD', 'BHD', 'OMR'));

ALTER TABLE clients ADD COLUMN category TEXT;

ALTER TABLE clients ADD COLUMN next_follow_up_at TEXT;

ALTER TABLE clients ADD COLUMN converted_at TEXT;

ALTER TABLE clients ADD COLUMN conversion_token TEXT;

ALTER TABLE clients ADD COLUMN lost_at TEXT;

ALTER TABLE clients ADD COLUMN lost_reason TEXT;

-- 2. Precedence Backfill Rule 1: Commercial accounts
-- Any active (non-archived) client with linked projects, linked invoices, or an active/paused/completed status
-- is classified as a converted customer account.
-- NOTE on archived records: Archived records retain their archived state and baseline default pipeline_stage ('new').
-- They are explicitly excluded from automatic commercial conversion and lost classification,
-- preserving their state until an explicit product/owner decision upon restoration.
-- NOTE on converted_at: Historical records lack discrete conversion-event audit logs prior to Phase 8.
-- Therefore, converted_at is reconstructed using created_at as an approximation of the account's historical inception,
-- NOT as an exact historical conversion-event timestamp. This avoids inventing arbitrary event dates.
UPDATE clients SET
  pipeline_stage = 'converted',
  converted_at = created_at
WHERE lead_origin = 'legacy-existing'
  AND archived_at IS NULL
  AND (
    status IN ('active', 'paused', 'completed')
    OR (SELECT COUNT(*) FROM projects WHERE projects.client_id = clients.id) > 0
    OR (SELECT COUNT(*) FROM invoices WHERE invoices.client_id = clients.id) > 0
  );

-- 3. Precedence Backfill Rule 2: Pure lost prospects
-- Only active (non-archived) clients with status 'closed' AND zero linked projects AND zero linked invoices
-- are classified as lost prospects.
-- NOTE on lost_at: lost_at is set to updated_at to reflect when the record reached its final closed state,
-- with lost_reason documenting its historical backfill classification origin.
UPDATE clients SET
  pipeline_stage = 'lost',
  lost_at = updated_at,
  lost_reason = 'Historical closed prospect'
WHERE lead_origin = 'legacy-existing'
  AND archived_at IS NULL
  AND status = 'closed'
  AND (SELECT COUNT(*) FROM projects WHERE projects.client_id = clients.id) = 0
  AND (SELECT COUNT(*) FROM invoices WHERE invoices.client_id = clients.id) = 0;

-- 4. Contact Normalization Step 1: Demote duplicate active primary contacts
-- For clients with multiple active primary contacts, retain a single deterministic primary contact.
-- Ordering precedence:
--   1. COALESCE(updated_at, created_at, '') DESC (most recent update or creation)
--   2. COALESCE(created_at, '') DESC (most recent creation if updated_at is NULL or tied)
--   3. id DESC (unique final tie-breaker ensuring strict determinism)
-- NULL timestamps sort last deterministically. Demoted records set is_primary = 0.
UPDATE client_contacts
SET is_primary = 0
WHERE is_primary = 1
  AND archived_at IS NULL
  AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY client_id ORDER BY
          COALESCE(updated_at, created_at, '') DESC,
          COALESCE(created_at, '') DESC,
          id DESC
      ) as rn
      FROM client_contacts
      WHERE is_primary = 1 AND archived_at IS NULL
    ) WHERE rn = 1
  );

-- 5. Contact Normalization Step 2: Active clients with zero primary contacts
-- For clients that have active contacts but zero active primary contacts, promote exactly one active contact.
-- Explicitly selects ONLY active non-primary contacts (is_primary = 0 AND archived_at IS NULL).
-- Archived contacts (archived_at IS NOT NULL) are NEVER promoted.
-- Ordering precedence:
--   1. CASE WHEN created_at IS NULL THEN 1 ELSE 0 END ASC (known created_at ranks before NULL)
--   2. created_at ASC (earliest created active contact among known timestamps)
--   3. CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END ASC (known updated_at ranks before NULL on tie)
--   4. updated_at ASC (earliest updated active contact on tie)
--   5. id ASC (unique final tie-breaker ensuring strict determinism)
-- Clients with only archived contacts (zero active contacts) are intentionally NOT assigned a primary.
UPDATE client_contacts
SET is_primary = 1
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY client_id ORDER BY
        CASE WHEN created_at IS NULL THEN 1 ELSE 0 END ASC,
        created_at ASC,
        CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END ASC,
        updated_at ASC,
        id ASC
    ) as rn
    FROM client_contacts
    WHERE is_primary = 0
      AND archived_at IS NULL
      AND client_id NOT IN (
        SELECT client_id FROM client_contacts WHERE is_primary = 1 AND archived_at IS NULL
      )
  ) WHERE rn = 1
);

-- 6. Performance & Integrity Indexes
CREATE INDEX IF NOT EXISTS idx_clients_lead_pipeline
  ON clients(lead_origin, pipeline_stage, archived_at, updated_at);

CREATE INDEX IF NOT EXISTS idx_clients_customer_isolation
  ON clients(lead_origin, status, archived_at);

CREATE INDEX IF NOT EXISTS idx_clients_follow_up
  ON clients(next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND archived_at IS NULL;

-- Important: idx_client_contacts_one_primary guarantees AT MOST ONE active primary contact per client.
-- It does not guarantee at least one primary contact (e.g. clients with zero contacts or only archived contacts).
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contacts_one_primary
  ON client_contacts(client_id)
  WHERE is_primary = 1 AND archived_at IS NULL;
