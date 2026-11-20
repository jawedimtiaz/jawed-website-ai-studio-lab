// functions/api/hq/qa.js
// Studio HQ Quality Assurance & Defect Tracking API
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

export const CANONICAL_QA_CATEGORIES = new Set([
  'functionality',
  'responsive',
  'accessibility',
  'seo',
  'performance',
  'security',
  'browser',
  'content',
  'backup',
  'other'
]);

export const CANONICAL_QA_RESULTS = new Set([
  'not-run',
  'pass',
  'fail',
  'blocked',
  'not-applicable'
]);

/**
 * Normalizes input category to canonical category check constraint.
 */
function normalizeQaCategory(rawCategory) {
  if (!rawCategory || typeof rawCategory !== 'string') return null;
  const clean = rawCategory.trim().toLowerCase().replace(/\s+/g, '-');
  if (CANONICAL_QA_CATEGORIES.has(clean)) return clean;

  // Frontend category aliases
  switch (clean) {
    case 'functional-testing':
    case 'functional':
      return 'functionality';
    case 'mobile-responsiveness':
    case 'mobile':
      return 'responsive';
    case 'seo-checks':
      return 'seo';
    case 'accessibility-checks':
    case 'a11y':
      return 'accessibility';
    case 'security-checks':
      return 'security';
    case 'performance-checks':
      return 'performance';
    case 'browser-compatibility':
      return 'browser';
    case 'content-verification':
      return 'content';
    case 'backup-&-recovery':
    case 'backup-and-recovery':
      return 'backup';
    case 'deployment-readiness':
      return 'other';
    default:
      return null;
  }
}

/**
 * Normalizes input result / status to canonical result check constraint.
 */
function normalizeQaResult(rawResult) {
  if (!rawResult || typeof rawResult !== 'string') return null;
  const clean = rawResult.trim().toLowerCase().replace(/\s+/g, '-');
  if (CANONICAL_QA_RESULTS.has(clean)) return clean;

  if (clean === 'not-run' || clean === 'not_run') return 'not-run';
  if (clean === 'n/a' || clean === 'na') return 'not-applicable';
  return null;
}

/**
 * Maps canonical result to readable frontend status label.
 */
function toResultLabel(result) {
  switch (result) {
    case 'pass': return 'Pass';
    case 'fail': return 'Fail';
    case 'blocked': return 'Blocked';
    case 'not-applicable': return 'N/A';
    case 'not-run': default: return 'Not Run';
  }
}

/**
 * Maps canonical category to readable frontend category label.
 */
function toCategoryLabel(category) {
  switch (category) {
    case 'functionality': return 'Functional Testing';
    case 'responsive': return 'Mobile Responsiveness';
    case 'seo': return 'SEO Checks';
    case 'accessibility': return 'Accessibility Checks';
    case 'security': return 'Security Checks';
    case 'performance': return 'Performance Checks';
    case 'browser': return 'Browser Compatibility';
    case 'content': return 'Content Verification';
    case 'backup': return 'Backup & Recovery';
    case 'other': default: return 'Other';
  }
}

/**
 * Maps a canonical qa_checks row (joined with projects/clients)
 * to response shape with frontend compatibility aliases.
 */
