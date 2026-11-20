// functions/api/hq/approvals.js
// Studio HQ Project & Client Approvals Workflow API
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

export const CANONICAL_APPROVAL_TYPES = new Set([
  'scope',
  'design',
  'content',
  'qa',
  'production-release',
  'handover',
  'other'
]);

export const CANONICAL_APPROVAL_STATUSES = new Set([
  'pending',
  'approved',
  'rejected',
  'withdrawn'
]);

/**
 * Normalizes input approval type / stage to canonical schema check constraint.
 */
function normalizeApprovalType(rawType) {
  if (!rawType || typeof rawType !== 'string') return null;
  const clean = rawType.trim().toLowerCase().replace(/\s+/g, '-');
  if (CANONICAL_APPROVAL_TYPES.has(clean)) return clean;

  // Frontend stage aliases
  switch (clean) {
    case 'requirements':
    case 'project-scope':
      return 'scope';
    case 'design-approval':
      return 'design';
    case 'content-approval':
      return 'content';
    case 'development-completion':
    case 'quality-assurance':
      return 'qa';
    case 'website-launch':
      return 'production-release';
    case 'final-delivery':
      return 'handover';
    default:
      return null;
  }
}

/**
 * Normalizes input status to canonical status constraint.
 */
function normalizeApprovalStatus(rawStatus) {
  if (!rawStatus || typeof rawStatus !== 'string') return null;
  const clean = rawStatus.trim().toLowerCase();
  if (CANONICAL_APPROVAL_STATUSES.has(clean)) return clean;

  if (clean === 'changes requested' || clean === 'changes-requested') return 'rejected';
  return null;
}

/**
 * Maps canonical approval_type to readable frontend stage label.
 */
function toStageLabel(approvalType) {
  switch (approvalType) {
    case 'scope': return 'Project Scope';
    case 'design': return 'Design Approval';
    case 'content': return 'Content Approval';
    case 'qa': return 'Quality Assurance';
    case 'production-release': return 'Website Launch';
    case 'handover': return 'Final Delivery';
    case 'other': default: return 'Other';
  }
}

/**
 * Maps a canonical approvals row (joined with projects/clients)
 * to response shape with frontend compatibility aliases.
 */
