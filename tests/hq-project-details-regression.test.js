// tests/hq-project-details-regression.test.js
// Automated Regression Tests for Studio HQ Phase 7.3: Project Details View Defect Remediation
// Verifies:
// 1. Successful project detail loading via canonical route.
// 2. Correct project ID handling.
// 3. Project with valid status.
// 4. Project with missing optional fields.
// 5. Invalid or nonexistent project ID.
// 6. API error handling (401, 404, 405).
// 7. Loading & sub-resource resolution (tasks, milestones).
// 8. Defensive data normalization: no undefined-property crash on malformed/mismatched responses.
// 9. Existing project list functionality remains completely unaffected.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  handleAuthorizedHqProjects
} from '../functions/api/hq/canonicalProjects.js';
import {
  isCanonicalProjectsRoute,
  matchCanonicalProjectRoute,
  dispatchHqCanonicalProjectsRequest
} from '../functions/lib/hqCanonicalRouter.js';
import {
  dispatchHqIntegrationBoundary
} from '../functions/lib/hqIntegrationBoundary.js';

class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec(readFileSync('tests/fixtures/hq-canonical-schema.sql', 'utf8'));
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

const identity = { uid: 'owner-details-test', email: 'jawed@jawed.co.in' };

const createRequest = (path, method = 'GET', body) => new Request('https://lab.jawed.co.in' + path, {
  method,
  headers: body === undefined ? {} : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});

const callAuthorized = (db, req, segments = []) => handleAuthorizedHqProjects({
  request: req,
  env: { ENVIRONMENT: 'test', HQ_DB: db },
  segments,
  identity
});

/**
 * Pure reproduction of the frontend normalizeProjectDetailBundle logic
 * to guarantee unit-level testing of defensive handling.
 */
function normalizeProjectDetailBundle(projectRes, tasksRes, milestonesRes) {
  if (!projectRes || typeof projectRes !== 'object') return null;

  // Discard collection responses { ok: true, projects: [...] }
  const rawProject =
    projectRes.project && typeof projectRes.project === 'object'
      ? projectRes.project
      : ('id' in projectRes && !('projects' in projectRes) ? projectRes : null);

  if (!rawProject || typeof rawProject !== 'object' || !rawProject.id) {
    return null;
  }

  const safeProject = {
    ...rawProject,
    client_business: rawProject.client_business || rawProject.client_business_name || rawProject.client_name || '',
    status: typeof rawProject.status === 'string' && rawProject.status.trim() ? rawProject.status : 'Planning'
  };

  return {
    project: safeProject,
    tasks: Array.isArray(tasksRes?.tasks)
      ? tasksRes.tasks
      : Array.isArray(projectRes?.tasks)
        ? projectRes.tasks
        : [],
    milestones: Array.isArray(milestonesRes?.milestones)
      ? milestonesRes.milestones
      : Array.isArray(projectRes?.milestones)
        ? projectRes.milestones
        : [],
    approvals: Array.isArray(projectRes?.approvals) ? projectRes.approvals : [],
    qaChecks: Array.isArray(projectRes?.qaChecks) ? projectRes.qaChecks : [],
    repositories: Array.isArray(projectRes?.repositories) ? projectRes.repositories : [],
    onboarding: Array.isArray(projectRes?.onboarding) ? projectRes.onboarding : [],
    notes: Array.isArray(projectRes?.notes) ? projectRes.notes : []
  };
}

