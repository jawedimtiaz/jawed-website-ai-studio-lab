// functions/api/hq/leads.js
// Studio HQ CRM Leads & Atomic Lead-to-Customer Conversion API

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  parsePagination,
  auditLog
} from '../../lib/hqApi.js';

const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Converted', 'Lost'];

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const { page, limit, offset } = parsePagination(url);

  try {
    const conditions = [];
    const params = [];
    if (status && status !== 'All') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (q) {
      conditions.push(
        '(LOWER(business_name) LIKE ? OR LOWER(contact_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(source) LIKE ?)'
      );
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRow = await db
      .prepare(`SELECT COUNT(*) AS total FROM leads ${whereClause}`)
      .bind(...params)
      .first();
    const rows = await db
      .prepare(
        `SELECT * FROM leads ${whereClause}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all();

    return jsonResponse({
      success: true,
      leads: rows.results || [],
      total: Number(countRow?.total || 0),
      page,
      limit
    });
  } catch (err) {
    console.error('[HQ Leads GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve leads');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const db = env.HQ_DB;
  const nowIso = new Date().toISOString();

  // Special action: convert lead to CRM customer (+ optional project)
  if (body.action === 'convert') {
    const leadId = cleanString(body.leadId || body.id, 128);
    if (!leadId) return errorResponse(400, 'INVALID_INPUT', 'leadId is required for conversion');

    const lead = await db.prepare(`SELECT * FROM leads WHERE id = ?`).bind(leadId).first();
    if (!lead) return errorResponse(404, 'NOT_FOUND', 'Lead not found');
    if (lead.status === 'Converted' && lead.converted_client_id) {
      return errorResponse(409, 'ALREADY_CONVERTED', 'Lead has already been converted to a customer');
    }

    const clientId = crypto.randomUUID();
    const createProject = body.createProject === true;
    const projectId = createProject ? crypto.randomUUID() : null;
    const projectName = cleanString(body.projectName || `${lead.business_name} Website`, 200);

    const stmts = [
      db
        .prepare(
          `INSERT INTO clients (
            id, name, business_name, status, email, phone, category, website,
            lead_source, notes, last_contact_at, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, 'onboarding', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          clientId,
          lead.contact_name,
          lead.business_name,
          lead.email,
          lead.phone,
          lead.category,
          lead.website,
          lead.source,
          lead.notes,
          nowIso,
          auth.owner.uid,
          nowIso,
          nowIso
        ),
      db
        .prepare(
          `INSERT INTO client_contacts (id, client_id, name, role, email, phone, is_primary, created_at, updated_at)
           VALUES (?, ?, ?, 'Primary Contact', ?, ?, 1, ?, ?)`
        )
        .bind(crypto.randomUUID(), clientId, lead.contact_name, lead.email, lead.phone, nowIso, nowIso),
      db
        .prepare(
          `UPDATE leads SET status = 'Converted', converted_client_id = ?, updated_at = ? WHERE id = ?`
        )
        .bind(clientId, nowIso, leadId)
    ];

    if (createProject && projectId) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO projects (
              id, client_id, name, project_type, status, priority, summary, currency,
              quoted_amount_minor, created_by, updated_by, created_at, updated_at
            ) VALUES (?, ?, ?, 'Website Build', 'Onboarding', 'Medium', ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            projectId,
            clientId,
            projectName,
            lead.notes || '',
            lead.currency || 'INR',
            Number(lead.estimated_value_minor || 0),
            auth.owner.uid,
            auth.owner.uid,
            nowIso,
            nowIso
          )
      );
    }

    try {
      await db.batch(stmts);
      await auditLog(db, {
        actorUid: auth.owner.uid,
        actorEmail: auth.owner.email,
        action: 'LEAD_CONVERTED',
        entityType: 'leads',
        entityId: leadId,
        requestId: auth.requestId,
        ipAddress: auth.ipAddress,
        before: { status: lead.status },
        after: { status: 'Converted', convertedClientId: clientId, projectId }
      });

      return jsonResponse(
        {
          success: true,
          clientId,
          projectId,
          leadId
        },
        201
      );
    } catch (err) {
      console.error('[HQ Lead Convert Error]', err);
      return errorResponse(500, 'SERVER_ERROR', 'Failed to convert lead to customer');
    }
  }

  const businessName = cleanString(body.business_name || body.businessName, 200);
  const contactName = cleanString(body.contact_name || body.contactName, 200);
  if (!businessName || !contactName) {
    return errorResponse(400, 'INVALID_INPUT', 'Business name and contact person are required');
  }

  const status = LEAD_STATUSES.includes(body.status) ? body.status : 'New';
  const id = crypto.randomUUID();
  const estimatedValueMinor = Math.max(0, Math.round(Number(body.estimated_value_minor ?? body.estimatedValueMinor ?? 0) || 0));

  try {
    await db
      .prepare(
        `INSERT INTO leads (
          id, business_name, contact_name, email, phone, category, website, source,
          status, estimated_value_minor, currency, notes, next_follow_up_at,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        businessName,
        contactName,
        cleanString(body.email, 200).toLowerCase(),
        cleanString(body.phone, 50),
        cleanString(body.category, 100),
        cleanString(body.website, 300),
        cleanString(body.source || 'Direct Enquiry', 100),
        status,
        estimatedValueMinor,
        cleanString(body.currency || 'INR', 10).toUpperCase(),
        cleanString(body.notes, 4000),
        cleanString(body.next_follow_up_at || body.nextFollowUpAt, 50) || null,
        auth.owner.uid,
        nowIso,
        nowIso
      )
      .run();

    const created = await db.prepare(`SELECT * FROM leads WHERE id = ?`).bind(id).first();
    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'LEAD_CREATED',
      entityType: 'leads',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: created
    });

    return jsonResponse({ success: true, lead: created }, 201);
  } catch (err) {
    console.error('[HQ Leads POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create lead');
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Lead ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM leads WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Lead not found');

  const businessName = cleanString(body.business_name ?? body.businessName ?? existing.business_name, 200);
  const contactName = cleanString(body.contact_name ?? body.contactName ?? existing.contact_name, 200);
  const status = LEAD_STATUSES.includes(body.status) ? body.status : existing.status;
  const estimatedValueMinor =
    body.estimated_value_minor !== undefined || body.estimatedValueMinor !== undefined
      ? Math.max(0, Math.round(Number(body.estimated_value_minor ?? body.estimatedValueMinor) || 0))
      : existing.estimated_value_minor;
  const nowIso = new Date().toISOString();

  try {
    await db
      .prepare(
        `UPDATE leads
         SET business_name = ?, contact_name = ?, email = ?, phone = ?, category = ?,
             website = ?, source = ?, status = ?, estimated_value_minor = ?, currency = ?,
             notes = ?, next_follow_up_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        businessName,
        contactName,
        cleanString(body.email ?? existing.email, 200).toLowerCase(),
        cleanString(body.phone ?? existing.phone, 50),
        cleanString(body.category ?? existing.category, 100),
        cleanString(body.website ?? existing.website, 300),
        cleanString(body.source ?? existing.source, 100),
        status,
        estimatedValueMinor,
        cleanString(body.currency ?? existing.currency, 10).toUpperCase(),
        cleanString(body.notes ?? existing.notes, 4000),
        body.next_follow_up_at !== undefined
          ? cleanString(body.next_follow_up_at, 50) || null
          : existing.next_follow_up_at,
        nowIso,
        id
      )
      .run();

    const updated = await db.prepare(`SELECT * FROM leads WHERE id = ?`).bind(id).first();
    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'LEAD_UPDATED',
      entityType: 'leads',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: existing,
      after: updated
    });

    return jsonResponse({ success: true, lead: updated });
  } catch (err) {
    console.error('[HQ Leads PUT Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update lead');
  }
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Lead ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM leads WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Lead not found');

  await db.prepare(`DELETE FROM leads WHERE id = ?`).bind(id).run();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'LEAD_DELETED',
    entityType: 'leads',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: existing
  });

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
