import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getHqClientIp, hqRateLimitResponse, checkHqRateLimit } from './hqRateLimit.js';
import { onRequestPost as hqSessionPost, onRequestOptions as hqSessionOptions } from '../api/hq/session.js';
import { handleAuthorizedHqClients } from '../api/hq/clients.js';
import { handleAuthorizedHqProjects } from '../api/hq/projects.js';
import { handleAuthorizedHqRelease } from '../api/hq/release.js';
import worker from '../../worker.js';

class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec(readFileSync('migrations/hq/0001_studio_hq_schema.sql', 'utf8'));
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
        (/\bRETURNING\b/i.test(statement.sql) || /^\s*SELECT\b/i.test(statement.sql))
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
  close() { this.sqlite.close(); }
}

const identity = { uid: 'owner-ratelimit-test', email: 'jawedimtiaz@gmail.com' };

function makeLimiter(success = true) {
  const calls = [];
  return {
    calls,
    limit: async ({ key }) => {
      calls.push(key);
      return { success };
    }
  };
}

test('getHqClientIp resolves client IP with priority and fallback', () => {
  const reqCf = new Request('https://lab.jawed.co.in/api/hq/session', {
    headers: { 'cf-connecting-ip': '203.0.113.195' }
  });
  assert.equal(getHqClientIp(reqCf), '203.0.113.195');

  const reqXff = new Request('https://lab.jawed.co.in/api/hq/session', {
    headers: { 'x-forwarded-for': '198.51.100.42, 10.0.0.1' }
  });
  assert.equal(getHqClientIp(reqXff), '198.51.100.42');

  const reqFallback = new Request('https://lab.jawed.co.in/api/hq/session');
  assert.equal(getHqClientIp(reqFallback), '127.0.0.1');
});

test('hqRateLimitResponse builds RFC-compliant HTTP 429 response', async () => {
  const res = hqRateLimitResponse(30);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '30');
  assert.equal(res.headers.get('cache-control'), 'no-store, private, max-age=0');
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await res.json(), {
    ok: false,
    error: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 30
  });
});

test('checkHqRateLimit passes through safely when no binding is present', async () => {
  const req = new Request('https://lab.jawed.co.in/api/hq/session');
  const result = await checkHqRateLimit(req, {}, { type: 'session' });
  assert.equal(result.ok, true);
});

test('checkHqRateLimit keys pre-auth session requests by IP and enforces limit', async () => {
  const limiter = makeLimiter(false);
  const req = new Request('https://lab.jawed.co.in/api/hq/session', {
    headers: { 'cf-connecting-ip': '192.0.2.1' }
  });
  const result = await checkHqRateLimit(req, { HQ_SESSION_LIMITER: limiter }, { type: 'session' });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 429);
  assert.deepEqual(limiter.calls, ['session:ip:192.0.2.1']);
});

test('checkHqRateLimit keys authenticated write requests by UID and enforces limit', async () => {
  const limiter = makeLimiter(false);
  const req = new Request('https://lab.jawed.co.in/api/hq/clients', { method: 'POST' });
  const result = await checkHqRateLimit(req, { HQ_WRITE_LIMITER: limiter }, {
    type: 'write',
    uid: 'owner-uid-abc'
  });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 429);
  assert.deepEqual(limiter.calls, ['write:uid:owner-uid-abc']);
});

test('session endpoint enforces rate limiting before authentication and database lookup', async () => {
  const limiter = makeLimiter(false);
  const req = new Request('https://lab.jawed.co.in/api/hq/session', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer some-token',
      'cf-connecting-ip': '203.0.113.88'
    }
  });
  const res = await hqSessionPost({ request: req, env: { HQ_SESSION_LIMITER: limiter } });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '60');
  const body = await res.json();
  assert.equal(body.error, 'RATE_LIMIT_EXCEEDED');
  assert.deepEqual(limiter.calls, ['session:ip:203.0.113.88']);
});

test('session OPTIONS endpoint enforces same-origin and returns Allow header', async () => {
  const allowed = await hqSessionOptions({
    request: new Request('https://lab.jawed.co.in/api/hq/session', {
      headers: { origin: 'https://lab.jawed.co.in', 'sec-fetch-site': 'same-origin' }
    })
  });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('allow'), 'POST, OPTIONS');

  const crossOrigin = await hqSessionOptions({
    request: new Request('https://lab.jawed.co.in/api/hq/session', {
      headers: { origin: 'https://evil.example.com' }
    })
  });
  assert.equal(crossOrigin.status, 403);
});

