// functions/api/hq/projects.js
// Studio HQ Projects API Endpoint (Canonical `projects` schema)

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  parsePagination,
  auditLog
} from '../../lib/hqApi.js';

export const PROJECT_STATUSES = [
  'Lead',
  'Planning',
  'Quoted',
  'Onboarding',
  'In Progress',
  'Review',
  'Client Approval',
  'Completed',
  'Maintenance',
  'On Hold',
  'Cancelled'
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  try {
    if (id) {
      const project = await db
        .prepare(
          `SELECT p.*, c.business_name AS client_business, c.name AS client_name, c.email AS client_email
           FROM projects p
           LEFT JOIN clients c ON c.id = p.client_id
           WHERE p.id = ?`
        )
        .bind(id)
        .first();
      if (!project) return errorResponse(404, 'NOT_FOUND', 'Project not found');

      const [tasks, milestones, approvals, qaChecks, repositories, deployments, notes, invoices, quotations, onboarding] =
        await Promise.all([
          db.prepare(`SELECT * FROM project_tasks WHERE project_id = ? AND archived_at IS NULL ORDER BY sort_order ASC, due_date ASC`).bind(id).all(),
          db.prepare(`SELECT * FROM project_milestones WHERE project_id = ? AND archived_at IS NULL ORDER BY sort_order ASC, due_date ASC`).bind(id).all(),
          db.prepare(`SELECT * FROM approvals WHERE project_id = ? ORDER BY requested_at DESC`).bind(id).all(),
          db.prepare(`SELECT * FROM qa_checks WHERE project_id = ? ORDER BY category ASC, created_at ASC`).bind(id).all(),
          db.prepare(`SELECT * FROM repositories WHERE project_id = ? ORDER BY updated_at DESC`).bind(id).all(),
          db.prepare(`SELECT * FROM deployments WHERE project_id = ? ORDER BY deployed_at DESC`).bind(id).all(),
          db.prepare(`SELECT * FROM activity_notes WHERE project_id = ? ORDER BY created_at DESC`).bind(id).all(),
          db.prepare(`SELECT * FROM invoices WHERE project_id = ? ORDER BY issue_date DESC`).bind(id).all(),
          db.prepare(`SELECT * FROM quotations WHERE project_id = ? ORDER BY created_at DESC`).bind(id).all(),
          db.prepare(`SELECT * FROM onboarding_items WHERE project_id = ? ORDER BY sort_order ASC`).bind(id).all()
        ]);

      return jsonResponse({
        success: true,
        project,
        tasks: tasks.results || [],
        milestones: milestones.results || [],
        approvals: approvals.results || [],
        qaChecks: qaChecks.results || [],
        repositories: repositories.results || [],
        deployments: deployments.results || [],
        notes: notes.results || [],
        invoices: invoices.results || [],
        quotations: quotations.results || [],
        onboarding: onboarding.results || []
      });
    }

    const clientId = url.searchParams.get('clientId') || '';
    const status = url.searchParams.get('status') || '';
    const activeOnly = url.searchParams.get('activeOnly') === 'true';
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const { page, limit, offset } = parsePagination(url);

    const conditions = ['p.archived_at IS NULL'];
    const params = [];
    if (clientId) {
      conditions.push('p.client_id = ?');
      params.push(clientId);
    }
    if (activeOnly) {
      conditions.push(`p.status IN ('Planning', 'Quoted', 'Onboarding', 'In Progress', 'Review', 'Client Approval')`);
    } else if (status && status !== 'All') {
      conditions.push('p.status = ?');
      params.push(status);
    }
    if (q) {
      conditions.push('(LOWER(p.name) LIKE ? OR LOWER(p.project_type) LIKE ? OR LOWER(c.business_name) LIKE ?)');
      const pat = `%${q}%`;
      params.push(pat, pat, pat);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const countRow = await db
      .prepare(`SELECT COUNT(*) AS total FROM projects p LEFT JOIN clients c ON c.id = p.client_id ${whereClause}`)
      .bind(...params)
      .first();

    const rows = await db
      .prepare(
        `SELECT p.*,
                c.business_name AS client_business,
                c.name AS client_name,
                (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.archived_at IS NULL) AS total_tasks,
                (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.archived_at IS NULL AND t.status IN ('Done', 'Completed')) AS completed_tasks,
                (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id = p.id AND m.archived_at IS NULL) AS total_milestones,
                (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id = p.id AND m.archived_at IS NULL AND m.status = 'Completed') AS completed_milestones
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
         ${whereClause}
         ORDER BY p.updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all();

    return jsonResponse({
      success: true,
      projects: rows.results || [],
      total: Number(countRow?.total || 0),
      page,
      limit
    });
  } catch (err) {
    console.error('[HQ Projects GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve projects');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const name = cleanString(body.name ?? body.title, 200);
  const clientId = cleanString(body.client_id ?? body.clientId, 128);
  if (!name) return errorResponse(400, 'INVALID_INPUT', 'Project name is required');
  if (!clientId) return errorResponse(400, 'INVALID_INPUT', 'Customer (client_id) is required for every project');

  const db = env.HQ_DB;
  const client = await db.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse(404, 'NOT_FOUND', 'Linked customer not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status = PROJECT_STATUSES.includes(body.status) ? body.status : 'Planning';
  const priority = PRIORITIES.includes(body.priority) ? body.priority : 'Medium';
  const quotedMinor = Math.max(
    0,
    Math.round(Number(body.quoted_amount_minor ?? body.quotedAmountMinor ?? body.budget ?? 0) || 0)
  );

  try {
    await db
      .prepare(
        `INSERT INTO projects (
          id, client_id, name, project_type, status, priority, summary, scope_markdown,
          start_date, target_date, currency, quoted_amount_minor, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        clientId,
        name,
        cleanString(body.project_type ?? body.projectType ?? 'Website Build', 100),
        status,
        priority,
        cleanString(body.summary ?? body.description, 4000),
        cleanString(body.scope_markdown ?? body.scopeMarkdown, 8000),
        cleanString(body.start_date ?? body.startDate, 40) || null,
        cleanString(body.target_date ?? body.targetDate, 40) || null,
        cleanString(body.currency || 'INR', 10).toUpperCase(),
        quotedMinor,
        auth.owner.uid,
        auth.owner.uid,
        nowIso,
        nowIso
      )
      .run();

    const created = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'PROJECT_CREATED',
      entityType: 'projects',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: created
    });

    return jsonResponse({ success: true, project: created }, 201);
  } catch (err) {
    console.error('[HQ Projects POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create project');
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Project ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Project not found');

  const nextStatus = PROJECT_STATUSES.includes(body.status) ? body.status : existing.status;
  const nextPriority = PRIORITIES.includes(body.priority) ? body.priority : existing.priority;
  const nowIso = new Date().toISOString();
  const completedAt =
    nextStatus === 'Completed' ? existing.completed_at || nowIso : nextStatus !== existing.status ? null : existing.completed_at;
  const quotedMinor =
    body.quoted_amount_minor !== undefined || body.quotedAmountMinor !== undefined || body.budget !== undefined
      ? Math.max(0, Math.round(Number(body.quoted_amount_minor ?? body.quotedAmountMinor ?? body.budget) || 0))
      : existing.quoted_amount_minor;

  const nextClientId = cleanString(body.client_id ?? body.clientId ?? existing.client_id, 128);
  if (nextClientId !== existing.client_id) {
    const c = await db.prepare(`SELECT id FROM clients WHERE id = ?`).bind(nextClientId).first();
    if (!c) return errorResponse(404, 'NOT_FOUND', 'Target customer not found');
  }

  await db
    .prepare(
      `UPDATE projects
       SET client_id = ?, name = ?, project_type = ?, status = ?, priority = ?, summary = ?,
           scope_markdown = ?, start_date = ?, target_date = ?, completed_at = ?, currency = ?,
           quoted_amount_minor = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      nextClientId,
      cleanString(body.name ?? body.title ?? existing.name, 200),
      cleanString(body.project_type ?? body.projectType ?? existing.project_type, 100),
      nextStatus,
      nextPriority,
      cleanString(body.summary ?? body.description ?? existing.summary, 4000),
      cleanString(body.scope_markdown ?? body.scopeMarkdown ?? existing.scope_markdown, 8000),
      body.start_date !== undefined ? cleanString(body.start_date, 40) || null : existing.start_date,
      body.target_date !== undefined ? cleanString(body.target_date, 40) || null : existing.target_date,
      completedAt,
      cleanString(body.currency ?? existing.currency, 10).toUpperCase(),
      quotedMinor,
      auth.owner.uid,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'PROJECT_UPDATED',
    entityType: 'projects',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: existing,
    after: updated
  });

  return jsonResponse({ success: true, project: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Project ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Project not found');

  await db.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'PROJECT_DELETED',
    entityType: 'projects',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: existing
  });

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
