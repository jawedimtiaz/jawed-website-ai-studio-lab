// tests/hq-canonical-clients.test.js
// Isolated automated tests for canonical Studio HQ Clients API
// Strictly tests canonical schema, validation, lifecycle, security, and append-only audit triggers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  validateClient,
  validateContact,
  handleAuthorizedHqClients,
  handleHqClients
} from '../functions/api/hq/canonicalClients.js';

import {
  isCanonicalClientsRoute,
  matchCanonicalClientRoute,
  dispatchHqCanonicalClientsRequest
} from '../functions/lib/hqCanonicalRouter.js';

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

const ownerIdentity = { uid: 'owner-client-test', email: 'jawed@jawed.co.in' };

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
// Unit Tests: Payload Validation
// ---------------------------------------------------------------------------

test('1. Validates canonical client payload constraints', () => {
  // Valid client
  const valid = validateClient({
    name: 'Acme Corporation',
    client_code: 'CLI-001',
    business_name: 'Acme Corp Pvt Ltd',
    status: 'lead',
    email: 'contact@acme.com',
    phone: '+91 9876543210',
    website_url: 'https://acme.com',
    billing_address: '123 Tech Park, Bangalore',
    notes: 'Key prospect for enterprise overhaul',
    source: 'Referral'
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.name, 'Acme Corporation');
  assert.equal(valid.value.status, 'lead');

  // Name required on creation
  assert.deepEqual(validateClient({ status: 'lead' }), {
    ok: false,
    error: 'NAME_REQUIRED'
  });
  assert.deepEqual(validateClient({ name: '   ' }), {
    ok: false,
    error: 'NAME_REQUIRED'
  });

  // Rejects invalid status
  assert.deepEqual(validateClient({ name: 'Valid Name', status: 'unknown_status' }), {
    ok: false,
    error: 'STATUS_INVALID'
  });

  // Rejects legacy disallowed fields (e.g. category, website, address)
  assert.deepEqual(validateClient({ name: 'Valid Name', category: 'Enterprise' }), {
    ok: false,
    error: 'FIELD_NOT_ALLOWED'
  });
  assert.deepEqual(validateClient({ name: 'Valid Name', website: 'https://acme.com' }), {
    ok: false,
    error: 'FIELD_NOT_ALLOWED'
  });
  assert.deepEqual(validateClient({ name: 'Valid Name', address: 'Bangalore' }), {
    ok: false,
    error: 'FIELD_NOT_ALLOWED'
  });

  // Text length overflow
  assert.deepEqual(validateClient({ name: 'A'.repeat(161) }), {
    ok: false,
    error: 'NAME_TOO_LONG'
  });
  assert.deepEqual(validateClient({ name: 'Valid', client_code: 'C'.repeat(41) }), {
    ok: false,
    error: 'CLIENT_CODE_TOO_LONG'
  });

  // Partial update validation allows omitted name
  const partialValid = validateClient({ status: 'active' }, true);
  assert.equal(partialValid.ok, true);
  assert.equal(partialValid.value.status, 'active');
});

test('2. Validates canonical contact payload constraints', () => {
  const valid = validateContact({
    full_name: 'John Doe',
    role_title: 'CTO',
    email: 'john@acme.com',
    phone: '+91 9999999999',
    is_primary: true,
    notes: 'Direct decision maker'
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.full_name, 'John Doe');
  assert.equal(valid.value.is_primary, 1);

  // Full name required
  assert.deepEqual(validateContact({ role_title: 'Developer' }), {
    ok: false,
    error: 'FULL_NAME_REQUIRED'
  });

  // Disallowed fields
  assert.deepEqual(validateContact({ full_name: 'Jane', department: 'Engineering' }), {
    ok: false,
    error: 'FIELD_NOT_ALLOWED'
  });

  // Invalid is_primary
  assert.deepEqual(validateContact({ full_name: 'Jane', is_primary: 'yes' }), {
    ok: false,
    error: 'IS_PRIMARY_INVALID'
  });
});

// ---------------------------------------------------------------------------
// Integration Tests: Client Lifecycle with In-Memory Canonical D1
// ---------------------------------------------------------------------------

test('3. Full client lifecycle: create, list, retrieve, update, archive and restore', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);

    // 1. Create client
    const createReq = makeRequest('/api/hq/clients', {
      method: 'POST',
      body: {
        name: 'Nexus Dynamics',
        client_code: 'NEX-001',
        business_name: 'Nexus Dynamics LLP',
        status: 'prospect',
        email: 'info@nexus.io',
        phone: '+1 555 123 4567',
        website_url: 'https://nexus.io',
        billing_address: 'Austin, TX',
        notes: 'High-growth startup client',
        source: 'Outbound'
      }
    });
    const createRes = await callAuthorized(db, createReq);
    assert.equal(createRes.status, 201);
    const createdData = await createRes.json();
    assert.equal(createdData.ok, true);
    const clientId = createdData.client.id;
    assert.ok(clientId);
    assert.equal(createdData.client.name, 'Nexus Dynamics');
    assert.equal(createdData.client.client_code, 'NEX-001');

    // Verify audit log entry
    const auditRows = db.sqlite.prepare('SELECT * FROM audit_logs WHERE entity_id = ?').all(clientId);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].action, 'client.create');
    assert.equal(auditRows[0].entity_type, 'client');

    // 2. List clients
    const listReq = makeRequest('/api/hq/clients');
    const listRes = await callAuthorized(db, listReq);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.ok, true);
    assert.equal(listData.clients.length, 1);
    assert.equal(listData.clients[0].id, clientId);
    assert.equal(listData.clients[0].name, 'Nexus Dynamics');

    // 3. Get client by ID
    const getReq = makeRequest(`/api/hq/clients/${clientId}`);
    const getRes = await callAuthorized(db, getReq, [clientId]);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.ok, true);
    assert.equal(getData.client.id, clientId);
    assert.equal(getData.client.contacts.length, 0);

    // 4. Update client
    const updateReq = makeRequest(`/api/hq/clients/${clientId}`, {
      method: 'PATCH',
      body: { status: 'active', notes: 'Contract executed, onboarding in progress' }
    });
    const updateRes = await callAuthorized(db, updateReq, [clientId]);
    assert.equal(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.equal(updateData.ok, true);
    assert.equal(updateData.client.status, 'active');
    assert.equal(updateData.client.notes, 'Contract executed, onboarding in progress');

    // Verify update audit log
    const auditUpdate = db.sqlite.prepare('SELECT * FROM audit_logs WHERE entity_id = ? AND action = ?').all(clientId, 'client.update');
    assert.equal(auditUpdate.length, 1);

    // 5. Archive client
    const archiveReq = makeRequest(`/api/hq/clients/${clientId}/archive`, { method: 'POST' });
    const archiveRes = await callAuthorized(db, archiveReq, [clientId, 'archive']);
    assert.equal(archiveRes.status, 200);
    const archiveData = await archiveRes.json();
    assert.equal(archiveData.ok, true);
    assert.equal(archiveData.archived, true);

    // Verify client is excluded from default active list
    const activeList = await (await callAuthorized(db, makeRequest('/api/hq/clients'))).json();
    assert.equal(activeList.clients.length, 0);

    // Visible when requesting archivedOnly=true
    const archivedList = await (await callAuthorized(db, makeRequest('/api/hq/clients?archivedOnly=true'))).json();
    assert.equal(archivedList.clients.length, 1);
    assert.equal(archivedList.clients[0].id, clientId);

    // 6. Restore client
    const restoreReq = makeRequest(`/api/hq/clients/${clientId}/restore`, { method: 'POST' });
    const restoreRes = await callAuthorized(db, restoreReq, [clientId, 'restore']);
    assert.equal(restoreRes.status, 200);
    const restoreData = await restoreRes.json();
    assert.equal(restoreData.ok, true);
    assert.equal(restoreData.archived, false);

    // Re-appears in active list
    const restoredList = await (await callAuthorized(db, makeRequest('/api/hq/clients'))).json();
    assert.equal(restoredList.clients.length, 1);

    // Total audit logs recorded = 4 (create, update, archive, restore)
    const totalAudits = db.sqlite.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;
    assert.equal(totalAudits, 4);
  } finally {
    db.close();
  }
});

