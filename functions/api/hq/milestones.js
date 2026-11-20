// functions/api/hq/milestones.js
// Studio HQ Project Milestones API Endpoint (Canonical `project_milestones` schema)

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

const CANONICAL_MILESTONE_STATUSES = new Set(['not-started', 'in-progress', 'blocked', 'completed', 'skipped']);

export function normalizeMilestoneStatus(val) {
  if (!val) return 'not-started';
  const s = String(val).trim().toLowerCase();
  if (s === 'not-started' || s === 'not_started' || s === 'pending') return 'not-started';
  if (s === 'in-progress' || s === 'in progress' || s === 'inprogress') return 'in-progress';
  if (s === 'blocked' || s === 'delayed') return 'blocked';
  if (s === 'completed' || s === 'done' || s === 'complete') return 'completed';
  if (s === 'skipped') return 'skipped';
  if (CANONICAL_MILESTONE_STATUSES.has(s)) return s;
  return 'not-started';
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
      conditions.push('m.archived_at IS NULL');
    }
    if (projectId) {
      conditions.push('m.project_id = ?');
      params.push(projectId);
    }
    if (statusParam && statusParam.toLowerCase() !== 'all') {
      conditions.push('m.status = ?');
      params.push(normalizeMilestoneStatus(statusParam));
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db
      .prepare(
        `SELECT m.*,
                p.name AS project_name,
                c.business_name AS client_business
         FROM project_milestones m
         JOIN projects p ON p.id = m.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         ${whereClause}
         ORDER BY m.sort_order ASC, m.due_date ASC`
      )
      .bind(...params)
      .all();

    return jsonResponse({ success: true, milestones: rows.results || [], count: rows.results?.length || 0 });
  } catch (err) {
    console.error('[HQ Milestones GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve milestones');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const name = cleanString(body.name ?? body.title, 200);
  const projectId = cleanString(body.project_id ?? body.projectId, 128);
  if (!name || !projectId) {
    return errorResponse(400, 'INVALID_INPUT', 'Milestone name and project_id are required');
  }

  const db = env.HQ_DB;
  const project = await db.prepare(`SELECT id FROM projects WHERE id = ? AND archived_at IS NULL`).bind(projectId).first();
  if (!project) return errorResponse(404, 'NOT_FOUND', 'Linked project not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status = normalizeMilestoneStatus(body.status);
  const completedAt = status === 'completed' ? nowIso : null;
  const dueDate = cleanString(body.due_date ?? body.target_date ?? body.targetDate, 40) || null;

  await db
    .prepare(
      `INSERT INTO project_milestones (
        id, project_id, name, description, status, due_date, completed_at, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      projectId,
      name,
      cleanString(body.description, 2000),
      status,
      dueDate,
      completedAt,
      Number(body.sort_order ?? 0) || 0,
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM project_milestones WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'MILESTONE_CREATED',
    entityType: 'project_milestones',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, milestone: created }, 201);
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Milestone ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM project_milestones WHERE id = ?`).bind(id).first();
  if (!existing || existing.archived_at) return errorResponse(404, 'NOT_FOUND', 'Milestone not found');

  const name = body.name !== undefined || body.title !== undefined
    ? cleanString(body.name ?? body.title, 200)
    : existing.name;
  if (!name) {
    return errorResponse(400, 'INVALID_INPUT', 'Milestone name cannot be empty');
  }

  const status = body.status !== undefined ? normalizeMilestoneStatus(body.status) : existing.status;
  const nowIso = new Date().toISOString();
  const completedAt = status === 'completed' ? (existing.completed_at || nowIso) : null;

  await db
    .prepare(
      `UPDATE project_milestones
       SET name = ?, description = ?, status = ?, due_date = ?, completed_at = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      name,
      cleanString(body.description ?? existing.description, 2000),
      status,
      body.due_date !== undefined || body.target_date !== undefined || body.targetDate !== undefined
        ? (cleanString(body.due_date ?? body.target_date ?? body.targetDate, 40) || null)
        : existing.due_date,
      completedAt,
      body.sort_order !== undefined ? Number(body.sort_order) || 0 : existing.sort_order,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM project_milestones WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'MILESTONE_UPDATED',
    entityType: 'project_milestones',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: { name: existing.name, status: existing.status },
    after: { name: updated.name, status: updated.status }
  });

  return jsonResponse({ success: true, milestone: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Milestone ID is required');

  const permanent = new URL(request.url).searchParams.get('permanent') === 'true';
  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM project_milestones WHERE id = ?`).bind(id).first();
  if (!existing || (!permanent && existing.archived_at)) {
    return errorResponse(404, 'NOT_FOUND', 'Milestone not found');
  }

  const nowIso = new Date().toISOString();
  if (permanent) {
    await db.prepare(`DELETE FROM project_milestones WHERE id = ?`).bind(id).run();
  } else {
    await db
      .prepare(`UPDATE project_milestones SET archived_at = ?, archived_by = ?, updated_at = ? WHERE id = ?`)
      .bind(nowIso, auth.owner.uid, nowIso, id)
      .run();
  }

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: permanent ? 'MILESTONE_DELETED' : 'MILESTONE_ARCHIVED',
    entityType: 'project_milestones',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: { name: existing.name, status: existing.status }
  });

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions(context) {
  return hqOptionsResponse(context);
}
