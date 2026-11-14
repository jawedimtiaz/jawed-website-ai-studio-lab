import {
  authorizeHqOwner,
  hqJson,
  readHqJson,
  requireHqDatabase,
  ownerAuthorizationGuardStatement,
  auditStatement,
  conditionalAuditStatement
} from '../../lib/hqApi.js';
import { checkHqRateLimit } from '../../lib/hqRateLimit.js';

const APPROVAL_TYPES = new Set(['scope','design','content','qa','production-release','handover','other']);
const APPROVAL_DECISIONS = new Set(['approved','rejected','withdrawn']);
const QA_CATEGORIES = new Set(['functionality','responsive','accessibility','seo','performance','security','browser','content','backup','other']);
const QA_RESULTS = new Set(['not-run','pass','fail','blocked','not-applicable']);

function text(value, max, field, required = false) {
  if (value === undefined || value === null) return required ? { ok: false, error: field + '_REQUIRED' } : { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: field + '_MUST_BE_TEXT' };
  const clean = value.trim();
  if (required && clean.length < 2) return { ok: false, error: field + '_REQUIRED' };
  if (clean.length > max) return { ok: false, error: field + '_TOO_LONG' };
  return { ok: true, value: clean || null };
}

export function validEvidenceUrl(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || value.length > 1000) return { ok: false, error: 'EVIDENCE_URL_INVALID' };
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('invalid');
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, error: 'EVIDENCE_URL_INVALID' };
  }
}

async function projectExists(db, projectId) {
  return db.prepare('SELECT id FROM projects WHERE id = ? AND archived_at IS NULL').bind(projectId).first();
}

export function validateApproval(input) {
  const allowed = new Set(['approval_type','requested_from_email','evidence_url']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) return { ok: false, error: 'FIELD_NOT_ALLOWED' };
  if (typeof input.approval_type !== 'string' || !APPROVAL_TYPES.has(input.approval_type)) return { ok: false, error: 'APPROVAL_TYPE_INVALID' };
  let requestedFrom = null;
  if ('requested_from_email' in input && input.requested_from_email) {
    const result = text(input.requested_from_email, 254, 'REQUESTED_FROM_EMAIL', true);
    if (!result.ok || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.value || '')) return { ok: false, error: 'REQUESTED_FROM_EMAIL_INVALID' };
    requestedFrom = result.value;
  }
  const evidence = validEvidenceUrl(input.evidence_url);
  if (!evidence.ok) return evidence;
  return { ok: true, value: { approval_type: input.approval_type, requested_from_email: requestedFrom, evidence_url: evidence.value } };
}

export function validateQaCheck(input, partial = false) {
  const allowed = new Set(['category','check_name','result','evidence_url','notes']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) return { ok: false, error: 'FIELD_NOT_ALLOWED' };
  const out = {};
  if ('category' in input) {
    if (typeof input.category !== 'string' || !QA_CATEGORIES.has(input.category)) return { ok: false, error: 'QA_CATEGORY_INVALID' };
    out.category = input.category;
  } else if (!partial) return { ok: false, error: 'QA_CATEGORY_REQUIRED' };
  if ('check_name' in input) {
    const result = text(input.check_name, 200, 'CHECK_NAME', true);
    if (!result.ok) return result;
    out.check_name = result.value;
  } else if (!partial) return { ok: false, error: 'CHECK_NAME_REQUIRED' };
  if ('result' in input) {
    if (typeof input.result !== 'string' || !QA_RESULTS.has(input.result)) return { ok: false, error: 'QA_RESULT_INVALID' };
    out.result = input.result;
  }
  if ('notes' in input) {
    const result = text(input.notes, 4000, 'NOTES');
    if (!result.ok) return result;
    out.notes = result.value;
  }
  if ('evidence_url' in input) {
    const result = validEvidenceUrl(input.evidence_url);
    if (!result.ok) return result;
    out.evidence_url = result.value;
  }
  return { ok: true, value: out };
}

async function listApprovals(request, db, projectId) {
  if (!await projectExists(db, projectId)) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  const result = await db.prepare('SELECT * FROM approvals WHERE project_id = ? ORDER BY requested_at DESC').bind(projectId).all();
  return hqJson({ ok: true, approvals: result.results || [] });
}

async function createApproval(request, db, identity, projectId) {
  if (!await projectExists(db, projectId)) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateApproval(parsed.value);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const data = valid.value;
  const id = crypto.randomUUID();
  const insert = db.prepare(`INSERT INTO approvals
    (id, project_id, approval_type, status, requested_by, requested_from_email, requested_at, evidence_url)
    VALUES (?, ?, ?, 'pending', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?)
    RETURNING id, project_id, approval_type, status, requested_from_email, requested_at, evidence_url`)
    .bind(id, projectId, data.approval_type, identity.uid, data.requested_from_email, data.evidence_url);
  const results = await db.batch([
    ownerAuthorizationGuardStatement(db, identity),
    insert,
    auditStatement(db, identity, 'approval.request', 'approval', id, crypto.randomUUID(), null,
      { project_id: projectId, approval_type: data.approval_type, status: 'pending' })
  ]);
  const row = results?.[1]?.results?.[0] || null;
  return row ? hqJson({ ok: true, approval: row }, 201) : hqJson({ ok: false, error: 'APPROVAL_CREATE_FAILED' }, 500);
}

