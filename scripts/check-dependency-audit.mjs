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

if (!report || typeof report !== 'object' || Array.isArray(report) || report.error) {
  console.error('Dependency audit returned an invalid or incomplete report.');
  process.exit(2);
}

const allowed = new Map([
  ['GHSA-M9GG-HP2V-232J', { package: '@grpc/grpc-js', severity: 'high' }],
  ['GHSA-F596-WHHP-79R4', { package: '@grpc/grpc-js', severity: 'low' }]
]);

// Bun --json returns a map of package names to advisory arrays.
const packageEntries = Object.entries(report);
if (packageEntries.length === 0) {
  console.log('Dependency audit: no vulnerabilities reported for the committed lockfile.');
  process.exit(0);
}

const observed = new Map();
const unexpected = [];

for (const [packageName, advisories] of packageEntries) {
  if (!Array.isArray(advisories)) {
    unexpected.push({ package: packageName, reason: 'advisory entry is not an array' });
    continue;
  }

  for (const advisory of advisories) {
    const id = String(advisory?.url || '').match(/GHSA-[a-z0-9-]+/i)?.[0]?.toUpperCase();
    const expected = id ? allowed.get(id) : null;
    if (!expected || packageName !== expected.package || String(advisory.severity || '').toLowerCase() !== expected.severity) {
      unexpected.push({
        package: packageName,
        advisory: id || null,
        severity: advisory?.severity || null
      });
      continue;
    }
    observed.set(id, { package: packageName, severity: expected.severity });
  }
}

const missing = [...allowed.keys()].filter(id => !observed.has(id));
if (unexpected.length > 0 || missing.length > 0) {
  console.error('Dependency audit contains an unreviewed, changed, or missing advisory result.');
  console.error(JSON.stringify({
    observed: Object.fromEntries(observed),
    missing,
    unexpected
  }, null, 2));
  process.exit(1);
}

console.log('Narrow advisory exception applied only to the two reviewed gRPC findings:');
console.log(JSON.stringify(Object.fromEntries(observed), null, 2));
console.log('Any additional package, advisory, or severity change fails this check.');
