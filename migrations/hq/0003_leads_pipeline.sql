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
  CHECK (length(currency) = 3);

ALTER TABLE clients ADD COLUMN category TEXT;

ALTER TABLE clients ADD COLUMN next_follow_up_at TEXT;

ALTER TABLE clients ADD COLUMN converted_at TEXT;

ALTER TABLE clients ADD COLUMN conversion_token TEXT;

ALTER TABLE clients ADD COLUMN lost_at TEXT;

ALTER TABLE clients ADD COLUMN lost_reason TEXT;

-- 2. Precedence Backfill Rule 1: Commercial accounts
-- Any client with linked projects, linked invoices, or an active/paused/completed status
-- is classified as a converted customer account.
UPDATE clients SET
  pipeline_stage = 'converted',
  converted_at = created_at
WHERE lead_origin = 'legacy-existing'
  AND (
    status IN ('active', 'paused', 'completed')
    OR (SELECT COUNT(*) FROM projects WHERE projects.client_id = clients.id) > 0
    OR (SELECT COUNT(*) FROM invoices WHERE invoices.client_id = clients.id) > 0
  );

-- 3. Precedence Backfill Rule 2: Pure lost prospects
-- Only clients with status 'closed' AND zero linked projects AND zero linked invoices
-- are classified as lost prospects.
UPDATE clients SET
  pipeline_stage = 'lost',
  lost_at = updated_at,
  lost_reason = 'Historical closed prospect'
WHERE lead_origin = 'legacy-existing'
  AND status = 'closed'
  AND (SELECT COUNT(*) FROM projects WHERE projects.client_id = clients.id) = 0
  AND (SELECT COUNT(*) FROM invoices WHERE invoices.client_id = clients.id) = 0;

-- 4. Contact Normalization Step 1: Demote duplicate active primary contacts
-- For clients with multiple active primary contacts, retain the single most recently updated/created.
UPDATE client_contacts
SET is_primary = 0
WHERE is_primary = 1
  AND archived_at IS NULL
  AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY client_id ORDER BY updated_at DESC, created_at DESC
      ) as rn
      FROM client_contacts
      WHERE is_primary = 1 AND archived_at IS NULL
    ) WHERE rn = 1
  );

-- 5. Contact Normalization Step 2: Ensure clients with active contacts have exactly one primary contact
-- For clients with active contacts but zero primary contacts, promote the earliest created contact.
UPDATE client_contacts
SET is_primary = 1
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY client_id ORDER BY created_at ASC
    ) as rn
    FROM client_contacts
    WHERE archived_at IS NULL
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contacts_one_primary
  ON client_contacts(client_id)
  WHERE is_primary = 1 AND archived_at IS NULL;
