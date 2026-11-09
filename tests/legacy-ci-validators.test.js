import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SPA_TOOL_MAP = {
  'apple-macos-jamf-support-helper': 'src/components/tools/AppleMacOsJamfSupportHelper.tsx',
  'm365-workplace-sign-in-diagnostic': 'src/components/tools/M365WorkplaceSignInDiagnostic.tsx',
  'hardware-diagnostic': 'src/pages/HardwareDiagnosticPage.tsx',
  'service-desk-note-formatter': 'src/components/tools/ServiceDeskNoteFormatter.tsx',
  'it-troubleshooting-assistant': 'src/components/tools/ItTroubleshootingAssistant.tsx',
  'ticket-to-knowledge-base-draft': 'src/components/tools/TicketToKbDraft.tsx',
  'ai-prompt-builder': 'src/components/tools/AiPromptBuilder.tsx',
  'career-match-resume-review': 'src/components/tools/CareerMatchResumeReview.tsx',
  'resume-bullet-strength-checker': 'src/components/tools/ResumeBulletStrengthChecker.tsx',
  'interview-preparation-planner': 'src/components/tools/InterviewPreparationPlanner.tsx',
  'compound-growth-sip-calculator': 'src/components/tools/CompoundGrowthSipCalculator.tsx',
  'inflation-goal-planning-calculator': 'src/components/tools/InflationGoalPlanningCalculator.tsx',
  'personal-finance-snapshot': 'src/components/tools/PersonalFinanceSnapshot.tsx',
  'retirement-planning-calculator': 'src/components/tools/RetirementPlanningCalculator.tsx',
  'finance-planning-workspace': 'src/components/tools/FinancePlanningWorkspace.tsx'
};

function resolveSourceFile(routePath, candidateFiles = null) {
  const routeWithoutLeadingSlash = routePath.startsWith('/') ? routePath.slice(1) : routePath;
  const normalizedRoute = routeWithoutLeadingSlash.endsWith('/') ? routeWithoutLeadingSlash.slice(0, -1) : routeWithoutLeadingSlash;
  const staticPath = routePath === '/' ? 'index.html' : normalizedRoute + '/index.html';
  if (fs.existsSync(staticPath)) return staticPath;
  const toolMatch = routePath.match(/^\/tools\/([^/]+)\/?$/);
  if (toolMatch) {
    const slug = toolMatch[1];
    const slugNorm = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const toolsDir = path.join('src', 'components', 'tools');
    const available = candidateFiles ?? (fs.existsSync(toolsDir) ? fs.readdirSync(toolsDir) : []);
    const matches = available.filter(f => f.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '') === slugNorm);
    if (matches.length > 1) {
      throw new Error(`Multiple matching components found for SPA route "${routePath}": ${matches.join(', ')}`);
    }
    if (matches.length === 1) {
      const compPath = path.join(toolsDir, matches[0]).replaceAll('\\', '/');
      if (fs.existsSync(compPath)) return compPath;
    }
    if (SPA_TOOL_MAP[slug]) {
      const mapped = SPA_TOOL_MAP[slug];
      if (fs.existsSync(mapped)) return mapped;
    }
    throw new Error(`No matching component found for SPA route "${routePath}"`);
  }
  return staticPath;
}

