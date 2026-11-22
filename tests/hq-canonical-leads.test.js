// tests/hq-canonical-leads.test.js
// Automated verification suite for Studio HQ Canonical Leads API (Phase 8.0.4 WP-2)
// Thoroughly validates lead validation, lifecycle, filtering, contact sync,
// lost reason requirement, reopening, converted restrictions, archive/restore,
// atomic conversion, duplicate advisories, authorization, and boundary routing.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  validateLead,
  handleAuthorizedHqLeads,
  handleHqLeads
} from '../functions/api/hq/canonicalLeads.js';
import {
  dispatchHqIntegrationBoundary
} from '../functions/lib/hqIntegrationBoundary.js';

class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    this.sqlite.exec(readFileSync('tests/fixtures/hq-canonical-schema.sql', 'utf8'));
    this.sqlite.exec(readFileSync('migrations/hq/0003_leads_pipeline.sql', 'utf8'));
  }

  prepare(sql) {
    const database = this.sqlite;
    return {
      bind(...params) {
        return {
          sql,
          all: () => ({
            results: database.prepare(sql).all(...params),
            success: true,
            meta: { changes: 0 }
          }),
          first: () => database.prepare(sql).get(...params) || null,
          run: () => {
            const result = database.prepare(sql).run(...params);
            return { success: true, meta: { changes: Number(result.changes) } };
          }
        };
      }
    };
  }

  batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map(statement =>
        (/^\s*SELECT\b/i.test(statement.sql) || /\bRETURNING\b/i.test(statement.sql))
          ? statement.all()
          : statement.run()
      );
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }
}

const ownerIdentity = { uid: 'owner-uid-wp2', email: 'jawed@jawed.co.in' };

function makeRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const reqHeaders = new Headers(headers);
  if (body !== undefined && !reqHeaders.has('content-type')) {
    reqHeaders.set('content-type', 'application/json');
  }
  return new Request(`https://lab.jawed.co.in${path}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

function callAuthorized(db, req, segments = []) {
  return handleAuthorizedHqLeads({
    request: req,
    env: { ENVIRONMENT: 'test', HQ_DB: db },
    segments,
    identity: ownerIdentity
  });
}

function seedOwner(db) {
  db.sqlite.prepare(
    "INSERT INTO hq_users (uid, email, display_name, status) VALUES (?, ?, 'Jawed Owner', 'active')"
  ).run(ownerIdentity.uid, ownerIdentity.email);
}

// ---------------------------------------------------------------------------
// 1. Unit Tests: Payload Validation
// ---------------------------------------------------------------------------
describe('1. Canonical Leads Payload Validation', () => {
  test('validates valid full lead payload and normalizes email/source', () => {
    const res = validateLead({
      business_name: 'Apex Innovations',
      contact_name: 'Sara Khan',
      email: '  SARA@APEX.COM  ',
      phone: '+91 9876543210',
      category: 'Design & Tech',
      website: 'https://apex.com',
      source: 'Website Enquiry',
      estimated_value_minor: 15000000,
      currency: 'INR',
      notes: 'High intent prospect',
      next_follow_up_at: '2026-12-01T10:00:00.000Z'
    });
    assert.equal(res.ok, true);
    assert.equal(res.value.business_name, 'Apex Innovations');
    assert.equal(res.value.contact_name, 'Sara Khan');
    assert.equal(res.value.email, 'sara@apex.com');
    assert.equal(res.value.source, 'inbound'); // mapped from 'Website Enquiry'
    assert.equal(res.value.currency, 'INR');
    assert.equal(res.value.estimated_value_minor, 15000000);
    assert.equal(res.value.pipeline_stage, 'new');
    assert.equal(res.value.lead_origin, 'inbound-lead');
  });

  test('requires business_name and contact_name on lead creation', () => {
    assert.deepEqual(validateLead({ contact_name: 'Alice' }), {
      ok: false,
      error: 'REQUIRED_FIELDS'
    });
    assert.deepEqual(validateLead({ business_name: 'Acme Corp' }), {
      ok: false,
      error: 'REQUIRED_FIELDS'
    });
    assert.deepEqual(validateLead({ business_name: '  ', contact_name: 'Alice' }), {
      ok: false,
      error: 'REQUIRED_FIELDS'
    });
  });

  test('strictly rejects unknown fields with UNKNOWN_FIELDS', () => {
    const res = validateLead({
      business_name: 'Acme',
      contact_name: 'Bob',
      unknown_field: 'malicious',
      isAdmin: true
    });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'UNKNOWN_FIELDS');
  });

  test('validates currency against allowed currency registry', () => {
    const validCurr = validateLead({
      business_name: 'Acme',
      contact_name: 'Bob',
      currency: 'USD'
    });
    assert.equal(validCurr.ok, true);
    assert.equal(validCurr.value.currency, 'USD');

    const invalidCurr = validateLead({
      business_name: 'Acme',
      contact_name: 'Bob',
      currency: 'XYZ'
    });
    assert.equal(invalidCurr.ok, false);
    assert.equal(invalidCurr.error, 'INVALID_CURRENCY');
  });

  test('validates estimated_value_minor as non-negative safe integer', () => {
    assert.equal(validateLead({ business_name: 'Acme', contact_name: 'Bob', estimated_value_minor: -100 }).error, 'INVALID_AMOUNT');
    assert.equal(validateLead({ business_name: 'Acme', contact_name: 'Bob', estimated_value_minor: 12.5 }).error, 'INVALID_AMOUNT');
    assert.equal(validateLead({ business_name: 'Acme', contact_name: 'Bob', estimated_value_minor: '500' }).error, 'INVALID_AMOUNT');
    assert.equal(validateLead({ business_name: 'Acme', contact_name: 'Bob', estimated_value_minor: 0 }).ok, true);
  });

  test('validates next_follow_up_at format', () => {
    assert.equal(validateLead({ business_name: 'Acme', contact_name: 'Bob', next_follow_up_at: 'not-a-date' }).error, 'INVALID_FOLLOW_UP');
    assert.equal(validateLead({ business_name: 'Acme', contact_name: 'Bob', next_follow_up_at: null }).ok, true);
    assert.equal(validateLead({ business_name: 'Acme', contact_name: 'Bob', next_follow_up_at: '2026-11-25T14:30:00Z' }).ok, true);
  });

  test('rejects setting converted stage via standard update', () => {
    assert.deepEqual(validateLead({ pipeline_stage: 'converted' }, true), {
      ok: false,
      error: 'INVALID_STAGE'
    });
  });

  test('partial update validation permits omitted fields', () => {
    const res = validateLead({ phone: '+91 9999900000', notes: 'Updated notes' }, true);
    assert.equal(res.ok, true);
    assert.equal(res.value.phone, '+91 9999900000');
    assert.equal(res.value.notes, 'Updated notes');
    assert.equal(res.value.business_name, undefined);
  });
});

// ---------------------------------------------------------------------------
// 2. Integration Tests: Lead Creation & Primary Contact Synchronization
// ---------------------------------------------------------------------------
describe('2. Lead Creation & Contact Invariants', () => {
  let db;
  beforeEach(() => {
    db = new TestD1();
    seedOwner(db);
  });
  afterEach(() => {
    db.close();
  });

  test('creates lead record and automatically inserts primary contact', async () => {
    const req = makeRequest('/api/hq/leads', {
      method: 'POST',
      body: {
        business_name: 'CloudScale Technologies',
        contact_name: 'Priya Sharma',
        email: 'priya@cloudscale.io',
        phone: '+91 9123456789',
        category: 'SaaS Platform',
        website: 'https://cloudscale.io',
        source: 'inbound',
        estimated_value_minor: 50000000,
        currency: 'INR',
        notes: 'Requested complete UI revamp'
      }
    });

    const res = await callAuthorized(db, req);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.lead.id);
    assert.equal(body.lead.business_name, 'CloudScale Technologies');
    assert.equal(body.lead.contact_name, 'Priya Sharma');
    assert.equal(body.lead.email, 'priya@cloudscale.io');
    assert.equal(body.lead.pipeline_stage, 'new');
    assert.equal(body.lead.canonical_status, 'lead');
    assert.equal(body.lead.lead_origin, 'inbound-lead');

    // Verify database row
    const leadRow = db.sqlite.prepare('SELECT * FROM clients WHERE id = ?').get(body.lead.id);
    assert.equal(leadRow.business_name, 'CloudScale Technologies');
    assert.equal(leadRow.status, 'lead');
    assert.equal(leadRow.pipeline_stage, 'new');
    assert.equal(leadRow.lead_origin, 'inbound-lead');

    // Verify primary contact in client_contacts
    const contactRow = db.sqlite.prepare('SELECT * FROM client_contacts WHERE client_id = ?').get(body.lead.id);
    assert.ok(contactRow);
    assert.equal(contactRow.full_name, 'Priya Sharma');
    assert.equal(contactRow.email, 'priya@cloudscale.io');
    assert.equal(contactRow.phone, '+91 9123456789');
    assert.equal(contactRow.is_primary, 1);
    assert.equal(contactRow.role_title, 'Primary Contact');
  });

  test('returns non-blocking duplicate advisories when matching existing client', async () => {
    // Insert existing customer
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, phone, status, lead_origin, created_by)
      VALUES ('existing-client-1', 'Rajesh Gupta', 'Acme Corp', 'rajesh@acme.com', '+91 9998887776', 'active', 'direct-customer', ?)
    `).run(ownerIdentity.uid);

    // Create lead with same email
    const req = makeRequest('/api/hq/leads', {
      method: 'POST',
      body: {
        business_name: 'Acme Subsidiary',
        contact_name: 'Rajesh G',
        email: 'rajesh@acme.com',
        phone: '+91 8887776665'
      }
    });

    const res = await callAuthorized(db, req);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.duplicate_advisories));
    assert.equal(body.duplicate_advisories.length, 1);
    assert.equal(body.duplicate_advisories[0].id, 'existing-client-1');
    assert.equal(body.duplicate_advisories[0].match_type, 'email');
  });
});

