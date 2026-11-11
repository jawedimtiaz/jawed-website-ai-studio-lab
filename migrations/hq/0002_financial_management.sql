-- Studio HQ Financial Management Foundation (Phase 2.7B)
-- Additive migration. Never edit 0001_studio_hq_schema.sql.
-- INR amounts use paise (integer minor units); tax rates use basis points.

CREATE TABLE IF NOT EXISTS quotation_items (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE RESTRICT,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli BETWEEN 1 AND 1000000000),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor BETWEEN 0 AND 9000000000000),
  discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bps BETWEEN 0 AND 10000),
  tax_minor INTEGER NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli BETWEEN 1 AND 1000000000),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor BETWEEN 0 AND 9000000000000),
  discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bps BETWEEN 0 AND 10000),
  tax_minor INTEGER NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS financial_sequences (
  id TEXT PRIMARY KEY,
  document_type TEXT NOT NULL CHECK (document_type IN ('quotation','invoice')),
  prefix TEXT NOT NULL CHECK (length(prefix) BETWEEN 1 AND 12),
  financial_year TEXT NOT NULL CHECK (financial_year GLOB '20[0-9][0-9]-[0-9][0-9]'),
  next_number INTEGER NOT NULL CHECK (next_number > 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_type, financial_year)
);

CREATE TABLE IF NOT EXISTS payment_idempotency_keys (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS payment_refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 2 AND 1000),
  refunded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES hq_users(uid) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS refund_idempotency_keys (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  refund_id TEXT NOT NULL UNIQUE REFERENCES payment_refunds(id) ON DELETE RESTRICT,
  request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_per_quotation
  ON invoices(quotation_id) WHERE quotation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotation_items_parent
  ON quotation_items(quotation_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_parent
  ON invoice_items(invoice_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_financial_sequences_lookup
  ON financial_sequences(document_type, financial_year);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment
  ON payment_refunds(payment_id, refunded_at, id);
CREATE INDEX IF NOT EXISTS idx_payment_idempotency_invoice
  ON payment_idempotency_keys(invoice_id, created_at);
CREATE INDEX IF NOT EXISTS idx_refund_idempotency_payment
  ON refund_idempotency_keys(payment_id, created_at);
