// functions/api/hq/invoices.js
// Studio HQ Invoices & Line-Items API (Canonical `invoices` & `invoice_items`)

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

const INVOICE_STATUSES = ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Void'];

export function computeInvoiceTotals(items = [], discountMinor = 0, taxRateBps = 0) {
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
      const invoice = await db
        .prepare(
          `SELECT i.*, c.business_name AS client_business, c.name AS client_name, c.email AS client_email,
                  c.address AS client_address, p.name AS project_name
           FROM invoices i
           JOIN clients c ON c.id = i.client_id
           LEFT JOIN projects p ON p.id = i.project_id
           WHERE i.id = ?`
        )
        .bind(id)
        .first();
      if (!invoice) return errorResponse(404, 'NOT_FOUND', 'Invoice not found');

      const [items, payments] = await Promise.all([
        db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC`).bind(id).all(),
        db.prepare(`SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC`).bind(id).all()
      ]);

      return jsonResponse({
        success: true,
        invoice,
        items: items.results || [],
        payments: payments.results || []
      });
    }

    const conditions = [];
    const params = [];
    if (clientId) {
      conditions.push('i.client_id = ?');
      params.push(clientId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db
      .prepare(
        `SELECT i.*, c.business_name AS client_business, c.name AS client_name, p.name AS project_name
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
         LEFT JOIN projects p ON p.id = i.project_id
         ${whereClause}
         ORDER BY i.issue_date DESC, i.created_at DESC`
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
  if (!clientId || !title) {
    return errorResponse(400, 'INVALID_INPUT', 'Customer and invoice title are required');
  }

  const db = env.HQ_DB;
  const client = await db.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse(404, 'NOT_FOUND', 'Customer not found');

  const calc = computeInvoiceTotals(
    body.items,
    body.discount_minor ?? body.discountMinor,
    body.tax_rate_bps ?? body.taxRateBps
  );
  if (calc.normalizedItems.length === 0) {
    return errorResponse(400, 'INVALID_INPUT', 'At least one invoice line item is required');
  }

  const id = crypto.randomUUID();
  const invoiceNumber = await nextSequenceNumber(db, 'invoice', 'INV');
  const nowIso = new Date().toISOString();
  const issueDate = cleanString(body.issue_date || body.issueDate, 30) || nowIso.slice(0, 10);
  const dueDate =
    cleanString(body.due_date || body.dueDate, 30) ||
    new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10);
  const status = INVOICE_STATUSES.includes(body.status) ? body.status : 'Issued';

  const stmts = [
    db
      .prepare(
        `INSERT INTO invoices (
          id, invoice_number, client_id, project_id, quotation_id, title, status,
          currency, subtotal_minor, discount_minor, tax_rate_bps, tax_minor, total_minor,
          paid_amount_minor, balance_due_minor, issue_date, due_date, notes, terms,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        invoiceNumber,
        clientId,
        cleanString(body.project_id || body.projectId, 128) || null,
        cleanString(body.quotation_id || body.quotationId, 128) || null,
        title,
        status,
        cleanString(body.currency || 'INR', 10).toUpperCase(),
        calc.subtotalMinor,
        calc.safeDiscount,
        calc.safeTaxBps,
        calc.taxMinor,
        calc.totalMinor,
        calc.totalMinor,
        issueDate,
        dueDate,
        cleanString(body.notes, 3000),
        cleanString(body.terms, 3000),
        auth.owner.uid,
        nowIso,
        nowIso
      )
  ];

  for (const item of calc.normalizedItems) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price_minor, line_total_minor, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), id, item.description, item.quantity, item.unitPriceMinor, item.lineTotalMinor, item.sortOrder)
    );
  }

  await db.batch(stmts);
  const created = await db.prepare(`SELECT * FROM invoices WHERE id = ?`).bind(id).first();
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
  const existing = await db.prepare(`SELECT * FROM invoices WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse(404, 'NOT_FOUND', 'Invoice not found');

  const nowIso = new Date().toISOString();
  const nextStatus = INVOICE_STATUSES.includes(body.status) ? body.status : existing.status;

  if (Array.isArray(body.items)) {
    const calc = computeInvoiceTotals(
      body.items,
      body.discount_minor ?? body.discountMinor ?? existing.discount_minor,
      body.tax_rate_bps ?? body.taxRateBps ?? existing.tax_rate_bps
    );
    const balanceDue = Math.max(0, calc.totalMinor - Number(existing.paid_amount_minor || 0));
    const stmts = [
      db
        .prepare(
          `UPDATE invoices
           SET title = ?, status = ?, currency = ?, subtotal_minor = ?, discount_minor = ?,
               tax_rate_bps = ?, tax_minor = ?, total_minor = ?, balance_due_minor = ?,
               issue_date = ?, due_date = ?, notes = ?, terms = ?, updated_at = ?
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
          balanceDue,
          cleanString(body.issue_date ?? existing.issue_date, 30),
          cleanString(body.due_date ?? existing.due_date, 30),
          cleanString(body.notes ?? existing.notes, 3000),
          cleanString(body.terms ?? existing.terms, 3000),
          nowIso,
          id
        ),
      db.prepare(`DELETE FROM invoice_items WHERE invoice_id = ?`).bind(id)
    ];
    for (const item of calc.normalizedItems) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price_minor, line_total_minor, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(crypto.randomUUID(), id, item.description, item.quantity, item.unitPriceMinor, item.lineTotalMinor, item.sortOrder)
      );
    }
    await db.batch(stmts);
  } else {
    await db
      .prepare(
        `UPDATE invoices SET status = ?, title = ?, due_date = ?, notes = ?, terms = ?, updated_at = ? WHERE id = ?`
      )
      .bind(
        nextStatus,
        cleanString(body.title ?? existing.title, 200),
        cleanString(body.due_date ?? existing.due_date, 30),
        cleanString(body.notes ?? existing.notes, 3000),
        cleanString(body.terms ?? existing.terms, 3000),
        nowIso,
        id
      )
      .run();
  }

  const updated = await db.prepare(`SELECT * FROM invoices WHERE id = ?`).bind(id).first();
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
  const result = await db.prepare(`DELETE FROM invoices WHERE id = ?`).bind(id).run();
  if ((result?.meta?.changes ?? 0) === 0) return errorResponse(404, 'NOT_FOUND', 'Invoice not found');

  return jsonResponse({ success: true, deletedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse();
}
