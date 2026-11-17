// functions/api/hq/expenses.js
// Studio HQ Business Expenses Tracking API

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
  const rows = await db
    .prepare(
      `SELECT e.*, c.business_name AS client_business, p.name AS project_name
       FROM expenses e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN projects p ON p.id = e.project_id
       ORDER BY e.incurred_date DESC, e.created_at DESC`
    )
    .all();

  return jsonResponse({ success: true, expenses: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const description = cleanString(body.description, 300);
  const amountMinor = Math.round(Number(body.amount_minor ?? body.amountMinor ?? 0));
  if (!description || !Number.isFinite(amountMinor) || amountMinor < 0) {
    return errorResponse(400, 'INVALID_INPUT', 'Expense description and valid amount are required');
  }

  const db = env.HQ_DB;
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO expenses (
        id, client_id, project_id, category, vendor, description, amount_minor,
        currency, incurred_date, billable, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Recorded', ?, ?, ?)`
    )
    .bind(
      id,
      cleanString(body.client_id || body.clientId, 128) || null,
      cleanString(body.project_id || body.projectId, 128) || null,
      cleanString(body.category || 'Infrastructure', 80),
      cleanString(body.vendor, 150),
      description,
      amountMinor,
      cleanString(body.currency || 'INR', 10).toUpperCase(),
      cleanString(body.incurred_date || body.incurredDate, 30) || nowIso.slice(0, 10),
      body.billable ? 1 : 0,
      auth.owner.uid,
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM expenses WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'EXPENSE_CREATED',
    entityType: 'expenses',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, expense: created }, 201);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Expense ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM expenses WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Expense not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, POST, DELETE, OPTIONS');
}