// ---------------------------------------------------------------------------
// 3. Integration Tests: Lead Listing, Filtering, Search & Pagination
// ---------------------------------------------------------------------------
describe('3. Lead Listing, Filtering, Search & Pagination', () => {
  let db;
  beforeEach(() => {
    db = new TestD1();
    seedOwner(db);

    // Seed test leads across various stages
    const now = new Date().toISOString();
    const leads = [
      { id: 'lead-1', name: 'Lead One', bname: 'Alpha Corp', stage: 'new', email: 'one@alpha.com', source: 'inbound', archived: null },
      { id: 'lead-2', name: 'Lead Two', bname: 'Beta Studio', stage: 'contacted', email: 'two@beta.com', source: 'referral', archived: null },
      { id: 'lead-3', name: 'Lead Three', bname: 'Gamma Systems', stage: 'qualified', email: 'three@gamma.com', source: 'partner', archived: null },
      { id: 'lead-4', name: 'Lead Four', bname: 'Delta Labs', stage: 'proposal-sent', email: 'four@delta.com', source: 'inbound', archived: null },
      { id: 'lead-5', name: 'Lead Five', bname: 'Epsilon Tech', stage: 'converted', email: 'five@epsilon.com', source: 'direct-client', archived: null },
      { id: 'lead-6', name: 'Lead Six', bname: 'Zeta Media', stage: 'lost', email: 'six@zeta.com', source: 'other', archived: null },
      { id: 'lead-7', name: 'Lead Seven', bname: 'Eta Global', stage: 'new', email: 'seven@eta.com', source: 'inbound', archived: now }
    ];

    for (const l of leads) {
      db.sqlite.prepare(`
        INSERT INTO clients (
          id, name, business_name, pipeline_stage, status, lead_origin, email, source,
          archived_at, archived_by, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'lead', 'inbound-lead', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        l.id, l.name, l.bname, l.stage, l.email, l.source,
        l.archived, l.archived ? ownerIdentity.uid : null,
        ownerIdentity.uid, ownerIdentity.uid, now, now
      );
    }
  });

  afterEach(() => {
    db.close();
  });

  test('default view returns only open active leads (excludes converted and lost)', async () => {
    const res = await callAuthorized(db, makeRequest('/api/hq/leads'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    // Should contain lead-1, lead-2, lead-3, lead-4 (4 total; lead-5 converted, lead-6 lost, lead-7 archived excluded)
    assert.equal(body.total, 4);
    const stages = body.leads.map(l => l.pipeline_stage);
    assert.ok(!stages.includes('converted'), 'Default view must exclude converted');
    assert.ok(!stages.includes('lost'), 'Default view must exclude lost');
  });

  test('stage filter returns only leads matching specified stage', async () => {
    // stage=contacted
    const resContacted = await callAuthorized(db, makeRequest('/api/hq/leads?stage=contacted'));
    const bodyContacted = await resContacted.json();
    assert.equal(bodyContacted.total, 1);
    assert.equal(bodyContacted.leads[0].id, 'lead-2');

    // stage=lost
    const resLost = await callAuthorized(db, makeRequest('/api/hq/leads?stage=lost'));
    const bodyLost = await resLost.json();
    assert.equal(bodyLost.total, 1);
    assert.equal(bodyLost.leads[0].id, 'lead-6');

    // stage=converted
    const resConv = await callAuthorized(db, makeRequest('/api/hq/leads?stage=converted'));
    const bodyConv = await resConv.json();
    assert.equal(bodyConv.total, 1);
    assert.equal(bodyConv.leads[0].id, 'lead-5');
  });

  test('all stages filter returns all active leads including converted and lost', async () => {
    const res = await callAuthorized(db, makeRequest('/api/hq/leads?stage=All'));
    assert.equal(res.status, 200);
    const body = await res.json();
    // 6 unarchived leads (leads 1-6)
    assert.equal(body.total, 6);
    const ids = body.leads.map(l => l.id);
    assert.ok(ids.includes('lead-5'), 'stage=All must include converted lead');
    assert.ok(ids.includes('lead-6'), 'stage=All must include lost lead');
    assert.ok(!ids.includes('lead-7'), 'stage=All must not include archived lead');
  });

  test('archivedOnly returns only archived leads', async () => {
    const res = await callAuthorized(db, makeRequest('/api/hq/leads?archivedOnly=true'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total, 1);
    assert.equal(body.leads[0].id, 'lead-7');
    assert.ok(body.leads[0].archived_at);
  });

  test('search filters leads by business_name, email, or source', async () => {
    const resName = await callAuthorized(db, makeRequest('/api/hq/leads?q=Alpha'));
    const bodyName = await resName.json();
    assert.equal(bodyName.total, 1);
    assert.equal(bodyName.leads[0].business_name, 'Alpha Corp');

    const resEmail = await callAuthorized(db, makeRequest('/api/hq/leads?q=delta.com'));
    const bodyEmail = await resEmail.json();
    assert.equal(bodyEmail.total, 1);
    assert.equal(bodyEmail.leads[0].id, 'lead-4');
  });

  test('pagination limits results and navigates pages', async () => {
    const page1 = await (await callAuthorized(db, makeRequest('/api/hq/leads?page=1&limit=2'))).json();
    assert.equal(page1.leads.length, 2);
    assert.equal(page1.page, 1);
    assert.equal(page1.limit, 2);

    const page2 = await (await callAuthorized(db, makeRequest('/api/hq/leads?page=2&limit=2'))).json();
    assert.equal(page2.leads.length, 2);
    assert.equal(page2.page, 2);

    // Verify distinct records
    assert.notEqual(page1.leads[0].id, page2.leads[0].id);
  });
});

// ---------------------------------------------------------------------------
// 4. Integration Tests: Lead Updates, Primary Contact Sync & Stage Transitions
// ---------------------------------------------------------------------------
describe('4. Lead Updates & Stage Transitions', () => {
  let db;
  let testLeadId;
  beforeEach(async () => {
    db = new TestD1();
    seedOwner(db);

    const createRes = await callAuthorized(db, makeRequest('/api/hq/leads', {
      method: 'POST',
      body: {
        business_name: 'Target Logistics',
        contact_name: 'Vikram Seth',
        email: 'vikram@target.in',
        phone: '+91 9988776655'
      }
    }));
    const body = await createRes.json();
    testLeadId = body.lead.id;
  });

  afterEach(() => {
    db.close();
  });

  test('PATCH updates lead fields and synchronizes primary contact', async () => {
    const updateRes = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}`, {
      method: 'PATCH',
      body: {
        contact_name: 'Vikramaditya Seth',
        email: 'vseth@target.in',
        phone: '+91 8877665544',
        pipeline_stage: 'contacted',
        estimated_value_minor: 25000000,
        currency: 'INR'
      }
    }), [testLeadId]);

    assert.equal(updateRes.status, 200);
    const body = await updateRes.json();
    assert.equal(body.lead.contact_name, 'Vikramaditya Seth');
    assert.equal(body.lead.email, 'vseth@target.in');
    assert.equal(body.lead.pipeline_stage, 'contacted');
    assert.equal(body.lead.estimated_value_minor, 25000000);

    // Verify primary contact in client_contacts is synchronized
    const contact = db.sqlite.prepare('SELECT * FROM client_contacts WHERE client_id = ? AND is_primary = 1').get(testLeadId);
    assert.equal(contact.full_name, 'Vikramaditya Seth');
    assert.equal(contact.email, 'vseth@target.in');
    assert.equal(contact.phone, '+91 8877665544');
  });

  test('PATCH rejects unknown fields with 400 UNKNOWN_FIELDS', async () => {
    const res = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}`, {
      method: 'PATCH',
      body: {
        non_existent_column: 'bad_value'
      }
    }), [testLeadId]);

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'UNKNOWN_FIELDS');
  });

  test('marking lead as Lost requires non-empty lost_reason', async () => {
    // Missing lost_reason
    const resMissing = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}`, {
      method: 'PATCH',
      body: { pipeline_stage: 'lost' }
    }), [testLeadId]);

    assert.equal(resMissing.status, 400);
    const bodyMissing = await resMissing.json();
    assert.equal(bodyMissing.error.code, 'LOST_REASON_REQUIRED');

    // Empty string lost_reason
    const resEmpty = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}`, {
      method: 'PATCH',
      body: { pipeline_stage: 'lost', lost_reason: '   ' }
    }), [testLeadId]);

    assert.equal(resEmpty.status, 400);
    assert.equal((await resEmpty.json()).error.code, 'LOST_REASON_REQUIRED');

    // Valid lost_reason succeeds and populates lost_at
    const resValid = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}`, {
      method: 'PATCH',
      body: { pipeline_stage: 'lost', lost_reason: 'Budget was reduced' }
    }), [testLeadId]);

    assert.equal(resValid.status, 200);
    const bodyValid = await resValid.json();
    assert.equal(bodyValid.lead.pipeline_stage, 'lost');
    assert.equal(bodyValid.lead.canonical_status, 'closed');
    assert.equal(bodyValid.lead.lost_reason, 'Budget was reduced');
    assert.ok(bodyValid.lead.lost_at);
  });

  test('reopening a Lost lead clears lost_at and lost_reason to NULL', async () => {
    // Mark as lost first
    await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}`, {
      method: 'PATCH',
      body: { pipeline_stage: 'lost', lost_reason: 'Timeline postponed' }
    }), [testLeadId]);

    // Reopen to qualified
    const reopenRes = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}`, {
      method: 'PATCH',
      body: { pipeline_stage: 'qualified' }
    }), [testLeadId]);

    assert.equal(reopenRes.status, 200);
    const body = await reopenRes.json();
    assert.equal(body.lead.pipeline_stage, 'qualified');
    assert.equal(body.lead.canonical_status, 'prospect');
    assert.equal(body.lead.lost_at, null);
    assert.equal(body.lead.lost_reason, null);

    // Verify database row
    const row = db.sqlite.prepare('SELECT lost_at, lost_reason FROM clients WHERE id = ?').get(testLeadId);
    assert.equal(row.lost_at, null);
    assert.equal(row.lost_reason, null);
  });

  test('rejects edits on already converted lead with 409 LEAD_ALREADY_CONVERTED', async () => {
    // Mark lead as converted in DB
    db.sqlite.prepare("UPDATE clients SET pipeline_stage = 'converted', status = 'active' WHERE id = ?").run(testLeadId);

    const editRes = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}`, {
      method: 'PATCH',
      body: { business_name: 'New Name' }
    }), [testLeadId]);

    assert.equal(editRes.status, 409);
    const body = await editRes.json();
    assert.equal(body.error.code, 'LEAD_ALREADY_CONVERTED');
  });

  test('lead update creates a primary contact if missing without violating single-primary invariant', async () => {
    // Seed lead directly in clients without contact in client_contacts
    const headlessLeadId = crypto.randomUUID();
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, status, lead_origin, pipeline_stage, created_by)
      VALUES (?, 'Headless Lead', 'Headless Corp', 'lead', 'inbound-lead', 'new', ?)
    `).run(headlessLeadId, ownerIdentity.uid);

    // Confirm 0 contacts exist initially
    const initialContacts = db.sqlite.prepare('SELECT COUNT(*) as count FROM client_contacts WHERE client_id = ?').get(headlessLeadId);
    assert.equal(initialContacts.count, 0);

    // Call PATCH with contact updates
    const patchRes = await callAuthorized(db, makeRequest(`/api/hq/leads/${headlessLeadId}`, {
      method: 'PATCH',
      body: {
        contact_name: 'Newly Created Primary',
        email: 'primary@headless.com',
        phone: '+91 9111122222'
      }
    }), [headlessLeadId]);

    assert.equal(patchRes.status, 200);

    // Confirm exactly 1 primary contact was created
    const contacts = db.sqlite.prepare('SELECT * FROM client_contacts WHERE client_id = ?').all(headlessLeadId);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].full_name, 'Newly Created Primary');
    assert.equal(contacts[0].email, 'primary@headless.com');
    assert.equal(contacts[0].phone, '+91 9111122222');
    assert.equal(contacts[0].is_primary, 1);
  });

  test('lead update synchronizes existing primary contact without creating duplicates', async () => {
    // testLeadId already has 1 primary contact from create
    const initialCount = db.sqlite.prepare('SELECT COUNT(*) as count FROM client_contacts WHERE client_id = ?').get(testLeadId);
    assert.equal(initialCount.count, 1);

    const syncRes = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}`, {
      method: 'PATCH',
      body: {
        contact_name: 'Synchronized Name',
        email: 'sync@target.in'
      }
    }), [testLeadId]);

    assert.equal(syncRes.status, 200);
    const afterCount = db.sqlite.prepare('SELECT COUNT(*) as count FROM client_contacts WHERE client_id = ?').get(testLeadId);
    assert.equal(afterCount.count, 1);
    const contact = db.sqlite.prepare('SELECT * FROM client_contacts WHERE client_id = ?').get(testLeadId);
    assert.equal(contact.full_name, 'Synchronized Name');
    assert.equal(contact.email, 'sync@target.in');
  });

  test('audit insertion is based on client UPDATE, recording audit even when contact fields are not updated', async () => {
    const auditsBefore = db.sqlite.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE entity_id = ? AND action = 'lead.update'").get(testLeadId).count;

    // Update only notes (no contact fields)
    const resNotes = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}`, {
      method: 'PATCH',
      body: { notes: 'Updated internal notes only' }
    }), [testLeadId]);

    assert.equal(resNotes.status, 200);
    const auditsAfter = db.sqlite.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE entity_id = ? AND action = 'lead.update'").get(testLeadId).count;
    assert.equal(auditsAfter, auditsBefore + 1, 'Must record audit log for client update even when contact fields are omitted');
  });
});

