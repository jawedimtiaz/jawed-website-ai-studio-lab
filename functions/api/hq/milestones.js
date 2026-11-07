// Studio HQ Milestones API — aligned with the live project_milestones schema.

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse, optionsResponse } from '../../lib/hqApi.js';

const STATUSES = new Set(['not-started', 'in-progress', 'blocked', 'completed', 'skipped']);
const text = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;
  const projectId = new URL(request.url).searchParams.get('projectId');
  try {
    const result = projectId
      ? await env.HQ_DB.prepare(`
          SELECT id, project_id, name AS title, description, status, due_date AS target_date,
                 completed_at, sort_order, created_at, updated_at
          FROM project_milestones
          WHERE archived_at IS NULL AND project_id = ?
          ORDER BY due_date ASC, sort_order ASC
        `).bind(projectId).all()
      : await env.HQ_DB.prepare(`
          SELECT id, project_id, name AS title, description, status, due_date AS target_date,
                 completed_at, sort_order, created_at, updated_at
          FROM project_milestones
          WHERE archived_at IS NULL
          ORDER BY due_date ASC, sort_order ASC
        `).all();
    return jsonResponse({ success: true, milestones: result.results || [], count: result.results?.length || 0 });
  } catch (error) {
    console.error('[HQ Milestones GET Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve milestones');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;
  let body;
  try { body = await request.json(); } catch {
    return errorResponse(400, 'INVALID_JSON', 'Malformed JSON payload');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse(400, 'INVALID_INPUT', 'A milestone object is required');

  const title = text(body.title ?? body.name, 200);
  const projectId = text(body.project_id ?? body.projectId, 100);
  const status = body.status === 'pending' ? 'not-started' : text(body.status, 30) || 'not-started';
  const dueDate = text(body.target_date ?? body.targetDate ?? body.due_date ?? body.dueDate, 10) || null;
  const description = text(body.description, 5000) || null;
  const sortOrder = Number.isInteger(body.sort_order) ? body.sort_order : 0;
  if (!title || !projectId) return errorResponse(400, 'INVALID_INPUT', 'Milestone title and project are required');
  if (!STATUSES.has(status)) return errorResponse(400, 'INVALID_STATUS', 'Unsupported milestone status');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.HQ_DB.prepare(`
      INSERT INTO project_milestones
        (id, project_id, name, description, status, due_date, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, projectId, title, description, status, dueDate, sortOrder, now, now).run();
    return jsonResponse({ success: true, milestone: { id, project_id: projectId, title, description, status, target_date: dueDate, sort_order: sortOrder, created_at: now, updated_at: now } }, 201);
  } catch (error) {
    console.error('[HQ Milestones POST Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create milestone');
  }
}

export async function onRequestOptions({ request }) {
  return optionsResponse(request, 'GET, POST, OPTIONS');
}
