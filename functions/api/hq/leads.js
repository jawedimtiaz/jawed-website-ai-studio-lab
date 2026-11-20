// functions/api/hq/leads.js
// Studio HQ CRM Leads & Atomic Lead-to-Customer Conversion API
// Reconciled with Canonical Studio HQ Schema (0001_studio_hq_schema.sql & 0002_financial_management.sql)

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

/**
 * Maps a canonical clients table row to the HqLead shape expected by Studio HQ frontend.
 */
function toLeadRow(row) {
  let status = 'New';
  const s = (row.status || '').toLowerCase();
  if (s === 'prospect') status = 'Qualified';
  else if (s === 'active') status = 'Converted';
  else if (s === 'lead') status = 'New';
  else if (s === 'closed') status = 'Lost';
  else status = row.status || 'New';

  return {
    id: row.id,
    business_name: row.business_name || row.name || '',
    contact_name: row.name || '',
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    category: '',
    website: row.website_url || '',
    website_url: row.website_url || '',
    source: row.source || 'Direct Enquiry',
    status,
    canonical_status: row.status,
    estimated_value_minor: 0,
    currency: 'INR',
    notes: row.notes || '',
    next_follow_up_at: null,
    converted_client_id: s === 'active' ? row.id : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const statusParam = (url.searchParams.get('status') || '').trim();
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const { page, limit, offset } = parsePagination(url);

  try {
    const conditions = ['archived_at IS NULL'];
    const params = [];

    // Filter by lead status
    if (!statusParam || statusParam === 'All') {
      conditions.push("lower(status) IN ('lead', 'prospect')");
    } else {
      const sp = statusParam.toLowerCase();
      if (sp === 'new' || sp === 'lead') {
        conditions.push("lower(status) = 'lead'");
      } else if (sp === 'qualified' || sp === 'prospect') {
        conditions.push("lower(status) = 'prospect'");
      } else if (sp === 'converted' || sp === 'active') {
        conditions.push("lower(status) = 'active'");
      } else if (sp === 'lost' || sp === 'closed') {
        conditions.push("lower(status) = 'closed'");
      } else {
        conditions.push("lower(status) = ?");
        params.push(sp);
      }
    }

    if (q) {
      conditions.push(
        "(LOWER(COALESCE(business_name, '')) LIKE ? OR LOWER(COALESCE(name, '')) LIKE ? OR LOWER(COALESCE(email, '')) LIKE ? OR LOWER(COALESCE(source, '')) LIKE ?)"
      );
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countRow = await db
      .prepare(`SELECT COUNT(*) AS total FROM clients ${whereClause}`)
      .bind(...params)
      .first();

    const rows = await db
      .prepare(
        `SELECT * FROM clients ${whereClause}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all();

    const mappedLeads = (rows.results || []).map(toLeadRow);

    return jsonResponse({
      success: true,
      leads: mappedLeads,
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

  // Special action: convert lead to active customer (+ optional project)
  if (body.action === 'convert') {
    const leadId = cleanString(body.leadId || body.id, 128);
    if (!leadId) return errorResponse(400, 'INVALID_INPUT', 'leadId is required for conversion');

    const lead = await db
      .prepare(`SELECT * FROM clients WHERE id = ? AND archived_at IS NULL`)
      .bind(leadId)
      .first();

    if (!lead) return errorResponse(404, 'NOT_FOUND', 'Lead not found');
    if ((lead.status || '').toLowerCase() === 'active') {
      return errorResponse(409, 'ALREADY_CONVERTED', 'Lead has already been converted to a customer');
    }

    const createProject = body.createProject === true;
    const projectId = createProject ? crypto.randomUUID() : null;
    const projectName = cleanString(body.projectName || `${lead.business_name || lead.name} Website`, 200);

    const stmts = [
      db
        .prepare(`UPDATE clients SET status = 'active', updated_by = ?, updated_at = ? WHERE id = ?`)
        .bind(auth.owner.uid, nowIso, leadId)
    ];

    if (createProject && projectId) {
      const projectCode = `PRJ-${Date.now().toString(36).toUpperCase()}`;
      stmts.push(
        db
          .prepare(
            `INSERT INTO projects (
              id, project_code, client_id, name, project_type, status, priority,
              currency, quoted_amount_minor, created_by, updated_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'business-website', 'discovery', 'normal', 'INR', 0, ?, ?, ?, ?)`
          )
          .bind(
            projectId,
            projectCode,
            leadId,
            projectName,
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
        entityType: 'clients',
        entityId: leadId,
        requestId: auth.requestId,
        ipAddress: auth.ipAddress,
        before: { status: lead.status },
        after: { status: 'active', convertedClientId: leadId, projectId }
      });

      return jsonResponse(
        {
          success: true,
          clientId: leadId,
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

  // Normal lead creation
  const businessName = cleanString(body.business_name || body.businessName || body.name, 200);
  const contactName = cleanString(body.contact_name || body.contactName || body.name || body.business_name, 200);
  if (!businessName && !contactName) {
    return errorResponse(400, 'INVALID_INPUT', 'Business name or contact person is required');
  }

  const name = contactName || businessName;
  const busName = businessName || contactName;
  const id = crypto.randomUUID();
  const clientCode = `CLI-${Date.now().toString(36).toUpperCase()}`;
  const inputStatus = (body.status || '').toString().toLowerCase();
  const canonicalStatus = inputStatus === 'qualified' || inputStatus === 'prospect' ? 'prospect' : 'lead';

  const email = cleanString(body.email, 200).toLowerCase();
  const phone = cleanString(body.phone, 50);
  const websiteUrl = cleanString(body.website || body.website_url, 300);
  const source = cleanString(body.source || 'Direct Enquiry', 100);
  const notes = cleanString(body.notes, 4000);

  try {
    const stmts = [
      db
        .prepare(
          `INSERT INTO clients (
            id, client_code, name, business_name, status, email, phone, website_url,
            notes, source, created_by, updated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          clientCode,
          name,
          busName,
          canonicalStatus,
          email,
          phone,
          websiteUrl,
          notes,
          source,
          auth.owner.uid,
          auth.owner.uid,
          nowIso,
          nowIso
        )
    ];

    if (contactName) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO client_contacts (
              id, client_id, full_name, role_title, email, phone, is_primary, created_at, updated_at
            ) VALUES (?, ?, ?, 'Primary Contact', ?, ?, 1, ?, ?)`
          )
          .bind(crypto.randomUUID(), id, contactName, email, phone, nowIso, nowIso)
      );
    }

    await db.batch(stmts);

    const created = await db.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
    const mapped = toLeadRow(created);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'LEAD_CREATED',
      entityType: 'clients',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: mapped
    });

    return jsonResponse({ success: true, lead: mapped }, 201);
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
  const existing = await db
    .prepare(`SELECT * FROM clients WHERE id = ? AND archived_at IS NULL`)
    .bind(id)
    .first();

  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Lead not found');

  const nowIso = new Date().toISOString();
  const name = cleanString(body.contact_name ?? body.name ?? existing.name, 200) || existing.name;
  const businessName = cleanString(body.business_name ?? body.businessName ?? existing.business_name, 200);

  let nextStatus = existing.status;
  if (body.status !== undefined) {
    const raw = String(body.status).toLowerCase();
    if (raw === 'qualified' || raw === 'prospect') nextStatus = 'prospect';
    else if (raw === 'converted' || raw === 'active') nextStatus = 'active';
    else if (raw === 'new' || raw === 'lead') nextStatus = 'lead';
    else if (raw === 'lost' || raw === 'closed') nextStatus = 'closed';
    else if (['lead', 'prospect', 'active', 'paused', 'completed', 'closed'].includes(raw)) nextStatus = raw;
  }

  const email = body.email !== undefined ? cleanString(body.email, 200).toLowerCase() : existing.email;
  const phone = body.phone !== undefined ? cleanString(body.phone, 50) : existing.phone;
  const websiteUrl =
    body.website !== undefined || body.website_url !== undefined
      ? cleanString(body.website ?? body.website_url, 300)
      : existing.website_url;
  const source = body.source !== undefined ? cleanString(body.source, 100) : existing.source;
  const notes = body.notes !== undefined ? cleanString(body.notes, 4000) : existing.notes;

  try {
    await db
      .prepare(
        `UPDATE clients
         SET name = ?, business_name = ?, status = ?, email = ?, phone = ?,
             website_url = ?, notes = ?, source = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        name,
        businessName,
        nextStatus,
        email,
        phone,
        websiteUrl,
        notes,
        source,
        auth.owner.uid,
        nowIso,
        id
      )
      .run();

    const updated = await db.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
    const mapped = toLeadRow(updated);

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'LEAD_UPDATED',
      entityType: 'clients',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: toLeadRow(existing),
      after: mapped
    });

    return jsonResponse({ success: true, lead: mapped });
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
  const existing = await db
    .prepare(`SELECT * FROM clients WHERE id = ? AND archived_at IS NULL`)
    .bind(id)
    .first();

  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Lead not found');

  const nowIso = new Date().toISOString();

  // Soft delete preserving append-only audit trail
  await db
    .prepare(`UPDATE clients SET archived_at = ?, archived_by = ?, updated_at = ? WHERE id = ?`)
    .bind(nowIso, auth.owner.uid, nowIso, id)
    .run();

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'LEAD_DELETED',
    entityType: 'clients',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: toLeadRow(existing)
  });

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, POST, PUT, PATCH, DELETE, OPTIONS');
}
