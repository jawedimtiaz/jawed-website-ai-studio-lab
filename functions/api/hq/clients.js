// Studio HQ CRM Clients API — aligned with the live clients schema.

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse, optionsResponse } from '../../lib/hqApi.js';

const CLIENT_STATUSES = new Set(['lead', 'prospect', 'active', 'paused', 'completed', 'closed']);
const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;
  try {
    const result = await env.HQ_DB.prepare(`
      SELECT id, name, business_name AS company, email, phone, status, created_at, updated_at
      FROM clients
      WHERE archived_at IS NULL
      ORDER BY updated_at DESC
    `).all();
    return jsonResponse({ success: true, clients: result.results || [], count: result.results?.length || 0 });
  } catch (error) {
    console.error('[HQ Clients GET Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve CRM clients');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;

  let body;
  try { body = await request.json(); } catch {
    return errorResponse(400, 'INVALID_JSON', 'Malformed JSON payload');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse(400, 'INVALID_INPUT', 'A client object is required');
  }

  const name = text(body.name, 120);
  if (name.length < 2) return errorResponse(400, 'INVALID_INPUT', 'Client name must contain at least 2 characters');
  const businessName = text(body.company ?? body.business_name, 160) || null;
  const email = text(body.email, 150).toLowerCase() || null;
  const phone = text(body.phone, 30) || null;
  const status = text(body.status, 30) || 'lead';
  if (!CLIENT_STATUSES.has(status)) return errorResponse(400, 'INVALID_STATUS', 'Unsupported client status');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.HQ_DB.prepare(`
      INSERT INTO clients (id, name, business_name, email, phone, status, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, name, businessName, email, phone, status, auth.owner.uid, auth.owner.uid, now, now).run();
    return jsonResponse({
      success: true,
      client: { id, name, company: businessName, email, phone, status, created_at: now, updated_at: now }
    }, 201);
  } catch (error) {
    console.error('[HQ Clients POST Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create CRM client');
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;

  let body;
  try { body = await request.json(); } catch {
    return errorResponse(400, 'INVALID_JSON', 'Malformed JSON payload');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.id !== 'string') {
    return errorResponse(400, 'INVALID_INPUT', 'Client ID is required for updates');
  }

  const name = text(body.name, 120);
  if (name.length < 2) return errorResponse(400, 'INVALID_INPUT', 'Client name must contain at least 2 characters');
  const businessName = text(body.company ?? body.business_name, 160) || null;
  const email = text(body.email, 150).toLowerCase() || null;
  const phone = text(body.phone, 30) || null;
  const status = text(body.status, 30) || 'lead';
  if (!CLIENT_STATUSES.has(status)) return errorResponse(400, 'INVALID_STATUS', 'Unsupported client status');

  const now = new Date().toISOString();
  try {
    const result = await env.HQ_DB.prepare(`
      UPDATE clients
      SET name = ?, business_name = ?, email = ?, phone = ?, status = ?, updated_by = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
    `).bind(name, businessName, email, phone, status, auth.owner.uid, now, body.id).run();
    if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Client record not found');
    return jsonResponse({ success: true, client: { id: body.id, name, company: businessName, email, phone, status, updated_at: now } });
  } catch (error) {
    console.error('[HQ Clients PUT Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update CRM client');
  }
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Client ID is required');

  const now = new Date().toISOString();
  try {
    const result = await env.HQ_DB.prepare(`
      UPDATE clients SET archived_at = ?, archived_by = ?, updated_by = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
    `).bind(now, auth.owner.uid, auth.owner.uid, now, id).run();
    if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Client record not found');
    return jsonResponse({ success: true, archivedId: id });
  } catch (error) {
    console.error('[HQ Clients DELETE Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to archive CRM client');
  }
}

export async function onRequestOptions({ request }) {
  return optionsResponse(request, 'GET, POST, PUT, DELETE, OPTIONS');
}
