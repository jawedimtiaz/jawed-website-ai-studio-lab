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
  assert.deepEqual(validateApproval({ approval_type: 'production-release', requested_from_email: 'not-an-email' }), { ok: false, error: 'REQUESTED_FROM_EMAIL_INVALID' });
  assert.deepEqual(validateApproval({ approval_type: 'production-release', extra: 'bad' }), { ok: false, error: 'FIELD_NOT_ALLOWED' });
  assert.equal(validateQaCheck({ category: 'security', check_name: 'No exposed secrets' }).ok, true);
  assert.deepEqual(validateQaCheck({ category: 'security', check_name: 'Security test', result: 'excellent' }), { ok: false, error: 'QA_RESULT_INVALID' });
  assert.deepEqual(validateQaCheck({ category: 'security', check_name: 'Security test', evidence_url: 'javascript:alert(1)' }), { ok: false, error: 'EVIDENCE_URL_INVALID' });
  assert.deepEqual(validateQaCheck({ category: 'invalid-cat', check_name: 'Test' }), { ok: false, error: 'QA_CATEGORY_INVALID' });
  assert.deepEqual(validateQaCheck({ category: 'security', check_name: ' ' }), { ok: false, error: 'CHECK_NAME_REQUIRED' });
});

test('creates and decides approvals and creates and updates QA checks with audit logs', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('client-release', 'Release Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)")
      .run('project-release', 'client-release', 'Release Website', identity.uid);

    // Create approval
    const approvalResponse = await call(db, request('/api/hq/projects/project-release/approvals', 'POST', {
      approval_type: 'production-release', requested_from_email: 'client@example.com'
    }), ['projects', 'project-release', 'approvals']);
    assert.equal(approvalResponse.status, 201);
    const approval = (await approvalResponse.json()).approval;
    assert.equal(approval.approval_type, 'production-release');
    assert.equal(approval.status, 'pending');

    // List approvals
    const listAppr = await (await call(db, request('/api/hq/projects/project-release/approvals'), ['projects', 'project-release', 'approvals'])).json();
    assert.equal(listAppr.approvals.length, 1);
    assert.equal(listAppr.approvals[0].id, approval.id);

    // Decide approval
    const decisionResponse = await call(db, request('/api/hq/approvals/' + approval.id, 'PATCH', {
      status: 'approved', decision_note: 'Final review complete'
    }), ['approvals', approval.id]);
    assert.equal(decisionResponse.status, 200);
    const decided = (await decisionResponse.json()).approval;
    assert.equal(decided.status, 'approved');
    assert.equal(decided.decided_by, identity.uid);
    assert.equal(decided.decision_note, 'Final review complete');

    // Cannot decide an already decided approval
    const reDecide = await call(db, request('/api/hq/approvals/' + approval.id, 'PATCH', {
      status: 'rejected'
    }), ['approvals', approval.id]);
    assert.equal(reDecide.status, 409);
    assert.equal((await reDecide.json()).error, 'APPROVAL_ALREADY_DECIDED');

    // Create QA check
    const qaResponse = await call(db, request('/api/hq/projects/project-release/qa', 'POST', {
      category: 'security', check_name: 'No secrets exposed', result: 'not-run'
    }), ['projects', 'project-release', 'qa']);
    assert.equal(qaResponse.status, 201);
    const qa = (await qaResponse.json()).check;
    assert.equal(qa.category, 'security');
    assert.equal(qa.result, 'not-run');

    // List QA checks
    const listQa = await (await call(db, request('/api/hq/projects/project-release/qa'), ['projects', 'project-release', 'qa'])).json();
    assert.equal(listQa.checks.length, 1);
    assert.equal(listQa.checks[0].id, qa.id);

    // Update QA check
    const qaUpdate = await call(db, request('/api/hq/qa/' + qa.id, 'PATCH', {
      result: 'pass', notes: 'Verified in code review'
    }), ['qa', qa.id]);
    assert.equal(qaUpdate.status, 200);
    const updatedCheck = (await qaUpdate.json()).check;
    assert.equal(updatedCheck.result, 'pass');
    assert.equal(updatedCheck.checked_by, identity.uid);
    assert.equal(updatedCheck.notes, 'Verified in code review');

    // Audit logs recorded (1 for approval create, 1 for decide, 1 for QA create, 1 for QA update)
    const auditCount = db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count;
    assert.equal(auditCount, 4);
  } finally {
    db.close();
  }
});

