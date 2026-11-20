// functions/api/hq/deployments.js
// Studio HQ Deployment & Release History Tracking API (Read/Record only; never triggers external infra mutations)
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

const VALID_ENVIRONMENTS = new Set(['preview', 'staging', 'production']);
const VALID_STATUSES = new Set(['pending', 'building', 'success', 'failed', 'rolled-back', 'cancelled']);

/**
 * Maps a canonical deployments table row (joined with projects/clients/repositories)
 * to the shape expected by Studio HQ frontend components while preserving canonical fields.
 */
function toDeploymentRow(row) {
  let versionTag = row.provider_deployment_id || 'v1.0.0';
  let releaseNotes = row.verification_notes || '';

  if (row.verification_notes && row.verification_notes.startsWith('{') && row.verification_notes.endsWith('}')) {
    try {
      const parsed = JSON.parse(row.verification_notes);
      if (parsed.version_tag) versionTag = parsed.version_tag;
      if (parsed.release_notes !== undefined) releaseNotes = parsed.release_notes;
    } catch {}
  }

  const s = (row.status || '').toLowerCase();
  let displayStatus = 'Pending';
  if (s === 'success') displayStatus = 'Succeeded';
  else if (s === 'failed') displayStatus = 'Failed';
  else if (s === 'building') displayStatus = 'Building';
  else if (s === 'rolled-back') displayStatus = 'Rolled Back';
  else if (s === 'cancelled') displayStatus = 'Cancelled';
  else displayStatus = row.status || 'Pending';

  return {
    id: row.id,
    project_id: row.project_id,
    repository_id: row.repository_id || null,
    client_id: row.client_id || '',
    client_business: row.client_business || '',
    project_name: row.project_name || '',
    repo_name: row.repository_full_name || '',
    // Canonical fields
    environment: row.environment,
    branch_name: row.branch_name || 'main',
    commit_sha: row.commit_sha || '',
    deployment_url: row.deployment_url || '',
    status: displayStatus,
    canonical_status: row.status,
    provider_deployment_id: row.provider_deployment_id || null,
    initiated_by: row.initiated_by,
    deployed_at: row.deployed_at || row.created_at,
    verified_by: row.verified_by || null,
    verified_at: row.verified_at || null,
    verification_notes: row.verification_notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    // Frontend compatibility aliases
    version_tag: versionTag,
    branch: row.branch_name || 'main',
    release_notes: releaseNotes,
    deployed_by: row.initiated_by
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const projectId = cleanString(url.searchParams.get('projectId'), 128);

  try {
    const conditions = [];
    const params = [];
    if (projectId) {
      conditions.push('d.project_id = ?');
      params.push(projectId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const stmt = db.prepare(
      `SELECT d.*, p.name AS project_name, p.client_id, c.business_name AS client_business, r.repository_full_name
       FROM deployments d
       JOIN projects p ON p.id = d.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN repositories r ON r.id = d.repository_id
       ${whereClause}
       ORDER BY d.deployed_at DESC, d.created_at DESC`
    );

    const rows = await stmt.bind(...params).all();
    const deployments = (rows.results || []).map(toDeploymentRow);

    return jsonResponse({ success: true, deployments });
  } catch (err) {
    console.error('[HQ Deployments GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve deployment records');
  }
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

  // Canonical repository linkage
  let repositoryId = cleanString(body.repository_id || body.repositoryId, 128) || null;
  if (repositoryId) {
    const repoExists = await db.prepare(`SELECT id, notes FROM repositories WHERE id = ?`).bind(repositoryId).first();
    if (!repoExists) repositoryId = null;
  }

  // Canonical environment validation
  let environment = cleanString(body.environment || 'production', 30).toLowerCase();
  if (!VALID_ENVIRONMENTS.has(environment)) {
    environment = 'production';
  }

  // Canonical status validation
  const rawStatus = cleanString(body.status || 'success', 40).toLowerCase();
  let canonicalStatus = 'success';
  if (rawStatus === 'succeeded' || rawStatus === 'success') {
    canonicalStatus = 'success';
  } else if (rawStatus === 'failed' || rawStatus === 'fail') {
    canonicalStatus = 'failed';
  } else if (VALID_STATUSES.has(rawStatus)) {
    canonicalStatus = rawStatus;
  }

  const branchName = cleanString(body.branch_name || body.branch || 'main', 80);
  const commitSha = cleanString(body.commit_sha || body.commitSha, 64) || null;
  const deploymentUrl = cleanString(body.deployment_url || body.deploymentUrl, 400) || null;
  const versionTag = cleanString(body.version_tag || body.versionTag || 'v1.0.0', 60);
  const releaseNotes = cleanString(body.release_notes || body.releaseNotes || body.verification_notes, 4000) || '';

  // Store version_tag and release_notes in verification_notes and provider_deployment_id
  const notesPayload = JSON.stringify({
    version_tag: versionTag,
    release_notes: releaseNotes
  });

  try {
    await db
      .prepare(
        `INSERT INTO deployments (
          id, project_id, repository_id, environment, status,
          branch_name, commit_sha, deployment_url, provider_deployment_id,
          initiated_by, deployed_at, verification_notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        projectId,
        repositoryId,
        environment,
        canonicalStatus,
        branchName,
        commitSha,
        deploymentUrl,
        versionTag,
        auth.owner.uid,
        deployedAt,
        notesPayload,
        nowIso,
        nowIso
      )
      .run();

    // If repository is linked, update its notes metadata safely without modifying schema
    if (repositoryId) {
      try {
        const repo = await db.prepare(`SELECT id, notes FROM repositories WHERE id = ?`).bind(repositoryId).first();
        if (repo) {
          let repoMeta = {};
          if (repo.notes && repo.notes.startsWith('{') && repo.notes.endsWith('}')) {
            try { repoMeta = JSON.parse(repo.notes); } catch {}
          }
          repoMeta.last_deployed_at = deployedAt;
          repoMeta.deployment_status = canonicalStatus === 'failed' ? 'Degraded' : 'Healthy';
          await db
            .prepare(`UPDATE repositories SET notes = ?, updated_at = ? WHERE id = ?`)
            .bind(JSON.stringify(repoMeta), nowIso, repositoryId)
            .run();
        }
      } catch (repoErr) {
        console.warn('[HQ Deployments] Repo metadata update warning:', repoErr);
      }
    }

    const createdRow = await db.prepare(
      `SELECT d.*, p.name AS project_name, p.client_id, c.business_name AS client_business, r.repository_full_name
       FROM deployments d
       JOIN projects p ON p.id = d.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN repositories r ON r.id = d.repository_id
       WHERE d.id = ?`
    ).bind(id).first();

    const created = toDeploymentRow(createdRow);

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
  } catch (err) {
    console.error('[HQ Deployments POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to log deployment');
  }
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Deployment ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM deployments WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Deployment record not found');

  try {
    const result = await db.prepare(`DELETE FROM deployments WHERE id = ?`).bind(id).run();
    if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Deployment record not found');

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'DEPLOYMENT_DELETED',
      entityType: 'deployments',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: { id, versionTag: existing.provider_deployment_id }
    });

    return jsonResponse({ success: true, deletedId: id });
  } catch (err) {
    console.error('[HQ Deployments DELETE Error]', err);
    return errorResponse(409, 'CONFLICT', 'Cannot delete deployment referenced by active approvals or QA checks');
  }
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, POST, DELETE, OPTIONS');
}
