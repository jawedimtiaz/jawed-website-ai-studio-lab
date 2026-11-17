// functions/api/hq/onboarding.js
// Studio HQ Customer & Project Onboarding Checklists API

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

const ONBOARDING_STATUSES = ['Pending', 'In Progress', 'Completed', 'Blocked'];

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId') || '';
  const projectId = url.searchParams.get('projectId') || '';

  const conditions = [];
  const params = [];
  if (clientId) {
    conditions.push('o.client_id = ?');
    params.push(clientId);
  }
  if (projectId) {
    conditions.push('o.project_id = ?');
    params.push(projectId);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db
    .prepare(
      `SELECT o.*, c.business_name AS client_business, p.name AS project_name
       FROM onboarding_items o
       JOIN clients c ON c.id = o.client_id
       LEFT JOIN projects p ON p.id = o.project_id
       ${whereClause}
       ORDER BY o.sort_order ASC, o.created_at DESC`
    )
    .bind(...params)
    .all();

  return jsonResponse({ success: true, items: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const clientId = cleanString(body.client_id || body.clientId, 128);
  const title = cleanString(body.title, 200);
  if (!clientId || !title) {
    return errorResponse(400, 'INVALID_INPUT', 'Customer ID and checklist item title are required');
  }

  const db = env.HQ_DB;
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status = ONBOARDING_STATUSES.includes(body.status) ? body.status : 'Pending';

  await db
    .prepare(
      `INSERT INTO onboarding_items (
        id, client_id, project_id, title, category, status, owner_role, due_date, notes,
        sort_order, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      clientId,
      cleanString(body.project_id || body.projectId, 128) || null,
      title,
      cleanString(body.category || 'Access & Assets', 80),
      status,
      cleanString(body.owner_role || body.ownerRole || 'Studio', 60),
      cleanString(body.due_date || body.dueDate, 40) || null,
      cleanString(body.notes, 2000),
      Number(body.sort_order ?? 0) || 0,
      status === 'Completed' ? nowIso : null,
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM onboarding_items WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'ONBOARDING_ITEM_CREATED',
    entityType: 'onboarding_items',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, item: created }, 201);
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
  const existing = await db.prepare(`SELECT * FROM onboarding_items WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Onboarding item not found');

  const status = ONBOARDING_STATUSES.includes(body.status) ? body.status : existing.status;
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `UPDATE onboarding_items
       SET title = ?, category = ?, status = ?, owner_role = ?, due_date = ?, notes = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      cleanString(body.title ?? existing.title, 200),
      cleanString(body.category ?? existing.category, 80),
      status,
      cleanString(body.owner_role ?? body.ownerRole ?? existing.owner_role, 60),
      body.due_date !== undefined ? cleanString(body.due_date, 40) || null : existing.due_date,
      cleanString(body.notes ?? existing.notes, 2000),
      status === 'Completed' ? existing.completed_at || nowIso : null,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM onboarding_items WHERE id = ?`).bind(id).first();
  return jsonResponse({ success: true, item: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Onboarding item ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM onboarding_items WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Onboarding item not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