test('disabled owner cannot create an approval and batch rolls back', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c1', 'Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)").run('p1', 'c1', 'Project', identity.uid);
    db.sqlite.prepare("UPDATE hq_users SET status = 'disabled' WHERE uid = ?").run(identity.uid);

    const response = await call(db, request('/api/hq/projects/p1/approvals', 'POST', {
      approval_type: 'production-release'
    }), ['projects', 'p1', 'approvals']);

    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'HQ_REQUEST_FAILED');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM approvals').get().count, 0);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
    assert.equal(db.sqlite.prepare('SELECT status FROM hq_users WHERE uid = ?').get(identity.uid).status, 'disabled');
  } finally {
    db.close();
  }
});

test('disabled owner cannot decide an approval and batch rolls back', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c1', 'Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)").run('p1', 'c1', 'Project', identity.uid);
    db.sqlite.prepare("INSERT INTO approvals (id, project_id, approval_type, status, requested_by) VALUES (?, ?, ?, 'pending', ?)")
      .run('appr-test', 'p1', 'production-release', identity.uid);
    db.sqlite.prepare("UPDATE hq_users SET status = 'disabled' WHERE uid = ?").run(identity.uid);

    const response = await call(db, request('/api/hq/approvals/appr-test', 'PATCH', {
      status: 'approved'
    }), ['approvals', 'appr-test']);

    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'HQ_REQUEST_FAILED');
    assert.equal(db.sqlite.prepare('SELECT status FROM approvals WHERE id = ?').get('appr-test').status, 'pending');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
    assert.equal(db.sqlite.prepare('SELECT status FROM hq_users WHERE uid = ?').get(identity.uid).status, 'disabled');
  } finally {
    db.close();
  }
});

test('disabled owner cannot create a QA check and batch rolls back', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c1', 'Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)").run('p1', 'c1', 'Project', identity.uid);
    db.sqlite.prepare("UPDATE hq_users SET status = 'disabled' WHERE uid = ?").run(identity.uid);

    const response = await call(db, request('/api/hq/projects/p1/qa', 'POST', {
      category: 'security', check_name: 'Check 1'
    }), ['projects', 'p1', 'qa']);

    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'HQ_REQUEST_FAILED');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM qa_checks').get().count, 0);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
    assert.equal(db.sqlite.prepare('SELECT status FROM hq_users WHERE uid = ?').get(identity.uid).status, 'disabled');
  } finally {
    db.close();
  }
});

test('disabled owner cannot update a QA check and batch rolls back', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c1', 'Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)").run('p1', 'c1', 'Project', identity.uid);
    db.sqlite.prepare("INSERT INTO qa_checks (id, project_id, category, check_name, result) VALUES (?, ?, 'security', 'Check 1', 'not-run')")
      .run('qa-test', 'p1');
    db.sqlite.prepare("UPDATE hq_users SET status = 'disabled' WHERE uid = ?").run(identity.uid);

    const response = await call(db, request('/api/hq/qa/qa-test', 'PATCH', {
      result: 'pass'
    }), ['qa', 'qa-test']);

    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'HQ_REQUEST_FAILED');
    assert.equal(db.sqlite.prepare('SELECT result FROM qa_checks WHERE id = ?').get('qa-test').result, 'not-run');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
    assert.equal(db.sqlite.prepare('SELECT status FROM hq_users WHERE uid = ?').get(identity.uid).status, 'disabled');
  } finally {
    db.close();
  }
});

