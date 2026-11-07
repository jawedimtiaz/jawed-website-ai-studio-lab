// Studio HQ Tasks API — aligned with the live project_tasks schema.

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse, optionsResponse } from '../../lib/hqApi.js';

const STATUSES = new Set(['todo', 'in-progress', 'blocked', 'done', 'cancelled']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const text = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;
  const projectId = new URL(request.url).searchParams.get('projectId');
  try {
    const result = projectId
      ? await env.HQ_DB.prepare(`
          SELECT id, project_id, milestone_id, title, description, status, priority, assigned_to,
                 due_date, completed_at, created_at, updated_at
          FROM project_tasks WHERE archived_at IS NULL AND project_id = ? ORDER BY due_date ASC, created_at DESC
        `).bind(projectId).all()
      : await env.HQ_DB.prepare(`
          SELECT id, project_id, milestone_id, title, description, status, priority, assigned_to,
                 due_date, completed_at, created_at, updated_at
          FROM project_tasks WHERE archived_at IS NULL ORDER BY due_date ASC, created_at DESC
        `).all();
    return jsonResponse({ success: true, tasks: result.results || [], count: result.results?.length || 0 });
  } catch (error) {
    console.error('[HQ Tasks GET Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve tasks');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;
  let body;
  try { body = await request.json(); } catch {
    return errorResponse(400, 'INVALID_JSON', 'Malformed JSON payload');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse(400, 'INVALID_INPUT', 'A task object is required');

  const title = text(body.title, 200);
  const projectId = text(body.project_id ?? body.projectId, 100);
  const status = body.status === 'completed' ? 'done' : text(body.status, 30) || 'todo';
  const priority = body.priority === 'medium' ? 'normal' : text(body.priority, 20) || 'normal';
  const milestoneId = text(body.milestone_id ?? body.milestoneId, 100) || null;
  const dueDate = text(body.due_date ?? body.dueDate, 10) || null;
  const assignedTo = text(body.assigned_to ?? body.assignedTo, 128) || null;
  if (!title || !projectId) return errorResponse(400, 'INVALID_INPUT', 'Task title and project are required');
  if (!STATUSES.has(status)) return errorResponse(400, 'INVALID_STATUS', 'Unsupported task status');
  if (!PRIORITIES.has(priority)) return errorResponse(400, 'INVALID_PRIORITY', 'Unsupported task priority');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.HQ_DB.prepare(`
      INSERT INTO project_tasks
        (id, project_id, milestone_id, title, description, status, priority, assigned_to, due_date,
         created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, projectId, milestoneId, title, text(body.description, 5000) || null, status, priority,
      assignedTo, dueDate, auth.owner.uid, auth.owner.uid, now, now
    ).run();
    return jsonResponse({ success: true, task: { id, project_id: projectId, milestone_id: milestoneId, title, status, priority, assigned_to: assignedTo, due_date: dueDate, created_at: now, updated_at: now } }, 201);
  } catch (error) {
    console.error('[HQ Tasks POST Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create task');
  }
}

export async function onRequestOptions({ request }) {
  return optionsResponse(request, 'GET, POST, OPTIONS');
}
