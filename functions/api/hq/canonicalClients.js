// functions/api/hq/canonicalClients.js
// Isolated Canonical Clients API Handler for Studio HQ
// Strictly adheres to canonical D1 clients schema and security architecture.

import {
  authorizeHqOwner,
  hqJson,
  readHqJson,
  requireHqDatabase,
  ownerAuthorizationGuardStatement,
  auditStatement,
  conditionalAuditStatement
} from '../../lib/hqCanonicalApi.js';
import { checkHqRateLimit } from '../../lib/hqCanonicalRateLimit.js';

export const CLIENT_STATUSES = new Set(['lead', 'prospect', 'active', 'paused', 'completed', 'closed']);

const TEXT_LIMITS = {
  name: 160,
  client_code: 40,
  business_name: 200,
  email: 160,
  phone: 50,
  website_url: 300,
  billing_address: 500,
  notes: 4000,
  source: 100
};

const CLIENT_FIELDS = Object.keys(TEXT_LIMITS);

const CONTACT_TEXT_LIMITS = {
  full_name: 160,
  role_title: 100,
  email: 160,
  phone: 50,
  notes: 2000
};

function textField(value, max, key) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: key.toUpperCase() + '_MUST_BE_TEXT' };
  const clean = value.trim();
  if (clean.length > max) return { ok: false, error: key.toUpperCase() + '_TOO_LONG' };
  return { ok: true, value: clean || null };
}

/**
 * Validates client payload against canonical schema constraints.
 *
 * @param {Record<string, any>} input
 * @param {boolean} [partial=false]
 * @returns {{ ok: boolean, value?: Record<string, any>, error?: string }}
 */
export function validateClient(input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'INVALID_PAYLOAD' };
  }

  const allowed = new Set([...CLIENT_FIELDS, 'status']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      return { ok: false, error: 'FIELD_NOT_ALLOWED' };
    }
  }

  const output = {};
  for (const field of CLIENT_FIELDS) {
    if (!(field in input)) continue;
    const result = textField(input[field], TEXT_LIMITS[field], field);
    if (!result.ok) return result;
    output[field] = result.value;
  }

  if (!partial && (!output.name || output.name.length < 1)) {
    return { ok: false, error: 'NAME_REQUIRED' };
  }
  if (partial && 'name' in output && (!output.name || output.name.length < 1)) {
    return { ok: false, error: 'NAME_REQUIRED' };
  }

  if ('status' in input) {
    if (typeof input.status !== 'string' || !CLIENT_STATUSES.has(input.status)) {
      return { ok: false, error: 'STATUS_INVALID' };
    }
    output.status = input.status;
  }

  return { ok: true, value: output };
}

/**
 * Validates client contact payload against canonical schema constraints.
 *
 * @param {Record<string, any>} input
 * @param {boolean} [partial=false]
 * @returns {{ ok: boolean, value?: Record<string, any>, error?: string }}
 */
export function validateContact(input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'INVALID_PAYLOAD' };
  }

  const allowed = new Set([...Object.keys(CONTACT_TEXT_LIMITS), 'is_primary']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      return { ok: false, error: 'FIELD_NOT_ALLOWED' };
    }
  }

  const output = {};
  for (const field of Object.keys(CONTACT_TEXT_LIMITS)) {
    if (!(field in input)) continue;
    const result = textField(input[field], CONTACT_TEXT_LIMITS[field], field);
    if (!result.ok) return result;
    output[field] = result.value;
  }

  if (!partial && (!output.full_name || output.full_name.length < 1)) {
    return { ok: false, error: 'FULL_NAME_REQUIRED' };
  }
  if (partial && 'full_name' in output && (!output.full_name || output.full_name.length < 1)) {
    return { ok: false, error: 'FULL_NAME_REQUIRED' };
  }

  if ('is_primary' in input) {
    const val = input.is_primary;
    if (typeof val === 'boolean') {
      output.is_primary = val ? 1 : 0;
    } else if (val === 0 || val === 1) {
      output.is_primary = val;
    } else {
      return { ok: false, error: 'IS_PRIMARY_INVALID' };
    }
  }

  return { ok: true, value: output };
}

