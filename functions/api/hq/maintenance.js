// functions/api/hq/maintenance.js
// Studio HQ Maintenance Contracts & Retainer Tracking API
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

export const CANONICAL_MAINTENANCE_STATUSES = new Set(['proposed', 'active', 'paused', 'cancelled', 'expired']);
export const CANONICAL_BILLING_CYCLES = new Set(['monthly', 'quarterly', 'half-yearly', 'yearly', 'one-time']);

/**
 * Normalizes input status to canonical maintenance_plans status constraint.
 */
function normalizeMaintenanceStatus(rawStatus) {
  if (!rawStatus || typeof rawStatus !== 'string') return null;
  const clean = rawStatus.trim().toLowerCase();
  if (CANONICAL_MAINTENANCE_STATUSES.has(clean)) return clean;
  if (clean === 'expiring soon') return 'active';
  return null;
}

/**
 * Normalizes input billing cycle to canonical billing_cycle constraint.
 */
function normalizeBillingCycle(rawCycle) {
  if (!rawCycle || typeof rawCycle !== 'string') return 'monthly';
  const clean = rawCycle.trim().toLowerCase().replace(/\s+/g, '-');
  if (CANONICAL_BILLING_CYCLES.has(clean)) return clean;
  if (clean === 'annual') return 'yearly';
  if (clean === 'half_yearly') return 'half-yearly';
  if (clean === 'one_time') return 'one-time';
  return null;
}

/**
 * Validates a date string (YYYY-MM-DD or ISO 8601).
 */
function isValidDateStr(val) {
  if (!val || typeof val !== 'string') return false;
  const parsed = Date.parse(val);
  return !Number.isNaN(parsed);
}

/**
 * Validates fee_minor as a non-negative integer.
 */
function validateFeeMinor(val) {
  if (val === undefined || val === null) return { ok: true, value: 0 };
  if (typeof val === 'string' && val.trim() === '') {
    return { ok: false, error: 'Fee must be a valid non-negative integer' };
  }
  const num = Number(val);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
    return { ok: false, error: 'Fee must be a valid non-negative integer' };
  }
  return { ok: true, value: num };
}

/**
 * Maps a canonical maintenance_plans row to response shape with frontend compatibility aliases.
 */
