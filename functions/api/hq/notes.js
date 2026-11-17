// functions/api/hq/notes.js
// Studio HQ Customer & Project Communication / Activity Notes API

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId');
  const projectId = url.searchParams.get('projectId');

  try {
    const conditions = [];
    const params = [];
    if (clientId) {
      conditions.push('n.client_id = ?');
      params.push(clientId);
    }
    if (projectId) {
      conditions.push('n.project_id = ?');
      params.push(projectId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db
      .prepare(
        `SELECT n.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
         FROM activity_notes n
         JOIN clients c ON c.id = n.client_id
         LEFT JOIN projects p ON p.id = n.project_id
         ${whereClause}
         ORDER BY n.created_at DESC
         LIMIT 100`
      )
      .bind(...params)
      .all();

    return jsonResponse({ success: true, notes: rows.results || [] });
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

  const clientId = cleanString(body.client_id || body.clientId, 128);
  const content = cleanString(body.content, 5000);
  if (!clientId || !content) {
    return errorResponse(400, 'INVALID_INPUT', 'Customer ID and note content are required');
  }

  const db = env.HQ_DB;
  const client = await db.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse(404, 'NOT_FOUND', 'Customer not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const projectId = cleanString(body.project_id || body.projectId, 128) || null;

  await db
    .prepare(
      `INSERT INTO activity_notes (id, client_id, project_id, note_type, subject, content, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      clientId,
      projectId,
      cleanString(body.note_type || body.noteType || 'Note', 50),
      cleanString(body.subject, 200),
      content,
      auth.owner.email,
      nowIso
    )
    .run();

  // Update customer's last_contact_at timestamp
  await db.prepare(`UPDATE clients SET last_contact_at = ?, updated_at = ? WHERE id = ?`).bind(nowIso, nowIso, clientId).run();

  const created = await db.prepare(`SELECT * FROM activity_notes WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'NOTE_CREATED',
    entityType: 'activity_notes',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: { clientId, projectId, noteType: created.note_type }
  });

  return jsonResponse({ success: true, note: created }, 201);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Note ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM activity_notes WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Note not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, POST, DELETE, OPTIONS');
}
