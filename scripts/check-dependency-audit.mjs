import fs from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Usage: node scripts/check-dependency-audit.mjs <npm-audit-report.json>');
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
  console.error('npm audit returned an error instead of a complete audit result:', JSON.stringify(report.error));
  process.exit(2);
}

const allowedAdvisory = 'GHSA-m9gg-hp2v-232j';
const expectedPackages = new Set([
  '@firebase/firestore',
  '@firebase/firestore-compat',
  '@grpc/grpc-js',
  'firebase'
]);
const entries = Object.entries(report.vulnerabilities || {});

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

  if (advisoryIds.includes(allowedAdvisory)) observedAllowedAdvisory = true;

  const onlyExpectedAdvisory = advisoryIds.every(id => id.toUpperCase() === allowedAdvisory);
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
console.log(
  'Narrow exception applied to GHSA-m9gg-hp2v-232j only, for the reviewed Firebase/gRPC transitive chain:',
  [...observedPackages].sort().join(', ')
);
console.log('Any new package, severity, or advisory will fail this check.');