function toApprovalRow(row) {
  const stageLabel = toStageLabel(row.approval_type);
  const title = row.decision_note && !row.decision_note.includes('\n')
    ? row.decision_note
    : `${stageLabel} - ${row.project_name || 'Project'}`;

  return {
    id: row.id,
    project_id: row.project_id,
    deployment_id: row.deployment_id || null,
    approval_type: row.approval_type,
    status: row.status,
    requested_by: row.requested_by,
    requested_from_email: row.requested_from_email || '',
    decided_by: row.decided_by || null,
    decision_note: row.decision_note || '',
    requested_at: row.requested_at,
    decided_at: row.decided_at || null,
    evidence_url: row.evidence_url || '',
    // Joined relations
    client_id: row.client_id || '',
    client_business: row.client_business || '',
    client_name: row.client_name || '',
    project_name: row.project_name || '',
    // Frontend compatibility aliases
    stage: stageLabel,
    title,
    summary: row.decision_note || '',
    decision_notes: row.decision_note || '',
    reviewed_by: row.decided_by || ''
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const projectId = cleanString(url.searchParams.get('projectId'), 128);
  const statusParam = cleanString(url.searchParams.get('status'), 50);

  try {
    const conditions = [];
    const params = [];

    if (projectId) {
      conditions.push('a.project_id = ?');
      params.push(projectId);
    }
    if (statusParam && statusParam.toLowerCase() !== 'all') {
      const normStatus = normalizeApprovalStatus(statusParam);
      if (normStatus) {
        conditions.push('a.status = ?');
        params.push(normStatus);
      }
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = db.prepare(
      `SELECT a.*, p.name AS project_name, p.client_id, c.business_name AS client_business, c.name AS client_name
       FROM approvals a
       JOIN projects p ON p.id = a.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       ${whereClause}
       ORDER BY a.requested_at DESC`
    );

    const rows = await stmt.bind(...params).all();
    const approvals = (rows.results || []).map(toApprovalRow);

    return jsonResponse({ success: true, approvals });
  } catch (err) {
    console.error('[HQ Approvals GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve approval records');
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

  // Validate approval_type / stage
  const rawType = body.approval_type || body.approvalType || body.stage || 'scope';
  const approvalType = normalizeApprovalType(rawType);
  if (!approvalType) {
    return errorResponse(400, 'INVALID_INPUT', `Invalid approval_type: ${rawType}`);
  }

  // Validate status
  const rawStatus = body.status || 'pending';
  const status = normalizeApprovalStatus(rawStatus);
  if (!status) {
    return errorResponse(400, 'INVALID_INPUT', `Invalid approval status: ${body.status}`);
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

    // Validate decided_by if provided
    let decidedBy = cleanString(body.decided_by || body.decidedBy, 128) || null;
    let decidedAt = null;
    const nowIso = new Date().toISOString();

    if (decidedBy) {
      const user = await db.prepare(`SELECT uid FROM hq_users WHERE uid = ?`).bind(decidedBy).first();
      if (!user) {
        return errorResponse(400, 'INVALID_INPUT', 'Decided by user not found');
      }
      decidedAt = cleanString(body.decided_at || body.decidedAt, 50) || nowIso;
    } else if (status === 'approved' || status === 'rejected') {
      decidedBy = auth.owner.uid;
      decidedAt = nowIso;
    }

    // Validate requested_by
    let requestedBy = auth.owner.uid;
    if (body.requested_by || body.requestedBy) {
      const reqUid = cleanString(body.requested_by || body.requestedBy, 128);
      const user = await db.prepare(`SELECT uid FROM hq_users WHERE uid = ?`).bind(reqUid).first();
      if (!user) {
        return errorResponse(400, 'INVALID_INPUT', 'Requested by user not found');
      }
      requestedBy = reqUid;
    }

    const id = crypto.randomUUID();
    const requestedFromEmail = cleanString(body.requested_from_email || body.requestedFromEmail, 200) || null;
    const decisionNote = cleanString(body.decision_note || body.decision_notes || body.decisionNotes || body.title || body.summary, 3000) || null;
    const evidenceUrl = cleanString(body.evidence_url || body.evidenceUrl, 1000) || null;
    const requestedAt = cleanString(body.requested_at || body.requestedAt, 50) || nowIso;

    await db
      .prepare(
        `INSERT INTO approvals (
          id, project_id, deployment_id, approval_type, status,
          requested_by, requested_from_email, decided_by, decision_note,
          requested_at, decided_at, evidence_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        projectId,
        deploymentId,
        approvalType,
        status,
        requestedBy,
        requestedFromEmail,
        decidedBy,
        decisionNote,
        requestedAt,
        decidedAt,
        evidenceUrl
      )
      .run();

    const created = await db
      .prepare(
        `SELECT a.*, p.name AS project_name, p.client_id, c.business_name AS client_business, c.name AS client_name
         FROM approvals a
         JOIN projects p ON p.id = a.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE a.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toApprovalRow(created);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'APPROVAL_CREATED',
      entityType: 'approvals',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: resultRow
    });

    return jsonResponse({ success: true, approval: resultRow }, 201);
  } catch (err) {
    console.error('[HQ Approvals POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create approval record');
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Approval ID is required');

  const db = env.HQ_DB;

  try {
    const existing = await db
      .prepare(
        `SELECT a.*, p.name AS project_name, p.client_id, c.business_name AS client_business, c.name AS client_name
         FROM approvals a
         JOIN projects p ON p.id = a.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE a.id = ?`
      )
      .bind(id)
      .first();

    if (!existing) {
      return errorResponse(404, 'NOT_FOUND', 'Approval record not found');
    }

    // Validate status if updating
    let status = existing.status;
    if (body.status !== undefined) {
      const normStatus = normalizeApprovalStatus(body.status);
      if (!normStatus) {
        return errorResponse(400, 'INVALID_INPUT', `Invalid approval status: ${body.status}`);
      }
      status = normStatus;
    }

    // Validate approval_type if updating
    let approvalType = existing.approval_type;
    const rawType = body.approval_type ?? body.approvalType ?? body.stage;
    if (rawType !== undefined) {
      const normType = normalizeApprovalType(rawType);
      if (!normType) {
        return errorResponse(400, 'INVALID_INPUT', `Invalid approval_type: ${rawType}`);
      }
      approvalType = normType;
    }

    // Validate decided_by if provided
    let decidedBy = existing.decided_by;
    let decidedAt = existing.decided_at;
    const nowIso = new Date().toISOString();

    const rawDecidedBy = body.decided_by ?? body.decidedBy;
    if (rawDecidedBy !== undefined) {
      if (rawDecidedBy === null || rawDecidedBy === '') {
        decidedBy = null;
        decidedAt = null;
      } else {
        const cleanUid = cleanString(rawDecidedBy, 128);
        const user = await db.prepare(`SELECT uid FROM hq_users WHERE uid = ?`).bind(cleanUid).first();
        if (!user) {
          return errorResponse(400, 'INVALID_INPUT', 'Decided by user not found');
        }
        decidedBy = cleanUid;
        decidedAt = cleanString(body.decided_at ?? body.decidedAt, 50) || existing.decided_at || nowIso;
      }
    } else if (status === 'approved' || status === 'rejected') {
      if (!decidedBy) {
        decidedBy = auth.owner.uid;
        decidedAt = nowIso;
      }
    } else if (status === 'pending') {
      decidedBy = null;
      decidedAt = null;
    }

    const decisionNote = cleanString(
      body.decision_note ?? body.decision_notes ?? body.decisionNotes ?? body.summary ?? existing.decision_note,
      3000
    );
    const evidenceUrl = cleanString(body.evidence_url ?? body.evidenceUrl ?? existing.evidence_url, 1000);

    await db
      .prepare(
        `UPDATE approvals
         SET approval_type = ?, status = ?, decided_by = ?, decided_at = ?, decision_note = ?, evidence_url = ?
         WHERE id = ?`
      )
      .bind(
        approvalType,
        status,
        decidedBy,
        decidedAt,
        decisionNote,
        evidenceUrl,
        id
      )
      .run();

    const updated = await db
      .prepare(
        `SELECT a.*, p.name AS project_name, p.client_id, c.business_name AS client_business, c.name AS client_name
         FROM approvals a
         JOIN projects p ON p.id = a.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE a.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toApprovalRow(updated);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: `APPROVAL_${status.toUpperCase().replace(/\s+/g, '_')}`,
      entityType: 'approvals',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toApprovalRow(existing),
      after: resultRow
    });

    return jsonResponse({ success: true, approval: resultRow });
  } catch (err) {
    console.error('[HQ Approvals PUT Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update approval record');
  }
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = cleanString(new URL(request.url).searchParams.get('id'), 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Approval ID is required');

  const db = env.HQ_DB;

  try {
    const existing = await db
      .prepare(
        `SELECT a.*, p.name AS project_name, p.client_id, c.business_name AS client_business
         FROM approvals a
         JOIN projects p ON p.id = a.project_id
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE a.id = ?`
      )
      .bind(id)
      .first();

    if (!existing || existing.status === 'withdrawn') {
      return errorResponse(404, 'NOT_FOUND', 'Approval record not found or already withdrawn');
    }

    // Soft withdrawal rather than hard deletion to preserve historical trail
    await db.prepare(`UPDATE approvals SET status = 'withdrawn' WHERE id = ?`).bind(id).run();

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'APPROVAL_WITHDRAWN',
      entityType: 'approvals',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toApprovalRow(existing),
      after: { status: 'withdrawn' }
    });

    return jsonResponse({ success: true, deletedId: id, withdrawn: true });
  } catch (err) {
    console.error('[HQ Approvals DELETE Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to withdraw approval record');
  }
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
