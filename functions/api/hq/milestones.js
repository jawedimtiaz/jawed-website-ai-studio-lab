// functions/api/hq/milestones.js
// Studio HQ Milestones API Endpoint

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse } from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  try {
    let milestones;
    if (projectId) {
      milestones = await db.prepare(`
        SELECT id, project_id, title, status, target_date, created_at, updated_at
        FROM hq_milestones
        WHERE project_id = ?
        ORDER BY target_date ASC
      `).bind(projectId).all();
    } else {
      milestones = await db.prepare(`
        SELECT id, project_id, title, status, target_date, created_at, updated_at
        FROM hq_milestones
        ORDER BY target_date ASC
      `).all();
    }

    return jsonResponse({
      success: true,
      milestones: milestones.results || [],
      count: milestones.results?.length || 0
    });
  } catch (err) {
    console.error('[HQ Milestones GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve milestones');
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
    return errorResponse(400, 'INVALID_INPUT', 'Milestone title is required');
  }

  const id = body.id || crypto.randomUUID();
  const projectId = body.project_id || body.projectId || null;
  const status = typeof body.status === 'string' ? body.status.trim() : 'pending';
  const targetDate = body.target_date || body.targetDate || null;
  const now = Date.now();

  try {
    await db.prepare(`
      INSERT INTO hq_milestones (id, project_id, title, status, target_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, projectId, title, status, targetDate, now, now).run();

    return jsonResponse({
      success: true,
      milestone: { id, projectId, title, status, targetDate, createdAt: now, updatedAt: now }
    }, 201);
  } catch (err) {
    console.error('[HQ Milestones POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create milestone');
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '86400'
    }
  });
}
