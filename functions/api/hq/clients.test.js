import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClient } from './clients.js';

test('trims and accepts a valid CRM client', () => {
  const result = validateClient({ name: '  Acme Limited  ', email: 'owner@acme.example', status: 'prospect' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: 'Acme Limited', email: 'owner@acme.example', status: 'prospect' });
});

test('requires a non-empty client name', () => {
  assert.deepEqual(validateClient({ name: ' ' }), { ok: false, error: 'NAME_REQUIRED' });
  assert.deepEqual(validateClient({}), { ok: false, error: 'NAME_REQUIRED' });
});

test('rejects malformed email addresses', () => {
  assert.deepEqual(validateClient({ name: 'Acme', email: 'not-an-email' }), { ok: false, error: 'EMAIL_INVALID' });
});

test('rejects non-http website URLs', () => {
  assert.deepEqual(validateClient({ name: 'Acme', website_url: 'javascript:alert(1)' }), { ok: false, error: 'WEBSITE_URL_INVALID' });
});

test('rejects fields that are not part of the CRM contract', () => {
  assert.deepEqual(validateClient({ name: 'Acme', created_by: 'attacker' }), { ok: false, error: 'FIELD_NOT_ALLOWED' });
});

test('rejects invalid client statuses', () => {
  assert.deepEqual(validateClient({ name: 'Acme', status: 'administrator' }), { ok: false, error: 'STATUS_INVALID' });
});

test('enforces field length limits', () => {
  assert.deepEqual(validateClient({ name: 'A'.repeat(121) }), { ok: false, error: 'NAME_TOO_LONG' });
});

test('supports partial updates without requiring name', () => {
  const result = validateClient({ phone: '+91 90000 00000' }, true);
  assert.equal(result.ok, true);
  assert.equal(result.value.phone, '+91 90000 00000');
});