test('4. Active projects protection prevents archiving client with unarchived projects', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);

    // Insert client
    db.sqlite.prepare('INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)')
      .run('client-with-project', 'Protected Client', ownerIdentity.uid);

    // Insert active project for this client
    db.sqlite.prepare('INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)')
      .run('project-active-1', 'client-with-project', 'Ongoing Project', ownerIdentity.uid);

    // Attempt to archive client -> must be rejected
    const archiveReq = makeRequest('/api/hq/clients/client-with-project/archive', { method: 'POST' });
    const archiveRes = await callAuthorized(db, archiveReq, ['client-with-project', 'archive']);
    assert.equal(archiveRes.status, 400);
    const data = await archiveRes.json();
    assert.equal(data.ok, false);
    assert.equal(data.error, 'CLIENT_HAS_ACTIVE_PROJECTS');

    // Verify client remains unarchived
    const client = db.sqlite.prepare('SELECT archived_at FROM clients WHERE id = ?').get('client-with-project');
    assert.equal(client.archived_at, null);

    // Archive the project first
    db.sqlite.prepare("UPDATE projects SET archived_at = datetime('now'), archived_by = ? WHERE id = ?")
      .run(ownerIdentity.uid, 'project-active-1');

    // Now archiving client should succeed
    const archiveSuccessRes = await callAuthorized(db, archiveReq, ['client-with-project', 'archive']);
    assert.equal(archiveSuccessRes.status, 200);
    const successData = await archiveSuccessRes.json();
    assert.equal(successData.ok, true);
    assert.equal(successData.archived, true);
  } finally {
    db.close();
  }
});

