// functions/api/hq/payments.js
// Studio HQ Payment Records API (Idempotent, NEVER stores payment card data)
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

/**
 * Normalizes payment methods to canonical D1 constraint:
 * ('bank-transfer','upi','cash','card','other')
 */
function normalizePaymentMethod(method) {
  if (!method || typeof method !== 'string') return 'bank-transfer';
  const clean = method.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const valid = ['bank-transfer', 'upi', 'cash', 'card', 'other'];
  if (valid.includes(clean)) return clean;
  if (clean.includes('bank') || clean.includes('transfer') || clean.includes('wire') || clean.includes('neft') || clean.includes('rtgs')) {
    return 'bank-transfer';
  }
  if (clean.includes('upi')) return 'upi';
  if (clean.includes('card') || clean.includes('credit') || clean.includes('debit')) return 'card';
  if (clean.includes('cash')) return 'cash';
  return 'other';
}

/**
 * Generates a SHA-256 hex fingerprint (64 characters) for payment idempotency.
 */
async function computeSha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId') || '';
  const invoiceId = url.searchParams.get('invoiceId') || '';

  try {
    const conditions = ['pay.archived_at IS NULL'];
    const params = [];

    if (clientId) {
      conditions.push('i.client_id = ?');
      params.push(clientId);
    }
    if (invoiceId) {
      conditions.push('pay.invoice_id = ?');
      params.push(invoiceId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const rows = await db
      .prepare(
        `SELECT pay.id, pay.invoice_id, pay.amount_minor, pay.currency, pay.payment_method,
                pay.reference_number, pay.paid_at, pay.notes, pay.recorded_by, pay.created_at,
                pay.paid_at AS payment_date, 'Recorded' AS status,
                i.client_id, i.invoice_number,
                COALESCE(i.notes, i.invoice_number) AS invoice_title,
                c.business_name AS client_business, c.name AS client_name
         FROM payments pay
         JOIN invoices i ON i.id = pay.invoice_id
         JOIN clients c ON c.id = i.client_id
         ${whereClause}
         ORDER BY pay.paid_at DESC, pay.created_at DESC`
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

  // Strict check: reject any attempt to send payment card data
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

  // Check idempotency replay if valid key provided
  if (idempotencyKey && idempotencyKey.length >= 16) {
    try {
      const existingKey = await db
        .prepare(`SELECT payment_id FROM payment_idempotency_keys WHERE idempotency_key = ?`)
        .bind(idempotencyKey)
        .first();

      if (existingKey) {
        const existingPayment = await db
          .prepare(
            `SELECT pay.*, pay.paid_at AS payment_date, 'Recorded' AS status,
                    i.client_id, i.invoice_number,
                    COALESCE(i.notes, i.invoice_number) AS invoice_title,
                    c.business_name AS client_business, c.name AS client_name
             FROM payments pay
             JOIN invoices i ON i.id = pay.invoice_id
             JOIN clients c ON c.id = i.client_id
             WHERE pay.id = ?`
          )
          .bind(existingKey.payment_id)
          .first();

        return jsonResponse({ success: true, idempotentReplay: true, payment: existingPayment });
      }
    } catch (e) {
      console.warn('[HQ Payments Idempotency Lookup Warning]', e?.message || e);
    }
  }

  const invoice = await db
    .prepare(`SELECT * FROM invoices WHERE id = ? AND archived_at IS NULL`)
    .bind(invoiceId)
    .first();

  if (!invoice) return errorResponse(404, 'NOT_FOUND', 'Invoice not found');
  if (String(invoice.status).toLowerCase() === 'void') {
    return errorResponse(400, 'INVALID_STATE', 'Cannot record payment against a voided invoice');
  }

  const currentPaid = Number(invoice.amount_paid_minor || 0);
  const totalMinor = Number(invoice.total_minor || 0);
  const remainingDue = Math.max(0, totalMinor - currentPaid);

  if (amountMinor > remainingDue) {
    return errorResponse(
      400,
      'INVALID_INPUT',
      `Payment amount (${amountMinor}) exceeds remaining balance (${remainingDue})`
    );
  }

  const nextPaid = currentPaid + amountMinor;
  const nextBalance = Math.max(0, totalMinor - nextPaid);
  const nextStatus = nextBalance === 0 ? 'paid' : 'partially-paid';

  const paymentId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const paidAt = cleanString(body.payment_date || body.paymentDate || body.paid_at, 50) || nowIso;
  const paymentMethod = normalizePaymentMethod(body.payment_method || body.paymentMethod);
  const referenceNumber = cleanString(body.reference_number || body.referenceNumber, 120);
  const notes = cleanString(body.notes, 1000);

  const stmts = [
    db
      .prepare(
        `INSERT INTO payments (
          id, invoice_id, amount_minor, currency, payment_method,
          reference_number, paid_at, recorded_by, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        paymentId,
        invoiceId,
        amountMinor,
        invoice.currency || 'INR',
        paymentMethod,
        referenceNumber,
        paidAt,
        auth.owner.uid,
        notes,
        nowIso
      ),
    db
      .prepare(
        `UPDATE invoices
         SET amount_paid_minor = ?, status = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(nextPaid, nextStatus, nowIso, invoiceId)
  ];

  if (idempotencyKey && idempotencyKey.length >= 16) {
    const fingerprint = await computeSha256(`${idempotencyKey}:${invoiceId}:${amountMinor}`);
    stmts.push(
      db
        .prepare(
          `INSERT INTO payment_idempotency_keys (
            id, idempotency_key, invoice_id, payment_id, request_fingerprint, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), idempotencyKey, invoiceId, paymentId, fingerprint, nowIso)
    );
  }

  try {
    await db.batch(stmts);

    const created = await db
      .prepare(
        `SELECT pay.*, pay.paid_at AS payment_date, 'Recorded' AS status,
                i.client_id, i.invoice_number,
                COALESCE(i.notes, i.invoice_number) AS invoice_title,
                c.business_name AS client_business, c.name AS client_name
         FROM payments pay
         JOIN invoices i ON i.id = pay.invoice_id
         JOIN clients c ON c.id = i.client_id
         WHERE pay.id = ?`
      )
      .bind(paymentId)
      .first();

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

    return jsonResponse(
      {
        success: true,
        payment: created,
        invoiceStatus: nextStatus,
        balanceDueMinor: nextBalance
      },
      201
    );
  } catch (err) {
    console.error('[HQ Payments POST Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to record payment');
  }
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse(400, 'INVALID_INPUT', 'Payment ID is required');

  const db = env.HQ_DB;
  const payment = await db
    .prepare(`SELECT * FROM payments WHERE id = ? AND archived_at IS NULL`)
    .bind(id)
    .first();

  if (!payment) return errorResponse(404, 'NOT_FOUND', 'Payment not found');

  const invoice = await db
    .prepare(`SELECT * FROM invoices WHERE id = ?`)
    .bind(payment.invoice_id)
    .first();

  const nowIso = new Date().toISOString();

  // Soft delete payment and recalculate invoice balance
  const stmts = [
    db
      .prepare(`UPDATE payments SET archived_at = ?, archived_by = ? WHERE id = ?`)
      .bind(nowIso, auth.owner.uid, id)
  ];

  if (invoice) {
    const nextPaid = Math.max(0, Number(invoice.amount_paid_minor || 0) - Number(payment.amount_minor || 0));
    const nextBalance = Math.max(0, Number(invoice.total_minor || 0) - nextPaid);
    const nextStatus = nextPaid === 0 ? 'issued' : nextBalance === 0 ? 'paid' : 'partially-paid';

    stmts.push(
      db
        .prepare(
          `UPDATE invoices
           SET amount_paid_minor = ?, status = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(nextPaid, nextStatus, nowIso, invoice.id)
    );
  }

  try {
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
  } catch (err) {
    console.error('[HQ Payments DELETE Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to reverse payment');
  }
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, POST, DELETE, OPTIONS');
}
