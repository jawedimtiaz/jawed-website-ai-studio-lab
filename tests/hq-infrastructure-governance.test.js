// tests/hq-infrastructure-governance.test.js
// Regression test suite for Phase 3Z.1: Infrastructure & Studio Governance APIs:
// - Settings & Audit Logs API (/api/hq/settings, /api/hq/audit-logs)
// - Repositories API (/api/hq/repositories)
// - Deployments API (/api/hq/deployments)
// Validates strict reconciliation with Canonical Studio HQ Schema (0001_studio_hq_schema.sql)

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { clearJwksCacheForTests } from '../functions/lib/hqAuth.js';
import { dispatchHqApiRequest } from '../functions/lib/hqRouter.js';
import { createLocalD1, applyHqMigrations } from '../functions/lib/localD1.js';

const PROJECT_ID = 'test-studio-hq-infra';
const KEY_ID = 'infra-gov-key-1';
const OWNER_UID = 'owner-uid-infra-test';
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

describe('Studio HQ Infrastructure & Studio Governance APIs (Phase 3Z.1)', () => {
  let db;
  let env;

  beforeEach(async () => {
    clearJwksCacheForTests();
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
      ALLOWED_OWNER_EMAILS: OWNER_EMAIL,
      HQ_DB: db,
      CF_PAGES: '1'
    };
  });

  // ==========================================
  // 1. SETTINGS & AUDIT LOGS API TESTS
  // ==========================================
  test('1.1 Settings API: GET /api/hq/settings returns default workspace settings & live security overview', async () => {
    const res = await apiCall(env, '/api/hq/settings');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.settings);
    assert.equal(res.data.settings.studioName, 'Jawed Web Studio');
    assert.equal(res.data.settings.defaultCurrency, 'INR');

    // Security block
    assert.ok(res.data.security);
    assert.ok(Array.isArray(res.data.security.allowedEmails));
    assert.ok(res.data.security.allowedEmails.includes(OWNER_EMAIL));
    assert.ok(Array.isArray(res.data.security.enrolledOwners));
    assert.equal(res.data.security.enrolledOwners.length, 1);
    assert.equal(res.data.security.enrolledOwners[0].email, OWNER_EMAIL);
    assert.equal(typeof res.data.security.auditLogCount, 'number');
  });

  test('1.2 Settings API: PUT /api/hq/settings saves settings via audit_logs without writing to studio_settings', async () => {
    const putRes = await apiCall(env, '/api/hq/settings', {
      method: 'PUT',
      body: {
        studioName: 'Jawed Enterprise Studio',
        defaultTaxRateBps: 1800,
        quotationValidityDays: 45
      }
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.data.success, true);
    assert.equal(putRes.data.settings.studioName, 'Jawed Enterprise Studio');
    assert.equal(putRes.data.settings.defaultTaxRateBps, 1800);
    assert.equal(putRes.data.settings.quotationValidityDays, 45);

    // Verify audit log entry was created
    const auditRow = await db
      .prepare(`SELECT * FROM audit_logs WHERE action = 'SETTINGS_UPDATED' AND entity_type = 'settings'`)
      .first();
    assert.ok(auditRow);
    assert.equal(auditRow.actor_uid, OWNER_UID);

    // Subsequent GET reflects updated settings merged from audit log
    const getRes = await apiCall(env, '/api/hq/settings');
    assert.equal(getRes.status, 200);
    assert.equal(getRes.data.settings.studioName, 'Jawed Enterprise Studio');
    assert.equal(getRes.data.settings.defaultTaxRateBps, 1800);
  });

  test('1.3 Audit Logs API: GET /api/hq/audit-logs returns paginated audit records & supports query filtering', async () => {
    // Perform an action to generate an audit log entry
    await apiCall(env, '/api/hq/settings', {
      method: 'PUT',
      body: { studioName: 'Audit Test Studio' }
    });

    const res = await apiCall(env, '/api/hq/audit-logs?limit=10&page=1');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.logs));
    assert.ok(res.data.logs.length >= 1);
    assert.ok(res.data.total >= 1);

    // Filter by entityType
    const filteredRes = await apiCall(env, '/api/hq/audit-logs?entityType=settings');
    assert.equal(filteredRes.status, 200);
    assert.ok(filteredRes.data.logs.every((l) => l.entity_type === 'settings'));
  });

  test('1.4 Settings & Audit Logs API: Rejects unauthenticated and unauthorized requests', async () => {
    const unauthRes = await apiCall(env, '/api/hq/settings', { token: null });
    assert.equal(unauthRes.status, 401);

    const unauthAudit = await apiCall(env, '/api/hq/audit-logs', { token: null });
    assert.equal(unauthAudit.status, 401);

    const nonOwnerToken = signTestToken('bad-user', 'unauthorized@example.com');
    const forbiddenRes = await apiCall(env, '/api/hq/settings', { token: nonOwnerToken });
    assert.equal(forbiddenRes.status, 403);
  });

  // ==========================================
  // 2. REPOSITORIES API TESTS
  // ==========================================
  test('2.1 Repositories API: Lifecycle — Link repository -> List -> Update -> Soft Delete', async () => {
    const nowIso = new Date().toISOString();

    // 1. Setup client and project
    const clientId = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO clients (id, name, business_name, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)`)
      .bind(clientId, 'Client Corp', 'Client Business Corp', OWNER_UID, nowIso, nowIso)
      .run();

    const projectId = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO projects (id, client_id, name, status, priority, created_by, created_at, updated_at) VALUES (?, ?, ?, 'in-progress', 'high', ?, ?, ?)`)
      .bind(projectId, clientId, 'Platform Modernization', OWNER_UID, nowIso, nowIso)
      .run();

    // 2. Initial GET returns empty list
    const initialGet = await apiCall(env, '/api/hq/repositories');
    assert.equal(initialGet.status, 200);
    assert.equal(initialGet.data.repositories.length, 0);

    // 3. POST /api/hq/repositories
    const postRes = await apiCall(env, '/api/hq/repositories', {
      method: 'POST',
      body: {
        project_id: projectId,
        repo_name: 'jawedimtiaz/client-modernization',
        repo_url: 'https://github.com/jawedimtiaz/client-modernization',
        main_branch: 'main',
        dev_branch: 'develop',
        hosting_platform: 'Cloudflare Workers',
        production_url: 'https://client-portal.example',
        notes: 'Production repository deployment'
      }
    });
    assert.equal(postRes.status, 201);
    assert.equal(postRes.data.success, true);
    const repo = postRes.data.repository;
    assert.ok(repo.id);
    assert.equal(repo.repository_full_name, 'jawedimtiaz/client-modernization');
    assert.equal(repo.repo_name, 'jawedimtiaz/client-modernization');
    assert.equal(repo.project_id, projectId);
    assert.equal(repo.project_name, 'Platform Modernization');
    assert.equal(repo.client_business, 'Client Business Corp');
    assert.equal(repo.provider, 'github');
    assert.equal(repo.default_branch, 'main');
    assert.equal(repo.main_branch, 'main');
    assert.equal(repo.dev_branch, 'develop');

    // 4. Duplicate POST on same project rejects with HTTP 409
    const dupRes = await apiCall(env, '/api/hq/repositories', {
      method: 'POST',
      body: {
        project_id: projectId,
        repo_name: 'jawedimtiaz/client-modernization',
        repo_url: 'https://github.com/jawedimtiaz/client-modernization'
      }
    });
    assert.equal(dupRes.status, 409);

    // 5. GET /api/hq/repositories filters by projectId
    const listRes = await apiCall(env, `/api/hq/repositories?projectId=${projectId}`);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.repositories.length, 1);
    assert.equal(listRes.data.repositories[0].id, repo.id);

    // 6. PUT /api/hq/repositories updates repository
    const putRes = await apiCall(env, '/api/hq/repositories', {
      method: 'PUT',
      body: {
        id: repo.id,
        main_branch: 'master',
        notes: 'Updated repository branch'
      }
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.data.repository.main_branch, 'master');
    assert.equal(putRes.data.repository.default_branch, 'master');

    // 7. DELETE /api/hq/repositories performs soft-delete (archived_at)
    const delRes = await apiCall(env, `/api/hq/repositories?id=${repo.id}`, {
      method: 'DELETE'
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.data.deletedId, repo.id);

    // Verify row still exists in database with archived_at set
    const dbRow = await db.prepare(`SELECT * FROM repositories WHERE id = ?`).bind(repo.id).first();
    assert.ok(dbRow);
    assert.ok(dbRow.archived_at);
    assert.equal(dbRow.archived_by, OWNER_UID);

    // Standard GET excludes archived repository
    const postDelGet = await apiCall(env, '/api/hq/repositories');
    assert.equal(postDelGet.status, 200);
    assert.equal(postDelGet.data.repositories.length, 0);

    // GET with includeArchived=true returns it
    const archivedGet = await apiCall(env, '/api/hq/repositories?includeArchived=true');
    assert.equal(archivedGet.status, 200);
    assert.equal(archivedGet.data.repositories.length, 1);
  });

  test('2.2 Repositories API: Input validation rejects missing project or repo name', async () => {
    const res1 = await apiCall(env, '/api/hq/repositories', {
      method: 'POST',
      body: { repo_name: 'test/repo', repo_url: 'https://github.com/test/repo' }
    });
    assert.equal(res1.status, 400);

    const res2 = await apiCall(env, '/api/hq/repositories', {
      method: 'POST',
      body: { project_id: 'non-existent-proj', repo_name: 'test/repo', repo_url: 'https://github.com/test/repo' }
    });
    assert.equal(res2.status, 404);
  });

  // ==========================================
  // 3. DEPLOYMENTS API TESTS
  // ==========================================
  test('3.1 Deployments API: Lifecycle — Log Deployment -> List -> Repo Metadata Update -> Delete', async () => {
    const nowIso = new Date().toISOString();

    // 1. Setup client, project, and repository
    const clientId = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO clients (id, name, business_name, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)`)
      .bind(clientId, 'Dev Client', 'Dev Business Ltd', OWNER_UID, nowIso, nowIso)
      .run();

    const projectId = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO projects (id, client_id, name, status, priority, created_by, created_at, updated_at) VALUES (?, ?, ?, 'in-progress', 'high', ?, ?, ?)`)
      .bind(projectId, clientId, 'Cloud App Deployment', OWNER_UID, nowIso, nowIso)
      .run();

    const repoId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO repositories (id, project_id, provider, repository_full_name, repository_url, default_branch, created_at, updated_at)
         VALUES (?, ?, 'github', 'jawedimtiaz/cloud-app', 'https://github.com/jawedimtiaz/cloud-app', 'main', ?, ?)`
      )
      .bind(repoId, projectId, nowIso, nowIso)
      .run();

    // 2. Initial GET returns empty list
    const initialGet = await apiCall(env, '/api/hq/deployments');
    assert.equal(initialGet.status, 200);
    assert.equal(initialGet.data.deployments.length, 0);

    // 3. POST /api/hq/deployments
    const postRes = await apiCall(env, '/api/hq/deployments', {
      method: 'POST',
      body: {
        project_id: projectId,
        repository_id: repoId,
        environment: 'production',
        version_tag: 'v2.4.0',
        branch: 'main',
        commit_sha: 'a1b2c3d4e5f67890123456789abcdef012345678',
        deployment_url: 'https://cloud-app.jawed.co.in',
        status: 'Succeeded',
        release_notes: 'Initial production release with verified security headers'
      }
    });
    assert.equal(postRes.status, 201);
    assert.equal(postRes.data.success, true);
    const dep = postRes.data.deployment;
    assert.ok(dep.id);
    assert.equal(dep.project_id, projectId);
    assert.equal(dep.repository_id, repoId);
    assert.equal(dep.version_tag, 'v2.4.0');
    assert.equal(dep.environment, 'production');
    assert.equal(dep.canonical_status, 'success');
    assert.equal(dep.status, 'Succeeded');
    assert.equal(dep.branch, 'main');
    assert.equal(dep.branch_name, 'main');
    assert.equal(dep.repo_name, 'jawedimtiaz/cloud-app');
    assert.equal(dep.project_name, 'Cloud App Deployment');
    assert.equal(dep.client_business, 'Dev Business Ltd');
    assert.equal(dep.deployed_by, OWNER_UID);

    // 4. Verify linked repository metadata was safely updated
    const repoRow = await db.prepare(`SELECT notes FROM repositories WHERE id = ?`).bind(repoId).first();
    assert.ok(repoRow.notes);
    const repoMeta = JSON.parse(repoRow.notes);
    assert.equal(repoMeta.deployment_status, 'Healthy');
    assert.ok(repoMeta.last_deployed_at);

    // 5. GET /api/hq/deployments returns logged deployment
    const listRes = await apiCall(env, `/api/hq/deployments?projectId=${projectId}`);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.deployments.length, 1);
    assert.equal(listRes.data.deployments[0].id, dep.id);

    // 6. DELETE /api/hq/deployments
    const delRes = await apiCall(env, `/api/hq/deployments?id=${dep.id}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.data.deletedId, dep.id);

    // Post-delete GET returns empty
    const postDelGet = await apiCall(env, '/api/hq/deployments');
    assert.equal(postDelGet.status, 200);
    assert.equal(postDelGet.data.deployments.length, 0);
  });

  test('3.2 Deployments API: Rejects missing project_id or non-existent project', async () => {
    const res1 = await apiCall(env, '/api/hq/deployments', {
      method: 'POST',
      body: { environment: 'production' }
    });
    assert.equal(res1.status, 400);

    const res2 = await apiCall(env, '/api/hq/deployments', {
      method: 'POST',
      body: { project_id: 'non-existent-proj', environment: 'production' }
    });
    assert.equal(res2.status, 404);
  });

  test('3.3 Deployments API: Normalizes invalid environment and status to canonical constraints', async () => {
    const nowIso = new Date().toISOString();
    const clientId = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO clients (id, name, business_name, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)`)
      .bind(clientId, 'Env Client', 'Env Business', OWNER_UID, nowIso, nowIso)
      .run();

    const projectId = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO projects (id, client_id, name, status, priority, created_by, created_at, updated_at) VALUES (?, ?, ?, 'in-progress', 'high', ?, ?, ?)`)
      .bind(projectId, clientId, 'Env Project', OWNER_UID, nowIso, nowIso)
      .run();

    const postRes = await apiCall(env, '/api/hq/deployments', {
      method: 'POST',
      body: {
        project_id: projectId,
        environment: 'UNKNOWN_ENV', // Should default to 'production'
        status: 'FAILED',           // Should normalize to canonical 'failed'
        version_tag: 'v1.0.1'
      }
    });
    assert.equal(postRes.status, 201);
    assert.equal(postRes.data.deployment.environment, 'production');
    assert.equal(postRes.data.deployment.canonical_status, 'failed');
    assert.equal(postRes.data.deployment.status, 'Failed');
  });

  test('3.4 Deployments & Repositories: Error handling on non-existent records & OPTIONS preflight', async () => {
    // Delete non-existent deployment
    const delDepRes = await apiCall(env, '/api/hq/deployments?id=non-existent-dep-id', { method: 'DELETE' });
    assert.equal(delDepRes.status, 404);

    // Update non-existent repository
    const putRepoRes = await apiCall(env, '/api/hq/repositories', {
      method: 'PUT',
      body: { id: 'non-existent-repo-id', repo_name: 'test/repo' }
    });
    assert.equal(putRepoRes.status, 404);

    // Delete non-existent repository
    const delRepoRes = await apiCall(env, '/api/hq/repositories?id=non-existent-repo-id', { method: 'DELETE' });
    assert.equal(delRepoRes.status, 404);

    // OPTIONS preflight
    const optSettings = await apiCall(env, '/api/hq/settings', { method: 'OPTIONS' });
    assert.equal(optSettings.status, 204);

    const optRepos = await apiCall(env, '/api/hq/repositories', { method: 'OPTIONS' });
    assert.equal(optRepos.status, 204);

    const optDeps = await apiCall(env, '/api/hq/deployments', { method: 'OPTIONS' });
    assert.equal(optDeps.status, 204);
  });
});
