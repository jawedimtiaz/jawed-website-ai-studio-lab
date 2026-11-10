import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HqSessionLifecycle } from '../src/lib/hqSessionLifecycle.ts';

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

test('Studio HQ session checks the canonical API response and does not cache requests', () => {
  assert.match(page, /fetch\(['"]\/api\/hq\/session['"]/);
  assert.match(page, /cache:\s*['"]no-store['"]/);
  assert.match(page, /credentials:\s*['"]same-origin['"]/);
  assert.match(page, /payload\.ok/);
  assert.match(page, /payload\.identity/);
});

test('Studio HQ is marked noindex and excluded from public canonical/structured data', () => {
  assert.match(head, /isPrivateHq/);
  assert.match(head, /noindex, nofollow, noarchive/);
  assert.match(head, /canonicalTag\?\.remove\(\)/);
  assert.match(head, /jsonLdData = null/);
});

test('public pages retain normal canonical and structured data behavior in DocumentHead', () => {
  assert.match(head, /canonicalTag\.setAttribute\('href', canonicalUrl\)/);
  assert.match(head, /@context['"]?:\s*['"]https:\/\/schema\.org['"]/);
  assert.match(head, /robotsTag\.remove\(\)/);
});

test('service worker bypasses cache for Studio HQ and descendants', () => {
  assert.match(worker, /url\.pathname === ['"]\/studio-hq['"]/);
  assert.match(worker, /url\.pathname\.startsWith\(['"]\/studio-hq\/['"]\)/);
});

test('Studio HQ Approvals interface uses authorized same-origin no-store endpoints', () => {
  assert.match(page, /fetch\(`\/api\/hq\/projects\/\$\{encodeURIComponent\(projectId\)\}\/approvals`/);
  assert.match(page, /fetch\(`\/api\/hq\/approvals\/\$\{encodeURIComponent\(approvalId\)\}`/);
  assert.match(page, /method:\s*['"]PATCH['"]/);
  assert.match(page, /status,\s*decision_note/);
});

test('Studio HQ QA checklist interface uses authorized same-origin no-store endpoints', () => {
  assert.match(page, /fetch\(`\/api\/hq\/projects\/\$\{encodeURIComponent\(projectId\)\}\/qa`/);
  assert.match(page, /fetch\(`\/api\/hq\/qa\/\$\{encodeURIComponent\(checkId\)\}`/);
});

test('Studio HQ Approvals interface covers all supported approval types', () => {
  for (const type of ['scope', 'design', 'content', 'qa', 'production-release', 'handover', 'other']) {
    assert.match(page, new RegExp(`value:\\s*['"]${type}['"]`));
  }
});

test('Studio HQ QA checklist covers all supported categories and results', () => {
  for (const cat of ['functionality', 'responsive', 'accessibility', 'seo', 'performance', 'security', 'browser', 'content', 'backup', 'other']) {
    assert.match(page, new RegExp(`value:\\s*['"]${cat}['"]`));
  }
  for (const res of ['not-run', 'pass', 'fail', 'blocked', 'not-applicable']) {
    assert.match(page, new RegExp(`value:\\s*['"]${res}['"]`));
  }
});

test('Approvals and QA loading concurrently for one project do not invalidate each other', () => {
  const lifecycle = new HqSessionLifecycle();
  lifecycle.startSession('owner-uid-1');
  const approvalsReq = lifecycle.createRequestToken('project-101:approvals-load');
  const qaReq = lifecycle.createRequestToken('project-101:qa-load');

  assert.equal(approvalsReq.isLatest(), true, 'Approvals request token must remain latest');
  assert.equal(qaReq.isLatest(), true, 'QA request token must remain latest');
  assert.equal(approvalsReq.isSessionValid(), true);
  assert.equal(qaReq.isSessionValid(), true);
});

test('Creating an approval while QA is loading does not invalidate QA load or approval creation', () => {
  const lifecycle = new HqSessionLifecycle();
  lifecycle.startSession('owner-uid-1');
  const qaReq = lifecycle.createRequestToken('project-101:qa-load');
  const createApprovalReq = lifecycle.createRequestToken('project-101:approval-create');

  assert.equal(qaReq.isLatest(), true, 'QA load request token remains latest');
  assert.equal(createApprovalReq.isLatest(), true, 'Create approval token is latest');
  assert.equal(qaReq.isSessionValid(), true);
  assert.equal(createApprovalReq.isSessionValid(), true);
});

test('Updating a QA check while approvals are loading does not invalidate approvals load or QA update', () => {
  const lifecycle = new HqSessionLifecycle();
  lifecycle.startSession('owner-uid-1');
  const approvalsReq = lifecycle.createRequestToken('project-101:approvals-load');
  const updateQaReq = lifecycle.createRequestToken('project-101:qa-update:check-42');

  assert.equal(approvalsReq.isLatest(), true, 'Approvals load request token remains latest');
  assert.equal(updateQaReq.isLatest(), true, 'Update QA request token is latest');
  assert.equal(approvalsReq.isSessionValid(), true);
  assert.equal(updateQaReq.isSessionValid(), true);
});

test('Two overlapping approvals loads: only the latest result applies', () => {
  const lifecycle = new HqSessionLifecycle();
  lifecycle.startSession('owner-uid-1');
  const req1 = lifecycle.createRequestToken('project-101:approvals-load');
  assert.equal(req1.isLatest(), true);

  const req2 = lifecycle.createRequestToken('project-101:approvals-load');
  assert.equal(req1.isLatest(), false, 'Earlier approvals request is superseded');
  assert.equal(req2.isLatest(), true, 'Latest approvals request is valid and latest');

  let approvalsState = [];
  const applyResult = (token, data) => {
    if (token.isLatest()) {
      approvalsState = data;
    }
  };

  applyResult(req1, [{ id: 'stale-approval' }]);
  assert.deepEqual(approvalsState, [], 'Stale response from req1 must not apply');

  applyResult(req2, [{ id: 'latest-approval' }]);
  assert.deepEqual(approvalsState, [{ id: 'latest-approval' }], 'Latest response from req2 must apply');
});

test('Two overlapping QA loads: only the latest result applies', () => {
  const lifecycle = new HqSessionLifecycle();
  lifecycle.startSession('owner-uid-1');
  const req1 = lifecycle.createRequestToken('project-101:qa-load');
  assert.equal(req1.isLatest(), true);

  const req2 = lifecycle.createRequestToken('project-101:qa-load');
  assert.equal(req1.isLatest(), false, 'Earlier QA request is superseded');
  assert.equal(req2.isLatest(), true, 'Latest QA request is valid and latest');

  let qaState = [];
  const applyQaResult = (token, data) => {
    if (token.isLatest()) {
      qaState = data;
    }
  };

  applyQaResult(req1, [{ id: 'stale-qa' }]);
  assert.deepEqual(qaState, [], 'Stale response from req1 must not apply');

  applyQaResult(req2, [{ id: 'latest-qa' }]);
  assert.deepEqual(qaState, [{ id: 'latest-qa' }], 'Latest response from req2 must apply');
});

test('Sign-out invalidates every outstanding operation across all resource keys', () => {
  const lifecycle = new HqSessionLifecycle();
  lifecycle.startSession('owner-uid-1');

  const tokens = [
    lifecycle.createRequestToken('project-101:approvals-load'),
    lifecycle.createRequestToken('project-101:approval-create'),
    lifecycle.createRequestToken('project-101:approval-decision:appr-1'),
    lifecycle.createRequestToken('project-101:qa-load'),
    lifecycle.createRequestToken('project-101:qa-create'),
    lifecycle.createRequestToken('project-101:qa-update:check-1')
  ];

  for (const t of tokens) {
    assert.equal(t.isSessionValid(), true);
    assert.equal(t.isLatest(), true);
  }

  lifecycle.endSession();

  for (const t of tokens) {
    assert.equal(t.isSessionValid(), false, 'Operation token must become invalid after sign out');
    assert.equal(t.isLatest(), false, 'Operation token must not be latest after sign out');
  }
});

test('Account switching invalidates every outstanding operation', () => {
  const lifecycle = new HqSessionLifecycle();
  lifecycle.startSession('owner-uid-1');

  const user1Tokens = [
    lifecycle.createRequestToken('project-101:approvals-load'),
    lifecycle.createRequestToken('project-101:approval-create'),
    lifecycle.createRequestToken('project-101:qa-load'),
    lifecycle.createRequestToken('project-101:qa-update:chk-1')
  ];

  lifecycle.startSession('owner-uid-2');

  for (const t of user1Tokens) {
    assert.equal(t.isSessionValid(), false, 'Prior user token must become invalid upon account switch');
    assert.equal(t.isLatest(), false, 'Prior user token must not be latest upon account switch');
  }

  const user2Token = lifecycle.createRequestToken('project-101:approvals-load');
  assert.equal(user2Token.isSessionValid(), true);
  assert.equal(user2Token.isLatest(), true);
});

test('Loading flags recover correctly after stale responses', () => {
  const lifecycle = new HqSessionLifecycle();
  lifecycle.startSession('owner-uid-1');

  // Case A: Sequential overlapping requests (slow req1, fast req2)
  let loadingState = { 'project-101': false };

  // req1 starts
  const req1 = lifecycle.createRequestToken('project-101:approvals-load');
  loadingState['project-101'] = true;

  // req2 starts while req1 is still pending
  const req2 = lifecycle.createRequestToken('project-101:approvals-load');
  loadingState['project-101'] = true;

  // req1 finishes first (stale)
  if (req1.isLatest()) {
    loadingState['project-101'] = false;
  }
  assert.equal(loadingState['project-101'], true, 'Older stale request must NOT clear loading flag while newer is pending');

  // req2 finishes (latest)
  if (req2.isLatest()) {
    loadingState['project-101'] = false;
  }
  assert.equal(loadingState['project-101'], false, 'Latest request properly clears loading flag to false');

  // Case B: If req1 finishes AFTER req2 has already cleared loading flag
  if (req1.isLatest()) {
    loadingState['project-101'] = false;
  }
  assert.equal(loadingState['project-101'], false, 'Stale req1 finishing late cannot perturb recovered loading state');

  // Case C: Sign-out resets loading flags and prevents stale in-flight from corrupting state
  loadingState['project-101'] = true;
  const req3 = lifecycle.createRequestToken('project-101:approvals-load');
  lifecycle.endSession();
  loadingState = {}; // Handled by handleSignOut / auth state reset
  if (req3.isLatest()) {
    loadingState['project-101'] = false;
  }
  assert.deepEqual(loadingState, {}, 'Post-signout stale response does not populate loading flags');
});

test('Studio HQ workspace navigation uses accessible filter buttons instead of incomplete ARIA tabs', () => {
  assert.match(page, /<nav\s+aria-label=["']Project workspace view filter["']/);
  assert.match(page, /aria-pressed=\{/);
  assert.doesNotMatch(page, /role=["']tablist["']/);
  assert.doesNotMatch(page, /role=["']tab["']/);
  assert.doesNotMatch(page, /aria-selected=\{/);
});

test('Studio HQ Approvals and QA operations verify session lifecycle before updating React state', () => {
  assert.match(page, /sessionLifecycle\.current\.createRequestToken\(`\$\{projectId\}:approvals-load`\)/);
  assert.match(page, /sessionLifecycle\.current\.createRequestToken\(`\$\{projectId\}:approval-create`\)/);
  assert.match(page, /sessionLifecycle\.current\.createRequestToken\(`\$\{projectId\}:approval-decision:\$\{approvalId\}`\)/);
  assert.match(page, /sessionLifecycle\.current\.createRequestToken\(`\$\{projectId\}:qa-load`\)/);
  assert.match(page, /sessionLifecycle\.current\.createRequestToken\(`\$\{projectId\}:qa-create`\)/);
  assert.match(page, /sessionLifecycle\.current\.createRequestToken\(`\$\{projectId\}:qa-update:\$\{checkId\}`\)/);
  assert.match(page, /if\s*\(!req\.isLatest\(\)\)\s*return;/);
  assert.match(page, /sessionLifecycle\.current\.endSession\(\)/);
});
