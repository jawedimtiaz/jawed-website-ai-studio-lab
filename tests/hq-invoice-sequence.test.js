// tests/hq-invoice-sequence.test.js
// Focused automated test suite for Phase 3AB.2: Canonical Invoice Sequence Generation

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { clearJwksCacheForTests } from '../functions/lib/hqAuth.js';
import { dispatchHqApiRequest } from '../functions/lib/hqRouter.js';
import { createLocalD1, applyHqMigrations } from '../functions/lib/localD1.js';
import { nextSequenceNumber } from '../functions/lib/hqApi.js';
import { generateInvoiceNumber } from '../functions/api/hq/invoices.js';

const PROJECT_ID = 'test-invoice-sequence-project';
const KEY_ID = 'inv-seq-key-1';
const OWNER_UID = 'owner-uid-invoice-seq';
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

describe('Phase 3AB.2 — Canonical Invoice Sequence Generation Suite', () => {
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

  describe('1. Direct Financial Sequence Helper Verification', () => {
    test('1.1 Initial sequence generation creates record with next_number = 2 and returns 0001', async () => {
      const year = new Date().getFullYear();
      const nextYearShort = String((year + 1) % 100).padStart(2, '0');
      const fy = `${year}-${nextYearShort}`;
      const expectedPrefix = `INV-${fy.slice(2, 4)}${fy.slice(5, 7)}`;

      const num1 = await nextSequenceNumber(db, 'invoice', 'INV');
      assert.equal(num1, `${expectedPrefix}-0001`);

      const seqRow = await db
        .prepare(`SELECT * FROM financial_sequences WHERE document_type = 'invoice' AND financial_year = ?`)
        .bind(fy)
        .first();

      assert.ok(seqRow, 'Sequence row should be created');
      assert.equal(seqRow.document_type, 'invoice');
      assert.equal(seqRow.prefix, 'INV');
      assert.equal(seqRow.financial_year, fy);
      assert.equal(seqRow.next_number, 2);
    });

    test('1.2 Subsequent invocations increment sequence atomically', async () => {
      const year = new Date().getFullYear();
      const nextYearShort = String((year + 1) % 100).padStart(2, '0');
      const fy = `${year}-${nextYearShort}`;
      const expectedPrefix = `INV-${fy.slice(2, 4)}${fy.slice(5, 7)}`;

      const num1 = await nextSequenceNumber(db, 'invoice', 'INV');
      const num2 = await nextSequenceNumber(db, 'invoice', 'INV');
      const num3 = await nextSequenceNumber(db, 'invoice', 'INV');

      assert.equal(num1, `${expectedPrefix}-0001`);
      assert.equal(num2, `${expectedPrefix}-0002`);
      assert.equal(num3, `${expectedPrefix}-0003`);

      const seqRow = await db
        .prepare(`SELECT * FROM financial_sequences WHERE document_type = 'invoice' AND financial_year = ?`)
        .bind(fy)
        .first();
      assert.equal(seqRow.next_number, 4);
    });

    test('1.3 High-concurrency generation produces zero duplicates across parallel executions', async () => {
      const iterations = 20;
      const promises = Array.from({ length: iterations }, () => generateInvoiceNumber(db));
      const results = await Promise.all(promises);

      assert.equal(results.length, iterations);
      const uniqueResults = new Set(results);
      assert.equal(uniqueResults.size, iterations, 'All generated invoice numbers must be unique under concurrency');

      const year = new Date().getFullYear();
      const nextYearShort = String((year + 1) % 100).padStart(2, '0');
      const fy = `${year}-${nextYearShort}`;
      const seqRow = await db
        .prepare(`SELECT * FROM financial_sequences WHERE document_type = 'invoice' AND financial_year = ?`)
        .bind(fy)
        .first();

      assert.equal(seqRow.next_number, iterations + 1);
    });

    test('1.4 Sequence helper supports quotation document type with QUO prefix', async () => {
      const year = new Date().getFullYear();
      const nextYearShort = String((year + 1) % 100).padStart(2, '0');
      const fy = `${year}-${nextYearShort}`;
      const expectedPrefix = `QUO-${fy.slice(2, 4)}${fy.slice(5, 7)}`;

      const quo1 = await nextSequenceNumber(db, 'quotation', 'QUO');
      assert.equal(quo1, `${expectedPrefix}-0001`);

      const quoRow = await db
        .prepare(`SELECT * FROM financial_sequences WHERE document_type = 'quotation' AND financial_year = ?`)
        .bind(fy)
        .first();
      assert.equal(quoRow.document_type, 'quotation');
      assert.equal(quoRow.next_number, 2);
    });
  });

  describe('2. Invoices API Integration & End-to-End Sequence Creation', () => {
    let clientId;

    beforeEach(async () => {
      clientId = 'test-client-seq-1';
      const nowIso = new Date().toISOString();
      await db
        .prepare(`INSERT INTO clients (id, client_code, name, business_name, status, email, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`)
        .bind(clientId, 'CLI-SEQ-1', 'Nexus Digital', 'Nexus Corp', 'accounts@nexus.com', OWNER_UID, nowIso, nowIso)
        .run();
    });

    test('2.1 POST /api/hq/invoices creates invoice with canonical sequence number', async () => {
      const res = await apiCall(env, '/api/hq/invoices', {
        method: 'POST',
        body: {
          client_id: clientId,
          title: 'Infrastructure Maintenance & Optimization',
          status: 'issued',
          currency: 'INR',
          items: [
            { description: 'Cloud Maintenance', quantity: 1, unit_price_minor: 7500000 }
          ],
          tax_rate_bps: 1800
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.invoice);

      const year = new Date().getFullYear();
      const nextYearShort = String((year + 1) % 100).padStart(2, '0');
      const fy = `${year}-${nextYearShort}`;
      const expectedPrefix = `INV-${fy.slice(2, 4)}${fy.slice(5, 7)}`;

      assert.equal(res.data.invoice.invoice_number, `${expectedPrefix}-0001`);

      // Verify sequence row in DB
      const seq = await db.prepare(`SELECT * FROM financial_sequences WHERE document_type = 'invoice'`).first();
      assert.equal(seq.next_number, 2);
    });

    test('2.2 Consecutive POST /api/hq/invoices creates sequential invoices without collisions', async () => {
      const year = new Date().getFullYear();
      const nextYearShort = String((year + 1) % 100).padStart(2, '0');
      const fy = `${year}-${nextYearShort}`;
      const expectedPrefix = `INV-${fy.slice(2, 4)}${fy.slice(5, 7)}`;

      const res1 = await apiCall(env, '/api/hq/invoices', {
        method: 'POST',
        body: {
          client_id: clientId,
          title: 'Consulting Period 1',
          items: [{ description: 'Advisory', quantity: 1, unit_price_minor: 2500000 }]
        }
      });
      assert.equal(res1.status, 201);
      assert.equal(res1.data.invoice.invoice_number, `${expectedPrefix}-0001`);

      const res2 = await apiCall(env, '/api/hq/invoices', {
        method: 'POST',
        body: {
          client_id: clientId,
          title: 'Consulting Period 2',
          items: [{ description: 'Advisory', quantity: 1, unit_price_minor: 2500000 }]
        }
      });
      assert.equal(res2.status, 201);
      assert.equal(res2.data.invoice.invoice_number, `${expectedPrefix}-0002`);
    });

    test('2.3 Custom invoice_number in request payload is respected if provided', async () => {
      const customNumber = 'CUSTOM-INV-2026-999';
      const res = await apiCall(env, '/api/hq/invoices', {
        method: 'POST',
        body: {
          client_id: clientId,
          invoice_number: customNumber,
          title: 'Custom Invoiced Scope',
          items: [{ description: 'Custom Work', quantity: 1, unit_price_minor: 1000000 }]
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.invoice.invoice_number, customNumber);
    });

    test('2.4 Duplicate custom invoice_number is rejected with HTTP 409 conflict safety', async () => {
      const customNumber = 'UNIQUE-INV-100';
      const res1 = await apiCall(env, '/api/hq/invoices', {
        method: 'POST',
        body: {
          client_id: clientId,
          invoice_number: customNumber,
          title: 'Work 1',
          items: [{ description: 'Item 1', quantity: 1, unit_price_minor: 100000 }]
        }
      });
      assert.equal(res1.status, 201);

      const res2 = await apiCall(env, '/api/hq/invoices', {
        method: 'POST',
        body: {
          client_id: clientId,
          invoice_number: customNumber,
          title: 'Work 2',
          items: [{ description: 'Item 2', quantity: 1, unit_price_minor: 100000 }]
        }
      });
      assert.equal(res2.status, 409);
      assert.equal(res2.data.success, false);
      assert.equal(res2.data.error.code, 'DUPLICATE_INVOICE_NUMBER');
    });

    test('2.5 Unauthenticated invoice creation returns HTTP 401', async () => {
      const res = await apiCall(env, '/api/hq/invoices', {
        method: 'POST',
        token: null,
        body: {
          client_id: clientId,
          items: [{ description: 'Unauth Item', quantity: 1, unit_price_minor: 1000 }]
        }
      });
      assert.equal(res.status, 401);
      assert.equal(res.data.success, false);
    });

    test('2.6 Non-allowlisted owner email is rejected with HTTP 403', async () => {
      const attackerToken = signTestToken('attacker-uid', 'unauthorized@gmail.com');
      const res = await apiCall(env, '/api/hq/invoices', {
        method: 'POST',
        token: attackerToken,
        body: {
          client_id: clientId,
          items: [{ description: 'Malicious Item', quantity: 1, unit_price_minor: 1000 }]
        }
      });
      assert.equal(res.status, 403);
      assert.equal(res.data.success, false);
    });
  });
});
