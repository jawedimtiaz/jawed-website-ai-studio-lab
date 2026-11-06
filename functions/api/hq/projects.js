// functions/api/hq/projects.js
// Studio HQ Projects API Endpoint

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse } from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  try {
    const projects = await db.prepare(`
      SELECT id, client_id, title, description, status, budget, created_at, updated_at
      FROM hq_projects
      ORDER BY updated_at DESC
    `).all();

    return jsonResponse({
      success: true,
      projects: projects.results || [],
      count: projects.results?.length || 0
    });
  } catch (err) {
    console.error('[HQ Projects GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve projects');
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

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return errorResponse(400, 'INVALID_INPUT', 'Project title is required');
  }

  const id = body.id || crypto.randomUUID();
  const clientId = body.client_id || body.clientId || null;
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const status = typeof body.status === 'string' ? body.status.trim() : 'planning';
  const budget = typeof body.budget === 'number' ? body.budget : Number(body.budget) || 0;
  const now = Date.now();

  try {
    await db.prepare(`
      INSERT INTO hq_projects (id, client_id, title, description, status, budget, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, clientId, title, description, status, budget, now, now).run();

    return jsonResponse({
      success: true,
      project: { id, clientId, title, description, status, budget, createdAt: now, updatedAt: now }
    }, 201);
  } catch (err) {
    console.error('[HQ Projects POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create project');
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
    return errorResponse(400, 'INVALID_INPUT', 'Project ID is required for updates');
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const clientId = body.client_id || body.clientId || null;
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const status = typeof body.status === 'string' ? body.status.trim() : 'planning';
  const budget = typeof body.budget === 'number' ? body.budget : Number(body.budget) || 0;
  const now = Date.now();

  try {
    const result = await db.prepare(`
      UPDATE hq_projects
      SET client_id = ?, title = ?, description = ?, status = ?, budget = ?, updated_at = ?
      WHERE id = ?
    `).bind(clientId, title, description, status, budget, now, body.id).run();

    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse(404, 'NOT_FOUND', 'Project record not found');
    }

    return jsonResponse({
      success: true,
      project: { id: body.id, clientId, title, description, status, budget, updatedAt: now }
    });
  } catch (err) {
    console.error('[HQ Projects PUT Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update project');
  }
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return errorResponse(400, 'INVALID_INPUT', 'Project ID search parameter is required');
  }

  const db = env.HQ_DB;
  try {
    const result = await db.prepare(`DELETE FROM hq_projects WHERE id = ?`).bind(id).run();
    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse(404, 'NOT_FOUND', 'Project record not found');
    }

    return jsonResponse({ success: true, deletedId: id });
  } catch (err) {
    console.error('[HQ Projects DELETE Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to delete project');
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