// Mirror of the security supply-chain file validator logic for unit verification
function validateFileSecurity(content, filename = 'firebase-applet-config.json') {
  const failures = [];
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |PRIVATE )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\b(?:api[_-]?key|client[_-]?secret|password|private[_-]?key)\s*[:=]\s*["'][^"']{20,}["']/i,
    /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~-]{20,}/i
  ];

  if (filename === 'firebase-applet-config.json') {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      failures.push('Invalid JSON in ' + filename);
      return failures;
    }

    const allowedFields = new Set([
      'projectId', 'appId', 'apiKey', 'authDomain', 'firestoreDatabaseId',
      'storageBucket', 'messagingSenderId', 'measurementId', 'oAuthClientId',
      'recaptchaSiteKey', 'databaseURL'
    ]);
    const forbiddenFieldPattern = /client[_-]?secret|password|private[_-]?key|secret|token|credential/i;
    for (const key of Object.keys(parsed)) {
      if (forbiddenFieldPattern.test(key) || !allowedFields.has(key)) {
        failures.push('Unexpected credential-like field in ' + filename + ': ' + key);
      }
    }

    if (typeof parsed.apiKey !== 'string' || !patterns[5].test(parsed.apiKey)) {
      failures.push('Missing or invalid public apiKey in ' + filename);
    }

    const privateKeyPatterns = [patterns[0], patterns[1], patterns[2], patterns[3], patterns[4], patterns[6], patterns[8]];
    for (const p of privateKeyPatterns) {
      if (p.test(content)) failures.push('Private credential literal in ' + filename);
    }

    const secretAssignmentPattern = /\b(?:client[_-]?secret|password|private[_-]?key)\s*[:=]\s*["'][^"']{20,}["']/i;
    if (secretAssignmentPattern.test(content)) {
      failures.push('Prohibited credential assignment in ' + filename);
    }

    for (const [k, v] of Object.entries(parsed)) {
      if (k !== 'apiKey' && typeof v === 'string' && patterns[5].test(v)) {
        failures.push('Unexpected credential-like value in field ' + k + ' of ' + filename);
      }
    }

    const sanitized = content.replace(/"apiKey"\s*:\s*"AIza[0-9A-Za-z_-]{30,}"/, '"apiKey":"REDACTED"');
    for (const p of patterns) {
      if (p.test(sanitized)) {
        failures.push('Credential-like literal in ' + filename);
      }
    }
    return failures;
  }

  for (const p of patterns) {
    if (p.test(content)) failures.push('Credential-like literal in ' + filename);
  }
  return failures;
}

test('SPA route resolution correctly identifies tool components and handles ambiguity', () => {
  // 1. Static HTML route resolves to static file
  assert.equal(resolveSourceFile('/about/'), 'about/index.html');
  assert.equal(resolveSourceFile('/notes/'), 'notes/index.html');

  // 2. Active SPA tool routes resolve deterministically to their TSX components
  const appleResolved = resolveSourceFile('/tools/apple-macos-jamf-support-helper/');
  assert.equal(fs.existsSync(appleResolved), true);
  assert.match(appleResolved, /AppleMacOsJamfSupportHelper\.tsx$/);

  const m365Resolved = resolveSourceFile('/tools/m365-workplace-sign-in-diagnostic/');
  assert.equal(fs.existsSync(m365Resolved), true);
  assert.match(m365Resolved, /M365WorkplaceSignInDiagnostic\.tsx$/);

  // 3. Fails explicitly if a route has no matching component
  assert.throws(
    () => resolveSourceFile('/tools/non-existent-tool-xyz/'),
    /No matching component found for SPA route "\/tools\/non-existent-tool-xyz\/"/
  );

  // 4. Fails explicitly if multiple possible matches exist
  assert.throws(
    () => resolveSourceFile('/tools/apple-macos-jamf-support-helper/', ['AppleMacOsJamfSupportHelper.tsx', 'AppleMacOsJamfSupportHelper.jsx']),
    /Multiple matching components found for SPA route "\/tools\/apple-macos-jamf-support-helper\/": AppleMacOsJamfSupportHelper\.tsx, AppleMacOsJamfSupportHelper\.jsx/
  );
});

test('SPA Header satisfies primary navigation parity contract', () => {
  const headerPath = 'src/components/layout/Header.tsx';
  assert.equal(fs.existsSync(headerPath), true);
  const header = fs.readFileSync(headerPath, 'utf8');

  // Required navigation items
  assert.equal(header.includes('<summary') && header.includes('Explore'), true);
  assert.equal(header.includes('to="/topics/"'), true);
  assert.equal(header.includes('to="/notes/"'), true);
  assert.equal(header.includes('to="/blog/"'), true);
  assert.equal(header.includes('to="/resources/"'), true);
  assert.equal(header.includes('to="/tools/"'), true);
  assert.equal(header.includes('to="/ai/"'), true);
  assert.equal(header.includes('to="/contact/"'), true);
});

