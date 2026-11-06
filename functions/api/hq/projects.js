import {
  authorizeHqOwner,
  hqJson,
  readHqJson,
  requireHqDatabase,
  ownerUpsertStatement,
  auditStatement
} from '../../lib/hqApi.js';

const PROJECT_TYPES = new Set(['business-website','portfolio','web-app','automation','ai-app','calculator-generator','maintenance','other']);
const PROJECT_STATUSES = new Set(['lead','discovery','quoted','approved','in-progress','review','blocked','completed','on-hold','cancelled']);
const PRIORITIES = new Set(['low','normal','high','urgent']);
const TEXT_LIMITS = { name: 160, summary: 2000, scope_markdown: 12000 };
const PROJECT_FIELDS = Object.keys(TEXT_LIMITS);

function textField(value, max, key) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: key.toUpperCase() + '_MUST_BE_TEXT' };
  const clean = value.trim();
  if (clean.length > max) return { ok: false, error: key.toUpperCase() + '_TOO_LONG' };
  return { ok: true, value: clean || null };
}

function validDate(value, field) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, error: field + '_INVALID' };
  const date = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value) return { ok: false, error: field + '_INVALID' };
  return { ok: true, value };
}

export function validateProject(input, partial = false) {
  const allowed = new Set([...PROJECT_FIELDS, 'client_id', 'project_type', 'status', 'priority', 'start_date', 'target_date', 'currency', 'quoted_amount_minor']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) return { ok: false, error: 'FIELD_NOT_ALLOWED' };
  const output = {};
  for (const field of PROJECT_FIELDS) {
    if (!(field in input)) continue;
    const result = textField(input[field], TEXT_LIMITS[field], field);
    if (!result.ok) return result;
    output[field] = result.value;
  }
  if ('client_id' in input) {
    if (typeof input.client_id !== 'string' || !input.client_id.trim() || input.client_id.length > 80) return { ok: false, error: 'CLIENT_ID_INVALID' };
    output.client_id = input.client_id.trim();
  } else if (!partial) return { ok: false, error: 'CLIENT_ID_REQUIRED' };
  if (!partial && (!output.name || output.name.length < 2)) return { ok: false, error: 'NAME_REQUIRED' };
  if (partial && 'name' in output && (!output.name || output.name.length < 2)) return { ok: false, error: 'NAME_REQUIRED' };
  for (const [field, values] of [['project_type', PROJECT_TYPES], ['status', PROJECT_STATUSES], ['priority', PRIORITIES]]) {
    if (!(field in input)) continue;
    if (typeof input[field] !== 'string' || !values.has(input[field])) return { ok: false, error: field.toUpperCase() + '_INVALID' };
    output[field] = input[field];
  }
  for (const field of ['start_date','target_date']) {
    if (!(field in input)) continue;
    const result = validDate(input[field], field.toUpperCase());
    if (!result.ok) return result;
    output[field] = result.value;
  }
  if ('currency' in input) {
    if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) return { ok: false, error: 'CURRENCY_INVALID' };
    output.currency = input.currency;
  }
  if ('quoted_amount_minor' in input) {
    const amount = input.quoted_amount_minor;
    if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) return { ok: false, error: 'QUOTED_AMOUNT_INVALID' };
    output.quoted_amount_minor = amount;
  }
  const start = 'start_date' in output ? output.start_date : input.start_date;
  const target = 'target_date' in output ? output.target_date : input.target_date;
  if (start && target && target < start) return { ok: false, error: 'TARGET_DATE_BEFORE_START_DATE' };
  return { ok: true, value: output };
}

async function getProject(db, id) {
  return db.prepare(`SELECT p.*, c.name AS client_name, c.business_name AS client_business_name
    FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.id = ?`).bind(id).first();
}

