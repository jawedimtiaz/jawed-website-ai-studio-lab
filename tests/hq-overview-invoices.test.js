// tests/hq-overview-invoices.test.js
// Regression test suite for canonical Studio HQ Overview and Invoices APIs

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { clearJwksCacheForTests } from '../functions/lib/hqAuth.js';
import { dispatchHqApiRequest } from '../functions/lib/hqRouter.js';
import { createLocalD1, applyHqMigrations } from '../functions/lib/localD1.js';

const PROJECT_ID = 'test-studio-hq-project';
const KEY_ID = 'overview-invoices-test-key-1';
const OWNER_UID = 'owner-uid-overview-test';
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

describe('Studio HQ Canonical Overview & Invoices Regression Suite', () => {
  let db;
  let env;
  let originalFetch;

  beforeEach(async () => {
    clearJwksCacheForTests();
    originalFetch = globalThis.fetch;
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
      .prepare(`INSERT INTO hq_users (uid, email, display_name, status, created_at, last_seen_at) VALUES (?, ?, ?, 'active', ?, ?)`)
      .bind(OWNER_UID, OWNER_EMAIL, 'Jawed Imtiaz', nowIso, nowIso)
      .run();

    env = {
      ENVIRONMENT: 'test',
      FIREBASE_PROJECT_ID: PROJECT_ID,
      HQ_ALLOWED_OWNER_EMAILS: 'jawed@jawed.co.in,jawedimtiaz@gmail.com',
      HQ_DB: db
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearJwksCacheForTests();
    db.close();
  });

  test('1. Unauthenticated requests to /api/hq/invoices and /api/hq/overview return 401', async () => {
    const unauthInvoices = await apiCall(env, '/api/hq/invoices', { token: null });
    assert.equal(unauthInvoices.status, 401);
    assert.equal(unauthInvoices.data.success, false);

    const unauthOverview = await apiCall(env, '/api/hq/overview', { token: null });
    assert.equal(unauthOverview.status, 401);
    assert.equal(unauthOverview.data.success, false);
  });

  test('2. Authenticated GET /api/hq/invoices on clean database returns 200 and empty list', async () => {
    const res = await apiCall(env, '/api/hq/invoices');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.deepEqual(res.data.invoices, []);
  });

  test('3. Authenticated GET /api/hq/overview on clean database returns 200 with zeroed KPIs and empty distributions', async () => {
    const res = await apiCall(env, '/api/hq/overview');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.kpis, 'kpis object should be present');
    assert.equal(res.data.kpis.totalCustomers, 0);
    assert.equal(res.data.kpis.activeCustomers, 0);
    assert.equal(res.data.kpis.newLeads, 0);
    assert.equal(res.data.kpis.openLeads, 0);
    assert.equal(res.data.kpis.activeProjects, 0);
    assert.equal(res.data.kpis.completedProjects, 0);
    assert.equal(res.data.kpis.totalProjects, 0);
    assert.equal(res.data.kpis.invoicedAmountMinor, 0);
    assert.equal(res.data.kpis.paymentsReceivedMinor, 0);
    assert.equal(res.data.kpis.outstandingPaymentsMinor, 0);
    assert.equal(res.data.kpis.monthlyRevenueMinor, 0);
    assert.equal(res.data.kpis.monthlyExpensesMinor, 0);
    assert.deepEqual(res.data.revenueSeries, []);
    assert.deepEqual(res.data.projectDistribution, []);
    assert.deepEqual(res.data.recentDeployments, []);
    assert.deepEqual(res.data.upcomingDeadlines, []);
    assert.deepEqual(res.data.pendingApprovalsList, []);
    assert.deepEqual(res.data.recentActivity, []);
  });

  test('4. Invoices CRUD flow: Create invoice, fetch list and detail, verify totals and items', async () => {
    const nowIso = new Date().toISOString();
    const clientId = 'test-client-inv-1';

    // Insert active client
    await db
      .prepare(`INSERT INTO clients (id, client_code, name, business_name, status, email, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`)
      .bind(clientId, 'CLI-001', 'Acme Corp', 'Acme Technologies', 'billing@acme.com', OWNER_UID, nowIso, nowIso)
      .run();

    // Create Invoice with 2 line items
    const createRes = await apiCall(env, '/api/hq/invoices', {
      method: 'POST',
      body: {
        client_id: clientId,
        title: 'Q4 Cloud Architecture',
        status: 'issued',
        currency: 'INR',
        items: [
          { description: 'Cloud Architecture Setup', quantity: 1, unit_price_minor: 5000000 },
          { description: 'Security Hardening', quantity: 2, unit_price_minor: 1500000 }
        ],
        tax_rate_bps: 1800 // 18% GST
      }
    });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.success, true);
    const invoice = createRes.data.invoice;
    assert.ok(invoice.id);
    assert.ok(invoice.invoice_number);
    assert.equal(invoice.status, 'issued');
    assert.equal(invoice.subtotal_minor, 8000000); // 50,000 + 30,000 = 80,000 INR
    assert.equal(invoice.tax_minor, 1440000); // 18% of 80,000 = 14,400 INR
    assert.equal(invoice.total_minor, 9440000); // 94,400 INR
    assert.equal(invoice.amount_paid_minor, 0);
    assert.equal(invoice.paid_amount_minor, 0);
    assert.equal(invoice.balance_due_minor, 9440000);

    // List invoices
    const listRes = await apiCall(env, '/api/hq/invoices');
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.invoices.length, 1);
    assert.equal(listRes.data.invoices[0].id, invoice.id);
    assert.equal(listRes.data.invoices[0].client_name, 'Acme Corp');

    // Get invoice detail
    const detailRes = await apiCall(env, `/api/hq/invoices?id=${invoice.id}`);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.data.invoice.id, invoice.id);
    assert.equal(detailRes.data.items.length, 2);
    assert.equal(detailRes.data.items[0].description, 'Cloud Architecture Setup');
    assert.equal(detailRes.data.items[0].quantity, 1);
  });

  test('5. Executive Overview computes aggregated KPIs accurately with populated business data', async () => {
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);
    const currentMonth = nowIso.slice(0, 7);

    // 1. Insert Client (Lead)
    const leadId = 'client-lead-1';
    await db
      .prepare(`INSERT INTO clients (id, client_code, name, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'lead', ?, ?, ?)`)
      .bind(leadId, 'CLI-LEAD-1', 'Prospective Client', OWNER_UID, nowIso, nowIso)
      .run();

    // 2. Insert Client (Active)
    const clientId = 'client-active-1';
    await db
      .prepare(`INSERT INTO clients (id, client_code, name, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)`)
      .bind(clientId, 'CLI-ACT-1', 'Active Client Corp', OWNER_UID, nowIso, nowIso)
      .run();

    // 3. Insert Project (in-progress)
    const projectId = 'proj-active-1';
    await db
      .prepare(`INSERT INTO projects (id, project_code, client_id, name, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'in-progress', ?, ?, ?)`)
      .bind(projectId, 'PRJ-001', clientId, 'Studio Redesign', OWNER_UID, nowIso, nowIso)
      .run();

    // 4. Insert Invoice (issued: 100,000 total, 40,000 paid)
    const invoiceId = 'inv-test-overview-1';
    await db
      .prepare(`INSERT INTO invoices (id, invoice_number, client_id, project_id, status, subtotal_minor, tax_minor, total_minor, amount_paid_minor, issued_on, due_on, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'issued', 10000000, 0, 10000000, 4000000, ?, ?, ?, ?, ?)`)
      .bind(invoiceId, 'INV-2026-0001', clientId, projectId, today, today, OWNER_UID, nowIso, nowIso)
      .run();

    // 5. Insert Payment (40,000 paid this month)
    const paymentId = 'pay-test-overview-1';
    await db
      .prepare(`INSERT INTO payments (id, invoice_id, amount_minor, paid_at, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(paymentId, invoiceId, 4000000, nowIso, OWNER_UID, nowIso)
      .run();

    // 6. Insert Overdue Task
    const taskId = 'task-overdue-1';
    await db
      .prepare(`INSERT INTO project_tasks (id, project_id, title, status, due_date, created_by, created_at, updated_at) VALUES (?, ?, ?, 'todo', '2026-01-01', ?, ?, ?)`)
      .bind(taskId, projectId, 'Overdue Design Review', OWNER_UID, nowIso, nowIso)
      .run();

    // 7. Insert Maintenance Plan expiring in 10 days
    const maintId = 'maint-active-1';
    const renewDate = new Date(Date.now() + 10 * 86400 * 1000).toISOString().slice(0, 10);
    await db
      .prepare(`INSERT INTO maintenance_plans (id, client_id, project_id, name, status, renews_on, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`)
      .bind(maintId, clientId, projectId, 'Monthly Care', renewDate, OWNER_UID, nowIso, nowIso)
      .run();

    // Fetch Overview
    const overviewRes = await apiCall(env, '/api/hq/overview');
    assert.equal(overviewRes.status, 200);
    assert.equal(overviewRes.data.success, true);
    const kpis = overviewRes.data.kpis;

    assert.equal(kpis.totalCustomers, 2);
    assert.equal(kpis.activeCustomers, 1);
    assert.equal(kpis.openLeads, 1);
    assert.equal(kpis.newLeads, 1);
    assert.equal(kpis.activeProjects, 1);
    assert.equal(kpis.invoicedAmountMinor, 10000000);
    assert.equal(kpis.paymentsReceivedMinor, 4000000);
    assert.equal(kpis.outstandingPaymentsMinor, 6000000);
    assert.equal(kpis.monthlyRevenueMinor, 4000000);
    assert.equal(kpis.monthlyExpensesMinor, 0);
    assert.equal(kpis.overdueTasks, 1);
    assert.equal(kpis.upcomingRenewals, 1);

    // Revenue series check
    assert.equal(overviewRes.data.revenueSeries.length, 1);
    assert.equal(overviewRes.data.revenueSeries[0].month, currentMonth);
    assert.equal(overviewRes.data.revenueSeries[0].revenueMinor, 4000000);
  });
});
