// functions/api/hq/proposals.js
/**
 * Generates sequential quotation numbers using canonical financial_sequences
 * with robust fallback.
 */
async function generateProposalQuoteNumber(db) {
  const now = new Date();
  const year = now.getFullYear();
  const nextYearShort = String((year + 1) % 100).padStart(2, '0');
  const fy = `${year}-${nextYearShort}`;
  const prefix = 'QUO';
  const nowIso = now.toISOString();

  try {
    const existing = await db
      .prepare(`SELECT id, next_number FROM financial_sequences WHERE document_type = 'quotation' AND financial_year = ?`)
      .bind(fy)
      .first();

    if (existing) {
      const nextNum = Number(existing.next_number || 1);
      await db
        .prepare(`UPDATE financial_sequences SET next_number = next_number + 1, updated_at = ? WHERE id = ?`)
        .bind(nowIso, existing.id)
        .run();
      return `${prefix}-${fy.slice(2, 4)}${fy.slice(5, 7)}-${String(nextNum).padStart(4, '0')}`;
    } else {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO financial_sequences (id, document_type, prefix, financial_year, next_number, updated_at)
           VALUES (?, 'quotation', ?, ?, 2, ?)`
        )
        .bind(id, prefix, fy, nowIso)
        .run();
      return `${prefix}-${fy.slice(2, 4)}${fy.slice(5, 7)}-0001`;
    }
  } catch {
    const yr = String(year).slice(-2);
    return `QUO-${yr}-${Date.now().toString().slice(-6)}`;
  }
}
// Reconciled with Canonical Studio HQ Schema (0001_studio_hq_schema.sql)
// Semantically maps client proposals to canonical quotations table

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

const CANONICAL_QUOTE_STATUSES = new Set(['draft', 'sent', 'accepted', 'rejected', 'expired', 'withdrawn']);

/**
 * Normalizes input proposal status to canonical quotation status constraint.
 */
function normalizeProposalStatus(rawStatus) {
  if (!rawStatus || typeof rawStatus !== 'string') return 'draft';
  const clean = rawStatus.trim().toLowerCase();
  if (CANONICAL_QUOTE_STATUSES.has(clean)) return clean;
  if (clean === 'under review') return 'sent';
  if (clean === 'declined') return 'rejected';
  return 'draft';
}

/**
 * Maps a canonical quotation to a proposal representation.
 */
function toProposalRow(q) {
  let displayStatus = 'Draft';
  switch (q.status) {
    case 'draft': displayStatus = 'Draft'; break;
    case 'sent': displayStatus = 'Sent'; break;
    case 'accepted': displayStatus = 'Accepted'; break;
    case 'rejected': displayStatus = 'Declined'; break;
    case 'expired': displayStatus = 'Expired'; break;
    case 'withdrawn': displayStatus = 'Withdrawn'; break;
    default: displayStatus = q.status; break;
  }

  const title = q.terms_markdown && !q.terms_markdown.includes('\n')
    ? q.terms_markdown
    : q.terms_markdown
      ? q.terms_markdown.split('\n')[0]
      : `Proposal ${q.quote_number}`;

  return {
    id: q.id,
    proposal_number: q.quote_number,
    quotation_number: q.quote_number,
    quotation_id: q.id,
    client_id: q.client_id,
    project_id: q.project_id || null,
    client_business: q.client_business || '',
    client_name: q.client_name || '',
    project_name: q.project_name || '',
    title,
    executive_summary: q.terms_markdown || '',
    scope_markdown: q.terms_markdown || '',
    timeline_summary: '',
    deliverables: '',
    amount_minor: q.total_minor ?? 0,
    currency: q.currency || 'INR',
    status: displayStatus,
    canonical_status: q.status,
    valid_until: q.valid_until || null,
    sent_at: q.status === 'sent' || q.status === 'accepted' ? q.updated_at : null,
    accepted_at: q.status === 'accepted' ? q.updated_at : null,
    created_by: q.created_by,
    created_at: q.created_at,
    updated_at: q.updated_at,
    archived_at: q.archived_at || null,
    archived_by: q.archived_by || null
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const clientId = cleanString(url.searchParams.get('clientId'), 128);
  const projectId = cleanString(url.searchParams.get('projectId'), 128);

  try {
    const conditions = ['q.archived_at IS NULL'];
    const params = [];

    if (clientId) {
      conditions.push('q.client_id = ?');
      params.push(clientId);
    }
    if (projectId) {
      conditions.push('q.project_id = ?');
      params.push(projectId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const rows = await db
      .prepare(
        `SELECT q.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
         FROM quotations q
         JOIN clients c ON c.id = q.client_id
         LEFT JOIN projects p ON p.id = q.project_id
         ${whereClause}
         ORDER BY q.updated_at DESC`
      )
      .bind(...params)
      .all();

    const proposals = (rows.results || []).map(toProposalRow);

    return jsonResponse({ success: true, proposals });
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
    return errorResponse(400, 'INVALID_INPUT', 'Client ID and proposal title are required');
  }

  const db = env.HQ_DB;

  try {
    // Validate client
    const client = await db.prepare(`SELECT id FROM clients WHERE id = ? AND archived_at IS NULL`).bind(clientId).first();
    if (!client) {
      return errorResponse(404, 'NOT_FOUND', 'Client not found or archived');
    }

    // Validate project if provided
    const projectId = cleanString(body.project_id || body.projectId, 128) || null;
    if (projectId) {
      const project = await db.prepare(`SELECT id FROM projects WHERE id = ? AND archived_at IS NULL`).bind(projectId).first();
      if (!project) {
        return errorResponse(404, 'NOT_FOUND', 'Project not found or archived');
      }
    }

    const id = crypto.randomUUID();
    const quoteNumber = await generateProposalQuoteNumber(db);
    const nowIso = new Date().toISOString();
    const status = normalizeProposalStatus(body.status);

    const amountMinor = Math.max(0, Math.round(Number(body.amount_minor ?? body.amountMinor ?? 0) || 0));
    const currency = cleanString(body.currency || 'INR', 3).toUpperCase();
    const validUntil = cleanString(body.valid_until || body.validUntil, 30) || null;

    const termsMarkdown = title + (body.executive_summary ? `\n\n${cleanString(body.executive_summary, 4000)}` : '');

    await db
      .prepare(
        `INSERT INTO quotations (
          id, quote_number, client_id, project_id, status, currency,
          subtotal_minor, tax_minor, total_minor, valid_until, terms_markdown,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        quoteNumber,
        clientId,
        projectId,
        status,
        currency,
        amountMinor,
        amountMinor,
        validUntil,
        termsMarkdown,
        auth.owner.uid,
        nowIso,
        nowIso
      )
      .run();

    const created = await db
      .prepare(
        `SELECT q.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
         FROM quotations q
         JOIN clients c ON c.id = q.client_id
         LEFT JOIN projects p ON p.id = q.project_id
         WHERE q.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toProposalRow(created);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'PROPOSAL_CREATED',
      entityType: 'quotations',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: resultRow
    });

    return jsonResponse({ success: true, proposal: resultRow }, 201);
  } catch (err) {
    console.error('[HQ Proposals POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create proposal');
  }
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

  try {
    const existing = await db
      .prepare(`SELECT * FROM quotations WHERE id = ? AND archived_at IS NULL`)
      .bind(id)
      .first();

    if (!existing) {
      return errorResponse(404, 'NOT_FOUND', 'Proposal not found or archived');
    }

    const nextStatus = body.status !== undefined ? normalizeProposalStatus(body.status) : existing.status;
    const nowIso = new Date().toISOString();

    const title = cleanString(body.title, 200);
    const summary = cleanString(body.executive_summary ?? body.executiveSummary, 4000);
    let termsMarkdown = existing.terms_markdown;
    if (title || summary) {
      termsMarkdown = (title || 'Proposal') + (summary ? `\n\n${summary}` : '');
    }

    const amountMinor = body.amount_minor !== undefined
      ? Math.max(0, Math.round(Number(body.amount_minor) || 0))
      : existing.total_minor;

    const validUntil = body.valid_until !== undefined
      ? cleanString(body.valid_until, 30) || null
      : existing.valid_until;

    await db
      .prepare(
        `UPDATE quotations
         SET status = ?, subtotal_minor = ?, total_minor = ?, valid_until = ?,
             terms_markdown = ?, updated_at = ?
         WHERE id = ? AND archived_at IS NULL`
      )
      .bind(
        nextStatus,
        amountMinor,
        amountMinor,
        validUntil,
        termsMarkdown,
        nowIso,
        id
      )
      .run();

    const updated = await db
      .prepare(
        `SELECT q.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
         FROM quotations q
         JOIN clients c ON c.id = q.client_id
         LEFT JOIN projects p ON p.id = q.project_id
         WHERE q.id = ?`
      )
      .bind(id)
      .first();

    const resultRow = toProposalRow(updated);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'PROPOSAL_UPDATED',
      entityType: 'quotations',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toProposalRow(existing),
      after: resultRow
    });

    return jsonResponse({ success: true, proposal: resultRow });
  } catch (err) {
    console.error('[HQ Proposals PUT Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update proposal');
  }
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = cleanString(new URL(request.url).searchParams.get('id'), 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Proposal ID is required');

  const db = env.HQ_DB;

  try {
    const existing = await db
      .prepare(`SELECT * FROM quotations WHERE id = ? AND archived_at IS NULL`)
      .bind(id)
      .first();

    if (!existing) {
      return errorResponse(404, 'NOT_FOUND', 'Proposal not found or already archived');
    }

    const nowIso = new Date().toISOString();
    const result = await db
      .prepare(
        `UPDATE quotations
         SET archived_at = ?, archived_by = ?, updated_at = ?
         WHERE id = ? AND archived_at IS NULL`
      )
      .bind(nowIso, auth.owner.uid, nowIso, id)
      .run();

    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse(404, 'NOT_FOUND', 'Proposal not found or already archived');
    }

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'PROPOSAL_ARCHIVED',
      entityType: 'quotations',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toProposalRow(existing),
      after: { archived_at: nowIso, archived_by: auth.owner.uid }
    });

    return jsonResponse({ success: true, deletedId: id, archived: true });
  } catch (err) {
    console.error('[HQ Proposals DELETE Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to archive proposal');
  }
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
