// tests/hq-crm-financial-foundation.test.js
// Regression test suite for Studio HQ Core CRM & Financial Foundation APIs:
// - Leads API (/api/hq/leads)
// - Payments API (/api/hq/payments)
// - Quotations API (/api/hq/quotations)
// - Analytics API (/api/hq/analytics)
// Validates strict reconciliation with canonical D1 schema (0001_studio_hq_schema.sql & 0002_financial_management.sql)

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { clearJwksCacheForTests } from '../functions/lib/hqAuth.js';
import { dispatchHqApiRequest } from '../functions/lib/hqRouter.js';
import { createLocalD1, applyHqMigrations } from '../functions/lib/localD1.js';

const PROJECT_ID = 'test-studio-hq-crm-fin';
const KEY_ID = 'crm-fin-foundation-key-1';
const OWNER_UID = 'owner-uid-crm-fin-test';
const OWNER_EMAIL = 'jawed@jawed.co.in';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: KEY_ID,
  alg: 'RS256',
  use: 'sig'
};

function toB64Url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signTestToken(uid = OWNER_UID, email = OWNER_EMAIL) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: KEY_ID };
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: uid,
    user_id: uid,
    email,
    email_verified: true,
    name: 'Jawed Imtiaz',
    iat: now - 30,
    auth_time: now - 30,
    exp: now + 3600
  };
  const signingInput = `${toB64Url(header)}.${toB64Url(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${toB64Url(signer.sign(privateKey))}`;
}

