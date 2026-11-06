// functions/api/hq/clients.js
// Studio HQ CRM Clients API Endpoint

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse } from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  try {
    const clients = await db.prepare(`
      SELECT id, name, company, email, phone, status, created_at, updated_at
      FROM hq_clients
      ORDER BY updated_at DESC
    `).all();

    return jsonResponse({
      success: true,
      clients: clients.results || [],
      count: clients.results?.length || 0
    });
  } catch (err) {
    console.error('[HQ Clients GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve CRM clients');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Malformed JSON payload');
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return errorResponse(400, 'INVALID_INPUT', 'Client name is required');
  }

  const id = body.id || crypto.randomUUID();
  const company = typeof body.company === 'string' ? body.company.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const status = typeof body.status === 'string' ? body.status.trim() : 'active';
  const now = Date.now();

  try {
    await db.prepare(`
      INSERT INTO hq_clients (id, name, company, email, phone, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, name, company, email, phone, status, now, now).run();

    return jsonResponse({
      success: true,
      client: { id, name, company, email, phone, status, createdAt: now, updatedAt: now }
    }, 201);
  } catch (err) {
    console.error('[HQ Clients POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create CRM client');
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Malformed JSON payload');
  }

  if (!body.id) {
    return errorResponse(400, 'INVALID_INPUT', 'Client ID is required for updates');
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const company = typeof body.company === 'string' ? body.company.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const status = typeof body.status === 'string' ? body.status.trim() : 'active';
  const now = Date.now();

  try {
    const result = await db.prepare(`
      UPDATE hq_clients
      SET name = ?, company = ?, email = ?, phone = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).bind(name, company, email, phone, status, now, body.id).run();

    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse(404, 'NOT_FOUND', 'Client record not found');
    }

    return jsonResponse({
      success: true,
      client: { id: body.id, name, company, email, phone, status, updatedAt: now }
    });
  } catch (err) {
    console.error('[HQ Clients PUT Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update CRM client');
  }
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return errorResponse(400, 'INVALID_INPUT', 'Client ID search parameter is required');
  }

  const db = env.HQ_DB;
  try {
    const result = await db.prepare(`DELETE FROM hq_clients WHERE id = ?`).bind(id).run();
    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse(404, 'NOT_FOUND', 'Client record not found');
    }

    return jsonResponse({ success: true, deletedId: id });
  } catch (err) {
    console.error('[HQ Clients DELETE Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to delete CRM client');
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '86400'
    }
  });
}
