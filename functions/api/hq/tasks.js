// functions/api/hq/tasks.js
// Studio HQ Project Tasks API Endpoint (Canonical `project_tasks` schema)

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

const TASK_STATUSES = ['Todo', 'In Progress', 'Review', 'Blocked', 'Done', 'Completed', 'Cancelled'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId') || '';
  const status = url.searchParams.get('status') || '';

  try {
    const conditions = ['t.archived_at IS NULL'];
    const params = [];
    if (projectId) {
      conditions.push('t.project_id = ?');
      params.push(projectId);
    }
    if (status && status !== 'All') {
      conditions.push('t.status = ?');
      params.push(status);
    }

    const rows = await db
      .prepare(
        `SELECT t.*, p.name AS project_name, c.business_name AS client_business, m.name AS milestone_name
         FROM project_tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN project_milestones m ON m.id = t.milestone_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY CASE WHEN t.due_date IS NULL OR t.due_date = '' THEN 1 ELSE 0 END, t.due_date ASC, t.updated_at DESC`
      )
      .bind(...params)
      .all();

    return jsonResponse({ success: true, tasks: rows.results || [], count: rows.results?.length || 0 });
  } catch (err) {
    console.error('[HQ Tasks GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve tasks');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const title = cleanString(body.title, 200);
  const projectId = cleanString(body.project_id || body.projectId, 128);
  if (!title || !projectId) {
    return errorResponse(400, 'INVALID_INPUT', 'Task title and project_id are required');
  }

  const db = env.HQ_DB;
  const project = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(projectId).first();
  if (!project) return errorResponse(404, 'NOT_FOUND', 'Linked project not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status = TASK_STATUSES.includes(body.status) ? body.status : 'Todo';
  const priority = PRIORITIES.includes(body.priority) ? body.priority : 'Medium';
  const completedAt = status === 'Done' || status === 'Completed' ? nowIso : null;

  await db
    .prepare(
      `INSERT INTO project_tasks (
        id, project_id, milestone_id, title, description, status, priority,
        assigned_to, due_date, completed_at, sort_order, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      projectId,
      cleanString(body.milestone_id || body.milestoneId, 128) || null,
      title,
      cleanString(body.description, 3000),
      status,
      priority,
      cleanString(body.assigned_to || body.assignedTo || 'Jawed Imtiaz', 150),
      cleanString(body.due_date || body.dueDate, 40) || null,
      completedAt,
      Number(body.sort_order ?? 0) || 0,
      auth.owner.uid,
      auth.owner.uid,
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM project_tasks WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'TASK_CREATED',
    entityType: 'project_tasks',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, task: created }, 201);
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Task ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM project_tasks WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Task not found');

  const status = TASK_STATUSES.includes(body.status) ? body.status : existing.status;
  const priority = PRIORITIES.includes(body.priority) ? body.priority : existing.priority;
  const nowIso = new Date().toISOString();
  const isDone = status === 'Done' || status === 'Completed';
  const completedAt = isDone ? existing.completed_at || nowIso : null;

  await db
    .prepare(
      `UPDATE project_tasks
       SET milestone_id = ?, title = ?, description = ?, status = ?, priority = ?,
           assigned_to = ?, due_date = ?, completed_at = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      body.milestone_id !== undefined ? cleanString(body.milestone_id, 128) || null : existing.milestone_id,
      cleanString(body.title ?? existing.title, 200),
      cleanString(body.description ?? existing.description, 3000),
      status,
      priority,
      cleanString(body.assigned_to ?? body.assignedTo ?? existing.assigned_to, 150),
      body.due_date !== undefined ? cleanString(body.due_date, 40) || null : existing.due_date,
      completedAt,
      auth.owner.uid,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM project_tasks WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'TASK_UPDATED',
    entityType: 'project_tasks',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: { status: existing.status },
    after: { status: updated.status }
  });

  return jsonResponse({ success: true, task: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Task ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM project_tasks WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Task not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
