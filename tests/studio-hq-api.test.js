// tests/studio-hq-api.test.js
// End-to-End API Integration Tests Across All 8 Studio HQ Modules using In-Memory SQLite D1

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { clearJwksCacheForTests } from '../functions/lib/hqAuth.js';
import { dispatchHqApiRequest } from '../functions/lib/hqRouter.js';
import { createLocalD1, applyHqMigrations } from '../functions/lib/localD1.js';

const PROJECT_ID = 'refined-actor-skhlb';
const KEY_ID = 'api-test-key-1';
const OWNER_UID = 'studio-owner-uid-1';
const OWNER_EMAIL = 'jawedimtiaz@gmail.com';

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
  const url = `https://lab.jawed.co.in${path}`;
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

describe('Studio HQ End-to-End Business Platform API Suite', () => {
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
      HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com,jawed@jawed.co.in',
      HQ_DB: db
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearJwksCacheForTests();
    db.close();
  });

  test('1. Protected endpoints reject missing credentials & enforce 64KB body cap', async () => {
    const unauth = await apiCall(env, '/api/hq/overview', { token: null });
    assert.equal(unauth.status, 401);

    const oversized = await apiCall(env, '/api/hq/leads', {
      method: 'POST',
      body: JSON.stringify({ business_name: 'A'.repeat(70000), contact_name: 'Oversize' })
    });
    assert.equal(oversized.status, 413);
    assert.equal(oversized.data.error.code, 'PAYLOAD_TOO_LARGE');
  });

  test('2. Full CRM Lifecycle: Lead -> Qualify -> Atomic Convert -> Customer 360 -> Contacts/Follow-ups/Notes -> Archive/Restore', async () => {
    // Create lead
    const leadRes = await apiCall(env, '/api/hq/leads', {
      method: 'POST',
      body: {
        business_name: 'Acme Retail Pvt Ltd',
        contact_name: 'Rohan Mehta',
        email: 'rohan@acmeretail.example',
        phone: '+91-9876543210',
        category: 'E-Commerce',
        source: 'Website',
        estimated_value_minor: 15000000
      }
    });
    assert.equal(leadRes.status, 201);
    const leadId = leadRes.data.lead.id;
    assert.equal(leadRes.data.lead.status, 'New');

    // Qualify lead
    const qualRes = await apiCall(env, '/api/hq/leads', {
      method: 'PUT',
      body: { id: leadId, status: 'Qualified' }
    });
    assert.equal(qualRes.status, 200);
    assert.equal(qualRes.data.lead.status, 'Qualified');

    // Atomic convert lead -> client + initial project + contact
    const convRes = await apiCall(env, '/api/hq/leads', {
      method: 'POST',
      body: {
        action: 'convert',
        leadId,
        createProject: true,
        projectName: 'Acme Storefront Rebuild'
      }
    });
    assert.equal(convRes.status, 201);
    const clientId = convRes.data.clientId;
    const projectId = convRes.data.projectId;
    assert.ok(clientId);
    assert.ok(projectId);

    // Add Secondary Contact, Follow-up, Communication Note
    const contactRes = await apiCall(env, '/api/hq/contacts', {
      method: 'POST',
      body: { client_id: clientId, name: 'Priya Finance', role: 'Accounts', email: 'priya@acmeretail.example' }
    });
    assert.equal(contactRes.status, 201);

    const fuRes = await apiCall(env, '/api/hq/follow-ups', {
      method: 'POST',
      body: {
        client_id: clientId,
        project_id: projectId,
        title: 'Kickoff Discovery Call',
        channel: 'Video Call',
        scheduled_at: '2026-12-01T10:00'
      }
    });
    assert.equal(fuRes.status, 201);

    const noteRes = await apiCall(env, '/api/hq/notes', {
      method: 'POST',
      body: {
        client_id: clientId,
        project_id: projectId,
        note_type: 'Call',
        subject: 'Architecture Sign-off',
        content: 'Customer confirmed headless checkout requirements.'
      }
    });
    assert.equal(noteRes.status, 201);

    // Customer 360° Isolated Detail Bundle
    const detailRes = await apiCall(env, `/api/hq/clients?id=${clientId}`);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.data.client.business_name, 'Acme Retail Pvt Ltd');
    assert.equal(detailRes.data.contacts.length, 2); // primary + secondary
    assert.equal(detailRes.data.followUps.length, 1);
    assert.equal(detailRes.data.notes.length, 1);
    assert.equal(detailRes.data.projects.length, 1);

    // Archive & Restore Customer
    const archRes = await apiCall(env, '/api/hq/clients', {
      method: 'PUT',
      body: { id: clientId, status: 'archived' }
    });
    assert.equal(archRes.status, 200);
    assert.equal(archRes.data.client.status, 'archived');

    const restRes = await apiCall(env, '/api/hq/clients', {
      method: 'PUT',
      body: { id: clientId, status: 'active' }
    });
    assert.equal(restRes.status, 200);
    assert.equal(restRes.data.client.status, 'active');
  });

  test('3. Financials, Server-Side Math, Quotation->Invoice Conversion, Idempotent Payments & Card-Data Rejection', async () => {
    const cRes = await apiCall(env, '/api/hq/clients', {
      method: 'POST',
      body: { business_name: 'FinTest Studio Client', name: 'Asha', email: 'asha@fintest.example', status: 'active' }
    });
    const clientId = cRes.data.client.id;

    const pRes = await apiCall(env, '/api/hq/projects', {
      method: 'POST',
      body: { client_id: clientId, name: 'SaaS Portal Build', status: 'In Progress', quoted_amount_minor: 1121000 }
    });
    const projectId = pRes.data.project.id;

    // Create Quotation: 2 * 5000.00 = 10000.00 (1,000,000 minor), discount 500.00 (50,000 minor), 18% tax -> taxable 950,000, tax 171,000, total 1,121,000
    const qRes = await apiCall(env, '/api/hq/quotations', {
      method: 'POST',
      body: {
        client_id: clientId,
        project_id: projectId,
        title: 'Phase 1 Implementation Quote',
        currency: 'INR',
        discount_minor: 50000,
        tax_rate_bps: 1800,
        items: [{ description: 'SaaS Architecture & APIs', quantity: 2, unit_price_minor: 500000 }]
      }
    });
    assert.equal(qRes.status, 201);
    const quote = qRes.data.quotation;
    assert.equal(quote.subtotal_minor, 1000000);
    assert.equal(quote.tax_minor, 171000);
    assert.equal(quote.total_minor, 1121000);
    assert.match(quote.quotation_number, /^QUO-\d{4}-0001$/);

    // Create Proposal linked to Quotation
    const propRes = await apiCall(env, '/api/hq/proposals', {
      method: 'POST',
      body: {
        client_id: clientId,
        project_id: projectId,
        quotation_id: quote.id,
        title: 'Technical Delivery Proposal',
        amount_minor: 1121000,
        status: 'Sent'
      }
    });
    assert.equal(propRes.status, 201);
    assert.match(propRes.data.proposal.proposal_number, /^PRP-\d{4}-0001$/);

    // Convert Quotation -> Invoice
    const invConv = await apiCall(env, '/api/hq/quotations', {
      method: 'POST',
      body: { action: 'convert_to_invoice', quotationId: quote.id }
    });
    assert.equal(invConv.status, 201);
    const invoice = invConv.data.invoice;
    assert.match(invoice.invoice_number, /^INV-\d{4}-0001$/);
    assert.equal(invoice.total_minor, 1121000);
    assert.equal(invoice.balance_due_minor, 1121000);
    assert.equal(invoice.status, 'Issued');

    // Reject sensitive payment card payload (never stored!)
    const badCardRes = await apiCall(env, '/api/hq/payments', {
      method: 'POST',
      body: {
        invoice_id: invoice.id,
        amount_minor: 500000,
        payment_method: 'Card Gateway',
        card_number: '4111-XXXX'
      }
    });
    assert.equal(badCardRes.status, 400);
    assert.equal(badCardRes.data.error.code, 'PROHIBITED_CARD_DATA');

    // Idempotent Partial Payment
    const idemKey = 'pay-idem-test-001';
    const pay1 = await apiCall(env, '/api/hq/payments', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idemKey },
      body: {
        invoice_id: invoice.id,
        amount_minor: 500000,
        payment_method: 'UPI',
        reference_number: 'UPI-123456'
      }
    });
    assert.equal(pay1.status, 201);

    // Replay same idempotency key — must NOT double-record payment
    const payReplay = await apiCall(env, '/api/hq/payments', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idemKey },
      body: {
        invoice_id: invoice.id,
        amount_minor: 500000,
        payment_method: 'UPI',
        reference_number: 'UPI-123456'
      }
    });
    assert.equal(payReplay.status, 200);
    assert.equal(payReplay.data.idempotentReplay, true);

    const invAfterPartial = await apiCall(env, `/api/hq/invoices?id=${invoice.id}`);
    assert.equal(invAfterPartial.data.invoice.status, 'Partially Paid');
    assert.equal(invAfterPartial.data.invoice.paid_amount_minor, 500000);
    assert.equal(invAfterPartial.data.invoice.balance_due_minor, 621000);

    // Record remaining payment -> Invoice becomes Paid
    const pay2 = await apiCall(env, '/api/hq/payments', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': 'pay-idem-test-002' },
      body: {
        invoice_id: invoice.id,
        amount_minor: 621000,
        payment_method: 'NEFT',
        reference_number: 'NEFT-7890'
      }
    });
    assert.equal(pay2.status, 201);

    const invAfterFull = await apiCall(env, `/api/hq/invoices?id=${invoice.id}`);
    assert.equal(invAfterFull.data.invoice.status, 'Paid');
    assert.equal(invAfterFull.data.invoice.balance_due_minor, 0);

    // Reverse second payment -> recalculates cleanly back to Partially Paid
    const revRes = await apiCall(env, `/api/hq/payments?id=${encodeURIComponent(pay2.data.payment.id)}`, {
      method: 'DELETE'
    });
    assert.equal(revRes.status, 200);

    const invAfterRev = await apiCall(env, `/api/hq/invoices?id=${invoice.id}`);
    assert.equal(invAfterRev.data.invoice.status, 'Partially Paid');
    assert.equal(invAfterRev.data.invoice.paid_amount_minor, 500000);
    assert.equal(invAfterRev.data.invoice.balance_due_minor, 621000);

    // Expense creation
    const expRes = await apiCall(env, '/api/hq/expenses', {
      method: 'POST',
      body: {
        client_id: clientId,
        project_id: projectId,
        category: 'Hosting',
        vendor: 'Cloudflare',
        description: 'Workers Paid Plan',
        amount_minor: 100000,
        incurred_date: new Date().toISOString().slice(0, 10)
      }
    });
    assert.equal(expRes.status, 201);
  });

  test('4. Projects, Operations, Development, Executive Overview, Analytics & Settings/Audit Aggregations', async () => {
    const cRes = await apiCall(env, '/api/hq/clients', {
      method: 'POST',
      body: { business_name: 'Ops Dev Corp', name: 'Neha', email: 'neha@opsdev.example', status: 'active' }
    });
    const clientId = cRes.data.client.id;

    const pRes = await apiCall(env, '/api/hq/projects', {
      method: 'POST',
      body: { client_id: clientId, name: 'Cloudflare Platform Migration', status: 'In Progress', priority: 'High' }
    });
    const projectId = pRes.data.project.id;

    // Tasks & Milestones
    const msRes = await apiCall(env, '/api/hq/milestones', {
      method: 'POST',
      body: { project_id: projectId, name: 'Beta Cutover', due_date: '2026-12-20' }
    });
    assert.equal(msRes.status, 201);

    const taskRes = await apiCall(env, '/api/hq/tasks', {
      method: 'POST',
      body: { project_id: projectId, milestone_id: msRes.data.milestone.id, title: 'Configure Worker Routes', priority: 'High', due_date: '2020-01-01' }
    });
    assert.equal(taskRes.status, 201);

    // Operations: Onboarding, Approval, QA, Maintenance, Support Ticket
    const obRes = await apiCall(env, '/api/hq/onboarding', {
      method: 'POST',
      body: { client_id: clientId, project_id: projectId, title: 'DNS Transfer Access', category: 'Hosting', status: 'Completed' }
    });
    assert.equal(obRes.status, 201);

    const appRes = await apiCall(env, '/api/hq/approvals', {
      method: 'POST',
      body: { client_id: clientId, project_id: projectId, stage: 'Website Launch', title: 'Production Cutover Sign-Off' }
    });
    assert.equal(appRes.status, 201);

    const qaRes = await apiCall(env, '/api/hq/qa', {
      method: 'POST',
      body: { client_id: clientId, project_id: projectId, category: 'Security Checks', title: 'Verify CSP & Noindex Headers', status: 'Pass', severity: 'High' }
    });
    assert.equal(qaRes.status, 201);

    const maintRes = await apiCall(env, '/api/hq/maintenance', {
      method: 'POST',
      body: {
        client_id: clientId,
        project_id: projectId,
        plan_name: 'Annual Care Plan',
        billing_cycle: 'Annual',
        amount_minor: 2400000,
        status: 'Expiring Soon',
        start_date: '2026-01-01',
        expiry_date: '2026-12-01'
      }
    });
    assert.equal(maintRes.status, 201);

    const tktRes = await apiCall(env, '/api/hq/support', {
      method: 'POST',
      body: { client_id: clientId, project_id: projectId, subject: 'SSL Certificate Check', priority: 'High' }
    });
    assert.equal(tktRes.status, 201);
    assert.match(tktRes.data.ticket.ticket_number, /^SUP-\d{4}-0001$/);

    // Development: Repository & Deployment
    const repoRes = await apiCall(env, '/api/hq/repositories', {
      method: 'POST',
      body: {
        client_id: clientId,
        project_id: projectId,
        repo_name: 'jawedimtiaz/ops-dev-portal',
        repo_url: 'https://github.com/jawedimtiaz/ops-dev-portal',
        hosting_platform: 'Cloudflare Workers',
        production_url: 'https://opsdev.example'
      }
    });
    assert.equal(repoRes.status, 201);

    const depRes = await apiCall(env, '/api/hq/deployments', {
      method: 'POST',
      body: {
        client_id: clientId,
        project_id: projectId,
        repository_id: repoRes.data.repository.id,
        environment: 'production',
        version_tag: 'v2.1.0',
        branch: 'main',
        commit_sha: 'a1b2c3d4',
        status: 'Succeeded',
        release_notes: 'Initial cutover'
      }
    });
    assert.equal(depRes.status, 201);

    // Overview KPIs come strictly from real DB records
    const overviewRes = await apiCall(env, '/api/hq/overview');
    assert.equal(overviewRes.status, 200);
    assert.equal(overviewRes.data.kpis.totalCustomers, 1);
    assert.equal(overviewRes.data.kpis.activeCustomers, 1);
    assert.equal(overviewRes.data.kpis.activeProjects, 1);
    assert.equal(overviewRes.data.kpis.overdueTasks, 1);
    assert.equal(overviewRes.data.kpis.pendingApprovals, 1);
    assert.equal(overviewRes.data.kpis.upcomingRenewals, 1);
    assert.equal(overviewRes.data.recentDeployments.length, 1);

    // Analytics
    const analyticsRes = await apiCall(env, '/api/hq/analytics');
    assert.equal(analyticsRes.status, 200);
    assert.equal(analyticsRes.data.customerPerformance.length, 1);
    assert.equal(analyticsRes.data.projectPerformance.length, 1);

    // Settings & Audit Logs
    const putSet = await apiCall(env, '/api/hq/settings', {
      method: 'PUT',
      body: { studioName: 'Jawed Web Studio HQ', defaultTaxRateBps: 1800, quotationValidityDays: 45 }
    });
    assert.equal(putSet.status, 200);
    assert.equal(putSet.data.settings.quotationValidityDays, 45);

    const auditRes = await apiCall(env, '/api/hq/audit-logs?limit=20');
    assert.equal(auditRes.status, 200);
    assert.ok(auditRes.data.logs.length > 0);
  });
});
