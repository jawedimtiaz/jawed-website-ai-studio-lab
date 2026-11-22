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

describe('Phase 8.0.4 Migration 0003 Verification Suite (R1 Corrections)', () => {
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

    const clients = db.prepare('SELECT id, status, lead_origin, pipeline_stage, converted_at, created_at, lost_at, updated_at, lost_reason, archived_at FROM clients ORDER BY id').all();

    const getClient = (id) => clients.find((c) => c.id === id);

    // Rule 1 verifications: Commercial accounts must be converted
    const c1 = getClient('c1');
    assert.equal(c1.lead_origin, 'legacy-existing');
    assert.equal(c1.pipeline_stage, 'converted', 'c1 (Jawed Web Studio QA) must be classified as converted because it has a project');
    assert.equal(c1.converted_at, c1.created_at, 'converted_at must be reconstructed from created_at as inception approximation');

    const c3 = getClient('c3');
    assert.equal(c3.lead_origin, 'legacy-existing');
    assert.equal(c3.pipeline_stage, 'converted', 'c3 (Closed former customer with project) must be converted, NOT lost');
    assert.equal(c3.converted_at, c3.created_at);

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
    assert.equal(c5.lost_at, c5.updated_at, 'lost_at must be set to updated_at');
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

  test('3. Deterministic duplicate primary contact demotion with identical timestamps and existing valid primary preservation', () => {
    const db = initCleanDatabase();
    db.exec(`INSERT INTO hq_users (uid, email, display_name) VALUES ('u1', 'owner@example.com', 'Owner');`);

    // Case A: Client with duplicate primaries having identical timestamps -> tie-breaker by id DESC
    db.exec(`INSERT INTO clients (id, client_code, name, status, created_by) VALUES ('c_tie', 'CLI-T', 'Tie Client', 'active', 'u1');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at, updated_at) VALUES ('con-t-01', 'c_tie', 'Contact 01', 1, '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at, updated_at) VALUES ('con-t-02', 'c_tie', 'Contact 02', 1, '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at, updated_at) VALUES ('con-t-03', 'c_tie', 'Contact 03', 1, '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z');`);

    // Case B: Client with duplicate primaries having differing timestamps -> most recently updated/created wins
    db.exec(`INSERT INTO clients (id, client_code, name, status, created_by) VALUES ('c_diff', 'CLI-D', 'Diff Client', 'active', 'u1');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at, updated_at) VALUES ('con-d-01', 'c_diff', 'Contact D1', 1, '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at, updated_at) VALUES ('con-d-02', 'c_diff', 'Contact D2', 1, '2026-11-01T10:00:00.000Z', '2026-11-02T15:00:00.000Z');`);

    // Case C: Client with existing valid single primary -> remains unchanged
    db.exec(`INSERT INTO clients (id, client_code, name, status, created_by) VALUES ('c_valid', 'CLI-V', 'Valid Client', 'active', 'u1');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at, updated_at) VALUES ('con-v-01', 'c_valid', 'Valid Primary', 1, '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at, updated_at) VALUES ('con-v-02', 'c_valid', 'Valid Secondary', 0, '2026-11-02T10:00:00.000Z', '2026-11-02T10:00:00.000Z');`);

    // Apply Migration 0003
    db.exec(loadMigration('0003_leads_pipeline.sql'));

    // Check Case A: tie-breaker id DESC -> con-t-03 should remain primary (1), con-t-01 and con-t-02 demoted to 0
    const tieContacts = db.prepare("SELECT id, is_primary FROM client_contacts WHERE client_id = 'c_tie' ORDER BY id").all();
    assert.deepEqual(
      tieContacts.map((c) => ({ id: c.id, is_primary: c.is_primary })),
      [
        { id: 'con-t-01', is_primary: 0 },
        { id: 'con-t-02', is_primary: 0 },
        { id: 'con-t-03', is_primary: 1 }
      ],
      'Identical timestamp duplicates must break tie deterministically via id DESC'
    );

    // Check Case B: most recently updated contact con-d-02 remains primary (1), con-d-01 demoted to 0
    const diffContacts = db.prepare("SELECT id, is_primary FROM client_contacts WHERE client_id = 'c_diff' ORDER BY id").all();
    assert.deepEqual(
      diffContacts.map((c) => ({ id: c.id, is_primary: c.is_primary })),
      [
        { id: 'con-d-01', is_primary: 0 },
        { id: 'con-d-02', is_primary: 1 }
      ],
      'More recently updated contact must remain primary'
    );

    // Check Case C: Existing valid primary unchanged
    const validContacts = db.prepare("SELECT id, is_primary FROM client_contacts WHERE client_id = 'c_valid' ORDER BY id").all();
    assert.deepEqual(
      validContacts.map((c) => ({ id: c.id, is_primary: c.is_primary })),
      [
        { id: 'con-v-01', is_primary: 1 },
        { id: 'con-v-02', is_primary: 0 }
      ],
      'Client with valid single primary must remain unchanged'
    );
  });

  test('4. Zero-primary normalization, archived-only handling, and non-promotion of archived contacts', () => {
    const db = initCleanDatabase();
    db.exec(`INSERT INTO hq_users (uid, email, display_name) VALUES ('u1', 'owner@example.com', 'Owner');`);

    // Client with active contacts but zero primary contacts -> promote earliest created
    db.exec(`INSERT INTO clients (id, client_code, name, status, created_by) VALUES ('c_zero', 'CLI-Z', 'Zero Primary', 'active', 'u1');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at) VALUES ('con-z1', 'c_zero', 'Earliest Secondary', 0, '2026-11-01T10:00:00.000Z');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at) VALUES ('con-z2', 'c_zero', 'Later Secondary', 0, '2026-11-02T10:00:00.000Z');`);

    // Client with active contacts having identical created_at -> tie-breaker by id ASC
    db.exec(`INSERT INTO clients (id, client_code, name, status, created_by) VALUES ('c_ztie', 'CLI-ZT', 'Zero Tie', 'active', 'u1');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at) VALUES ('con-zt-01', 'c_ztie', 'Tie 1', 0, '2026-11-01T10:00:00.000Z');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, created_at) VALUES ('con-zt-02', 'c_ztie', 'Tie 2', 0, '2026-11-01T10:00:00.000Z');`);

    // Client with ONLY archived contacts (zero active contacts) -> archived contacts MUST NEVER be promoted
    db.exec(`INSERT INTO clients (id, client_code, name, status, created_by) VALUES ('c_arch_only', 'CLI-AO', 'Arch Only', 'active', 'u1');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, archived_at, archived_by) VALUES ('con-ao-01', 'c_arch_only', 'Archived 1', 0, '2026-11-01T10:00:00.000Z', 'u1');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, archived_at, archived_by) VALUES ('con-ao-02', 'c_arch_only', 'Archived 2', 0, '2026-11-02T10:00:00.000Z', 'u1');`);

    // Apply Migration 0003
    db.exec(loadMigration('0003_leads_pipeline.sql'));

    // Check c_zero: earliest con-z1 promoted to 1, con-z2 remains 0
    const zContacts = db.prepare("SELECT id, is_primary FROM client_contacts WHERE client_id = 'c_zero' ORDER BY id").all();
    assert.deepEqual(
      zContacts.map((c) => ({ id: c.id, is_primary: c.is_primary })),
      [
        { id: 'con-z1', is_primary: 1 },
        { id: 'con-z2', is_primary: 0 }
      ]
    );

    // Check c_ztie: identical timestamps tie-breaker id ASC -> con-zt-01 promoted to 1, con-zt-02 remains 0
    const ztContacts = db.prepare("SELECT id, is_primary FROM client_contacts WHERE client_id = 'c_ztie' ORDER BY id").all();
    assert.deepEqual(
      ztContacts.map((c) => ({ id: c.id, is_primary: c.is_primary })),
      [
        { id: 'con-zt-01', is_primary: 1 },
        { id: 'con-zt-02', is_primary: 0 }
      ]
    );

    // Check c_arch_only: archived contacts must remain is_primary = 0 and archived_at preserved
    const aoContacts = db.prepare("SELECT id, is_primary, archived_at FROM client_contacts WHERE client_id = 'c_arch_only' ORDER BY id").all();
    for (const c of aoContacts) {
      assert.equal(c.is_primary, 0, 'Archived-only contacts must never be promoted to primary');
      assert.ok(c.archived_at, 'archived_at must be preserved');
    }
  });

  test('5. Deterministic normalization handling of NULL timestamps in isolated legacy fixture', () => {
    // In legacy schema variants where created_at or updated_at may be NULL,
    // verify the migration handles NULL timestamps deterministically using COALESCE and id tie-breaker.
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(loadMigration('0001_studio_hq_schema.sql'));
    db.exec(loadMigration('0002_financial_management.sql'));

    // Recreate client_contacts without NOT NULL on timestamps for legacy simulation
    db.exec('DROP TABLE client_contacts;');
    db.exec(`
      CREATE TABLE client_contacts (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        full_name TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT,
        archived_at TEXT
      );
    `);

    // Case 1: Multiple primaries with NULL timestamps -> tie-breaker id DESC keeps con-n2
    db.exec("INSERT INTO client_contacts VALUES ('con-n1', 'c_null_dup', 'N1', 1, NULL, NULL, NULL);");
    db.exec("INSERT INTO client_contacts VALUES ('con-n2', 'c_null_dup', 'N2', 1, NULL, NULL, NULL);");

    // Case 2: Zero primary with NULL timestamps -> tie-breaker id ASC promotes con-z1
    db.exec("INSERT INTO client_contacts VALUES ('con-z1', 'c_null_zero', 'Z1', 0, NULL, NULL, NULL);");
    db.exec("INSERT INTO client_contacts VALUES ('con-z2', 'c_null_zero', 'Z2', 0, NULL, NULL, NULL);");

    // Apply migration
    db.exec(loadMigration('0003_leads_pipeline.sql'));

    const dupContacts = db.prepare("SELECT id, is_primary FROM client_contacts WHERE client_id = 'c_null_dup' ORDER BY id").all();
    assert.deepEqual(
      dupContacts.map((c) => ({ id: c.id, is_primary: c.is_primary })),
      [
        { id: 'con-n1', is_primary: 0 },
        { id: 'con-n2', is_primary: 1 }
      ],
      'Duplicate primary with NULL timestamps must deterministically select con-n2 via id DESC tie-breaker'
    );

    const zeroContacts = db.prepare("SELECT id, is_primary FROM client_contacts WHERE client_id = 'c_null_zero' ORDER BY id").all();
    assert.deepEqual(
      zeroContacts.map((c) => ({ id: c.id, is_primary: c.is_primary })),
      [
        { id: 'con-z1', is_primary: 1 },
        { id: 'con-z2', is_primary: 0 }
      ],
      'Zero primary with NULL timestamps must deterministically promote con-z1 via id ASC tie-breaker'
    );
  });

  test('6. Partial unique index guarantees at most one active primary contact per client', () => {
    const db = initCleanDatabase();
    db.exec(loadMigration('0003_leads_pipeline.sql'));
    db.exec(`INSERT INTO hq_users (uid, email, display_name) VALUES ('u1', 'owner@example.com', 'Owner');`);

    db.exec(`INSERT INTO clients (id, client_code, name, status, created_by) VALUES ('c1', 'CLI-1', 'Test Client', 'active', 'u1');`);
    db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary) VALUES ('con-1', 'c1', 'Primary One', 1);`);

    // Reject second active primary for same client
    assert.throws(
      () => {
        db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary) VALUES ('con-2', 'c1', 'Primary Two', 1);`);
      },
      /UNIQUE constraint failed/,
      'Partial unique index must reject a second active primary contact for the same client'
    );

    // Allow unlimited secondary contacts (is_primary = 0)
    assert.doesNotThrow(() => {
      db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary) VALUES ('con-sec-1', 'c1', 'Secondary 1', 0);`);
      db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary) VALUES ('con-sec-2', 'c1', 'Secondary 2', 0);`);
    }, 'Unlimited secondary contacts with is_primary = 0 must be allowed');

    // Allow multiple archived contacts even if is_primary = 1 because partial index specifies archived_at IS NULL
    assert.doesNotThrow(() => {
      db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, archived_at, archived_by) VALUES ('con-arch-1', 'c1', 'Archived Primary 1', 1, '2026-11-01', 'u1');`);
      db.exec(`INSERT INTO client_contacts (id, client_id, full_name, is_primary, archived_at, archived_by) VALUES ('con-arch-2', 'c1', 'Archived Primary 2', 1, '2026-11-02', 'u1');`);
    }, 'Partial unique index must allow archived records with is_primary = 1 (at most one ACTIVE primary)');
  });

  test('7. Currency registry validation: accepts approved currencies and strictly rejects invalid', () => {
    const db = initCleanDatabase();
    db.exec(loadMigration('0003_leads_pipeline.sql'));
    db.exec(`INSERT INTO hq_users (uid, email, display_name) VALUES ('u1', 'owner@example.com', 'Owner');`);

    const approvedCurrencies = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'AED', 'SAR', 'JPY', 'KRW', 'KWD', 'BHD', 'OMR'];

    // Verify all 14 approved currencies insert cleanly
    approvedCurrencies.forEach((curr, index) => {
      assert.doesNotThrow(() => {
        db.exec(`INSERT INTO clients (id, client_code, name, currency, created_by) VALUES ('c-curr-${index}', 'C-${index}', 'Client ${curr}', '${curr}', 'u1');`);
      }, `Approved currency ${curr} must be accepted`);
    });

    // Verify invalid currency codes are rejected
    const invalidCurrencies = [
      'XYZ',       // Not in registry
      'IN',        // Too short
      'USDD',      // Too long
      'inr',       // Lowercase rejected (case-sensitive check)
      'usd',       // Lowercase rejected
      ' INR',      // Leading whitespace rejected
      'INR ',      // Trailing whitespace rejected
      '',          // Empty string rejected
      'EUR1'       // Alphanumeric rejected
    ];

    invalidCurrencies.forEach((inv, index) => {
      assert.throws(
        () => {
          db.exec(`INSERT INTO clients (id, client_code, name, currency, created_by) VALUES ('c-inv-${index}', 'INV-${index}', 'Client Inv', '${inv}', 'u1');`);
        },
        /CHECK constraint failed/,
        `Invalid currency '${inv}' must be rejected by CHECK constraint`
      );
    });
  });

  test('8. Lead origin and pipeline stage check constraints enforcement', () => {
    const db = initCleanDatabase();
    db.exec(loadMigration('0003_leads_pipeline.sql'));
    db.exec(`INSERT INTO hq_users (uid, email, display_name) VALUES ('u1', 'owner@example.com', 'Owner');`);

    // Invalid lead_origin rejection
    assert.throws(
      () => {
        db.exec("INSERT INTO clients (id, client_code, name, lead_origin, created_by) VALUES ('inv-o1', 'C-O1', 'Test', 'invalid-origin', 'u1');");
      },
      /CHECK constraint failed/,
      'Invalid lead_origin must be rejected by CHECK constraint'
    );

    // Invalid pipeline_stage rejection
    assert.throws(
      () => {
        db.exec("INSERT INTO clients (id, client_code, name, pipeline_stage, created_by) VALUES ('inv-s1', 'C-S1', 'Test', 'invalid-stage', 'u1');");
      },
      /CHECK constraint failed/,
      'Invalid pipeline_stage must be rejected by CHECK constraint'
    );

    // Negative estimated_value_minor rejection
    assert.throws(
      () => {
        db.exec("INSERT INTO clients (id, client_code, name, estimated_value_minor, created_by) VALUES ('inv-v1', 'C-V1', 'Test', -100, 'u1');");
      },
      /CHECK constraint failed/,
      'Negative estimated_value_minor must be rejected by CHECK constraint'
    );
  });

  test('9. Foreign key and relational integrity preservation across existing modules', () => {
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
