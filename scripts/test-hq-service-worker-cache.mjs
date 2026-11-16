import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadFetchHandler() {
  const listeners = {};
  const self = {
    location: { origin: 'https://lab.jawed.co.in' },
    addEventListener(type, handler) { listeners[type] = handler; },
    skipWaiting() {},
    clients: { claim: async () => {} }
  };
  const sandbox = {
    self,
    URL,
    Response,
    Promise,
    fetch: async () => new Response('ok'),
    caches: {
      open: async () => ({ addAll: async () => {}, match: async () => null, put: async () => {} }),
      keys: async () => [],
      delete: async () => false,
      match: async () => null
    }
  };
  const source = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: 'service-worker.js' });
  return listeners.fetch;
}

const handleFetch = loadFetchHandler();

function wasHandledByCache(path, method = 'GET', mode = 'navigate') {
  let responded = false;
  handleFetch({
    request: { url: `https://lab.jawed.co.in${path}`, method, mode },
    respondWith() { responded = true; }
  });
  return responded;
}

test('private Studio HQ shell is never cached', () => {
  assert.equal(wasHandledByCache('/studio-hq'), false);
  assert.equal(wasHandledByCache('/studio-hq/'), false);
  assert.equal(wasHandledByCache('/studio-hq/clients'), false);
});

test('HQ API requests remain excluded from PWA caching', () => {
  assert.equal(wasHandledByCache('/api/hq/session', 'GET', 'cors'), false);
  assert.equal(wasHandledByCache('/api/hq/clients', 'GET', 'cors'), false);
  assert.equal(wasHandledByCache('/api/hq/projects', 'GET', 'cors'), false);
  assert.equal(wasHandledByCache('/api/hq/projects/p1/approvals', 'GET', 'cors'), false);
  assert.equal(wasHandledByCache('/api/hq/projects/p1/qa', 'GET', 'cors'), false);
});

test('public HTML navigation retains network-first PWA behavior', () => {
  assert.equal(wasHandledByCache('/about/'), true);
  assert.equal(wasHandledByCache('/work/'), true);
});
