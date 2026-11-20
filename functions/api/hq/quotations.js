// functions/api/hq/quotations.js
// Studio HQ Quotations & Line-Items API (Server-side totals + Quotation-to-Invoice conversion)
// Reconciled with Canonical Studio HQ Schema (0001_studio_hq_schema.sql & 0002_financial_management.sql)

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

const CANONICAL_QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'withdrawn'];

/**
 * Normalizes user/legacy status inputs to canonical D1 constraint:
 * ('draft','sent','accepted','rejected','expired','withdrawn')
 */
function normalizeQuoteStatus(statusInput) {
  if (!statusInput || typeof statusInput !== 'string') return 'draft';
  const clean = statusInput.trim().toLowerCase();
  if (clean === 'approved') return 'accepted';
  if (clean === 'declined') return 'rejected';
  if (clean === 'converted') return 'accepted';
  return CANONICAL_QUOTE_STATUSES.includes(clean) ? clean : 'draft';
}

/**
 * Generates sequential quotation numbers using canonical financial_sequences
 * with robust fallback.
 */
async function generateQuoteNumber(db) {
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
  } catch (err) {
    const yr = String(year).slice(-2);
    return `QUO-${yr}-${Date.now().toString().slice(-6)}`;
  }
}

/**
 * Generates sequential invoice numbers using canonical financial_sequences
 * with robust fallback.
 */