function toQaRow(row) {
  const resultLabel = toResultLabel(row.result);
  const categoryLabel = toCategoryLabel(row.category);

  return {
    id: row.id,
    project_id: row.project_id,
    deployment_id: row.deployment_id || null,
    category: row.category,
    check_name: row.check_name,
    result: row.result,
    evidence_url: row.evidence_url || '',
    notes: row.notes || '',
    checked_by: row.checked_by || null,
    checked_at: row.checked_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // Joined relations
    client_id: row.client_id || '',
    client_business: row.client_business || '',
    client_name: row.client_name || '',
    project_name: row.project_name || '',
    // Frontend compatibility aliases
    title: row.check_name,
    status: resultLabel,
    severity: 'Medium',
    defect_description: row.notes || '',
    assigned_action: '',
    resolution_status: row.result === 'pass' ? 'Verified' : 'Open',
    tested_by: row.checked_by || '',
    tested_at: row.checked_at || null
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const projectId = cleanString(url.searchParams.get('projectId'), 128);
  const statusParam = cleanString(url.searchParams.get('status') || url.searchParams.get('result'), 50);
  const categoryParam = cleanString(url.searchParams.get('category'), 80);

  try {
    const conditions = [];
    const params = [];

    if (projectId) {
      conditions.push('q.project_id = ?');
      params.push(projectId);
    }
    if (statusParam && statusParam.toLowerCase() !== 'all') {
      const normResult = normalizeQaResult(statusParam);
      if (normResult) {
        conditions.push('q.result = ?');
        params.push(normResult);
      }
    }
    if (categoryParam && categoryParam.toLowerCase() !== 'all') {
      const normCat = normalizeQaCategory(categoryParam);
      if (normCat) {
        conditions.push('q.category = ?');
        params.push(normCat);
      }
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = db.prepare(
      `SELECT q.*, p.name AS project_name, p.client_id, c.business_name AS client_business, c.name AS client_name
       FROM qa_checks q
       JOIN projects p ON p.id = q.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       ${whereClause}
       ORDER BY q.updated_at DESC`
    );

    const rows = await stmt.bind(...params).all();
    const checks = (rows.results || []).map(toQaRow);

    return jsonResponse({ success: true, checks });
  } catch (err) {
    console.error('[HQ QA GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve QA check records');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const projectId = cleanString(body.project_id || body.projectId, 128);
  if (!projectId) {
    return errorResponse(400, 'INVALID_INPUT', 'Project ID is required');
  }

  const checkName = cleanString(body.check_name || body.title, 200);
  if (!checkName || checkName.trim().length === 0) {
    return errorResponse(400, 'INVALID_INPUT', 'Check name is required and cannot be empty');
  }

  // Validate category
  const rawCat = body.category || 'functionality';
  const category = normalizeQaCategory(rawCat);
  if (!category) {
    return errorResponse(400, 'INVALID_INPUT', `Invalid QA category: ${rawCat}`);
  }

  // Validate result / status
  const rawResult = body.result || body.status || 'not-run';
  const result = normalizeQaResult(rawResult);
  if (!result) {
    return errorResponse(400, 'INVALID_INPUT', `Invalid QA check result: ${rawResult}`);
  }

  const db = env.HQ_DB;

  try {
    // Validate project existence and active status
    const project = await db.prepare(`SELECT id, client_id FROM projects WHERE id = ? AND archived_at IS NULL`).bind(projectId).first();
    if (!project) {
      return errorResponse(404, 'NOT_FOUND', 'Project not found or archived');
    }

    // Validate deployment_id if provided
    const deploymentId = cleanString(body.deployment_id || body.deploymentId, 128) || null;
    if (deploymentId) {
      const dep = await db.prepare(`SELECT id FROM deployments WHERE id = ?`).bind(deploymentId).first();
      if (!dep) {
        return errorResponse(404, 'NOT_FOUND', 'Deployment not found');
      }
    }

    // Validate checked_by if provided
    let checkedBy = null;
    let checkedAt = null;
    const nowIso = new Date().toISOString();

    const rawCheckedBy = body.checked_by ?? body.checkedBy;
    if (rawCheckedBy) {
      const cleanUid = cleanString(rawCheckedBy, 128);
      const user = await db.prepare(`SELECT uid FROM hq_users WHERE uid = ?`).bind(cleanUid).first();
      if (!user) {
        return errorResponse(400, 'INVALID_INPUT', 'Checked by user not found');
      }
      checkedBy = cleanUid;
      checkedAt = cleanString(body.checked_at || body.checkedAt, 50) || nowIso;
    } else if (result !== 'not-run') {
      checkedBy = auth.owner.uid;
      checkedAt = nowIso;
    }

    const id = crypto.randomUUID();
    const evidenceUrl = cleanString(body.evidence_url || body.evidenceUrl, 1000) || null;
    const notes = cleanString(body.notes || body.defect_description || body.defectDescription, 3000) || null;

    await db
      .prepare(
        `INSERT INTO qa_checks (
          id, project_id, deployment_id, category, check_name, result,
          evidence_url, notes, checked_by, checked_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        projectId,
        deploymentId,
        category,
        checkName,
        result,
        evidenceUrl,
        notes,
        checkedBy,
        checkedAt,
        nowIso,
        nowIso
      )
      .run();

    const created = await db
      .prepare(
        `SELECT q.*, p.name AS project_name, p.client_id, c.business_name AS client_business, c.name AS client_name
         FROM qa_checks q
         JOIN projects p ON p.id = q.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE q.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toQaRow(created);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'QA_CHECK_CREATED',
      entityType: 'qa_checks',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: resultRow
    });

    return jsonResponse({ success: true, check: resultRow }, 201);
  } catch (err) {
    console.error('[HQ QA POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create QA check');
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'QA check ID is required');

  const db = env.HQ_DB;

  try {
    const existing = await db
      .prepare(
        `SELECT q.*, p.name AS project_name, p.client_id, c.business_name AS client_business, c.name AS client_name
         FROM qa_checks q
         JOIN projects p ON p.id = q.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE q.id = ?`
      )
      .bind(id)
      .first();

    if (!existing) {
      return errorResponse(404, 'NOT_FOUND', 'QA check not found');
    }

    // Validate check_name if updating
    let checkName = existing.check_name;
    const rawName = body.check_name ?? body.title;
    if (rawName !== undefined) {
      const cleanName = cleanString(rawName, 200);
      if (!cleanName || cleanName.trim().length === 0) {
        return errorResponse(400, 'INVALID_INPUT', 'Check name cannot be empty');
      }
      checkName = cleanName;
    }

    // Validate category if updating
    let category = existing.category;
    if (body.category !== undefined) {
      const normCat = normalizeQaCategory(body.category);
      if (!normCat) {
        return errorResponse(400, 'INVALID_INPUT', `Invalid QA category: ${body.category}`);
      }
      category = normCat;
    }

    // Validate result / status if updating
    let result = existing.result;
    const rawResult = body.result ?? body.status;
    if (rawResult !== undefined) {
      const normResult = normalizeQaResult(rawResult);
      if (!normResult) {
        return errorResponse(400, 'INVALID_INPUT', `Invalid QA check result: ${rawResult}`);
      }
      result = normResult;
    }

    // Validate checked_by if provided
    let checkedBy = existing.checked_by;
    let checkedAt = existing.checked_at;
    const nowIso = new Date().toISOString();

    const rawCheckedBy = body.checked_by ?? body.checkedBy;
    if (rawCheckedBy !== undefined) {
      if (rawCheckedBy === null || rawCheckedBy === '') {
        checkedBy = null;
        checkedAt = null;
      } else {
        const cleanUid = cleanString(rawCheckedBy, 128);
        const user = await db.prepare(`SELECT uid FROM hq_users WHERE uid = ?`).bind(cleanUid).first();
        if (!user) {
          return errorResponse(400, 'INVALID_INPUT', 'Checked by user not found');
        }
        checkedBy = cleanUid;
        checkedAt = cleanString(body.checked_at ?? body.checkedAt, 50) || existing.checked_at || nowIso;
      }
    } else if (result !== existing.result) {
      if (result !== 'not-run') {
        checkedBy = auth.owner.uid;
        checkedAt = nowIso;
      } else {
        checkedBy = null;
        checkedAt = null;
      }
    }

    const notes = cleanString(
      body.notes ?? body.defect_description ?? body.defectDescription ?? existing.notes,
      3000
    );
    const evidenceUrl = cleanString(body.evidence_url ?? body.evidenceUrl ?? existing.evidence_url, 1000);

    await db
      .prepare(
        `UPDATE qa_checks
         SET category = ?, check_name = ?, result = ?, evidence_url = ?,
             notes = ?, checked_by = ?, checked_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        category,
        checkName,
        result,
        evidenceUrl,
        notes,
        checkedBy,
        checkedAt,
        nowIso,
        id
      )
      .run();

    const updated = await db
      .prepare(
        `SELECT q.*, p.name AS project_name, p.client_id, c.business_name AS client_business, c.name AS client_name
         FROM qa_checks q
         JOIN projects p ON p.id = q.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE q.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toQaRow(updated);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'QA_CHECK_UPDATED',
      entityType: 'qa_checks',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toQaRow(existing),
      after: resultRow
    });

    return jsonResponse({ success: true, check: resultRow });
  } catch (err) {
    console.error('[HQ QA PUT Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update QA check');
  }
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = cleanString(new URL(request.url).searchParams.get('id'), 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'QA check ID is required');

  const db = env.HQ_DB;

  try {
    const existing = await db
      .prepare(
        `SELECT q.*, p.name AS project_name, p.client_id, c.business_name AS client_business
         FROM qa_checks q
         JOIN projects p ON p.id = q.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE q.id = ?`
      )
      .bind(id)
      .first();

    if (!existing) {
      return errorResponse(404, 'NOT_FOUND', 'QA check not found');
    }

    const result = await db.prepare(`DELETE FROM qa_checks WHERE id = ?`).bind(id).run();
    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse(404, 'NOT_FOUND', 'QA check not found');
    }

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'QA_CHECK_DELETED',
      entityType: 'qa_checks',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toQaRow(existing),
      after: null
    });

    return jsonResponse({ success: true, deletedId: id });
  } catch (err) {
    console.error('[HQ QA DELETE Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to delete QA check');
  }
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
