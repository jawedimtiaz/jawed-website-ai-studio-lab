// tests/hq-core-operations.test.js
// Regression test suite for Phase 3Z.2: Core Operations Reconciliation APIs:
// - Maintenance Plans API (/api/hq/maintenance)
// - Approvals Workflow API (/api/hq/approvals)
// - Quality Assurance API (/api/hq/qa)
// Validates strict reconciliation with Canonical Studio HQ Schema (0001_studio_hq_schema.sql)

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { clearJwksCacheForTests } from '../functions/lib/hqAuth.js';
import { dispatchHqApiRequest } from '../functions/lib/hqRouter.js';
import { createLocalD1, applyHqMigrations } from '../functions/lib/localD1.js';

const PROJECT_ID = 'test-studio-hq-core-ops';
const KEY_ID = 'core-ops-key-1';
const OWNER_UID = 'owner-uid-core-ops-test';
const OWNER_EMAIL = 'jawed@jawed.co.in';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: KEY_ID,
  alg: 'RS256',
  use: 'sig'
};

function toB64Url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signTestToken(uid = OWNER_UID, email = OWNER_EMAIL) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: KEY_ID };
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: uid,
    user_id: uid,
    email,
    email_verified: true,
    name: 'Jawed Imtiaz',
    iat: now - 30,
    auth_time: now - 30,
    exp: now + 3600
  };
  const signingInput = `${toB64Url(header)}.${toB64Url(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${toB64Url(signer.sign(privateKey))}`;
}

