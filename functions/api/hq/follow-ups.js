// functions/api/hq/follow-ups.js
// Studio HQ Follow-Up Scheduling & Tracking API

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

const FOLLOWUP_STATUSES = ['Scheduled', 'Completed', 'Cancelled'];

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const clientId = url.searchParams.get('clientId') || '';

  try {
    const conditions = [];
    const params = [];
    if (status && status !== 'All') {
      conditions.push('f.status = ?');
      params.push(status);
    }
    if (clientId) {
      conditions.push('f.client_id = ?');
      params.push(clientId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db
      .prepare(
        `SELECT f.*, c.business_name AS client_business, c.name AS client_name,
                l.business_name AS lead_business, p.name AS project_name
         FROM follow_ups f
         LEFT JOIN clients c ON c.id = f.client_id
         LEFT JOIN leads l ON l.id = f.lead_id
         LEFT JOIN projects p ON p.id = f.project_id
         ${whereClause}
         ORDER BY f.scheduled_at ASC`
      )
      .bind(...params)
      .all();

    return jsonResponse({ success: true, followUps: rows.results || [] });
  } catch (err) {
    console.error('[HQ Follow-Ups GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve follow-ups');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const title = cleanString(body.title, 200);
  const scheduledAt = cleanString(body.scheduled_at || body.scheduledAt, 50);
  if (!title || !scheduledAt) {
    return errorResponse(400, 'INVALID_INPUT', 'Follow-up title and scheduled date/time are required');
  }

  const db = env.HQ_DB;
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO follow_ups (
        id, client_id, lead_id, project_id, title, channel, scheduled_at,
        status, outcome_notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Scheduled', ?, ?, ?, ?)`
    )
    .bind(
      id,
      cleanString(body.client_id || body.clientId, 128) || null,
      cleanString(body.lead_id || body.leadId, 128) || null,
      cleanString(body.project_id || body.projectId, 128) || null,
      title,
      cleanString(body.channel || 'Email', 50),
      scheduledAt,
      cleanString(body.outcome_notes || body.outcomeNotes, 2000),
      auth.owner.uid,
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM follow_ups WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'FOLLOW_UP_CREATED',
    entityType: 'follow_ups',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, followUp: created }, 201);
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Follow-up ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM follow_ups WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Follow-up not found');

  const status = FOLLOWUP_STATUSES.includes(body.status) ? body.status : existing.status;
  const nowIso = new Date().toISOString();
  const completedAt = status === 'Completed' ? existing.completed_at || nowIso : null;

  await db
    .prepare(
      `UPDATE follow_ups
       SET title = ?, channel = ?, scheduled_at = ?, status = ?, outcome_notes = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      cleanString(body.title ?? existing.title, 200),
      cleanString(body.channel ?? existing.channel, 50),
      cleanString(body.scheduled_at ?? body.scheduledAt ?? existing.scheduled_at, 50),
      status,
      cleanString(body.outcome_notes ?? body.outcomeNotes ?? existing.outcome_notes, 2000),
      completedAt,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM follow_ups WHERE id = ?`).bind(id).first();
  return jsonResponse({ success: true, followUp: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Follow-up ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM follow_ups WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Follow-up not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
