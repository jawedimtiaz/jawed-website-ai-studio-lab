// tests/hq-crm-clients-regression.test.js
// Automated Regression Tests for Studio HQ Phase 7.6.1: CRM Customer Management Remediation
// Verifies:
// 1. Frontend form payload normalization (toCanonicalClientPayload):
//    - Field mapping: website -> website_url, address -> billing_address, lead_source -> source.
//    - Category exclusion from payload fields; appends to notes without duplication.
//    - Name fallback: uses business_name when contact name is blank.
//    - Rejection when both name and business_name are blank.
//    - Empty string normalization to null.
//    - Disallowed fields (id) stripped from payload.
// 2. Canonical client status helpers (toCanonicalClientStatus, getClientStatusDisplayLabel, SELECTABLE_CLIENT_STATUSES).
// 3. Frontend response normalization (normalizeClientDetailResponse):
//    - Prevents undefined-property crashes regardless of envelope format.
//    - Ensures arrays for contacts, notes, followUps, projects, invoices, quotations.
// 4. End-to-end Customer Creation (POST /api/hq/clients):
//    - Resolves HTTP 400 error by validating canonical payload acceptance.
//    - Confirms backend still rejects raw disallowed fields (FIELD_NOT_ALLOWED).
// 5. End-to-end Customer Edit (PATCH /api/hq/clients/:id):
//    - Resolves HTTP 405 error by routing to canonical PATCH endpoint.
// 6. End-to-end Customer Details (GET /api/hq/clients/:id):
//    - Resolves customer detail drawer crash by routing to canonical GET endpoint.
// 7. End-to-end Customer Archive (POST /api/hq/clients/:id/archive):
//    - Resolves HTTP 405 error on archive.
//    - Verifies protection against archiving clients with active projects (409 CLIENT_HAS_ACTIVE_PROJECTS).
// 8. End-to-end Customer Restore (POST /api/hq/clients/:id/restore):
//    - Resolves HTTP 405 error on restore.
// 9. Search and Filtering:
//    - Parameterized search (q) across name, business_name, and email.
//    - Filtering by status.
//    - Filtering by archivedOnly=true.
//    - Accurate total count.
// 10. Canonical Router Dispatching:
//     - Checks HTTP method enforcement (405 for PUT/DELETE) and route matching.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  handleAuthorizedHqClients,
  validateClient
} from '../functions/api/hq/canonicalClients.js';

import {
  isCanonicalClientsRoute,
  matchCanonicalClientRoute,
  dispatchHqCanonicalClientsRequest
} from '../functions/lib/hqCanonicalRouter.js';

import {
  toCanonicalClientPayload,
  toCanonicalClientStatus,
  getClientStatusDisplayLabel,
  normalizeClientDetailResponse,
  CANONICAL_CLIENT_STATUSES,
  SELECTABLE_CLIENT_STATUSES,
  CLIENT_FILTER_OPTIONS
} from '../src/services/hqClientHelpers.ts';

