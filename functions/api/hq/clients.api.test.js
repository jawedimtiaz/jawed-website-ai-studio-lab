import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleAuthorizedHqClients } from './clients.js';

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
        /\bRETURNING\b/i.test(statement.sql) ? statement.all() : statement.run()
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

const identity = { uid: 'owner-test-uid', email: 'jawedimtiaz@gmail.com' };
const envFor = db => ({ HQ_DB: db });
const request = (path, method = 'GET', body) => new Request('https://lab.jawed.co.in' + path, {
  method,
  headers: body === undefined ? {} : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});
const call = (db, req, segments = []) => handleAuthorizedHqClients({
  request: req, env: envFor(db), segments, identity
});

test('CRM client lifecycle creates, lists, reads, updates, archives and restores', async () => {
  const db = new TestD1();
  try {
    const createdResponse = await call(db, request('/api/hq/clients', 'POST', {
      name: 'Acme Limited', business_name: 'Acme', email: 'owner@acme.example'
    }));
    assert.equal(createdResponse.status, 201);
    const createdPayload = await createdResponse.json();
    assert.equal(createdPayload.ok, true);
    const id = createdPayload.client.id;
    assert.ok(id);

    const listResponse = await call(db, request('/api/hq/clients'));
    const listPayload = await listResponse.json();
    assert.equal(listPayload.clients.length, 1);
    assert.equal(listPayload.clients[0].id, id);

    const getResponse = await call(db, request('/api/hq/clients/' + id), 'GET', undefined, [id]);
    const getPayload = await getResponse.json();
    assert.equal(getPayload.client.name, 'Acme Limited');

    const updateResponse = await call(db, request('/api/hq/clients/' + id, 'PATCH', {
      name: 'Acme Web Services', status: 'active'
    }), [id]);
    assert.equal(updateResponse.status, 200);
    const updatePayload = await updateResponse.json();
    assert.equal(updatePayload.client.name, 'Acme Web Services');
    assert.equal(updatePayload.client.status, 'active');

    const archiveResponse = await call(db, request('/api/hq/clients/' + id + '/archive', 'POST', {}), [id, 'archive']);
    assert.equal(archiveResponse.status, 200);
    assert.equal((await archiveResponse.json()).archived, true);

    const activeList = await (await call(db, request('/api/hq/clients'))).json();
    assert.equal(activeList.clients.length, 0);

    const archivedList = await (await call(db, request('/api/hq/clients?archivedOnly=true'))).json();
    assert.equal(archivedList.clients.length, 1);

    const restoreResponse = await call(db, request('/api/hq/clients/' + id + '/restore', 'POST', {}), [id, 'restore']);
    assert.equal(restoreResponse.status, 200);
    assert.equal((await restoreResponse.json()).archived, false);

    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM hq_users').get().count, 1);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 4);
  } finally {
    db.close();
  }
});

test('CRM refuses unknown fields and never exposes permanent delete', async () => {
  const db = new TestD1();
  try {
    const invalid = await call(db, request('/api/hq/clients', 'POST', {
      name: 'Acme', created_by: 'attacker-controlled'
    }));
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, 'FIELD_NOT_ALLOWED');

    const deletion = await call(db, request('/api/hq/clients/client-id', 'DELETE'), ['client-id']);
    assert.equal(deletion.status, 405);
  } finally {
    db.close();
  }
});

test('CRM fails closed when the D1 binding is unavailable', async () => {
  const response = await handleAuthorizedHqClients({
    request: request('/api/hq/clients'),
    env: {},
    segments: [],
    identity
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'HQ_DATABASE_UNAVAILABLE');
});
