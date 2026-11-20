// functions/api/hq/contacts.js
// Studio HQ Client Contacts API Endpoint (Canonical `client_contacts` schema)

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

function mapContactRecord(row) {
  if (!row) return null;
  return {
    ...row,
    name: row.full_name,
    role: row.role_title
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId') || url.searchParams.get('client_id');
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const includeArchived = url.searchParams.get('includeArchived') === 'true';

  try {
    const conditions = [];
    const params = [];

    if (!includeArchived) {
      conditions.push('cc.archived_at IS NULL');
    }
    if (clientId) {
      conditions.push('cc.client_id = ?');
      params.push(clientId);
    }
    if (q) {
      conditions.push('(LOWER(cc.full_name) LIKE ? OR LOWER(cc.email) LIKE ? OR LOWER(c.business_name) LIKE ? OR LOWER(c.name) LIKE ?)');
      const pat = `%${q}%`;
      params.push(pat, pat, pat, pat);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db
      .prepare(
        `SELECT cc.*,
                c.business_name AS client_business,
                c.name AS client_name
         FROM client_contacts cc
         JOIN clients c ON c.id = cc.client_id
         ${whereClause}
         ORDER BY cc.is_primary DESC, cc.updated_at DESC`
      )
      .bind(...params)
      .all();

    const contacts = (rows.results || []).map(mapContactRecord);
    return jsonResponse({ success: true, contacts, count: contacts.length });
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
  const fullName = cleanString(body.full_name || body.name, 200);
  if (!clientId || !fullName) {
    return errorResponse(400, 'INVALID_INPUT', 'Customer ID and contact name are required');
  }

  const db = env.HQ_DB;
  const client = await db.prepare(`SELECT id FROM clients WHERE id = ? AND archived_at IS NULL`).bind(clientId).first();
  if (!client) return errorResponse(404, 'NOT_FOUND', 'Customer not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const isPrimary = (body.is_primary || body.isPrimary) ? 1 : 0;
  const roleTitle = cleanString(body.role_title || body.role, 120) || null;
  const email = cleanString(body.email, 200).toLowerCase() || null;
  const phone = cleanString(body.phone, 50) || null;
  const notes = cleanString(body.notes, 2000) || null;

  if (isPrimary) {
    await db.prepare(`UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?`).bind(clientId).run();
  }

  await db
    .prepare(
      `INSERT INTO client_contacts (
        id, client_id, full_name, role_title, email, phone, is_primary, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      clientId,
      fullName,
      roleTitle,
      email,
      phone,
      isPrimary,
      notes,
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM client_contacts WHERE id = ?`).bind(id).first();
  const mapped = mapContactRecord(created);

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'CONTACT_CREATED',
    entityType: 'client_contacts',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: mapped
  });

  return jsonResponse({ success: true, contact: mapped }, 201);
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
  if (!existing || existing.archived_at) return errorResponse(404, 'NOT_FOUND', 'Contact not found');

  const fullName = cleanString(body.full_name ?? body.name ?? existing.full_name, 200);
  if (!fullName) {
    return errorResponse(400, 'INVALID_INPUT', 'Contact name cannot be empty');
  }

  const roleTitle = body.role_title !== undefined || body.role !== undefined
    ? cleanString(body.role_title ?? body.role, 120) || null
    : existing.role_title;

  const email = body.email !== undefined
    ? (cleanString(body.email, 200).toLowerCase() || null)
    : existing.email;

  const phone = body.phone !== undefined
    ? (cleanString(body.phone, 50) || null)
    : existing.phone;

  const notes = body.notes !== undefined
    ? (cleanString(body.notes, 2000) || null)
    : existing.notes;

  const isPrimary = (body.is_primary !== undefined || body.isPrimary !== undefined)
    ? ((body.is_primary ?? body.isPrimary) ? 1 : 0)
    : existing.is_primary;

  if (isPrimary && !existing.is_primary) {
    await db.prepare(`UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?`).bind(existing.client_id).run();
  }

  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `UPDATE client_contacts
       SET full_name = ?, role_title = ?, email = ?, phone = ?, is_primary = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      fullName,
      roleTitle,
      email,
      phone,
      isPrimary,
      notes,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM client_contacts WHERE id = ?`).bind(id).first();
  const mapped = mapContactRecord(updated);

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'CONTACT_UPDATED',
    entityType: 'client_contacts',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: mapContactRecord(existing),
    after: mapped
  });

  return jsonResponse({ success: true, contact: mapped });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Contact ID is required');

  const permanent = new URL(request.url).searchParams.get('permanent') === 'true';
  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM client_contacts WHERE id = ?`).bind(id).first();
  if (!existing || (!permanent && existing.archived_at)) {
    return errorResponse(404, 'NOT_FOUND', 'Contact not found');
  }

  const nowIso = new Date().toISOString();
  if (permanent) {
    await db.prepare(`DELETE FROM client_contacts WHERE id = ?`).bind(id).run();
  } else {
    await db
      .prepare(`UPDATE client_contacts SET archived_at = ?, archived_by = ?, updated_at = ? WHERE id = ?`)
      .bind(nowIso, auth.owner.uid, nowIso, id)
      .run();
  }

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: permanent ? 'CONTACT_DELETED' : 'CONTACT_ARCHIVED',
    entityType: 'client_contacts',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: mapContactRecord(existing)
  });

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions(context) {
  return hqOptionsResponse(context);
}