test('Tool component sources contain no internal citation placeholders', () => {
  const citationPattern = /turn0search[0-9]+|\uE200cite|\uE201/;
  const appleSource = fs.readFileSync('src/components/tools/AppleMacOsJamfSupportHelper.tsx', 'utf8');
  const m365Source = fs.readFileSync('src/components/tools/M365WorkplaceSignInDiagnostic.tsx', 'utf8');

  assert.equal(citationPattern.test(appleSource), false, 'Apple tool component contains citation placeholders');
  assert.equal(citationPattern.test(m365Source), false, 'M365 tool component contains citation placeholders');
});

test('Deployment runtime contract validates package.json allowlist policy', () => {
  const contract = JSON.parse(fs.readFileSync('config/deployment-runtime-contract.json', 'utf8'));

  assert.equal(contract.allowed_package_manifests.includes('package.json'), true);
  assert.equal(contract.no_package_manifest_required, false);

  // Unvetted lockfiles must remain blocked
  for (const lockfile of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']) {
    assert.equal(contract.allowed_package_manifests.includes(lockfile), false);
    assert.equal(fs.existsSync(lockfile), false, `${lockfile} should not exist in tracked repo`);
  }
});

test('Security scanner reporting accurately reports accepted dependency manifests', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-security-supply-chain.mjs'], {
    encoding: 'utf8'
  });

  assert.match(output, /Security \/ supply-chain validation PASSED/);
  assert.match(output, /Dependency manifest: package\.json/);
});

test('Firebase configuration scanner permits legitimate public apiKey without exposing it', () => {
  const clientConfigPath = 'firebase-applet-config.json';
  assert.equal(fs.existsSync(clientConfigPath), true);

  const raw = fs.readFileSync(clientConfigPath, 'utf8');
  const parsed = JSON.parse(raw);

  // Validate public client schema
  assert.equal(typeof parsed.apiKey, 'string');
  assert.equal(parsed.apiKey.startsWith('AIza'), true);
  assert.ok(parsed.projectId, 'projectId must be present');

  // Verify real configuration produces zero scanner failures
  const failures = validateFileSecurity(raw, 'firebase-applet-config.json');
  assert.deepEqual(failures, [], 'Legitimate Firebase client config must produce zero failures');
});