async function decideApproval(request, db, identity, approvalId) {
  const existing = await db.prepare(
    `SELECT a.*, p.id AS parent_project_id, p.archived_at AS project_archived_at
     FROM approvals a
     LEFT JOIN projects p ON p.id = a.project_id
     WHERE a.id = ?`
  ).bind(approvalId).first();
  if (!existing) return hqJson({ ok: false, error: 'APPROVAL_NOT_FOUND' }, 404);
  if (!existing.parent_project_id || existing.project_archived_at) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  if (existing.status !== 'pending') return hqJson({ ok: false, error: 'APPROVAL_ALREADY_DECIDED' }, 409);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const allowed = new Set(['status','decision_note']);
  for (const key of Object.keys(parsed.value)) if (!allowed.has(key)) return hqJson({ ok: false, error: 'FIELD_NOT_ALLOWED' }, 400);
  if (!APPROVAL_DECISIONS.has(parsed.value.status)) return hqJson({ ok: false, error: 'APPROVAL_DECISION_INVALID' }, 400);
  const note = text(parsed.value.decision_note, 2000, 'DECISION_NOTE');
  if (!note.ok) return hqJson({ ok: false, error: note.error }, 400);
  const update = db.prepare(`UPDATE approvals SET status = ?, decision_note = ?, decided_by = ?,
    decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? AND status = 'pending'
      AND EXISTS (SELECT 1 FROM projects WHERE id = approvals.project_id AND archived_at IS NULL)`)
    .bind(parsed.value.status, note.value, identity.uid, approvalId);
  const results = await db.batch([
    ownerAuthorizationGuardStatement(db, identity),
    update,
    conditionalAuditStatement(db, identity, 'approval.decision', 'approval', approvalId, crypto.randomUUID(),
      { status: existing.status }, { status: parsed.value.status, decision_note: note.value })
  ]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) {
    const current = await db.prepare(
      `SELECT a.status, p.archived_at AS project_archived_at
       FROM approvals a
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.id = ?`
    ).bind(approvalId).first();
    if (current?.project_archived_at) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
    return hqJson({ ok: false, error: 'APPROVAL_ALREADY_DECIDED' }, 409);
  }
  return hqJson({ ok: true, approval: await db.prepare('SELECT * FROM approvals WHERE id = ?').bind(approvalId).first() });
}

async function listQaChecks(request, db, projectId) {
  if (!await projectExists(db, projectId)) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  const result = await db.prepare('SELECT * FROM qa_checks WHERE project_id = ? ORDER BY category, check_name').bind(projectId).all();
  return hqJson({ ok: true, checks: result.results || [] });
}

async function createQaCheck(request, db, identity, projectId) {
  if (!await projectExists(db, projectId)) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateQaCheck(parsed.value);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const data = valid.value;
  const id = crypto.randomUUID();
  const result = data.result ?? 'not-run';
  const checked = result !== 'not-run' && result !== 'not-applicable';
  const insert = db.prepare(`INSERT INTO qa_checks
    (id, project_id, category, check_name, result, evidence_url, notes, checked_by, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id, project_id, category, check_name, result, evidence_url, notes, checked_by, checked_at`)
    .bind(id, projectId, data.category, data.check_name, result, data.evidence_url ?? null, data.notes ?? null,
      checked ? identity.uid : null, checked ? new Date().toISOString() : null);
  const results = await db.batch([
    ownerAuthorizationGuardStatement(db, identity),
    insert,
    auditStatement(db, identity, 'qa.create', 'qa_check', id, crypto.randomUUID(), null,
      { project_id: projectId, category: data.category, check_name: data.check_name, result })
  ]);
  const row = results?.[1]?.results?.[0] || null;
  return row ? hqJson({ ok: true, check: row }, 201) : hqJson({ ok: false, error: 'QA_CREATE_FAILED' }, 500);
}