// ---------------------------------------------------------------------------
// 5. Integration Tests: Lead Archival & Restoration
// ---------------------------------------------------------------------------
describe('5. Lead Archival & Restoration', () => {
  let db;
  let testLeadId;
  beforeEach(async () => {
    db = new TestD1();
    seedOwner(db);

    const createRes = await callAuthorized(db, makeRequest('/api/hq/leads', {
      method: 'POST',
      body: { business_name: 'Archive Me Inc', contact_name: 'David' }
    }));
    testLeadId = (await createRes.json()).lead.id;
  });

  afterEach(() => {
    db.close();
  });

  test('archives and restores lead idempotently with changed tracking', async () => {
    // 1. Archive
    const arch1 = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/archive`, { method: 'POST' }), [testLeadId, 'archive']);
    assert.equal(arch1.status, 200);
    const body1 = await arch1.json();
    assert.equal(body1.archived, true);
    assert.equal(body1.changed, true);

    // Verify excluded from active list
    const activeList = await (await callAuthorized(db, makeRequest('/api/hq/leads'))).json();
    assert.equal(activeList.total, 0);

    // Verify present in archived list
    const archivedList = await (await callAuthorized(db, makeRequest('/api/hq/leads?archivedOnly=true'))).json();
    assert.equal(archivedList.total, 1);
    assert.equal(archivedList.leads[0].id, testLeadId);

    // 2. Idempotent archive
    const arch2 = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/archive`, { method: 'POST' }), [testLeadId, 'archive']);
    assert.equal(arch2.status, 200);
    const body2 = await arch2.json();
    assert.equal(body2.archived, true);
    assert.equal(body2.changed, false);

    // 3. Restore
    const rest1 = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/restore`, { method: 'POST' }), [testLeadId, 'restore']);
    assert.equal(rest1.status, 200);
    const bodyRest1 = await rest1.json();
    assert.equal(bodyRest1.archived, false);
    assert.equal(bodyRest1.changed, true);

    // Verify returned to active list
    const restoredList = await (await callAuthorized(db, makeRequest('/api/hq/leads'))).json();
    assert.equal(restoredList.total, 1);
    assert.equal(restoredList.leads[0].id, testLeadId);

    // 4. Idempotent restore
    const rest2 = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/restore`, { method: 'POST' }), [testLeadId, 'restore']);
    assert.equal(rest2.status, 200);
    const bodyRest2 = await rest2.json();
    assert.equal(bodyRest2.archived, false);
    assert.equal(bodyRest2.changed, false);
  });

  test('archive nonexistent lead returns 404 LEAD_NOT_FOUND', async () => {
    const res = await callAuthorized(db, makeRequest('/api/hq/leads/nonexistent-lead-id/archive', { method: 'POST' }), ['nonexistent-lead-id', 'archive']);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, 'LEAD_NOT_FOUND');
  });

  test('restore nonexistent lead returns 404 LEAD_NOT_FOUND', async () => {
    const res = await callAuthorized(db, makeRequest('/api/hq/leads/nonexistent-lead-id/restore', { method: 'POST' }), ['nonexistent-lead-id', 'restore']);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, 'LEAD_NOT_FOUND');
  });

  test('idempotent archive does not create duplicate audit entries', async () => {
    const res1 = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/archive`, { method: 'POST' }), [testLeadId, 'archive']);
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.changed, true);

    const audits1 = db.sqlite.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE entity_id = ? AND action = 'lead.archive'").get(testLeadId).count;
    assert.equal(audits1, 1);

    // Redundant archive
    const res2 = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/archive`, { method: 'POST' }), [testLeadId, 'archive']);
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.changed, false);

    const audits2 = db.sqlite.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE entity_id = ? AND action = 'lead.archive'").get(testLeadId).count;
    assert.equal(audits2, 1, 'Redundant archive must not insert duplicate audit record');
  });

  test('idempotent restore does not create duplicate audit entries', async () => {
    // Archive first
    await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/archive`, { method: 'POST' }), [testLeadId, 'archive']);

    // First restore
    const res1 = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/restore`, { method: 'POST' }), [testLeadId, 'restore']);
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.changed, true);

    const audits1 = db.sqlite.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE entity_id = ? AND action = 'lead.restore'").get(testLeadId).count;
    assert.equal(audits1, 1);

    // Redundant restore
    const res2 = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/restore`, { method: 'POST' }), [testLeadId, 'restore']);
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.changed, false);

    const audits2 = db.sqlite.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE entity_id = ? AND action = 'lead.restore'").get(testLeadId).count;
    assert.equal(audits2, 1, 'Redundant restore must not insert duplicate audit record');
  });
});

// ---------------------------------------------------------------------------
// 6. Integration Tests: Atomic Conversion & Starter Project Creation
// ---------------------------------------------------------------------------
describe('6. Lead Conversion to Customer & Project Creation', () => {
  let db;
  let testLeadId;
  beforeEach(async () => {
    db = new TestD1();
    seedOwner(db);

    const createRes = await callAuthorized(db, makeRequest('/api/hq/leads', {
      method: 'POST',
      body: {
        business_name: 'Metro Real Estate',
        contact_name: 'Sunil Verma',
        email: 'sunil@metro.com',
        phone: '+91 9888877777',
        currency: 'INR'
      }
    }));
    testLeadId = (await createRes.json()).lead.id;
  });

  afterEach(() => {
    db.close();
  });

  test('converts lead to customer preserving UUID and updating pipeline_stage', async () => {
    const convRes = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/convert`, {
      method: 'POST',
      body: { createProject: false }
    }), [testLeadId, 'convert']);

    assert.equal(convRes.status, 201);
    const body = await convRes.json();
    assert.equal(body.success, true);
    assert.equal(body.clientId, testLeadId, 'Preserves client UUID');
    assert.equal(body.projectId, null);

    // Verify database row
    const client = db.sqlite.prepare('SELECT * FROM clients WHERE id = ?').get(testLeadId);
    assert.equal(client.pipeline_stage, 'converted');
    assert.equal(client.status, 'active');
    assert.ok(client.converted_at);
    assert.ok(client.conversion_token);
  });

  test('converts lead and atomically creates linked starter project with unique code', async () => {
    const convRes = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/convert`, {
      method: 'POST',
      body: {
        createProject: true,
        projectName: 'Metro Real Estate Portal'
      }
    }), [testLeadId, 'convert']);

    assert.equal(convRes.status, 201);
    const body = await convRes.json();
    assert.equal(body.success, true);
    assert.equal(body.clientId, testLeadId);
    assert.ok(body.projectId);

    // Verify project record created in projects table
    const proj = db.sqlite.prepare('SELECT * FROM projects WHERE id = ?').get(body.projectId);
    assert.ok(proj);
    assert.equal(proj.client_id, testLeadId);
    assert.equal(proj.name, 'Metro Real Estate Portal');
    assert.equal(proj.status, 'discovery');
    assert.match(proj.project_code, /^PRJ-[0-9A-F]{12}$/);
    assert.equal(proj.currency, 'INR');
  });

  test('rejects double conversion with 409 LEAD_ALREADY_CONVERTED', async () => {
    // First conversion
    await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/convert`, {
      method: 'POST',
      body: { createProject: false }
    }), [testLeadId, 'convert']);

    // Second conversion attempt
    const secondRes = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/convert`, {
      method: 'POST',
      body: { createProject: false }
    }), [testLeadId, 'convert']);

    assert.equal(secondRes.status, 409);
    const body = await secondRes.json();
    assert.equal(body.error.code, 'LEAD_ALREADY_CONVERTED');
  });

  test('rejects converting a lost lead with 409 LOST_LEAD_CANNOT_CONVERT', async () => {
    // Mark as lost
    await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}`, {
      method: 'PATCH',
      body: { pipeline_stage: 'lost', lost_reason: 'Competitor chosen' }
    }), [testLeadId]);

    // Try convert
    const convRes = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/convert`, {
      method: 'POST',
      body: { createProject: false }
    }), [testLeadId, 'convert']);

    assert.equal(convRes.status, 409);
    const body = await convRes.json();
    assert.equal(body.error.code, 'LOST_LEAD_CANNOT_CONVERT');
  });

  test('rejects invalid conversion body with 400 INVALID_CONVERSION_INPUT', async () => {
    const res = await callAuthorized(db, makeRequest(`/api/hq/leads/${testLeadId}/convert`, {
      method: 'POST',
      body: { unknown_option: true }
    }), [testLeadId, 'convert']);

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_CONVERSION_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 7. Security, Authorization & Origin Tests
// ---------------------------------------------------------------------------
describe('7. Security, Authorization & Origin', () => {
  let db;
  beforeEach(() => {
    db = new TestD1();
    seedOwner(db);
  });
  afterEach(() => {
    db.close();
  });

  test('rejects unauthenticated requests with 401 AUTH_REQUIRED', async () => {
    const unauthReq = new Request('https://lab.jawed.co.in/api/hq/leads', {
      method: 'GET'
    });
    const res = await handleHqLeads({
      request: unauthReq,
      env: { ENVIRONMENT: 'test', HQ_DB: db }
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'AUTH_REQUIRED');
  });

  test('rejects unauthenticated archive and restore requests with 401 AUTH_REQUIRED', async () => {
    const unauthArch = new Request('https://lab.jawed.co.in/api/hq/leads/some-lead/archive', {
      method: 'POST'
    });
    const resArch = await handleHqLeads({
      request: unauthArch,
      env: { ENVIRONMENT: 'test', HQ_DB: db },
      segments: ['some-lead', 'archive']
    });
    assert.equal(resArch.status, 401);
    assert.equal((await resArch.json()).error, 'AUTH_REQUIRED');

    const unauthRest = new Request('https://lab.jawed.co.in/api/hq/leads/some-lead/restore', {
      method: 'POST'
    });
    const resRest = await handleHqLeads({
      request: unauthRest,
      env: { ENVIRONMENT: 'test', HQ_DB: db },
      segments: ['some-lead', 'restore']
    });
    assert.equal(resRest.status, 401);
    assert.equal((await resRest.json()).error, 'AUTH_REQUIRED');
  });

  test('rejects unauthorized origin with 403 ORIGIN_NOT_ALLOWED', async () => {
    const badOriginReq = new Request('https://lab.jawed.co.in/api/hq/leads', {
      method: 'GET',
      headers: {
        origin: 'https://malicious-site.com',
        authorization: 'Bearer dummy-token'
      }
    });
    const res = await handleHqLeads({
      request: badOriginReq,
      env: { ENVIRONMENT: 'test', HQ_DB: db }
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'ORIGIN_NOT_ALLOWED');
  });
});

// ---------------------------------------------------------------------------
// 8. Integration Boundary Routing Tests
// ---------------------------------------------------------------------------
describe('8. Integration Boundary Routing', () => {
  test('canonical lead route reaches canonical dispatcher and never legacy router', async () => {
    let canonicalCalled = false;
    let legacyCalled = false;

    const mockCanonicalLeadsDispatcher = async (pathname) => {
      canonicalCalled = true;
      return new Response(JSON.stringify({ ok: true, source: 'canonical-leads', path: pathname }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    const mockLegacyRouter = async () => {
      legacyCalled = true;
      return new Response(JSON.stringify({ source: 'legacy' }), { status: 200 });
    };

    const res = await dispatchHqIntegrationBoundary(
      '/api/hq/leads?stage=qualified',
      { request: makeRequest('/api/hq/leads?stage=qualified'), env: {} },
      { canonicalLeadsDispatcher: mockCanonicalLeadsDispatcher, legacyRouter: mockLegacyRouter }
    );

    assert.equal(canonicalCalled, true, 'Must call canonical leads dispatcher');
    assert.equal(legacyCalled, false, 'Must never fall through to legacy router');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.source, 'canonical-leads');
  });
});
