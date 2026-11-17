// functions/api/hq/contacts.js
// Studio HQ Client Contacts API Endpoint

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
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();

  try {
    const conditions = [];
    const params = [];
    if (clientId) {
      conditions.push('cc.client_id = ?');
      params.push(clientId);
    }
    if (q) {
      conditions.push('(LOWER(cc.name) LIKE ? OR LOWER(cc.email) LIKE ? OR LOWER(c.business_name) LIKE ?)');
      const pat = `%${q}%`;
      params.push(pat, pat, pat);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db
      .prepare(
        `SELECT cc.*, c.business_name AS client_business, c.name AS client_name
         FROM client_contacts cc
         JOIN clients c ON c.id = cc.client_id
         ${whereClause}
         ORDER BY cc.is_primary DESC, cc.updated_at DESC`
      )
      .bind(...params)
      .all();

    return jsonResponse({ success: true, contacts: rows.results || [] });
  } catch (err) {
    console.error('[HQ Contacts GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve contacts');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const clientId = cleanString(body.client_id || body.clientId, 128);
  const name = cleanString(body.name, 200);
  if (!clientId || !name) {
    return errorResponse(400, 'INVALID_INPUT', 'Customer ID and contact name are required');
  }

  const db = env.HQ_DB;
  const client = await db.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse(404, 'NOT_FOUND', 'Customer not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const isPrimary = body.is_primary || body.isPrimary ? 1 : 0;

  if (isPrimary) {
    await db.prepare(`UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?`).bind(clientId).run();
  }

  await db
    .prepare(
      `INSERT INTO client_contacts (id, client_id, name, role, email, phone, is_primary, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      clientId,
      name,
      cleanString(body.role, 120),
      cleanString(body.email, 200).toLowerCase(),
      cleanString(body.phone, 50),
      isPrimary,
      cleanString(body.notes, 2000),
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM client_contacts WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'CONTACT_CREATED',
    entityType: 'client_contacts',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, contact: created }, 201);
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Contact ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM client_contacts WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Contact not found');

  const isPrimary = body.is_primary !== undefined ? (body.is_primary ? 1 : 0) : existing.is_primary;
  if (isPrimary && !existing.is_primary) {
    await db.prepare(`UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?`).bind(existing.client_id).run();
  }

  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `UPDATE client_contacts
       SET name = ?, role = ?, email = ?, phone = ?, is_primary = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      cleanString(body.name ?? existing.name, 200),
      cleanString(body.role ?? existing.role, 120),
      cleanString(body.email ?? existing.email, 200).toLowerCase(),
      cleanString(body.phone ?? existing.phone, 50),
      isPrimary,
      cleanString(body.notes ?? existing.notes, 2000),
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM client_contacts WHERE id = ?`).bind(id).first();
  return jsonResponse({ success: true, contact: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Contact ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM client_contacts WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Contact not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