async function updateQaCheck(request, db, identity, checkId) {
  const existing = await db.prepare(
    `SELECT q.*, p.id AS parent_project_id, p.archived_at AS project_archived_at
     FROM qa_checks q
     LEFT JOIN projects p ON p.id = q.project_id
     WHERE q.id = ?`
  ).bind(checkId).first();
  if (!existing) return hqJson({ ok: false, error: 'QA_CHECK_NOT_FOUND' }, 404);
  if (!existing.parent_project_id || existing.project_archived_at) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const valid = validateQaCheck(parsed.value, true);
  if (!valid.ok) return hqJson({ ok: false, error: valid.error }, 400);
  const fields = valid.value;
  const keys = Object.keys(fields);
  if (!keys.length) return hqJson({ ok: false, error: 'NO_VALID_FIELDS' }, 400);

  const { parent_project_id, project_archived_at, ...cleanExisting } = existing;

  // No-op detection: check if all submitted values match existing values
  const hasChanges = keys.some(key => {
    const existingVal = cleanExisting[key] ?? null;
    const newVal = fields[key] ?? null;
    return existingVal !== newVal;
  });

  if (!hasChanges) {
    // Return existing record without executing a redundant UPDATE or creating an audit entry
    return hqJson({ ok: true, check: cleanExisting });
  }

  const assignments = keys.map(key => key + ' = ?');
  if ('result' in fields) {
    const checked = fields.result !== 'not-run' && fields.result !== 'not-applicable';
    assignments.push('checked_by = ?', 'checked_at = ?');
    fields.__checked_by = checked ? identity.uid : null;
    fields.__checked_at = checked ? new Date().toISOString() : null;
    keys.push('__checked_by', '__checked_at');
  }
  assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  const values = keys.map(key => fields[key]);
  const update = db.prepare(`UPDATE qa_checks SET ${assignments.join(', ')}
    WHERE id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = qa_checks.project_id AND archived_at IS NULL)`)
    .bind(...values, checkId);
  const auditBefore = {};
  const auditAfter = {};
  for (const key of keys) {
    const auditKey = key === '__checked_by' ? 'checked_by' : key === '__checked_at' ? 'checked_at' : key;
    auditBefore[auditKey] = cleanExisting[auditKey] ?? null;
    auditAfter[auditKey] = fields[key] ?? null;
  }
  const results = await db.batch([
    ownerAuthorizationGuardStatement(db, identity),
    update,
    conditionalAuditStatement(db, identity, 'qa.update', 'qa_check', checkId, crypto.randomUUID(),
      auditBefore, auditAfter)
  ]);
  if ((results?.[1]?.meta?.changes ?? 0) !== 1) {
    const current = await db.prepare(
      `SELECT q.id, p.archived_at AS project_archived_at
       FROM qa_checks q
       LEFT JOIN projects p ON p.id = q.project_id
       WHERE q.id = ?`
    ).bind(checkId).first();
    if (current?.project_archived_at) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
    return hqJson({ ok: false, error: 'QA_CHECK_NOT_FOUND' }, 404);
  }
  return hqJson({ ok: true, check: await db.prepare('SELECT * FROM qa_checks WHERE id = ?').bind(checkId).first() });
}

export async function handleAuthorizedHqRelease({ request, env, segments, identity }) {
  const dbResult = requireHqDatabase(env);
  if (!dbResult.ok) return dbResult.response;
  const db = dbResult.db;
  try {
    if (['POST', 'PATCH'].includes(request.method)) {
      const rateLimit = await checkHqRateLimit(request, env, { type: 'write', uid: identity.uid });
      if (!rateLimit.ok) return rateLimit.response;
    }

    if (segments[0] === 'projects' && segments.length === 3) {
      const [, projectId, resource] = segments;
      if (!projectId || projectId.length > 80) return hqJson({ ok: false, error: 'PROJECT_NOT_FOUND' }, 404);
      if (resource === 'approvals') {
        if (request.method === 'GET') return await listApprovals(request, db, projectId);
        if (request.method === 'POST') return await createApproval(request, db, identity, projectId);
        return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { 'allow': 'GET, POST' });
      }
      if (resource === 'qa') {
        if (request.method === 'GET') return await listQaChecks(request, db, projectId);
        if (request.method === 'POST') return await createQaCheck(request, db, identity, projectId);
        return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { 'allow': 'GET, POST' });
      }
    }
    if (segments[0] === 'approvals' && segments.length === 2) {
      const approvalId = segments[1];
      if (!approvalId || approvalId.length > 80) return hqJson({ ok: false, error: 'APPROVAL_NOT_FOUND' }, 404);
      if (request.method === 'PATCH') {
        return await decideApproval(request, db, identity, approvalId);
      }
      return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { 'allow': 'PATCH' });
    }
    if (segments[0] === 'qa' && segments.length === 2) {
      const checkId = segments[1];
      if (!checkId || checkId.length > 80) return hqJson({ ok: false, error: 'QA_CHECK_NOT_FOUND' }, 404);
      if (request.method === 'PATCH') {
        return await updateQaCheck(request, db, identity, checkId);
      }
      return hqJson({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { 'allow': 'PATCH' });
    }
    return hqJson({ ok: false, error: 'NOT_FOUND' }, 404);
  } catch (error) {
    console.error('[Studio HQ] Approval/QA API operation failed');
    return hqJson({ ok: false, error: 'HQ_REQUEST_FAILED' }, 500);
  }
}

export async function handleHqRelease({ request, env, segments }) {
  const auth = await authorizeHqOwner(request, env);
  if (!auth.ok) return auth.response;
  return handleAuthorizedHqRelease({ request, env, segments, identity: auth.identity });
}