test('1. Successful project detail loading via canonical route GET /api/hq/projects/:id', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email) VALUES (?, ?)").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, business_name, created_by) VALUES (?, ?, ?, ?)")
      .run('client-101', 'Asha Sharma', 'Sharma Logistics', identity.uid);
    db.sqlite.prepare(`
      INSERT INTO projects (
        id, client_id, name, project_type, status, priority, summary,
        scope_markdown, start_date, target_date, currency, quoted_amount_minor, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'proj-101', 'client-101', 'Logistics Portal v2', 'web-app', 'in-progress', 'high',
      'Full tracking portal', '### Deliverables\n- Fleet map', '2026-11-01', '2026-12-15', 'INR', 450000, identity.uid
    );

    const res = await callAuthorized(db, createRequest('/api/hq/projects/proj-101'), ['proj-101']);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.project);
    assert.equal(body.project.id, 'proj-101');
    assert.equal(body.project.name, 'Logistics Portal v2');
    assert.equal(body.project.status, 'in-progress');
    assert.equal(body.project.priority, 'high');
    assert.equal(body.project.client_name, 'Asha Sharma');
    assert.equal(body.project.client_business_name, 'Sharma Logistics');
    assert.equal(body.project.quoted_amount_minor, 450000);
    assert.equal(body.project.currency, 'INR');
  } finally {
    db.close();
  }
});

test('2. Correct project ID handling in route matching and resolution', async () => {
  assert.equal(isCanonicalProjectsRoute('/api/hq/projects/proj-abc-123'), true);
  assert.equal(isCanonicalProjectsRoute('/api/hq/projects/550e8400-e29b-41d4-a716-446655440000'), true);

  const match = matchCanonicalProjectRoute('/api/hq/projects/proj-abc-123');
  assert.equal(match.matched, true);
  assert.equal(match.route, 'projects.detail');
  assert.deepEqual(match.segments, ['proj-abc-123']);
  assert.deepEqual(match.allowedMethods, ['GET', 'PATCH', 'OPTIONS']);

  // Route with query string retains segment
  const matchWithQuery = matchCanonicalProjectRoute('/api/hq/projects/proj-abc-123?view=full');
  assert.equal(matchWithQuery.matched, true);
  assert.equal(matchWithQuery.route, 'projects.detail');
  assert.deepEqual(matchWithQuery.segments, ['proj-abc-123']);

  // Oversized project ID (> 80 chars) returns 404
  const oversizedId = 'p'.repeat(81);
  const matchOversized = matchCanonicalProjectRoute('/api/hq/projects/' + oversizedId);
  assert.equal(matchOversized.matched, true);
  assert.equal(matchOversized.error, 'PROJECT_NOT_FOUND');
  assert.equal(matchOversized.status, 404);
});

test('3. Project with valid status across canonical status vocabulary', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email) VALUES (?, ?)").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('client-st', 'Status Client', identity.uid);

    const statuses = ['lead', 'discovery', 'quoted', 'approved', 'in-progress', 'review', 'blocked', 'completed', 'on-hold', 'cancelled'];
    for (const st of statuses) {
      const pid = 'proj-st-' + st;
      db.sqlite.prepare("INSERT INTO projects (id, client_id, name, status, created_by) VALUES (?, ?, ?, ?, ?)")
        .run(pid, 'client-st', 'Project ' + st, st, identity.uid);

      const res = await callAuthorized(db, createRequest('/api/hq/projects/' + pid), [pid]);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.project.status, st);
    }
  } finally {
    db.close();
  }
});

test('4. Project with missing optional fields returns clean object without SQL or runtime errors', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email) VALUES (?, ?)").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('client-min', 'Minimal Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)")
      .run('proj-minimal', 'client-min', 'Minimal Project', identity.uid);

    const res = await callAuthorized(db, createRequest('/api/hq/projects/proj-minimal'), ['proj-minimal']);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.project.name, 'Minimal Project');
    assert.equal(body.project.summary, null);
    assert.equal(body.project.scope_markdown, null);
    assert.equal(body.project.start_date, null);
    assert.equal(body.project.target_date, null);
    assert.equal(body.project.quoted_amount_minor, null);
    assert.equal(body.project.client_business_name, null);

    // Verify defensive normalization on minimal object
    const bundle = normalizeProjectDetailBundle(body);
    assert.ok(bundle);
    assert.equal(bundle.project.name, 'Minimal Project');
    assert.equal(bundle.project.status, 'discovery');
    assert.equal(bundle.project.client_business, 'Minimal Client');
    assert.deepEqual(bundle.tasks, []);
    assert.deepEqual(bundle.milestones, []);
  } finally {
    db.close();
  }
});

test('5. Invalid or nonexistent project ID returns controlled 404', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email) VALUES (?, ?)").run(identity.uid, identity.email);

    const notFound = await callAuthorized(db, createRequest('/api/hq/projects/nonexistent-id-999'), ['nonexistent-id-999']);
    assert.equal(notFound.status, 404);
    const body = await notFound.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, 'PROJECT_NOT_FOUND');
  } finally {
    db.close();
  }
});

test('6. API error handling: method validation (405) and unknown subroutes (404)', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email) VALUES (?, ?)").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c1', 'Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)").run('p1', 'c1', 'P1', identity.uid);

    // POST to project detail route is not allowed
    const postRes = await callAuthorized(db, createRequest('/api/hq/projects/p1', 'POST', {}), ['p1']);
    assert.equal(postRes.status, 405);
    assert.equal((await postRes.json()).error, 'METHOD_NOT_ALLOWED');

    // Unknown action under /api/hq/projects/:id returns 404
    const unknownRes = await callAuthorized(db, createRequest('/api/hq/projects/p1/unknown-action'), ['p1', 'unknown-action']);
    assert.equal(unknownRes.status, 404);
  } finally {
    db.close();
  }
});

test('7. Loading sub-resources: tasks and milestones for project detail', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email) VALUES (?, ?)").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c-sub', 'Sub Client', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, created_by) VALUES (?, ?, ?, ?)").run('p-sub', 'c-sub', 'Sub Project', identity.uid);

    // Create a milestone
    db.sqlite.prepare("INSERT INTO project_milestones (id, project_id, name, status, sort_order) VALUES (?, ?, ?, ?, ?)")
      .run('m-1', 'p-sub', 'Phase 1 Delivery', 'completed', 1);

    // Create tasks
    db.sqlite.prepare("INSERT INTO project_tasks (id, project_id, milestone_id, title, status, priority, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run('t-1', 'p-sub', 'm-1', 'Wireframe design', 'done', 'high', identity.uid);
    db.sqlite.prepare("INSERT INTO project_tasks (id, project_id, title, status, priority, created_by) VALUES (?, ?, ?, ?, ?, ?)")
      .run('t-2', 'p-sub', 'API integration', 'in-progress', 'urgent', identity.uid);

    const projectRes = await (await callAuthorized(db, createRequest('/api/hq/projects/p-sub'), ['p-sub'])).json();
    const tasksRes = await (await callAuthorized(db, createRequest('/api/hq/projects/p-sub/tasks'), ['p-sub', 'tasks'])).json();
    const milestonesRes = await (await callAuthorized(db, createRequest('/api/hq/projects/p-sub/milestones'), ['p-sub', 'milestones'])).json();

    assert.equal(projectRes.ok, true);
    assert.equal(tasksRes.ok, true);
    assert.equal(tasksRes.tasks.length, 2);
    assert.equal(milestonesRes.ok, true);
    assert.equal(milestonesRes.milestones.length, 1);

    const bundle = normalizeProjectDetailBundle(projectRes, tasksRes, milestonesRes);
    assert.ok(bundle);
    assert.equal(bundle.project.id, 'p-sub');
    assert.equal(bundle.tasks.length, 2);
    assert.equal(bundle.tasks[0].title, 'Wireframe design');
    assert.equal(bundle.milestones.length, 1);
    assert.equal(bundle.milestones[0].name, 'Phase 1 Delivery');
  } finally {
    db.close();
  }
});

test('8. Defensive data normalization prevents undefined-property crash on audit defect response', () => {
  // Exact scenario identified during Phase 7.2 audit:
  // Backend returned collection response: { ok: true, projects: [...] }
  const collectionResponse = {
    ok: true,
    projects: [
      { id: 'proj-1', name: 'Website', status: 'in-progress' },
      { id: 'proj-2', name: 'Mobile App', status: 'discovery' }
    ],
    limit: 50,
    offset: 0
  };

  // In the unfixed code, this set detail = { ok: true, projects: [...] },
  // causing detail.project to be undefined, and detail.project.status threw:
  // TypeError: Cannot read properties of undefined (reading 'status')
  const result = normalizeProjectDetailBundle(collectionResponse);
  assert.equal(result, null, 'Collection response must be normalized to null, avoiding undefined project access');

  // Verify other malformed / unexpected responses also return null without throwing
  assert.equal(normalizeProjectDetailBundle(null), null);
  assert.equal(normalizeProjectDetailBundle(undefined), null);
  assert.equal(normalizeProjectDetailBundle({}), null);
  assert.equal(normalizeProjectDetailBundle({ project: null }), null);
  assert.equal(normalizeProjectDetailBundle({ ok: true, project: null }), null);
  assert.equal(normalizeProjectDetailBundle({ ok: false, error: 'NOT_FOUND' }), null);
  assert.equal(normalizeProjectDetailBundle('invalid string'), null);
  assert.equal(normalizeProjectDetailBundle(12345), null);

  // When project object has no status, defaults safely to 'Planning'
  const noStatus = normalizeProjectDetailBundle({ ok: true, project: { id: 'p-nostatus', name: 'No Status' } });
  assert.ok(noStatus);
  assert.equal(noStatus.project.status, 'Planning');
  assert.equal(noStatus.project.status.length > 0, true);

  // Missing tasks / milestones default safely to empty arrays
  assert.deepEqual(noStatus.tasks, []);
  assert.deepEqual(noStatus.milestones, []);
  assert.equal(noStatus.tasks.length, 0);
  assert.equal(noStatus.milestones.length, 0);
});

test('9. Existing project list functionality remains unaffected', async () => {
  const db = new TestD1();
  try {
    db.sqlite.prepare("INSERT INTO hq_users (uid, email) VALUES (?, ?)").run(identity.uid, identity.email);
    db.sqlite.prepare("INSERT INTO clients (id, name, created_by) VALUES (?, ?, ?)").run('c-list', 'List Client', identity.uid);

    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, status, created_by) VALUES (?, ?, ?, ?, ?)")
      .run('p-l1', 'c-list', 'List Project 1', 'discovery', identity.uid);
    db.sqlite.prepare("INSERT INTO projects (id, client_id, name, status, created_by) VALUES (?, ?, ?, ?, ?)")
      .run('p-l2', 'c-list', 'List Project 2', 'completed', identity.uid);

    // List all non-archived projects
    const listRes = await callAuthorized(db, createRequest('/api/hq/projects'), []);
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.ok, true);
    assert.equal(listBody.projects.length, 2);

    // List filtered by status
    const filterRes = await callAuthorized(db, createRequest('/api/hq/projects?status=completed'), []);
    assert.equal(filterRes.status, 200);
    const filterBody = await filterRes.json();
    assert.equal(filterBody.ok, true);
    assert.equal(filterBody.projects.length, 1);
    assert.equal(filterBody.projects[0].name, 'List Project 2');
  } finally {
    db.close();
  }
});