async function clientExists(db, clientId) {
  return db.prepare('SELECT id FROM clients WHERE id = ? AND archived_at IS NULL').bind(clientId).first();
}

async function getClient(db, id) {
  const client = await db.prepare(
    `SELECT * FROM clients WHERE id = ?`
  ).bind(id).first();
  if (!client) return null;
  const contacts = await db.prepare(
    `SELECT * FROM client_contacts WHERE client_id = ? AND archived_at IS NULL ORDER BY is_primary DESC, created_at ASC`
  ).bind(id).all();
  return { ...client, contacts: contacts?.results || [] };
}

async function listClients(request, db) {
  const url = new URL(request.url);
  const archivedOnly = url.searchParams.get('archivedOnly') === 'true' || url.searchParams.get('includeArchived') === 'true';
  const status = url.searchParams.get('status');
  if (status && !CLIENT_STATUSES.has(status)) {
    return hqJson({ ok: false, error: 'STATUS_INVALID' }, 400);
  }
  const q = (url.searchParams.get('q') || '').trim();
  const limitValue = Number.parseInt(url.searchParams.get('limit') || '50', 10);
  const offsetValue = Number.parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = Number.isFinite(limitValue) ? Math.min(100, Math.max(1, limitValue)) : 50;
  const offset = Number.isFinite(offsetValue) ? Math.min(10000, Math.max(0, offsetValue)) : 0;
  const clauses = [archivedOnly ? 'c.archived_at IS NOT NULL' : 'c.archived_at IS NULL'];
  const params = [];
  if (status) {
    clauses.push('c.status = ?');
    params.push(status);
  }
  if (q) {
    clauses.push('(LOWER(c.name) LIKE ? OR LOWER(c.business_name) LIKE ? OR LOWER(c.email) LIKE ?)');
    const pattern = `%${q.toLowerCase()}%`;
    params.push(pattern, pattern, pattern);
  }

  const countRow = await db.prepare(
    `SELECT COUNT(*) AS total FROM clients c WHERE ${clauses.join(' AND ')}`
  ).bind(...params).first();
  const total = Number(countRow?.total || 0);

  const result = await db.prepare(`SELECT c.id, c.client_code, c.name, c.business_name, c.status, c.email, c.phone, c.website_url, c.billing_address, c.source, c.updated_at, c.archived_at,
    (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.archived_at IS NULL) AS active_projects_count
    FROM clients c
    WHERE ${clauses.join(' AND ')}
    ORDER BY c.updated_at DESC, c.id ASC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset).all();
  return hqJson({ ok: true, clients: result.results || [], total, limit, offset });
}

async function createClient(request, db, identity) {
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateClient(parsed.value);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const client = valid.value;
  const id = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const insert = db.prepare(`INSERT INTO clients
    (id, client_code, name, business_name, status, email, phone, website_url, billing_address, notes, source, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id, client_code, name, business_name, status, email, phone, website_url, billing_address, notes, source, created_at, updated_at`)
    .bind(
      id,
      client.client_code ?? null,
      client.name,
      client.business_name ?? null,
      client.status ?? 'lead',
      client.email ?? null,
      client.phone ?? null,
      client.website_url ?? null,
      client.billing_address ?? null,
      client.notes ?? null,
      client.source ?? null,
      identity.uid,
      identity.uid
    );
  const results = await db.batch([
    ownerAuthorizationGuardStatement(db, identity),
    insert,
    auditStatement(db, identity, 'client.create', 'client', id, requestId, null,
      { name: client.name, business_name: client.business_name, status: client.status ?? 'lead' })
  ]);
  const row = results?.[1]?.results?.[0] || null;
  if (!row) return hqJson({ ok: false, error: 'CLIENT_CREATE_FAILED' }, 500);
  return hqJson({ ok: true, client: row }, 201);
}

async function updateClient(request, db, identity, id) {
  const existing = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
  if (!existing || existing.archived_at) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateClient(parsed.value, true);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const fields = valid.value;
  const keys = Object.keys(fields);
  if (!keys.length) return hqJson({ ok: false, error: 'NO_VALID_FIELDS' }, 400);

  const assignments = keys.map(key => key + ' = ?');
  assignments.push("updated_by = ?", "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  const update = db.prepare(`UPDATE clients SET ${assignments.join(', ')} WHERE id = ? AND archived_at IS NULL`)
    .bind(...keys.map(key => fields[key]), identity.uid, id);
  const merged = { ...existing, ...fields };
  const results = await db.batch([
    ownerAuthorizationGuardStatement(db, identity),
    update,
    conditionalAuditStatement(db, identity, 'client.update', 'client', id, crypto.randomUUID(),
      { name: existing.name, status: existing.status, business_name: existing.business_name },
      { name: merged.name, status: merged.status, business_name: merged.business_name })
  ]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  return hqJson({ ok: true, client: await getClient(db, id) });
}

async function archiveClient(db, identity, id, restore = false) {
  const existing = await db.prepare('SELECT id, name, archived_at FROM clients WHERE id = ?').bind(id).first();
  if (!existing || (restore ? !existing.archived_at : !!existing.archived_at)) {
    return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  }

  // Active projects protection check on archival:
  if (!restore) {
    const activeProjects = await db.prepare(
      'SELECT COUNT(*) as count FROM projects WHERE client_id = ? AND archived_at IS NULL'
    ).bind(id).first();
    if (activeProjects && Number(activeProjects.count) > 0) {
      return hqJson({
        ok: false,
        error: 'CLIENT_HAS_ACTIVE_PROJECTS',
        message: 'Cannot archive client with active projects. Archive or reassign all projects first.'
      }, 400);
    }
  }

  const now = new Date().toISOString();
  const update = restore
    ? db.prepare("UPDATE clients SET archived_at = NULL, archived_by = NULL, updated_by = ?, updated_at = ? WHERE id = ? AND archived_at IS NOT NULL").bind(identity.uid, now, id)
    : db.prepare("UPDATE clients SET archived_at = ?, archived_by = ?, updated_by = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, identity.uid, identity.uid, now, id);

  const results = await db.batch([
    ownerAuthorizationGuardStatement(db, identity),
    update,
    conditionalAuditStatement(db, identity, restore ? 'client.restore' : 'client.archive', 'client', id, crypto.randomUUID(),
      { name: existing.name, archived: !!existing.archived_at },
      { name: existing.name, archived: !restore })
  ]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  return hqJson({ ok: true, id, archived: !restore });
}

async function listClientContacts(request, db, clientId) {
  const archivedOnly = new URL(request.url).searchParams.get('archivedOnly') === 'true';
  const exists = await clientExists(db, clientId);
  if (!exists) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  const result = await db.prepare(`SELECT * FROM client_contacts
    WHERE client_id = ? AND ${archivedOnly ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'}
    ORDER BY is_primary DESC, created_at ASC`).bind(clientId).all();
  return hqJson({ ok: true, contacts: result.results || [] });
}

async function createClientContact(request, db, identity, clientId) {
  const exists = await clientExists(db, clientId);
  if (!exists) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateContact(parsed.value);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const contact = valid.value;
  const id = crypto.randomUUID();
  const insert = db.prepare(`INSERT INTO client_contacts
    (id, client_id, full_name, role_title, email, phone, is_primary, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id, client_id, full_name, role_title, email, phone, is_primary, notes, created_at, updated_at`)
    .bind(
      id,
      clientId,
      contact.full_name,
      contact.role_title ?? null,
      contact.email ?? null,
      contact.phone ?? null,
      contact.is_primary ?? 0,
      contact.notes ?? null
    );
  const results = await db.batch([
    ownerAuthorizationGuardStatement(db, identity),
    insert,
    auditStatement(db, identity, 'client.contact.create', 'client_contact', id, crypto.randomUUID(), null,
      { client_id: clientId, full_name: contact.full_name })
  ]);
  const row = results?.[1]?.results?.[0] || null;
  if (!row) return hqJson({ ok: false, error: 'CONTACT_CREATE_FAILED' }, 500);
  return hqJson({ ok: true, contact: row }, 201);
}

async function updateClientContact(request, db, identity, clientId, contactId) {
  const exists = await clientExists(db, clientId);
  if (!exists) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  const existing = await db.prepare('SELECT * FROM client_contacts WHERE id = ? AND client_id = ? AND archived_at IS NULL')
    .bind(contactId, clientId).first();
  if (!existing) return hqJson({ ok: false, error: 'CONTACT_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateContact(parsed.value, true);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const fields = valid.value;
  const keys = Object.keys(fields);
  if (!keys.length) return hqJson({ ok: false, error: 'NO_VALID_FIELDS' }, 400);
  const assignments = keys.map(key => key + ' = ?');
  assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  const update = db.prepare(`UPDATE client_contacts SET ${assignments.join(', ')} WHERE id = ? AND client_id = ? AND archived_at IS NULL`)
    .bind(...keys.map(key => fields[key]), contactId, clientId);
  const results = await db.batch([
    ownerAuthorizationGuardStatement(db, identity),
    update,
    conditionalAuditStatement(db, identity, 'client.contact.update', 'client_contact', contactId, crypto.randomUUID(),
      { full_name: existing.full_name, role_title: existing.role_title },
      { full_name: fields.full_name ?? existing.full_name, role_title: fields.role_title ?? existing.role_title })
  ]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) return hqJson({ ok: false, error: 'CONTACT_NOT_FOUND' }, 404);
  const contact = await db.prepare('SELECT * FROM client_contacts WHERE id = ?').bind(contactId).first();
  return hqJson({ ok: true, contact });
}

/**
 * Handles authorized requests for canonical Studio HQ clients routes.
 */
export async function handleAuthorizedHqClients({ request, env, segments, identity }) {
  const dbResult = requireHqDatabase(env);
  if (!dbResult.ok) return dbResult.response;
  const db = dbResult.db;
  try {
    const generalLimit = await checkHqRateLimit(request, env, { type: 'general', uid: identity.uid });
    if (!generalLimit.ok) return generalLimit.response;
    if (['POST', 'PATCH'].includes(request.method)) {
      const rateLimit = await checkHqRateLimit(request, env, { type: 'write', uid: identity.uid });
      if (!rateLimit.ok) return rateLimit.response;
    }

    if (segments.length === 0) {
      if (request.method === 'GET') return await listClients(request, db);
      if (request.method === 'POST') return await createClient(request, db, identity);
      return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { 'allow': 'GET, POST' });
    }
    const [id, action, childId] = segments;
    if (!id || id.length > 80) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
    if (action === 'archive' || action === 'restore') {
      if (segments.length === 2 && request.method === 'POST') return await archiveClient(db, identity, id, action === 'restore');
      return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { 'allow': 'POST' });
    }
    if (action === 'contacts') {
      if (segments.length === 2 && request.method === 'GET') return await listClientContacts(request, db, id);
      if (segments.length === 2 && request.method === 'POST') return await createClientContact(request, db, identity, id);
      if (segments.length === 3 && request.method === 'PATCH') return await updateClientContact(request, db, identity, id, childId);
      const allow = segments.length === 3 ? 'PATCH' : 'GET, POST';
      return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { 'allow': allow });
    }
    if (action) return hqJson({ ok: false, error: 'NOT_FOUND' }, 404);
    if (request.method === 'GET') {
      const client = await getClient(db, id);
      return client ? hqJson({ ok: true, client }) : hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
    }
    if (request.method === 'PATCH') return await updateClient(request, db, identity, id);
    return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { 'allow': 'GET, PATCH' });
  } catch (error) {
    console.error('[Studio HQ] Client API operation failed', error);
    return hqJson({ ok: false, error: 'HQ_REQUEST_FAILED' }, 500);
  }
}

/**
 * Main entry point for canonical Studio HQ Clients API.
 * Authenticates caller as active enrolled owner before dispatching.
 */
export async function handleHqClients({ request, env, segments }) {
  const ipLimit = await checkHqRateLimit(request, env, { type: 'general' });
  if (!ipLimit.ok) return ipLimit.response;
  const auth = await authorizeHqOwner(request, env);
  if (!auth.ok) return auth.response;
  return handleAuthorizedHqClients({ request, env, segments, identity: auth.identity });
}
