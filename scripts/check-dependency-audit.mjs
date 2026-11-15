import fs from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Usage: node scripts/check-dependency-audit.mjs <bun-audit-report.json>');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error('Dependency audit report is missing or invalid:', error.message);
  process.exit(2);
}

if (report.error) {
  console.error('Dependency audit returned an error instead of a complete result:', JSON.stringify(report.error));
  process.exit(2);
}

const allowedAdvisories = new Set([
  'GHSA-M9GG-HP2V-232J',
  'GHSA-F596-WHHP-79R4'
]);
const expectedPackages = new Set([
  '@firebase/firestore',
  '@firebase/firestore-compat',
  '@grpc/grpc-js',
  'firebase'
]);

// npm's audit report shape is retained for backwards compatibility with saved
// reports. Bun's --json output is the raw npm registry advisory response.
if (report.vulnerabilities && typeof report.vulnerabilities === 'object') {
  const entries = Object.entries(report.vulnerabilities);
  if (entries.length === 0) {
    console.log('Dependency audit: no package-level vulnerabilities reported.');
    process.exit(0);
  }

  const unexpected = [];
  const observedPackages = new Set();
  let observedAllowedAdvisory = false;

  for (const [packageName, item] of entries) {
    observedPackages.add(packageName);
    const via = Array.isArray(item.via) ? item.via : [];
    const advisoryIds = via
      .filter(value => value && typeof value === 'object')
      .map(value => String(value.url || '').match(/GHSA-[a-z0-9-]+/i)?.[0])
      .filter(Boolean);
    const dependencyLinks = via.filter(value => typeof value === 'string');

    if (advisoryIds.some(id => allowedAdvisories.has(id.toUpperCase()))) observedAllowedAdvisory = true;
    const onlyExpectedAdvisory = advisoryIds.every(id => allowedAdvisories.has(id.toUpperCase()));
    const onlyExpectedDependencyLinks = dependencyLinks.every(name => expectedPackages.has(name));

    if (
      !expectedPackages.has(packageName) ||
      item.severity !== 'high' ||
      !onlyExpectedAdvisory ||
      !onlyExpectedDependencyLinks ||
      (advisoryIds.length === 0 && dependencyLinks.length === 0)
    ) {
      unexpected.push({ package: packageName, severity: item.severity, advisoryIds, dependencyLinks });
    }
  }

  const exactPackageSet =
    observedPackages.size === expectedPackages.size &&
    [...expectedPackages].every(name => observedPackages.has(name));

  if (!observedAllowedAdvisory || !exactPackageSet || unexpected.length > 0) {
    console.error('Dependency audit contains findings outside the narrowly reviewed exception.');
    console.error(JSON.stringify({
      observedPackages: [...observedPackages].sort(),
      expectedPackages: [...expectedPackages].sort(),
      unexpected
    }, null, 2));
    process.exit(1);
  }

  console.log('Dependency audit summary:', JSON.stringify(report.metadata?.vulnerabilities || {}));
  console.log('Narrow exception applied only to the reviewed Firebase/gRPC dependency chain:', [...observedPackages].sort().join(', '));
  process.exit(0);
}

if (report.advisories && typeof report.advisories === 'object') {
  const entries = Object.entries(report.advisories);
  if (entries.length === 0) {
    console.log('Dependency audit: no advisories reported.');
    process.exit(0);
  }

  const unexpected = [];
  const observedAdvisories = new Set();
  const observedPackages = new Set();

  for (const [advisoryKey, item] of entries) {
    const advisoryId =
      String(item.url || item.github_advisory_id || item.title || advisoryKey)
        .match(/GHSA-[a-z0-9-]+/i)?.[0]?.toUpperCase();
    const packageName = String(item.module_name || '');
    const severity = String(item.severity || '').toLowerCase();
    observedAdvisories.add(advisoryId || 'UNKNOWN');
    observedPackages.add(packageName);

    if (
      !advisoryId ||
      !allowedAdvisories.has(advisoryId) ||
      !expectedPackages.has(packageName) ||
      !Array.isArray(item.findings) ||
      item.findings.length === 0 ||
      !['high', 'low'].includes(severity)
    ) {
      unexpected.push({
        advisoryKey,
        advisoryId: advisoryId || null,
        package: packageName,
        severity,
        findingsCount: Array.isArray(item.findings) ? item.findings.length : null
      });
    }
  }

  if (
    unexpected.length > 0 ||
    observedAdvisories.size !== allowedAdvisories.size ||
    [...allowedAdvisories].some(id => !observedAdvisories.has(id))
  ) {
    console.error('Bun audit contains findings outside the narrowly reviewed advisory exception.');
    console.error(JSON.stringify({
      observedAdvisories: [...observedAdvisories].sort(),
      expectedAdvisories: [...allowedAdvisories].sort(),
      observedPackages: [...observedPackages].sort(),
      unexpected
    }, null, 2));
    process.exit(1);
  }

  console.log('Bun audit advisory exception limited to:', [...observedAdvisories].sort().join(', '));
  console.log('Affected package entries:', [...observedPackages].sort().join(', '));
  process.exit(0);
}

console.error('Unrecognized dependency audit JSON schema; refusing to treat it as a clean audit.');
process.exit(2);
