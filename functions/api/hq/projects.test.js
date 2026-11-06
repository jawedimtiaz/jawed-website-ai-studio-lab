import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { validateProject, validateTask, validateMilestone, handleAuthorizedHqProjects } from './projects.js';

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
        (/^\s*SELECT\b/i.test(statement.sql) || /\bRETURNING\b/i.test(statement.sql)) ? statement.all() : statement.run()
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

const identity = { uid: 'owner-project-test', email: 'jawed@jawed.co.in' };
const request = (path, method = 'GET', body) => new Request('https://lab.jawed.co.in' + path, {
  method,
  headers: body === undefined ? {} : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});
const call = (db, req, segments = []) => handleAuthorizedHqProjects({
  request: req, env: { HQ_DB: db }, segments, identity
});

test('validates project name, client, status, currency and date range', () => {
  assert.equal(validateProject({ client_id: 'client-1', name: 'Business Site', status: 'discovery', currency: 'INR' }).ok, true);
  assert.deepEqual(validateProject({ client_id: 'client-1', name: 'Website', start_date: '2026-12-10', target_date: '2026-12-01' }), {
    ok: false, error: 'TARGET_DATE_BEFORE_START_DATE'
  });
  assert.deepEqual(validateProject({ client_id: 'client-1', name: 'Site', project_type: 'malware' }), {
    ok: false, error: 'PROJECT_TYPE_INVALID'
  });
  assert.deepEqual(validateProject({ client_id: 'client-1', name: 'Site', quoted_amount_minor: -1 }), {
    ok: false, error: 'QUOTED_AMOUNT_INVALID'
  });
});

test('project lifecycle creates, lists, reads, updates, archives and restores', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid,email) VALUES (?,?)").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id,name,created_by) VALUES (?,?,?)").run('client-1','Acme',identity.uid);

    const create = await call(db, request('/api/hq/projects','POST', {
      client_id: 'client-1', name: 'Acme Website', project_type: 'business-website', status: 'discovery',
      start_date: '2026-11-10', target_date: '2026-12-10', quoted_amount_minor: 250000
    }));
    assert.equal(create.status, 201);
    const created = await create.json();
    const id = created.project.id;
    assert.ok(id);

    const list = await (await call(db, request('/api/hq/projects'))).json();
    assert.equal(list.projects.length, 1);
    assert.equal(list.projects[0].client_name, 'Acme');

    const get = await (await call(db, request('/api/hq/projects/' + id), [id])).json();
    assert.equal(get.project.name, 'Acme Website');

    const update = await call(db, request('/api/hq/projects/' + id, 'PATCH', { status: 'in-progress', priority: 'high' }), [id]);
    assert.equal(update.status, 200);
    assert.equal((await update.json()).project.status, 'in-progress');

    const archive = await call(db, request('/api/hq/projects/' + id + '/archive', 'POST', {}), [id, 'archive']);
    assert.equal(archive.status, 200);
    assert.equal((await (await call(db, request('/api/hq/projects'))).json()).projects.length, 0);
    assert.equal((await (await call(db, request('/api/hq/projects?archivedOnly=true'))).json()).projects.length, 1);

    const restore = await call(db, request('/api/hq/projects/' + id + '/restore', 'POST', {}), [id, 'restore']);
    assert.equal(restore.status, 200);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 4);
  } finally {
    db.close();
  }
});

test('rejects projects linked to a missing client', async () => {
  const db = new TestD1();
  try {
    const response = await call(db, request('/api/hq/projects','POST', { client_id: 'missing', name: 'Invalid project' }));
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'CLIENT_NOT_FOUND');
  } finally {
    db.close();
  }
});

test('validates task and milestone contracts', () => {
  assert.equal(validateTask({ title: 'Prepare homepage', status: 'todo', priority: 'high' }).ok, true);
  assert.deepEqual(validateTask({ title: 'Task', status: 'owner' }), { ok: false, error: 'TASK_STATUS_INVALID' });
  assert.deepEqual(validateTask({ title: 'Task', due_date: '2026-02-30' }), { ok: false, error: 'DUE_DATE_INVALID' });
  assert.equal(validateMilestone({ name: 'Design approval', due_date: '2026-12-01' }).ok, true);
  assert.deepEqual(validateMilestone({ name: 'Milestone', sort_order: -1 }), { ok: false, error: 'SORT_ORDER_INVALID' });
});

test('creates and updates project milestones and tasks with audit entries', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid,email) VALUES (?,?)").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id,name,created_by) VALUES (?,?,?)").run('client-2','Beta',identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id,client_id,name,created_by) VALUES (?,?,?,?)")
      .run('project-2','client-2','Beta Website',identity.uid);

    const milestoneResponse = await call(db, request('/api/hq/projects/project-2/milestones','POST', {
      name: 'Design approval', due_date: '2026-12-01'
    }), ['project-2','milestones']);
    assert.equal(milestoneResponse.status, 201);
    const milestone = (await milestoneResponse.json()).milestone;

    const taskResponse = await call(db, request('/api/hq/projects/project-2/tasks','POST', {
      title: 'Prepare homepage', milestone_id: milestone.id, assigned_to: identity.uid, due_date: '2026-11-20'
    }), ['project-2','tasks']);
    assert.equal(taskResponse.status, 201);
    const task = (await taskResponse.json()).task;

    const taskUpdate = await call(db, request('/api/hq/projects/project-2/tasks/' + task.id,'PATCH', {
      status: 'in-progress'
    }), ['project-2','tasks',task.id]);
    assert.equal(taskUpdate.status, 200);
    assert.equal((await taskUpdate.json()).task.status, 'in-progress');

    const milestoneUpdate = await call(db, request('/api/hq/projects/project-2/milestones/' + milestone.id,'PATCH', {
      status: 'completed'
    }), ['project-2','milestones',milestone.id]);
    assert.equal(milestoneUpdate.status, 200);
    assert.equal((await milestoneUpdate.json()).milestone.status, 'completed');

    const tasks = await (await call(db, request('/api/hq/projects/project-2/tasks'), ['project-2','tasks'])).json();
    assert.equal(tasks.tasks.length, 1);
    assert.equal(tasks.tasks[0].milestone_name, 'Design approval');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 4);
  } finally {
    db.close();
  }
});


test('disabled Projects owner cannot create a project or append an audit record', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email, status) VALUES (?, ?, 'active')")
      .run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)")
      .run('client-disabled-project-owner', 'Acme', identity.uid);
    db.sqlite.prepare("INSERT INTO audit_logs (id, actor_uid, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)")
      .run('baseline-project-audit', identity.uid, 'test.seed', 'client', 'client-disabled-project-owner');
    db.sqlite.prepare("UPDATE hq_users SET status = 'disabled' WHERE uid = ?").run(identity.uid);

    const response = await call(db, request('/api/hq/projects', 'POST', {
      client_id: 'client-disabled-project-owner', name: 'Unauthorized Project'
    }));
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'HQ_REQUEST_FAILED');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM projects').get().count, 0);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 1);
  } finally {
    db.close();
  }
});
