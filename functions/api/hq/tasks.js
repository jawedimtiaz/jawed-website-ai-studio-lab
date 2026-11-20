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

const CANONICAL_TASK_STATUSES = new Set(['todo', 'in-progress', 'blocked', 'done', 'cancelled']);
const CANONICAL_TASK_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

export function normalizeTaskStatus(val) {
  if (!val) return 'todo';
  const s = String(val).trim().toLowerCase();
  if (s === 'todo' || s === 'to-do' || s === 'pending') return 'todo';
  if (s === 'in progress' || s === 'in-progress' || s === 'inprogress' || s === 'doing') return 'in-progress';
  if (s === 'blocked') return 'blocked';
  if (s === 'done' || s === 'completed' || s === 'complete' || s === 'review') return 'done';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (CANONICAL_TASK_STATUSES.has(s)) return s;
  return 'todo';
}

export function normalizeTaskPriority(val) {
  if (!val) return 'normal';
  const p = String(val).trim().toLowerCase();
  if (p === 'low') return 'low';
  if (p === 'normal' || p === 'medium') return 'normal';
  if (p === 'high') return 'high';
  if (p === 'urgent' || p === 'critical') return 'urgent';
  if (CANONICAL_TASK_PRIORITIES.has(p)) return p;
  return 'normal';
}

async function resolveAssignedTo(db, assignedToInput) {
  if (!assignedToInput) return null;
  const candidate = cleanString(assignedToInput, 128);
  if (!candidate) return null;
  const user = await db
    .prepare(`SELECT uid FROM hq_users WHERE uid = ? OR email = ?`)
    .bind(candidate, candidate)
    .first();
  return user ? user.uid : null;
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId') || url.searchParams.get('project_id') || '';
  const statusParam = url.searchParams.get('status') || '';
  const includeArchived = url.searchParams.get('includeArchived') === 'true';

  try {
    const conditions = [];
    const params = [];

    if (!includeArchived) {
      conditions.push('t.archived_at IS NULL');
    }
    if (projectId) {
      conditions.push('t.project_id = ?');
      params.push(projectId);
    }
    if (statusParam && statusParam.toLowerCase() !== 'all') {
      conditions.push('t.status = ?');
      params.push(normalizeTaskStatus(statusParam));
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db
      .prepare(
        `SELECT t.*,
                u.display_name AS assigned_to_name,
                p.name AS project_name,
                c.business_name AS client_business,
                m.name AS milestone_name
         FROM project_tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN hq_users u ON u.uid = t.assigned_to
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN project_milestones m ON m.id = t.milestone_id
         ${whereClause}
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
  const project = await db.prepare(`SELECT id FROM projects WHERE id = ? AND archived_at IS NULL`).bind(projectId).first();
  if (!project) return errorResponse(404, 'NOT_FOUND', 'Linked project not found');

  const milestoneId = cleanString(body.milestone_id || body.milestoneId, 128) || null;
  if (milestoneId) {
    const milestone = await db.prepare(`SELECT id FROM project_milestones WHERE id = ? AND archived_at IS NULL`).bind(milestoneId).first();
    if (!milestone) return errorResponse(404, 'NOT_FOUND', 'Linked milestone not found');
  }

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status = normalizeTaskStatus(body.status);
  const priority = normalizeTaskPriority(body.priority);
  const completedAt = status === 'done' ? nowIso : null;
  const assignedTo = await resolveAssignedTo(db, body.assigned_to || body.assignedTo);

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
      milestoneId,
      title,
      cleanString(body.description, 3000),
      status,
      priority,
      assignedTo,
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
  if (!existing || existing.archived_at) return errorResponse(404, 'NOT_FOUND', 'Task not found');

  const title = body.title !== undefined ? cleanString(body.title, 200) : existing.title;
  if (!title) {
    return errorResponse(400, 'INVALID_INPUT', 'Task title cannot be empty');
  }

  let milestoneId = existing.milestone_id;
  if (body.milestone_id !== undefined || body.milestoneId !== undefined) {
    const rawMs = cleanString(body.milestone_id ?? body.milestoneId, 128);
    if (rawMs) {
      const ms = await db.prepare(`SELECT id FROM project_milestones WHERE id = ? AND archived_at IS NULL`).bind(rawMs).first();
      if (!ms) return errorResponse(404, 'NOT_FOUND', 'Linked milestone not found');
      milestoneId = rawMs;
    } else {
      milestoneId = null;
    }
  }

  const status = body.status !== undefined ? normalizeTaskStatus(body.status) : existing.status;
  const priority = body.priority !== undefined ? normalizeTaskPriority(body.priority) : existing.priority;
  const nowIso = new Date().toISOString();
  const isDone = status === 'done';
  const completedAt = isDone ? (existing.completed_at || nowIso) : null;

  let assignedTo = existing.assigned_to;
  if (body.assigned_to !== undefined || body.assignedTo !== undefined) {
    assignedTo = await resolveAssignedTo(db, body.assigned_to ?? body.assignedTo);
  }

  await db
    .prepare(
      `UPDATE project_tasks
       SET milestone_id = ?, title = ?, description = ?, status = ?, priority = ?,
           assigned_to = ?, due_date = ?, completed_at = ?, sort_order = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      milestoneId,
      title,
      cleanString(body.description ?? existing.description, 3000),
      status,
      priority,
      assignedTo,
      body.due_date !== undefined || body.dueDate !== undefined
        ? (cleanString(body.due_date ?? body.dueDate, 40) || null)
        : existing.due_date,
      completedAt,
      body.sort_order !== undefined ? Number(body.sort_order) || 0 : existing.sort_order,
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
    before: { status: existing.status, priority: existing.priority, title: existing.title },
    after: { status: updated.status, priority: updated.priority, title: updated.title }
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

  const permanent = new URL(request.url).searchParams.get('permanent') === 'true';
  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM project_tasks WHERE id = ?`).bind(id).first();
  if (!existing || (!permanent && existing.archived_at)) {
    return errorResponse(404, 'NOT_FOUND', 'Task not found');
  }

  const nowIso = new Date().toISOString();
  if (permanent) {
    await db.prepare(`DELETE FROM project_tasks WHERE id = ?`).bind(id).run();
  } else {
    await db
      .prepare(`UPDATE project_tasks SET archived_at = ?, archived_by = ?, updated_at = ? WHERE id = ?`)
      .bind(nowIso, auth.owner.uid, nowIso, id)
      .run();
  }

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: permanent ? 'TASK_DELETED' : 'TASK_ARCHIVED',
    entityType: 'project_tasks',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: { title: existing.title, status: existing.status }
  });

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions(context) {
  return hqOptionsResponse(context);
}
