// functions/api/hq/proposals.js
// Studio HQ Client Proposals API Endpoint

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  nextSequenceNumber,
  auditLog
} from '../../lib/hqApi.js';

const PROPOSAL_STATUSES = ['Draft', 'Sent', 'Under Review', 'Accepted', 'Declined'];

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const clientId = new URL(request.url).searchParams.get('clientId') || '';

  try {
    const conditions = [];
    const params = [];
    if (clientId) {
      conditions.push('pr.client_id = ?');
      params.push(clientId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db
      .prepare(
        `SELECT pr.*, c.business_name AS client_business, c.name AS client_name,
                p.name AS project_name, q.quotation_number
         FROM proposals pr
         JOIN clients c ON c.id = pr.client_id
         LEFT JOIN projects p ON p.id = pr.project_id
         LEFT JOIN quotations q ON q.id = pr.quotation_id
         ${whereClause}
         ORDER BY pr.updated_at DESC`
      )
      .bind(...params)
      .all();

    return jsonResponse({ success: true, proposals: rows.results || [] });
  } catch (err) {
    console.error('[HQ Proposals GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve proposals');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const clientId = cleanString(body.client_id || body.clientId, 128);
  const title = cleanString(body.title, 200);
  if (!clientId || !title) {
    return errorResponse(400, 'INVALID_INPUT', 'Customer and proposal title are required');
  }

  const db = env.HQ_DB;
  const id = crypto.randomUUID();
  const proposalNumber = await nextSequenceNumber(db, 'proposal', 'PRP');
  const nowIso = new Date().toISOString();
  const status = PROPOSAL_STATUSES.includes(body.status) ? body.status : 'Draft';

  await db
    .prepare(
      `INSERT INTO proposals (
        id, proposal_number, client_id, project_id, quotation_id, title,
        executive_summary, scope_markdown, timeline_summary, deliverables,
        amount_minor, currency, status, valid_until, sent_at, accepted_at,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      proposalNumber,
      clientId,
      cleanString(body.project_id || body.projectId, 128) || null,
      cleanString(body.quotation_id || body.quotationId, 128) || null,
      title,
      cleanString(body.executive_summary || body.executiveSummary, 4000),
      cleanString(body.scope_markdown || body.scopeMarkdown, 8000),
      cleanString(body.timeline_summary || body.timelineSummary, 2000),
      cleanString(body.deliverables, 4000),
      Math.max(0, Math.round(Number(body.amount_minor ?? body.amountMinor ?? 0) || 0)),
      cleanString(body.currency || 'INR', 10).toUpperCase(),
      status,
      cleanString(body.valid_until || body.validUntil, 30) || null,
      status === 'Sent' ? nowIso : null,
      status === 'Accepted' ? nowIso : null,
      auth.owner.uid,
      nowIso,
      nowIso
    )
    .run();

  const created = await db.prepare(`SELECT * FROM proposals WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'PROPOSAL_CREATED',
    entityType: 'proposals',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, proposal: created }, 201);
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Proposal ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM proposals WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Proposal not found');

  const nextStatus = PROPOSAL_STATUSES.includes(body.status) ? body.status : existing.status;
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `UPDATE proposals
       SET title = ?, executive_summary = ?, scope_markdown = ?, timeline_summary = ?,
           deliverables = ?, amount_minor = ?, currency = ?, status = ?, valid_until = ?,
           sent_at = ?, accepted_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      cleanString(body.title ?? existing.title, 200),
      cleanString(body.executive_summary ?? existing.executive_summary, 4000),
      cleanString(body.scope_markdown ?? existing.scope_markdown, 8000),
      cleanString(body.timeline_summary ?? existing.timeline_summary, 2000),
      cleanString(body.deliverables ?? existing.deliverables, 4000),
      body.amount_minor !== undefined ? Math.max(0, Math.round(Number(body.amount_minor) || 0)) : existing.amount_minor,
      cleanString(body.currency ?? existing.currency, 10).toUpperCase(),
      nextStatus,
      body.valid_until !== undefined ? cleanString(body.valid_until, 30) || null : existing.valid_until,
      nextStatus === 'Sent' ? existing.sent_at || nowIso : existing.sent_at,
      nextStatus === 'Accepted' ? existing.accepted_at || nowIso : existing.accepted_at,
      nowIso,
      id
    )
    .run();

  const updated = await db.prepare(`SELECT * FROM proposals WHERE id = ?`).bind(id).first();
  return jsonResponse({ success: true, proposal: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Proposal ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM proposals WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Proposal not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
