import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { validateApproval, validateQaCheck, handleAuthorizedHqRelease } from './release.js';

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

const identity = { uid: 'owner-release-test', email: 'jawedimtiaz@gmail.com' };
const request = (path, method = 'GET', body) => new Request('https://lab.jawed.co.in' + path, {
  method,
  headers: body === undefined ? {} : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});
const call = (db, req, segments) => handleAuthorizedHqRelease({
  request: req, env: { HQ_DB: db }, segments, identity
});

test('validates approval and QA request contracts', () => {
  assert.equal(validateApproval({ approval_type: 'production-release', requested_from_email: 'client@example.com' }).ok, true);
  assert.deepEqual(validateApproval({ approval_type: 'root-access' }), { ok: false, error: 'APPROVAL_TYPE_INVALID' });
  assert.equal(validateQaCheck({ category: 'security', check_name: 'No exposed secrets' }).ok, true);
  assert.deepEqual(validateQaCheck({ category: 'security', check_name: 'Security test', result: 'excellent' }), { ok: false, error: 'QA_RESULT_INVALID' });
  assert.deepEqual(validateQaCheck({ category: 'security', check_name: 'Security test', evidence_url: 'javascript:alert(1)' }), { ok: false, error: 'EVIDENCE_URL_INVALID' });
});

test('creates and decides approvals and creates and updates QA checks', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid,email) VALUES (?,?)").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id,name,created_by) VALUES (?,?,?)").run('client-release','Release Client',identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id,client_id,name,created_by) VALUES (?,?,?,?)")
      .run('project-release','client-release','Release Website',identity.uid);

    const approvalResponse = await call(db, request('/api/hq/projects/project-release/approvals','POST', {
      approval_type: 'production-release', requested_from_email: 'client@example.com'
    }), ['projects','project-release','approvals']);
    assert.equal(approvalResponse.status, 201);
    const approval = (await approvalResponse.json()).approval;

    const decisionResponse = await call(db, request('/api/hq/approvals/' + approval.id,'PATCH', {
      status: 'approved', decision_note: 'Final review complete'
    }), ['approvals',approval.id]);
    assert.equal(decisionResponse.status, 200);
    assert.equal((await decisionResponse.json()).approval.status, 'approved');

    const qaResponse = await call(db, request('/api/hq/projects/project-release/qa','POST', {
      category: 'security', check_name: 'No secrets exposed', result: 'not-run'
    }), ['projects','project-release','qa']);
    assert.equal(qaResponse.status, 201);
    const qa = (await qaResponse.json()).check;

    const qaUpdate = await call(db, request('/api/hq/qa/' + qa.id,'PATCH', {
      result: 'pass', notes: 'Verified in code review'
    }), ['qa',qa.id]);
    assert.equal(qaUpdate.status, 200);
    const updatedCheck = (await qaUpdate.json()).check;
    assert.equal(updatedCheck.result, 'pass');
    assert.equal(updatedCheck.checked_by, identity.uid);

    const approvals = await (await call(db, request('/api/hq/projects/project-release/approvals'), ['projects','project-release','approvals'])).json();
    const checks = await (await call(db, request('/api/hq/projects/project-release/qa'), ['projects','project-release','qa'])).json();
    assert.equal(approvals.approvals.length, 1);
    assert.equal(checks.checks.length, 1);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 3);
  } finally {
    db.close();
  }
});
