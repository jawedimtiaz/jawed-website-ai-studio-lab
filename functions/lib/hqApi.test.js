import test from 'node:test';
import assert from 'node:assert/strict';
import { readHqJson } from './hqApi.js';

function requestFromChunks(chunks, headers = {}) {
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    }
  });
  return new Request('https://lab.jawed.co.in/api/hq/clients', {
    method: 'POST',
    headers,
    body,
    duplex: 'half'
  });
}

test('reads valid JSON split across multiple stream chunks', async () => {
  const result = await readHqJson(requestFromChunks([
    new TextEncoder().encode('{"name":'),
    new TextEncoder().encode('"Jawed"}')
  ]));
  assert.deepEqual(result, { ok: true, value: { name: 'Jawed' } });
});

test('accepts a body exactly at the byte limit', async () => {
  const bytes = new TextEncoder().encode('{"a":1}');
  const result = await readHqJson(requestFromChunks([bytes]), bytes.byteLength);
  assert.deepEqual(result, { ok: true, value: { a: 1 } });
});

test('rejects an oversized streamed body before buffering the full payload', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8));
      controller.enqueue(new Uint8Array(8));
    },
    cancel() { cancelled = true; }
  });
  const request = new Request('https://lab.jawed.co.in/api/hq/clients', {
    method: 'POST',
    body,
    duplex: 'half'
  });
  const result = await readHqJson(request, 10);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 413);
  assert.equal((await result.response.json()).error, 'PAYLOAD_TOO_LARGE');
  assert.equal(cancelled, true);
});

test('rejects a declared oversized body without reading its stream', async () => {
  let read = false;
  const body = new ReadableStream({
    pull(controller) {
      read = true;
      controller.enqueue(new TextEncoder().encode('{}'));
      controller.close();
    }
  }, { highWaterMark: 0 });
  const request = new Request('https://lab.jawed.co.in/api/hq/clients', {
    method: 'POST',
    headers: { 'content-length': '100' },
    body,
    duplex: 'half'
  });
  const result = await readHqJson(request, 10);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 413);
  assert.equal(read, false);
});

test('treats an empty body as an empty JSON object', async () => {
  const request = new Request('https://lab.jawed.co.in/api/hq/clients', { method: 'POST' });
  assert.deepEqual(await readHqJson(request), { ok: true, value: {} });
});

test('rejects malformed UTF-8 and invalid JSON values', async () => {
  const malformed = await readHqJson(requestFromChunks([new Uint8Array([0xc3, 0x28])]));
  assert.equal(malformed.ok, false);
  assert.equal(malformed.response.status, 400);
  assert.equal((await malformed.response.json()).error, 'INVALID_JSON');

  const array = await readHqJson(requestFromChunks([new TextEncoder().encode('[]')]));
  assert.equal(array.ok, false);
  assert.equal((await array.response.json()).error, 'INVALID_JSON');
});

test('returns a controlled error when the request stream fails', async () => {
  const body = new ReadableStream({
    pull() { throw new Error('stream failure'); }
  });
  const request = new Request('https://lab.jawed.co.in/api/hq/clients', {
    method: 'POST',
    body,
    duplex: 'half'
  });
  const result = await readHqJson(request);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 400);
  assert.equal((await result.response.json()).error, 'REQUEST_BODY_UNREADABLE');
});

test('returns a controlled error when request body stream is locked', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{}'));
      controller.close();
    }
  });
  const request = new Request('https://lab.jawed.co.in/api/hq/clients', {
    method: 'POST',
    body,
    duplex: 'half'
  });
  const reader = request.body.getReader();
  try {
    const result = await readHqJson(request);
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 400);
    assert.equal((await result.response.json()).error, 'REQUEST_BODY_UNREADABLE');
  } finally {
    reader.releaseLock();
  }
});

test('returns 413 even when stream cancel rejects during oversized body handling', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(20));
    },
    cancel() {
      throw new Error('cancel failure');
    }
  });
  const request = new Request('https://lab.jawed.co.in/api/hq/clients', {
    method: 'POST',
    body,
    duplex: 'half'
  });
  const result = await readHqJson(request, 10);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 413);
  assert.equal((await result.response.json()).error, 'PAYLOAD_TOO_LARGE');
});

test('rejects primitive JSON values like null, numbers, booleans, and strings', async () => {
  for (const primitive of ['null', '123', 'true', '"hello"']) {
    const res = await readHqJson(requestFromChunks([new TextEncoder().encode(primitive)]));
    assert.equal(res.ok, false);
    assert.equal(res.response.status, 400);
    assert.equal((await res.response.json()).error, 'INVALID_JSON');
  }
});