test('clients endpoint enforces UID rate limiting on mutations but permits reads', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')")
      .run(identity.uid, identity.email);
    const limiter = makeLimiter(false);
    const env = { HQ_DB: db, HQ_WRITE_LIMITER: limiter };

    // Read should pass through without calling write limiter
    const getRes = await handleAuthorizedHqClients({
      request: new Request('https://lab.jawed.co.in/api/hq/clients', { method: 'GET' }),
      env,
      segments: [],
      identity
    });
    assert.equal(getRes.status, 200);
    assert.equal(limiter.calls.length, 0);

    // Mutation should be rate-limited by UID
    const postRes = await handleAuthorizedHqClients({
      request: new Request('https://lab.jawed.co.in/api/hq/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Rate Limited Client' })
      }),
      env,
      segments: [],
      identity
    });
    assert.equal(postRes.status, 429);
    assert.equal(postRes.headers.get('retry-after'), '60');
    assert.deepEqual(limiter.calls, [`write:uid:${identity.uid}`]);
  } finally {
    db.close();
  }
});

test('projects and release endpoints enforce UID write rate limiting', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')")
      .run(identity.uid, identity.email);
    const limiter = makeLimiter(false);
    const env = { HQ_DB: db, HQ_WRITE_LIMITER: limiter };

    const projRes = await handleAuthorizedHqProjects({
      request: new Request('https://lab.jawed.co.in/api/hq/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Blocked Project' })
      }),
      env,
      segments: [],
      identity
    });
    assert.equal(projRes.status, 429);

    const relRes = await handleAuthorizedHqRelease({
      request: new Request('https://lab.jawed.co.in/api/hq/projects/p1/approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approval_type: 'scope' })
      }),
      env,
      segments: ['projects', 'p1', 'approvals'],
      identity
    });
    assert.equal(relRes.status, 429);
  } finally {
    db.close();
  }
});

test('unsupported HTTP methods return 405 with accurate Allow header across HQ endpoints', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')")
      .run(identity.uid, identity.email);
    const env = { HQ_DB: db };

    const clientRes = await handleAuthorizedHqClients({
      request: new Request('https://lab.jawed.co.in/api/hq/clients', { method: 'DELETE' }),
      env,
      segments: [],
      identity
    });
    assert.equal(clientRes.status, 405);
    assert.equal(clientRes.headers.get('allow'), 'GET, POST');

    const singleClientRes = await handleAuthorizedHqClients({
      request: new Request('https://lab.jawed.co.in/api/hq/clients/c1', { method: 'POST' }),
      env,
      segments: ['c1'],
      identity
    });
    assert.equal(singleClientRes.status, 405);
    assert.equal(singleClientRes.headers.get('allow'), 'GET, PATCH');

    const projRes = await handleAuthorizedHqProjects({
      request: new Request('https://lab.jawed.co.in/api/hq/projects', { method: 'PUT' }),
      env,
      segments: [],
      identity
    });
    assert.equal(projRes.status, 405);
    assert.equal(projRes.headers.get('allow'), 'GET, POST');
  } finally {
    db.close();
  }
});

test('zero-row updates in CRM and projects do not create phantom audit logs', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')")
      .run(identity.uid, identity.email);

    // Concurrently missing client update
    const updateRes = await handleAuthorizedHqClients({
      request: new Request('https://lab.jawed.co.in/api/hq/clients/missing-id', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' })
      }),
      env: { HQ_DB: db },
      segments: ['missing-id'],
      identity
    });
    assert.equal(updateRes.status, 404);

    // Verify 0 audit records exist
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
  } finally {
    db.close();
  }
});

test('Worker routes /api/hq/approvals and /api/hq/qa directly to HQ authorization', async () => {
  for (const path of ['/api/hq/approvals', '/api/hq/qa']) {
    const res = await worker.fetch(new Request('https://lab.jawed.co.in' + path), {}, {});
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-store, private, max-age=0');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  }
});

test('Worker generic API 404 response includes security headers and no-store', async () => {
  const res = await worker.fetch(new Request('https://lab.jawed.co.in/api/nonexistent'), {}, {});
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('cache-control'), 'no-store, private, max-age=0');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});