async function apiCall(env, path, { method = 'GET', body, token = signTestToken(), headers = {} } = {}) {
  const reqHeaders = new Headers(headers);
  if (token) {
    reqHeaders.set('Authorization', `Bearer ${token}`);
  }
  if (body !== undefined && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json');
  }
  const url = `https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev${path}`;
  const req = new Request(url, {
    method,
    headers: reqHeaders,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
  const pathname = new URL(url).pathname;
  const response = await dispatchHqApiRequest(pathname, { request: req, env });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

describe('Studio HQ Core CRM & Financial Foundation APIs (Phase 3Y)', () => {
  let db;
  let env;

  beforeEach(async () => {
    clearJwksCacheForTests();
    globalThis.fetch = async (url) => {
      if (String(url).includes('securetoken@system.gserviceaccount.com')) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' }
        });
      }
      throw new Error(`Unexpected external fetch: ${url}`);
    };

    db = createLocalD1(':memory:');
    applyHqMigrations(db);

    const nowIso = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO hq_users (uid, email, display_name, status, created_at, last_seen_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      )
      .bind(OWNER_UID, OWNER_EMAIL, 'Jawed Imtiaz', nowIso, nowIso)
      .run();

    env = {
      ENVIRONMENT: 'test',
      FIREBASE_PROJECT_ID: PROJECT_ID,
      HQ_DB: db,
      CF_PAGES: '1'
    };
  });

  // =========================================================================
  // 1. Authentication & Security Gatekeeping
  // =========================================================================
  describe('1. Authentication Gatekeeping', () => {
    test('Unauthenticated calls to all four APIs are rejected with 401', async () => {
      const endpoints = [
        { path: '/api/hq/leads', method: 'GET' },
        { path: '/api/hq/leads', method: 'POST', body: { name: 'Test' } },
        { path: '/api/hq/payments', method: 'GET' },
        { path: '/api/hq/payments', method: 'POST', body: { invoiceId: 'inv-1', amountMinor: 100 } },
        { path: '/api/hq/quotations', method: 'GET' },
        { path: '/api/hq/quotations', method: 'POST', body: { clientId: 'c-1', title: 'Q' } },
        { path: '/api/hq/analytics', method: 'GET' }
      ];

      for (const ep of endpoints) {
        const res = await apiCall(env, ep.path, { method: ep.method, body: ep.body, token: null });
        assert.equal(res.status, 401, `Expected 401 for ${ep.method} ${ep.path}`);
        assert.equal(res.data.success, false);
      }
    });
  });

  // =========================================================================
  // 2. Leads API Reconciliation
  // =========================================================================
  describe('2. Leads API (/api/hq/leads)', () => {
    test('GET /api/hq/leads on empty database returns empty array and total: 0', async () => {
      const res = await apiCall(env, '/api/hq/leads');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.leads, []);
      assert.equal(res.data.total, 0);
    });

    test('POST /api/hq/leads creates lead mapped to canonical clients table', async () => {
      const payload = {
        business_name: 'Acme Robotics',
        contact_name: 'Wile E. Coyote',
        email: 'wile@acme.example.com',
        phone: '+91 98765 43210',
        website: 'https://acme.example.com',
        source: 'Referral',
        notes: 'Inquiry for laboratory automation website'
      };

      const res = await apiCall(env, '/api/hq/leads', { method: 'POST', body: payload });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      const lead = res.data.lead;
      assert.ok(lead.id);
      assert.equal(lead.business_name, 'Acme Robotics');
      assert.equal(lead.contact_name, 'Wile E. Coyote');
      assert.equal(lead.name, 'Wile E. Coyote');
      assert.equal(lead.email, 'wile@acme.example.com');
      assert.equal(lead.status, 'New');
      assert.equal(lead.canonical_status, 'lead');

      // Verify canonical record in clients table
      const inDb = await db.prepare(`SELECT * FROM clients WHERE id = ?`).bind(lead.id).first();
      assert.ok(inDb);
      assert.equal(inDb.status, 'lead');
      assert.equal(inDb.name, 'Wile E. Coyote');
      assert.equal(inDb.business_name, 'Acme Robotics');
      assert.equal(inDb.website_url, 'https://acme.example.com');
      assert.equal(inDb.created_by, OWNER_UID);

      // Verify contact created
      const contact = await db.prepare(`SELECT * FROM client_contacts WHERE client_id = ?`).bind(lead.id).first();
      assert.ok(contact);
      assert.equal(contact.full_name, 'Wile E. Coyote');
      assert.equal(contact.is_primary, 1);
    });

    test('POST /api/hq/leads creates Qualified lead with canonical status prospect', async () => {
      const payload = {
        business_name: 'Cyberdyne Systems',
        contact_name: 'Miles Dyson',
        status: 'Qualified'
      };

      const res = await apiCall(env, '/api/hq/leads', { method: 'POST', body: payload });
      assert.equal(res.status, 201);
      assert.equal(res.data.lead.status, 'Qualified');
      assert.equal(res.data.lead.canonical_status, 'prospect');

      const inDb = await db.prepare(`SELECT status FROM clients WHERE id = ?`).bind(res.data.lead.id).first();
      assert.equal(inDb.status, 'prospect');
    });

    test('GET /api/hq/leads filters by status and search query', async () => {
      // Create 2 leads
      await apiCall(env, '/api/hq/leads', {
        method: 'POST',
        body: { business_name: 'Stark Industries', contact_name: 'Tony Stark', status: 'New' }
      });
      await apiCall(env, '/api/hq/leads', {
        method: 'POST',
        body: { business_name: 'Wayne Enterprises', contact_name: 'Bruce Wayne', status: 'Qualified' }
      });

      // Filter by Qualified
      const qualRes = await apiCall(env, '/api/hq/leads?status=Qualified');
      assert.equal(qualRes.status, 200);
      assert.equal(qualRes.data.leads.length, 1);
      assert.equal(qualRes.data.leads[0].business_name, 'Wayne Enterprises');

      // Search by keyword
      const searchRes = await apiCall(env, '/api/hq/leads?q=stark');
      assert.equal(searchRes.status, 200);
      assert.equal(searchRes.data.leads.length, 1);
      assert.equal(searchRes.data.leads[0].contact_name, 'Tony Stark');
    });

    test('PUT /api/hq/leads updates lead details', async () => {
      const created = await apiCall(env, '/api/hq/leads', {
        method: 'POST',
        body: { business_name: 'Oscorp', contact_name: 'Norman Osborn' }
      });
      const leadId = created.data.lead.id;

      const updateRes = await apiCall(env, '/api/hq/leads', {
        method: 'PUT',
        body: { id: leadId, status: 'Qualified', notes: 'Discussed next-gen defense contract' }
      });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.data.lead.status, 'Qualified');
      assert.equal(updateRes.data.lead.notes, 'Discussed next-gen defense contract');
    });

    test('POST /api/hq/leads with action=convert atomically converts lead to active customer and project', async () => {
      const created = await apiCall(env, '/api/hq/leads', {
        method: 'POST',
        body: { business_name: 'Initech', contact_name: 'Peter Gibbons' }
      });
      const leadId = created.data.lead.id;

      const convertRes = await apiCall(env, '/api/hq/leads', {
        method: 'POST',
        body: {
          action: 'convert',
          leadId,
          createProject: true,
          projectName: 'Initech TPS Portal'
        }
      });

      assert.equal(convertRes.status, 201);
      assert.equal(convertRes.data.success, true);
      assert.equal(convertRes.data.clientId, leadId);
      assert.ok(convertRes.data.projectId);

      // Verify client is active
      const client = await db.prepare(`SELECT status FROM clients WHERE id = ?`).bind(leadId).first();
      assert.equal(client.status, 'active');

      // Verify project is created
      const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(convertRes.data.projectId).first();
      assert.ok(project);
      assert.equal(project.client_id, leadId);
      assert.equal(project.name, 'Initech TPS Portal');
      assert.equal(project.status, 'discovery');

      // Second conversion attempt must return 409
      const reConvert = await apiCall(env, '/api/hq/leads', {
        method: 'POST',
        body: { action: 'convert', leadId }
      });
      assert.equal(reConvert.status, 409);
      assert.equal(reConvert.data.error.code, 'ALREADY_CONVERTED');
    });

    test('DELETE /api/hq/leads performs soft deletion preserving audit history', async () => {
      const created = await apiCall(env, '/api/hq/leads', {
        method: 'POST',
        body: { business_name: 'Hooli', contact_name: 'Gavin Belson' }
      });
      const leadId = created.data.lead.id;

      const delRes = await apiCall(env, `/api/hq/leads?id=${leadId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);
      assert.equal(delRes.data.deletedId, leadId);

      // Verify client is soft-deleted
      const inDb = await db.prepare(`SELECT archived_at, archived_by FROM clients WHERE id = ?`).bind(leadId).first();
      assert.ok(inDb.archived_at);
      assert.equal(inDb.archived_by, OWNER_UID);

      // Excluded from GET listing
      const listRes = await apiCall(env, '/api/hq/leads');
      assert.ok(!listRes.data.leads.some((l) => l.id === leadId));
    });
  });

  // =========================================================================
  // 3. Payments API Reconciliation
  // =========================================================================
  describe('3. Payments API (/api/hq/payments)', () => {
    let testClientId;
    let testInvoiceId;

    beforeEach(async () => {
      const nowIso = new Date().toISOString();
      testClientId = 'cli-payments-test-1';
      testInvoiceId = 'inv-payments-test-1';

      await db
        .prepare(
          `INSERT INTO clients (id, client_code, name, business_name, status, created_by, created_at, updated_at)
           VALUES (?, 'CLI-PAY-1', 'Oliver Queen', 'Queen Consolidated', 'active', ?, ?, ?)`
        )
        .bind(testClientId, OWNER_UID, nowIso, nowIso)
        .run();

      await db
        .prepare(
          `INSERT INTO invoices (
            id, invoice_number, client_id, status, subtotal_minor, tax_minor, total_minor,
            amount_paid_minor, issued_on, due_on, notes, created_by, created_at, updated_at
          ) VALUES (?, 'INV-2026-0001', ?, 'issued', 10000000, 1800000, 11800000, 0, '2026-11-01', '2026-11-15', 'Security Retainer', ?, ?, ?)`
        )
        .bind(testInvoiceId, testClientId, OWNER_UID, nowIso, nowIso)
        .run();
    });

    test('GET /api/hq/payments on empty database returns empty array', async () => {
      const res = await apiCall(env, '/api/hq/payments');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.payments, []);
    });

    test('POST /api/hq/payments rejects prohibited payment card numbers', async () => {
      const res = await apiCall(env, '/api/hq/payments', {
        method: 'POST',
        body: { invoiceId: testInvoiceId, amountMinor: 500000, card_number: '4111111111111111' }
      });
      assert.equal(res.status, 400);
      assert.equal(res.data.error.code, 'PROHIBITED_CARD_DATA');
    });

    test('POST /api/hq/payments rejects amount exceeding balance', async () => {
      const res = await apiCall(env, '/api/hq/payments', {
        method: 'POST',
        body: { invoiceId: testInvoiceId, amountMinor: 20000000 } // Total is 11,800,000
      });
      assert.equal(res.status, 400);
      assert.equal(res.data.error.code, 'INVALID_INPUT');
    });

    test('POST /api/hq/payments records payment, updates invoice balance & status', async () => {
      const payload = {
        invoiceId: testInvoiceId,
        amountMinor: 5000000, // 50,000 INR
        payment_method: 'Bank Transfer',
        reference_number: 'NEFT-88392019',
        notes: 'First milestone tranche'
      };

      const res = await apiCall(env, '/api/hq/payments', { method: 'POST', body: payload });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.equal(res.data.invoiceStatus, 'partially-paid');
      assert.equal(res.data.balanceDueMinor, 6800000);

      const pay = res.data.payment;
      assert.ok(pay.id);
      assert.equal(pay.amount_minor, 5000000);
      assert.equal(pay.payment_method, 'bank-transfer');
      assert.equal(pay.invoice_id, testInvoiceId);
      assert.equal(pay.client_id, testClientId);
      assert.equal(pay.client_business, 'Queen Consolidated');

      // Verify canonical payment in D1
      const inDb = await db.prepare(`SELECT * FROM payments WHERE id = ?`).bind(pay.id).first();
      assert.ok(inDb);
      assert.equal(inDb.amount_minor, 5000000);
      assert.equal(inDb.payment_method, 'bank-transfer');
      assert.equal(inDb.recorded_by, OWNER_UID);

      // Verify invoice updated
      const invInDb = await db.prepare(`SELECT * FROM invoices WHERE id = ?`).bind(testInvoiceId).first();
      assert.equal(invInDb.amount_paid_minor, 5000000);
      assert.equal(invInDb.status, 'partially-paid');
    });

    test('POST /api/hq/payments with full balance marks invoice as paid', async () => {
      const res = await apiCall(env, '/api/hq/payments', {
        method: 'POST',
        body: {
          invoiceId: testInvoiceId,
          amountMinor: 11800000, // exact full total
          payment_method: 'UPI',
          reference_number: 'UPI-9920120'
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.invoiceStatus, 'paid');
      assert.equal(res.data.balanceDueMinor, 0);

      const inv = await db.prepare(`SELECT status, amount_paid_minor FROM invoices WHERE id = ?`).bind(testInvoiceId).first();
      assert.equal(inv.status, 'paid');
      assert.equal(inv.amount_paid_minor, 11800000);
    });

    test('POST /api/hq/payments idempotent replay returns existing payment without double recording', async () => {
      const idempotencyKey = 'idem-key-payments-test-12345';
      const payload = {
        invoiceId: testInvoiceId,
        amountMinor: 2000000,
        payment_method: 'UPI',
        idempotencyKey
      };

      const first = await apiCall(env, '/api/hq/payments', { method: 'POST', body: payload });
      assert.equal(first.status, 201);
      const paymentId = first.data.payment.id;

      // Replay identical request
      const replay = await apiCall(env, '/api/hq/payments', { method: 'POST', body: payload });
      assert.equal(replay.status, 200);
      assert.equal(replay.data.idempotentReplay, true);
      assert.equal(replay.data.payment.id, paymentId);

      // Verify only 1 payment row exists in DB
      const payCount = await db
        .prepare(`SELECT COUNT(*) AS total FROM payments WHERE invoice_id = ?`)
        .bind(testInvoiceId)
        .first();
      assert.equal(payCount.total, 1);
    });

    test('DELETE /api/hq/payments reverses payment and restores invoice balance', async () => {
      const createRes = await apiCall(env, '/api/hq/payments', {
        method: 'POST',
        body: { invoiceId: testInvoiceId, amountMinor: 3000000, payment_method: 'Bank Transfer' }
      });
      const paymentId = createRes.data.payment.id;

      const delRes = await apiCall(env, `/api/hq/payments?id=${paymentId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);
      assert.equal(delRes.data.reversedId, paymentId);

      // Verify payment soft-deleted
      const payInDb = await db.prepare(`SELECT archived_at, archived_by FROM payments WHERE id = ?`).bind(paymentId).first();
      assert.ok(payInDb.archived_at);
      assert.equal(payInDb.archived_by, OWNER_UID);

      // Verify invoice amount_paid_minor reverted to 0 and status back to issued
      const invInDb = await db.prepare(`SELECT amount_paid_minor, status FROM invoices WHERE id = ?`).bind(testInvoiceId).first();
      assert.equal(invInDb.amount_paid_minor, 0);
      assert.equal(invInDb.status, 'issued');
    });
  });

  // =========================================================================
  // 4. Quotations API Reconciliation
  // =========================================================================
  describe('4. Quotations API (/api/hq/quotations)', () => {
    let testClientId;

    beforeEach(async () => {
      const nowIso = new Date().toISOString();
      testClientId = 'cli-quotations-test-1';
      await db
        .prepare(
          `INSERT INTO clients (id, client_code, name, business_name, billing_address, status, created_by, created_at, updated_at)
           VALUES (?, 'CLI-QUO-1', 'Arthur Dent', 'Dent Enterprises', '42 Hitchhiker Way, London', 'active', ?, ?, ?)`
        )
        .bind(testClientId, OWNER_UID, nowIso, nowIso)
        .run();
    });

    test('GET /api/hq/quotations on empty database returns empty array', async () => {
      const res = await apiCall(env, '/api/hq/quotations');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.quotations, []);
    });

    test('POST /api/hq/quotations creates quotation with items in milli-precision', async () => {
      const payload = {
        clientId: testClientId,
        title: 'Full Website Redesign',
        terms: 'Payment 50% advance, 50% on delivery',
        status: 'Draft',
        items: [
          { description: 'Design Sprint & Wireframing', quantity: 1, unit_price_minor: 4000000 },
          { description: 'Cloudflare Workers Setup', quantity: 2, unit_price_minor: 2500000 }
        ]
      };

      const res = await apiCall(env, '/api/hq/quotations', { method: 'POST', body: payload });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);

      const quote = res.data.quotation;
      assert.ok(quote.id);
      assert.ok(quote.quote_number);
      assert.equal(quote.quotation_number, quote.quote_number);
      assert.equal(quote.status, 'draft');
      assert.equal(quote.subtotal_minor, 9000000); // 40,000 + 50,000 = 90,000 INR
      assert.equal(quote.total_minor, 9000000);

      // Verify items in quotation_items
      const items = await db.prepare(`SELECT * FROM quotation_items WHERE quotation_id = ?`).bind(quote.id).all();
      assert.equal(items.results.length, 2);
      assert.equal(items.results[0].quantity_milli, 1000);
      assert.equal(items.results[1].quantity_milli, 2000);

      // Detail query with client address
      const detailRes = await apiCall(env, `/api/hq/quotations?id=${quote.id}`);
      assert.equal(detailRes.status, 200);
      assert.equal(detailRes.data.quotation.client_address, '42 Hitchhiker Way, London');
      assert.equal(detailRes.data.items.length, 2);
      assert.equal(detailRes.data.items[1].quantity, 2);
    });

    test('POST /api/hq/quotations with action=convert_to_invoice atomically converts to invoice', async () => {
      // 1. Create quote
      const created = await apiCall(env, '/api/hq/quotations', {
        method: 'POST',
        body: {
          clientId: testClientId,
          title: 'Consulting Contract',
          items: [{ description: 'Strategy Roadmap', quantity: 1, unit_price_minor: 5000000 }]
        }
      });
      const quoteId = created.data.quotation.id;

      // 2. Convert to invoice
      const convertRes = await apiCall(env, '/api/hq/quotations', {
        method: 'POST',
        body: { action: 'convert_to_invoice', quotationId: quoteId, due_date: '2026-12-01' }
      });

      assert.equal(convertRes.status, 201);
      assert.equal(convertRes.data.success, true);
      const invoice = convertRes.data.invoice;
      assert.ok(invoice.id);
      assert.ok(invoice.invoice_number);
      assert.equal(invoice.quotation_id, quoteId);
      assert.equal(invoice.status, 'issued');
      assert.equal(invoice.total_minor, 5000000);

      // Verify quotation marked as accepted
      const quoteInDb = await db.prepare(`SELECT status FROM quotations WHERE id = ?`).bind(quoteId).first();
      assert.equal(quoteInDb.status, 'accepted');

      // Verify invoice items populated
      const invItems = await db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ?`).bind(invoice.id).all();
      assert.equal(invItems.results.length, 1);
      assert.equal(invItems.results[0].description, 'Strategy Roadmap');
      assert.equal(invItems.results[0].quantity_milli, 1000);
    });

    test('DELETE /api/hq/quotations soft deletes quotation', async () => {
      const created = await apiCall(env, '/api/hq/quotations', {
        method: 'POST',
        body: {
          clientId: testClientId,
          title: 'Discarded Quote',
          items: [{ description: 'Draft Concept', quantity: 1, unit_price_minor: 1000000 }]
        }
      });
      const quoteId = created.data.quotation.id;

      const delRes = await apiCall(env, `/api/hq/quotations?id=${quoteId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);
      assert.equal(delRes.data.deletedId, quoteId);

      const inDb = await db.prepare(`SELECT archived_at, archived_by FROM quotations WHERE id = ?`).bind(quoteId).first();
      assert.ok(inDb.archived_at);
      assert.equal(inDb.archived_by, OWNER_UID);

      const listRes = await apiCall(env, '/api/hq/quotations');
      assert.ok(!listRes.data.quotations.some((q) => q.id === quoteId));
    });
  });

  // =========================================================================
  // 5. Analytics API Reconciliation
  // =========================================================================
  describe('5. Analytics API (/api/hq/analytics)', () => {
    test('GET /api/hq/analytics on empty database returns zeroed KPIs and empty arrays', async () => {
      const res = await apiCall(env, '/api/hq/analytics');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.deepEqual(res.data.summary, {
        totalRevenueMinor: 0,
        totalExpensesMinor: 0,
        netProfitMinor: 0,
        totalOutstandingMinor: 0,
        overdueOutstandingMinor: 0
      });
      assert.deepEqual(res.data.monthlySeries, []);
      assert.deepEqual(res.data.customerPerformance, []);
      assert.deepEqual(res.data.projectPerformance, []);
      assert.deepEqual(res.data.outstandingInvoices, []);
    });

    test('GET /api/hq/analytics computes accurate metrics with populated business data', async () => {
      const nowIso = new Date().toISOString();
      const currentMonth = nowIso.slice(0, 7);
      const clientId = 'cli-analytics-1';
      const projectId = 'prj-analytics-1';
      const invPaidId = 'inv-analytics-paid';
      const invDueId = 'inv-analytics-due';
      const payId = 'pay-analytics-1';

      // 1. Client
      await db
        .prepare(
          `INSERT INTO clients (id, client_code, name, business_name, status, created_by, created_at, updated_at)
           VALUES (?, 'CLI-AN-1', 'Wayne Enterprises', 'Wayne Tech', 'active', ?, ?, ?)`
        )
        .bind(clientId, OWNER_UID, nowIso, nowIso)
        .run();

      // 2. Project
      await db
        .prepare(
          `INSERT INTO projects (id, project_code, client_id, name, status, quoted_amount_minor, created_by, created_at, updated_at)
           VALUES (?, 'PRJ-AN-1', ?, 'Batcave Infra', 'in-progress', 50000000, ?, ?, ?)`
        )
        .bind(projectId, clientId, OWNER_UID, nowIso, nowIso)
        .run();

      // 3. Project Tasks & QA checks
      await db
        .prepare(
          `INSERT INTO project_tasks (id, project_id, title, status, created_by, created_at, updated_at)
           VALUES ('t-1', ?, 'Task 1', 'done', ?, ?, ?)`
        )
        .bind(projectId, OWNER_UID, nowIso, nowIso)
        .run();
      await db
        .prepare(
          `INSERT INTO qa_checks (id, project_id, category, check_name, result, checked_by, created_at, updated_at)
           VALUES ('qa-1', ?, 'functionality', 'Check 1', 'fail', ?, ?, ?)`
        )
        .bind(projectId, OWNER_UID, nowIso, nowIso)
        .run();

      // 4. Invoices: one paid, one outstanding
      await db
        .prepare(
          `INSERT INTO invoices (
            id, invoice_number, client_id, project_id, status, subtotal_minor, tax_minor, total_minor,
            amount_paid_minor, issued_on, due_on, created_by, created_at, updated_at
          ) VALUES (?, 'INV-AN-1', ?, ?, 'paid', 20000000, 0, 20000000, 20000000, '2026-11-01', '2026-11-15', ?, ?, ?)`
        )
        .bind(invPaidId, clientId, projectId, OWNER_UID, nowIso, nowIso)
        .run();

      await db
        .prepare(
          `INSERT INTO invoices (
            id, invoice_number, client_id, project_id, status, subtotal_minor, tax_minor, total_minor,
            amount_paid_minor, issued_on, due_on, created_by, created_at, updated_at
          ) VALUES (?, 'INV-AN-2', ?, ?, 'issued', 15000000, 0, 15000000, 5000000, '2026-11-05', '2026-11-20', ?, ?, ?)`
        )
        .bind(invDueId, clientId, projectId, OWNER_UID, nowIso, nowIso)
        .run();

      // 5. Payments: 200,000 + 50,000 = 250,000 INR
      await db
        .prepare(
          `INSERT INTO payments (id, invoice_id, amount_minor, paid_at, recorded_by, created_at)
           VALUES (?, ?, 20000000, ?, ?, ?)`
        )
        .bind(payId, invPaidId, nowIso, OWNER_UID, nowIso)
        .run();

      await db
        .prepare(
          `INSERT INTO payments (id, invoice_id, amount_minor, paid_at, recorded_by, created_at)
           VALUES ('pay-analytics-2', ?, 5000000, ?, ?, ?)`
        )
        .bind(invDueId, nowIso, OWNER_UID, nowIso)
        .run();

      const res = await apiCall(env, '/api/hq/analytics');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);

      // Verify summary
      assert.equal(res.data.summary.totalRevenueMinor, 25000000);
      assert.equal(res.data.summary.totalExpensesMinor, 0);
      assert.equal(res.data.summary.netProfitMinor, 25000000);
      assert.equal(res.data.summary.totalOutstandingMinor, 10000000); // 15M - 5M = 10M

      // Verify monthly series
      assert.equal(res.data.monthlySeries.length, 1);
      assert.equal(res.data.monthlySeries[0].month, currentMonth);
      assert.equal(res.data.monthlySeries[0].revenueMinor, 25000000);
      assert.equal(res.data.monthlySeries[0].paymentCount, 2);

      // Verify customer performance
      assert.equal(res.data.customerPerformance.length, 1);
      assert.equal(res.data.customerPerformance[0].id, clientId);
      assert.equal(res.data.customerPerformance[0].invoiced_minor, 35000000);
      assert.equal(res.data.customerPerformance[0].paid_minor, 25000000);
      assert.equal(res.data.customerPerformance[0].outstanding_minor, 10000000);

      // Verify project performance
      assert.equal(res.data.projectPerformance.length, 1);
      assert.equal(res.data.projectPerformance[0].name, 'Batcave Infra');
      assert.equal(res.data.projectPerformance[0].total_tasks, 1);
      assert.equal(res.data.projectPerformance[0].completed_tasks, 1);
      assert.equal(res.data.projectPerformance[0].open_defects, 1);

      // Verify outstanding invoices
      assert.equal(res.data.outstandingInvoices.length, 1);
      assert.equal(res.data.outstandingInvoices[0].id, invDueId);
      assert.equal(res.data.outstandingInvoices[0].balance_due_minor, 10000000);
    });
  });
});
