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

const MILESTONE_STATUSES = ['Pending', 'In Progress', 'Completed', 'Delayed'];

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId') || '';

  try {
    const conditions = ['m.archived_at IS NULL'];
    const params = [];
    if (projectId) {
      conditions.push('m.project_id = ?');
      params.push(projectId);
    }
    const rows = await db
      .prepare(
        `SELECT m.*, p.name AS project_name, c.business_name AS client_business
         FROM project_milestones m
         JOIN projects p ON p.id = m.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY m.sort_order ASC, m.due_date ASC`
      )
      .bind(...params)
      .all();

    return jsonResponse({ success: true, milestones: rows.results || [] });
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
  const project = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(projectId).first();
  if (!project) return errorResponse(404, 'NOT_FOUND', 'Linked project not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status = MILESTONE_STATUSES.includes(body.status) ? body.status : 'Pending';
  const completedAt = status === 'Completed' ? nowIso : null;

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
      cleanString(body.due_date ?? body.target_date ?? body.targetDate, 40) || null,
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
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Milestone not found');

  const status = MILESTONE_STATUSES.includes(body.status) ? body.status : existing.status;
  const nowIso = new Date().toISOString();
  const completedAt = status === 'Completed' ? existing.completed_at || nowIso : null;

  await db
    .prepare(
      `UPDATE project_milestones
       SET name = ?, description = ?, status = ?, due_date = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      cleanString(body.name ?? body.title ?? existing.name, 200),
      cleanString(body.description ?? existing.description, 2000),
      status,
      body.due_date !== undefined || body.target_date !== undefined
        ? cleanString(body.due_date ?? body.target_date, 40) || null
        : existing.due_date,
      completedAt,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM project_milestones WHERE id = ?`).bind(id).first();
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

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM project_milestones WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Milestone not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
