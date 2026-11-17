// functions/api/hq/qa.js
// Studio HQ Quality Assurance & Defect Tracking API

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

const QA_STATUSES = ['Not Run', 'Pass', 'Fail', 'Blocked'];
const QA_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const RESOLUTION_STATUSES = ['Open', 'In Progress', 'Resolved', 'Verified'];

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId') || '';
  const status = url.searchParams.get('status') || '';

  const conditions = [];
  const params = [];
  if (projectId) {
    conditions.push('q.project_id = ?');
    params.push(projectId);
  }
  if (status && status !== 'All') {
    conditions.push('q.status = ?');
    params.push(status);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db
    .prepare(
      `SELECT q.*, c.business_name AS client_business, p.name AS project_name
       FROM qa_checks q
       JOIN clients c ON c.id = q.client_id
       JOIN projects p ON p.id = q.project_id
       ${whereClause}
       ORDER BY q.updated_at DESC`
    )
    .bind(...params)
    .all();

  return jsonResponse({ success: true, checks: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const projectId = cleanString(body.project_id || body.projectId, 128);
  const title = cleanString(body.title, 200);
  if (!projectId || !title) {
    return errorResponse(400, 'INVALID_INPUT', 'Project ID and QA check title are required');
  }

  const db = env.HQ_DB;
  const project = await db.prepare(`SELECT id, client_id FROM projects WHERE id = ?`).bind(projectId).first();
  if (!project) return errorResponse(404, 'NOT_FOUND', 'Project not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status = QA_STATUSES.includes(body.status) ? body.status : 'Not Run';
  const severity = QA_SEVERITIES.includes(body.severity) ? body.severity : 'Medium';
  const resolutionStatus = RESOLUTION_STATUSES.includes(body.resolution_status)
    ? body.resolution_status
    : status === 'Pass'
      ? 'Verified'
      : 'Open';

  await db
    .prepare(
      `INSERT INTO qa_checks (
        id, client_id, project_id, category, title, status, severity,
        defect_description, assigned_action, resolution_status, tested_by, tested_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      project.client_id,
      projectId,
      cleanString(body.category || 'Functional Testing', 80),
      title,
      status,
      severity,
      cleanString(body.defect_description || body.defectDescription, 3000),
      cleanString(body.assigned_action || body.assignedAction, 1000),
      resolutionStatus,
      status === 'Not Run' ? '' : auth.owner.email,
      status === 'Not Run' ? null : nowIso,
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM qa_checks WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'QA_CHECK_CREATED',
    entityType: 'qa_checks',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, check: created }, 201);
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'QA check ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM qa_checks WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'QA check not found');

  const status = QA_STATUSES.includes(body.status) ? body.status : existing.status;
  const severity = QA_SEVERITIES.includes(body.severity) ? body.severity : existing.severity;
  const resolutionStatus = RESOLUTION_STATUSES.includes(body.resolution_status || body.resolutionStatus)
    ? body.resolution_status || body.resolutionStatus
    : status === 'Pass'
      ? 'Verified'
      : existing.resolution_status;
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `UPDATE qa_checks
       SET category = ?, title = ?, status = ?, severity = ?, defect_description = ?,
           assigned_action = ?, resolution_status = ?, tested_by = ?, tested_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      cleanString(body.category ?? existing.category, 80),
      cleanString(body.title ?? existing.title, 200),
      status,
      severity,
      cleanString(body.defect_description ?? body.defectDescription ?? existing.defect_description, 3000),
      cleanString(body.assigned_action ?? body.assignedAction ?? existing.assigned_action, 1000),
      resolutionStatus,
      status === 'Not Run' ? '' : auth.owner.email,
      status === 'Not Run' ? null : nowIso,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM qa_checks WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'QA_CHECK_UPDATED',
    entityType: 'qa_checks',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: { status: existing.status, resolution: existing.resolution_status },
    after: { status: updated.status, resolution: updated.resolution_status }
  });

  return jsonResponse({ success: true, check: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'QA check ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM qa_checks WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'QA check not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
