// functions/api/hq/follow-ups.js
// Studio HQ Follow-Up Scheduling & Tracking API
// Reconciled with Canonical Studio HQ Schema (0001_studio_hq_schema.sql)
// Uses canonical activity_notes table with note_type = 'follow-up'

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
 * Maps an activity_notes canonical row (joined with clients/projects)
 * to response shape with frontend follow-up compatibility aliases.
 */
function toFollowUpRow(row) {
  return {
    id: row.id,
    client_id: row.client_id || '',
    project_id: row.project_id || '',
    lead_id: null,
    // Canonical schema fields
    note_type: row.note_type,
    subject: row.subject || '',
    body: row.body || '',
    follow_up_at: row.follow_up_at || null,
    created_by: row.created_by,
    created_at: row.created_at,
    archived_at: row.archived_at || null,
    archived_by: row.archived_by || null,
    // Joined relations
    client_business: row.client_business || '',
    client_name: row.client_name || '',
    project_name: row.project_name || '',
    lead_business: '',
    // Frontend compatibility aliases
    title: row.subject || 'Follow-up',
    channel: 'Email',
    scheduled_at: row.follow_up_at || row.created_at,
    status: 'Scheduled',
    outcome_notes: row.body || ''
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
    const conditions = ["a.note_type = 'follow-up'", 'a.archived_at IS NULL'];
    const params = [];

    if (clientId) {
      conditions.push('a.client_id = ?');
      params.push(clientId);
    }
    if (projectId) {
      conditions.push('a.project_id = ?');
      params.push(projectId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const stmt = db.prepare(
      `SELECT a.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
       FROM activity_notes a
       LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN projects p ON p.id = a.project_id
       ${whereClause}
       ORDER BY COALESCE(a.follow_up_at, a.created_at) ASC`
    );

    const rows = await stmt.bind(...params).all();
    const followUps = (rows.results || []).map(toFollowUpRow);

    return jsonResponse({ success: true, followUps });
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

  const title = cleanString(body.title || body.subject, 200);
  const outcomeNotes = cleanString(body.outcome_notes || body.outcomeNotes || body.body || body.notes || title, 3000);
  const scheduledAt = cleanString(body.scheduled_at || body.scheduledAt || body.follow_up_at || body.followUpAt, 50);

  if (!title) {
    return errorResponse(400, 'INVALID_INPUT', 'Follow-up title is required');
  }

  const db = env.HQ_DB;
  let clientId = cleanString(body.client_id || body.clientId, 128) || null;
  let projectId = cleanString(body.project_id || body.projectId, 128) || null;

  // Canonical constraint: CHECK (client_id IS NOT NULL OR project_id IS NOT NULL)
  if (!clientId && !projectId) {
    return errorResponse(400, 'INVALID_INPUT', 'At least one of client_id or project_id is required');
  }

  try {
    // Validate client existence if provided
    if (clientId) {
      const client = await db.prepare(`SELECT id FROM clients WHERE id = ? AND archived_at IS NULL`).bind(clientId).first();
      if (!client) {
        return errorResponse(404, 'NOT_FOUND', 'Client not found or archived');
      }
    }

    // Validate project existence if provided
    if (projectId) {
      const project = await db.prepare(`SELECT id, client_id FROM projects WHERE id = ? AND archived_at IS NULL`).bind(projectId).first();
      if (!project) {
        return errorResponse(404, 'NOT_FOUND', 'Project not found or archived');
      }
      if (!clientId && project.client_id) {
        clientId = project.client_id;
      }
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const followUpAt = scheduledAt || null;

    await db
      .prepare(
        `INSERT INTO activity_notes (
          id, client_id, project_id, note_type, subject, body,
          follow_up_at, created_by, created_at
        ) VALUES (?, ?, ?, 'follow-up', ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        clientId,
        projectId,
        title,
        outcomeNotes,
        followUpAt,
        auth.owner.uid,
        nowIso
      )
      .run();

    const created = await db
      .prepare(
        `SELECT a.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
         FROM activity_notes a
         LEFT JOIN clients c ON c.id = a.client_id
         LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toFollowUpRow(created);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'FOLLOW_UP_CREATED',
      entityType: 'activity_notes',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: resultRow
    });

    return jsonResponse({ success: true, followUp: resultRow }, 201);
  } catch (err) {
    console.error('[HQ Follow-Ups POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create follow-up');
  }
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

  try {
    const existing = await db
      .prepare(`SELECT * FROM activity_notes WHERE id = ? AND note_type = 'follow-up' AND archived_at IS NULL`)
      .bind(id)
      .first();

    if (!existing) {
      return errorResponse(404, 'NOT_FOUND', 'Follow-up not found or archived');
    }

    const title = cleanString(body.title ?? body.subject ?? existing.subject, 200);
    const outcomeNotes = cleanString(
      body.outcome_notes ?? body.outcomeNotes ?? body.body ?? body.notes ?? existing.body,
      3000
    );
    const scheduledAt = cleanString(
      body.scheduled_at ?? body.scheduledAt ?? body.follow_up_at ?? existing.follow_up_at,
      50
    );

    await db
      .prepare(
        `UPDATE activity_notes
         SET subject = ?, body = ?, follow_up_at = ?
         WHERE id = ? AND note_type = 'follow-up' AND archived_at IS NULL`
      )
      .bind(title, outcomeNotes, scheduledAt, id)
      .run();

    const updated = await db
      .prepare(
        `SELECT a.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
         FROM activity_notes a
         LEFT JOIN clients c ON c.id = a.client_id
         LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toFollowUpRow(updated);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'FOLLOW_UP_UPDATED',
      entityType: 'activity_notes',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toFollowUpRow(existing),
      after: resultRow
    });

    return jsonResponse({ success: true, followUp: resultRow });
  } catch (err) {
    console.error('[HQ Follow-Ups PUT Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update follow-up');
  }
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = cleanString(new URL(request.url).searchParams.get('id'), 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Follow-up ID is required');

  const db = env.HQ_DB;

  try {
    const existing = await db
      .prepare(`SELECT * FROM activity_notes WHERE id = ? AND note_type = 'follow-up' AND archived_at IS NULL`)
      .bind(id)
      .first();

    if (!existing) {
      return errorResponse(404, 'NOT_FOUND', 'Follow-up not found or already archived');
    }

    const nowIso = new Date().toISOString();
    // Soft delete via canonical archived_at / archived_by
    const result = await db
      .prepare(
        `UPDATE activity_notes
         SET archived_at = ?, archived_by = ?
         WHERE id = ? AND note_type = 'follow-up' AND archived_at IS NULL`
      )
      .bind(nowIso, auth.owner.uid, id)
      .run();

    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse(404, 'NOT_FOUND', 'Follow-up not found or already archived');
    }

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'FOLLOW_UP_ARCHIVED',
      entityType: 'activity_notes',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toFollowUpRow(existing),
      after: { archived_at: nowIso, archived_by: auth.owner.uid }
    });

    return jsonResponse({ success: true, deletedId: id, archived: true });
  } catch (err) {
    console.error('[HQ Follow-Ups DELETE Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to archive follow-up');
  }
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
