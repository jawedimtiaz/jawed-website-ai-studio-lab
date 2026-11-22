// functions/api/hq/canonicalLeads.js
// Canonical Studio HQ Leads API — Phase 8.0.4 WP-2
// Uses the canonical clients table; does not create a separate leads table.
import {
  authorizeHqOwner,
  readHqJson,
  requireHqDatabase,
  ownerAuthorizationGuardStatement,
  conditionalAuditStatement,
  hqJson
} from '../../lib/hqCanonicalApi.js';
import { checkHqRateLimit } from '../../lib/hqCanonicalRateLimit.js';

export const STAGES = new Set(['new', 'contacted', 'qualified', 'proposal-sent', 'converted', 'lost']);
export const CURRENCIES = new Set([
  'INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'AED', 'SAR', 'JPY', 'KRW', 'KWD', 'BHD', 'OMR'
]);
export const ALLOWED_SOURCES = new Set([
  'direct-client', 'referral', 'partner', 'inbound', 'outbound', 'repeat', 'other'
]);
const MAX_TEXT = 500;
const LEAD_FIELDS = new Set([
  'business_name', 'contact_name', 'email', 'phone', 'website', 'website_url',
  'source', 'category', 'notes', 'estimated_value_minor', 'currency',
  'next_follow_up_at', 'pipeline_stage', 'lost_reason'
]);

function text(v, max = MAX_TEXT) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function safeAmount(v) {
  return Number.isSafeInteger(v) && v >= 0;
}

function statusForStage(stage) {
  if (stage === 'converted') return 'active';
  if (stage === 'lost') return 'closed';
  if (['qualified', 'proposal-sent'].includes(stage)) return 'prospect';
  return 'lead';
}

function normalizeSource(src) {
  if (!src || typeof src !== 'string') return 'inbound';
  const clean = src.trim().toLowerCase();
  if (ALLOWED_SOURCES.has(clean)) return clean;
  if (clean.includes('referral')) return 'referral';
  if (clean.includes('partner')) return 'partner';
  if (clean.includes('repeat')) return 'repeat';
  if (clean.includes('outbound')) return 'outbound';
  return 'inbound';
}

function mapLead(r) {
  const labels = {
    new: 'New',
    contacted: 'Contacted',
    qualified: 'Qualified',
    'proposal-sent': 'Proposal Sent',
    converted: 'Converted',
    lost: 'Lost'
  };
  return {
    id: r.id,
    business_name: r.business_name || r.name || '',
    contact_name: r.name || '',
    name: r.name || '',
    email: r.email || '',
    phone: r.phone || '',
    category: r.category || '',
    website: r.website_url || '',
    website_url: r.website_url || '',
    source: r.source || 'inbound',
    status: labels[r.pipeline_stage] || 'New',
    canonical_status: r.status,
    lead_origin: r.lead_origin,
    pipeline_stage: r.pipeline_stage,
    estimated_value_minor: r.estimated_value_minor || 0,
    currency: r.currency || 'INR',
    notes: r.notes || '',
    next_follow_up_at: r.next_follow_up_at || null,
    converted_client_id: r.pipeline_stage === 'converted' ? r.id : null,
    converted_at: r.converted_at || null,
    lost_at: r.lost_at || null,
    lost_reason: r.lost_reason || null,
    archived_at: r.archived_at || null,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}

function validate(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'INVALID_INPUT' };
  }
  const unknown = Object.keys(body).filter(k => !LEAD_FIELDS.has(k));
  if (unknown.length) return { ok: false, error: 'UNKNOWN_FIELDS' };

  const out = {};
  const strFields = [
    'business_name', 'contact_name', 'email', 'phone', 'website',
    'website_url', 'source', 'category', 'notes', 'lost_reason'
  ];
  for (const k of strFields) {
    if (k in body) {
      if (typeof body[k] !== 'string') return { ok: false, error: 'INVALID_FIELD' };
      out[k] = text(body[k], k === 'notes' ? 4000 : MAX_TEXT);
    }
  }

  // Alias website_url to website
  if (out.website_url && !out.website) out.website = out.website_url;

  // Email normalization
  if ('email' in out) {
    out.email = out.email ? out.email.toLowerCase() : '';
  }

  // Money & currency validation
  if ('estimated_value_minor' in body) {
    if (!safeAmount(body.estimated_value_minor)) return { ok: false, error: 'INVALID_AMOUNT' };
    out.estimated_value_minor = body.estimated_value_minor;
  }
  if ('currency' in body) {
    if (typeof body.currency !== 'string') return { ok: false, error: 'INVALID_CURRENCY' };
    const curr = body.currency.trim().toUpperCase();
    if (!CURRENCIES.has(curr)) return { ok: false, error: 'INVALID_CURRENCY' };
    out.currency = curr;
  }

  // Follow-up timestamp validation (must be valid ISO or null)
  if ('next_follow_up_at' in body) {
    const v = body.next_follow_up_at;
    if (v !== null) {
      if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) {
        return { ok: false, error: 'INVALID_FOLLOW_UP' };
      }
      out.next_follow_up_at = new Date(v).toISOString();
    } else {
      out.next_follow_up_at = null;
    }
  }

  // Pipeline stage validation
  if ('pipeline_stage' in body) {
    if (!STAGES.has(body.pipeline_stage) || body.pipeline_stage === 'converted') {
      return { ok: false, error: 'INVALID_STAGE' };
    }
    out.pipeline_stage = body.pipeline_stage;
  }

  if (!partial) {
    if (!out.business_name || !out.contact_name) return { ok: false, error: 'REQUIRED_FIELDS' };
    out.lead_origin = 'inbound-lead';
    out.pipeline_stage = 'new';
    out.status = 'lead';
    out.source = normalizeSource(out.source);
  } else if ('source' in out) {
    out.source = normalizeSource(out.source);
  }

  return { ok: true, value: out };
}