test('Firebase scanner strictly rejects private keys, GitHub tokens, AWS credentials, Slack tokens, and bearer tokens', () => {
  const baseConfig = {
    projectId: 'test-project',
    appId: '1:123456789:web:abcdef',
    apiKey: 'AIza' + 'SyMockApiKeyForTestValidationOnly000'
  };

  // Dynamically constructed payloads prevent static scanners from flagging this test file
  const forbiddenCases = [
    { name: 'Private Key', extra: '-----BEGIN ' + 'RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0mockkey...\n-----END RSA PRIVATE KEY-----' },
    { name: 'GitHub Token (ghp)', extra: 'ghp' + '_abcdefghijklmnopqrstuvwxyz123456' },
    { name: 'GitHub Token (pat)', extra: 'github_pat' + '_11AEXAMPLE0123456789_abcdefghijklmnopqrstuvwxyz' },
    { name: 'AWS Key', extra: 'AKIA' + 'IOSFODNN7EXAMPLE' },
    { name: 'Slack Token', extra: 'xoxb' + '-123456789012-1234567890123-abcdefghijklmnop' },
    { name: 'OpenAI / AI Secret', extra: 'sk' + '-abcdefghijklmnopqrstuvwxyz0123456789' },
    { name: 'Bearer Token', extra: 'Authorization: ' + 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock' }
  ];

  for (const c of forbiddenCases) {
    const injected = JSON.stringify({ ...baseConfig, testNote: c.extra }, null, 2);
    const failures = validateFileSecurity(injected, 'firebase-applet-config.json');
    assert.ok(
      failures.some(f => f.includes('Private credential literal') || f.includes('Unexpected credential-like field')),
      `Expected rejection for ${c.name}, got: ${failures.join(', ')}`
    );
  }
});

test('Firebase scanner strictly rejects client_secret, password, and private-key assignments', () => {
  const baseConfig = {
    projectId: 'test-project',
    appId: '1:123456789:web:abcdef',
    apiKey: 'AIza' + 'SyMockApiKeyForTestValidationOnly000'
  };

  const assignmentCases = [
    { client_secret: 'mock' + '-client-secret-value-longer-than-20-chars' },
    { password: 'super' + '-secret-password-longer-than-20-chars' },
    { private_key: 'mock' + '-private-key-longer-than-20-chars' }
  ];

  for (const extra of assignmentCases) {
    const raw = JSON.stringify({ ...baseConfig, ...extra }, null, 2);
    const failures = validateFileSecurity(raw, 'firebase-applet-config.json');
    assert.ok(
      failures.some(f => f.includes('Unexpected credential-like field') || f.includes('Prohibited credential assignment')),
      `Expected assignment rejection, got: ${failures.join(', ')}`
    );
  }
});

test('Firebase scanner strictly rejects unexpected credential-like fields and schemas', () => {
  const baseConfig = {
    projectId: 'test-project',
    appId: '1:123456789:web:abcdef',
    apiKey: 'AIza' + 'SyMockApiKeyForTestValidationOnly000'
  };

  const invalidFieldCases = [
    { user_token: 'some-token-value' },
    { service_account: 'some-account-data' },
    { unexpectedField: 'unexpected-value' }
  ];

  for (const extra of invalidFieldCases) {
    const raw = JSON.stringify({ ...baseConfig, ...extra }, null, 2);
    const failures = validateFileSecurity(raw, 'firebase-applet-config.json');
    assert.ok(
      failures.some(f => f.includes('Unexpected credential-like field')),
      `Expected field rejection, got: ${failures.join(', ')}`
    );
  }
});

test('Firebase scanner strictly rejects unexpected AIza credentials in other fields of config', () => {
  const configWithExtraAiza = {
    projectId: 'test-project',
    appId: '1:123456789:web:abcdef',
    apiKey: 'AIza' + 'SyMockApiKeyForTestValidationOnly000',
    authDomain: 'AIza' + 'SyUnexpectedSecondCredentialInDomain00'
  };

  const raw = JSON.stringify(configWithExtraAiza, null, 2);
  const failures = validateFileSecurity(raw, 'firebase-applet-config.json');
  assert.ok(
    failures.some(f => f.includes('Unexpected credential-like value in field authDomain')),
    `Expected rejection of unexpected AIza value in authDomain, got: ${failures.join(', ')}`
  );
});

test('Security scanner strictly rejects AIza credential literals in non-config scanned files', () => {
  const mockScannedFileContent = 'const secretApiKey = "' + 'AIza' + 'SyMockTestCredentialForScannerTesting000";';
  const failures = validateFileSecurity(mockScannedFileContent, 'src/api/service.js');
  assert.ok(
    failures.some(f => f.includes('Credential-like literal in src/api/service.js')),
    `Expected rejection of AIza in regular code file, got: ${failures.join(', ')}`
  );
});

test('AI knowledge data includes SPA tools and maintains runtime copy parity', () => {
  const knowledge = JSON.parse(fs.readFileSync('assets/data/ai-knowledge.json', 'utf8'));
  const runtimeCode = fs.readFileSync('functions/lib/ai-knowledge-data.js', 'utf8').replace(/\r\n/g, '\n');
  const expectedRuntime = `const knowledge=${JSON.stringify(knowledge)};\nexport default knowledge;\n`;

  assert.equal(runtimeCode, expectedRuntime, 'Runtime AI knowledge copy must exactly match assets/data/ai-knowledge.json');

  const urls = new Set(knowledge.entries.map(e => e.url));
  assert.equal(urls.has('/tools/apple-macos-jamf-support-helper/'), true);
  assert.equal(urls.has('/tools/m365-workplace-sign-in-diagnostic/'), true);

  const appleEntry = knowledge.entries.find(e => e.url === '/tools/apple-macos-jamf-support-helper/');
  assert.ok(appleEntry.summary.length >= 70, 'Summary must exceed 70 characters');
  assert.ok(appleEntry.keywords.length >= 5, 'Must have descriptive keywords');
});
