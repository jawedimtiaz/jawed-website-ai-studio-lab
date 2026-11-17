// functions/api/hq/repositories.js
// Studio HQ GitHub Repositories Tracking API (Metadata only; never stores tokens)

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  const whereClause = projectId ? `WHERE r.project_id = ?` : '';
  const stmt = db.prepare(
    `SELECT r.*, c.business_name AS client_business, p.name AS project_name
     FROM repositories r
     JOIN clients c ON c.id = r.client_id
     JOIN projects p ON p.id = r.project_id
     ${whereClause}
     ORDER BY r.updated_at DESC`
  );
  const rows = projectId ? await stmt.bind(projectId).all() : await stmt.all();

  return jsonResponse({ success: true, repositories: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const projectId = cleanString(body.project_id || body.projectId, 128);
  const repoName = cleanString(body.repo_name || body.repoName, 200);
  const repoUrl = cleanString(body.repo_url || body.repoUrl, 400);
  if (!projectId || !repoName || !repoUrl) {
    return errorResponse(400, 'INVALID_INPUT', 'Project ID, repository name, and repository URL are required');
  }

  const db = env.HQ_DB;
  const project = await db.prepare(`SELECT id, client_id FROM projects WHERE id = ?`).bind(projectId).first();
  if (!project) return errorResponse(404, 'NOT_FOUND', 'Project not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO repositories (
        id, client_id, project_id, repo_name, repo_url, main_branch, dev_branch,
        hosting_platform, preview_url, production_url, deployment_status,
        last_deployed_at, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      project.client_id,
      projectId,
      repoName,
      repoUrl,
      cleanString(body.main_branch || body.mainBranch || 'main', 80),
      cleanString(body.dev_branch || body.devBranch || 'develop', 80),
      cleanString(body.hosting_platform || body.hostingPlatform || 'Cloudflare Workers', 100),
      cleanString(body.preview_url || body.previewUrl, 400),
      cleanString(body.production_url || body.productionUrl, 400),
      cleanString(body.deployment_status || body.deploymentStatus || 'Healthy', 60),
      cleanString(body.last_deployed_at || body.lastDeployedAt, 50) || null,
      cleanString(body.notes, 2000),
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM repositories WHERE id = ?`).bind(id).first();
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
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Repository not found');

  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `UPDATE repositories
       SET repo_name = ?, repo_url = ?, main_branch = ?, dev_branch = ?, hosting_platform = ?,
           preview_url = ?, production_url = ?, deployment_status = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      cleanString(body.repo_name ?? existing.repo_name, 200),
      cleanString(body.repo_url ?? existing.repo_url, 400),
      cleanString(body.main_branch ?? existing.main_branch, 80),
      cleanString(body.dev_branch ?? existing.dev_branch, 80),
      cleanString(body.hosting_platform ?? existing.hosting_platform, 100),
      cleanString(body.preview_url ?? existing.preview_url, 400),
      cleanString(body.production_url ?? existing.production_url, 400),
      cleanString(body.deployment_status ?? existing.deployment_status, 60),
      cleanString(body.notes ?? existing.notes, 2000),
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM repositories WHERE id = ?`).bind(id).first();
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
  const result = await db.prepare(`DELETE FROM repositories WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Repository not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
