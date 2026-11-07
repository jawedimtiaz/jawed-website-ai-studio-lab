// Studio HQ Projects API — aligned with the live projects schema.

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse, optionsResponse } from '../../lib/hqApi.js';

const PROJECT_STATUSES = new Set(['lead', 'discovery', 'quoted', 'approved', 'in-progress', 'review', 'blocked', 'completed', 'on-hold', 'cancelled']);
const PROJECT_TYPES = new Set(['business-website', 'portfolio', 'web-app', 'automation', 'ai-app', 'calculator-generator', 'maintenance', 'other']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const text = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const normalizeStatus = (value) => value === 'planning' ? 'discovery' : value === 'active' ? 'in-progress' : value;
const normalizePriority = (value) => value === 'medium' ? 'normal' : value;
const amountMinor = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000) return NaN;
  return Math.round(amount * 100);
};

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;
  const clientId = new URL(request.url).searchParams.get('clientId');
  try {
    const result = clientId
      ? await env.HQ_DB.prepare(`
          SELECT id, client_id, name AS title, summary AS description, status, priority,
                 currency, quoted_amount_minor, created_at, updated_at
          FROM projects WHERE archived_at IS NULL AND client_id = ? ORDER BY updated_at DESC
        `).bind(clientId).all()
      : await env.HQ_DB.prepare(`
          SELECT id, client_id, name AS title, summary AS description, status, priority,
                 currency, quoted_amount_minor, created_at, updated_at
          FROM projects WHERE archived_at IS NULL ORDER BY updated_at DESC
        `).all();
    const rows = (result.results || []).map((row) => ({
      ...row,
      budget: row.quoted_amount_minor === null ? null : row.quoted_amount_minor / 100
    }));
    return jsonResponse({ success: true, projects: rows, count: rows.length });
  } catch (error) {
    console.error('[HQ Projects GET Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve projects');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;
  let body;
  try { body = await request.json(); } catch {
    return errorResponse(400, 'INVALID_JSON', 'Malformed JSON payload');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse(400, 'INVALID_INPUT', 'A project object is required');

  const title = text(body.title ?? body.name, 160);
  const clientId = text(body.client_id ?? body.clientId, 100);
  if (!title || !clientId) return errorResponse(400, 'INVALID_INPUT', 'Project name and client are required');
  const status = normalizeStatus(text(body.status, 30) || 'discovery');
  const priority = normalizePriority(text(body.priority, 20) || 'normal');
  const projectType = text(body.project_type ?? body.projectType, 40) || 'business-website';
  const budgetMinor = amountMinor(body.budget);
  if (!PROJECT_STATUSES.has(status)) return errorResponse(400, 'INVALID_STATUS', 'Unsupported project status');
  if (!PRIORITIES.has(priority)) return errorResponse(400, 'INVALID_PRIORITY', 'Unsupported project priority');
  if (!PROJECT_TYPES.has(projectType)) return errorResponse(400, 'INVALID_PROJECT_TYPE', 'Unsupported project type');
  if (Number.isNaN(budgetMinor)) return errorResponse(400, 'INVALID_AMOUNT', 'Budget must be a non-negative amount');
  try {
    const client = await env.HQ_DB.prepare(
      'SELECT id FROM clients WHERE id = ? AND archived_at IS NULL LIMIT 1'
    ).bind(clientId).first();
    if (!client) return errorResponse(404, 'CLIENT_NOT_FOUND', 'The selected client does not exist or is archived');
  } catch (error) {
    console.error('[HQ Project Client Check Error]', String(error?.message || error));
    return errorResponse(503, 'DATABASE_UNAVAILABLE', 'Project client could not be validated');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await env.HQ_DB.prepare(`
      INSERT INTO projects
        (id, client_id, name, project_type, status, priority, summary, start_date, target_date,
         currency, quoted_amount_minor, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?)
    `).bind(
      id, clientId, title, projectType, status, priority,
      text(body.description ?? body.summary, 5000) || null,
      text(body.start_date ?? body.startDate, 10) || null,
      text(body.target_date ?? body.targetDate, 10) || null,
      budgetMinor, auth.owner.uid, auth.owner.uid, now, now
    ).run();
    return jsonResponse({
      success: true,
      project: { id, client_id: clientId, title, status, priority, project_type: projectType, budget: budgetMinor === null ? null : budgetMinor / 100, created_at: now, updated_at: now }
    }, 201);
  } catch (error) {
    console.error('[HQ Projects POST Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create project');
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
    return errorResponse(400, 'INVALID_INPUT', 'Project ID is required for updates');
  }

  const title = text(body.title ?? body.name, 160);
  const clientId = text(body.client_id ?? body.clientId, 100);
  if (!title || !clientId) return errorResponse(400, 'INVALID_INPUT', 'Project name and client are required');
  const status = normalizeStatus(text(body.status, 30) || 'discovery');
  const priority = normalizePriority(text(body.priority, 20) || 'normal');
  const projectType = text(body.project_type ?? body.projectType, 40) || 'business-website';
  const budgetMinor = amountMinor(body.budget);
  if (!PROJECT_STATUSES.has(status) || !PRIORITIES.has(priority) || !PROJECT_TYPES.has(projectType) || Number.isNaN(budgetMinor)) {
    return errorResponse(400, 'INVALID_INPUT', 'Project fields contain an unsupported value');
  }
  const now = new Date().toISOString();
  try {
    const result = await env.HQ_DB.prepare(`
      UPDATE projects
      SET client_id = ?, name = ?, project_type = ?, status = ?, priority = ?, summary = ?,
          target_date = ?, quoted_amount_minor = ?, updated_by = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
    `).bind(
      clientId, title, projectType, status, priority,
      text(body.description ?? body.summary, 5000) || null,
      text(body.target_date ?? body.targetDate, 10) || null,
      budgetMinor, auth.owner.uid, now, body.id
    ).run();
    if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Project record not found');
    return jsonResponse({ success: true, project: { id: body.id, client_id: clientId, title, status, priority, project_type: projectType, budget: budgetMinor === null ? null : budgetMinor / 100, updated_at: now } });
  } catch (error) {
    console.error('[HQ Projects PUT Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update project');
  }
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) return auth.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Project ID is required');
  const now = new Date().toISOString();
  try {
    const result = await env.HQ_DB.prepare(`
      UPDATE projects SET archived_at = ?, archived_by = ?, updated_by = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
    `).bind(now, auth.owner.uid, auth.owner.uid, now, id).run();
    if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Project record not found');
    return jsonResponse({ success: true, archivedId: id });
  } catch (error) {
    console.error('[HQ Projects DELETE Error]', String(error?.message || error));
    return errorResponse(500, 'SERVER_ERROR', 'Failed to archive project');
  }
}

export async function onRequestOptions({ request }) {
  return optionsResponse(request, 'GET, POST, PUT, DELETE, OPTIONS');
}
