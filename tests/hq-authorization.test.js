// tests/hq-authorization.test.js
// Automated Unit & Integration Tests for Studio HQ Owner Authorization Hardening

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { verifyFirebaseToken, decodeJwt } from '../functions/lib/hqAuth.js';
import { verifyAndAuthorizeOwner, auditLog } from '../functions/lib/hqApi.js';
import { onRequestGet as sessionGet, onRequestPost as sessionPost } from '../functions/api/hq/session.js';
import { onRequestGet as clientsGet, onRequestPost as clientsPost } from '../functions/api/hq/clients.js';
import { onRequestGet as projectsGet, onRequestPost as projectsPost } from '../functions/api/hq/projects.js';

const PROJECT_ID = 'ai-studio-jawedwebsitelab-4bc53041-fd07-456d-9201-88b74a102fcb';

/**
 * Creates a mock Base64URL-encoded RS256 JWT for testing.
 */
function createMockToken({
  uid = 'owner-uid-123',
  email = 'jawedimtiaz@gmail.com',
  emailVerified = true,
  exp = Math.floor(Date.now() / 1000) + 3600,
  iss = `https://securetoken.google.com/${PROJECT_ID}`,
  aud = PROJECT_ID,
  alg = 'RS256'
} = {}) {
  const header = { alg, typ: 'JWT' };
  const payload = {
    iss,
    aud,
    sub: uid,
    user_id: uid,
    email,
    email_verified: emailVerified,
    exp,
    auth_time: Math.floor(Date.now() / 1000) - 10
  };

  const toB64Url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  return `${toB64Url(header)}.${toB64Url(payload)}.mockSignatureString123`;
}

/**
 * In-Memory Mock D1 Database Implementation for Node Tests.
 */
class MockD1Database {
  constructor(initialUsers = [], initialAuditLogs = [], initialClients = [], initialProjects = []) {
    this.users = new Map(initialUsers.map((u) => [u.id, { ...u }]));
    this.auditLogs = [...initialAuditLogs];
    this.clients = new Map(initialClients.map((c) => [c.id, { ...c }]));
    this.projects = new Map(initialProjects.map((p) => [p.id, { ...p }]));
  }

