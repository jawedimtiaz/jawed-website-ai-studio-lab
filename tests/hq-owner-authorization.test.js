import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeHqOwner, ownerUpsertStatement } from '../functions/lib/hqApi.js';

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

test('owner last-seen statement cannot insert or reactivate an owner', () => {
  let capturedSql = '';
  let capturedValues = [];
  const db = {
    prepare(sql) {
      capturedSql = sql;
      return { bind(...values) { capturedValues = values; return { sql, values }; } };
    }
  };
  ownerUpsertStatement(db, { uid: 'firebase-owner-uid', email: 'jawedimtiaz@gmail.com' });
  assert.match(capturedSql, /^UPDATE hq_users/i);
  assert.doesNotMatch(capturedSql, /INSERT|SET\s+status/i);
  assert.match(capturedSql, /WHERE uid = \? AND lower\(email\) = \? AND status = 'active'/i);
  assert.deepEqual(capturedValues, ['firebase-owner-uid', 'jawedimtiaz@gmail.com']);
});
