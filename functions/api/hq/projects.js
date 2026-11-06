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
    const [id, action] = segments;
    if (!id || id.length > 80) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
    if (action === 'archive' && request.method === 'POST') return await archiveProject(db, identity, id, false);
    if (action === 'restore' && request.method === 'POST') return await archiveProject(db, identity, id, true);
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