function toMaintenanceRow(row) {
  return {
    id: row.id,
    client_id: row.client_id,
    project_id: row.project_id || null,
    client_business: row.client_business || '',
    client_name: row.client_name || '',
    project_name: row.project_name || '',
    // Canonical schema fields
    name: row.name,
    status: row.status,
    billing_cycle: row.billing_cycle,
    currency: row.currency || 'INR',
    fee_minor: row.fee_minor ?? 0,
    starts_on: row.starts_on || null,
    renews_on: row.renews_on || null,
    ends_on: row.ends_on || null,
    scope_markdown: row.scope_markdown || '',
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at || null,
    archived_by: row.archived_by || null,
    // Frontend compatibility aliases
    plan_name: row.name,
    amount_minor: row.fee_minor ?? 0,
    start_date: row.starts_on || '',
    expiry_date: row.ends_on || '',
    scope_notes: row.scope_markdown || '',
    last_maintenance_at: null
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const clientId = cleanString(url.searchParams.get('clientId'), 128);
  const projectId = cleanString(url.searchParams.get('projectId'), 128);
  const includeArchived = url.searchParams.get('includeArchived') === 'true';

  try {
    const conditions = [];
    const params = [];

    if (!includeArchived) {
      conditions.push('m.archived_at IS NULL');
    }
    if (clientId) {
      conditions.push('m.client_id = ?');
      params.push(clientId);
    }
    if (projectId) {
      conditions.push('m.project_id = ?');
      params.push(projectId);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = db.prepare(
      `SELECT m.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
       FROM maintenance_plans m
       JOIN clients c ON c.id = m.client_id
       LEFT JOIN projects p ON p.id = m.project_id
       ${whereClause}
       ORDER BY m.ends_on ASC, m.created_at DESC`
    );

    const rows = await stmt.bind(...params).all();
    const plans = (rows.results || []).map(toMaintenanceRow);

    return jsonResponse({ success: true, plans });
  } catch (err) {
    console.error('[HQ Maintenance GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve maintenance plans');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const clientId = cleanString(body.client_id || body.clientId, 128);
  const name = cleanString(body.name || body.plan_name || body.planName, 200);
  const startsOn = cleanString(body.starts_on || body.start_date || body.startDate, 50);
  const endsOn = cleanString(body.ends_on || body.expiry_date || body.expiryDate, 50);

  if (!clientId) {
    return errorResponse(400, 'INVALID_INPUT', 'Client ID is required');
  }
  if (!name) {
    return errorResponse(400, 'INVALID_INPUT', 'Plan name is required');
  }
  if (!startsOn || !isValidDateStr(startsOn)) {
    return errorResponse(400, 'INVALID_INPUT', 'A valid start date is required');
  }
  if (!endsOn || !isValidDateStr(endsOn)) {
    return errorResponse(400, 'INVALID_INPUT', 'A valid expiry/end date is required');
  }
  if (Date.parse(startsOn) > Date.parse(endsOn)) {
    return errorResponse(400, 'INVALID_INPUT', 'Start date must be before or equal to end date');
  }

  // Validate fee
  const rawFee = body.fee_minor ?? body.feeMinor ?? body.amount_minor ?? body.amountMinor ?? 0;
  const feeValidation = validateFeeMinor(rawFee);
  if (!feeValidation.ok) {
    return errorResponse(400, 'INVALID_INPUT', feeValidation.error);
  }

  // Validate status
  const rawStatus = body.status || 'proposed';
  const status = normalizeMaintenanceStatus(rawStatus);
  if (!status) {
    return errorResponse(400, 'INVALID_INPUT', `Invalid maintenance plan status: ${body.status}`);
  }

  // Validate billing cycle
  const rawCycle = body.billing_cycle || body.billingCycle || 'monthly';
  const billingCycle = normalizeBillingCycle(rawCycle);
  if (!billingCycle) {
    return errorResponse(400, 'INVALID_INPUT', `Invalid billing cycle: ${rawCycle}`);
  }

  const db = env.HQ_DB;

  try {
    // Verify client exists and is not archived
    const client = await db.prepare(`SELECT id FROM clients WHERE id = ? AND archived_at IS NULL`).bind(clientId).first();
    if (!client) {
      return errorResponse(404, 'NOT_FOUND', 'Client not found or archived');
    }

    // Verify project if supplied
    const projectId = cleanString(body.project_id || body.projectId, 128) || null;
    if (projectId) {
      const project = await db.prepare(`SELECT id FROM projects WHERE id = ? AND archived_at IS NULL`).bind(projectId).first();
      if (!project) {
        return errorResponse(404, 'NOT_FOUND', 'Project not found or archived');
      }
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const currency = cleanString(body.currency || 'INR', 3).toUpperCase();
    if (currency.length !== 3) {
      return errorResponse(400, 'INVALID_INPUT', 'Currency must be a 3-character ISO code');
    }

    const renewsOn = cleanString(body.renews_on || body.renewsOn, 50) || endsOn;
    const scopeMarkdown = cleanString(body.scope_markdown || body.scopeNotes || body.scope_notes, 5000) || '';

    await db
      .prepare(
        `INSERT INTO maintenance_plans (
          id, client_id, project_id, name, status, billing_cycle, currency, fee_minor,
          starts_on, renews_on, ends_on, scope_markdown, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        clientId,
        projectId,
        name,
        status,
        billingCycle,
        currency,
        feeValidation.value,
        startsOn,
        renewsOn,
        endsOn,
        scopeMarkdown,
        auth.owner.uid,
        nowIso,
        nowIso
      )
      .run();

    const created = await db
      .prepare(
        `SELECT m.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
         FROM maintenance_plans m
         JOIN clients c ON c.id = m.client_id
         LEFT JOIN projects p ON p.id = m.project_id
         WHERE m.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toMaintenanceRow(created);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'MAINTENANCE_PLAN_CREATED',
      entityType: 'maintenance_plans',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: resultRow
    });

    return jsonResponse({ success: true, plan: resultRow }, 201);
  } catch (err) {
    console.error('[HQ Maintenance POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create maintenance plan');
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Maintenance plan ID is required');

  const db = env.HQ_DB;

  try {
    const existing = await db.prepare(`SELECT * FROM maintenance_plans WHERE id = ?`).bind(id).first();
    if (!existing) {
      return errorResponse(404, 'NOT_FOUND', 'Maintenance plan not found');
    }
    if (existing.archived_at) {
      return errorResponse(400, 'INVALID_INPUT', 'Cannot update an archived maintenance plan');
    }

    const name = cleanString(body.name ?? body.plan_name ?? existing.name, 200);
    if (!name) {
      return errorResponse(400, 'INVALID_INPUT', 'Plan name cannot be empty');
    }

    // Validate dates
    const startsOn = cleanString(body.starts_on ?? body.start_date ?? existing.starts_on, 50);
    const endsOn = cleanString(body.ends_on ?? body.expiry_date ?? existing.ends_on, 50);
    if (startsOn && !isValidDateStr(startsOn)) {
      return errorResponse(400, 'INVALID_INPUT', 'Invalid start date format');
    }
    if (endsOn && !isValidDateStr(endsOn)) {
      return errorResponse(400, 'INVALID_INPUT', 'Invalid expiry/end date format');
    }
    if (startsOn && endsOn && Date.parse(startsOn) > Date.parse(endsOn)) {
      return errorResponse(400, 'INVALID_INPUT', 'Start date must be before or equal to end date');
    }

    // Validate fee
    let feeMinor = existing.fee_minor;
    const rawFee = body.fee_minor ?? body.feeMinor ?? body.amount_minor ?? body.amountMinor;
    if (rawFee !== undefined) {
      const feeVal = validateFeeMinor(rawFee);
      if (!feeVal.ok) return errorResponse(400, 'INVALID_INPUT', feeVal.error);
      feeMinor = feeVal.value;
    }

    // Validate status
    let status = existing.status;
    if (body.status !== undefined) {
      const normStatus = normalizeMaintenanceStatus(body.status);
      if (!normStatus) {
        return errorResponse(400, 'INVALID_INPUT', `Invalid maintenance plan status: ${body.status}`);
      }
      status = normStatus;
    }

    // Validate billing cycle
    let billingCycle = existing.billing_cycle;
    const rawCycle = body.billing_cycle ?? body.billingCycle;
    if (rawCycle !== undefined) {
      const normCycle = normalizeBillingCycle(rawCycle);
      if (!normCycle) {
        return errorResponse(400, 'INVALID_INPUT', `Invalid billing cycle: ${rawCycle}`);
      }
      billingCycle = normCycle;
    }

    const renewsOn = cleanString(body.renews_on ?? body.renewsOn ?? existing.renews_on, 50) || endsOn;
    const scopeMarkdown = cleanString(body.scope_markdown ?? body.scopeNotes ?? body.scope_notes ?? existing.scope_markdown, 5000);
    const nowIso = new Date().toISOString();

    await db
      .prepare(
        `UPDATE maintenance_plans
         SET name = ?, status = ?, billing_cycle = ?, fee_minor = ?, starts_on = ?,
             renews_on = ?, ends_on = ?, scope_markdown = ?, updated_at = ?
         WHERE id = ? AND archived_at IS NULL`
      )
      .bind(
        name,
        status,
        billingCycle,
        feeMinor,
        startsOn,
        renewsOn,
        endsOn,
        scopeMarkdown,
        nowIso,
        id
      )
      .run();

    const updated = await db
      .prepare(
        `SELECT m.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
         FROM maintenance_plans m
         JOIN clients c ON c.id = m.client_id
         LEFT JOIN projects p ON p.id = m.project_id
         WHERE m.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toMaintenanceRow(updated);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'MAINTENANCE_PLAN_UPDATED',
      entityType: 'maintenance_plans',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toMaintenanceRow(existing),
      after: resultRow
    });

    return jsonResponse({ success: true, plan: resultRow });
  } catch (err) {
    console.error('[HQ Maintenance PUT Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update maintenance plan');
  }
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = cleanString(new URL(request.url).searchParams.get('id'), 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Plan ID is required');

  const db = env.HQ_DB;

  try {
    const existing = await db.prepare(`SELECT * FROM maintenance_plans WHERE id = ?`).bind(id).first();
    if (!existing || existing.archived_at) {
      return errorResponse(404, 'NOT_FOUND', 'Maintenance plan not found or already archived');
    }

    const nowIso = new Date().toISOString();
    const result = await db
      .prepare(
        `UPDATE maintenance_plans
         SET archived_at = ?, archived_by = ?, updated_at = ?
         WHERE id = ? AND archived_at IS NULL`
      )
      .bind(nowIso, auth.owner.uid, nowIso, id)
      .run();

    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse(404, 'NOT_FOUND', 'Maintenance plan not found or already archived');
    }

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'MAINTENANCE_PLAN_ARCHIVED',
      entityType: 'maintenance_plans',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toMaintenanceRow(existing),
      after: { archived_at: nowIso, archived_by: auth.owner.uid }
    });

    return jsonResponse({ success: true, deletedId: id, archived: true });
  } catch (err) {
    console.error('[HQ Maintenance DELETE Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to archive maintenance plan');
  }
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
