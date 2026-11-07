import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const page = fs.readFileSync('src/pages/StudioHqPage.tsx', 'utf8');
const head = fs.readFileSync('src/components/common/DocumentHead.tsx', 'utf8');
const worker = fs.readFileSync('service-worker.js', 'utf8');

test('Studio HQ has an explicit private route and hides public chrome', () => {
  assert.match(app, /path=["']\/studio-hq["']/);
  assert.match(app, /!isStudioHq\s*&&\s*<Header\s*\/>/);
  assert.match(app, /!isStudioHq\s*&&\s*<Footer\s*\/>/);
  assert.match(app, /!isStudioHq\s*&&\s*<JawedAiWidget\s*\/>/);
  assert.match(app, /!isStudioHq\s*&&\s*<PwaInstallPrompt\s*\/>/);
});

test('Studio HQ session checks the current API response and does not cache requests', () => {
  assert.match(page, /fetch\(['"]\/api\/hq\/session['"]/);
  assert.match(page, /cache:\s*['"]no-store['"]/);
  assert.match(page, /credentials:\s*['"]same-origin['"]/);
  assert.match(page, /payload\?\.success\s*!==\s*true/);
  assert.match(page, /payload\?\.authenticated\s*!==\s*true/);
  assert.match(page, /payload\?\.owner/);
});

test('Studio HQ is marked noindex and excluded from public canonical/structured data', () => {
  assert.match(head, /isPrivateHq/);
  assert.match(head, /noindex, nofollow, noarchive/);
  assert.match(head, /canonicalTag\?\.remove\(\)/);
  assert.match(head, /jsonLdData = null/);
});

test('service worker bypasses cache for Studio HQ and descendants', () => {
  assert.match(worker, /url\.pathname === ['"]\/studio-hq['"]/);
  assert.match(worker, /url\.pathname\.startsWith\(['"]\/studio-hq\/['"]\)/);
});