test('5. Contacts subresource lifecycle: create, list, and update contacts', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);
    db.sqlite.prepare('INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)')
      .run('client-contacts-test', 'Contacts Parent Co', ownerIdentity.uid);

    // 1. Create primary contact
    const createContactReq = makeRequest('/api/hq/clients/client-contacts-test/contacts', {
      method: 'POST',
      body: {
        full_name: 'Alice Johnson',
        role_title: 'Managing Director',
        email: 'alice@contactsparent.com',
        phone: '+1 555 888 9999',
        is_primary: true
      }
    });
    const createRes = await callAuthorized(db, createContactReq, ['client-contacts-test', 'contacts']);
    assert.equal(createRes.status, 201);
    const contact = (await createRes.json()).contact;
    assert.ok(contact.id);
    assert.equal(contact.full_name, 'Alice Johnson');
    assert.equal(contact.is_primary, 1);

    // 2. List contacts
    const listRes = await callAuthorized(db, makeRequest('/api/hq/clients/client-contacts-test/contacts'), ['client-contacts-test', 'contacts']);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.contacts.length, 1);

    // 3. Update contact
    const updateRes = await callAuthorized(db, makeRequest(`/api/hq/clients/client-contacts-test/contacts/${contact.id}`, {
      method: 'PATCH',
      body: { role_title: 'CEO & Founder' }
    }), ['client-contacts-test', 'contacts', contact.id]);
    assert.equal(updateRes.status, 200);
    const updatedContact = (await updateRes.json()).contact;
    assert.equal(updatedContact.role_title, 'CEO & Founder');
  } finally {
    db.close();
  }
});

test('6. Disabled owner cannot create or mutate clients (fail-closed guard)', async () => {
  const db = new TestD1();
  try {
    // Owner is disabled
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'disabled')")
      .run(ownerIdentity.uid, ownerIdentity.email);

    const createReq = makeRequest('/api/hq/clients', {
      method: 'POST',
      body: { name: 'Attempted Client' }
    });

    // Guard will throw/rollback inside batch
    const res = await callAuthorized(db, createReq);
    assert.equal(res.status, 500);

    // Zero records created
    const clientCount = db.sqlite.prepare('SELECT COUNT(*) as count FROM clients').get().count;
    assert.equal(clientCount, 0);
  } finally {
    db.close();
  }
});

