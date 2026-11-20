// functions/api/hq/invoices.js
// Studio HQ Invoices & Line-Items API (Canonical `invoices` & `invoice_items`)
// Reconciled with Canonical Studio HQ Schema (0001_studio_hq_schema.sql & 0002_financial_management.sql)

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

const CANONICAL_INVOICE_STATUSES = ['draft', 'issued', 'partially-paid', 'paid', 'overdue', 'void'];

export const generateInvoiceNumber = (db) => nextSequenceNumber(db, 'invoice', 'INV');

function normalizeStatus(statusInput) {
  if (!statusInput || typeof statusInput !== 'string') return 'issued';
  const clean = statusInput.trim().toLowerCase().replace(/\s+/g, '-');
  return CANONICAL_INVOICE_STATUSES.includes(clean) ? clean : 'issued';
}

export function computeInvoiceTotals(items = [], discountMinor = 0, taxRateBps = 0) {
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
  const totalTaxMinor = normalizedItems.reduce((sum, i) => sum + i.taxMinor, 0);
  const totalDiscountMinor = normalizedItems.reduce((sum, i) => sum + i.discountMinor, 0);
  const totalMinor = normalizedItems.reduce((sum, i) => sum + i.lineTotalMinor, 0);

  return { normalizedItems, subtotalMinor, totalTaxMinor, totalDiscountMinor, totalMinor };
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
      const invoice = await db
        .prepare(
          `SELECT i.*,
                  i.issued_on AS issue_date,
                  i.due_on AS due_date,
                  i.amount_paid_minor AS paid_amount_minor,
                  (i.total_minor - i.amount_paid_minor) AS balance_due_minor,
                  c.business_name AS client_business,
                  c.name AS client_name,
                  c.email AS client_email,
                  c.billing_address AS client_address,
                  p.name AS project_name
           FROM invoices i
           JOIN clients c ON c.id = i.client_id
           LEFT JOIN projects p ON p.id = i.project_id
           WHERE i.id = ? AND i.archived_at IS NULL`
        )
        .bind(id)
        .first();
      if (!invoice) return errorResponse(404, 'NOT_FOUND', 'Invoice not found');

      const [items, payments] = await Promise.all([
        db
          .prepare(
            `SELECT id, invoice_id, description, quantity_milli,
                    ROUND(quantity_milli / 1000.0, 3) AS quantity,
                    unit_price_minor, discount_minor, tax_rate_bps, tax_minor,
                    line_total_minor, sort_order, created_at
             FROM invoice_items
             WHERE invoice_id = ?
             ORDER BY sort_order ASC`
          )
          .bind(id)
          .all(),
        db
          .prepare(
            `SELECT p.*, p.paid_at AS payment_date
             FROM payments p
             WHERE p.invoice_id = ? AND p.archived_at IS NULL
             ORDER BY p.paid_at DESC`
          )
          .bind(id)
          .all()
      ]);

      return jsonResponse({
        success: true,
        invoice,
        items: items.results || [],
        payments: payments.results || []
      });
    }

    const conditions = ['i.archived_at IS NULL'];
    const params = [];
    if (clientId) {
      conditions.push('i.client_id = ?');
      params.push(clientId);
    }
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const rows = await db
      .prepare(
        `SELECT i.*,
                i.issued_on AS issue_date,
                i.due_on AS due_date,
                i.amount_paid_minor AS paid_amount_minor,
                (i.total_minor - i.amount_paid_minor) AS balance_due_minor,
                c.business_name AS client_business,
                c.name AS client_name,
                p.name AS project_name
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
         LEFT JOIN projects p ON p.id = i.project_id
         ${whereClause}
         ORDER BY i.issued_on DESC, i.created_at DESC`
      )
      .bind(...params)
      .all();

    return jsonResponse({ success: true, invoices: rows.results || [] });
  } catch (err) {
    console.error('[HQ Invoices GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve invoices');
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
  if (!clientId) {
    return errorResponse(400, 'INVALID_INPUT', 'Client ID is required');
  }

  const db = env.HQ_DB;
  const client = await db.prepare(`SELECT id FROM clients WHERE id = ? AND archived_at IS NULL`).bind(clientId).first();
  if (!client) return errorResponse(404, 'NOT_FOUND', 'Client not found');

  const calc = computeInvoiceTotals(
    body.items,
    body.discount_minor ?? body.discountMinor,
    body.tax_rate_bps ?? body.taxRateBps
  );
  if (calc.normalizedItems.length === 0) {
    return errorResponse(400, 'INVALID_INPUT', 'At least one invoice line item is required');
  }

  const id = crypto.randomUUID();
  let invoiceNumber = cleanString(body.invoice_number || body.invoiceNumber, 80);
  if (!invoiceNumber) {
    try {
      invoiceNumber = await generateInvoiceNumber(db);
    } catch (e) {
      const yr = new Date().getFullYear().toString().slice(-2);
      invoiceNumber = `INV-${yr}-${Date.now().toString().slice(-6)}`;
    }
  }

  const nowIso = new Date().toISOString();
  const issueDate = cleanString(body.issued_on || body.issue_date || body.issueDate, 30) || nowIso.slice(0, 10);
  const dueDate =
    cleanString(body.due_on || body.due_date || body.dueDate, 30) ||
    new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10);
  const status = normalizeStatus(body.status);

  // Preserve title inside notes if title is present and distinct from notes
  let combinedNotes = cleanString(body.notes, 3000);
  if (title) {
    combinedNotes = combinedNotes ? `[${title}]\n\n${combinedNotes}` : `[${title}]`;
  }

  const stmts = [
    db
      .prepare(
        `INSERT INTO invoices (
          id, invoice_number, client_id, project_id, quotation_id, status,
          currency, subtotal_minor, tax_minor, total_minor, amount_paid_minor,
          issued_on, due_on, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        invoiceNumber,
        clientId,
        cleanString(body.project_id || body.projectId, 128) || null,
        cleanString(body.quotation_id || body.quotationId, 128) || null,
        status,
        cleanString(body.currency || 'INR', 10).toUpperCase(),
        calc.subtotalMinor,
        calc.totalTaxMinor,
        calc.totalMinor,
        issueDate,
        dueDate,
        combinedNotes || null,
        auth.owner.uid,
        nowIso,
        nowIso
      )
  ];

  for (const item of calc.normalizedItems) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO invoice_items (
            id, invoice_id, description, quantity_milli, unit_price_minor,
            discount_minor, tax_rate_bps, tax_minor, line_total_minor, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          item.sortOrder
        )
    );
  }

  try {
    await db.batch(stmts);
  } catch (err) {
    console.error('[HQ Invoices POST Error]', err);
    const msg = String(err?.message || '');
    if (msg.includes('UNIQUE constraint failed') || msg.includes('constraint failed')) {
      return errorResponse(409, 'DUPLICATE_INVOICE_NUMBER', 'An invoice with this invoice number already exists');
    }
    return errorResponse(500, 'SERVER_ERROR', 'Failed to create invoice record');
  }
  const created = await db
    .prepare(
      `SELECT i.*,
              i.issued_on AS issue_date,
              i.due_on AS due_date,
              i.amount_paid_minor AS paid_amount_minor,
              (i.total_minor - i.amount_paid_minor) AS balance_due_minor
       FROM invoices i
       WHERE i.id = ?`
    )
    .bind(id)
    .first();

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'INVOICE_CREATED',
    entityType: 'invoices',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: created
  });

  return jsonResponse({ success: true, invoice: created }, 201);
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const id = cleanString(body.id, 128);
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Invoice ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM invoices WHERE id = ? AND archived_at IS NULL`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Invoice not found');

  const nowIso = new Date().toISOString();
  const nextStatus = body.status ? normalizeStatus(body.status) : existing.status;
  const issueDate = cleanString(body.issued_on || body.issue_date || body.issueDate, 30) || existing.issued_on;
  const dueDate = cleanString(body.due_on || body.due_date || body.dueDate, 30) || existing.due_on;
  let notes = body.notes !== undefined ? cleanString(body.notes, 3000) : existing.notes;
  if (body.title) {
    const title = cleanString(body.title, 200);
    notes = notes ? `[${title}]\n\n${notes}` : `[${title}]`;
  }

  if (Array.isArray(body.items)) {
    const calc = computeInvoiceTotals(
      body.items,
      body.discount_minor ?? body.discountMinor ?? 0,
      body.tax_rate_bps ?? body.taxRateBps ?? 0
    );

    const stmts = [
      db
        .prepare(
          `UPDATE invoices
           SET status = ?, currency = ?, subtotal_minor = ?, tax_minor = ?,
               total_minor = ?, issued_on = ?, due_on = ?, notes = ?, updated_at = ?
           WHERE id = ? AND archived_at IS NULL`
        )
        .bind(
          nextStatus,
          cleanString(body.currency ?? existing.currency, 10).toUpperCase(),
          calc.subtotalMinor,
          calc.totalTaxMinor,
          calc.totalMinor,
          issueDate,
          dueDate,
          notes,
          nowIso,
          id
        ),
      db.prepare(`DELETE FROM invoice_items WHERE invoice_id = ?`).bind(id)
    ];

    for (const item of calc.normalizedItems) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO invoice_items (
              id, invoice_id, description, quantity_milli, unit_price_minor,
              discount_minor, tax_rate_bps, tax_minor, line_total_minor, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            item.sortOrder
          )
      );
    }
    try {
      await db.batch(stmts);
    } catch (err) {
      console.error('[HQ Invoices PUT Error]', err);
      return errorResponse(500, 'SERVER_ERROR', 'Failed to update invoice record');
    }
  } else {
    await db
      .prepare(
        `UPDATE invoices
         SET status = ?, issued_on = ?, due_on = ?, notes = ?, updated_at = ?
         WHERE id = ? AND archived_at IS NULL`
      )
      .bind(nextStatus, issueDate, dueDate, notes, nowIso, id)
      .run();
  }

  const updated = await db
    .prepare(
      `SELECT i.*,
              i.issued_on AS issue_date,
              i.due_on AS due_date,
              i.amount_paid_minor AS paid_amount_minor,
              (i.total_minor - i.amount_paid_minor) AS balance_due_minor
       FROM invoices i
       WHERE i.id = ?`
    )
    .bind(id)
    .first();

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'INVOICE_UPDATED',
    entityType: 'invoices',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: existing,
    after: updated
  });

  return jsonResponse({ success: true, invoice: updated });
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Invoice ID is required');

  const db = env.HQ_DB;
  const existing = await db.prepare(`SELECT * FROM invoices WHERE id = ? AND archived_at IS NULL`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Invoice not found');

  const nowIso = new Date().toISOString();
  await db
    .prepare(`UPDATE invoices SET archived_at = ?, archived_by = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL`)
    .bind(nowIso, auth.owner.uid, nowIso, id)
    .run();

  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'INVOICE_ARCHIVED',
    entityType: 'invoices',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: existing,
    after: { ...existing, archived_at: nowIso, archived_by: auth.owner.uid }
  });

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions(context) {
  return hqOptionsResponse(context, 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
}
