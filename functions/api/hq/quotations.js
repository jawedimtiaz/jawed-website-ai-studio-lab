// functions/api/hq/quotations.js
// Studio HQ Quotations & Line-Items API (Server-side totals + Quotation-to-Invoice conversion)

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

const QUOTE_STATUSES = ['Draft', 'Sent', 'Approved', 'Declined', 'Expired', 'Converted'];

function computeTotals(items = [], discountMinor = 0, taxRateBps = 0) {
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item, idx) => {
      const description = cleanString(item?.description, 300);
      const quantity = Math.max(0, Number(item?.quantity ?? 1) || 0);
      const unitPriceMinor = Math.max(0, Math.round(Number(item?.unit_price_minor ?? item?.unitPriceMinor ?? 0) || 0));
      const lineTotalMinor = Math.round(quantity * unitPriceMinor);
      return { description, quantity, unitPriceMinor, lineTotalMinor, sortOrder: idx };
    })
    .filter((i) => i.description);

  const subtotalMinor = normalizedItems.reduce((sum, i) => sum + i.lineTotalMinor, 0);
  const safeDiscount = Math.min(subtotalMinor, Math.max(0, Math.round(Number(discountMinor) || 0)));
  const taxableMinor = Math.max(0, subtotalMinor - safeDiscount);
  const safeTaxBps = Math.max(0, Math.min(10000, Math.round(Number(taxRateBps) || 0)));
  const taxMinor = Math.round((taxableMinor * safeTaxBps) / 10000);
  const totalMinor = taxableMinor + taxMinor;

  return { normalizedItems, subtotalMinor, safeDiscount, safeTaxBps, taxMinor, totalMinor };
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const clientId = url.searchParams.get('clientId');

  try {
    if (id) {
      const quotation = await db
        .prepare(
          `SELECT q.*, c.business_name AS client_business, c.name AS client_name, c.email AS client_email,
                  c.address AS client_address, p.name AS project_name
           FROM quotations q
           JOIN clients c ON c.id = q.client_id
           LEFT JOIN projects p ON p.id = q.project_id
           WHERE q.id = ?`
        )
        .bind(id)
        .first();
      if (!quotation) return errorResponse(404, 'NOT_FOUND', 'Quotation not found');
      const items = await db
        .prepare(`SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC`)
        .bind(id)
        .all();
      return jsonResponse({ success: true, quotation, items: items.results || [] });
    }

    const conditions = [];
    const params = [];
    if (clientId) {
      conditions.push('q.client_id = ?');
      params.push(clientId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
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

    return jsonResponse({ success: true, quotations: rows.results || [] });
  } catch (err) {
    console.error('[HQ Quotations GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve quotations');
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

  // Convert quotation to invoice atomically
  if (body.action === 'convert_to_invoice') {
    const quotationId = cleanString(body.quotationId || body.id, 128);
    if (!quotationId) return errorResponse(400, 'INVALID_INPUT', 'quotationId is required');

    const quote = await db.prepare(`SELECT * FROM quotations WHERE id = ?`).bind(quotationId).first();
    if (!quote) return errorResponse(404, 'NOT_FOUND', 'Quotation not found');

    const qItems = await db
      .prepare(`SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC`)
      .bind(quotationId)
      .all();

    const invoiceId = crypto.randomUUID();
    const invoiceNumber = await nextSequenceNumber(db, 'invoice', 'INV');
    const issueDate = nowIso.slice(0, 10);
    const dueDate = cleanString(body.due_date || body.dueDate, 30) ||
      new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10);

    const stmts = [
      db
        .prepare(
          `INSERT INTO invoices (
            id, invoice_number, client_id, project_id, quotation_id, title, status,
            currency, subtotal_minor, discount_minor, tax_rate_bps, tax_minor, total_minor,
            paid_amount_minor, balance_due_minor, issue_date, due_date, notes, terms,
            created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'Issued', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          invoiceId,
          invoiceNumber,
          quote.client_id,
          quote.project_id,
          quote.id,
          quote.title,
          quote.currency,
          quote.subtotal_minor,
          quote.discount_minor,
          quote.tax_rate_bps,
          quote.tax_minor,
          quote.total_minor,
          quote.total_minor,
          issueDate,
          dueDate,
          quote.notes,
          quote.terms,
          auth.owner.uid,
          nowIso,
          nowIso
        ),
      db
        .prepare(`UPDATE quotations SET status = 'Converted', updated_at = ? WHERE id = ?`)
        .bind(nowIso, quotationId)
    ];

    for (const item of qItems.results || []) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price_minor, line_total_minor, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            crypto.randomUUID(),
            invoiceId,
            item.description,
            item.quantity,
            item.unit_price_minor,
            item.line_total_minor,
            item.sort_order
          )
      );
    }

    await db.batch(stmts);
    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'QUOTATION_CONVERTED_TO_INVOICE',
      entityType: 'invoices',
      entityId: invoiceId,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      after: { quotationId, invoiceNumber, totalMinor: quote.total_minor }
    });

    const createdInvoice = await db.prepare(`SELECT * FROM invoices WHERE id = ?`).bind(invoiceId).first();
    return jsonResponse({ success: true, invoice: createdInvoice }, 201);
  }

  const clientId = cleanString(body.client_id || body.clientId, 128);
  const title = cleanString(body.title, 200);
  if (!clientId || !title) {
    return errorResponse(400, 'INVALID_INPUT', 'Customer and quotation title are required');
  }

  const client = await db.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse(404, 'NOT_FOUND', 'Customer not found');

  const calc = computeTotals(body.items, body.discount_minor ?? body.discountMinor, body.tax_rate_bps ?? body.taxRateBps);
  if (calc.normalizedItems.length === 0) {
    return errorResponse(400, 'INVALID_INPUT', 'At least one quotation line item is required');
  }

  const id = crypto.randomUUID();
  const quotationNumber = await nextSequenceNumber(db, 'quotation', 'QUO');
  const status = QUOTE_STATUSES.includes(body.status) ? body.status : 'Draft';

  const stmts = [
    db
      .prepare(
        `INSERT INTO quotations (
          id, quotation_number, client_id, project_id, title, status, currency,
          subtotal_minor, discount_minor, tax_rate_bps, tax_minor, total_minor,
          valid_until, notes, terms, approved_at, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        quotationNumber,
        clientId,
        cleanString(body.project_id || body.projectId, 128) || null,
        title,
        status,
        cleanString(body.currency || 'INR', 10).toUpperCase(),
        calc.subtotalMinor,
        calc.safeDiscount,
        calc.safeTaxBps,
        calc.taxMinor,
        calc.totalMinor,
        cleanString(body.valid_until || body.validUntil, 30) || null,
        cleanString(body.notes, 3000),
        cleanString(body.terms, 3000),
        status === 'Approved' ? nowIso : null,
        auth.owner.uid,
        nowIso,
        nowIso
      )
  ];

  for (const item of calc.normalizedItems) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO quotation_items (id, quotation_id, description, quantity, unit_price_minor, line_total_minor, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), id, item.description, item.quantity, item.unitPriceMinor, item.lineTotalMinor, item.sortOrder)
    );
  }

  await db.batch(stmts);
  const created = await db.prepare(`SELECT * FROM quotations WHERE id = ?`).bind(id).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'QUOTATION_CREATED',
    entityType: 'quotations',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, quotation: created }, 201);
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Quotation ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM quotations WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Quotation not found');

  const nowIso = new Date().toISOString();
  const nextStatus = QUOTE_STATUSES.includes(body.status) ? body.status : existing.status;

  if (Array.isArray(body.items)) {
    const calc = computeTotals(
      body.items,
      body.discount_minor ?? body.discountMinor ?? existing.discount_minor,
      body.tax_rate_bps ?? body.taxRateBps ?? existing.tax_rate_bps
    );
    const stmts = [
      db
        .prepare(
          `UPDATE quotations
           SET title = ?, status = ?, currency = ?, subtotal_minor = ?, discount_minor = ?,
               tax_rate_bps = ?, tax_minor = ?, total_minor = ?, valid_until = ?, notes = ?,
               terms = ?, approved_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          cleanString(body.title ?? existing.title, 200),
          nextStatus,
          cleanString(body.currency ?? existing.currency, 10).toUpperCase(),
          calc.subtotalMinor,
          calc.safeDiscount,
          calc.safeTaxBps,
          calc.taxMinor,
          calc.totalMinor,
          body.valid_until !== undefined ? cleanString(body.valid_until, 30) || null : existing.valid_until,
          cleanString(body.notes ?? existing.notes, 3000),
          cleanString(body.terms ?? existing.terms, 3000),
          nextStatus === 'Approved' ? existing.approved_at || nowIso : existing.approved_at,
          nowIso,
          id
        ),
      db.prepare(`DELETE FROM quotation_items WHERE quotation_id = ?`).bind(id)
    ];

    for (const item of calc.normalizedItems) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO quotation_items (id, quotation_id, description, quantity, unit_price_minor, line_total_minor, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(crypto.randomUUID(), id, item.description, item.quantity, item.unitPriceMinor, item.lineTotalMinor, item.sortOrder)
      );
    }
    await db.batch(stmts);
  } else {
    await db
      .prepare(
        `UPDATE quotations
         SET status = ?, title = ?, valid_until = ?, notes = ?, terms = ?, approved_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        nextStatus,
        cleanString(body.title ?? existing.title, 200),
        body.valid_until !== undefined ? cleanString(body.valid_until, 30) || null : existing.valid_until,
        cleanString(body.notes ?? existing.notes, 3000),
        cleanString(body.terms ?? existing.terms, 3000),
        nextStatus === 'Approved' ? existing.approved_at || nowIso : existing.approved_at,
        nowIso,
        id
      )
      .run();
  }

  const updated = await db.prepare(`SELECT * FROM quotations WHERE id = ?`).bind(id).first();
  return jsonResponse({ success: true, quotation: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Quotation ID is required');

  const db = env.HQ_DB;
  const result = await db.prepare(`DELETE FROM quotations WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Quotation not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
