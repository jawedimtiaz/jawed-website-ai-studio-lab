// Regression guard: unsigned/fabricated JWTs must never reach owner authorization.
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFirebaseToken } from '../functions/lib/hqAuth.js';

test('rejects the legacy fabricated mock-signature token', async () => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fake-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://securetoken.google.com/refined-actor-skhlb',
    aud: 'refined-actor-skhlb',
    sub: 'fake-owner',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    auth_time: Math.floor(Date.now() / 1000),
    email: 'jawedimtiaz@gmail.com',
    email_verified: true
  })).toString('base64url');
  const token = header + '.' + payload + '.mockSignatureString123';
  const result = await verifyFirebaseToken(token, {
    FIREBASE_PROJECT_ID: 'refined-actor-skhlb',
    HQ_ALLOWED_OWNER_EMAILS: 'jawedimtiaz@gmail.com'
  }, {
    fetchImpl: async () => new Response(JSON.stringify({
      'fake-key': '-----BEGIN CERTIFICATE-----\\nnot-a-real-certificate\\n-----END CERTIFICATE-----'
    }), { headers: { 'cache-control': 'max-age=300' } })
  });
  assert.equal(result.valid, false);
});

test('rejects malformed tokens before any external certificate request', async () => {
  let fetchCount = 0;
  const result = await verifyFirebaseToken('not-a-jwt', {}, {
    fetchImpl: async () => {
      fetchCount++;
      throw new Error('must not be called');
    }
  });
  assert.equal(result.valid, false);
  assert.equal(fetchCount, 0);
});