test('un-enrolled owner cannot mutate release resources and cannot provision account', async () => {
  const db = new TestD1();
  try {
    // Seed an enrolled owner to create project p1, but testing with un-enrolled identity
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES ('seeded-owner', 'seeded@example.com', 'active')").run();
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES ('c1', 'Client', 'seeded-owner')").run();
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES ('p1', 'c1', 'Project', 'seeded-owner')").run();

    // identity ('owner-release-test') is NOT enrolled in hq_users
    const response = await call(db, request('/api/hq/projects/p1/approvals', 'POST', {
      approval_type: 'production-release'
    }), ['projects', 'p1', 'approvals']);

    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'HQ_REQUEST_FAILED');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM hq_users WHERE uid = ?').get(identity.uid).count, 0);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM approvals').get().count, 0);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
  } finally {
    db.close();
  }
});

test('release API fails closed when HQ_DB is unavailable', async () => {
  const response = await handleAuthorizedHqRelease({
    request: request('/api/hq/projects/p1/approvals'),
    env: {},
    segments: ['projects', 'p1', 'approvals'],
    identity
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'HQ_DATABASE_UNAVAILABLE');
});

test('release API rejects unsupported HTTP methods and invalid routes', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c1', 'Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)").run('p1', 'c1', 'Project', identity.uid);

    // Unsupported method on approvals list
    const badMethod = await call(db, request('/api/hq/projects/p1/approvals', 'DELETE'), ['projects', 'p1', 'approvals']);
    assert.equal(badMethod.status, 405);
    assert.equal((await badMethod.json()).error, 'METHOD_NOT_ALLOWED');

    // Unsupported method on qa list
    const badMethodQa = await call(db, request('/api/hq/projects/p1/qa', 'DELETE'), ['projects', 'p1', 'qa']);
    assert.equal(badMethodQa.status, 405);
    assert.equal((await badMethodQa.json()).error, 'METHOD_NOT_ALLOWED');

    // Non-existent route
    const notFound = await call(db, request('/api/hq/invalid', 'GET'), ['invalid']);
    assert.equal(notFound.status, 404);
    assert.equal((await notFound.json()).error, 'NOT_FOUND');
  } finally {
    db.close();
  }
});

test('approval already decided between initial read and mutation does not append audit entry and returns 409', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c1', 'Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)").run('p1', 'c1', 'Project', identity.uid);
    db.sqlite.prepare("INSERT INTO approvals (id, project_id, approval_type, status, requested_by) VALUES (?, ?, ?, 'pending', ?)")
      .run('appr-race', 'p1', 'production-release', identity.uid);

    // Deterministic simulation: right before batch executes, another operation decides the approval
    const originalBatch = db.batch.bind(db);
    db.batch = function(statements) {
      db.sqlite.prepare("UPDATE approvals SET status = 'approved', decided_by = ? WHERE id = ?").run(identity.uid, 'appr-race');
      return originalBatch(statements);
    };

    const response = await call(db, request('/api/hq/approvals/appr-race', 'PATCH', {
      status: 'approved', decision_note: 'Concurrent attempt'
    }), ['approvals', 'appr-race']);

    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, 'APPROVAL_ALREADY_DECIDED');
    const auditCount = db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count;
    assert.equal(auditCount, 0, 'No audit entry must be appended when update modifies 0 rows');
  } finally {
    db.close();
  }
});

test('QA record no longer available when its update is attempted does not append audit entry and returns 404', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c1', 'Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)").run('p1', 'c1', 'Project', identity.uid);
    db.sqlite.prepare("INSERT INTO qa_checks (id, project_id, category, check_name, result) VALUES (?, ?, 'security', 'Check 1', 'not-run')")
      .run('qa-race', 'p1');

    // Deterministic simulation: right before batch executes, the QA check is deleted
    const originalBatch = db.batch.bind(db);
    db.batch = function(statements) {
      db.sqlite.prepare("DELETE FROM qa_checks WHERE id = ?").run('qa-race');
      return originalBatch(statements);
    };

    const response = await call(db, request('/api/hq/qa/qa-race', 'PATCH', {
      result: 'pass', notes: 'Late update'
    }), ['qa', 'qa-race']);

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'QA_CHECK_NOT_FOUND');
    const auditCount = db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count;
    assert.equal(auditCount, 0, 'No audit entry must be appended when QA record is unavailable');
  } finally {
    db.close();
  }
});