async function generateInvoiceNumber(db) {
  const now = new Date();
  const year = now.getFullYear();
  const nextYearShort = String((year + 1) % 100).padStart(2, '0');
  const fy = `${year}-${nextYearShort}`;
  const prefix = 'INV';
  const nowIso = now.toISOString();

  try {
    const existing = await db
      .prepare(`SELECT id, next_number FROM financial_sequences WHERE document_type = 'invoice' AND financial_year = ?`)
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
           VALUES (?, 'invoice', ?, ?, 2, ?)`
        )
        .bind(id, prefix, fy, nowIso)
        .run();
      return `${prefix}-${fy.slice(2, 4)}${fy.slice(5, 7)}-0001`;
    }
  } catch (err) {
    const yr = String(year).slice(-2);
    return `INV-${yr}-${Date.now().toString().slice(-6)}`;
  }
}

/**
 * Computes quotation line item totals with milli-quantity precision.
 */
export function computeQuotationTotals(items = [], discountMinor = 0, taxRateBps = 0) {
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item, idx) => {
      const description = cleanString(item?.description, 500);
      const rawQty = Math.max(0, Number(item?.quantity ?? (item?.quantity_milli ? item.quantity_milli / 1000 : 1)) || 0);
      const quantityMilli = Math.max(1, Math.min(1000000000, Math.round((rawQty || 1) * 1000)));
      const quantity = quantityMilli / 1000;
      const unitPriceMinor = Math.max(0, Math.round(Number(item?.unit_price_minor ?? item?.unitPriceMinor ?? 0) || 0));
      const lineSubtotalMinor = Math.round(quantity * unitPriceMinor);
      const itemDiscountMinor = Math.min(
        lineSubtotalMinor,
        Math.max(0, Math.round(Number(item?.discount_minor ?? item?.discountMinor ?? discountMinor ?? 0) || 0))
      );
      const itemTaxRateBps = Math.max(0, Math.min(10000, Math.round(Number(item?.tax_rate_bps ?? item?.taxRateBps ?? taxRateBps ?? 0) || 0)));
      const itemTaxableMinor = Math.max(0, lineSubtotalMinor - itemDiscountMinor);
      const itemTaxMinor = Math.round((itemTaxableMinor * itemTaxRateBps) / 10000);
      const lineTotalMinor = itemTaxableMinor + itemTaxMinor;
      return {
        description,
        quantity,
        quantityMilli,
        unitPriceMinor,
        discountMinor: itemDiscountMinor,
        taxRateBps: itemTaxRateBps,
        taxMinor: itemTaxMinor,
        lineTotalMinor,
        sortOrder: idx
      };
    })
    .filter((i) => i.description);

  const subtotalMinor = normalizedItems.reduce((sum, i) => sum + Math.round(i.quantity * i.unitPriceMinor), 0);
  const taxMinor = normalizedItems.reduce((sum, i) => sum + i.taxMinor, 0);
  const totalMinor = normalizedItems.reduce((sum, i) => sum + i.lineTotalMinor, 0);

  return { normalizedItems, subtotalMinor, taxMinor, totalMinor };
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
          `SELECT q.*,
                  q.quote_number AS quotation_number,
                  COALESCE(q.terms_markdown, '') AS terms,
                  COALESCE(q.terms_markdown, q.quote_number) AS title,
                  c.business_name AS client_business,
                  c.name AS client_name,
                  c.email AS client_email,
                  c.billing_address AS client_address,
                  p.name AS project_name
           FROM quotations q
           JOIN clients c ON c.id = q.client_id
           LEFT JOIN projects p ON p.id = q.project_id
           WHERE q.id = ? AND q.archived_at IS NULL`
        )
        .bind(id)
        .first();

      if (!quotation) return errorResponse(404, 'NOT_FOUND', 'Quotation not found');

      const items = await db
        .prepare(
          `SELECT id, quotation_id, description, quantity_milli,
                  ROUND(quantity_milli / 1000.0, 3) AS quantity,
                  unit_price_minor, discount_minor, tax_rate_bps, tax_minor,
                  line_total_minor, sort_order, created_at
           FROM quotation_items
           WHERE quotation_id = ?
           ORDER BY sort_order ASC`
        )
        .bind(id)
        .all();

      return jsonResponse({ success: true, quotation, items: items.results || [] });
    }

    const conditions = ['q.archived_at IS NULL'];
    const params = [];
    if (clientId) {
      conditions.push('q.client_id = ?');
      params.push(clientId);
    }
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const rows = await db
      .prepare(
        `SELECT q.*,
                q.quote_number AS quotation_number,
                COALESCE(q.terms_markdown, '') AS terms,
                COALESCE(q.terms_markdown, q.quote_number) AS title,
                c.business_name AS client_business,
                c.name AS client_name,
                p.name AS project_name
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

  // Special action: convert quotation to invoice atomically
  if (body.action === 'convert_to_invoice') {
    const quotationId = cleanString(body.quotationId || body.id, 128);
    if (!quotationId) return errorResponse(400, 'INVALID_INPUT', 'quotationId is required');

    const quote = await db
      .prepare(`SELECT * FROM quotations WHERE id = ? AND archived_at IS NULL`)
      .bind(quotationId)
      .first();

    if (!quote) return errorResponse(404, 'NOT_FOUND', 'Quotation not found');

    const qItems = await db
      .prepare(`SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC`)
      .bind(quotationId)
      .all();

    const invoiceId = crypto.randomUUID();
    const invoiceNumber = await generateInvoiceNumber(db);
    const issueDate = nowIso.slice(0, 10);
    const dueDate =
      cleanString(body.due_date || body.dueDate, 30) ||
      new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10);

    const invoiceNotes = cleanString(quote.terms_markdown || quote.notes || '', 3000);

    const stmts = [
      db
        .prepare(
          `INSERT INTO invoices (
            id, invoice_number, client_id, project_id, quotation_id, status,
            currency, subtotal_minor, tax_minor, total_minor, amount_paid_minor,
            issued_on, due_on, notes, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          invoiceId,
          invoiceNumber,
          quote.client_id,
          quote.project_id,
          quote.id,
          quote.currency || 'INR',
          Number(quote.subtotal_minor || 0),
          Number(quote.tax_minor || 0),
          Number(quote.total_minor || 0),
          issueDate,
          dueDate,
          invoiceNotes,
          auth.owner.uid,
          nowIso,
          nowIso
        ),
      db
        .prepare(`UPDATE quotations SET status = 'accepted', updated_at = ? WHERE id = ?`)
        .bind(nowIso, quotationId)
    ];

    for (const item of qItems.results || []) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO invoice_items (
              id, invoice_id, description, quantity_milli, unit_price_minor,
              discount_minor, tax_rate_bps, tax_minor, line_total_minor, sort_order, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            crypto.randomUUID(),
            invoiceId,
            item.description,
            item.quantity_milli,
            item.unit_price_minor,
            item.discount_minor || 0,
            item.tax_rate_bps || 0,
            item.tax_minor || 0,
            item.line_total_minor,
            item.sort_order || 0,
            nowIso
          )
      );
    }

    try {
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
    } catch (err) {
      console.error('[HQ Quotation Convert Error]', err);
      return errorResponse(500, 'SERVER_ERROR', 'Failed to convert quotation to invoice');
    }
  }

  // Normal quotation creation
  const clientId = cleanString(body.client_id || body.clientId, 128);
  const title = cleanString(body.title, 200);
  const termsMarkdown = cleanString(body.terms_markdown || body.terms || title, 4000);

  if (!clientId) {
    return errorResponse(400, 'INVALID_INPUT', 'Customer ID is required');
  }

  const client = await db
    .prepare(`SELECT id FROM clients WHERE id = ? AND archived_at IS NULL`)
    .bind(clientId)
    .first();

  if (!client) return errorResponse(404, 'NOT_FOUND', 'Customer not found');

  const calc = computeQuotationTotals(
    body.items,
    body.discount_minor ?? body.discountMinor,
    body.tax_rate_bps ?? body.taxRateBps
  );

  if (calc.normalizedItems.length === 0) {
    return errorResponse(400, 'INVALID_INPUT', 'At least one quotation line item is required');
  }

  const id = crypto.randomUUID();
  const quoteNumber = await generateQuoteNumber(db);
  const status = normalizeQuoteStatus(body.status);
  const currency = cleanString(body.currency || 'INR', 3).toUpperCase() || 'INR';
  const projectId = cleanString(body.project_id || body.projectId, 128) || null;
  const validUntil = cleanString(body.valid_until || body.validUntil, 30) || null;

  const stmts = [
    db
      .prepare(
        `INSERT INTO quotations (
          id, quote_number, client_id, project_id, status, currency,
          subtotal_minor, tax_minor, total_minor, valid_until, terms_markdown,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        quoteNumber,
        clientId,
        projectId,
        status,
        currency,
        calc.subtotalMinor,
        calc.taxMinor,
        calc.totalMinor,
        validUntil,
        termsMarkdown,
        auth.owner.uid,
        nowIso,
        nowIso
      )
  ];

  for (const item of calc.normalizedItems) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO quotation_items (
            id, quotation_id, description, quantity_milli, unit_price_minor,
            discount_minor, tax_rate_bps, tax_minor, line_total_minor, sort_order, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          id,
          item.description,
          item.quantityMilli,
          item.unitPriceMinor,
          item.discountMinor,
          item.taxRateBps,
          item.taxMinor,
          item.lineTotalMinor,
          item.sortOrder,
          nowIso
        )
    );
  }

  try {
    await db.batch(stmts);

    const created = await db
      .prepare(
        `SELECT q.*,
                q.quote_number AS quotation_number,
                COALESCE(q.terms_markdown, '') AS terms,
                COALESCE(q.terms_markdown, q.quote_number) AS title
         FROM quotations q
         WHERE q.id = ?`
      )
      .bind(id)
      .first();

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
  } catch (err) {
    console.error('[HQ Quotations POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create quotation');
  }
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
  const existing = await db
    .prepare(`SELECT * FROM quotations WHERE id = ? AND archived_at IS NULL`)
    .bind(id)
    .first();

  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Quotation not found');

  const nowIso = new Date().toISOString();
  const nextStatus = body.status ? normalizeQuoteStatus(body.status) : existing.status;
  const validUntil = body.valid_until !== undefined ? cleanString(body.valid_until, 30) || null : existing.valid_until;
  const termsMarkdown =
    body.terms_markdown !== undefined || body.terms !== undefined || body.title !== undefined
      ? cleanString(body.terms_markdown ?? body.terms ?? body.title, 4000)
      : existing.terms_markdown;

  try {
    if (Array.isArray(body.items)) {
      const calc = computeQuotationTotals(
        body.items,
        body.discount_minor ?? body.discountMinor,
        body.tax_rate_bps ?? body.taxRateBps
      );

      const stmts = [
        db
          .prepare(
            `UPDATE quotations
             SET status = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?,
                 valid_until = ?, terms_markdown = ?, updated_at = ?
             WHERE id = ?`
          )
          .bind(
            nextStatus,
            calc.subtotalMinor,
            calc.taxMinor,
            calc.totalMinor,
            validUntil,
            termsMarkdown,
            nowIso,
            id
          ),
        db.prepare(`DELETE FROM quotation_items WHERE quotation_id = ?`).bind(id)
      ];

      for (const item of calc.normalizedItems) {
        stmts.push(
          db
            .prepare(
              `INSERT INTO quotation_items (
                id, quotation_id, description, quantity_milli, unit_price_minor,
                discount_minor, tax_rate_bps, tax_minor, line_total_minor, sort_order, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              crypto.randomUUID(),
              id,
              item.description,
              item.quantityMilli,
              item.unitPriceMinor,
              item.discountMinor,
              item.taxRateBps,
              item.taxMinor,
              item.lineTotalMinor,
              item.sortOrder,
              nowIso
            )
        );
      }
      await db.batch(stmts);
    } else {
      await db
        .prepare(
          `UPDATE quotations
           SET status = ?, valid_until = ?, terms_markdown = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(nextStatus, validUntil, termsMarkdown, nowIso, id)
        .run();
    }

    const updated = await db
      .prepare(
        `SELECT q.*,
                q.quote_number AS quotation_number,
                COALESCE(q.terms_markdown, '') AS terms,
                COALESCE(q.terms_markdown, q.quote_number) AS title
         FROM quotations q
         WHERE q.id = ?`
      )
      .bind(id)
      .first();

    await auditLog(db, {
      actorUid: auth.owner.uid,
      actorEmail: auth.owner.email,
      action: 'QUOTATION_UPDATED',
      entityType: 'quotations',
      entityId: id,
      requestId: auth.requestId,
      ipAddress: auth.ipAddress,
      before: existing,
      after: updated
    });

    return jsonResponse({ success: true, quotation: updated });
  } catch (err) {
    console.error('[HQ Quotations PUT Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to update quotation');
  }
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
  const existing = await db
    .prepare(`SELECT * FROM quotations WHERE id = ? AND archived_at IS NULL`)
    .bind(id)
    .first();

  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Quotation not found');

  const nowIso = new Date().toISOString();

  // Soft delete preserving append-only audit trail
  await db
    .prepare(`UPDATE quotations SET archived_at = ?, archived_by = ?, updated_at = ? WHERE id = ?`)
    .bind(nowIso, auth.owner.uid, nowIso, id)
    .run();

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'QUOTATION_DELETED',
    entityType: 'quotations',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: existing
  });

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, POST, PUT, PATCH, DELETE, OPTIONS');
}
