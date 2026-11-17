// functions/api/hq/maintenance.js
// Studio HQ Maintenance Contracts & Renewal Tracking API

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

const PLAN_STATUSES = ['Active', 'Expiring Soon', 'Expired', 'Paused', 'Cancelled'];

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const clientId = new URL(request.url).searchParams.get('clientId') || '';
  const whereClause = clientId ? `WHERE m.client_id = ?` : '';
  const stmt = db.prepare(
    `SELECT m.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
     FROM maintenance_plans m
     JOIN clients c ON c.id = m.client_id
     LEFT JOIN projects p ON p.id = m.project_id
     ${whereClause}
     ORDER BY m.expiry_date ASC`
  );
  const rows = clientId ? await stmt.bind(clientId).all() : await stmt.all();

  return jsonResponse({ success: true, plans: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const clientId = cleanString(body.client_id || body.clientId, 128);
  const planName = cleanString(body.plan_name || body.planName, 200);
  const startDate = cleanString(body.start_date || body.startDate, 30);
  const expiryDate = cleanString(body.expiry_date || body.expiryDate, 30);
  if (!clientId || !planName || !startDate || !expiryDate) {
    return errorResponse(400, 'INVALID_INPUT', 'Customer, plan name, start date, and expiry date are required');
  }

  const db = env.HQ_DB;
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status = PLAN_STATUSES.includes(body.status) ? body.status : 'Active';

  await db
    .prepare(
      `INSERT INTO maintenance_plans (
        id, client_id, project_id, plan_name, billing_cycle, amount_minor, currency,
        status, start_date, expiry_date, renewal_reminder_days, scope_notes,
        last_maintenance_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      clientId,
      cleanString(body.project_id || body.projectId, 128) || null,
      planName,
      cleanString(body.billing_cycle || body.billingCycle || 'Monthly', 40),
      Math.max(0, Math.round(Number(body.amount_minor ?? body.amountMinor ?? 0) || 0)),
      cleanString(body.currency || 'INR', 10).toUpperCase(),
      status,
      startDate,
      expiryDate,
      Math.max(1, Math.min(180, Math.round(Number(body.renewal_reminder_days ?? 14) || 14))),
      cleanString(body.scope_notes || body.scopeNotes, 2000),
      cleanString(body.last_maintenance_at, 50) || null,
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM maintenance_plans WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'MAINTENANCE_PLAN_CREATED',
    entityType: 'maintenance_plans',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, plan: created }, 201);
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Plan ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM maintenance_plans WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Maintenance plan not found');

  const nowIso = new Date().toISOString();
  const status = PLAN_STATUSES.includes(body.status) ? body.status : existing.status;

  await db
    .prepare(
      `UPDATE maintenance_plans
       SET plan_name = ?, billing_cycle = ?, amount_minor = ?, status = ?, start_date = ?,
           expiry_date = ?, scope_notes = ?, last_maintenance_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      cleanString(body.plan_name ?? existing.plan_name, 200),
      cleanString(body.billing_cycle ?? existing.billing_cycle, 40),
      body.amount_minor !== undefined ? Math.max(0, Math.round(Number(body.amount_minor) || 0)) : existing.amount_minor,
      status,
      cleanString(body.start_date ?? existing.start_date, 30),
      cleanString(body.expiry_date ?? existing.expiry_date, 30),
      cleanString(body.scope_notes ?? existing.scope_notes, 2000),
      body.logMaintenance === true ? nowIso : existing.last_maintenance_at,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM maintenance_plans WHERE id = ?`).bind(id).first();
  return jsonResponse({ success: true, plan: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Plan ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM maintenance_plans WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Plan not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
