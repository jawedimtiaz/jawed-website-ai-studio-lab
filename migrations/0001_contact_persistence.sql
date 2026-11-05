-- Phase 1: durable contact submissions and privacy-minimized attempt logs.
-- Apply with: npx wrangler d1 migrations apply <DATABASE_NAME> --remote

CREATE TABLE IF NOT EXISTS contact_submissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  reason TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  notification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sent', 'failed')),
  notification_provider TEXT,
  notification_attempted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at
  ON contact_submissions (created_at);

CREATE TABLE IF NOT EXISTS contact_attempt_logs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('success', 'fail')),
  reason TEXT NOT NULL,
  submission_method TEXT NOT NULL CHECK (submission_method IN ('api', 'email-client')),
  message_length INTEGER,
  page_path TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contact_attempt_logs_created_at
  ON contact_attempt_logs (created_at);
