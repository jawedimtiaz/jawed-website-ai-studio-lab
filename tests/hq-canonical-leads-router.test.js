import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCanonicalLeadsRoute,
  matchCanonicalLeadRoute
} from '../functions/lib/hqCanonicalRouter.js';

test('canonical leads route matcher accepts collection and detail routes', () => {
  assert.equal(isCanonicalLeadsRoute('/api/hq/leads'), true);
  assert.equal(isCanonicalLeadsRoute('/api/hq/leads/'), true);
  assert.equal(isCanonicalLeadsRoute('/api/hq/leads/abc'), true);
  assert.equal(isCanonicalLeadsRoute('/api/hq/leads-other'), false);
  assert.equal(isCanonicalLeadsRoute('/api/hq/clients'), false);
});

test('canonical leads collection route methods', () => {
  const route = matchCanonicalLeadRoute('/api/hq/leads');
  assert.equal(route.matched, true);
  assert.deepEqual(route.segments, []);
  assert.deepEqual(route.allowedMethods, ['GET', 'POST', 'OPTIONS']);
});

test('canonical leads detail route methods', () => {
  const route = matchCanonicalLeadRoute('/api/hq/leads/lead-123');
  assert.equal(route.matched, true);
  assert.deepEqual(route.segments, ['lead-123']);
  assert.deepEqual(route.allowedMethods, ['GET', 'PATCH', 'OPTIONS']);
});

test('canonical leads action routes allow only POST', () => {
  for (const action of ['archive', 'restore', 'convert']) {
    const route = matchCanonicalLeadRoute(`/api/hq/leads/lead-123/${action}`);
    assert.equal(route.matched, true);
    assert.deepEqual(route.segments, ['lead-123', action]);
    assert.deepEqual(route.allowedMethods, ['POST', 'OPTIONS']);
  }
});

test('canonical leads route rejects unknown actions and excess segments', () => {
  assert.equal(matchCanonicalLeadRoute('/api/hq/leads/lead-123/unknown').error, 'NOT_FOUND');
  assert.equal(matchCanonicalLeadRoute('/api/hq/leads/lead-123/archive/extra').error, 'NOT_FOUND');
  assert.equal(matchCanonicalLeadRoute('/api/hq/leads//archive').error, 'NOT_FOUND');
});