function routeError(error, status = 400) {
  const messages = {
    INVALID_INPUT: 'Invalid request payload.',
    INVALID_STAGE: 'The selected lead stage is invalid.',
    INVALID_CONVERSION_INPUT: 'Conversion request contains unsupported or invalid fields.',
    INVALID_AMOUNT: 'Estimated value must be a non-negative safe integer in minor units.',
    INVALID_CURRENCY: 'Currency is not supported.',
    INVALID_FOLLOW_UP: 'Follow-up date is invalid.',
    REQUIRED_FIELDS: 'Business name and contact name are required.',
    LOST_REASON_REQUIRED: 'A reason is required when marking a lead Lost.',
    LEAD_NOT_FOUND: 'Lead not found.',
    LEAD_ALREADY_CONVERTED: 'This lead has already been converted.',
    LOST_LEAD_CANNOT_CONVERT: 'Lost leads cannot be converted. Reopen the lead first.',
    NO_VALID_FIELDS: 'No valid fields were provided.',
    UNKNOWN_FIELDS: 'The request contains unsupported fields.',
    NOT_FOUND: 'Not found.'
  };
  const message = messages[error] || 'The request could not be completed.';
  return hqJson({ ok: false, error: { code: error, message } }, status);
}

async function list(request, db) {
  const u = new URL(request.url);
  const page = Math.max(1, Number(u.searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get('limit')) || 25));
  const q = text(u.searchParams.get('q'), 100).toLowerCase();

  const rawStage = u.searchParams.get('stage') || u.searchParams.get('status') || '';
  const archivedOnly = u.searchParams.get('archivedOnly') === 'true' || rawStage.toLowerCase() === 'archived';

  const stageMapping = {
    new: 'new',
    contacted: 'contacted',
    qualified: 'qualified',
    'proposal-sent': 'proposal-sent',
    converted: 'converted',
    lost: 'lost',
    New: 'new',
    Contacted: 'contacted',
    Qualified: 'qualified',
    'Proposal Sent': 'proposal-sent',
    Converted: 'converted',
    Lost: 'lost',
    all: 'all',
    All: 'all'
  };

  const stage = stageMapping[rawStage] || (rawStage ? rawStage.toLowerCase() : '');

  const clauses = ["lead_origin = 'inbound-lead'"];
  const args = [];

  // Archival filtering
  if (archivedOnly) {
    clauses.push('archived_at IS NOT NULL');
  } else {
    clauses.push('archived_at IS NULL');
  }

  // Stage filtering
  if (stage === 'all') {
    // All stages: includes new, contacted, qualified, proposal-sent, converted, and lost
  } else if (stage && stage !== 'archived') {
    if (!STAGES.has(stage)) return routeError('INVALID_STAGE');
    clauses.push('pipeline_stage = ?');
    args.push(stage);
  } else if (!archivedOnly) {
    // Default view: active open leads only (exclude terminal stages converted and lost)
    clauses.push("pipeline_stage NOT IN ('converted', 'lost')");
  }

  if (q) {
    clauses.push("(lower(coalesce(business_name, '')) LIKE ? OR lower(coalesce(name, '')) LIKE ? OR lower(coalesce(email, '')) LIKE ? OR lower(coalesce(phone, '')) LIKE ? OR lower(coalesce(source, '')) LIKE ?)");
    const p = '%' + q + '%';
    args.push(p, p, p, p, p);
  }

  const where = 'WHERE ' + clauses.join(' AND ');
  const count = await db.prepare('SELECT COUNT(*) AS total FROM clients ' + where).bind(...args).first();
  const rows = await db.prepare('SELECT * FROM clients ' + where + ' ORDER BY updated_at DESC LIMIT ? OFFSET ?').bind(...args, limit, (page - 1) * limit).all();

  return hqJson({
    success: true,
    leads: (rows.results || []).map(mapLead),
    total: Number(count?.total || 0),
    page,
    limit
  });
}

