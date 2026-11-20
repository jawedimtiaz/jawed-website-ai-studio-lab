// functions/api/hq/notes.js
// Studio HQ Customer & Project Communication / Activity Notes API (Canonical `activity_notes` schema)

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

const ALLOWED_NOTE_TYPES = new Set(['note', 'call', 'email', 'meeting', 'follow-up', 'decision', 'blocker']);

export function normalizeNoteType(val) {
  if (!val) return 'note';
  const clean = String(val).trim().toLowerCase();
  if (clean === 'followup' || clean === 'follow_up') return 'follow-up';
  if (ALLOWED_NOTE_TYPES.has(clean)) return clean;
  return 'note';
}

function mapNoteRecord(row) {
  if (!row) return null;
  return {
    ...row,
    content: row.body
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId') || url.searchParams.get('client_id');
  const projectId = url.searchParams.get('projectId') || url.searchParams.get('project_id');
  const noteType = url.searchParams.get('noteType') || url.searchParams.get('note_type');
  const includeArchived = url.searchParams.get('includeArchived') === 'true';

  try {
    const conditions = [];
    const params = [];

    if (!includeArchived) {
      conditions.push('n.archived_at IS NULL');
    }
    if (clientId) {
      conditions.push('n.client_id = ?');
      params.push(clientId);
    }
    if (projectId) {
      conditions.push('n.project_id = ?');
      params.push(projectId);
    }
    if (noteType && noteType !== 'all') {
      conditions.push('n.note_type = ?');
      params.push(normalizeNoteType(noteType));
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db
      .prepare(
        `SELECT n.*,
                c.business_name AS client_business,
                c.name AS client_name,
                p.name AS project_name
         FROM activity_notes n
         LEFT JOIN clients c ON c.id = n.client_id
         LEFT JOIN projects p ON p.id = n.project_id
         ${whereClause}
         ORDER BY n.created_at DESC
         LIMIT 100`
      )
      .bind(...params)
      .all();

    const notes = (rows.results || []).map(mapNoteRecord);
    return jsonResponse({ success: true, notes, count: notes.length });
  } catch (err) {
    console.error('[HQ Notes GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve communication notes');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const clientId = cleanString(body.client_id || body.clientId, 128) || null;
  const projectId = cleanString(body.project_id || body.projectId, 128) || null;
  const noteBody = cleanString(body.body || body.content, 5000);

  if (!clientId && !projectId) {
    return errorResponse(400, 'INVALID_INPUT', 'At least one of client_id or project_id is required');
  }
  if (!noteBody) {
    return errorResponse(400, 'INVALID_INPUT', 'Note content or body is required');
  }

  const db = env.HQ_DB;

  if (clientId) {
    const client = await db.prepare(`SELECT id FROM clients WHERE id = ? AND archived_at IS NULL`).bind(clientId).first();
    if (!client) return errorResponse(404, 'NOT_FOUND', 'Linked customer not found');
  }

  if (projectId) {
    const project = await db.prepare(`SELECT id FROM projects WHERE id = ? AND archived_at IS NULL`).bind(projectId).first();
    if (!project) return errorResponse(404, 'NOT_FOUND', 'Linked project not found');
  }

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const noteType = normalizeNoteType(body.note_type || body.noteType);
  const subject = cleanString(body.subject, 200) || null;
  const followUpAt = cleanString(body.follow_up_at || body.followUpAt, 50) || null;

  await db
    .prepare(
      `INSERT INTO activity_notes (
        id, client_id, project_id, note_type, subject, body, follow_up_at, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      clientId,
      projectId,
      noteType,
      subject,
      noteBody,
      followUpAt,
      auth.owner.uid,
      nowIso
    )
    .run();

  // Safely touch client updated_at if clientId is present (clients table has no last_contact_at column)
  if (clientId) {
    await db.prepare(`UPDATE clients SET updated_at = ? WHERE id = ?`).bind(nowIso, clientId).run();
  }

  const created = await db.prepare(`SELECT * FROM activity_notes WHERE id = ?`).bind(id).first();
  const mapped = mapNoteRecord(created);

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'NOTE_CREATED',
    entityType: 'activity_notes',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: { clientId, projectId, noteType: created.note_type, subject }
  });

  return jsonResponse({ success: true, note: mapped }, 201);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Note ID is required');

  const permanent = new URL(request.url).searchParams.get('permanent') === 'true';
  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM activity_notes WHERE id = ?`).bind(id).first();
  if (!existing || (!permanent && existing.archived_at)) {
    return errorResponse(404, 'NOT_FOUND', 'Note not found');
  }

  const nowIso = new Date().toISOString();
  if (permanent) {
    await db.prepare(`DELETE FROM activity_notes WHERE id = ?`).bind(id).run();
  } else {
    await db
      .prepare(`UPDATE activity_notes SET archived_at = ?, archived_by = ? WHERE id = ?`)
      .bind(nowIso, auth.owner.uid, id)
      .run();
  }

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: permanent ? 'NOTE_DELETED' : 'NOTE_ARCHIVED',
    entityType: 'activity_notes',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: mapNoteRecord(existing)
  });

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions(context) {
  return hqOptionsResponse(context, 'GET, POST, DELETE, OPTIONS');
}
