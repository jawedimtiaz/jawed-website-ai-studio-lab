// functions/api/hq/onboarding.js
// Studio HQ Customer & Project Onboarding Checklists API
// Reconciled with Canonical Studio HQ Schema (0001_studio_hq_schema.sql)
// Safely adapts onboarding checklist items to canonical project_tasks table

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

/**
 * Maps a canonical project_tasks row to an onboarding checklist item shape.
 */
function toOnboardingItem(row) {
  let displayStatus = 'Pending';
  switch (row.status) {
    case 'done': displayStatus = 'Completed'; break;
    case 'in-progress': displayStatus = 'In Progress'; break;
    case 'blocked': displayStatus = 'Blocked'; break;
    case 'todo': default: displayStatus = 'Pending'; break;
  }

  return {
    id: row.id,
    project_id: row.project_id,
    client_id: row.client_id || '',
    client_business: row.client_business || '',
    client_name: row.client_name || '',
    project_name: row.project_name || '',
    title: row.title,
    category: 'Access & Assets',
    status: displayStatus,
    canonical_status: row.status,
    owner_role: 'Studio',
    due_date: row.due_date || '',
    notes: row.description || '',
    sort_order: row.sort_order ?? 0,
    completed_at: row.completed_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at || null,
    archived_by: row.archived_by || null
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const clientId = cleanString(url.searchParams.get('clientId'), 128);
  const projectId = cleanString(url.searchParams.get('projectId'), 128);

  try {
    const conditions = ['pt.archived_at IS NULL', 'p.archived_at IS NULL'];
    const params = [];

    if (clientId) {
      conditions.push('p.client_id = ?');
      params.push(clientId);
    }
    if (projectId) {
      conditions.push('pt.project_id = ?');
      params.push(projectId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const stmt = db.prepare(
      `SELECT pt.*, p.name AS project_name, p.client_id, c.business_name AS client_business, c.name AS client_name
       FROM project_tasks pt
       JOIN projects p ON p.id = pt.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       ${whereClause}
       ORDER BY pt.sort_order ASC, pt.created_at DESC`
    );

    const rows = await stmt.bind(...params).all();
    const items = (rows.results || []).map(toOnboardingItem);

    return jsonResponse({ success: true, items });
  } catch (err) {
    console.error('[HQ Onboarding GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve onboarding items');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const title = cleanString(body.title, 200);
  if (!title) {
    return errorResponse(400, 'INVALID_INPUT', 'Checklist item title is required');
  }

  const db = env.HQ_DB;
  let projectId = cleanString(body.project_id || body.projectId, 128);
  const clientId = cleanString(body.client_id || body.clientId, 128);

  try {
    // If project_id is not directly specified, attempt to resolve active project from client_id
    if (!projectId && clientId) {
      const proj = await db
        .prepare(`SELECT id FROM projects WHERE client_id = ? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 1`)
        .bind(clientId)
        .first();
      if (proj) {
        projectId = proj.id;
      }
    }

    if (!projectId) {
      return errorResponse(400, 'INVALID_INPUT', 'A valid active project ID is required');
    }

    // Verify project exists and is active
    const project = await db.prepare(`SELECT id, client_id FROM projects WHERE id = ? AND archived_at IS NULL`).bind(projectId).first();
    if (!project) {
      return errorResponse(404, 'NOT_FOUND', 'Project not found or archived');
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const dueDate = cleanString(body.due_date || body.dueDate, 40) || null;
    const notes = cleanString(body.notes || body.description, 2000) || '';
    const sortOrder = Number(body.sort_order ?? 0) || 0;

    let status = 'todo';
    let completedAt = null;
    if (body.status === 'Completed' || body.status === 'done') {
      status = 'done';
      completedAt = nowIso;
    } else if (body.status === 'In Progress' || body.status === 'in-progress') {
      status = 'in-progress';
    } else if (body.status === 'Blocked' || body.status === 'blocked') {
      status = 'blocked';
    }

    await db
      .prepare(
        `INSERT INTO project_tasks (
          id, project_id, title, description, status, priority,
          due_date, completed_at, sort_order, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'normal', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        projectId,
        title,
        notes,
        status,
        dueDate,
        completedAt,
        sortOrder,
        auth.owner.uid,
        nowIso,
        nowIso
      )
      .run();

    const created = await db
      .prepare(
        `SELECT pt.*, p.name AS project_name, p.client_id, c.business_name AS client_business, c.name AS client_name
         FROM project_tasks pt
         JOIN projects p ON p.id = pt.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE pt.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toOnboardingItem(created);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'ONBOARDING_ITEM_CREATED',
      entityType: 'project_tasks',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: resultRow
    });

    return jsonResponse({ success: true, item: resultRow }, 201);
  } catch (err) {
    console.error('[HQ Onboarding POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create onboarding item');
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Onboarding item ID is required');

  const db = env.HQ_DB;

  try {
    const existing = await db
      .prepare(`SELECT * FROM project_tasks WHERE id = ? AND archived_at IS NULL`)
      .bind(id)
      .first();

    if (!existing) {
      return errorResponse(404, 'NOT_FOUND', 'Onboarding item not found or archived');
    }

    const title = cleanString(body.title ?? existing.title, 200);
    const notes = cleanString(body.notes ?? body.description ?? existing.description, 2000);
    const dueDate = body.due_date !== undefined ? cleanString(body.due_date, 40) || null : existing.due_date;
    const nowIso = new Date().toISOString();

    let status = existing.status;
    let completedAt = existing.completed_at;
    if (body.status !== undefined) {
      if (body.status === 'Completed' || body.status === 'done') {
        status = 'done';
        completedAt = existing.completed_at || nowIso;
      } else if (body.status === 'In Progress' || body.status === 'in-progress') {
        status = 'in-progress';
        completedAt = null;
      } else if (body.status === 'Blocked' || body.status === 'blocked') {
        status = 'blocked';
        completedAt = null;
      } else if (body.status === 'Pending' || body.status === 'todo') {
        status = 'todo';
        completedAt = null;
      }
    }

    await db
      .prepare(
        `UPDATE project_tasks
         SET title = ?, description = ?, status = ?, due_date = ?, completed_at = ?, updated_at = ?
         WHERE id = ? AND archived_at IS NULL`
      )
      .bind(
        title,
        notes,
        status,
        dueDate,
        completedAt,
        nowIso,
        id
      )
      .run();

    const updated = await db
      .prepare(
        `SELECT pt.*, p.name AS project_name, p.client_id, c.business_name AS client_business, c.name AS client_name
         FROM project_tasks pt
         JOIN projects p ON p.id = pt.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE pt.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toOnboardingItem(updated);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'ONBOARDING_ITEM_UPDATED',
      entityType: 'project_tasks',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toOnboardingItem(existing),
      after: resultRow
    });

    return jsonResponse({ success: true, item: resultRow });
  } catch (err) {
    console.error('[HQ Onboarding PUT Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update onboarding item');
  }
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = cleanString(new URL(request.url).searchParams.get('id'), 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Onboarding item ID is required');

  const db = env.HQ_DB;

  try {
    const existing = await db
      .prepare(`SELECT * FROM project_tasks WHERE id = ? AND archived_at IS NULL`)
      .bind(id)
      .first();

    if (!existing) {
      return errorResponse(404, 'NOT_FOUND', 'Onboarding item not found or already archived');
    }

    const nowIso = new Date().toISOString();
    const result = await db
      .prepare(
        `UPDATE project_tasks
         SET archived_at = ?, archived_by = ?, updated_at = ?
         WHERE id = ? AND archived_at IS NULL`
      )
      .bind(nowIso, auth.owner.uid, nowIso, id)
      .run();

    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse(404, 'NOT_FOUND', 'Onboarding item not found or already archived');
    }

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'ONBOARDING_ITEM_ARCHIVED',
      entityType: 'project_tasks',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toOnboardingItem(existing),
      after: { archived_at: nowIso, archived_by: auth.owner.uid }
    });

    return jsonResponse({ success: true, deletedId: id, archived: true });
  } catch (err) {
    console.error('[HQ Onboarding DELETE Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to archive onboarding item');
  }
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