async function create(request, db, identity) {
  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const v = validate(parsed.value);
  if (!v.ok) return routeError(v.error);
  const f = v.value;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const email = f.email || null;
  const phone = f.phone || null;

  // Duplicate advisories check (advisory only, non-blocking)
  let duplicateAdvisories = [];
  try {
    const dupCheck = await db.prepare(`
      SELECT id, name, business_name, email, phone, pipeline_stage, status
      FROM clients
      WHERE archived_at IS NULL
        AND (
          (? IS NOT NULL AND lower(email) = ?)
          OR (? IS NOT NULL AND phone = ?)
          OR lower(trim(business_name)) = lower(?)
        )
      LIMIT 5
    `).bind(email, email, phone, phone, f.business_name).all();
    if (dupCheck?.results?.length) {
      duplicateAdvisories = dupCheck.results.map(r => {
        const isEmailMatch = Boolean(email && r.email && r.email.toLowerCase() === email.toLowerCase());
        const isPhoneMatch = Boolean(phone && r.phone && r.phone === phone);
        const match_type = isEmailMatch ? 'email' : (isPhoneMatch ? 'phone' : 'business_name');
        return {
          id: r.id,
          name: r.name,
          business_name: r.business_name,
          pipeline_stage: r.pipeline_stage,
          match_type
        };
      });
    }
  } catch {
    // Non-fatal advisory check
  }

  const stmt = db.prepare(`
    INSERT INTO clients (
      id, business_name, name, email, phone, website_url, source,
      status, lead_origin, pipeline_stage, estimated_value_minor, currency,
      category, next_follow_up_at, notes, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, f.business_name, f.contact_name, email, phone, f.website || null,
    f.source || 'inbound', 'lead', 'inbound-lead', 'new',
    f.estimated_value_minor || 0, f.currency || 'INR', f.category || null,
    f.next_follow_up_at || null, f.notes || null, identity.uid, identity.uid, now, now
  );

  const contactStmt = db.prepare(`
    INSERT INTO client_contacts (
      id, client_id, full_name, role_title, email, phone, is_primary, created_at, updated_at
    ) VALUES (?, ?, ?, 'Primary Contact', ?, ?, 1, ?, ?)
  `).bind(crypto.randomUUID(), id, f.contact_name, email, phone, now, now);

  const batch = [
    ownerAuthorizationGuardStatement(db, identity),
    stmt,
    contactStmt,
    conditionalAuditStatement(
      db, identity, 'lead.create', 'client', id, crypto.randomUUID(),
      null, { business_name: f.business_name, contact_name: f.contact_name, pipeline_stage: 'new' }
    )
  ];

  await db.batch(batch);
  const row = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
  const resp = { success: true, lead: mapLead(row) };
  if (duplicateAdvisories.length) {
    resp.duplicate_advisories = duplicateAdvisories;
  }
  return hqJson(resp, 201);
}

async function detail(db, id) {
  return db.prepare("SELECT * FROM clients WHERE id = ? AND lead_origin = 'inbound-lead' AND archived_at IS NULL")
    .bind(id)
    .first();
}

async function update(request, db, identity, id) {
  const row = await detail(db, id);
  if (!row) return routeError('LEAD_NOT_FOUND', 404);

  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const v = validate(parsed.value, true);
  if (!v.ok) return routeError(v.error);
  const f = v.value;
  if (!Object.keys(f).length) return routeError('NO_VALID_FIELDS');

  // Converted leads cannot be edited through Leads API
  if (row.pipeline_stage === 'converted') {
    return routeError('LEAD_ALREADY_CONVERTED', 409);
  }

  const targetStage = f.pipeline_stage || row.pipeline_stage;

  // Lost stage requires a non-empty lost reason
  if (targetStage === 'lost') {
    const reason = 'lost_reason' in f ? f.lost_reason : row.lost_reason;
    if (!text(reason)) return routeError('LOST_REASON_REQUIRED');
  }

  const now = new Date().toISOString();
  const sets = [];
  const vals = [];

  const fieldMap = {
    business_name: 'business_name',
    contact_name: 'name',
    email: 'email',
    phone: 'phone',
    website: 'website_url',
    website_url: 'website_url',
    source: 'source',
    category: 'category',
    notes: 'notes',
    estimated_value_minor: 'estimated_value_minor',
    currency: 'currency',
    next_follow_up_at: 'next_follow_up_at'
  };

  for (const [k, col] of Object.entries(fieldMap)) {
    if (k in f) {
      sets.push(`${col} = ?`);
      vals.push(f[k] === '' && ['email', 'phone', 'website_url', 'category', 'notes', 'next_follow_up_at'].includes(col) ? null : f[k]);
    }
  }

  // Stage changes
  if ('pipeline_stage' in f) {
    sets.push('pipeline_stage = ?', 'status = ?');
    vals.push(targetStage, statusForStage(targetStage));

    if (targetStage === 'lost') {
      sets.push('lost_at = ?', 'lost_reason = ?');
      vals.push(now, f.lost_reason || row.lost_reason);
    } else if (row.pipeline_stage === 'lost') {
      // Reopening a lost lead clears lost_at and lost_reason
      sets.push('lost_at = NULL', 'lost_reason = NULL');
    }
  } else if ('lost_reason' in f && targetStage === 'lost') {
    sets.push('lost_reason = ?');
    vals.push(f.lost_reason);
  }

  sets.push('updated_at = ?', 'updated_by = ?');
  vals.push(now, identity.uid);

  // Where clause
  vals.push(id);

  const clientUpdate = db.prepare(`
    UPDATE clients SET ${sets.join(', ')}
    WHERE id = ? AND lead_origin = 'inbound-lead' AND archived_at IS NULL
  `).bind(...vals);

  const batch = [
    ownerAuthorizationGuardStatement(db, identity),
    clientUpdate,
    conditionalAuditStatement(
      db, identity, 'lead.update', 'client', id, crypto.randomUUID(),
      { pipeline_stage: row.pipeline_stage, status: row.status },
      { pipeline_stage: targetStage, status: statusForStage(targetStage) }
    )
  ];

  // Primary contact synchronization
  if ('contact_name' in f || 'email' in f || 'phone' in f) {
    const contactSets = ['updated_at = ?'];
    const contactVals = [now];
    if ('contact_name' in f) {
      contactSets.push('full_name = ?');
      contactVals.push(f.contact_name);
    }
    if ('email' in f) {
      contactSets.push('email = ?');
      contactVals.push(f.email || null);
    }
    if ('phone' in f) {
      contactSets.push('phone = ?');
      contactVals.push(f.phone || null);
    }
    contactVals.push(id);
    batch.push(db.prepare(`
      UPDATE client_contacts
      SET ${contactSets.join(', ')}
      WHERE client_id = ? AND is_primary = 1 AND archived_at IS NULL
    `).bind(...contactVals));

    // Fallback insert: if no active primary contact exists, insert one
    const newContactId = crypto.randomUUID();
    const finalFullName = 'contact_name' in f ? f.contact_name : (row.name || 'Primary Contact');
    const finalEmail = 'email' in f ? (f.email || null) : (row.email || null);
    const finalPhone = 'phone' in f ? (f.phone || null) : (row.phone || null);

    batch.push(db.prepare(`
      INSERT INTO client_contacts (
        id, client_id, full_name, role_title, email, phone, is_primary, created_at, updated_at
      )
      SELECT ?, ?, ?, 'Primary Contact', ?, ?, 1, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM client_contacts WHERE client_id = ? AND is_primary = 1 AND archived_at IS NULL
      )
    `).bind(
      newContactId, id, finalFullName, finalEmail, finalPhone, now, now,
      id
    ));
  }

  await db.batch(batch);
  const updated = await detail(db, id);
  return hqJson({ success: true, lead: mapLead(updated) });
}

async function archive(db, identity, id, restore) {
  const row = await db.prepare("SELECT * FROM clients WHERE id = ? AND lead_origin = 'inbound-lead'").bind(id).first();
  if (!row) return routeError('LEAD_NOT_FOUND', 404);

  const now = new Date().toISOString();
  // Idempotent archive / restore
  const sql = restore
    ? "UPDATE clients SET archived_at = NULL, archived_by = NULL, updated_at = ?, updated_by = ? WHERE id = ? AND archived_at IS NOT NULL"
    : "UPDATE clients SET archived_at = ?, archived_by = ?, updated_at = ?, updated_by = ? WHERE id = ? AND archived_at IS NULL";

  const stmt = restore
    ? db.prepare(sql).bind(now, identity.uid, id)
    : db.prepare(sql).bind(now, identity.uid, now, identity.uid, id);

  const results = await db.batch([
    ownerAuthorizationGuardStatement(db, identity),
    stmt,
    conditionalAuditStatement(
      db, identity, restore ? 'lead.restore' : 'lead.archive', 'client', id, crypto.randomUUID(),
      { archived_at: row.archived_at },
      { archived_at: restore ? null : now }
    )
  ]);

  const changed = (results?.[1]?.meta?.changes ?? 0) === 1;
  return hqJson({ success: true, id, archived: !restore, changed });
}

async function convert(request, db, identity, id) {
  const row = await db.prepare("SELECT * FROM clients WHERE id = ? AND lead_origin = 'inbound-lead' AND archived_at IS NULL").bind(id).first();
  if (!row) return routeError('LEAD_NOT_FOUND', 404);
  if (row.pipeline_stage === 'converted') return routeError('LEAD_ALREADY_CONVERTED', 409);
  if (row.pipeline_stage === 'lost') return routeError('LOST_LEAD_CANNOT_CONVERT', 409);

  const parsed = await readHqJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  if (
    !body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).some(k => !['createProject', 'projectName'].includes(k)) ||
    (body.createProject !== undefined && typeof body.createProject !== 'boolean') ||
    (body.projectName !== undefined && typeof body.projectName !== 'string')
  ) {
    return routeError('INVALID_CONVERSION_INPUT');
  }

  const createProject = body.createProject === true;
  const projectId = createProject ? crypto.randomUUID() : null;
  const now = new Date().toISOString();
  const conversionToken = crypto.randomUUID();
  const projectName = text(body.projectName, 200) || ((row.business_name || row.name) + ' Website');
  const projectCode = 'PRJ-' + (projectId ? projectId.replace(/-/g, '').slice(0, 12).toUpperCase() : '');

  const stmts = [
    ownerAuthorizationGuardStatement(db, identity),
    db.prepare(`
      UPDATE clients
      SET status = 'active',
          pipeline_stage = 'converted',
          converted_at = ?,
          conversion_token = ?,
          lost_at = NULL,
          lost_reason = NULL,
          updated_at = ?,
          updated_by = ?
      WHERE id = ? AND pipeline_stage NOT IN ('converted', 'lost') AND archived_at IS NULL
    `).bind(now, conversionToken, now, identity.uid, id)
  ];

  stmts.push(conditionalAuditStatement(
    db, identity, 'lead.convert', 'client', id, crypto.randomUUID(),
    { pipeline_stage: row.pipeline_stage, status: row.status },
    { pipeline_stage: 'converted', status: 'active', projectId }
  ));

  if (createProject) {
    stmts.push(db.prepare(`
      INSERT INTO projects (
        id, project_code, client_id, name, project_type, status, priority,
        currency, quoted_amount_minor, created_by, updated_by, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, 'business-website', 'discovery', 'normal',
             ?, 0, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM clients WHERE id = ? AND conversion_token = ?
      )
    `).bind(
      projectId, projectCode, id, projectName,
      row.currency || 'INR', identity.uid, identity.uid, now, now,
      id, conversionToken
    ));
  }

  const results = await db.batch(stmts);
  if (!results?.[1]?.meta?.changes) {
    const latest = await db.prepare('SELECT pipeline_stage FROM clients WHERE id = ?').bind(id).first();
    if (latest?.pipeline_stage === 'lost') {
      return routeError('LOST_LEAD_CANNOT_CONVERT', 409);
    }
    return routeError('LEAD_ALREADY_CONVERTED', 409);
  }

  return hqJson({
    success: true,
    clientId: id,
    projectId,
    leadId: id
  }, 201);
}

export function validateLead(body, partial = false) {
  return validate(body, partial);
}

export async function handleAuthorizedHqLeads({ request, env, segments = [], identity }) {
  const dbResult = requireHqDatabase(env);
  if (!dbResult.ok) return dbResult.response;
  const db = dbResult.db;

  const rate = await checkHqRateLimit(request, env, { type: 'general', uid: identity.uid });
  if (!rate.ok) return rate.response;

  if (['POST', 'PATCH'].includes(request.method)) {
    const write = await checkHqRateLimit(request, env, { type: 'write', uid: identity.uid });
    if (!write.ok) return write.response;
  }

  try {
    if (segments.length === 0) {
      if (request.method === 'GET') return list(request, db);
      if (request.method === 'POST') return create(request, db, identity);
      return hqJson(
        { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } },
        405,
        { allow: 'GET, POST, OPTIONS' }
      );
    }

    const [id, action] = segments;
    if (!id || id.length > 80) return routeError('LEAD_NOT_FOUND', 404);

    if (action === 'archive' || action === 'restore') {
      if (request.method === 'POST' && segments.length === 2) {
        return archive(db, identity, id, action === 'restore');
      }
      return hqJson(
        { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } },
        405,
        { allow: 'POST, OPTIONS' }
      );
    }

    if (action === 'convert') {
      if (request.method === 'POST' && segments.length === 2) {
        return convert(request, db, identity, id);
      }
      return hqJson(
        { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } },
        405,
        { allow: 'POST, OPTIONS' }
      );
    }

    if (action) return routeError('NOT_FOUND', 404);

    if (request.method === 'GET') {
      const row = await detail(db, id);
      return row ? hqJson({ success: true, lead: mapLead(row) }) : routeError('LEAD_NOT_FOUND', 404);
    }

    if (request.method === 'PATCH') {
      return update(request, db, identity, id);
    }

    return hqJson(
      { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } },
      405,
      { allow: 'GET, PATCH, OPTIONS' }
    );
  } catch (e) {
    console.error('[Studio HQ Leads] Request failed', e);
    return hqJson(
      { ok: false, error: { code: 'HQ_REQUEST_FAILED', message: 'The request could not be completed.' } },
      500
    );
  }
}

export async function handleHqLeads({ request, env, segments = [] }) {
  const ip = await checkHqRateLimit(request, env, { type: 'general' });
  if (!ip.ok) return ip.response;

  const auth = await authorizeHqOwner(request, env);
  if (!auth.ok) return auth.response;

  return handleAuthorizedHqLeads({ request, env, segments, identity: auth.identity });
}
