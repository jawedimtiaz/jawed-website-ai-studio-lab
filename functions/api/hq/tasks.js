// functions/api/hq/tasks.js
// Studio HQ Tasks API Endpoint

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse } from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  try {
    let tasks;
    if (projectId) {
      tasks = await db.prepare(`
        SELECT id, project_id, title, status, priority, due_date, created_at, updated_at
        FROM hq_tasks
        WHERE project_id = ?
        ORDER BY updated_at DESC
      `).bind(projectId).all();
    } else {
      tasks = await db.prepare(`
        SELECT id, project_id, title, status, priority, due_date, created_at, updated_at
        FROM hq_tasks
        ORDER BY updated_at DESC
      `).all();
    }

    return jsonResponse({
      success: true,
      tasks: tasks.results || [],
      count: tasks.results?.length || 0
    });
  } catch (err) {
    console.error('[HQ Tasks GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve tasks');
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
    return errorResponse(400, 'INVALID_INPUT', 'Task title is required');
  }

  const id = body.id || crypto.randomUUID();
  const projectId = body.project_id || body.projectId || null;
  const status = typeof body.status === 'string' ? body.status.trim() : 'todo';
  const priority = typeof body.priority === 'string' ? body.priority.trim() : 'medium';
  const dueDate = body.due_date || body.dueDate || null;
  const now = Date.now();

  try {
    await db.prepare(`
      INSERT INTO hq_tasks (id, project_id, title, status, priority, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, projectId, title, status, priority, dueDate, now, now).run();

    return jsonResponse({
      success: true,
      task: { id, projectId, title, status, priority, dueDate, createdAt: now, updatedAt: now }
    }, 201);
  } catch (err) {
    console.error('[HQ Tasks POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create task');
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
