// tests/hq-crm-tab-filter-isolation.test.js
// Automated Regression Suite for Phase 8.0.4: OBS-UI-001 Remediation
// Verifies complete tab filter isolation between CRM Leads and Customers:
// 1. Leads -> Customers navigation with Converted filter does not leak status=Converted to /api/hq/clients.
// 2. Leads -> Customers navigation with Lost filter does not leak status=Lost to /api/hq/clients.
// 3. Leads -> Customers navigation with Qualified filter does not leak status=Qualified to /api/hq/clients.
// 4. Customers -> Leads navigation with canonical client status does not leak status to /api/hq/leads.
// 5. Customers API query builder rejects all invalid/lead-specific statuses and prevents HTTP 400 STATUS_INVALID.
// 6. Leads API query builder maps and scopes stages correctly.
// 7. Navigation back-and-forth preserves independent tab filter states without cross-contamination.
// 8. Existing CRM query and pagination behavior remains intact.

import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  handleAuthorizedHqClients
} from '../functions/api/hq/canonicalClients.js';

import {
  handleAuthorizedHqLeads
} from '../functions/api/hq/canonicalLeads.js';

import {
  sanitizeClientStatusFilter,
  buildClientQueryParams,
  sanitizeLeadStageFilter,
  buildLeadQueryParams,
  CANONICAL_CLIENT_STATUSES,
  CANONICAL_CLIENT_STATUS_SET,
  CANONICAL_LEAD_STAGES,
  CANONICAL_LEAD_STAGE_SET
} from '../src/services/hqClientHelpers.ts';

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
      const results = statements.map((statement) =>
        /^\s*SELECT\b/i.test(statement.sql) || /\bRETURNING\b/i.test(statement.sql)
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

const ownerIdentity = { uid: 'owner-test-filter-isolation', email: 'jawed@jawed.co.in' };

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

function callAuthorizedClients(db, req, segments = []) {
  return handleAuthorizedHqClients({
    request: req,
    env: { ENVIRONMENT: 'test', HQ_DB: db },
    segments,
    identity: ownerIdentity
  });
}

function callAuthorizedLeads(db, req, segments = []) {
  return handleAuthorizedHqLeads({
    request: req,
    env: { ENVIRONMENT: 'test', HQ_DB: db },
    segments,
    identity: ownerIdentity
  });
}

describe('Phase 8.0.4 — OBS-UI-001 Remediation: CRM Tab Filter Isolation', () => {
  let db;

  beforeEach(() => {
    db = new TestD1();
    db.sqlite.prepare(
      "INSERT INTO hq_users (uid, email, display_name, status) VALUES (?, ?, 'Jawed Owner', 'active')"
    ).run(ownerIdentity.uid, ownerIdentity.email);

    // Seed 1 active client, 1 archived client, 1 lead in stage 'qualified', 1 lead in stage 'converted'
    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, pipeline_stage, lead_origin, created_by)
      VALUES ('c-1', 'Active Customer', 'Acme Solutions Ltd', 'contact@acme.com', 'active', 'converted', 'inbound-lead', ?)
    `).run(ownerIdentity.uid);

    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, pipeline_stage, lead_origin, archived_at, archived_by, created_by)
      VALUES ('c-2', 'Archived Customer', 'Archived Enterprises', 'archived@corp.com', 'closed', 'lost', 'legacy-existing', CURRENT_TIMESTAMP, ?, ?)
    `).run(ownerIdentity.uid, ownerIdentity.uid);

    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, pipeline_stage, lead_origin, created_by)
      VALUES ('l-1', 'Qualified Lead', 'Lead Corp One', 'lead1@corp.com', 'prospect', 'qualified', 'inbound-lead', ?)
    `).run(ownerIdentity.uid);

    db.sqlite.prepare(`
      INSERT INTO clients (id, name, business_name, email, status, pipeline_stage, lead_origin, lost_reason, lost_at, created_by)
      VALUES ('l-2', 'Lost Lead', 'Lead Corp Two', 'lead2@corp.com', 'closed', 'lost', 'inbound-lead', 'Budget rejected', CURRENT_TIMESTAMP, ?)
    `).run(ownerIdentity.uid);
  });

  afterEach(() => {
    db.close();
  });

  test('1. Root cause reproduction: raw status=Converted to /api/hq/clients produces HTTP 400 STATUS_INVALID', async () => {
    // Demonstrates the exact bug prior to remediation
    const buggyReq = makeRequest('/api/hq/clients?page=1&limit=25&status=Converted');
    const buggyRes = await callAuthorizedClients(db, buggyReq);
    assert.equal(buggyRes.status, 400);
    const body = await buggyRes.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, 'STATUS_INVALID');
  });

  test('2. Leads -> Customers navigation with Converted filter: buildClientQueryParams produces safe query and returns HTTP 200', async () => {
    // When Leads tab has filter 'Converted' and user switches to Customers tab:
    // Even if statusFilter='Converted' was somehow passed, buildClientQueryParams sanitizes it
    const safeParams = buildClientQueryParams({
      page: 1,
      limit: 25,
      statusFilter: 'Converted'
    });

    assert.equal(safeParams.has('status'), false, 'status=Converted must not be present in client query params');
    assert.equal(safeParams.get('page'), '1');
    assert.equal(safeParams.get('limit'), '25');

    const req = makeRequest(`/api/hq/clients?${safeParams.toString()}`);
    const res = await callAuthorizedClients(db, req);
    assert.equal(res.status, 200, 'Must return 200 OK without any STATUS_INVALID error');
    const data = await res.json();
    assert.ok(Array.isArray(data.clients));
    assert.ok(data.total >= 1);
  });

  test('3. Leads -> Customers navigation with Lost filter: sanitized client query returns HTTP 200', async () => {
    const safeParams = buildClientQueryParams({
      page: 1,
      limit: 25,
      statusFilter: 'Lost'
    });

    assert.equal(safeParams.has('status'), false, 'status=Lost must not be present in client query params');
    const req = makeRequest(`/api/hq/clients?${safeParams.toString()}`);
    const res = await callAuthorizedClients(db, req);
    assert.equal(res.status, 200);
  });

  test('4. Leads -> Customers navigation with Qualified filter: sanitized client query returns HTTP 200', async () => {
    const safeParams = buildClientQueryParams({
      page: 1,
      limit: 25,
      statusFilter: 'Qualified'
    });

    assert.equal(safeParams.has('status'), false, 'status=Qualified must not be present in client query params');
    const req = makeRequest(`/api/hq/clients?${safeParams.toString()}`);
    const res = await callAuthorizedClients(db, req);
    assert.equal(res.status, 200);
  });

  test('5. Customers -> Leads navigation: client status does not leak into Leads query params', async () => {
    // When Customers tab has filter 'active' or 'paused', buildLeadQueryParams does not leak it as stage
    const leadParamsFromClientFilter = buildLeadQueryParams({
      page: 1,
      limit: 25,
      stageFilter: 'active'
    });

    assert.equal(leadParamsFromClientFilter.has('stage'), false, 'status=active must not be present in stage filter');

    const req = makeRequest(`/api/hq/leads?${leadParamsFromClientFilter.toString()}`);
    const res = await callAuthorizedLeads(db, req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.leads));
  });

  test('6. sanitizeClientStatusFilter accepts valid canonical statuses and archived only', () => {
    // Canonical statuses
    for (const status of CANONICAL_CLIENT_STATUSES) {
      assert.deepEqual(sanitizeClientStatusFilter(status), { status });
      assert.deepEqual(sanitizeClientStatusFilter(status.toUpperCase()), { status });
    }

    // Archived option
    assert.deepEqual(sanitizeClientStatusFilter('archived'), { archivedOnly: true });
    assert.deepEqual(sanitizeClientStatusFilter('Archived'), { archivedOnly: true });

    // 'All' or empty
    assert.deepEqual(sanitizeClientStatusFilter('All'), {});
    assert.deepEqual(sanitizeClientStatusFilter('all'), {});
    assert.deepEqual(sanitizeClientStatusFilter(''), {});
    assert.deepEqual(sanitizeClientStatusFilter(null), {});
    assert.deepEqual(sanitizeClientStatusFilter(undefined), {});

    // Leads-specific stages rejected
    assert.deepEqual(sanitizeClientStatusFilter('Converted'), {});
    assert.deepEqual(sanitizeClientStatusFilter('converted'), {});
    assert.deepEqual(sanitizeClientStatusFilter('Lost'), {});
    assert.deepEqual(sanitizeClientStatusFilter('lost'), {});
    assert.deepEqual(sanitizeClientStatusFilter('Qualified'), {});
    assert.deepEqual(sanitizeClientStatusFilter('qualified'), {});
    assert.deepEqual(sanitizeClientStatusFilter('Proposal Sent'), {});
    assert.deepEqual(sanitizeClientStatusFilter('proposal-sent'), {});
    assert.deepEqual(sanitizeClientStatusFilter('New'), {});
    assert.deepEqual(sanitizeClientStatusFilter('Contacted'), {});
    assert.deepEqual(sanitizeClientStatusFilter('arbitrary_malicious_status'), {});
  });

  test('7. sanitizeLeadStageFilter accepts valid canonical lead stages and archived only', () => {
    for (const stage of CANONICAL_LEAD_STAGES) {
      const res = sanitizeLeadStageFilter(stage);
      assert.ok(res.stage);
    }

    assert.deepEqual(sanitizeLeadStageFilter('archived'), { archivedOnly: true });
    assert.deepEqual(sanitizeLeadStageFilter('Archived'), { archivedOnly: true });

    assert.deepEqual(sanitizeLeadStageFilter('All'), {});
    assert.deepEqual(sanitizeLeadStageFilter(''), {});

    // Client-specific statuses rejected
    assert.deepEqual(sanitizeLeadStageFilter('paused'), {});
    assert.deepEqual(sanitizeLeadStageFilter('completed'), {});
    assert.deepEqual(sanitizeLeadStageFilter('active'), {});
    assert.deepEqual(sanitizeLeadStageFilter('unknown_stage'), {});
  });

  test('8. Navigation simulation: independent tab-scoped states preserve correct parameters back and forth', async () => {
    // Simulating component tab-scoped state model:
    let leadState = { status: 'Converted', search: 'Acme', page: 1 };
    let clientState = { status: 'All', search: '', page: 1 };

    // Step A: On Leads tab with 'Converted' filter
    const leadsQueryA = buildLeadQueryParams({
      page: leadState.page,
      search: leadState.search,
      stageFilter: leadState.status
    });
    assert.equal(leadsQueryA.get('stage'), 'converted');
    assert.equal(leadsQueryA.get('q'), 'Acme');

    const leadsResA = await callAuthorizedLeads(db, makeRequest(`/api/hq/leads?${leadsQueryA.toString()}`));
    assert.equal(leadsResA.status, 200);

    // Step B: Switch to Customers tab (activeTab = 'customers')
    // Uses clientState independently (statusFilter = 'All')
    const clientsQueryB = buildClientQueryParams({
      page: clientState.page,
      search: clientState.search,
      statusFilter: clientState.status
    });
    assert.equal(clientsQueryB.has('status'), false, 'Clients query has no status when clientState.status is All');
    assert.equal(clientsQueryB.has('q'), false);

    const clientsResB = await callAuthorizedClients(db, makeRequest(`/api/hq/clients?${clientsQueryB.toString()}`));
    assert.equal(clientsResB.status, 200, 'Customers query executes cleanly with 200 OK');

    // Step C: On Customers tab, user selects 'active' filter
    clientState.status = 'active';
    const clientsQueryC = buildClientQueryParams({
      page: clientState.page,
      search: clientState.search,
      statusFilter: clientState.status
    });
    assert.equal(clientsQueryC.get('status'), 'active');
    const clientsResC = await callAuthorizedClients(db, makeRequest(`/api/hq/clients?${clientsQueryC.toString()}`));
    assert.equal(clientsResC.status, 200);

    // Step D: Switch back to Leads tab (activeTab = 'leads')
    // leadState is still { status: 'Converted', search: 'Acme', page: 1 }
    const leadsQueryD = buildLeadQueryParams({
      page: leadState.page,
      search: leadState.search,
      stageFilter: leadState.status
    });
    assert.equal(leadsQueryD.get('stage'), 'converted', 'Leads filter was preserved');
    assert.equal(leadsQueryD.get('q'), 'Acme', 'Leads search was preserved');
    const leadsResD = await callAuthorizedLeads(db, makeRequest(`/api/hq/leads?${leadsQueryD.toString()}`));
    assert.equal(leadsResD.status, 200);

    // Step E: Switch back to Customers tab (activeTab = 'customers')
    // clientState is still { status: 'active', search: '', page: 1 }
    const clientsQueryE = buildClientQueryParams({
      page: clientState.page,
      search: clientState.search,
      statusFilter: clientState.status
    });
    assert.equal(clientsQueryE.get('status'), 'active', 'Customers filter was preserved');
    const clientsResE = await callAuthorizedClients(db, makeRequest(`/api/hq/clients?${clientsQueryE.toString()}`));
    assert.equal(clientsResE.status, 200);
  });
});