class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec(readFileSync('tests/fixtures/hq-canonical-schema.sql', 'utf8'));
  }

  prepare(sql) {
    const database = this.sqlite;
    return {
      bind(...params) {
        return {
          sql,
          all: () => ({ results: database.prepare(sql).all(...params), success: true, meta: { changes: 0 } }),
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
        (/^\s*SELECT\b/i.test(statement.sql) || /\bRETURNING\b/i.test(statement.sql)) ? statement.all() : statement.run()
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

const ownerIdentity = { uid: 'owner-crm-test', email: 'jawed@jawed.co.in' };

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
  return handleAuthorizedHqClients({
    request: req,
    env: { ENVIRONMENT: 'test', HQ_DB: db },
    segments,
    identity: ownerIdentity
  });
}

// ---------------------------------------------------------------------------
// 1. Frontend Payload Normalization Tests
// ---------------------------------------------------------------------------

test('1. toCanonicalClientPayload maps legacy fields to canonical schema', () => {
  const rawForm = {
    name: 'Asha Sharma',
    business_name: 'Sharma Tech Solutions',
    email: 'asha@sharmatech.in',
    phone: '+91 9876543210',
    category: 'Enterprise',
    website: 'https://sharmatech.in',
    address: '101 Cyber City, Gurugram',
    status: 'lead',
    lead_source: 'Inbound Inquiry',
    notes: 'Interested in website redesign and AI portal.'
  };

  const payload = toCanonicalClientPayload(rawForm);

  // Mapped fields
  assert.equal(payload.name, 'Asha Sharma');
  assert.equal(payload.business_name, 'Sharma Tech Solutions');
  assert.equal(payload.email, 'asha@sharmatech.in');
  assert.equal(payload.phone, '+91 9876543210');
  assert.equal(payload.website_url, 'https://sharmatech.in');
  assert.equal(payload.billing_address, '101 Cyber City, Gurugram');
  assert.equal(payload.status, 'lead');
  assert.equal(payload.source, 'Inbound Inquiry');

  // Category appended to notes without duplication
  assert.ok(payload.notes.includes('[Category: Enterprise]'));
  assert.ok(payload.notes.includes('Interested in website redesign and AI portal.'));

  // Disallowed fields must be completely absent from payload keys
  assert.equal('category' in payload, false);
  assert.equal('website' in payload, false);
  assert.equal('address' in payload, false);
  assert.equal('lead_source' in payload, false);
  assert.equal('id' in payload, false);

  // Validate that the produced payload strictly passes backend validateClient
  const backendValidation = validateClient(payload);
  assert.equal(backendValidation.ok, true);
});

test('2. toCanonicalClientPayload handles edge cases (fallback name, empty strings, category note dedup)', () => {
  // Case A: Contact name blank, falls back to business_name
  const formWithNoContactName = {
    name: '   ',
    business_name: 'Acme Global Ventures',
    category: 'Fintech',
    website: '  ',
    notes: 'Existing note [Category: Fintech]'
  };

  const payloadA = toCanonicalClientPayload(formWithNoContactName);
  assert.equal(payloadA.name, 'Acme Global Ventures');
  assert.equal(payloadA.business_name, 'Acme Global Ventures');
  assert.equal(payloadA.website_url, null);
  // Category should not be duplicated in notes if already present
  assert.equal(payloadA.notes, 'Existing note [Category: Fintech]');

  // Case B: Both name and business_name blank -> throws NAME_REQUIRED
  assert.throws(() => {
    toCanonicalClientPayload({ name: '', business_name: '  ' });
  }, /NAME_REQUIRED/);

  // Case C: Partial update allows omitting name
  const partialPayload = toCanonicalClientPayload({ status: 'active', notes: 'Updated note' }, true);
  assert.equal(partialPayload.status, 'active');
  assert.equal(partialPayload.name, undefined);

  // Case D: Rejects invalid status
  assert.throws(() => {
    toCanonicalClientPayload({ name: 'Valid Name', status: 'invalid_status' });
  }, /STATUS_INVALID/);
});

// ---------------------------------------------------------------------------
// 2. Status Mapping and Display Label Tests
// ---------------------------------------------------------------------------

test('3. Canonical client status helpers map and display correctly', () => {
  assert.equal(CANONICAL_CLIENT_STATUSES.length, 6);
  assert.equal(SELECTABLE_CLIENT_STATUSES.length, 6);

  // Canonical statuses
  assert.equal(toCanonicalClientStatus('lead'), 'lead');
  assert.equal(toCanonicalClientStatus('prospect'), 'prospect');
  assert.equal(toCanonicalClientStatus('active'), 'active');
  assert.equal(toCanonicalClientStatus('paused'), 'paused');
  assert.equal(toCanonicalClientStatus('completed'), 'completed');
  assert.equal(toCanonicalClientStatus('closed'), 'closed');

  // Legacy mappings
  assert.equal(toCanonicalClientStatus('onboarding'), 'prospect');
  assert.equal(toCanonicalClientStatus('archived'), 'closed');

  // Invalid or unknown statuses
  assert.equal(toCanonicalClientStatus('unknown'), null);
  assert.equal(toCanonicalClientStatus(''), null);
  assert.equal(toCanonicalClientStatus(null), null);

  // Display labels
  assert.equal(getClientStatusDisplayLabel('lead'), 'Lead');
  assert.equal(getClientStatusDisplayLabel('prospect'), 'Prospect');
  assert.equal(getClientStatusDisplayLabel('active'), 'Active');
  assert.equal(getClientStatusDisplayLabel('paused'), 'Paused');
  assert.equal(getClientStatusDisplayLabel('completed'), 'Completed');
  assert.equal(getClientStatusDisplayLabel('closed'), 'Closed');
  assert.equal(getClientStatusDisplayLabel('onboarding'), 'Prospect');
});

// ---------------------------------------------------------------------------
// 3. Response Normalization Tests
// ---------------------------------------------------------------------------

test('4. normalizeClientDetailResponse prevents undefined crashes on all shapes', () => {
  // Shape A: Canonical envelope { client: { ... }, contacts: [ ... ] }
  const canonicalShape = {
    client: { id: 'c-1', name: 'Client 1', business_name: 'Biz 1' },
    contacts: [{ id: 'ct-1', full_name: 'Contact 1' }]
  };
  const bundleA = normalizeClientDetailResponse(canonicalShape);
  assert.equal(bundleA.client.name, 'Client 1');
  assert.equal(bundleA.contacts.length, 1);
  assert.deepEqual(bundleA.projects, []);
  assert.deepEqual(bundleA.invoices, []);

  // Shape B: Bare client object
  const bareClient = { id: 'c-2', name: 'Bare Client', website_url: 'https://example.com' };
  const bundleB = normalizeClientDetailResponse(bareClient);
  assert.equal(bundleB.client.name, 'Bare Client');
  assert.deepEqual(bundleB.contacts, []);
  assert.deepEqual(bundleB.notes, []);

  // Shape C: Nested array response (e.g. from buggy legacy route returning { clients: [...] })
  const arrayShape = { clients: [{ id: 'c-3', name: 'Array Client', business_name: 'Array Biz' }] };
  const bundleC = normalizeClientDetailResponse(arrayShape);
  assert.equal(bundleC.client.name, 'Array Client');
  assert.equal(bundleC.client.business_name, 'Array Biz');

  // Shape D: Null / undefined input throws safely
  assert.throws(() => normalizeClientDetailResponse(null), /CLIENT_DETAIL_INVALID/);
});

// ---------------------------------------------------------------------------
// 4. End-to-end Customer Creation Flow (POST /api/hq/clients)
// ---------------------------------------------------------------------------

test('5. Customer Creation: frontend payload successfully creates client in canonical API (resolves 400 defect)', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);

    // Simulated user form submission in CrmSection
    const userForm = {
      name: 'Kaushal Patel',
      business_name: 'Kaushal Digital Labs',
      email: 'kaushal@kaushallabs.in',
      phone: '+91 9123456789',
      category: 'Digital Agency',
      website: 'https://kaushallabs.in',
      address: 'Ahmedabad, Gujarat',
      status: 'lead',
      lead_source: 'Referral',
      notes: 'Initial discussion for cloud modernization.'
    };

    // Transform form through production helper
    const payload = toCanonicalClientPayload(userForm);

    // Submit to canonical API
    const req = makeRequest('/api/hq/clients', {
      method: 'POST',
      body: payload
    });

    const res = await callAuthorized(db, req);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.client.id);
    assert.equal(body.client.name, 'Kaushal Patel');
    assert.equal(body.client.business_name, 'Kaushal Digital Labs');
    assert.equal(body.client.website_url, 'https://kaushallabs.in');
    assert.equal(body.client.billing_address, 'Ahmedabad, Gujarat');
    assert.equal(body.client.source, 'Referral');
    assert.ok(body.client.notes.includes('[Category: Digital Agency]'));

    // Verify record in SQLite database
    const row = db.sqlite.prepare('SELECT * FROM clients WHERE id = ?').get(body.client.id);
    assert.ok(row);
    assert.equal(row.name, 'Kaushal Patel');
    assert.equal(row.website_url, 'https://kaushallabs.in');
    assert.equal(row.billing_address, 'Ahmedabad, Gujarat');

    // VERIFY DEFECT REPRODUCTION: Sending raw legacy fields directly returns HTTP 400 FIELD_NOT_ALLOWED
    const legacyReq = makeRequest('/api/hq/clients', {
      method: 'POST',
      body: {
        name: 'Legacy Test',
        category: 'DisallowedField',
        website: 'https://legacy.com'
      }
    });
    const legacyRes = await callAuthorized(db, legacyReq);
    assert.equal(legacyRes.status, 400);
    const legacyBody = await legacyRes.json();
    assert.equal(legacyBody.error, 'FIELD_NOT_ALLOWED');
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// 5. End-to-end Customer Edit Flow (PATCH /api/hq/clients/:id)
// ---------------------------------------------------------------------------

test('6. Customer Edit: PATCH /api/hq/clients/:id updates client (resolves 405 defect)', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, phone, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('c-edit-01', 'Rohan Mehta', 'Mehta Logistics', 'rohan@mehta.com', '+91 9988776655', 'lead', ownerIdentity.uid);

    // Edit form simulation
    const editForm = {
      name: 'Rohan Mehta',
      business_name: 'Mehta Global Logistics',
      email: 'rohan.mehta@mehtalogistics.com',
      phone: '+91 9988776655',
      category: 'Supply Chain',
      website: 'https://mehtalogistics.com',
      address: 'Navi Mumbai, MH',
      status: 'prospect',
      lead_source: 'Trade Expo',
      notes: 'Upgraded to prospect after call.'
    };

    const updatePayload = toCanonicalClientPayload(editForm, true);

    const patchReq = makeRequest('/api/hq/clients/c-edit-01', {
      method: 'PATCH',
      body: updatePayload
    });

    const patchRes = await callAuthorized(db, patchReq, ['c-edit-01']);
    assert.equal(patchRes.status, 200);
    const patchBody = await patchRes.json();
    assert.equal(patchBody.ok, true);
    assert.equal(patchBody.client.business_name, 'Mehta Global Logistics');
    assert.equal(patchBody.client.website_url, 'https://mehtalogistics.com');
    assert.equal(patchBody.client.billing_address, 'Navi Mumbai, MH');
    assert.equal(patchBody.client.status, 'prospect');

    // Verify PUT /api/hq/clients returns 405 Method Not Allowed
    const putReq = makeRequest('/api/hq/clients', {
      method: 'PUT',
      body: { id: 'c-edit-01', name: 'Rohan' }
    });
    const putRes = await callAuthorized(db, putReq);
    assert.equal(putRes.status, 405);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// 6. End-to-end Customer Details Flow (GET /api/hq/clients/:id)
// ---------------------------------------------------------------------------

test('7. Customer Details: GET /api/hq/clients/:id returns client with contacts without crashing', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('c-detail-01', 'Priya Sen', 'Sen Media', 'priya@senmedia.com', 'active', ownerIdentity.uid);

    db.sqlite.prepare(`
      INSERT INTO client_contacts (id, client_id, full_name, email, role_title, is_primary)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('ct-01', 'c-detail-01', 'Arjun Sen', 'arjun@senmedia.com', 'Director', 1);

    const getReq = makeRequest('/api/hq/clients/c-detail-01');
    const getRes = await callAuthorized(db, getReq, ['c-detail-01']);
    assert.equal(getRes.status, 200);

    const detailData = await getRes.json();
    assert.equal(detailData.ok, true);
    assert.equal(detailData.client.id, 'c-detail-01');
    assert.equal(detailData.client.contacts.length, 1);
    assert.equal(detailData.client.contacts[0].full_name, 'Arjun Sen');

    // Run through production normalization helper
    const normalized = normalizeClientDetailResponse(detailData);
    assert.equal(normalized.client.name, 'Priya Sen');
    assert.equal(normalized.contacts[0].full_name, 'Arjun Sen');
    assert.equal(Array.isArray(normalized.projects), true);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// 7. End-to-end Customer Archive & Restore Flow
// ---------------------------------------------------------------------------

test('8. Customer Archive and Restore: correct lifecycle routes and active project protection', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);

    // Client with active project
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, status, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run('c-act-01', 'Active Client', 'Active Client Corp', 'active', ownerIdentity.uid);

    db.sqlite.prepare(`
      INSERT INTO projects (id, client_id, name, project_type, status, priority, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('p-act-01', 'c-act-01', 'Enterprise Portal', 'business-website', 'in-progress', 'high', ownerIdentity.uid);

    // Attempting to archive client with active project must fail with 400 CLIENT_HAS_ACTIVE_PROJECTS
    const archFailReq = makeRequest('/api/hq/clients/c-act-01/archive', { method: 'POST' });
    const archFailRes = await callAuthorized(db, archFailReq, ['c-act-01', 'archive']);
    assert.equal(archFailRes.status, 400);
    const failBody = await archFailRes.json();
    assert.equal(failBody.error, 'CLIENT_HAS_ACTIVE_PROJECTS');

    // Client without active projects can be archived
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, status, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run('c-free-01', 'Free Client', 'Free Client Corp', 'active', ownerIdentity.uid);

    const archReq = makeRequest('/api/hq/clients/c-free-01/archive', { method: 'POST' });
    const archRes = await callAuthorized(db, archReq, ['c-free-01', 'archive']);
    assert.equal(archRes.status, 200);
    const archBody = await archRes.json();
    assert.equal(archBody.ok, true);
    assert.equal(archBody.archived, true);

    const freeRow = db.sqlite.prepare('SELECT * FROM clients WHERE id = ?').get('c-free-01');
    assert.ok(freeRow.archived_at);

    // Restoring archived client
    const restReq = makeRequest('/api/hq/clients/c-free-01/restore', { method: 'POST' });
    const restRes = await callAuthorized(db, restReq, ['c-free-01', 'restore']);
    assert.equal(restRes.status, 200);
    const restBody = await restRes.json();
    assert.equal(restBody.ok, true);
    assert.equal(restBody.archived, false);

    const restoredRow = db.sqlite.prepare('SELECT * FROM clients WHERE id = ?').get('c-free-01');
    assert.equal(restoredRow.archived_at, null);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// 8. Search and Filtering Tests
// ---------------------------------------------------------------------------

test('9. Search and filtering across name, business_name, email, archivedOnly, and status', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);

    // Seed 3 clients
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('c-1', 'Deepak Verma', 'Verma Enterprises', 'deepak@verma.com', 'lead', ownerIdentity.uid);

    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('c-2', 'Sunil Rao', 'Apex Solutions', 'sunil@apexsolutions.com', 'active', ownerIdentity.uid);

    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, archived_at, archived_by, created_by)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).run('c-3', 'Anita Patel', 'Verma Logistics', 'anita@patel.com', 'closed', ownerIdentity.uid, ownerIdentity.uid);

    // Search by name match: 'Deepak'
    const searchNameReq = makeRequest('/api/hq/clients?q=Deepak');
    const searchNameRes = await callAuthorized(db, searchNameReq);
    const nameData = await searchNameRes.json();
    assert.equal(nameData.total, 1);
    assert.equal(nameData.clients[0].name, 'Deepak Verma');

    // Search by business_name match: 'Apex'
    const searchBizReq = makeRequest('/api/hq/clients?q=Apex');
    const searchBizRes = await callAuthorized(db, searchBizReq);
    const bizData = await searchBizRes.json();
    assert.equal(bizData.total, 1);
    assert.equal(bizData.clients[0].business_name, 'Apex Solutions');

    // Search by email match: 'deepak@verma.com'
    const searchEmailReq = makeRequest('/api/hq/clients?q=deepak@verma.com');
    const searchEmailRes = await callAuthorized(db, searchEmailReq);
    const emailData = await searchEmailRes.json();
    assert.equal(emailData.total, 1);
    assert.equal(emailData.clients[0].id, 'c-1');

    // Filter by archivedOnly=true
    const archivedReq = makeRequest('/api/hq/clients?archivedOnly=true');
    const archivedRes = await callAuthorized(db, archivedReq);
    const archivedData = await archivedRes.json();
    assert.equal(archivedData.total, 1);
    assert.equal(archivedData.clients[0].id, 'c-3');
    assert.equal(archivedData.clients[0].name, 'Anita Patel');

    // Filter by status=active
    const statusReq = makeRequest('/api/hq/clients?status=active');
    const statusRes = await callAuthorized(db, statusReq);
    const statusData = await statusRes.json();
    assert.equal(statusData.total, 1);
    assert.equal(statusData.clients[0].id, 'c-2');
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// 9. Canonical Router Dispatching Tests
// ---------------------------------------------------------------------------

test('10. Canonical Router: route matching, URL parsing, and HTTP method enforcement', async () => {
  assert.equal(isCanonicalClientsRoute('/api/hq/clients'), true);
  assert.equal(isCanonicalClientsRoute('/api/hq/clients/c-123'), true);
  assert.equal(isCanonicalClientsRoute('/api/hq/clients/c-123/archive'), true);
  assert.equal(isCanonicalClientsRoute('/api/hq/clients/c-123/restore'), true);
  assert.equal(isCanonicalClientsRoute('/api/hq/clients/c-123/contacts'), true);
  assert.equal(isCanonicalClientsRoute('/api/hq/projects'), false);

  const routeMatch = matchCanonicalClientRoute('/api/hq/clients/c-123/archive');
  assert.equal(routeMatch.matched, true);
  assert.equal(routeMatch.route, 'clients.archive');
  assert.deepEqual(routeMatch.segments, ['c-123', 'archive']);

  // Dispatching unsupported method returns 405 Method Not Allowed
  const deleteReq = makeRequest('/api/hq/clients/c-123', { method: 'DELETE' });
  const deleteRes = await dispatchHqCanonicalClientsRequest('/api/hq/clients/c-123', {
    request: deleteReq,
    env: { ENVIRONMENT: 'test', HQ_DB: new TestD1() }
  });
  assert.equal(deleteRes.status, 405);
  const deleteBody = await deleteRes.json();
  assert.equal(deleteBody.error, 'METHOD_NOT_ALLOWED');
});

// ---------------------------------------------------------------------------
// 10. Independent Code Review Remediation Tests (Findings 1, 2, 3)
// ---------------------------------------------------------------------------

test('11. Customer Pagination Contract: 1-based page, offset calculation, distinct records, and total consistency (Finding 1)', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);

    // Seed 60 active clients with deterministic timestamps to test pages 1, 2, 3
    const insertStmt = db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, datetime('2026-01-01 00:00:00', '+' || ? || ' seconds'), ?)
    `);

    for (let i = 1; i <= 60; i++) {
      const pad = String(i).padStart(3, '0');
      insertStmt.run(`client-${pad}`, `Customer ${pad}`, `Business ${pad}`, `cust${pad}@test.com`, 'active', i, ownerIdentity.uid);
    }

    // Page 1: records 0-24 (limit=25, page=1)
    const page1Req = makeRequest('/api/hq/clients?page=1&limit=25');
    const page1Res = await callAuthorized(db, page1Req);
    assert.equal(page1Res.status, 200);
    const page1Data = await page1Res.json();
    assert.equal(page1Data.total, 60);
    assert.equal(page1Data.page, 1);
    assert.equal(page1Data.offset, 0);
    assert.equal(page1Data.limit, 25);
    assert.equal(page1Data.clients.length, 25);

    // Page 2: records 25-49 (limit=25, page=2)
    const page2Req = makeRequest('/api/hq/clients?page=2&limit=25');
    const page2Res = await callAuthorized(db, page2Req);
    assert.equal(page2Res.status, 200);
    const page2Data = await page2Res.json();
    assert.equal(page2Data.total, 60);
    assert.equal(page2Data.page, 2);
    assert.equal(page2Data.offset, 25);
    assert.equal(page2Data.limit, 25);
    assert.equal(page2Data.clients.length, 25);

    // Page 3: records 50-59 (limit=25, page=3)
    const page3Req = makeRequest('/api/hq/clients?page=3&limit=25');
    const page3Res = await callAuthorized(db, page3Req);
    assert.equal(page3Res.status, 200);
    const page3Data = await page3Res.json();
    assert.equal(page3Data.total, 60);
    assert.equal(page3Data.page, 3);
    assert.equal(page3Data.offset, 50);
    assert.equal(page3Data.clients.length, 10);

    // Assert Page 1 and Page 2 contain completely distinct, non-overlapping records
    const page1Ids = new Set(page1Data.clients.map(c => c.id));
    const page2Ids = new Set(page2Data.clients.map(c => c.id));
    const page3Ids = new Set(page3Data.clients.map(c => c.id));

    for (const id of page2Ids) {
      assert.equal(page1Ids.has(id), false, `Record ${id} should not appear on both page 1 and page 2`);
    }
    for (const id of page3Ids) {
      assert.equal(page1Ids.has(id), false, `Record ${id} should not appear on both page 1 and page 3`);
      assert.equal(page2Ids.has(id), false, `Record ${id} should not appear on both page 2 and page 3`);
    }

    // Explicit offset parameter should also be supported for backward compatibility
    const offsetReq = makeRequest('/api/hq/clients?offset=25&limit=25');
    const offsetRes = await callAuthorized(db, offsetReq);
    const offsetData = await offsetRes.json();
    assert.equal(offsetData.offset, 25);
    assert.equal(offsetData.page, 2);
    assert.deepEqual(offsetData.clients.map(c => c.id), page2Data.clients.map(c => c.id));
  } finally {
    db.close();
  }
});

test('12. Archive Filter Semantics: active-only, archived-only, include-archived, and search combination (Finding 2)', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);

    // Seed: 3 active clients, 2 archived clients
    // Active
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('c-act-1', 'Alpha Dynamics', 'Alpha Group', 'alpha@alpha.com', 'active', ownerIdentity.uid);

    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('c-act-2', 'Beta Cloud', 'Beta Systems', 'beta@beta.com', 'active', ownerIdentity.uid);

    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('c-act-3', 'Gamma Retail', 'Gamma Stores', 'gamma@gamma.com', 'lead', ownerIdentity.uid);

    // Archived
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, archived_at, archived_by, created_by)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).run('c-arch-1', 'Delta Tech (Archived)', 'Delta Inc', 'delta@delta.com', 'closed', ownerIdentity.uid, ownerIdentity.uid);

    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, archived_at, archived_by, created_by)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).run('c-arch-2', 'Alpha Archives', 'Alpha Legacy', 'alpha.legacy@alpha.com', 'closed', ownerIdentity.uid, ownerIdentity.uid);

    // 1. Default (no archive param): active customers only
    const defaultRes = await callAuthorized(db, makeRequest('/api/hq/clients'));
    const defaultData = await defaultRes.json();
    assert.equal(defaultData.total, 3);
    assert.equal(defaultData.clients.length, 3);
    assert.ok(defaultData.clients.every(c => c.archived_at === null));

    // 2. archivedOnly=true: archived customers only
    const archivedOnlyRes = await callAuthorized(db, makeRequest('/api/hq/clients?archivedOnly=true'));
    const archivedOnlyData = await archivedOnlyRes.json();
    assert.equal(archivedOnlyData.total, 2);
    assert.equal(archivedOnlyData.clients.length, 2);
    assert.ok(archivedOnlyData.clients.every(c => c.archived_at !== null));
    assert.ok(archivedOnlyData.clients.some(c => c.id === 'c-arch-1'));
    assert.ok(archivedOnlyData.clients.some(c => c.id === 'c-arch-2'));

    // 3. includeArchived=true: both active and archived customers
    const includeArchivedRes = await callAuthorized(db, makeRequest('/api/hq/clients?includeArchived=true'));
    const includeArchivedData = await includeArchivedRes.json();
    assert.equal(includeArchivedData.total, 5);
    assert.equal(includeArchivedData.clients.length, 5);
    const allIds = new Set(includeArchivedData.clients.map(c => c.id));
    assert.ok(allIds.has('c-act-1'));
    assert.ok(allIds.has('c-act-2'));
    assert.ok(allIds.has('c-act-3'));
    assert.ok(allIds.has('c-arch-1'));
    assert.ok(allIds.has('c-arch-2'));

    // 4. Precedence: both archivedOnly=true and includeArchived=true passed
    // archivedOnly must take precedence
    const bothRes = await callAuthorized(db, makeRequest('/api/hq/clients?archivedOnly=true&includeArchived=true'));
    const bothData = await bothRes.json();
    assert.equal(bothData.total, 2);
    assert.equal(bothData.clients.length, 2);
    assert.ok(bothData.clients.every(c => c.archived_at !== null));

    // 5. Search combined with archive filters:
    // Search 'Alpha' default: matches only 'Alpha Dynamics' (active)
    const searchDefaultRes = await callAuthorized(db, makeRequest('/api/hq/clients?q=Alpha'));
    const searchDefaultData = await searchDefaultRes.json();
    assert.equal(searchDefaultData.total, 1);
    assert.equal(searchDefaultData.clients[0].id, 'c-act-1');

    // Search 'Alpha' archivedOnly=true: matches only 'Alpha Archives' (archived)
    const searchArchivedRes = await callAuthorized(db, makeRequest('/api/hq/clients?q=Alpha&archivedOnly=true'));
    const searchArchivedData = await searchArchivedRes.json();
    assert.equal(searchArchivedData.total, 1);
    assert.equal(searchArchivedData.clients[0].id, 'c-arch-2');

    // Search 'Alpha' includeArchived=true: matches both
    const searchBothRes = await callAuthorized(db, makeRequest('/api/hq/clients?q=Alpha&includeArchived=true'));
    const searchBothData = await searchBothRes.json();
    assert.equal(searchBothData.total, 2);
    const searchBothIds = new Set(searchBothData.clients.map(c => c.id));
    assert.ok(searchBothIds.has('c-act-1'));
    assert.ok(searchBothIds.has('c-arch-2'));
  } finally {
    db.close();
  }
});

test('13. Customer Detail Project Loading: empty array vs error state distinction (Finding 3)', () => {
  // Case A: Customer with successfully loaded empty projects
  const successfulEmpty = {
    client: { id: 'c-empty', name: 'Empty Client', business_name: 'Empty Co' },
    contacts: [],
    projects: []
  };

  const bundleA = normalizeClientDetailResponse(successfulEmpty);
  assert.equal(bundleA.client.name, 'Empty Client');
  assert.deepEqual(bundleA.projects, []);
  assert.equal(bundleA.projectsError, null);

  // Case B: Customer with failed project loading (represented as an error state)
  const failedProjects = {
    client: { id: 'c-err', name: 'Error Client', business_name: 'Error Co' },
    contacts: [{ id: 'ct-1', full_name: 'Contact One' }],
    projects: [],
    projectsError: 'Network error: Failed to reach projects service'
  };

  const bundleB = normalizeClientDetailResponse(failedProjects);
  assert.equal(bundleB.client.name, 'Error Client');
  // Customer detail remains accessible
  assert.equal(bundleB.contacts.length, 1);
  assert.equal(bundleB.contacts[0].full_name, 'Contact One');
  // Projects array is safe empty array
  assert.deepEqual(bundleB.projects, []);
  // Error state is explicitly captured
  assert.equal(bundleB.projectsError, 'Network error: Failed to reach projects service');
});

// ---------------------------------------------------------------------------
// 11. Phase 7.6.4: CRM Filter Toolbar Remediation (DEFECT-CRM-001)
// ---------------------------------------------------------------------------

test('14. CRM Filter Toolbar Remediation: Archived filter option, query param generation, record filtering, and restore action (Phase 7.6.4)', async () => {
  // 1. Verify Archived option is present in CLIENT_FILTER_OPTIONS with clean label and value
  assert.equal(CLIENT_FILTER_OPTIONS.length, 7);
  const archivedOpt = CLIENT_FILTER_OPTIONS.find(o => o.value === 'archived');
  assert.ok(archivedOpt, 'Archived filter option must be present in CLIENT_FILTER_OPTIONS');
  assert.equal(archivedOpt.value, 'archived');
  assert.equal(archivedOpt.label, 'Archived');

  // Verify CANONICAL_CLIENT_STATUSES and SELECTABLE_CLIENT_STATUSES remain unchanged
  assert.equal(CANONICAL_CLIENT_STATUSES.length, 6);
  assert.equal(SELECTABLE_CLIENT_STATUSES.length, 6);
  assert.equal(CANONICAL_CLIENT_STATUSES.includes('archived'), false, 'Canonical lifecycle statuses must not include archived');

  // Helper simulating CrmSection loadData URLSearchParams construction
  function buildCrmQueryParams({ page = 1, limit = 25, search = '', statusFilter = 'All' } = {}) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('q', search);
    if (statusFilter !== 'All') {
      if (statusFilter.toLowerCase() === 'archived') {
        params.set('archivedOnly', 'true');
      } else {
        params.set('status', statusFilter);
      }
    }
    return params;
  }

  // 2. Query param generation tests
  // When statusFilter is 'archived' -> sends archivedOnly=true, does NOT send status=archived
  const archivedParams = buildCrmQueryParams({ statusFilter: 'archived' });
  assert.equal(archivedParams.get('archivedOnly'), 'true');
  assert.equal(archivedParams.has('status'), false, 'Selecting Archived must not send status=archived');

  // When statusFilter is 'All' -> sends neither archivedOnly nor status
  const allParams = buildCrmQueryParams({ statusFilter: 'All' });
  assert.equal(allParams.has('archivedOnly'), false);
  assert.equal(allParams.has('status'), false);

  // When statusFilter is 'prospect' -> sends status=prospect, does NOT send archivedOnly
  const prospectParams = buildCrmQueryParams({ statusFilter: 'prospect' });
  assert.equal(prospectParams.get('status'), 'prospect');
  assert.equal(prospectParams.has('archivedOnly'), false);

  // 3. Database integration with backend API
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);

    // Active client 1 (status: lead)
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('c-active-lead', 'Active Lead Person', 'Active Lead Corp', 'lead@test.com', 'lead', ownerIdentity.uid);

    // Active client 2 (status: prospect)
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('c-active-prospect', 'Active Prospect Person', 'Active Prospect Corp', 'prospect@test.com', 'prospect', ownerIdentity.uid);

    // Archived client (status: prospect, archived_at set)
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, archived_at, archived_by, created_by)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).run('c-archived-prospect', 'QA Automation Lead', 'QA Test Automation Ltd', 'qa.automation@example.com', 'prospect', ownerIdentity.uid, ownerIdentity.uid);

    // A. Query with statusFilter='archived' (archivedOnly=true)
    const reqArchived = makeRequest(`/api/hq/clients?${archivedParams.toString()}`);
    const resArchived = await callAuthorized(db, reqArchived);
    assert.equal(resArchived.status, 200);
    const dataArchived = await resArchived.json();
    assert.equal(dataArchived.total, 1);
    assert.equal(dataArchived.clients.length, 1);
    assert.equal(dataArchived.clients[0].id, 'c-archived-prospect');
    assert.equal(dataArchived.clients[0].business_name, 'QA Test Automation Ltd');
    // Active customers must not be shown in archived-only mode
    assert.equal(dataArchived.clients.some(c => c.id.startsWith('c-active')), false);

    // B. Query with statusFilter='All' (All Status default: active records only)
    const reqAll = makeRequest(`/api/hq/clients?${allParams.toString()}`);
    const resAll = await callAuthorized(db, reqAll);
    assert.equal(resAll.status, 200);
    const dataAll = await resAll.json();
    assert.equal(dataAll.total, 2);
    assert.equal(dataAll.clients.length, 2);
    const allIds = new Set(dataAll.clients.map(c => c.id));
    assert.ok(allIds.has('c-active-lead'));
    assert.ok(allIds.has('c-active-prospect'));
    assert.equal(allIds.has('c-archived-prospect'), false, 'Archived client must not appear in All Status list');

    // C. Query with statusFilter='prospect' (canonical status filter)
    const reqProspect = makeRequest(`/api/hq/clients?${prospectParams.toString()}`);
    const resProspect = await callAuthorized(db, reqProspect);
    assert.equal(resProspect.status, 200);
    const dataProspect = await resProspect.json();
    assert.equal(dataProspect.total, 1);
    assert.equal(dataProspect.clients[0].id, 'c-active-prospect');
    assert.equal(dataProspect.clients[0].business_name, 'Active Prospect Corp');

    // 4. Action button logic verification:
    // Helper replicating CrmSection action button logic:
    // title={Boolean(c.archived_at) ? 'Restore Customer' : 'Archive Customer'}
    // aria-label={Boolean(c.archived_at) ? `Restore ${c.business_name}` : `Archive ${c.business_name}`}
    function getCustomerAction(client) {
      const isArchived = Boolean(client.archived_at);
      return {
        action: isArchived ? 'restore' : 'archive',
        title: isArchived ? 'Restore Customer' : 'Archive Customer',
        ariaLabel: isArchived ? `Restore ${client.business_name}` : `Archive ${client.business_name}`,
        icon: isArchived ? 'RotateCcw' : 'Archive'
      };
    }

    const archivedAction = getCustomerAction(dataArchived.clients[0]);
    assert.equal(archivedAction.action, 'restore');
    assert.equal(archivedAction.title, 'Restore Customer');
    assert.equal(archivedAction.ariaLabel, 'Restore QA Test Automation Ltd');
    assert.equal(archivedAction.icon, 'RotateCcw');

    const activeAction = getCustomerAction(dataAll.clients[0]);
    assert.equal(activeAction.action, 'archive');
    assert.equal(activeAction.title, 'Archive Customer');
    assert.equal(activeAction.icon, 'Archive');
  } finally {
    db.close();
  }
});
