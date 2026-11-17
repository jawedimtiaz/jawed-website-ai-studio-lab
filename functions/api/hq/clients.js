// functions/api/hq/clients.js
// Studio HQ CRM Customers API Endpoint (Canonical `clients` schema)

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  parsePagination,
  auditLog
} from '../../lib/hqApi.js';

const CLIENT_STATUSES = ['lead', 'onboarding', 'active', 'paused', 'completed', 'archived'];

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  try {
    // Rich isolated single-customer detail view
    if (id) {
      const client = await db.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
      if (!client) return errorResponse(404, 'NOT_FOUND', 'Customer not found');

      const [contacts, notes, followUps, projects, invoices, quotations, maintenance, tickets] =
        await Promise.all([
          db.prepare(`SELECT * FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, name ASC`).bind(id).all(),
          db.prepare(`SELECT * FROM activity_notes WHERE client_id = ? ORDER BY created_at DESC LIMIT 50`).bind(id).all(),
          db.prepare(`SELECT * FROM follow_ups WHERE client_id = ? ORDER BY scheduled_at ASC`).bind(id).all(),
          db.prepare(`SELECT * FROM projects WHERE client_id = ? AND archived_at IS NULL ORDER BY updated_at DESC`).bind(id).all(),
          db.prepare(`SELECT * FROM invoices WHERE client_id = ? ORDER BY issue_date DESC`).bind(id).all(),
          db.prepare(`SELECT * FROM quotations WHERE client_id = ? ORDER BY created_at DESC`).bind(id).all(),
          db.prepare(`SELECT * FROM maintenance_plans WHERE client_id = ? ORDER BY expiry_date ASC`).bind(id).all(),
          db.prepare(`SELECT * FROM support_tickets WHERE client_id = ? ORDER BY updated_at DESC`).bind(id).all()
        ]);

      return jsonResponse({
        success: true,
        client,
        contacts: contacts.results || [],
        notes: notes.results || [],
        followUps: followUps.results || [],
        projects: projects.results || [],
        invoices: invoices.results || [],
        quotations: quotations.results || [],
        maintenance: maintenance.results || [],
        tickets: tickets.results || []
      });
    }

    const status = url.searchParams.get('status') || '';
    const includeArchived = url.searchParams.get('includeArchived') === 'true' || status === 'archived';
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const { page, limit, offset } = parsePagination(url);

    const conditions = [];
    const params = [];

    if (!includeArchived) {
      conditions.push(`archived_at IS NULL AND status != 'archived'`);
    }
    if (status && status !== 'All') {
      conditions.push(`status = ?`);
      params.push(status);
    }
    if (q) {
      conditions.push(
        `(LOWER(name) LIKE ? OR LOWER(business_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(category) LIKE ?)`
      );
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRow = await db
      .prepare(`SELECT COUNT(*) AS total FROM clients ${whereClause}`)
      .bind(...params)
      .first();

    const rows = await db
      .prepare(
        `SELECT c.*,
                (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.archived_at IS NULL) AS project_count,
                (SELECT COALESCE(SUM(i.balance_due_minor), 0) FROM invoices i WHERE i.client_id = c.id AND i.status NOT IN ('Draft', 'Void')) AS outstanding_minor
         FROM clients c
         ${whereClause}
         ORDER BY c.updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all();

    return jsonResponse({
      success: true,
      clients: rows.results || [],
      total: Number(countRow?.total || 0),
      page,
      limit
    });
  } catch (err) {
    console.error('[HQ Clients GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve CRM customers');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const name = cleanString(body.name, 200);
  const businessName = cleanString(body.business_name ?? body.company ?? '', 200);
  if (!name && !businessName) {
    return errorResponse(400, 'INVALID_INPUT', 'Contact name or business name is required');
  }

  const db = env.HQ_DB;
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status = CLIENT_STATUSES.includes(body.status) ? body.status : 'active';
  const email = cleanString(body.email, 200).toLowerCase();
  const phone = cleanString(body.phone, 50);

  try {
    await db
      .prepare(
        `INSERT INTO clients (
          id, name, business_name, status, email, phone, category, website,
          address, lead_source, notes, last_contact_at, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        name || businessName,
        businessName || name,
        status,
        email,
        phone,
        cleanString(body.category, 100),
        cleanString(body.website, 300),
        cleanString(body.address, 400),
        cleanString(body.lead_source ?? body.leadSource ?? '', 100),
        cleanString(body.notes, 4000),
        cleanString(body.last_contact_at || nowIso, 50),
        auth.owner.uid,
        nowIso,
        nowIso
      )
      .run();

    // Auto-create primary contact record if contact name provided
    if (name) {
      await db
        .prepare(
          `INSERT INTO client_contacts (id, client_id, name, role, email, phone, is_primary, created_at, updated_at)
           VALUES (?, ?, ?, 'Primary Contact', ?, ?, 1, ?, ?)`
        )
        .bind(crypto.randomUUID(), id, name, email, phone, nowIso, nowIso)
        .run();
    }

    const created = await db.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'CLIENT_CREATED',
      entityType: 'clients',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: created
    });

    return jsonResponse({ success: true, client: created }, 201);
  } catch (err) {
    console.error('[HQ Clients POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create CRM customer');
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Customer ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Customer record not found');

  const nowIso = new Date().toISOString();

  // Archive / restore actions
  if (body.action === 'archive') {
    await db
      .prepare(`UPDATE clients SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`)
      .bind(nowIso, nowIso, id)
      .run();
    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'CLIENT_ARCHIVED',
      entityType: 'clients',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: { status: existing.status }
    });
    const updated = await db.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
    return jsonResponse({ success: true, client: updated });
  }

  if (body.action === 'restore') {
    await db
      .prepare(`UPDATE clients SET status = 'active', archived_at = NULL, updated_at = ? WHERE id = ?`)
      .bind(nowIso, id)
      .run();
    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'CLIENT_RESTORED',
      entityType: 'clients',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: { status: existing.status }
    });
    const updated = await db.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
    return jsonResponse({ success: true, client: updated });
  }

  const nextStatus = CLIENT_STATUSES.includes(body.status) ? body.status : existing.status;
  const archivedAt = nextStatus === 'archived' ? existing.archived_at || nowIso : null;

  try {
    await db
      .prepare(
        `UPDATE clients
         SET name = ?, business_name = ?, status = ?, email = ?, phone = ?,
             category = ?, website = ?, address = ?, lead_source = ?, notes = ?,
             last_contact_at = ?, archived_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        cleanString(body.name ?? existing.name, 200),
        cleanString(body.business_name ?? body.company ?? existing.business_name, 200),
        nextStatus,
        cleanString(body.email ?? existing.email, 200).toLowerCase(),
        cleanString(body.phone ?? existing.phone, 50),
        cleanString(body.category ?? existing.category, 100),
        cleanString(body.website ?? existing.website, 300),
        cleanString(body.address ?? existing.address, 400),
        cleanString(body.lead_source ?? body.leadSource ?? existing.lead_source, 100),
        cleanString(body.notes ?? existing.notes, 4000),
        body.last_contact_at !== undefined
          ? cleanString(body.last_contact_at, 50) || existing.last_contact_at
          : existing.last_contact_at,
        archivedAt,
        nowIso,
        id
      )
      .run();

    const updated = await db.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'CLIENT_UPDATED',
      entityType: 'clients',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: existing,
      after: updated
    });

    return jsonResponse({ success: true, client: updated });
  } catch (err) {
    console.error('[HQ Clients PUT Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update CRM customer');
  }
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Customer ID search parameter is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Customer record not found');

  const nowIso = new Date().toISOString();
  // Soft-archive by default to preserve financial/audit history unless permanent=true is explicitly passed
  const permanent = new URL(request.url).searchParams.get('permanent') === 'true';

  if (permanent) {
    await db.prepare(`DELETE FROM clients WHERE id = ?`).bind(id).run();
  } else {
    await db
      .prepare(`UPDATE clients SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`)
      .bind(nowIso, nowIso, id)
      .run();
  }

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: permanent ? 'CLIENT_DELETED_PERMANENT' : 'CLIENT_ARCHIVED',
    entityType: 'clients',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: existing
  });

  return jsonResponse({ success: true, deletedId: id, archived: !permanent });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
