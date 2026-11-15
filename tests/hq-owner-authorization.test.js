import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeHqOwner, ownerAuthorizationGuardStatement } from '../functions/lib/hqApi.js';
import worker from '../worker.js';

function makeRequest() {
  return new Request('https://lab.jawed.co.in/api/hq/session', {
    method: 'POST',
    headers: { authorization: 'Bearer unit-test-token' }
  });
}

function makeDb(owner, options = {}) {
  const calls = [];
  const db = {
    prepare(sql) {
      calls.push(sql);
      return {
        bind(...values) {
          return {
            async first() {
              if (options.throwOnFirst) throw new Error('database unavailable');
              return owner;
            },
            async run() { return { meta: { changes: 1 } }; },
            sql,
            values
          };
        }
      };
    },
    batch() { return Promise.resolve([]); }
  };
  return { db, calls };
}

const verifyToken = async token => {
  assert.equal(token, 'unit-test-token');
  return { ok: true, identity: { uid: 'firebase-owner-uid', email: 'jawedimtiaz@gmail.com' } };
};

test('allows an active D1 owner whose email matches the verified Firebase identity', async () => {
  const { db } = makeDb({ uid: 'firebase-owner-uid', email: 'JawedImtiaz@gmail.com', status: 'active' });
  const result = await authorizeHqOwner(makeRequest(), { HQ_DB: db }, { verifyToken });
  assert.equal(result.ok, true);
  assert.deepEqual(result.identity, { uid: 'firebase-owner-uid', email: 'jawedimtiaz@gmail.com' });
});

test('rejects a disabled D1 owner', async () => {
  const { db } = makeDb({ uid: 'firebase-owner-uid', email: 'jawedimtiaz@gmail.com', status: 'disabled' });
  const result = await authorizeHqOwner(makeRequest(), { HQ_DB: db }, { verifyToken });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
  assert.equal((await result.response.json()).error, 'OWNER_DISABLED');
});

test('rejects a Firebase owner not enrolled in D1', async () => {
  const { db } = makeDb(null);
  const result = await authorizeHqOwner(makeRequest(), { HQ_DB: db }, { verifyToken });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
  assert.equal((await result.response.json()).error, 'OWNER_NOT_ENROLLED');
});

test('rejects an email mismatch between Firebase and D1', async () => {
  const { db } = makeDb({ uid: 'firebase-owner-uid', email: 'someone-else@example.com', status: 'active' });
  const result = await authorizeHqOwner(makeRequest(), { HQ_DB: db }, { verifyToken });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
  assert.equal((await result.response.json()).error, 'OWNER_EMAIL_MISMATCH');
});

test('fails closed when the D1 binding is missing', async () => {
  const result = await authorizeHqOwner(makeRequest(), {}, { verifyToken });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 503);
});

test('fails closed when the D1 owner lookup throws', async () => {
  const { db } = makeDb(null, { throwOnFirst: true });
  const result = await authorizeHqOwner(makeRequest(), { HQ_DB: db }, { verifyToken });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 503);
});

test('transaction guard checks the active owner and raises SQL failure when unauthorized', () => {
  let capturedSql = '';
  let capturedValues = [];
  const db = {
    prepare(sql) {
      capturedSql = sql;
      return { bind(...values) { capturedValues = values; return { sql, values }; } };
    }
  };
  ownerAuthorizationGuardStatement(db, { uid: 'firebase-owner-uid', email: 'jawedimtiaz@gmail.com' });
  assert.match(capturedSql, /SELECT CASE/i);
  assert.match(capturedSql, /EXISTS\s*\(/i);
  assert.match(capturedSql, /uid = \? AND lower\(email\) = \? AND status = 'active'/i);
  assert.match(capturedSql, /json\('invalid-owner-authorization'\)/i);
  assert.deepEqual(capturedValues, ['firebase-owner-uid', 'jawedimtiaz@gmail.com']);
});

test('Worker routes project API paths, including trailing slashes, to HQ authorization', async () => {
  for (const path of ['/api/hq/projects', '/api/hq/projects/', '/api/hq/projects/project-1/tasks']) {
    const response = await worker.fetch(
      new Request('https://lab.jawed.co.in' + path, { method: 'GET' }),
      {},
      {}
    );
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal((await response.json()).error, 'AUTH_REQUIRED', path);
  }
});

test('Worker routes CRM API paths to HQ authorization', async () => {
  const response = await worker.fetch(
    new Request('https://lab.jawed.co.in/api/hq/clients', { method: 'GET' }),
    {},
    {}
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'AUTH_REQUIRED');
});


test('Worker routes Approvals and QA API paths, including trailing slashes, to HQ authorization', async () => {
  const releasePaths = [
    '/api/hq/projects/project-1/approvals',
    '/api/hq/projects/project-1/approvals/',
    '/api/hq/approvals/approval-1',
    '/api/hq/approvals/approval-1/',
    '/api/hq/projects/project-1/qa',
    '/api/hq/projects/project-1/qa/',
    '/api/hq/qa/check-1',
    '/api/hq/qa/check-1/'
  ];
  for (const path of releasePaths) {
    const response = await worker.fetch(
      new Request('https://lab.jawed.co.in' + path, { method: 'GET' }),
      {},
      {}
    );
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal((await response.json()).error, 'AUTH_REQUIRED', path);
  }
});