test('zero-row update does not append an audit entry for approvals or QA checks', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c1', 'Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)").run('p1', 'c1', 'Project', identity.uid);
    db.sqlite.prepare("INSERT INTO approvals (id, project_id, approval_type, status, requested_by) VALUES (?, ?, ?, 'pending', ?)")
      .run('appr-zero', 'p1', 'scope', identity.uid);

    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);

    const origBatch = db.batch.bind(db);
    db.batch = function(statements) {
      db.sqlite.prepare("UPDATE approvals SET status = 'rejected' WHERE id = 'appr-zero'").run();
      return origBatch(statements);
    };

    const res = await call(db, request('/api/hq/approvals/appr-zero', 'PATCH', {
      status: 'approved'
    }), ['approvals', 'appr-zero']);

    assert.equal(res.status, 409);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
  } finally {
    db.close();
  }
});

test('successful update still appends exactly one accurate audit entry with old and new values', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c1', 'Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)").run('p1', 'c1', 'Project', identity.uid);
    db.sqlite.prepare("INSERT INTO approvals (id, project_id, approval_type, status, requested_by) VALUES (?, ?, ?, 'pending', ?)")
      .run('appr-audit-test', 'p1', 'scope', identity.uid);
    db.sqlite.prepare("INSERT INTO qa_checks (id, project_id, category, check_name, result) VALUES (?, ?, 'content', 'Grammar check', 'not-run')")
      .run('qa-audit-test', 'p1');

    // 1. Successful approval decision
    const apprRes = await call(db, request('/api/hq/approvals/appr-audit-test', 'PATCH', {
      status: 'approved', decision_note: 'Scope looks solid'
    }), ['approvals', 'appr-audit-test']);
    assert.equal(apprRes.status, 200);

    const apprAudit = db.sqlite.prepare("SELECT * FROM audit_logs WHERE entity_type = 'approval' AND entity_id = ?").get('appr-audit-test');
    assert.ok(apprAudit, 'Audit record exists for approval decision');
    assert.equal(apprAudit.action, 'approval.decision');
    assert.equal(apprAudit.actor_uid, identity.uid);
    assert.equal(apprAudit.actor_email, identity.email);
    assert.deepEqual(JSON.parse(apprAudit.before_json), { status: 'pending' });
    assert.deepEqual(JSON.parse(apprAudit.after_json), { status: 'approved', decision_note: 'Scope looks solid' });

    // 2. Successful QA check update
    const qaRes = await call(db, request('/api/hq/qa/qa-audit-test', 'PATCH', {
      result: 'pass', notes: 'All copy verified'
    }), ['qa', 'qa-audit-test']);
    assert.equal(qaRes.status, 200);

    const qaAudit = db.sqlite.prepare("SELECT * FROM audit_logs WHERE entity_type = 'qa_check' AND entity_id = ?").get('qa-audit-test');
    assert.ok(qaAudit, 'Audit record exists for QA check update');
    assert.equal(qaAudit.action, 'qa.update');
    assert.equal(qaAudit.actor_uid, identity.uid);
    assert.equal(qaAudit.actor_email, identity.email);
    assert.deepEqual(JSON.parse(qaAudit.before_json), { result: 'not-run' });
    assert.deepEqual(JSON.parse(qaAudit.after_json), { result: 'pass' });

    // Exactly 2 audit records exist
    const totalAudits = db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count;
    assert.equal(totalAudits, 2);
  } finally {
    db.close();
  }
});
