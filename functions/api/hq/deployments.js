// functions/api/hq/deployments.js
// Studio HQ Deployment & Release History Tracking API (Read/Record only; never triggers external infra mutations)

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
  const whereClause = projectId ? `WHERE d.project_id = ?` : '';
  const stmt = db.prepare(
    `SELECT d.*, c.business_name AS client_business, p.name AS project_name, r.repo_name
     FROM deployments d
     JOIN clients c ON c.id = d.client_id
     JOIN projects p ON p.id = d.project_id
     LEFT JOIN repositories r ON r.id = d.repository_id
     ${whereClause}
     ORDER BY d.deployed_at DESC`
  );
  const rows = projectId ? await stmt.bind(projectId).all() : await stmt.all();

  return jsonResponse({ success: true, deployments: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const projectId = cleanString(body.project_id || body.projectId, 128);
  if (!projectId) return errorResponse(400, 'INVALID_INPUT', 'Project ID is required');

  const db = env.HQ_DB;
  const project = await db.prepare(`SELECT id, client_id FROM projects WHERE id = ?`).bind(projectId).first();
  if (!project) return errorResponse(404, 'NOT_FOUND', 'Project not found');

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const deployedAt = cleanString(body.deployed_at || body.deployedAt, 50) || nowIso;
  const repositoryId = cleanString(body.repository_id || body.repositoryId, 128) || null;
  const status = cleanString(body.status || 'Succeeded', 40);

  const stmts = [
    db
      .prepare(
        `INSERT INTO deployments (
          id, client_id, project_id, repository_id, environment, version_tag, branch,
          commit_sha, deployment_url, status, release_notes, deployed_by, deployed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        project.client_id,
        projectId,
        repositoryId,
        cleanString(body.environment || 'production', 40),
        cleanString(body.version_tag || body.versionTag || 'v1.0.0', 60),
        cleanString(body.branch || 'main', 80),
        cleanString(body.commit_sha || body.commitSha, 64),
        cleanString(body.deployment_url || body.deploymentUrl, 400),
        status,
        cleanString(body.release_notes || body.releaseNotes, 4000),
        auth.owner.email,
        deployedAt,
        nowIso
      )
  ];

  if (repositoryId) {
    stmts.push(
      db
        .prepare(`UPDATE repositories SET last_deployed_at = ?, deployment_status = ?, updated_at = ? WHERE id = ?`)
        .bind(deployedAt, status === 'Failed' ? 'Degraded' : 'Healthy', nowIso, repositoryId)
    );
  }

  await db.batch(stmts);
  const created = await db.prepare(`SELECT * FROM deployments WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'DEPLOYMENT_LOGGED',
    entityType: 'deployments',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, deployment: created }, 201);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Deployment ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM deployments WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Deployment record not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, POST, DELETE, OPTIONS');
}
