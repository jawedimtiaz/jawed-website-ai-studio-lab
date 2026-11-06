import {
  authorizeHqOwner,
  hqJson,
  readHqJson,
  requireHqDatabase,
  ownerUpsertStatement,
  auditStatement
} from '../../lib/hqApi.js';

const CLIENT_STATUSES = new Set(['lead','prospect','active','paused','completed','closed']);
const FIELD_LIMITS = {
  name: 120,
  business_name: 160,
  email: 254,
  phone: 40,
  website_url: 500,
  billing_address: 1000,
  notes: 4000,
  source: 80
};
const CLIENT_FIELDS = Object.keys(FIELD_LIMITS);

function cleanText(value, max, field) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: field + '_MUST_BE_TEXT' };
  const normalized = value.trim();
  if (normalized.length > max) return { ok: false, error: field + '_TOO_LONG' };
  return { ok: true, value: normalized || null };
}

function validateClient(input, partial = false) {
  const output = {};
  for (const field of CLIENT_FIELDS) {
    if (!(field in input)) continue;
    const result = cleanText(input[field], FIELD_LIMITS[field], field.toUpperCase());
    if (!result.ok) return result;
    output[field] = result.value;
  }
  if (!partial && (!output.name || output.name.length < 2)) {
    return { ok: false, error: 'NAME_REQUIRED' };
  }
  if (partial && 'name' in output && (!output.name || output.name.length < 2)) {
    return { ok: false, error: 'NAME_REQUIRED' };
  }
  if ('email' in output && output.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(output.email)) {
    return { ok: false, error: 'EMAIL_INVALID' };
  }
  if ('website_url' in output && output.website_url) {
    try {
      const url = new URL(output.website_url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid');
    } catch {
      return { ok: false, error: 'WEBSITE_URL_INVALID' };
    }
  }
  if ('status' in input) {
    if (typeof input.status !== 'string' || !CLIENT_STATUSES.has(input.status)) {
      return { ok: false, error: 'STATUS_INVALID' };
    }
    output.status = input.status;
  }
  return { ok: true, value: output };
}

function publicClient(row) {
  return row || null;
}

async function getClient(db, id) {
  return db.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
}

async function listClients(request, db) {
  const url = new URL(request.url);
  const archivedOnly = url.searchParams.get('archivedOnly') === 'true';
  const status = url.searchParams.get('status');
  if (status && !CLIENT_STATUSES.has(status)) return hqJson({ ok: false, error: 'STATUS_INVALID' }, 400);
  const limitRaw = Number.parseInt(url.searchParams.get('limit') || '50', 10);
  const offsetRaw = Number.parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.min(10000, Math.max(0, offsetRaw)) : 0;
  const clauses = [];
  const params = [];
  if (archivedOnly) clauses.push('archived_at IS NOT NULL');
  else clauses.push('archived_at IS NULL');
  if (status) { clauses.push('status = ?'); params.push(status); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const result = await db.prepare(`SELECT id, client_code, name, business_name, status, email, phone, website_url, source, created_at, updated_at, archived_at
    FROM clients ${where} ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset).all();
  return hqJson({ ok: true, clients: result.results || [], limit, offset });
}

async function createClient(request, db, identity) {
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const validated = validateClient(parsed.value);
  if (!validated.ok) return hqJson({ ok: false, error: validated.error }, 400);
  const client = validated.value;
  const id = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const created = await db.prepare(`INSERT INTO clients
    (id, name, business_name, status, email, phone, website_url, billing_address, notes, source, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id, client_code, name, business_name, status, email, phone, website_url, billing_address, notes, source, created_at, updated_at, archived_at`)
    .bind(id, client.name, client.business_name ?? null, client.status ?? 'lead', client.email ?? null,
      client.phone ?? null, client.website_url ?? null, client.billing_address ?? null,
      client.notes ?? null, client.source ?? null, identity.uid, identity.uid);
  const statements = [
    ownerUpsertStatement(db, identity),
    created,
    auditStatement(db, identity, 'client.create', 'client', id, requestId, null,
      { name: client.name, business_name: client.business_name ?? null, status: client.status ?? 'lead' })
  ];
  const results = await db.batch(statements);
  const row = results?.[1]?.results?.[0] || null;
  if (!row) return hqJson({ ok: false, error: 'CLIENT_CREATE_FAILED' }, 500);
  return hqJson({ ok: true, client: row }, 201);
}

async function updateClient(request, db, identity, id) {
  const existing = await getClient(db, id);
  if (!existing || existing.archived_at) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const validated = validateClient(parsed.value, true);
  if (!validated.ok) return hqJson({ ok: false, error: validated.error }, 400);
  const fields = validated.value;
  const keys = Object.keys(fields);
  if (!keys.length) return hqJson({ ok: false, error: 'NO_VALID_FIELDS' }, 400);
  const assignments = keys.map(key => key + ' = ?');
  assignments.push("updated_by = ?", "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  const requestId = crypto.randomUUID();
  const update = db.prepare(`UPDATE clients SET ${assignments.join(', ')} WHERE id = ? AND archived_at IS NULL`)
    .bind(...keys.map(key => fields[key]), identity.uid, id);
  const after = { ...existing, ...fields };
  const results = await db.batch([
    ownerUpsertStatement(db, identity),
    update,
    auditStatement(db, identity, 'client.update', 'client', id, requestId,
      { name: existing.name, business_name: existing.business_name, status: existing.status },
      { name: after.name, business_name: after.business_name, status: after.status })
  ]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  return hqJson({ ok: true, client: await getClient(db, id) });
}

async function archiveClient(db, identity, id, restore = false) {
  const existing = await getClient(db, id);
  if (!existing || (restore ? !existing.archived_at : !!existing.archived_at)) {
    return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  }
  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();
  const update = restore
    ? db.prepare("UPDATE clients SET archived_at = NULL, archived_by = NULL, updated_by = ?, updated_at = ? WHERE id = ? AND archived_at IS NOT NULL").bind(identity.uid, now, id)
    : db.prepare("UPDATE clients SET archived_at = ?, archived_by = ?, updated_by = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, identity.uid, identity.uid, now, id);
  const results = await db.batch([
    ownerUpsertStatement(db, identity),
    update,
    auditStatement(db, identity, restore ? 'client.restore' : 'client.archive', 'client', id, requestId,
      { name: existing.name, archived: !!existing.archived_at },
      { name: existing.name, archived: !restore })
  ]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
  return hqJson({ ok: true, id, archived: !restore });
}

export async function handleHqClients({ request, env, segments }) {
  const auth = await authorizeHqOwner(request);
  if (!auth.ok) return auth.response;
  const dbResult = requireHqDatabase(env);
  if (!dbResult.ok) return dbResult.response;
  const db = dbResult.db;
  try {
    if (segments.length === 0) {
      if (request.method === 'GET') return await listClients(request, db);
      if (request.method === 'POST') return await createClient(request, db, auth.identity);
      return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    }
    const [id, action] = segments;
    if (!id || id.length > 80) return hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
    if (action === 'archive' && request.method === 'POST') return await archiveClient(db, auth.identity, id, false);
    if (action === 'restore' && request.method === 'POST') return await archiveClient(db, auth.identity, id, true);
    if (action) return hqJson({ ok: false, error: 'NOT_FOUND' }, 404);
    if (request.method === 'GET') {
      const client = await getClient(db, id);
      return client ? hqJson({ ok: true, client: publicClient(client) }) : hqJson({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
    }
    if (request.method === 'PATCH') return await updateClient(request, db, auth.identity, id);
    return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  } catch (error) {
    console.error('[Studio HQ] Client API operation failed:', error);
    return hqJson({ ok: false, error: 'HQ_REQUEST_FAILED' }, 500);
  }
}
