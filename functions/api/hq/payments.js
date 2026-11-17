// functions/api/hq/payments.js
// Studio HQ Payment Records API (Idempotent, NEVER stores payment card data)

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse,
  readJsonBody,
  cleanString,
  auditLog
} from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId') || '';
  const invoiceId = url.searchParams.get('invoiceId') || '';

  try {
    const conditions = [];
    const params = [];
    if (clientId) {
      conditions.push('pay.client_id = ?');
      params.push(clientId);
    }
    if (invoiceId) {
      conditions.push('pay.invoice_id = ?');
      params.push(invoiceId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db
      .prepare(
        `SELECT pay.*, i.invoice_number, i.title AS invoice_title,
                c.business_name AS client_business, c.name AS client_name
         FROM payments pay
         JOIN invoices i ON i.id = pay.invoice_id
         JOIN clients c ON c.id = pay.client_id
         ${whereClause}
         ORDER BY pay.payment_date DESC, pay.created_at DESC`
      )
      .bind(...params)
      .all();

    return jsonResponse({ success: true, payments: rows.results || [] });
  } catch (err) {
    console.error('[HQ Payments GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve payment records');
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  // Reject any attempt to send sensitive card details
  if (body.card_number || body.cardNumber || body.cvv || body.cvc || body.pan) {
    return errorResponse(
      400,
      'PROHIBITED_CARD_DATA',
      'Payment card details must never be transmitted or stored in Studio HQ'
    );
  }

  const invoiceId = cleanString(body.invoice_id || body.invoiceId, 128);
  const amountMinor = Math.round(Number(body.amount_minor ?? body.amountMinor ?? 0));
  if (!invoiceId || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return errorResponse(400, 'INVALID_INPUT', 'Invoice ID and positive payment amount are required');
  }

  const db = env.HQ_DB;
  const idempotencyKey = cleanString(
    request.headers.get('x-idempotency-key') || body.idempotencyKey || '',
    128
  );

  if (idempotencyKey) {
    const existingKey = await db
      .prepare(`SELECT payment_id FROM payment_idempotency_keys WHERE idempotency_key = ?`)
      .bind(idempotencyKey)
      .first();
    if (existingKey) {
      const existingPayment = await db
        .prepare(`SELECT * FROM payments WHERE id = ?`)
        .bind(existingKey.payment_id)
        .first();
      return jsonResponse({ success: true, idempotentReplay: true, payment: existingPayment });
    }
  }

  const invoice = await db.prepare(`SELECT * FROM invoices WHERE id = ?`).bind(invoiceId).first();
  if (!invoice) return errorResponse(404, 'NOT_FOUND', 'Invoice not found');
  if (invoice.status === 'Void') {
    return errorResponse(400, 'INVALID_STATE', 'Cannot record payment against a voided invoice');
  }

  const currentPaid = Number(invoice.paid_amount_minor || 0);
  const nextPaid = currentPaid + amountMinor;
  const nextBalance = Math.max(0, Number(invoice.total_minor || 0) - nextPaid);
  const nextStatus = nextBalance === 0 ? 'Paid' : 'Partially Paid';

  const paymentId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const paymentDate = cleanString(body.payment_date || body.paymentDate, 30) || nowIso.slice(0, 10);

  const stmts = [
    db
      .prepare(
        `INSERT INTO payments (
          id, invoice_id, client_id, amount_minor, currency, payment_method,
          reference_number, payment_date, notes, status, recorded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Recorded', ?, ?)`
      )
      .bind(
        paymentId,
        invoiceId,
        invoice.client_id,
        amountMinor,
        invoice.currency,
        cleanString(body.payment_method || body.paymentMethod || 'Bank Transfer', 80),
        cleanString(body.reference_number || body.referenceNumber, 120),
        paymentDate,
        cleanString(body.notes, 1000),
        auth.owner.email,
        nowIso
      ),
    db
      .prepare(
        `UPDATE invoices
         SET paid_amount_minor = ?, balance_due_minor = ?, status = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(nextPaid, nextBalance, nextStatus, nowIso, invoiceId)
  ];

  if (idempotencyKey) {
    stmts.push(
      db
        .prepare(`INSERT INTO payment_idempotency_keys (idempotency_key, payment_id, created_at) VALUES (?, ?, ?)`)
        .bind(idempotencyKey, paymentId, nowIso)
    );
  }

  await db.batch(stmts);
  const created = await db.prepare(`SELECT * FROM payments WHERE id = ?`).bind(paymentId).first();
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'PAYMENT_RECORDED',
    entityType: 'payments',
    entityId: paymentId,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    after: { invoiceId, amountMinor, nextStatus, nextBalance }
  });

  return jsonResponse({ success: true, payment: created, invoiceStatus: nextStatus, balanceDueMinor: nextBalance }, 201);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Payment ID is required');

  const db = env.HQ_DB;
  const payment = await db.prepare(`SELECT * FROM payments WHERE id = ?`).bind(id).first();
  if (!payment) return errorResponse(404, 'NOT_FOUND', 'Payment not found');
  if (payment.status === 'Reversed') return errorResponse(400, 'ALREADY_REVERSED', 'Payment already reversed');

  const invoice = await db.prepare(`SELECT * FROM invoices WHERE id = ?`).bind(payment.invoice_id).first();
  const nowIso = new Date().toISOString();

  const stmts = [db.prepare(`UPDATE payments SET status = 'Reversed' WHERE id = ?`).bind(id)];
  if (invoice) {
    const nextPaid = Math.max(0, Number(invoice.paid_amount_minor || 0) - Number(payment.amount_minor || 0));
    const nextBalance = Math.max(0, Number(invoice.total_minor || 0) - nextPaid);
    const nextStatus = nextPaid === 0 ? 'Issued' : nextBalance === 0 ? 'Paid' : 'Partially Paid';
    stmts.push(
      db
        .prepare(`UPDATE invoices SET paid_amount_minor = ?, balance_due_minor = ?, status = ?, updated_at = ? WHERE id = ?`)
        .bind(nextPaid, nextBalance, nextStatus, nowIso, invoice.id)
    );
  }

  await db.batch(stmts);
  await auditLog(db, {
    actorUid: auth.owner.uid,
    actorEmail: auth.owner.email,
    action: 'PAYMENT_REVERSED',
    entityType: 'payments',
    entityId: id,
    requestId: auth.requestId,
    ipAddress: auth.ipAddress,
    before: payment
  });

  return jsonResponse({ success: true, reversedId: id });
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, POST, DELETE, OPTIONS');
}