  prepare(sql) {
    const db = this;
    let boundParams = [];

    const stmt = {
      bind(...params) {
        boundParams = params;
        return stmt;
      },

      async first() {
        if (sql.includes('SELECT id, email, role, status')) {
          const uid = boundParams[0];
          return db.users.get(uid) || null;
        }
        if (sql.includes('SELECT COUNT(*) as total FROM hq_users')) {
          return { total: db.users.size };
        }
        return null;
      },

      async all() {
        if (sql.includes('FROM hq_clients')) {
          return { results: Array.from(db.clients.values()) };
        }
        if (sql.includes('FROM hq_projects')) {
          return { results: Array.from(db.projects.values()) };
        }
        return { results: [] };
      },

      async run() {
        if (sql.includes('INSERT INTO hq_users')) {
          const [id, email, role, status, created_at, updated_at, last_login_at] = boundParams;
          if (!db.users.has(id)) {
            db.users.set(id, { id, email, role, status, created_at, updated_at, last_login_at });
          }
          return { meta: { changes: 1 } };
        }

        if (sql.includes('UPDATE hq_users')) {
          const [last_login_at, updated_at, id] = boundParams;
          const user = db.users.get(id);
          // Crucial test requirement: UPDATE hq_users SET ... WHERE status = 'active'
          if (user && user.status === 'active') {
            user.last_login_at = last_login_at;
            user.updated_at = updated_at;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }

        if (sql.includes('INSERT INTO hq_audit_logs')) {
          const [id, user_id, action, status, details, ip_address, created_at] = boundParams;
          db.auditLogs.push({ id, user_id, action, status, details, ip_address, created_at });
          return { meta: { changes: 1 } };
        }

        if (sql.includes('INSERT INTO hq_clients')) {
          const [id, name, company, email, phone, status, created_at, updated_at] = boundParams;
          db.clients.set(id, { id, name, company, email, phone, status, created_at, updated_at });
          return { meta: { changes: 1 } };
        }

        if (sql.includes('INSERT INTO hq_projects')) {
          const [id, client_id, title, description, status, budget, created_at, updated_at] = boundParams;
          db.projects.set(id, { id, client_id, title, description, status, budget, created_at, updated_at });
          return { meta: { changes: 1 } };
        }

        return { meta: { changes: 0 } };
      }
    };

    return stmt;
  }
}

describe('Studio HQ Owner Authorization Hardening Suite', () => {
  const env = {
    FIREBASE_PROJECT_ID: PROJECT_ID,
    HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com'
  };

  test('1. Authorized active owner succeeds', async () => {
    const db = new MockD1Database([
      { id: 'uid-active-1', email: 'jawedimtiaz@gmail.com', role: 'owner', status: 'active', created_at: Date.now(), updated_at: Date.now() }
    ]);
    const token = createMockToken({ uid: 'uid-active-1', email: 'jawedimtiaz@gmail.com' });
    const req = new Request('https://lab.jawed.co.in/api/hq/session', {
      headers: { authorization: `Bearer ${token}` }
    });

    const result = await verifyAndAuthorizeOwner(req, { ...env, HQ_DB: db });
    assert.equal(result.authorized, true);
    assert.equal(result.owner.id, 'uid-active-1');
    assert.equal(result.owner.status, 'active');
  });

  test('2. Disabled owner is rejected with HTTP 403 OWNER_DISABLED', async () => {
    const db = new MockD1Database([
      { id: 'uid-disabled-1', email: 'jawedimtiaz@gmail.com', role: 'owner', status: 'disabled', created_at: Date.now(), updated_at: Date.now() }
    ]);
    const token = createMockToken({ uid: 'uid-disabled-1', email: 'jawedimtiaz@gmail.com' });
    const req = new Request('https://lab.jawed.co.in/api/hq/session', {
      headers: { authorization: `Bearer ${token}` }
    });

    const result = await verifyAndAuthorizeOwner(req, { ...env, HQ_DB: db });
    assert.equal(result.authorized, false);

    const body = await result.response.json();
    assert.equal(result.response.status, 403);
    assert.equal(body.error.code, 'OWNER_DISABLED');
  });

  test('3. First-owner bootstrap enrollment creates active owner when DB is empty', async () => {
    const db = new MockD1Database([]); // Empty DB
    const token = createMockToken({ uid: 'uid-first-owner', email: 'jawedimtiaz@gmail.com' });
    const req = new Request('https://lab.jawed.co.in/api/hq/session', {
      headers: { authorization: `Bearer ${token}` }
    });

    const result = await verifyAndAuthorizeOwner(req, { ...env, HQ_DB: db });
    assert.equal(result.authorized, true);
    assert.equal(result.owner.id, 'uid-first-owner');
    assert.equal(result.owner.status, 'active');

    // Verify audit log entry
    const audit = db.auditLogs.find((l) => l.action === 'OWNER_ENROLLED');
    assert.ok(audit);
    assert.equal(audit.user_id, 'uid-first-owner');
  });

  test('4. Missing owner rejected when owners already exist in DB', async () => {
    const db = new MockD1Database([
      { id: 'existing-owner', email: 'jawedimtiaz@gmail.com', role: 'owner', status: 'active', created_at: Date.now(), updated_at: Date.now() }
    ]);
    const token = createMockToken({ uid: 'unregistered-uid', email: 'jawedimtiaz@gmail.com' });
    const req = new Request('https://lab.jawed.co.in/api/hq/session', {
      headers: { authorization: `Bearer ${token}` }
    });

    const result = await verifyAndAuthorizeOwner(req, { ...env, HQ_DB: db });
    assert.equal(result.authorized, false);

    const body = await result.response.json();
    assert.equal(result.response.status, 403);
    assert.equal(body.error.code, 'OWNER_NOT_ENROLLED');
  });

  test('5. Email mismatch between Firebase token and stored D1 record is rejected with HTTP 403', async () => {
    const db = new MockD1Database([
      { id: 'uid-mismatch', email: 'different@gmail.com', role: 'owner', status: 'active', created_at: Date.now(), updated_at: Date.now() }
    ]);
    const token = createMockToken({ uid: 'uid-mismatch', email: 'jawedimtiaz@gmail.com' });
    const req = new Request('https://lab.jawed.co.in/api/hq/session', {
      headers: { authorization: `Bearer ${token}` }
    });

    const result = await verifyAndAuthorizeOwner(req, { ...env, HQ_DB: db });
    assert.equal(result.authorized, false);

    const body = await result.response.json();
    assert.equal(result.response.status, 403);
    assert.equal(body.error.code, 'EMAIL_MISMATCH');
  });

  test('6. Unauthorized Firebase account (not in allowlist) is rejected with HTTP 403', async () => {
    const db = new MockD1Database([]);
    const token = createMockToken({ uid: 'attacker-uid', email: 'attacker@evil.com' });
    const req = new Request('https://lab.jawed.co.in/api/hq/session', {
      headers: { authorization: `Bearer ${token}` }
    });

    const result = await verifyAndAuthorizeOwner(req, { ...env, HQ_DB: db });
    assert.equal(result.authorized, false);

    const body = await result.response.json();
    assert.equal(result.response.status, 403);
    assert.equal(body.error.code, 'UNAUTHORIZED_EMAIL');
  });

  test('7. Missing HQ_DB binding fails closed with HTTP 503 DATABASE_UNAVAILABLE', async () => {
    const token = createMockToken({ uid: 'uid-active-1', email: 'jawedimtiaz@gmail.com' });
    const req = new Request('https://lab.jawed.co.in/api/hq/session', {
      headers: { authorization: `Bearer ${token}` }
    });

    const result = await verifyAndAuthorizeOwner(req, { ...env, HQ_DB: null });
    assert.equal(result.authorized, false);

    const body = await result.response.json();
    assert.equal(result.response.status, 503);
    assert.equal(body.error.code, 'DATABASE_UNAVAILABLE');
  });

  test('8. Disabled owner status CANNOT be reactivated by login attempt', async () => {
    const db = new MockD1Database([
      { id: 'disabled-user', email: 'jawedimtiaz@gmail.com', role: 'owner', status: 'disabled', created_at: Date.now(), updated_at: Date.now() }
    ]);
    const token = createMockToken({ uid: 'disabled-user', email: 'jawedimtiaz@gmail.com' });
    const req = new Request('https://lab.jawed.co.in/api/hq/session', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` }
    });

    const result = await verifyAndAuthorizeOwner(req, { ...env, HQ_DB: db });
    assert.equal(result.authorized, false);

    // Verify stored user status remains 'disabled' in D1
    const storedUser = db.users.get('disabled-user');
    assert.equal(storedUser.status, 'disabled');
  });

  test('9. Disabled owner cannot access Session, CRM Clients, or Projects APIs', async () => {
    const db = new MockD1Database([
      { id: 'disabled-user', email: 'jawedimtiaz@gmail.com', role: 'owner', status: 'disabled', created_at: Date.now(), updated_at: Date.now() }
    ]);
    const token = createMockToken({ uid: 'disabled-user', email: 'jawedimtiaz@gmail.com' });
    const headers = { authorization: `Bearer ${token}` };

    const ctx = { request: new Request('https://lab.jawed.co.in/api/hq/session', { headers }), env: { ...env, HQ_DB: db } };

    const sessionRes = await sessionGet(ctx);
    assert.equal(sessionRes.status, 403);

    const clientsRes = await clientsGet({ ...ctx, request: new Request('https://lab.jawed.co.in/api/hq/clients', { headers }) });
    assert.equal(clientsRes.status, 403);

    const projectsRes = await projectsGet({ ...ctx, request: new Request('https://lab.jawed.co.in/api/hq/projects', { headers }) });
    assert.equal(projectsRes.status, 403);
  });

  test('10. Concurrent first-owner enrollment cannot create unauthorized access', async () => {
    const db = new MockD1Database([]); // Empty DB
    const token1 = createMockToken({ uid: 'owner-1', email: 'jawedimtiaz@gmail.com' });
    const token2 = createMockToken({ uid: 'owner-2', email: 'jawedimtiaz@gmail.com' });

    const req1 = new Request('https://lab.jawed.co.in/api/hq/session', { headers: { authorization: `Bearer ${token1}` } });
    const req2 = new Request('https://lab.jawed.co.in/api/hq/session', { headers: { authorization: `Bearer ${token2}` } });

    // Execute first owner enrollment
    const res1 = await verifyAndAuthorizeOwner(req1, { ...env, HQ_DB: db });
    assert.equal(res1.authorized, true);
    assert.equal(res1.owner.id, 'owner-1');

    // Attempt second owner enrollment concurrently (DB is no longer empty)
    const res2 = await verifyAndAuthorizeOwner(req2, { ...env, HQ_DB: db });
    assert.equal(res2.authorized, false);

    const body2 = await res2.response.json();
    assert.equal(res2.response.status, 403);
    assert.equal(body2.error.code, 'OWNER_NOT_ENROLLED');
  });
});