async function listProjects(request, db) {
  const url = new URL(request.url);
  const archivedOnly = url.searchParams.get('archivedOnly') === 'true';
  const status = url.searchParams.get('status');
  const clientId = url.searchParams.get('clientId');
  if (status && !PROJECT_STATUSES.has(status)) return hqJson({ ok: false, error: 'STATUS_INVALID' }, 400);
  const limitValue = Number.parseInt(url.searchParams.get('limit') || '50', 10);
  const offsetValue = Number.parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = Number.isFinite(limitValue) ? Math.min(100, Math.max(1, limitValue)) : 50;
  const offset = Number.isFinite(offsetValue) ? Math.min(10000, Math.max(0, offsetValue)) : 0;
  const clauses = [archivedOnly ? 'p.archived_at IS NOT NULL' : 'p.archived_at IS NULL'];
  const params = [];
  if (status) { clauses.push('p.status = ?'); params.push(status); }
  if (clientId) { clauses.push('p.client_id = ?'); params.push(clientId); }
  const result = await db.prepare(`SELECT p.id, p.project_code, p.client_id, c.name AS client_name, p.name, p.project_type, p.status, p.priority, p.start_date, p.target_date, p.currency, p.quoted_amount_minor, p.updated_at, p.archived_at
    FROM projects p JOIN clients c ON c.id = p.client_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY p.updated_at DESC, p.id ASC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset).all();
  return hqJson({ ok: true, projects: result.results || [], limit, offset });
}

async function createProject(request, db, identity) {
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateProject(parsed.value);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const project = valid.value;
  const client = await db.prepare('SELECT id FROM clients WHERE id = ? AND archived_at IS NULL').bind(project.client_id).first();
  if (!client) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  const id = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const insert = db.prepare(`INSERT INTO projects
    (id, client_id, name, project_type, status, priority, summary, scope_markdown, start_date, target_date, currency, quoted_amount_minor, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id, client_id, name, project_type, status, priority, summary, start_date, target_date, currency, quoted_amount_minor, created_at, updated_at`)
    .bind(id, project.client_id, project.name, project.project_type ?? 'business-website',
      project.status ?? 'discovery', project.priority ?? 'normal', project.summary ?? null,
      project.scope_markdown ?? null, project.start_date ?? null, project.target_date ?? null,
      project.currency ?? 'INR', project.quoted_amount_minor ?? null, identity.uid, identity.uid);
  const results = await db.batch([
    ownerUpsertStatement(db, identity),
    insert,
    auditStatement(db, identity, 'project.create', 'project', id, requestId, null,
      { name: project.name, client_id: project.client_id, status: project.status ?? 'discovery' })
  ]);
  const row = results?.[1]?.results?.[0] || null;
  if (!row) return hqJson({ ok: false, error: 'PROJECT_CREATE_FAILED' }, 500);
  return hqJson({ ok: true, project: row }, 201);
}

async function updateProject(request, db, identity, id) {
  const existing = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  if (!existing || existing.archived_at) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateProject(parsed.value, true);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const fields = valid.value;
  const keys = Object.keys(fields);
  if (!keys.length) return hqJson({ ok: false, error: 'NO_VALID_FIELDS' }, 400);
  if (fields.client_id) {
    const client = await db.prepare('SELECT id FROM clients WHERE id = ? AND archived_at IS NULL').bind(fields.client_id).first();
    if (!client) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  }
  const merged = { ...existing, ...fields };
  if (merged.start_date && merged.target_date && merged.target_date < merged.start_date) {
    return hqJson({ ok: false, error: 'TARGET_DATE_BEFORE_START_DATE' }, 400);
  }
  const assignments = keys.map(key => key + ' = ?');
  assignments.push("updated_by = ?", "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  const update = db.prepare(`UPDATE projects SET ${assignments.join(', ')} WHERE id = ? AND archived_at IS NULL`)
    .bind(...keys.map(key => fields[key]), identity.uid, id);
  const results = await db.batch([
    ownerUpsertStatement(db, identity),
    update,
    auditStatement(db, identity, 'project.update', 'project', id, crypto.randomUUID(),
      { name: existing.name, status: existing.status, target_date: existing.target_date },
      { name: merged.name, status: merged.status, target_date: merged.target_date })
  ]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  return hqJson({ ok: true, project: await getProject(db, id) });
}

async function archiveProject(db, identity, id, restore = false) {
  const existing = await db.prepare('SELECT id, name, archived_at FROM projects WHERE id = ?').bind(id).first();
  if (!existing || (restore ? !existing.archived_at : !!existing.archived_at)) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  const now = new Date().toISOString();
  const update = restore
    ? db.prepare("UPDATE projects SET archived_at = NULL, archived_by = NULL, updated_by = ?, updated_at = ? WHERE id = ? AND archived_at IS NOT NULL").bind(identity.uid, now, id)
    : db.prepare("UPDATE projects SET archived_at = ?, archived_by = ?, updated_by = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, identity.uid, identity.uid, now, id);
  const results = await db.batch([
    ownerUpsertStatement(db, identity),
    update,
    auditStatement(db, identity, restore ? 'project.restore' : 'project.archive', 'project', id, crypto.randomUUID(),
      { name: existing.name, archived: !!existing.archived_at },
      { name: existing.name, archived: !restore })
  ]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  return hqJson({ ok: true, id, archived: !restore });
}


const TASK_STATUSES = new Set(['todo','in-progress','blocked','done','cancelled']);
const MILESTONE_STATUSES = new Set(['not-started','in-progress','blocked','completed','skipped']);

function validateTask(input, partial = false) {
  const allowed = new Set(['title','description','status','priority','assigned_to','due_date','milestone_id']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) return { ok: false, error: 'FIELD_NOT_ALLOWED' };
  const out = {};
  if ('title' in input) {
    const result = textField(input.title, 160, 'title');
    if (!result.ok) return result;
    out.title = result.value;
  }
  if (!partial && (!out.title || out.title.length < 2)) return { ok: false, error: 'TITLE_REQUIRED' };
  if (partial && 'title' in out && (!out.title || out.title.length < 2)) return { ok: false, error: 'TITLE_REQUIRED' };
  if ('description' in input) {
    const result = textField(input.description, 4000, 'description');
    if (!result.ok) return result;
    out.description = result.value;
  }
  if ('status' in input) {
    if (typeof input.status !== 'string' || !TASK_STATUSES.has(input.status)) return { ok: false, error: 'TASK_STATUS_INVALID' };
    out.status = input.status;
  }
  if ('priority' in input) {
    if (typeof input.priority !== 'string' || !PRIORITIES.has(input.priority)) return { ok: false, error: 'TASK_PRIORITY_INVALID' };
    out.priority = input.priority;
  }
  if ('due_date' in input) {
    const result = validDate(input.due_date, 'DUE_DATE');
    if (!result.ok) return result;
    out.due_date = result.value;
  }
  for (const field of ['assigned_to','milestone_id']) {
    if (!(field in input)) continue;
    if (input[field] === null || input[field] === '') out[field] = null;
    else if (typeof input[field] !== 'string' || input[field].length > 80) return { ok: false, error: field.toUpperCase() + '_INVALID' };
    else out[field] = input[field];
  }
  return { ok: true, value: out };
}

function validateMilestone(input, partial = false) {
  const allowed = new Set(['name','description','status','due_date','sort_order']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) return { ok: false, error: 'FIELD_NOT_ALLOWED' };
  const out = {};
  if ('name' in input) {
    const result = textField(input.name, 160, 'name');
    if (!result.ok) return result;
    out.name = result.value;
  }
  if (!partial && (!out.name || out.name.length < 2)) return { ok: false, error: 'NAME_REQUIRED' };
  if (partial && 'name' in out && (!out.name || out.name.length < 2)) return { ok: false, error: 'NAME_REQUIRED' };
  if ('description' in input) {
    const result = textField(input.description, 4000, 'description');
    if (!result.ok) return result;
    out.description = result.value;
  }
  if ('status' in input) {
    if (typeof input.status !== 'string' || !MILESTONE_STATUSES.has(input.status)) return { ok: false, error: 'MILESTONE_STATUS_INVALID' };
    out.status = input.status;
  }
  if ('due_date' in input) {
    const result = validDate(input.due_date, 'DUE_DATE');
    if (!result.ok) return result;
    out.due_date = result.value;
  }
  if ('sort_order' in input) {
    if (!Number.isSafeInteger(input.sort_order) || input.sort_order < 0 || input.sort_order > 100000) return { ok: false, error: 'SORT_ORDER_INVALID' };
    out.sort_order = input.sort_order;
  }
  return { ok: true, value: out };
}

async function projectExists(db, projectId) {
  return db.prepare('SELECT id FROM projects WHERE id = ? AND archived_at IS NULL').bind(projectId).first();
}

async function listProjectTasks(request, db, projectId) {
  const archivedOnly = new URL(request.url).searchParams.get('archivedOnly') === 'true';
  const exists = await projectExists(db, projectId);
  if (!exists) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  const result = await db.prepare(`SELECT t.*, m.name AS milestone_name
    FROM project_tasks t LEFT JOIN project_milestones m ON m.id = t.milestone_id
    WHERE t.project_id = ? AND ${archivedOnly ? 't.archived_at IS NOT NULL' : 't.archived_at IS NULL'}
    ORDER BY t.sort_order ASC, t.due_date ASC, t.created_at ASC`).bind(projectId).all();
  return hqJson({ ok: true, tasks: result.results || [] });
}

async function createProjectTask(request, db, identity, projectId) {
  const exists = await projectExists(db, projectId);
  if (!exists) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateTask(parsed.value);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const task = valid.value;
  if (task.milestone_id) {
    const milestone = await db.prepare('SELECT id FROM project_milestones WHERE id = ? AND project_id = ? AND archived_at IS NULL').bind(task.milestone_id, projectId).first();
    if (!milestone) return hqJson({ ok: false, error: 'MILESTONE_NOT_FOUND' }, 404);
  }
  if (task.assigned_to) {
    const assignee = await db.prepare("SELECT uid FROM hq_users WHERE uid = ? AND status = 'active'").bind(task.assigned_to).first();
    if (!assignee) return hqJson({ ok: false, error: 'ASSIGNEE_NOT_FOUND' }, 404);
  }
  const id = crypto.randomUUID();
  const insert = db.prepare(`INSERT INTO project_tasks
    (id, project_id, milestone_id, title, description, status, priority, assigned_to, due_date, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id, project_id, milestone_id, title, description, status, priority, assigned_to, due_date, created_at, updated_at`)
    .bind(id, projectId, task.milestone_id ?? null, task.title, task.description ?? null,
      task.status ?? 'todo', task.priority ?? 'normal', task.assigned_to ?? null,
      task.due_date ?? null, identity.uid, identity.uid);
  const results = await db.batch([
    ownerUpsertStatement(db, identity),
    insert,
    auditStatement(db, identity, 'project.task.create', 'project_task', id, crypto.randomUUID(), null,
      { project_id: projectId, title: task.title, status: task.status ?? 'todo' })
  ]);
  const row = results?.[1]?.results?.[0] || null;
  return row ? hqJson({ ok: true, task: row }, 201) : hqJson({ ok: false, error: 'TASK_CREATE_FAILED' }, 500);
}

async function updateProjectTask(request, db, identity, projectId, taskId) {
  const existing = await db.prepare('SELECT * FROM project_tasks WHERE id = ? AND project_id = ? AND archived_at IS NULL').bind(taskId, projectId).first();
  if (!existing) return hqJson({ ok: false, error: 'TASK_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateTask(parsed.value, true);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const fields = valid.value;
  const keys = Object.keys(fields);
  if (!keys.length) return hqJson({ ok: false, error: 'NO_VALID_FIELDS' }, 400);
  if (fields.milestone_id) {
    const milestone = await db.prepare('SELECT id FROM project_milestones WHERE id = ? AND project_id = ? AND archived_at IS NULL').bind(fields.milestone_id, projectId).first();
    if (!milestone) return hqJson({ ok: false, error: 'MILESTONE_NOT_FOUND' }, 404);
  }
  if (fields.assigned_to) {
    const assignee = await db.prepare("SELECT uid FROM hq_users WHERE uid = ? AND status = 'active'").bind(fields.assigned_to).first();
    if (!assignee) return hqJson({ ok: false, error: 'ASSIGNEE_NOT_FOUND' }, 404);
  }
  const assignments = keys.map(key => key + ' = ?');
  assignments.push("updated_by = ?", "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  const update = db.prepare(`UPDATE project_tasks SET ${assignments.join(', ')} WHERE id = ? AND project_id = ? AND archived_at IS NULL`)
    .bind(...keys.map(key => fields[key]), identity.uid, taskId, projectId);
  const results = await db.batch([
    ownerUpsertStatement(db, identity),
    update,
    auditStatement(db, identity, 'project.task.update', 'project_task', taskId, crypto.randomUUID(),
      { title: existing.title, status: existing.status }, { title: fields.title ?? existing.title, status: fields.status ?? existing.status })
  ]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) return hqJson({ ok: false, error: 'TASK_NOT_FOUND' }, 404);
  const task = await db.prepare('SELECT * FROM project_tasks WHERE id = ?').bind(taskId).first();
  return hqJson({ ok: true, task });
}

async function listProjectMilestones(request, db, projectId) {
  const archivedOnly = new URL(request.url).searchParams.get('archivedOnly') === 'true';
  const exists = await projectExists(db, projectId);
  if (!exists) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  const result = await db.prepare(`SELECT * FROM project_milestones WHERE project_id = ? AND ${archivedOnly ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'} ORDER BY sort_order ASC, due_date ASC`).bind(projectId).all();
  return hqJson({ ok: true, milestones: result.results || [] });
}

async function createProjectMilestone(request, db, identity, projectId) {
  const exists = await projectExists(db, projectId);
  if (!exists) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateMilestone(parsed.value);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const milestone = valid.value;
  const id = crypto.randomUUID();
  const insert = db.prepare(`INSERT INTO project_milestones (id, project_id, name, description, status, due_date, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING id, project_id, name, description, status, due_date, sort_order, created_at, updated_at`)
    .bind(id, projectId, milestone.name, milestone.description ?? null, milestone.status ?? 'not-started',
      milestone.due_date ?? null, milestone.sort_order ?? 0);
  const results = await db.batch([
    ownerUpsertStatement(db, identity),
    insert,
    auditStatement(db, identity, 'project.milestone.create', 'project_milestone', id, crypto.randomUUID(), null,
      { project_id: projectId, name: milestone.name, status: milestone.status ?? 'not-started' })
  ]);
  const row = results?.[1]?.results?.[0] || null;
  return row ? hqJson({ ok: true, milestone: row }, 201) : hqJson({ ok: false, error: 'MILESTONE_CREATE_FAILED' }, 500);
}

async function updateProjectMilestone(request, db, identity, projectId, milestoneId) {
  const existing = await db.prepare('SELECT * FROM project_milestones WHERE id = ? AND project_id = ? AND archived_at IS NULL').bind(milestoneId, projectId).first();
  if (!existing) return hqJson({ ok: false, error: 'MILESTONE_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateMilestone(parsed.value, true);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const fields = valid.value;
  const keys = Object.keys(fields);
  if (!keys.length) return hqJson({ ok: false, error: 'NO_VALID_FIELDS' }, 400);
  const assignments = keys.map(key => key + ' = ?');
  assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  const update = db.prepare(`UPDATE project_milestones SET ${assignments.join(', ')} WHERE id = ? AND project_id = ? AND archived_at IS NULL`)
    .bind(...keys.map(key => fields[key]), milestoneId, projectId);
  const results = await db.batch([
    ownerUpsertStatement(db, identity),
    update,
    auditStatement(db, identity, 'project.milestone.update', 'project_milestone', milestoneId, crypto.randomUUID(),
      { name: existing.name, status: existing.status }, { name: fields.name ?? existing.name, status: fields.status ?? existing.status })
  ]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) return hqJson({ ok: false, error: 'MILESTONE_NOT_FOUND' }, 404);
  const milestone = await db.prepare('SELECT * FROM project_milestones WHERE id = ?').bind(milestoneId).first();
  return hqJson({ ok: true, milestone });
}

export async function handleAuthorizedHqProjects({ request, env, segments, identity }) {
  const dbResult = requireHqDatabase(env);
  if (!dbResult.ok) return dbResult.response;
  const db = dbResult.db;
  try {
    if (segments.length === 0) {
      if (request.method === 'GET') return await listProjects(request, db);
      if (request.method === 'POST') return await createProject(request, db, identity);
      return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    }
    const [id, action, childId] = segments;
    if (!id || id.length > 80) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
    if (action === 'archive' && segments.length === 2 && request.method === 'POST') return await archiveProject(db, identity, id, false);
    if (action === 'restore' && segments.length === 2 && request.method === 'POST') return await archiveProject(db, identity, id, true);
    if (action === 'tasks') {
      if (segments.length === 2 && request.method === 'GET') return await listProjectTasks(request, db, id);
      if (segments.length === 2 && request.method === 'POST') return await createProjectTask(request, db, identity, id);
      if (segments.length === 3 && request.method === 'PATCH') return await updateProjectTask(request, db, identity, id, childId);
      return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    }
    if (action === 'milestones') {
      if (segments.length === 2 && request.method === 'GET') return await listProjectMilestones(request, db, id);
      if (segments.length === 2 && request.method === 'POST') return await createProjectMilestone(request, db, identity, id);
      if (segments.length === 3 && request.method === 'PATCH') return await updateProjectMilestone(request, db, identity, id, childId);
      return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    }
    if (action) return hqJson({ ok: false, error: 'NOT_FOUND' }, 404);
    if (request.method === 'GET') {
      const project = await getProject(db, id);
      return project ? hqJson({ ok: true, project }) : hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
    }
    if (request.method === 'PATCH') return await updateProject(request, db, identity, id);
    return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  } catch (error) {
    console.error('[Studio HQ] Project API operation failed:', error);
    return hqJson({ ok: false, error: 'HQ_REQUEST_FAILED' }, 500);
  }
}

export async function handleHqProjects({ request, env, segments }) {
  const auth = await authorizeHqOwner(request);
  if (!auth.ok) return auth.response;
  return handleAuthorizedHqProjects({ request, env, segments, identity: auth.identity });
}
