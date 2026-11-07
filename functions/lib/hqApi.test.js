import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBearerToken, verifyAndAuthorizeOwner, optionsResponse } from './hqApi.js';

const verified = {
  valid: true,
  user: { uid: 'firebase-owner-uid', email: 'jawedimtiaz@gmail.com', emailVerified: true }
};

function makeDb({ userRecord = null, failUserQuery = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              calls.push({ kind: 'first', sql, values });
              if (failUserQuery && sql.includes('FROM hq_users')) throw new Error('simulated query failure');
              if (sql.includes('FROM hq_users')) return userRecord;
              return null;
            },
            async run() {
              calls.push({ kind: 'run', sql, values });
              return { success: true, meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
}

function request(authorization = 'Bearer unit-test-token') {
  return new Request('https://lab.jawed.co.in/api/hq/session', {
    method: 'POST',
    headers: authorization ? { authorization } : {}
  });
}

const verifyToken = async () => verified;

test('extracts Bearer token case-insensitively', () => {
  assert.equal(extractBearerToken(request('bearer abc.def.ghi')), 'abc.def.ghi');
  assert.equal(extractBearerToken(request('Basic abc')), null);
  assert.equal(extractBearerToken(request(null)), null);
});

test('rejects missing bearer token before database access', async () => {
  const db = makeDb();
  const result = await verifyAndAuthorizeOwner(request(null), { HQ_DB: db }, { verifyToken });
  assert.equal(result.authorized, false);
  assert.equal(result.response.status, 401);
  assert.equal(db.calls.length, 0);
});

test('rejects invalid Firebase token', async () => {
  const db = makeDb();
  const result = await verifyAndAuthorizeOwner(request(), { HQ_DB: db }, {
    verifyToken: async () => ({ valid: false, code: 'AUTH_TOKEN_VERIFICATION_FAILED' })
  });
  assert.equal(result.authorized, false);
  assert.equal(result.response.status, 401);
  assert.equal(db.calls.length, 0);
});

test('fails closed when HQ D1 binding is absent', async () => {
  const result = await verifyAndAuthorizeOwner(request(), {}, { verifyToken });
  assert.equal(result.authorized, false);
  assert.equal(result.response.status, 503);
});

test('does not auto-enroll an unregistered Firebase UID', async () => {
  const db = makeDb({ userRecord: null });
  const result = await verifyAndAuthorizeOwner(request(), { HQ_DB: db }, { verifyToken });
  assert.equal(result.authorized, false);
  assert.equal(result.response.status, 403);
  assert.equal((await result.response.json()).error.code, 'OWNER_NOT_ENROLLED');
  assert.equal(db.calls.some((call) => /INSERT INTO hq_users/i.test(call.sql)), false);
  const audit = db.calls.find((call) => /INSERT INTO audit_logs/i.test(call.sql));
  assert.ok(audit);
  assert.equal(audit.values[1], null, 'unknown UID must not violate audit_logs actor_uid foreign key');
});

test('rejects owner email mismatch', async () => {
  const db = makeDb({ userRecord: { uid: verified.user.uid, email: 'different@example.com', display_name: 'Owner', status: 'active' } });
  const result = await verifyAndAuthorizeOwner(request(), { HQ_DB: db }, { verifyToken });
  assert.equal(result.authorized, false);
  assert.equal(result.response.status, 403);
  assert.equal((await result.response.json()).error.code, 'EMAIL_MISMATCH');
});

test('rejects disabled owner records', async () => {
  const db = makeDb({ userRecord: { uid: verified.user.uid, email: verified.user.email, display_name: 'Owner', status: 'disabled' } });
  const result = await verifyAndAuthorizeOwner(request(), { HQ_DB: db }, { verifyToken });
  assert.equal(result.authorized, false);
  assert.equal(result.response.status, 403);
  assert.equal((await result.response.json()).error.code, 'OWNER_DISABLED');
});

test('authorizes active pre-enrolled owner using the live hq_users schema', async () => {
  const record = {
    uid: verified.user.uid,
    email: verified.user.email,
    display_name: 'Jawed',
    status: 'active',
    created_at: '2026-11-07T00:00:00.000Z',
    last_seen_at: null
  };
  const db = makeDb({ userRecord: record });
  const result = await verifyAndAuthorizeOwner(request(), { HQ_DB: db }, { verifyToken });
  assert.equal(result.authorized, true);
  assert.equal(result.owner.uid, verified.user.uid);
  assert.equal(result.owner.displayName, 'Jawed');
  assert.equal(db.calls.some((call) => /UPDATE hq_userss+SET last_seen_at/i.test(call.sql)), true);
  assert.equal(db.calls.some((call) => /INSERT INTO audit_logs/i.test(call.sql)), true);
  assert.equal(db.calls.some((call) => /hq_users.id|last_login_at|hq_audit_logs/i.test(call.sql)), false);
});

test('fails closed when the hq_users lookup fails', async () => {
  const db = makeDb({ failUserQuery: true });
  const result = await verifyAndAuthorizeOwner(request(), { HQ_DB: db }, { verifyToken });
  assert.equal(result.authorized, false);
  assert.equal(result.response.status, 503);
});


test('rejects cross-origin HQ preflight requests', async () => {
  const req = new Request('https://lab.jawed.co.in/api/hq/clients', {
    method: 'OPTIONS',
    headers: { origin: 'https://attacker.example' }
  });
  const response = optionsResponse(req, 'GET, POST, OPTIONS');
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'ORIGIN_NOT_ALLOWED');
});

test('allows same-origin HQ preflight requests without wildcard CORS', async () => {
  const req = new Request('https://lab.jawed.co.in/api/hq/clients', {
    method: 'OPTIONS',
    headers: { origin: 'https://lab.jawed.co.in' }
  });
  const response = optionsResponse(req, 'GET, POST, OPTIONS');
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
