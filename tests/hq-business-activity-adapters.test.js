// tests/hq-business-activity-adapters.test.js
// Regression test suite for Phase 3Z.3: Business & Activity Adapters:
// - Follow-ups API (/api/hq/follow-ups) -> canonical activity_notes (note_type = 'follow-up')
// - Proposals API (/api/hq/proposals) -> canonical quotations
// - Expenses API (/api/hq/expenses) -> safe empty compatibility adapter
// - Onboarding API (/api/hq/onboarding) -> canonical project_tasks
// - Support API (/api/hq/support) -> safe empty compatibility adapter
// Validates strict reconciliation with Canonical Studio HQ Schema (0001_studio_hq_schema.sql)

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { clearJwksCacheForTests } from '../functions/lib/hqAuth.js';
import { dispatchHqApiRequest } from '../functions/lib/hqRouter.js';
import { createLocalD1, applyHqMigrations } from '../functions/lib/localD1.js';

const PROJECT_ID = 'test-studio-hq-adapters';
const KEY_ID = 'adapters-key-1';
const OWNER_UID = 'owner-uid-adapters-test';
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

describe('Studio HQ Business & Activity Adapters (Phase 3Z.3)', () => {
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

    // Seed active client
    await db
      .prepare(`INSERT INTO clients (id, name, business_name, email, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`)
      .bind('client-adapter-1', 'Zara Client', 'Zara Innovations', 'zara@innovations.com', OWNER_UID, nowIso, nowIso)
      .run();

    // Seed archived client
    await db
      .prepare(`INSERT INTO clients (id, name, business_name, email, status, created_by, created_at, updated_at, archived_at, archived_by) VALUES (?, ?, ?, ?, 'closed', ?, ?, ?, ?, ?)`)
      .bind('client-adapter-archived', 'Inactive Client', 'Old Inactive Co', 'old@inactive.com', OWNER_UID, nowIso, nowIso, nowIso, OWNER_UID)
      .run();

    // Seed active project
    await db
      .prepare(`INSERT INTO projects (id, client_id, name, status, priority, created_by, created_at, updated_at) VALUES (?, ?, ?, 'in-progress', 'high', ?, ?, ?)`)
      .bind('project-adapter-1', 'client-adapter-1', 'Zara Web Platform', OWNER_UID, nowIso, nowIso)
      .run();

    // Seed archived project
    await db
      .prepare(`INSERT INTO projects (id, client_id, name, status, priority, created_by, created_at, updated_at, archived_at, archived_by) VALUES (?, ?, ?, 'completed', 'normal', ?, ?, ?, ?, ?)`)
      .bind('project-adapter-archived', 'client-adapter-1', 'Zara Legacy Site', OWNER_UID, nowIso, nowIso, nowIso, OWNER_UID)
      .run();

    env = {
      ENVIRONMENT: 'test',
      FIREBASE_PROJECT_ID: PROJECT_ID,
      ALLOWED_OWNER_EMAILS: OWNER_EMAIL,
      HQ_DB: db,
      CF_PAGES: '1'
    };
  });

  // ==========================================
  // 1. FOLLOW-UPS API (via activity_notes)
  // ==========================================
  describe('1. Follow-Ups API (/api/hq/follow-ups)', () => {
    test('1.1 Authenticated listing returns empty array on clean database', async () => {
      const res = await apiCall(env, '/api/hq/follow-ups');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.followUps, []);
    });

    test('1.2 Successful creation persists to activity_notes with note_type = "follow-up"', async () => {
      const res = await apiCall(env, '/api/hq/follow-ups', {
        method: 'POST',
        body: {
          client_id: 'client-adapter-1',
          project_id: 'project-adapter-1',
          title: 'Schedule Q4 Review Call',
          scheduled_at: '2026-11-25T14:00:00Z',
          outcome_notes: 'Discuss cloud infrastructure scaling options'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.followUp);
      assert.equal(res.data.followUp.title, 'Schedule Q4 Review Call');
      assert.equal(res.data.followUp.note_type, 'follow-up');
      assert.equal(res.data.followUp.client_id, 'client-adapter-1');
      assert.equal(res.data.followUp.project_id, 'project-adapter-1');
      assert.equal(res.data.followUp.client_business, 'Zara Innovations');
      assert.equal(res.data.followUp.project_name, 'Zara Web Platform');

      // Verify row in canonical activity_notes table
      const row = await db.prepare(`SELECT * FROM activity_notes WHERE id = ?`).bind(res.data.followUp.id).first();
      assert.ok(row);
      assert.equal(row.note_type, 'follow-up');
      assert.equal(row.subject, 'Schedule Q4 Review Call');
      assert.equal(row.body, 'Discuss cloud infrastructure scaling options');
      assert.equal(row.created_by, OWNER_UID);

      // Verify audit log
      const audit = await db
        .prepare(`SELECT * FROM audit_logs WHERE action = 'FOLLOW_UP_CREATED' AND entity_id = ?`)
        .bind(res.data.followUp.id)
        .first();
      assert.ok(audit);
    });

    test('1.3 note_type filtering isolates follow-ups from general notes or calls', async () => {
      // Seed a general note and a meeting note into activity_notes
      await db
        .prepare(`INSERT INTO activity_notes (id, client_id, note_type, subject, body, created_by, created_at) VALUES (?, ?, 'note', 'General note', 'Some note content', ?, ?)`)
        .bind('note-gen-1', 'client-adapter-1', OWNER_UID, nowIso)
        .run();
      await db
        .prepare(`INSERT INTO activity_notes (id, client_id, note_type, subject, body, created_by, created_at) VALUES (?, ?, 'meeting', 'Meeting summary', 'Discussed sprint goals', ?, ?)`)
        .bind('note-meet-1', 'client-adapter-1', OWNER_UID, nowIso)
        .run();

      // Seed a follow-up
      await db
        .prepare(`INSERT INTO activity_notes (id, client_id, note_type, subject, body, follow_up_at, created_by, created_at) VALUES (?, ?, 'follow-up', 'Real follow-up', 'Follow-up text', '2026-11-22', ?, ?)`)
        .bind('note-fu-1', 'client-adapter-1', OWNER_UID, nowIso)
        .run();

      const res = await apiCall(env, '/api/hq/follow-ups');
      assert.equal(res.status, 200);
      assert.equal(res.data.followUps.length, 1);
      assert.equal(res.data.followUps[0].id, 'note-fu-1');
      assert.equal(res.data.followUps[0].title, 'Real follow-up');
    });

    test('1.4 Project and client relationship validation rejects non-existent references', async () => {
      const res1 = await apiCall(env, '/api/hq/follow-ups', {
        method: 'POST',
        body: { client_id: 'missing-client', title: 'Call client' }
      });
      assert.equal(res1.status, 404);

      const res2 = await apiCall(env, '/api/hq/follow-ups', {
        method: 'POST',
        body: { project_id: 'missing-project', title: 'Check project' }
      });
      assert.equal(res2.status, 404);

      // Both client and project missing
      const res3 = await apiCall(env, '/api/hq/follow-ups', {
        method: 'POST',
        body: { title: 'No entity link' }
      });
      assert.equal(res3.status, 400);
    });

    test('1.5 Required content validation rejects missing title', async () => {
      const res = await apiCall(env, '/api/hq/follow-ups', {
        method: 'POST',
        body: { client_id: 'client-adapter-1', title: '' }
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error.message, /title is required/i);
    });

    test('1.6 Soft-delete marks archived_at and excludes from listing', async () => {
      const createRes = await apiCall(env, '/api/hq/follow-ups', {
        method: 'POST',
        body: { client_id: 'client-adapter-1', title: 'Temporary follow-up' }
      });
      const fuId = createRes.data.followUp.id;

      const delRes = await apiCall(env, `/api/hq/follow-ups?id=${fuId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);
      assert.equal(delRes.data.archived, true);

      // Verify not hard deleted in DB
      const row = await db.prepare(`SELECT * FROM activity_notes WHERE id = ?`).bind(fuId).first();
      assert.ok(row);
      assert.ok(row.archived_at);

      // Verify GET excludes it
      const listRes = await apiCall(env, '/api/hq/follow-ups');
      assert.equal(listRes.status, 200);
      const found = listRes.data.followUps.find((f) => f.id === fuId);
      assert.equal(found, undefined);
    });

    test('1.7 Authentication failure returns HTTP 401 when token is missing', async () => {
      const res = await apiCall(env, '/api/hq/follow-ups', { token: null });
      assert.equal(res.status, 401);
    });
  });

  // ==========================================
  // 2. PROPOSALS API (via quotations)
  // ==========================================
  describe('2. Proposals API (/api/hq/proposals)', () => {
    test('2.1 Authenticated listing returns empty array on clean database', async () => {
      const res = await apiCall(env, '/api/hq/proposals');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.proposals, []);
    });

    test('2.2 Successful creation maps proposal to canonical quotation record', async () => {
      const res = await apiCall(env, '/api/hq/proposals', {
        method: 'POST',
        body: {
          client_id: 'client-adapter-1',
          project_id: 'project-adapter-1',
          title: 'Enterprise AI Search Solution Proposal',
          executive_summary: 'Comprehensive deployment of AI Studio Lab search indexing and RAG.',
          amount_minor: 4500000,
          currency: 'INR',
          status: 'Draft',
          valid_until: '2026-12-31'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.proposal);
      assert.equal(res.data.proposal.title, 'Enterprise AI Search Solution Proposal');
      assert.equal(res.data.proposal.amount_minor, 4500000);
      assert.equal(res.data.proposal.currency, 'INR');
      assert.equal(res.data.proposal.client_business, 'Zara Innovations');
      assert.equal(res.data.proposal.project_name, 'Zara Web Platform');

      // Verify persisted in canonical quotations table
      const qRow = await db.prepare(`SELECT * FROM quotations WHERE id = ?`).bind(res.data.proposal.id).first();
      assert.ok(qRow);
      assert.equal(qRow.total_minor, 4500000);
      assert.equal(qRow.client_id, 'client-adapter-1');
      assert.equal(qRow.created_by, OWNER_UID);

      // Verify NO invoices were automatically created
      const invCount = await db.prepare(`SELECT count(*) as count FROM invoices WHERE quotation_id = ?`).bind(qRow.id).first('count');
      assert.equal(invCount, 0);

      // Verify audit log
      const audit = await db
        .prepare(`SELECT * FROM audit_logs WHERE action = 'PROPOSAL_CREATED' AND entity_id = ?`)
        .bind(res.data.proposal.id)
        .first();
      assert.ok(audit);
    });

    test('2.3 Invalid client or project relationship returns 404', async () => {
      const res1 = await apiCall(env, '/api/hq/proposals', {
        method: 'POST',
        body: { client_id: 'missing-client', title: 'Proposal' }
      });
      assert.equal(res1.status, 404);

      const res2 = await apiCall(env, '/api/hq/proposals', {
        method: 'POST',
        body: { client_id: 'client-adapter-1', project_id: 'missing-project', title: 'Proposal' }
      });
      assert.equal(res2.status, 404);
    });

    test('2.4 Canonical status handling and update lifecycle', async () => {
      const createRes = await apiCall(env, '/api/hq/proposals', {
        method: 'POST',
        body: { client_id: 'client-adapter-1', title: 'Proposal to update', status: 'Draft' }
      });
      const propId = createRes.data.proposal.id;

      // Update to Sent
      const updateRes = await apiCall(env, '/api/hq/proposals', {
        method: 'PUT',
        body: { id: propId, status: 'Sent' }
      });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.data.proposal.status, 'Sent');
      assert.equal(updateRes.data.proposal.canonical_status, 'sent');

      const qRow = await db.prepare(`SELECT * FROM quotations WHERE id = ?`).bind(propId).first();
      assert.equal(qRow.status, 'sent');
    });

    test('2.5 Soft-delete behavior archives quotation', async () => {
      const createRes = await apiCall(env, '/api/hq/proposals', {
        method: 'POST',
        body: { client_id: 'client-adapter-1', title: 'Proposal to archive' }
      });
      const propId = createRes.data.proposal.id;

      const delRes = await apiCall(env, `/api/hq/proposals?id=${propId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);
      assert.equal(delRes.data.archived, true);

      // Verify row is archived in DB
      const qRow = await db.prepare(`SELECT * FROM quotations WHERE id = ?`).bind(propId).first();
      assert.ok(qRow.archived_at);

      // Verify GET excludes it
      const listRes = await apiCall(env, '/api/hq/proposals');
      const found = listRes.data.proposals.find((p) => p.id === propId);
      assert.equal(found, undefined);
    });

    test('2.6 Authentication failure returns HTTP 401 when unauthenticated', async () => {
      const res = await apiCall(env, '/api/hq/proposals', { token: null });
      assert.equal(res.status, 401);
    });
  });

  // ==========================================
  // 3. EXPENSES API (Safe Compatibility Adapter)
  // ==========================================
  describe('3. Expenses API (/api/hq/expenses)', () => {
    test('3.1 Authenticated GET returns safe empty response schema with zero totals', async () => {
      const res = await apiCall(env, '/api/hq/expenses');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.expenses, []);
      assert.equal(res.data.total_minor, 0);
      assert.equal(res.data.currency, 'INR');
      assert.equal(res.data.supported, false);
      assert.match(res.data.message, /not supported by the active canonical schema/i);
    });

    test('3.2 POST rejects write operations honestly without fake persistence', async () => {
      const res = await apiCall(env, '/api/hq/expenses', {
        method: 'POST',
        body: { description: 'AWS Hosting', amount_minor: 50000 }
      });
      assert.equal(res.status, 400);
      assert.equal(res.data.error.code, 'UNSUPPORTED_OPERATION');
      assert.match(res.data.error.message, /not supported/i);
    });

    test('3.3 DELETE returns 404 cleanly', async () => {
      const res = await apiCall(env, '/api/hq/expenses?id=some-id', { method: 'DELETE' });
      assert.equal(res.status, 404);
    });

    test('3.4 Authentication failure returns HTTP 401 when unauthenticated', async () => {
      const res = await apiCall(env, '/api/hq/expenses', { token: null });
      assert.equal(res.status, 401);
    });
  });

  // ==========================================
  // 4. ONBOARDING API (via project_tasks)
  // ==========================================
  describe('4. Onboarding API (/api/hq/onboarding)', () => {
    test('4.1 Authenticated listing returns empty array on clean database', async () => {
      const res = await apiCall(env, '/api/hq/onboarding');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.items, []);
    });

    test('4.2 Successful creation maps checklist item to project_tasks table', async () => {
      const res = await apiCall(env, '/api/hq/onboarding', {
        method: 'POST',
        body: {
          client_id: 'client-adapter-1',
          project_id: 'project-adapter-1',
          title: 'Obtain Cloudflare DNS zone delegated access',
          notes: 'Customer IT department to add jawed@jawed.co.in as Administrator',
          due_date: '2026-11-30',
          status: 'Pending'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.item);
      assert.equal(res.data.item.title, 'Obtain Cloudflare DNS zone delegated access');
      assert.equal(res.data.item.status, 'Pending');
      assert.equal(res.data.item.project_id, 'project-adapter-1');
      assert.equal(res.data.item.project_name, 'Zara Web Platform');
      assert.equal(res.data.item.client_business, 'Zara Innovations');

      // Verify row in canonical project_tasks table
      const task = await db.prepare(`SELECT * FROM project_tasks WHERE id = ?`).bind(res.data.item.id).first();
      assert.ok(task);
      assert.equal(task.title, 'Obtain Cloudflare DNS zone delegated access');
      assert.equal(task.status, 'todo');
      assert.equal(task.created_by, OWNER_UID);

      // Verify audit log
      const audit = await db
        .prepare(`SELECT * FROM audit_logs WHERE action = 'ONBOARDING_ITEM_CREATED' AND entity_id = ?`)
        .bind(res.data.item.id)
        .first();
      assert.ok(audit);
    });

    test('4.3 Resolution of active project from client_id when project_id is omitted', async () => {
      const res = await apiCall(env, '/api/hq/onboarding', {
        method: 'POST',
        body: {
          client_id: 'client-adapter-1',
          title: 'Collect brand SVGs and primary color hex codes'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.item.project_id, 'project-adapter-1');
    });

    test('4.4 Update operation marks status completed and updates completed_at', async () => {
      const createRes = await apiCall(env, '/api/hq/onboarding', {
        method: 'POST',
        body: { project_id: 'project-adapter-1', title: 'Task to complete' }
      });
      const itemId = createRes.data.item.id;

      const updateRes = await apiCall(env, '/api/hq/onboarding', {
        method: 'PUT',
        body: { id: itemId, status: 'Completed' }
      });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.data.item.status, 'Completed');
      assert.ok(updateRes.data.item.completed_at);

      const task = await db.prepare(`SELECT * FROM project_tasks WHERE id = ?`).bind(itemId).first();
      assert.equal(task.status, 'done');
      assert.ok(task.completed_at);
    });

    test('4.5 Soft deletion archives project task safely', async () => {
      const createRes = await apiCall(env, '/api/hq/onboarding', {
        method: 'POST',
        body: { project_id: 'project-adapter-1', title: 'Task to delete' }
      });
      const itemId = createRes.data.item.id;

      const delRes = await apiCall(env, `/api/hq/onboarding?id=${itemId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);
      assert.equal(delRes.data.archived, true);

      const task = await db.prepare(`SELECT * FROM project_tasks WHERE id = ?`).bind(itemId).first();
      assert.ok(task.archived_at);

      const listRes = await apiCall(env, '/api/hq/onboarding');
      const found = listRes.data.items.find((i) => i.id === itemId);
      assert.equal(found, undefined);
    });

    test('4.6 Authentication failure returns HTTP 401 when unauthenticated', async () => {
      const res = await apiCall(env, '/api/hq/onboarding', { token: null });
      assert.equal(res.status, 401);
    });
  });

  // ==========================================
  // 5. SUPPORT API (Safe Compatibility Adapter)
  // ==========================================
  describe('5. Support API (/api/hq/support)', () => {
    test('5.1 Authenticated GET returns safe empty response schema without SQL errors', async () => {
      const res = await apiCall(env, '/api/hq/support');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.tickets, []);
      assert.equal(res.data.supported, false);
      assert.match(res.data.message, /not supported by the active canonical schema/i);
    });

    test('5.2 POST rejects ticket persistence honestly without fake data', async () => {
      const res = await apiCall(env, '/api/hq/support', {
        method: 'POST',
        body: { client_id: 'client-adapter-1', subject: 'Fix navigation issue' }
      });
      assert.equal(res.status, 400);
      assert.equal(res.data.error.code, 'UNSUPPORTED_OPERATION');
      assert.match(res.data.error.message, /not supported/i);
    });

    test('5.3 DELETE returns 404 cleanly', async () => {
      const res = await apiCall(env, '/api/hq/support?id=ticket-123', { method: 'DELETE' });
      assert.equal(res.status, 404);
    });

    test('5.4 Authentication failure returns HTTP 401 when unauthenticated', async () => {
      const res = await apiCall(env, '/api/hq/support', { token: null });
      assert.equal(res.status, 401);
    });
  });
});
