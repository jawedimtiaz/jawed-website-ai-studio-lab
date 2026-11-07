import assert from 'node:assert/strict';
import { isAllowedOrigin } from '../functions/api/ai.js';

const cases = [
  ['https://jawed.co.in', true],
  ['https://www.jawed.co.in', true],
  ['https://lab.jawed.co.in', true],
  ['https://branch.lab.jawed.co.in', true],
  ['http://jawed.co.in', false],
  ['https://attacker.example', false],
  ['https://attacker.workers.dev', false],
  ['https://attacker.pages.dev', false],
  ['https://attacker.run.app', false],
  ['https://jawed-website-ai-studio-lab.pages.dev', true],
  ['https://branch.jawed-website-ai-studio-lab.pages.dev', true],
  ['https://jawed-website-ai-studio-lab.jawed-eee.workers.dev', true],
  ['https://jawed-studio-hq-preview.jawed-eee.workers.dev', true],
  ['http://localhost:3000', true],
  ['https://127.0.0.1:5173', true],
  ['null', false],
  ['https://lab.jawed.co.in/path', false],
  ['', true],
  [undefined, true]
];

for (const [origin, expected] of cases) {
  assert.equal(isAllowedOrigin(origin), expected, 'Origin allowlist mismatch for ' + String(origin));
}
console.log('AI origin boundary tests: PASS (' + cases.length + ' cases)');
