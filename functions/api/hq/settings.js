// functions/api/hq/settings.js
// Studio HQ Settings, Security Overview & Audit Logs API

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
import { getAllowedOwnerEmails } from '../../lib/hqAuth.js';

const DEFAULT_SETTINGS = {
  studioName: 'Jawed Web Studio',
  ownerName: 'Jawed Imtiaz',
  contactEmail: 'jawed@jawed.co.in',
  website: 'https://jawed.co.in',
  defaultCurrency: 'INR',
  defaultTaxRateBps: 0,
  invoiceTerms: 'Payment due within 14 days via bank transfer or UPI.',
  quotationValidityDays: 30
};

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);

  try {
    if (url.pathname.includes('audit-logs')) {
      const { page, limit, offset } = parsePagination(url, 50, 100);
      const entityType = url.searchParams.get('entityType') || '';
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();

      const conditions = [];
      const params = [];
      if (entityType && entityType !== 'All') {
        conditions.push('entity_type = ?');
        params.push(entityType);
      }
      if (q) {
        conditions.push('(LOWER(action) LIKE ? OR LOWER(actor_email) LIKE ? OR LOWER(entity_id) LIKE ?)');
        const pat = `%${q}%`;
        params.push(pat, pat, pat);
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const countRow = await db.prepare(`SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`).bind(...params).first();
      const rows = await db
        .prepare(`SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(...params, limit, offset)
        .all();

      return jsonResponse({
        success: true,
        logs: rows.results || [],
        total: Number(countRow?.total || 0),
        page,
        limit
      });
    }

    const [settingRow, ownersRows, auditCount] = await Promise.all([
      db.prepare(`SELECT value_json, updated_at, updated_by FROM studio_settings WHERE key = 'workspace'`).first(),
      db.prepare(`SELECT uid, email, display_name, status, created_at, last_seen_at FROM hq_users ORDER BY created_at ASC`).all(),
      db.prepare(`SELECT COUNT(*) AS total FROM audit_logs`).first()
    ]);

    let settings = { ...DEFAULT_SETTINGS };
    if (settingRow?.value_json) {
      try {
        settings = { ...DEFAULT_SETTINGS, ...JSON.parse(settingRow.value_json) };
      } catch {}
    }

    return jsonResponse({
      success: true,
      settings,
      security: {
        allowedEmails: getAllowedOwnerEmails(env),
        enrolledOwners: ownersRows.results || [],
        auditLogCount: Number(auditCount?.total || 0),
        authMode: 'Firebase RS256 JWKS + Cloudflare D1 Allowlist'
      }
    });
  } catch (err) {
    console.error('[HQ Settings GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve workspace settings');
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const db = env.HQ_DB;
  const nowIso = new Date().toISOString();
  const nextSettings = {
    studioName: cleanString(body.studioName || DEFAULT_SETTINGS.studioName, 120),
    ownerName: cleanString(body.ownerName || DEFAULT_SETTINGS.ownerName, 120),
    contactEmail: cleanString(body.contactEmail || DEFAULT_SETTINGS.contactEmail, 150),
    website: cleanString(body.website || DEFAULT_SETTINGS.website, 200),
    defaultCurrency: cleanString(body.defaultCurrency || 'INR', 10).toUpperCase(),
    defaultTaxRateBps: Math.max(0, Math.min(5000, Math.round(Number(body.defaultTaxRateBps ?? 0) || 0))),
    invoiceTerms: cleanString(body.invoiceTerms || DEFAULT_SETTINGS.invoiceTerms, 1000),
    quotationValidityDays: Math.max(1, Math.min(365, Math.round(Number(body.quotationValidityDays ?? 30) || 30)))
  };

  await db
    .prepare(
      `INSERT INTO studio_settings (key, value_json, updated_by, updated_at)
       VALUES ('workspace', ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`
    )
    .bind(JSON.stringify(nextSettings), auth.owner.email, nowIso)
    .run();

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'SETTINGS_UPDATED',
    entityType: 'studio_settings',
    entityId: 'workspace',
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: nextSettings
  });

  return jsonResponse({ success: true, settings: nextSettings });
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, PUT, OPTIONS');
}
