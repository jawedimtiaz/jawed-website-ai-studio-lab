// functions/api/hq/support.js
// Studio HQ Customer Support Tickets API

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  nextSequenceNumber,
  auditLog
} from '../../lib/hqApi.js';

const TICKET_STATUSES = ['Open', 'In Progress', 'Waiting on Client', 'Resolved', 'Closed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId') || '';
  const status = url.searchParams.get('status') || '';

  const conditions = [];
  const params = [];
  if (clientId) {
    conditions.push('s.client_id = ?');
    params.push(clientId);
  }
  if (status && status !== 'All') {
    conditions.push('s.status = ?');
    params.push(status);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db
    .prepare(
      `SELECT s.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
       FROM support_tickets s
       JOIN clients c ON c.id = s.client_id
       LEFT JOIN projects p ON p.id = s.project_id
       ${whereClause}
       ORDER BY s.updated_at DESC`
    )
    .bind(...params)
    .all();

  return jsonResponse({ success: true, tickets: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const clientId = cleanString(body.client_id || body.clientId, 128);
  const subject = cleanString(body.subject, 200);
  if (!clientId || !subject) {
    return errorResponse(400, 'INVALID_INPUT', 'Customer ID and ticket subject are required');
  }

  const db = env.HQ_DB;
  const id = crypto.randomUUID();
  const ticketNumber = await nextSequenceNumber(db, 'support_ticket', 'SUP');
  const nowIso = new Date().toISOString();
  const priority = PRIORITIES.includes(body.priority) ? body.priority : 'Medium';
  const status = TICKET_STATUSES.includes(body.status) ? body.status : 'Open';

  await db
    .prepare(
      `INSERT INTO support_tickets (
        id, ticket_number, client_id, project_id, maintenance_plan_id, subject,
        description, category, priority, status, resolution_notes, created_by,
        created_at, updated_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      ticketNumber,
      clientId,
      cleanString(body.project_id || body.projectId, 128) || null,
      cleanString(body.maintenance_plan_id || body.maintenancePlanId, 128) || null,
      subject,
      cleanString(body.description, 4000),
      cleanString(body.category || 'Bug Fix', 80),
      priority,
      status,
      cleanString(body.resolution_notes || body.resolutionNotes, 4000),
      auth.owner.uid,
      nowIso,
      nowIso,
      status === 'Resolved' || status === 'Closed' ? nowIso : null
    )
    .run();

  const created = await db.prepare(`SELECT * FROM support_tickets WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'SUPPORT_TICKET_CREATED',
    entityType: 'support_tickets',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, ticket: created }, 201);
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Ticket ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM support_tickets WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Support ticket not found');

  const status = TICKET_STATUSES.includes(body.status) ? body.status : existing.status;
  const priority = PRIORITIES.includes(body.priority) ? body.priority : existing.priority;
  const nowIso = new Date().toISOString();
  const isClosed = status === 'Resolved' || status === 'Closed';

  await db
    .prepare(
      `UPDATE support_tickets
       SET subject = ?, description = ?, category = ?, priority = ?, status = ?,
           resolution_notes = ?, resolved_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      cleanString(body.subject ?? existing.subject, 200),
      cleanString(body.description ?? existing.description, 4000),
      cleanString(body.category ?? existing.category, 80),
      priority,
      status,
      cleanString(body.resolution_notes ?? body.resolutionNotes ?? existing.resolution_notes, 4000),
      isClosed ? existing.resolved_at || nowIso : null,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM support_tickets WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'SUPPORT_TICKET_UPDATED',
    entityType: 'support_tickets',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: { status: existing.status },
    after: { status: updated.status }
  });

  return jsonResponse({ success: true, ticket: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Ticket ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM support_tickets WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Ticket not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
