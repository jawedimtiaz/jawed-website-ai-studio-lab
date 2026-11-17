// functions/api/hq/approvals.js
// Studio HQ Project & Client Approvals Workflow API

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

const APPROVAL_STAGES = [
  'Requirements',
  'Project Scope',
  'Design Approval',
  'Development Completion',
  'Final Delivery',
  'Website Launch'
];
const APPROVAL_STATUSES = ['Pending', 'Approved', 'Changes Requested', 'Rejected'];

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
    conditions.push('a.project_id = ?');
    params.push(projectId);
  }
  if (status && status !== 'All') {
    conditions.push('a.status = ?');
    params.push(status);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db
    .prepare(
      `SELECT a.*, c.business_name AS client_business, p.name AS project_name
       FROM approvals a
       JOIN clients c ON c.id = a.client_id
       JOIN projects p ON p.id = a.project_id
       ${whereClause}
       ORDER BY a.requested_at DESC`
    )
    .bind(...params)
    .all();

  return jsonResponse({ success: true, approvals: rows.results || [] });
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
    return errorResponse(400, 'INVALID_INPUT', 'Project ID and approval title are required');
  }

  const db = env.HQ_DB;
  const project = await db.prepare(`SELECT id, client_id FROM projects WHERE id = ?`).bind(projectId).first();
  if (!project) return errorResponse(404, 'NOT_FOUND', 'Project not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const stage = APPROVAL_STAGES.includes(body.stage) ? body.stage : cleanString(body.stage || 'Project Scope', 80);
  const status = APPROVAL_STATUSES.includes(body.status) ? body.status : 'Pending';

  await db
    .prepare(
      `INSERT INTO approvals (
        id, client_id, project_id, stage, title, summary, status,
        requested_by, reviewed_by, decision_notes, requested_at, decided_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      project.client_id,
      projectId,
      stage,
      title,
      cleanString(body.summary, 3000),
      status,
      auth.owner.email,
      status === 'Pending' ? '' : auth.owner.email,
      cleanString(body.decision_notes || body.decisionNotes, 2000),
      nowIso,
      status === 'Pending' ? null : nowIso,
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM approvals WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'APPROVAL_CREATED',
    entityType: 'approvals',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, approval: created }, 201);
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Approval ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM approvals WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Approval record not found');

  const status = APPROVAL_STATUSES.includes(body.status) ? body.status : existing.status;
  const nowIso = new Date().toISOString();
  const decidedAt = status === 'Pending' ? null : existing.decided_at || nowIso;

  await db
    .prepare(
      `UPDATE approvals
       SET status = ?, reviewed_by = ?, decision_notes = ?, decided_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      status,
      status === 'Pending' ? '' : auth.owner.email,
      cleanString(body.decision_notes ?? body.decisionNotes ?? existing.decision_notes, 2000),
      decidedAt,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM approvals WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: `APPROVAL_${status.toUpperCase().replace(/\s+/g, '_')}`,
    entityType: 'approvals',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: { status: existing.status },
    after: { status: updated.status, decisionNotes: updated.decision_notes }
  });

  return jsonResponse({ success: true, approval: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Approval ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM approvals WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Approval not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
