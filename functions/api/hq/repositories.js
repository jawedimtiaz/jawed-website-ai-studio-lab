// functions/api/hq/repositories.js
// Studio HQ Git Repositories Tracking API (Metadata only; never stores tokens)
// Reconciled with Canonical Studio HQ Schema (0001_studio_hq_schema.sql)

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

const VALID_PROVIDERS = new Set(['github', 'gitlab', 'other']);
const VALID_VISIBILITIES = new Set(['public', 'private', 'internal']);

/**
 * Maps a canonical repositories table row (joined with projects/clients)
 * to the shape expected by Studio HQ frontend components while preserving canonical fields.
 */
function toRepositoryRow(row) {
  let meta = {};
  if (row.notes && row.notes.startsWith('{') && row.notes.endsWith('}')) {
    try {
      meta = JSON.parse(row.notes);
    } catch {}
  }

  const hostingPlatform = meta.hosting_platform || (row.provider === 'github' ? 'Cloudflare Workers' : (row.provider || 'GitHub'));

  return {
    id: row.id,
    project_id: row.project_id,
    client_id: row.client_id || '',
    client_business: row.client_business || '',
    project_name: row.project_name || '',
    // Canonical schema fields
    provider: row.provider || 'github',
    repository_full_name: row.repository_full_name,
    repository_url: row.repository_url,
    default_branch: row.default_branch || 'main',
    visibility: row.visibility || 'public',
    notes: typeof meta.user_notes === 'string' ? meta.user_notes : (row.notes && !row.notes.startsWith('{') ? row.notes : ''),
    archived_at: row.archived_at || null,
    archived_by: row.archived_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // Frontend compatibility aliases
    repo_name: row.repository_full_name,
    repo_url: row.repository_url,
    main_branch: row.default_branch || 'main',
    dev_branch: meta.dev_branch || 'develop',
    hosting_platform: hostingPlatform,
    preview_url: meta.preview_url || '',
    production_url: meta.production_url || '',
    deployment_status: meta.deployment_status || 'Healthy',
    last_deployed_at: meta.last_deployed_at || null
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const projectId = cleanString(url.searchParams.get('projectId'), 128);
  const includeArchived = url.searchParams.get('includeArchived') === 'true';

  try {
    const conditions = [];
    const params = [];

    if (!includeArchived) {
      conditions.push('r.archived_at IS NULL');
    }
    if (projectId) {
      conditions.push('r.project_id = ?');
      params.push(projectId);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = db.prepare(
      `SELECT r.*, p.name AS project_name, p.client_id, c.business_name AS client_business
       FROM repositories r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       ${whereClause}
       ORDER BY r.updated_at DESC`
    );

    const rows = await stmt.bind(...params).all();
    const repositories = (rows.results || []).map(toRepositoryRow);

    return jsonResponse({ success: true, repositories });
  } catch (err) {
    console.error('[HQ Repositories GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve repository records');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const projectId = cleanString(body.project_id || body.projectId, 128);
  const repoName = cleanString(body.repository_full_name || body.repo_name || body.repoName, 200);
  const repoUrl = cleanString(body.repository_url || body.repo_url || body.repoUrl, 400);

  if (!projectId || !repoName || !repoUrl) {
    return errorResponse(400, 'INVALID_INPUT', 'Project ID, repository name, and repository URL are required');
  }

  const db = env.HQ_DB;
  const project = await db.prepare(`SELECT id, client_id, name FROM projects WHERE id = ?`).bind(projectId).first();
  if (!project) return errorResponse(404, 'NOT_FOUND', 'Project not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  // Canonical fields
  let provider = cleanString(body.provider || 'github', 20).toLowerCase();
  if (!VALID_PROVIDERS.has(provider)) {
    provider = repoUrl.includes('gitlab.com') ? 'gitlab' : 'github';
  }

  const defaultBranch = cleanString(body.default_branch || body.main_branch || body.mainBranch || 'main', 80);
  let visibility = cleanString(body.visibility, 20).toLowerCase();
  if (!VALID_VISIBILITIES.has(visibility)) {
    visibility = 'public';
  }

  // Preserve frontend metadata (dev_branch, preview_url, production_url, hosting_platform) inside structured notes
  const meta = {
    dev_branch: cleanString(body.dev_branch || body.devBranch || 'develop', 80),
    hosting_platform: cleanString(body.hosting_platform || body.hostingPlatform || 'Cloudflare Workers', 100),
    preview_url: cleanString(body.preview_url || body.previewUrl, 400),
    production_url: cleanString(body.production_url || body.productionUrl, 400),
    deployment_status: cleanString(body.deployment_status || body.deploymentStatus || 'Healthy', 60),
    last_deployed_at: cleanString(body.last_deployed_at || body.lastDeployedAt, 50) || null,
    user_notes: cleanString(body.notes, 2000)
  };
  const notesJson = JSON.stringify(meta);

  try {
    await db
      .prepare(
        `INSERT INTO repositories (
          id, project_id, provider, repository_full_name, repository_url,
          default_branch, visibility, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        projectId,
        provider,
        repoName,
        repoUrl,
        defaultBranch,
        visibility,
        notesJson,
        nowIso,
        nowIso
      )
      .run();

    const createdRow = await db.prepare(
      `SELECT r.*, p.name AS project_name, p.client_id, c.business_name AS client_business
       FROM repositories r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE r.id = ?`
    ).bind(id).first();

    const created = toRepositoryRow(createdRow);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'REPOSITORY_LINKED',
      entityType: 'repositories',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: created
    });

    return jsonResponse({ success: true, repository: created }, 201);
  } catch (err) {
    console.error('[HQ Repositories POST Error]', err);
    if (String(err?.message || '').includes('UNIQUE')) {
      return errorResponse(409, 'CONFLICT', 'This repository is already linked to the project');
    }
    return errorResponse(500, 'SERVER_ERROR', 'Failed to link repository');
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Repository ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM repositories WHERE id = ?`).bind(id).first();
  if (!existing || existing.archived_at) return errorResponse(404, 'NOT_FOUND', 'Repository record not found');

  const nowIso = new Date().toISOString();
  const repoName = cleanString((body.repository_full_name || body.repo_name) ?? existing.repository_full_name, 200);
  const repoUrl = cleanString((body.repository_url || body.repo_url) ?? existing.repository_url, 400);
  const defaultBranch = cleanString((body.default_branch || body.main_branch) ?? existing.default_branch, 80);

  let provider = existing.provider;
  if (body.provider && VALID_PROVIDERS.has(String(body.provider).toLowerCase())) {
    provider = String(body.provider).toLowerCase();
  }

  let visibility = existing.visibility;
  if (body.visibility && VALID_VISIBILITIES.has(String(body.visibility).toLowerCase())) {
    visibility = String(body.visibility).toLowerCase();
  }

  let meta = {};
  if (existing.notes && existing.notes.startsWith('{') && existing.notes.endsWith('}')) {
    try { meta = JSON.parse(existing.notes); } catch {}
  }
  if (body.dev_branch !== undefined || body.devBranch !== undefined) {
    meta.dev_branch = cleanString(body.dev_branch || body.devBranch, 80);
  }
  if (body.hosting_platform !== undefined || body.hostingPlatform !== undefined) {
    meta.hosting_platform = cleanString(body.hosting_platform || body.hostingPlatform, 100);
  }
  if (body.preview_url !== undefined || body.previewUrl !== undefined) {
    meta.preview_url = cleanString(body.preview_url || body.previewUrl, 400);
  }
  if (body.production_url !== undefined || body.productionUrl !== undefined) {
    meta.production_url = cleanString(body.production_url || body.productionUrl, 400);
  }
  if (body.deployment_status !== undefined || body.deploymentStatus !== undefined) {
    meta.deployment_status = cleanString(body.deployment_status || body.deploymentStatus, 60);
  }
  if (body.notes !== undefined) {
    meta.user_notes = cleanString(body.notes, 2000);
  }

  await db
    .prepare(
      `UPDATE repositories
       SET repository_full_name = ?, repository_url = ?, default_branch = ?,
           provider = ?, visibility = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      repoName,
      repoUrl,
      defaultBranch,
      provider,
      visibility,
      JSON.stringify(meta),
      nowIso,
      id
    )
    .run();

  const updatedRow = await db.prepare(
    `SELECT r.*, p.name AS project_name, p.client_id, c.business_name AS client_business
     FROM repositories r
     JOIN projects p ON p.id = r.project_id
     LEFT JOIN clients c ON c.id = p.client_id
     WHERE r.id = ?`
  ).bind(id).first();

  const updated = toRepositoryRow(updatedRow);

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'REPOSITORY_UPDATED',
    entityType: 'repositories',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: { name: existing.repository_full_name },
    after: { name: updated.repository_full_name }
  });

  return jsonResponse({ success: true, repository: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Repository ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM repositories WHERE id = ?`).bind(id).first();
  if (!existing || existing.archived_at) return errorResponse(404, 'NOT_FOUND', 'Repository record not found');

  const nowIso = new Date().toISOString();

  // Canonical soft delete: record archived_at and archived_by
  await db
    .prepare(
      `UPDATE repositories
       SET archived_at = ?, archived_by = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(nowIso, auth.owner.uid, nowIso, id)
    .run();

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'REPOSITORY_UNLINKED',
    entityType: 'repositories',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: { name: existing.repository_full_name, archived_at: null },
    after: { name: existing.repository_full_name, archived_at: nowIso }
  });

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, POST, PUT, PATCH, DELETE, OPTIONS');
}
