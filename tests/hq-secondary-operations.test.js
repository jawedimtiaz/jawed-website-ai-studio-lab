// tests/hq-secondary-operations.test.js
// Focused automated test suite for Phase 3AB.3: Secondary Operations Endpoints Remediation
// (contacts.js, notes.js, tasks.js, milestones.js)

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { clearJwksCacheForTests } from '../functions/lib/hqAuth.js';
import { dispatchHqApiRequest } from '../functions/lib/hqRouter.js';
import { createLocalD1, applyHqMigrations } from '../functions/lib/localD1.js';
import { normalizeNoteType } from '../functions/api/hq/notes.js';
import { normalizeTaskStatus, normalizeTaskPriority } from '../functions/api/hq/tasks.js';
import { normalizeMilestoneStatus } from '../functions/api/hq/milestones.js';

const PROJECT_ID = 'test-secondary-ops-project';
const KEY_ID = 'sec-ops-key-1';
const OWNER_UID = 'owner-uid-secondary-ops';
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

describe('Phase 3AB.3 — Secondary Operations Endpoints Remediation Suite', () => {
  let db;
  let env;
  let originalFetch;
  let testClientId;
  let testProjectId;

  beforeEach(async () => {
    clearJwksCacheForTests();
    originalFetch = globalThis.fetch;
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

    const nowIso = new Date().toISOString();
    // Seed authenticated owner user
    await db
      .prepare(
        `INSERT INTO hq_users (uid, email, display_name, status, created_at, last_seen_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      )
      .bind(OWNER_UID, OWNER_EMAIL, 'Jawed Imtiaz', nowIso, nowIso)
      .run();

    // Seed test customer
    testClientId = 'cli-test-secops-001';
    await db
      .prepare(
        `INSERT INTO clients (
          id, client_code, name, business_name, status, email, phone, created_by, updated_by, created_at, updated_at
        ) VALUES (?, 'CLI-SEC', 'Acme Corp', 'Acme Corporation', 'active', 'contact@acme.example', '+919999999999', ?, ?, ?, ?)`
      )
      .bind(testClientId, OWNER_UID, OWNER_UID, nowIso, nowIso)
      .run();

    // Seed test project
    testProjectId = 'prj-test-secops-001';
    await db
      .prepare(
        `INSERT INTO projects (
          id, project_code, client_id, name, project_type, status, priority,
          currency, quoted_amount_minor, created_by, updated_by, created_at, updated_at
        ) VALUES (?, 'PRJ-SEC', ?, 'NextGen Portal', 'business-website', 'in-progress', 'normal', 'INR', 15000000, ?, ?, ?, ?)`
      )
      .bind(testProjectId, testClientId, OWNER_UID, OWNER_UID, nowIso, nowIso)
      .run();

    env = {
      ENVIRONMENT: 'test',
      FIREBASE_PROJECT_ID: PROJECT_ID,
      HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com,jawed@jawed.co.in',
      HQ_DB: db
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearJwksCacheForTests();
    db.close();
  });

  // =========================================================================
  // 1. Client Contacts Remediation (/api/hq/contacts)
  // =========================================================================
  describe('1. Client Contacts API (/api/hq/contacts)', () => {
    test('1.1 Create contact using canonical full_name and role_title', async () => {
      const res = await apiCall(env, '/api/hq/contacts', {
        method: 'POST',
        body: {
          client_id: testClientId,
          full_name: 'Priya Sharma',
          role_title: 'Finance Director',
          email: 'priya@acme.example',
          phone: '+919876543210',
          is_primary: true,
          notes: 'Key decision maker'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.equal(res.data.contact.full_name, 'Priya Sharma');
      assert.equal(res.data.contact.name, 'Priya Sharma');
      assert.equal(res.data.contact.role_title, 'Finance Director');
      assert.equal(res.data.contact.role, 'Finance Director');
      assert.equal(res.data.contact.is_primary, 1);

      // Verify directly in database
      const row = await db.prepare(`SELECT * FROM client_contacts WHERE id = ?`).bind(res.data.contact.id).first();
      assert.ok(row);
      assert.equal(row.full_name, 'Priya Sharma');
      assert.equal(row.role_title, 'Finance Director');
    });

    test('1.2 Create contact using legacy name and role backward compatibility', async () => {
      const res = await apiCall(env, '/api/hq/contacts', {
        method: 'POST',
        body: {
          clientId: testClientId,
          name: 'Rahul Mehta',
          role: 'Tech Lead',
          email: 'rahul@acme.example'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.contact.full_name, 'Rahul Mehta');
      assert.equal(res.data.contact.name, 'Rahul Mehta');
      assert.equal(res.data.contact.role_title, 'Tech Lead');
      assert.equal(res.data.contact.role, 'Tech Lead');
    });

    test('1.3 Enforce single primary contact per customer', async () => {
      const c1 = await apiCall(env, '/api/hq/contacts', {
        method: 'POST',
        body: { client_id: testClientId, full_name: 'Contact 1', is_primary: true }
      });
      assert.equal(c1.status, 201);

      const c2 = await apiCall(env, '/api/hq/contacts', {
        method: 'POST',
        body: { client_id: testClientId, full_name: 'Contact 2', is_primary: true }
      });
      assert.equal(c2.status, 201);

      // First contact must no longer be primary
      const row1 = await db.prepare(`SELECT is_primary FROM client_contacts WHERE id = ?`).bind(c1.data.contact.id).first();
      const row2 = await db.prepare(`SELECT is_primary FROM client_contacts WHERE id = ?`).bind(c2.data.contact.id).first();
      assert.equal(row1.is_primary, 0);
      assert.equal(row2.is_primary, 1);
    });

    test('1.4 GET contacts with query search and client filtering', async () => {
      await apiCall(env, '/api/hq/contacts', {
        method: 'POST',
        body: { client_id: testClientId, full_name: 'Aarav Patel', email: 'aarav@acme.example' }
      });
      await apiCall(env, '/api/hq/contacts', {
        method: 'POST',
        body: { client_id: testClientId, full_name: 'Neha Gupta', email: 'neha@acme.example' }
      });

      const listRes = await apiCall(env, `/api/hq/contacts?clientId=${testClientId}&q=aarav`);
      assert.equal(listRes.status, 200);
      assert.equal(listRes.data.contacts.length, 1);
      assert.equal(listRes.data.contacts[0].full_name, 'Aarav Patel');
    });

    test('1.5 PUT contact updates record cleanly', async () => {
      const created = await apiCall(env, '/api/hq/contacts', {
        method: 'POST',
        body: { client_id: testClientId, full_name: 'Draft Name', role_title: 'Junior' }
      });

      const updated = await apiCall(env, '/api/hq/contacts', {
        method: 'PUT',
        body: { id: created.data.contact.id, name: 'Senior Name', role: 'VP Engineering' }
      });

      assert.equal(updated.status, 200);
      assert.equal(updated.data.contact.full_name, 'Senior Name');
      assert.equal(updated.data.contact.role_title, 'VP Engineering');
    });

    test('1.6 DELETE contact soft-archives by default and excludes from normal listing', async () => {
      const created = await apiCall(env, '/api/hq/contacts', {
        method: 'POST',
        body: { client_id: testClientId, full_name: 'To Archive' }
      });
      const contactId = created.data.contact.id;

      const delRes = await apiCall(env, `/api/hq/contacts?id=${contactId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);

      // Verify soft delete in DB
      const row = await db.prepare(`SELECT archived_at, archived_by FROM client_contacts WHERE id = ?`).bind(contactId).first();
      assert.ok(row.archived_at);
      assert.equal(row.archived_by, OWNER_UID);

      // Normal listing must exclude archived contact
      const listRes = await apiCall(env, `/api/hq/contacts?clientId=${testClientId}`);
      assert.equal(listRes.data.contacts.length, 0);

      // Include archived listing must return it
      const incRes = await apiCall(env, `/api/hq/contacts?clientId=${testClientId}&includeArchived=true`);
      assert.equal(incRes.data.contacts.length, 1);
    });

    test('1.7 Rejection of invalid inputs and non-existent customers', async () => {
      const missingName = await apiCall(env, '/api/hq/contacts', {
        method: 'POST',
        body: { client_id: testClientId }
      });
      assert.equal(missingName.status, 400);

      const invalidClient = await apiCall(env, '/api/hq/contacts', {
        method: 'POST',
        body: { client_id: 'non-existent-client', full_name: 'Ghost' }
      });
      assert.equal(invalidClient.status, 404);
    });
  });

  // =========================================================================
  // 2. Activity / Communication Notes Remediation (/api/hq/notes)
  // =========================================================================
  describe('2. Activity & Notes API (/api/hq/notes)', () => {
    test('2.1 Create note with content and capitalized note_type without last_contact_at error', async () => {
      const res = await apiCall(env, '/api/hq/notes', {
        method: 'POST',
        body: {
          client_id: testClientId,
          project_id: testProjectId,
          note_type: 'Call',
          subject: 'Scope Alignment Call',
          content: 'Discussed architectural boundaries and approved timelines.'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.equal(res.data.note.note_type, 'call');
      assert.equal(res.data.note.body, 'Discussed architectural boundaries and approved timelines.');
      assert.equal(res.data.note.content, 'Discussed architectural boundaries and approved timelines.');
      assert.equal(res.data.note.created_by, OWNER_UID);

      // Verify database row
      const row = await db.prepare(`SELECT * FROM activity_notes WHERE id = ?`).bind(res.data.note.id).first();
      assert.ok(row);
      assert.equal(row.body, 'Discussed architectural boundaries and approved timelines.');
      assert.equal(row.note_type, 'call');
      assert.equal(row.created_by, OWNER_UID);
    });

    test('2.2 Normalization of note types across allowed enum values', async () => {
      assert.equal(normalizeNoteType('Call'), 'call');
      assert.equal(normalizeNoteType('EMAIL'), 'email');
      assert.equal(normalizeNoteType('Meeting'), 'meeting');
      assert.equal(normalizeNoteType('follow-up'), 'follow-up');
      assert.equal(normalizeNoteType('followup'), 'follow-up');
      assert.equal(normalizeNoteType('Decision'), 'decision');
      assert.equal(normalizeNoteType('Blocker'), 'blocker');
      assert.equal(normalizeNoteType('UnknownType'), 'note');
    });

    test('2.3 GET notes filtered by client_id, project_id, and note_type', async () => {
      await apiCall(env, '/api/hq/notes', {
        method: 'POST',
        body: { client_id: testClientId, note_type: 'call', content: 'Call 1' }
      });
      await apiCall(env, '/api/hq/notes', {
        method: 'POST',
        body: { client_id: testClientId, note_type: 'email', content: 'Email 1' }
      });

      const callNotes = await apiCall(env, `/api/hq/notes?clientId=${testClientId}&noteType=call`);
      assert.equal(callNotes.status, 200);
      assert.equal(callNotes.data.notes.length, 1);
      assert.equal(callNotes.data.notes[0].note_type, 'call');
    });

    test('2.4 DELETE note soft-archives record safely', async () => {
      const created = await apiCall(env, '/api/hq/notes', {
        method: 'POST',
        body: { client_id: testClientId, content: 'To Soft Archive' }
      });
      const noteId = created.data.note.id;

      const delRes = await apiCall(env, `/api/hq/notes?id=${noteId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);

      const dbNote = await db.prepare(`SELECT archived_at, archived_by FROM activity_notes WHERE id = ?`).bind(noteId).first();
      assert.ok(dbNote.archived_at);
      assert.equal(dbNote.archived_by, OWNER_UID);
    });

    test('2.5 Input validation rejects missing client/project or empty body', async () => {
      const noTarget = await apiCall(env, '/api/hq/notes', {
        method: 'POST',
        body: { content: 'No client or project' }
      });
      assert.equal(noTarget.status, 400);

      const noBody = await apiCall(env, '/api/hq/notes', {
        method: 'POST',
        body: { client_id: testClientId }
      });
      assert.equal(noBody.status, 400);
    });
  });

  // =========================================================================
  // 3. Project Tasks Remediation (/api/hq/tasks)
  // =========================================================================
  describe('3. Project Tasks API (/api/hq/tasks)', () => {
    test('3.1 Create task normalizes capitalized status and priority to lowercase CHECK values', async () => {
      const res = await apiCall(env, '/api/hq/tasks', {
        method: 'POST',
        body: {
          project_id: testProjectId,
          title: 'Setup Database Connection',
          status: 'Todo',
          priority: 'High'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.equal(res.data.task.status, 'todo');
      assert.equal(res.data.task.priority, 'high');

      // Verify row in SQLite with active check constraints
      const row = await db.prepare(`SELECT * FROM project_tasks WHERE id = ?`).bind(res.data.task.id).first();
      assert.ok(row);
      assert.equal(row.status, 'todo');
      assert.equal(row.priority, 'high');
    });

    test('3.2 Normalization handles In Progress, Completed, Critical and Review statuses', async () => {
      assert.equal(normalizeTaskStatus('Todo'), 'todo');
      assert.equal(normalizeTaskStatus('In Progress'), 'in-progress');
      assert.equal(normalizeTaskStatus('Review'), 'done');
      assert.equal(normalizeTaskStatus('Completed'), 'done');
      assert.equal(normalizeTaskStatus('Done'), 'done');
      assert.equal(normalizeTaskStatus('Blocked'), 'blocked');
      assert.equal(normalizeTaskStatus('Cancelled'), 'cancelled');

      assert.equal(normalizeTaskPriority('Low'), 'low');
      assert.equal(normalizeTaskPriority('Medium'), 'normal');
      assert.equal(normalizeTaskPriority('Normal'), 'normal');
      assert.equal(normalizeTaskPriority('High'), 'high');
      assert.equal(normalizeTaskPriority('Critical'), 'urgent');
      assert.equal(normalizeTaskPriority('Urgent'), 'urgent');
    });

    test('3.3 Completed task populates completed_at timestamp', async () => {
      const res = await apiCall(env, '/api/hq/tasks', {
        method: 'POST',
        body: {
          project_id: testProjectId,
          title: 'Completed Task',
          status: 'Completed'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.task.status, 'done');
      assert.ok(res.data.task.completed_at);
    });

    test('3.4 Assigned to foreign key protection avoids constraint crash for non-UID strings', async () => {
      // Legacy code passed 'Jawed Imtiaz' string, which violates foreign key hq_users(uid)
      const res = await apiCall(env, '/api/hq/tasks', {
        method: 'POST',
        body: {
          project_id: testProjectId,
          title: 'Safe Assigned Task',
          assigned_to: 'Jawed Imtiaz'
        }
      });

      assert.equal(res.status, 201);
      // Because 'Jawed Imtiaz' is not a uid/email in hq_users, it is resolved safely to null
      assert.equal(res.data.task.assigned_to, null);

      // Now pass the actual OWNER_UID
      const validRes = await apiCall(env, '/api/hq/tasks', {
        method: 'POST',
        body: {
          project_id: testProjectId,
          title: 'Owner Assigned Task',
          assigned_to: OWNER_UID
        }
      });
      assert.equal(validRes.status, 201);
      assert.equal(validRes.data.task.assigned_to, OWNER_UID);
    });

    test('3.5 PUT task updates status and respects lowercase constraints', async () => {
      const created = await apiCall(env, '/api/hq/tasks', {
        method: 'POST',
        body: { project_id: testProjectId, title: 'Sprint Backlog Item', status: 'Todo' }
      });

      const updated = await apiCall(env, '/api/hq/tasks', {
        method: 'PUT',
        body: {
          id: created.data.task.id,
          status: 'In Progress',
          priority: 'Critical'
        }
      });

      assert.equal(updated.status, 200);
      assert.equal(updated.data.task.status, 'in-progress');
      assert.equal(updated.data.task.priority, 'urgent');
    });

    test('3.6 DELETE task soft-archives and excludes from active list', async () => {
      const created = await apiCall(env, '/api/hq/tasks', {
        method: 'POST',
        body: { project_id: testProjectId, title: 'Task To Delete' }
      });
      const taskId = created.data.task.id;

      const delRes = await apiCall(env, `/api/hq/tasks?id=${taskId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);

      const dbTask = await db.prepare(`SELECT archived_at, archived_by FROM project_tasks WHERE id = ?`).bind(taskId).first();
      assert.ok(dbTask.archived_at);
      assert.equal(dbTask.archived_by, OWNER_UID);

      const listRes = await apiCall(env, `/api/hq/tasks?projectId=${testProjectId}`);
      assert.equal(listRes.data.tasks.some(t => t.id === taskId), false);
    });
  });

  // =========================================================================
  // 4. Project Milestones Remediation (/api/hq/milestones)
  // =========================================================================
  describe('4. Project Milestones API (/api/hq/milestones)', () => {
    test('4.1 Create milestone normalizes capitalized status to lowercase CHECK values', async () => {
      const res = await apiCall(env, '/api/hq/milestones', {
        method: 'POST',
        body: {
          project_id: testProjectId,
          name: 'Phase 1 MVP Release',
          status: 'Pending',
          due_date: '2026-12-31'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.equal(res.data.milestone.status, 'not-started');

      const row = await db.prepare(`SELECT * FROM project_milestones WHERE id = ?`).bind(res.data.milestone.id).first();
      assert.ok(row);
      assert.equal(row.status, 'not-started');
    });

    test('4.2 Normalization handles In Progress, Completed, Delayed and Skipped', async () => {
      assert.equal(normalizeMilestoneStatus('Pending'), 'not-started');
      assert.equal(normalizeMilestoneStatus('not-started'), 'not-started');
      assert.equal(normalizeMilestoneStatus('In Progress'), 'in-progress');
      assert.equal(normalizeMilestoneStatus('Completed'), 'completed');
      assert.equal(normalizeMilestoneStatus('Delayed'), 'blocked');
      assert.equal(normalizeMilestoneStatus('Blocked'), 'blocked');
      assert.equal(normalizeMilestoneStatus('Skipped'), 'skipped');
    });

    test('4.3 Completed milestone records completed_at timestamp', async () => {
      const res = await apiCall(env, '/api/hq/milestones', {
        method: 'POST',
        body: {
          project_id: testProjectId,
          name: 'Launch Complete',
          status: 'Completed'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.milestone.status, 'completed');
      assert.ok(res.data.milestone.completed_at);
    });

    test('4.4 PUT milestone updates attributes and status cleanly', async () => {
      const created = await apiCall(env, '/api/hq/milestones', {
        method: 'POST',
        body: { project_id: testProjectId, name: 'Initial Milestone', status: 'Pending' }
      });

      const updated = await apiCall(env, '/api/hq/milestones', {
        method: 'PUT',
        body: {
          id: created.data.milestone.id,
          name: 'Updated Milestone Name',
          status: 'In Progress'
        }
      });

      assert.equal(updated.status, 200);
      assert.equal(updated.data.milestone.name, 'Updated Milestone Name');
      assert.equal(updated.data.milestone.status, 'in-progress');
    });

    test('4.5 DELETE milestone soft-archives and excludes from active list', async () => {
      const created = await apiCall(env, '/api/hq/milestones', {
        method: 'POST',
        body: { project_id: testProjectId, name: 'Milestone To Delete' }
      });
      const msId = created.data.milestone.id;

      const delRes = await apiCall(env, `/api/hq/milestones?id=${msId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);

      const dbMs = await db.prepare(`SELECT archived_at, archived_by FROM project_milestones WHERE id = ?`).bind(msId).first();
      assert.ok(dbMs.archived_at);
      assert.equal(dbMs.archived_by, OWNER_UID);

      const listRes = await apiCall(env, `/api/hq/milestones?projectId=${testProjectId}`);
      assert.equal(listRes.data.milestones.some(m => m.id === msId), false);
    });
  });

  // =========================================================================
  // 5. Authentication & Owner Authorization across all 4 endpoints
  // =========================================================================
  describe('5. Auth & Security Across Secondary Operations Endpoints', () => {
    const endpoints = [
      '/api/hq/contacts',
      '/api/hq/notes',
      '/api/hq/tasks',
      '/api/hq/milestones'
    ];

    for (const ep of endpoints) {
      test(`5.1 ${ep} rejects unauthenticated requests with HTTP 401`, async () => {
        const getRes = await apiCall(env, ep, { token: null });
        assert.equal(getRes.status, 401);

        const postRes = await apiCall(env, ep, { method: 'POST', body: {}, token: null });
        assert.equal(postRes.status, 401);
      });

      test(`5.2 ${ep} rejects non-allowlisted owner emails with HTTP 403`, async () => {
        const rogueToken = signTestToken('attacker-uid', 'attacker@malicious.example');
        const res = await apiCall(env, ep, { token: rogueToken });
        assert.equal(res.status, 403);
      });
    }
  });
});
