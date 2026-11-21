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
  SELECTABLE_CLIENT_STATUSES
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
