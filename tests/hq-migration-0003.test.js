// tests/hq-migration-0003.test.js
// Automated verification suite for D1 Migration 0003: Leads Pipeline, Contact Invariant & Segregation
// Tests against an isolated, in-memory SQLite database without touching production or remote data.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

function loadMigration(filename) {
  const fullPath = path.resolve('migrations/hq', filename);
  return fs.readFileSync(fullPath, 'utf8');
}

function initCleanDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(loadMigration('0001_studio_hq_schema.sql'));
  db.exec(loadMigration('0002_financial_management.sql'));
  return db;
}

describe('Phase 8.0.4 Migration 0003 Verification Suite', () => {
  test('1. Fresh schema execution applies cleanly on empty database', () => {
    const db = initCleanDatabase();
    const m3 = loadMigration('0003_leads_pipeline.sql');
    assert.doesNotThrow(() => db.exec(m3), 'Migration 0003 must apply without errors on an empty database');

    const columns = db.prepare('PRAGMA table_info(clients)').all();
    const colNames = new Set(columns.map((c) => c.name));

    const expectedColumns = [
      'lead_origin',
      'pipeline_stage',
      'estimated_value_minor',
      'currency',
      'category',
      'next_follow_up_at',
      'converted_at',
      'conversion_token',
      'lost_at',
      'lost_reason'
    ];

    for (const exp of expectedColumns) {
      assert.ok(colNames.has(exp), `Column ${exp} must be present in clients table`);
    }
  });

  test('2. Complete backfill classification precedence on legacy records', () => {
    const db = initCleanDatabase();

    // Seed Owner
    db.exec(`INSERT INTO hq_users (uid, email, display_name) VALUES ('u1', 'owner@example.com', 'Owner');`);

    // Seed Test Cases:
    // Case 1: Active client with status lead and 1 project (Jawed Web Studio QA)
    db.exec(`INSERT INTO clients (id, client_code, name, business_name, status, created_by) VALUES ('c1', 'CLI-1', 'QA Client', 'Jawed Web Studio QA', 'lead', 'u1');`);
    db.exec(`INSERT INTO projects (id, project_code, client_id, name, created_by) VALUES ('p1', 'PRJ-1', 'c1', 'QA Test Website', 'u1');`);

    // Case 2: Archived prospect with 0 projects (QA Test Automation Ltd)
    db.exec(`INSERT INTO clients (id, client_code, name, business_name, status, created_by, archived_at, archived_by) VALUES ('c2', 'CLI-2', 'Automation QA', 'QA Test Automation Ltd', 'prospect', 'u1', '2026-11-22T06:00:00.000Z', 'u1');`);

    // Case 3: Closed former customer WITH a past project
    db.exec(`INSERT INTO clients (id, client_code, name, business_name, status, created_by) VALUES ('c3', 'CLI-3', 'Past Client', 'Acme Corp', 'closed', 'u1');`);
    db.exec(`INSERT INTO projects (id, project_code, client_id, name, created_by) VALUES ('p3', 'PRJ-3', 'c3', 'Acme Website', 'u1');`);

    // Case 4: Closed former customer WITH an invoice (0 projects)
    db.exec(`INSERT INTO clients (id, client_code, name, business_name, status, created_by) VALUES ('c4', 'CLI-4', 'Invoiced Client', 'Beta Corp', 'closed', 'u1');`);
    db.exec(`INSERT INTO invoices (id, invoice_number, client_id, status, created_by) VALUES ('inv-1', 'INV-2026-0001', 'c4', 'paid', 'u1');`);

    // Case 5: Closed lost prospect WITHOUT projects or invoices
    db.exec(`INSERT INTO clients (id, client_code, name, business_name, status, created_by) VALUES ('c5', 'CLI-5', 'Lost Prospect', 'Never Converted LLC', 'closed', 'u1');`);

    // Case 6: Ambiguous prospect (lead status, 0 projects, 0 invoices)
    db.exec(`INSERT INTO clients (id, client_code, name, business_name, status, created_by) VALUES ('c6', 'CLI-6', 'Ambiguous Enquiry', 'Pending Store', 'lead', 'u1');`);

    // Case 7: Active status without project (Retainer client)
    db.exec(`INSERT INTO clients (id, client_code, name, business_name, status, created_by) VALUES ('c7', 'CLI-7', 'Consulting Client', 'Retainer Advisory', 'active', 'u1');`);

    // Apply Migration 0003
    db.exec(loadMigration('0003_leads_pipeline.sql'));

    const clients = db.prepare('SELECT id, status, lead_origin, pipeline_stage, lost_reason, archived_at FROM clients ORDER BY id').all();

    const getClient = (id) => clients.find((c) => c.id === id);

    // Rule 1 verifications: Commercial accounts must be converted
    const c1 = getClient('c1');
    assert.equal(c1.lead_origin, 'legacy-existing');
    assert.equal(c1.pipeline_stage, 'converted', 'c1 (Jawed Web Studio QA) must be classified as converted because it has a project');

    const c3 = getClient('c3');
    assert.equal(c3.lead_origin, 'legacy-existing');
    assert.equal(c3.pipeline_stage, 'converted', 'c3 (Closed former customer with project) must be converted, NOT lost');

    const c4 = getClient('c4');
    assert.equal(c4.lead_origin, 'legacy-existing');
    assert.equal(c4.pipeline_stage, 'converted', 'c4 (Closed customer with invoice) must be converted, NOT lost');

    const c7 = getClient('c7');
    assert.equal(c7.lead_origin, 'legacy-existing');
    assert.equal(c7.pipeline_stage, 'converted', 'c7 (Active status client) must be converted');

    // Rule 2 verifications: Pure lost prospects
    const c5 = getClient('c5');
    assert.equal(c5.lead_origin, 'legacy-existing');
    assert.equal(c5.pipeline_stage, 'lost', 'c5 (Closed without projects/invoices) must be lost');
    assert.equal(c5.lost_reason, 'Historical closed prospect');

    // Ambiguous and archived verifications
    const c2 = getClient('c2');
    assert.equal(c2.lead_origin, 'legacy-existing');
    assert.equal(c2.pipeline_stage, 'new', 'c2 (Archived prospect) must retain new stage');
    assert.ok(c2.archived_at, 'c2 archive timestamp must be preserved');

    const c6 = getClient('c6');
    assert.equal(c6.lead_origin, 'legacy-existing');
    assert.equal(c6.pipeline_stage, 'new', 'c6 (Ambiguous prospect) must retain new stage for manual review');
  });

  test('3. Primary contact normalization and partial unique index enforcement', () => {
    const db = initCleanDatabase();
    db.exec(`INSERT INTO hq_users (uid, email, display_name) VALUES ('u1', 'owner@example.com', 'Owner');`);

    // Client with duplicate primary contacts
    db.exec(`INSERT INTO clients (id, client_code, name, status, created_by) VALUES ('c_dup', 'CLI-D', 'Dup Client', 'active', 'u1');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at, updated_at) VALUES ('con-d1', 'c_dup', 'Older Primary', 1, '2026-11-01', '2026-11-01');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at, updated_at) VALUES ('con-d2', 'c_dup', 'Newer Primary', 1, '2026-11-02', '2026-11-02');`);

    // Client with zero primary contacts
    db.exec(`INSERT INTO clients (id, client_code, name, status, created_by) VALUES ('c_zero', 'CLI-Z', 'Zero Primary', 'active', 'u1');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at) VALUES ('con-z1', 'c_zero', 'First Secondary', 0, '2026-11-01');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at) VALUES ('con-z2', 'c_zero', 'Second Secondary', 0, '2026-11-02');`);

    // Client with an archived primary contact and an active secondary contact
    db.exec(`INSERT INTO clients (id, client_code, name, status, created_by) VALUES ('c_arch', 'CLI-A', 'Arch Client', 'active', 'u1');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, archived_at) VALUES ('con-a1', 'c_arch', 'Archived Primary', 1, '2026-11-01');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary) VALUES ('con-a2', 'c_arch', 'Active Secondary', 0);`);

    // Apply Migration 0003
    db.exec(loadMigration('0003_leads_pipeline.sql'));

    // Verify duplicate demoted: con-d2 is primary, con-d1 demoted to 0
    const dContacts = db.prepare("SELECT id, is_primary FROM client_contacts WHERE client_id = 'c_dup' ORDER BY id").all();
    assert.deepEqual(
      dContacts.map((c) => ({ id: c.id, is_primary: c.is_primary })),
      [
        { id: 'con-d1', is_primary: 0 },
        { id: 'con-d2', is_primary: 1 }
      ]
    );

    // Verify zero primary resolved: con-z1 promoted to 1, con-z2 remains 0
    const zContacts = db.prepare("SELECT id, is_primary FROM client_contacts WHERE client_id = 'c_zero' ORDER BY id").all();
    assert.deepEqual(
      zContacts.map((c) => ({ id: c.id, is_primary: c.is_primary })),
      [
        { id: 'con-z1', is_primary: 1 },
        { id: 'con-z2', is_primary: 0 }
      ]
    );

    // Verify archived contact preserved: con-a2 promoted to active primary, con-a1 remains archived
    const aContacts = db.prepare("SELECT id, is_primary, archived_at FROM client_contacts WHERE client_id = 'c_arch' ORDER BY id").all();
    assert.equal(aContacts.find((c) => c.id === 'con-a2').is_primary, 1);
    assert.ok(aContacts.find((c) => c.id === 'con-a1').archived_at);

    // Verify partial unique index rejects second active primary contact
    assert.throws(
      () => {
        db.exec("INSERT INTO client_contacts (id, client_id, full_name, is_primary) VALUES ('con-d3', 'c_dup', 'Illegal Primary', 1);");
      },
      /UNIQUE constraint failed/,
      'Partial unique index must block duplicate active primary contact'
    );

    // Verify secondary contacts can be added freely
    assert.doesNotThrow(() => {
      db.exec("INSERT INTO client_contacts (id, client_id, full_name, is_primary) VALUES ('con-d4', 'c_dup', 'Valid Secondary', 0);");
    }, 'Secondary contacts with is_primary = 0 must insert cleanly');
  });

  test('4. Column check constraints enforcement', () => {
    const db = initCleanDatabase();
    db.exec(loadMigration('0003_leads_pipeline.sql'));
    db.exec(`INSERT INTO hq_users (uid, email, display_name) VALUES ('u1', 'owner@example.com', 'Owner');`);

    // Invalid lead_origin rejection
    assert.throws(
      () => {
        db.exec("INSERT INTO clients (id, client_code, name, lead_origin, created_by) VALUES ('inv-1', 'C-1', 'Test', 'invalid-origin', 'u1');");
      },
      /CHECK constraint failed/,
      'Invalid lead_origin must be rejected by CHECK constraint'
    );

    // Invalid pipeline_stage rejection
    assert.throws(
      () => {
        db.exec("INSERT INTO clients (id, client_code, name, pipeline_stage, created_by) VALUES ('inv-2', 'C-2', 'Test', 'invalid-stage', 'u1');");
      },
      /CHECK constraint failed/,
      'Invalid pipeline_stage must be rejected by CHECK constraint'
    );

    // Negative estimated_value_minor rejection
    assert.throws(
      () => {
        db.exec("INSERT INTO clients (id, client_code, name, estimated_value_minor, created_by) VALUES ('inv-3', 'C-3', 'Test', -100, 'u1');");
      },
      /CHECK constraint failed/,
      'Negative estimated_value_minor must be rejected by CHECK constraint'
    );

    // Invalid currency code length rejection
    assert.throws(
      () => {
        db.exec("INSERT INTO clients (id, client_code, name, currency, created_by) VALUES ('inv-4', 'C-4', 'Test', 'IN', 'u1');");
      },
      /CHECK constraint failed/,
      'Currency code not equal to 3 characters must be rejected'
    );
  });

  test('5. Foreign key and relational integrity preservation across existing modules', () => {
    const db = initCleanDatabase();
    db.exec(`INSERT INTO hq_users (uid, email, display_name) VALUES ('u1', 'owner@example.com', 'Owner');`);
    db.exec(`INSERT INTO clients (id, client_code, name, created_by) VALUES ('c1', 'CLI-1', 'Test Client', 'u1');`);
    db.exec(`INSERT INTO projects (id, project_code, client_id, name, created_by) VALUES ('p1', 'PRJ-1', 'c1', 'Test Project', 'u1');`);
    db.exec(`INSERT INTO activity_notes (id, client_id, project_id, body, created_by) VALUES ('n1', 'c1', 'p1', 'Note 1', 'u1');`);

    // Apply migration
    db.exec(loadMigration('0003_leads_pipeline.sql'));

    // Verify foreign key integrity checks pass cleanly
    const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
    assert.equal(fkCheck.length, 0, 'PRAGMA foreign_key_check must return 0 violations after migration 0003');
  });
});
