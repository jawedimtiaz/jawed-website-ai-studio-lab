import assert from 'node:assert/strict';
import {
  onRequestGet,
  onRequestPost,
  onRequestLogPost
} from '../functions/api/contact.js';

function makeDb({ failInsert = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              calls.push({ sql, values });
              if (failInsert && sql.includes('INSERT INTO contact_submissions')) {
                throw new Error('simulated D1 failure');
              }
              return { success: true };
            }
          };
        }
      };
    }
  };
}

function request(path, body, { origin = 'https://jawed.co.in', contentType = 'application/json' } = {}) {
  return new Request(`https://example.test${path}`, {
    method: 'POST',
    headers: { origin, 'content-type': contentType },
    body
  });
}

function validSubmission(overrides = {}) {
  return {
    name: 'Test User',
    email: 'test@example.com',
    phone: '',
    reason: 'General enquiry',
    message: 'This is a test contact message.',
    form_loaded_at: Date.now() - 5000,
    ...overrides
  };
}

const originalFetch = globalThis.fetch;
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}: ${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

try {
  await test('health reports storage unavailable without D1', async () => {
    const response = await onRequestGet({ request: new Request('https://example.test/api/contact'), env: {} });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, 'storage-not-configured');
  });

  await test('health reports ready when D1 binding exists', async () => {
    const response = await onRequestGet({ request: new Request('https://example.test/api/contact'), env: { CONTACT_DB: makeDb() } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ready');
  });

  await test('rejects a disallowed origin', async () => {
    const response = await onRequestPost({ request: request('/api/contact', JSON.stringify(validSubmission()), { origin: 'https://jawed.co.in.attacker.test' }), env: { CONTACT_DB: makeDb() } });
    assert.equal(response.status, 403);
  });

  await test('allows the explicitly configured preview origin', async () => {
    const previewOrigin = 'https://phase1-preview.example.workers.dev';
    const response = await onRequestGet({
      request: new Request('https://example.test/api/contact', { headers: { origin: previewOrigin } }),
      env: { CONTACT_DB: makeDb(), CANONICAL_ORIGIN: previewOrigin }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), previewOrigin);
  });

  await test('rejects invalid content type', async () => {
    const response = await onRequestPost({ request: request('/api/contact', '{}', { contentType: 'text/plain' }), env: { CONTACT_DB: makeDb() } });
    assert.equal(response.status, 415);
  });

  await test('rejects malformed JSON', async () => {
    const response = await onRequestPost({ request: request('/api/contact', '{bad'), env: { CONTACT_DB: makeDb() } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID_JSON');
  });

  await test('rejects oversized request body', async () => {
    const response = await onRequestPost({ request: request('/api/contact', JSON.stringify({ message: 'x'.repeat(11000) })), env: { CONTACT_DB: makeDb() } });
    assert.equal(response.status, 413);
  });

  await test('rejects submissions made before the minimum completion time', async () => {
    const response = await onRequestPost({ request: request('/api/contact', JSON.stringify(validSubmission({ form_loaded_at: Date.now() }))), env: { CONTACT_DB: makeDb() } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'SUBMISSION_TOO_FAST');
  });

  await test('does not report success when D1 persistence fails', async () => {
    const db = makeDb({ failInsert: true });
    const response = await onRequestPost({ request: request('/api/contact', JSON.stringify(validSubmission())), env: { CONTACT_DB: db } });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'CONTACT_STORAGE_FAILED');
    assert.equal(db.calls.length, 1);
  });

  await test('persists valid contact before acknowledging and records notification status', async () => {
    const db = makeDb();
    globalThis.fetch = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    const response = await onRequestPost({
      request: request('/api/contact', JSON.stringify(validSubmission())),
      env: { CONTACT_DB: db, RESEND_API_KEY: 'test-only-placeholder' }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.notificationStatus, 'sent');
    assert.equal(db.calls.length, 2);
    assert.match(db.calls[0].sql, /INSERT INTO contact_submissions/);
    assert.match(db.calls[1].sql, /UPDATE contact_submissions/);
  });

  await test('preview mode persists submissions but skips all email providers', async () => {
    const db = makeDb();
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error('Preview must not call email providers');
    };
    const response = await onRequestPost({
      request: request('/api/contact', JSON.stringify(validSubmission())),
      env: { CONTACT_DB: db, ENVIRONMENT: 'preview', DISABLE_CONTACT_EMAIL: 'true' }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.notificationStatus, 'pending');
    assert.equal(fetchCalls, 0);
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].sql, /INSERT INTO contact_submissions/);
  });

  await test('rejects null, array and string contact-log payloads cleanly', async () => {
    for (const payload of ['null', '[]', '"text"']) {
      const response = await onRequestLogPost({ request: request('/api/contact/log', payload), env: { CONTACT_DB: makeDb() } });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'VALIDATION_ERROR');
    }
  });

  await test('stores allowed contact-log metadata only', async () => {
    const db = makeDb();
    const payload = { status: 'fail', reason: 'NETWORK_ERROR', submissionMethod: 'api', messageLength: 42, url: '/contact', email: 'must-not-be-stored@example.com', message: 'private message' };
    const response = await onRequestLogPost({ request: request('/api/contact/log', JSON.stringify(payload)), env: { CONTACT_DB: db } });
    assert.equal(response.status, 201);
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].sql, /INSERT INTO contact_attempt_logs/);
    assert.equal(db.calls[0].values.includes(payload.email), false);
    assert.equal(db.calls[0].values.includes(payload.message), false);
  });

  await test('returns a controlled error for a missing D1 binding on contact logs', async () => {
    const response = await onRequestLogPost({ request: request('/api/contact/log', JSON.stringify({ status: 'fail', reason: 'NETWORK_ERROR' })), env: {} });
    assert.equal(response.status, 503);
  });
} finally {
  globalThis.fetch = originalFetch;
}

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`\nContact API tests: ${passed} passed\n`);