test('7. Append-only audit trigger strictly prevents UPDATE and DELETE on audit_logs', () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare('INSERT INTO hq_users (uid, email) VALUES (?, ?)').run(ownerIdentity.uid, ownerIdentity.email);
    db.sqlite.prepare(`INSERT INTO audit_logs (id, actor_uid, actor_email, action, entity_type)
      VALUES (?, ?, ?, ?, ?)`).run('audit-1', ownerIdentity.uid, ownerIdentity.email, 'client.create', 'client');

    // Confirm row exists
    const beforeCount = db.sqlite.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;
    assert.equal(beforeCount, 1);

    // Attempt UPDATE -> must throw SQLite error from trigger trg_audit_logs_no_update
    assert.throws(() => {
      db.sqlite.prepare("UPDATE audit_logs SET action = 'tampered' WHERE id = 'audit-1'").run();
    }, /audit_logs are append-only/);

    // Attempt DELETE -> must throw SQLite error from trigger trg_audit_logs_no_delete
    assert.throws(() => {
      db.sqlite.prepare("DELETE FROM audit_logs WHERE id = 'audit-1'").run();
    }, /audit_logs are append-only/);

    // Confirm audit log remains intact
    const afterCount = db.sqlite.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;
    assert.equal(afterCount, 1);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// Canonical Router & Dispatcher Tests
// ---------------------------------------------------------------------------

test('8. Canonical clients route matcher correctly classifies routes and segments', () => {
  assert.equal(isCanonicalClientsRoute('/api/hq/clients'), true);
  assert.equal(isCanonicalClientsRoute('/api/hq/clients/'), true);
  assert.equal(isCanonicalClientsRoute('/api/hq/clients/123-abc'), true);
  assert.equal(isCanonicalClientsRoute('/api/hq/clients/123-abc/archive'), true);
  assert.equal(isCanonicalClientsRoute('/api/hq/clients/123-abc/contacts'), true);
  assert.equal(isCanonicalClientsRoute('/api/hq/clients/123-abc/contacts/456-def'), true);

  // Negative route checks
  assert.equal(isCanonicalClientsRoute('/api/hq/clients-other'), false);
  assert.equal(isCanonicalClientsRoute('/api/hq/projects'), false);
  assert.equal(isCanonicalClientsRoute('/api/hq/leads'), false);

  // Matcher details
  const matchCollection = matchCanonicalClientRoute('/api/hq/clients');
  assert.equal(matchCollection.matched, true);
  assert.equal(matchCollection.route, 'clients.collection');
  assert.deepEqual(matchCollection.allowedMethods, ['GET', 'POST', 'OPTIONS']);

  const matchDetail = matchCanonicalClientRoute('/api/hq/clients/cli-1');
  assert.equal(matchDetail.matched, true);
  assert.equal(matchDetail.route, 'clients.detail');
  assert.deepEqual(matchDetail.allowedMethods, ['GET', 'PATCH', 'OPTIONS']);

  const matchArchive = matchCanonicalClientRoute('/api/hq/clients/cli-1/archive');
  assert.equal(matchArchive.matched, true);
  assert.equal(matchArchive.route, 'clients.archive');

  // Unknown subroute
  const matchUnknown = matchCanonicalClientRoute('/api/hq/clients/cli-1/unknown');
  assert.equal(matchUnknown.matched, true);
  assert.equal(matchUnknown.error, 'NOT_FOUND');
  assert.equal(matchUnknown.status, 404);
});

test('9. Canonical clients dispatcher handles OPTIONS, 405 Method Not Allowed, and unknown subroutes', async () => {
  const reqOptions = new Request('https://lab.jawed.co.in/api/hq/clients', {
    method: 'OPTIONS',
    headers: { origin: 'https://lab.jawed.co.in' }
  });
  const resOptions = await dispatchHqCanonicalClientsRequest('/api/hq/clients', {
    request: reqOptions,
    env: { ENVIRONMENT: 'test' }
  });
  assert.equal(resOptions.status, 204);
  assert.equal(resOptions.headers.get('allow'), 'GET, POST, OPTIONS');

  // Cross-origin preflight rejected
  const reqCrossOptions = new Request('https://lab.jawed.co.in/api/hq/clients', {
    method: 'OPTIONS',
    headers: { origin: 'https://malicious.com' }
  });
  const resCross = await dispatchHqCanonicalClientsRequest('/api/hq/clients', {
    request: reqCrossOptions,
    env: { ENVIRONMENT: 'test' }
  });
  assert.equal(resCross.status, 403);

  // Method Not Allowed on collection (e.g. DELETE or PUT)
  const reqDelete = new Request('https://lab.jawed.co.in/api/hq/clients', {
    method: 'DELETE',
    headers: { origin: 'https://lab.jawed.co.in' }
  });
  const resDelete = await dispatchHqCanonicalClientsRequest('/api/hq/clients', {
    request: reqDelete,
    env: { ENVIRONMENT: 'test' }
  });
  assert.equal(resDelete.status, 405);
  assert.equal(resDelete.headers.get('allow'), 'GET, POST, OPTIONS');

  // Unknown subroute returns 404
  const reqUnknown = new Request('https://lab.jawed.co.in/api/hq/clients/cli-1/unknown', {
    method: 'GET',
    headers: { origin: 'https://lab.jawed.co.in' }
  });
  const resUnknown = await dispatchHqCanonicalClientsRequest('/api/hq/clients/cli-1/unknown', {
    request: reqUnknown,
    env: { ENVIRONMENT: 'test' }
  });
  assert.equal(resUnknown.status, 404);
});