async function apiCall(env, path, { method = 'GET', body, token = signTestToken(), headers = {} } = {}) {
  const reqHeaders = new Headers(headers);
  if (token) {
    reqHeaders.set('Authorization', `Bearer ${token}`);
  }
  if (body !== undefined && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json');
  }
  const url = `https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev${path}`;
  const req = new Request(url, {
    method,
    headers: reqHeaders,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
  const pathname = new URL(url).pathname;
  const response = await dispatchHqApiRequest(pathname, { request: req, env });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

describe('Studio HQ Core Operations APIs (Phase 3Z.2)', () => {
  let db;
  let env;
  const nowIso = new Date().toISOString();

  beforeEach(async () => {
    clearJwksCacheForTests();
    globalThis.fetch = async (url) => {
      if (String(url).includes('securetoken@system.gserviceaccount.com')) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' }
        });
      }
      throw new Error(`Unexpected external fetch: ${url}`);
    };

    db = createLocalD1(':memory:');
    applyHqMigrations(db);

    // Seed enrolled owner user
    await db
      .prepare(`INSERT INTO hq_users (uid, email, display_name, status, created_at, last_seen_at) VALUES (?, ?, ?, 'active', ?, ?)`)
      .bind(OWNER_UID, OWNER_EMAIL, 'Jawed Imtiaz', nowIso, nowIso)
      .run();

    // Seed a second user for FK testing
    await db
      .prepare(`INSERT INTO hq_users (uid, email, display_name, status, created_at, last_seen_at) VALUES (?, ?, ?, 'active', ?, ?)`)
      .bind('second-owner-uid', 'ops@jawed.co.in', 'Studio Ops', nowIso, nowIso)
      .run();

    // Seed active client
    await db
      .prepare(`INSERT INTO clients (id, name, business_name, email, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`)
      .bind('client-core-1', 'Alice Client', 'Alice Technologies', 'alice@alicetech.com', OWNER_UID, nowIso, nowIso)
      .run();

    // Seed archived client
    await db
      .prepare(`INSERT INTO clients (id, name, business_name, email, status, created_by, created_at, updated_at, archived_at, archived_by) VALUES (?, ?, ?, ?, 'closed', ?, ?, ?, ?, ?)`)
      .bind('client-archived-1', 'Bob Client', 'Bob Inactive Corp', 'bob@inactive.com', OWNER_UID, nowIso, nowIso, nowIso, OWNER_UID)
      .run();

    // Seed active project
    await db
      .prepare(`INSERT INTO projects (id, client_id, name, status, priority, created_by, created_at, updated_at) VALUES (?, ?, ?, 'in-progress', 'high', ?, ?, ?)`)
      .bind('project-core-1', 'client-core-1', 'Alice Portal Redesign', OWNER_UID, nowIso, nowIso)
      .run();

    // Seed archived project
    await db
      .prepare(`INSERT INTO projects (id, client_id, name, status, priority, created_by, created_at, updated_at, archived_at, archived_by) VALUES (?, ?, ?, 'completed', 'normal', ?, ?, ?, ?, ?)`)
      .bind('project-archived-1', 'client-core-1', 'Alice Legacy App', OWNER_UID, nowIso, nowIso, nowIso, OWNER_UID)
      .run();

    env = {
      ENVIRONMENT: 'test',
      FIREBASE_PROJECT_ID: PROJECT_ID,
      ALLOWED_OWNER_EMAILS: `${OWNER_EMAIL},ops@jawed.co.in`,
      HQ_DB: db,
      CF_PAGES: '1'
    };
  });

  // ==========================================
  // 1. MAINTENANCE PLANS API TESTS
  // ==========================================
  describe('1. Maintenance Plans API (/api/hq/maintenance)', () => {
    test('1.1 Successful list returns empty array on clean database', async () => {
      const res = await apiCall(env, '/api/hq/maintenance');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.plans, []);
    });

    test('1.2 Successful create with canonical schema fields and audit logging', async () => {
      const res = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: {
          client_id: 'client-core-1',
          project_id: 'project-core-1',
          name: 'Annual Care & Security Retainer',
          status: 'active',
          billing_cycle: 'monthly',
          fee_minor: 500000,
          currency: 'INR',
          starts_on: '2026-01-01',
          ends_on: '2026-12-31',
          scope_markdown: 'Covers Cloudflare Worker updates and monthly backups'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.plan);
      assert.equal(res.data.plan.name, 'Annual Care & Security Retainer');
      assert.equal(res.data.plan.status, 'active');
      assert.equal(res.data.plan.fee_minor, 500000);
      assert.equal(res.data.plan.amount_minor, 500000);
      assert.equal(res.data.plan.starts_on, '2026-01-01');
      assert.equal(res.data.plan.ends_on, '2026-12-31');
      assert.equal(res.data.plan.client_business, 'Alice Technologies');
      assert.equal(res.data.plan.project_name, 'Alice Portal Redesign');
      assert.equal(res.data.plan.created_by, OWNER_UID);

      // Verify audit log
      const audit = await db
        .prepare(`SELECT * FROM audit_logs WHERE action = 'MAINTENANCE_PLAN_CREATED' AND entity_id = ?`)
        .bind(res.data.plan.id)
        .first();
      assert.ok(audit);
    });

    test('1.3 Successful update modifies canonical fields and preserves audit trail', async () => {
      // Create a plan first
      const createRes = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: {
          client_id: 'client-core-1',
          name: 'Basic Care',
          starts_on: '2026-01-01',
          ends_on: '2026-06-30',
          fee_minor: 250000
        }
      });
      const planId = createRes.data.plan.id;

      // Update plan
      const updateRes = await apiCall(env, '/api/hq/maintenance', {
        method: 'PUT',
        body: {
          id: planId,
          name: 'Premium Care & Monitoring Retainer',
          status: 'paused',
          fee_minor: 350000,
          scope_markdown: 'Upgraded to 24/7 incident response'
        }
      });

      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.data.success, true);
      assert.equal(updateRes.data.plan.name, 'Premium Care & Monitoring Retainer');
      assert.equal(updateRes.data.plan.status, 'paused');
      assert.equal(updateRes.data.plan.fee_minor, 350000);
      assert.equal(updateRes.data.plan.scope_markdown, 'Upgraded to 24/7 incident response');

      // Verify audit log
      const audit = await db
        .prepare(`SELECT * FROM audit_logs WHERE action = 'MAINTENANCE_PLAN_UPDATED' AND entity_id = ?`)
        .bind(planId)
        .first();
      assert.ok(audit);
    });

    test('1.4 Required field validation rejects missing client, name, or dates', async () => {
      const res1 = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: { name: 'Test Plan', starts_on: '2026-01-01', ends_on: '2026-12-31' }
      });
      assert.equal(res1.status, 400);
      assert.equal(res1.data.error.code, 'INVALID_INPUT');

      const res2 = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: { client_id: 'client-core-1', starts_on: '2026-01-01', ends_on: '2026-12-31' }
      });
      assert.equal(res2.status, 400);

      const res3 = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: { client_id: 'client-core-1', name: 'Test Plan', ends_on: '2026-12-31' }
      });
      assert.equal(res3.status, 400);
    });

    test('1.5 Invalid fee_minor validation rejects negative, non-numeric, or fractional values', async () => {
      const res1 = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: {
          client_id: 'client-core-1',
          name: 'Negative Fee Plan',
          starts_on: '2026-01-01',
          ends_on: '2026-12-31',
          fee_minor: -100
        }
      });
      assert.equal(res1.status, 400);
      assert.match(res1.data.error.message, /fee/i);

      const res2 = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: {
          client_id: 'client-core-1',
          name: 'Fractional Fee Plan',
          starts_on: '2026-01-01',
          ends_on: '2026-12-31',
          fee_minor: 12.34
        }
      });
      assert.equal(res2.status, 400);

      const res3 = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: {
          client_id: 'client-core-1',
          name: 'String Fee Plan',
          starts_on: '2026-01-01',
          ends_on: '2026-12-31',
          fee_minor: 'abc'
        }
      });
      assert.equal(res3.status, 400);
    });

    test('1.6 Invalid date range rejects start date after end date', async () => {
      const res = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: {
          client_id: 'client-core-1',
          name: 'Inverted Date Plan',
          starts_on: '2026-12-31',
          ends_on: '2026-01-01',
          fee_minor: 10000
        }
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error.message, /start date must be before or equal to end date/i);
    });

    test('1.7 Invalid status rejects values violating CHECK constraint', async () => {
      const res = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: {
          client_id: 'client-core-1',
          name: 'Bad Status Plan',
          starts_on: '2026-01-01',
          ends_on: '2026-12-31',
          status: 'non-existent-status'
        }
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error.message, /invalid maintenance plan status/i);
    });

    test('1.8 Archived record exclusion and soft-delete behavior', async () => {
      // Create a plan
      const createRes = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: {
          client_id: 'client-core-1',
          name: 'Plan To Soft Delete',
          starts_on: '2026-01-01',
          ends_on: '2026-12-31'
        }
      });
      const planId = createRes.data.plan.id;

      // Soft delete via DELETE
      const deleteRes = await apiCall(env, `/api/hq/maintenance?id=${planId}`, {
        method: 'DELETE'
      });
      assert.equal(deleteRes.status, 200);
      assert.equal(deleteRes.data.archived, true);

      // Verify row is NOT hard deleted in DB, but has archived_at and archived_by set
      const row = await db.prepare(`SELECT * FROM maintenance_plans WHERE id = ?`).bind(planId).first();
      assert.ok(row);
      assert.ok(row.archived_at);
      assert.equal(row.archived_by, OWNER_UID);

      // Verify normal GET does NOT return the archived plan
      const listRes = await apiCall(env, '/api/hq/maintenance');
      assert.equal(listRes.status, 200);
      const found = listRes.data.plans.find((p) => p.id === planId);
      assert.equal(found, undefined);

      // Verify includeArchived=true returns it
      const listArchivedRes = await apiCall(env, '/api/hq/maintenance?includeArchived=true');
      assert.equal(listArchivedRes.status, 200);
      const foundArchived = listArchivedRes.data.plans.find((p) => p.id === planId);
      assert.ok(foundArchived);
      assert.ok(foundArchived.archived_at);
    });

    test('1.9 Archived records cannot be unintentionally reactivated or modified via PUT', async () => {
      // Create and delete plan
      const createRes = await apiCall(env, '/api/hq/maintenance', {
        method: 'POST',
        body: {
          client_id: 'client-core-1',
          name: 'Archived Plan',
          starts_on: '2026-01-01',
          ends_on: '2026-12-31'
        }
      });
      const planId = createRes.data.plan.id;
      await apiCall(env, `/api/hq/maintenance?id=${planId}`, { method: 'DELETE' });

      // Attempt PUT on archived plan
      const putRes = await apiCall(env, '/api/hq/maintenance', {
        method: 'PUT',
        body: {
          id: planId,
          name: 'Trying to resurrect archived plan',
          status: 'active'
        }
      });
      assert.equal(putRes.status, 400);
      assert.match(putRes.data.error.message, /cannot update an archived/i);
    });

    test('1.10 Authentication failure returns HTTP 401 when token is missing or invalid', async () => {
      const res = await apiCall(env, '/api/hq/maintenance', { token: null });
      assert.equal(res.status, 401);
    });
  });

  // ==========================================
  // 2. APPROVALS WORKFLOW API TESTS
  // ==========================================
  describe('2. Approvals API (/api/hq/approvals)', () => {
    test('2.1 Successful list returns empty array on clean database', async () => {
      const res = await apiCall(env, '/api/hq/approvals');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.approvals, []);
    });

    test('2.2 Successful creation and project relationship resolution', async () => {
      const res = await apiCall(env, '/api/hq/approvals', {
        method: 'POST',
        body: {
          project_id: 'project-core-1',
          approval_type: 'design',
          decision_note: 'Figma mockups approved by client leadership',
          requested_from_email: 'alice@alicetech.com'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.approval);
      assert.equal(res.data.approval.project_id, 'project-core-1');
      assert.equal(res.data.approval.approval_type, 'design');
      assert.equal(res.data.approval.status, 'pending');
      assert.equal(res.data.approval.requested_by, OWNER_UID);
      assert.equal(res.data.approval.requested_from_email, 'alice@alicetech.com');
      // Relationship resolution
      assert.equal(res.data.approval.project_name, 'Alice Portal Redesign');
      assert.equal(res.data.approval.client_business, 'Alice Technologies');
      assert.equal(res.data.approval.stage, 'Design Approval');

      // Verify audit log
      const audit = await db
        .prepare(`SELECT * FROM audit_logs WHERE action = 'APPROVAL_CREATED' AND entity_id = ?`)
        .bind(res.data.approval.id)
        .first();
      assert.ok(audit);
    });

    test('2.3 Invalid project rejection returns 404 for missing or archived projects', async () => {
      // Non-existent project
      const res1 = await apiCall(env, '/api/hq/approvals', {
        method: 'POST',
        body: { project_id: 'non-existent-proj', approval_type: 'scope' }
      });
      assert.equal(res1.status, 404);

      // Archived project
      const res2 = await apiCall(env, '/api/hq/approvals', {
        method: 'POST',
        body: { project_id: 'project-archived-1', approval_type: 'scope' }
      });
      assert.equal(res2.status, 404);
    });

    test('2.4 Invalid approval_type rejection rejects unsupported enum values', async () => {
      const res = await apiCall(env, '/api/hq/approvals', {
        method: 'POST',
        body: { project_id: 'project-core-1', approval_type: 'invalid-approval-stage-type' }
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error.message, /invalid approval_type/i);
    });

    test('2.5 Invalid status rejection rejects non-canonical status values', async () => {
      const res = await apiCall(env, '/api/hq/approvals', {
        method: 'POST',
        body: { project_id: 'project-core-1', approval_type: 'qa', status: 'bogus-status' }
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error.message, /invalid approval status/i);
    });

    test('2.6 Invalid decided_by rejection rejects user IDs not found in hq_users', async () => {
      const res = await apiCall(env, '/api/hq/approvals', {
        method: 'POST',
        body: {
          project_id: 'project-core-1',
          approval_type: 'scope',
          status: 'approved',
          decided_by: 'unregistered-fake-uid'
        }
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error.message, /decided by user not found/i);
    });

    test('2.7 Successful decision/update transitions status and attributes decided_by FK', async () => {
      // Create pending approval
      const createRes = await apiCall(env, '/api/hq/approvals', {
        method: 'POST',
        body: {
          project_id: 'project-core-1',
          approval_type: 'qa',
          decision_note: 'Initial QA verification gate'
        }
      });
      const apId = createRes.data.approval.id;

      // Update to approved with decision notes
      const updateRes = await apiCall(env, '/api/hq/approvals', {
        method: 'PUT',
        body: {
          id: apId,
          status: 'Approved',
          decision_notes: 'All 42 test cases verified on staging environment',
          decided_by: 'second-owner-uid'
        }
      });

      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.data.success, true);
      assert.equal(updateRes.data.approval.status, 'approved');
      assert.equal(updateRes.data.approval.decided_by, 'second-owner-uid');
      assert.ok(updateRes.data.approval.decided_at);
      assert.equal(updateRes.data.approval.decision_note, 'All 42 test cases verified on staging environment');

      // Verify audit log
      const audit = await db
        .prepare(`SELECT * FROM audit_logs WHERE action = 'APPROVAL_APPROVED' AND entity_id = ?`)
        .bind(apId)
        .first();
      assert.ok(audit);
    });

    test('2.8 Safe withdrawal via DELETE marks status as withdrawn without hard-deleting', async () => {
      const createRes = await apiCall(env, '/api/hq/approvals', {
        method: 'POST',
        body: { project_id: 'project-core-1', approval_type: 'other' }
      });
      const apId = createRes.data.approval.id;

      const delRes = await apiCall(env, `/api/hq/approvals?id=${apId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);
      assert.equal(delRes.data.withdrawn, true);

      // Verify row still exists in DB with status = 'withdrawn'
      const row = await db.prepare(`SELECT * FROM approvals WHERE id = ?`).bind(apId).first();
      assert.ok(row);
      assert.equal(row.status, 'withdrawn');
    });

    test('2.9 Authentication failure returns HTTP 401 when unauthenticated', async () => {
      const res = await apiCall(env, '/api/hq/approvals', { token: null });
      assert.equal(res.status, 401);
    });
  });

  // ==========================================
  // 3. QUALITY ASSURANCE API TESTS
  // ==========================================
  describe('3. Quality Assurance API (/api/hq/qa)', () => {
    test('3.1 Successful list returns empty array on clean database', async () => {
      const res = await apiCall(env, '/api/hq/qa');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.checks, []);
    });

    test('3.2 Successful creation with canonical schema fields and relations', async () => {
      const res = await apiCall(env, '/api/hq/qa', {
        method: 'POST',
        body: {
          project_id: 'project-core-1',
          check_name: 'Responsive navigation menu operates on mobile breakpoints',
          category: 'responsive',
          result: 'pass',
          evidence_url: 'https://preview.lab.jawed.co.in/evidence/nav-test.png',
          notes: 'Tested on iPhone 15 Pro and Galaxy S24 screen viewports'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.check);
      assert.equal(res.data.check.project_id, 'project-core-1');
      assert.equal(res.data.check.check_name, 'Responsive navigation menu operates on mobile breakpoints');
      assert.equal(res.data.check.category, 'responsive');
      assert.equal(res.data.check.result, 'pass');
      assert.equal(res.data.check.checked_by, OWNER_UID);
      assert.ok(res.data.check.checked_at);
      assert.equal(res.data.check.project_name, 'Alice Portal Redesign');
      assert.equal(res.data.check.client_business, 'Alice Technologies');

      // Verify audit log
      const audit = await db
        .prepare(`SELECT * FROM audit_logs WHERE action = 'QA_CHECK_CREATED' AND entity_id = ?`)
        .bind(res.data.check.id)
        .first();
      assert.ok(audit);
    });

    test('3.3 Successful update modifies result, category, and notes', async () => {
      // Create initial check
      const createRes = await apiCall(env, '/api/hq/qa', {
        method: 'POST',
        body: {
          project_id: 'project-core-1',
          check_name: 'Lighthouse accessibility score >= 95',
          category: 'accessibility',
          result: 'not-run'
        }
      });
      const checkId = createRes.data.check.id;

      // Update check
      const updateRes = await apiCall(env, '/api/hq/qa', {
        method: 'PUT',
        body: {
          id: checkId,
          result: 'Pass',
          notes: 'Achieved 100 on Lighthouse a11y audit',
          checked_by: 'second-owner-uid'
        }
      });

      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.data.success, true);
      assert.equal(updateRes.data.check.result, 'pass');
      assert.equal(updateRes.data.check.status, 'Pass');
      assert.equal(updateRes.data.check.checked_by, 'second-owner-uid');
      assert.equal(updateRes.data.check.notes, 'Achieved 100 on Lighthouse a11y audit');

      // Verify audit log
      const audit = await db
        .prepare(`SELECT * FROM audit_logs WHERE action = 'QA_CHECK_UPDATED' AND entity_id = ?`)
        .bind(checkId)
        .first();
      assert.ok(audit);
    });

    test('3.4 Invalid project rejection returns 404 for missing or archived project', async () => {
      const res1 = await apiCall(env, '/api/hq/qa', {
        method: 'POST',
        body: { project_id: 'missing-proj-id', check_name: 'Valid check name' }
      });
      assert.equal(res1.status, 404);

      const res2 = await apiCall(env, '/api/hq/qa', {
        method: 'POST',
        body: { project_id: 'project-archived-1', check_name: 'Valid check name' }
      });
      assert.equal(res2.status, 404);
    });

    test('3.5 Invalid check_name validation rejects empty or missing check name', async () => {
      const res1 = await apiCall(env, '/api/hq/qa', {
        method: 'POST',
        body: { project_id: 'project-core-1', check_name: '' }
      });
      assert.equal(res1.status, 400);
      assert.match(res1.data.error.message, /check name is required/i);

      const res2 = await apiCall(env, '/api/hq/qa', {
        method: 'POST',
        body: { project_id: 'project-core-1', check_name: '   ' }
      });
      assert.equal(res2.status, 400);
      assert.match(res2.data.error.message, /check name is required/i);
    });

    test('3.6 Invalid result rejection rejects values violating CHECK constraint', async () => {
      const res = await apiCall(env, '/api/hq/qa', {
        method: 'POST',
        body: {
          project_id: 'project-core-1',
          check_name: 'Valid check',
          result: 'invalid-result-state'
        }
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error.message, /invalid qa check result/i);
    });

    test('3.7 Invalid category rejection rejects non-canonical category strings', async () => {
      const res = await apiCall(env, '/api/hq/qa', {
        method: 'POST',
        body: {
          project_id: 'project-core-1',
          check_name: 'Valid check',
          category: 'completely-unknown-category'
        }
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error.message, /invalid qa category/i);
    });

    test('3.8 Invalid checked_by rejection rejects user IDs not found in hq_users', async () => {
      const res = await apiCall(env, '/api/hq/qa', {
        method: 'POST',
        body: {
          project_id: 'project-core-1',
          check_name: 'Valid check',
          result: 'pass',
          checked_by: 'non-existent-user-uid'
        }
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error.message, /checked by user not found/i);
    });

    test('3.9 Successful delete removes QA check and logs audit entry', async () => {
      const createRes = await apiCall(env, '/api/hq/qa', {
        method: 'POST',
        body: { project_id: 'project-core-1', check_name: 'Check to delete' }
      });
      const checkId = createRes.data.check.id;

      const delRes = await apiCall(env, `/api/hq/qa?id=${checkId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);
      assert.equal(delRes.data.deletedId, checkId);

      const check = await db.prepare(`SELECT * FROM qa_checks WHERE id = ?`).bind(checkId).first();
      assert.equal(check, null);

      const audit = await db
        .prepare(`SELECT * FROM audit_logs WHERE action = 'QA_CHECK_DELETED' AND entity_id = ?`)
        .bind(checkId)
        .first();
      assert.ok(audit);
    });

    test('3.10 Authentication failure returns HTTP 401 when unauthenticated', async () => {
      const res = await apiCall(env, '/api/hq/qa', { token: null });
      assert.equal(res.status, 401);
    });
  });
});
