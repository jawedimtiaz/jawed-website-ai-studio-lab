import fs from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('Usage: node scripts/verify-no-grpc-runtime.mjs <build-output-dir> [<worker-bundle-dir> ...]');
  process.exit(2);
}

const forbidden = [
  /@grpc\\/grpc-js/i,
  /requireClientCertificate/i,
  /getAuthContext/i,
  /ServerCredentials/i
];
let scannedFiles = 0;
const matches = [];

function walk(target) {
  if (!fs.existsSync(target)) {
    throw new Error(`Expected build output directory is missing: ${target}`);
  }
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) walk(path.join(target, entry));
    return;
  }
  if (!stat.isFile()) return;
  const buffer = fs.readFileSync(target);
  if (buffer.includes(0)) return;
  scannedFiles += 1;
  const content = buffer.toString('utf8');
  for (const pattern of forbidden) {
    if (pattern.test(content)) matches.push({ file: target, pattern: pattern.source });
  }
}

try {
  for (const root of roots) walk(root);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

if (scannedFiles === 0) {
  console.error('No text build artifacts were inspected; refusing to treat the runtime check as passed.');
  process.exit(2);
}
if (matches.length > 0) {
  console.error('Potential gRPC Node/server-auth runtime markers found in build artifacts:');
  console.error(JSON.stringify(matches, null, 2));
  process.exit(1);
}
console.log(`Inspected ${scannedFiles} text build artifacts; no @grpc/grpc-js or gRPC server-auth markers found.`);
console.log('This is a bundle-content regression check, not proof that every upstream advisory scenario is inapplicable.');
