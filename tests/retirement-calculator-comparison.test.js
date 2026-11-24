import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const requireFromTest = createRequire(import.meta.url);

describe('Retirement Planning Calculator — Side-by-Side Scenario Comparison Suite', () => {
  let tmpDir;
  let RetirementPlanningCalculator;
  let computeRetirementOutcome;
  let compareRetirementOutcomes;
  let DEFAULT_SCENARIO_A;
  let MemoryRouter;

  before(async () => {
    const cacheBase = path.resolve('node_modules/.cache');
    fs.mkdirSync(cacheBase, { recursive: true });
    tmpDir = fs.mkdtempSync(path.join(cacheBase, 'retirement-compare-'));
    const entryFile = path.join(tmpDir, 'entry.tsx');
    const outFile = path.join(tmpDir, 'bundle.cjs');

    fs.writeFileSync(
      entryFile,
      `
        export {
          RetirementPlanningCalculator,
          computeRetirementOutcome,
          compareRetirementOutcomes,
          DEFAULT_SCENARIO_A
        } from ${JSON.stringify(path.resolve('src/components/tools/RetirementPlanningCalculator.tsx'))};
        export { MemoryRouter } from 'react-router-dom';
      `,
      'utf8'
    );

    await build({
      entryPoints: [entryFile],
      outfile: outFile,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      nodePaths: [path.resolve('node_modules')],
      logLevel: 'silent'
    });

    const mod = requireFromTest(outFile);
    RetirementPlanningCalculator = mod.RetirementPlanningCalculator;
    computeRetirementOutcome = mod.computeRetirementOutcome;
    compareRetirementOutcomes = mod.compareRetirementOutcomes;
    DEFAULT_SCENARIO_A = mod.DEFAULT_SCENARIO_A;
    MemoryRouter = mod.MemoryRouter;
  });

  after(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. Renders .panel container and Compare Scenario button in default single-scenario view', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/tools/retirement-planning-calculator/'] },
        React.createElement(RetirementPlanningCalculator)
      )
    );

    assert.ok(html.includes('content-section panel'), 'Calculator must include .panel container');
    assert.ok(
      html.includes('data-testid="compare-scenario-btn"') &&
        html.includes('Compare Scenarios') &&
        html.includes('Single Scenario'),
      'Calculator must render Single Scenario and Compare Scenarios toggle controls'
    );
    assert.ok(
      html.includes('data-testid="retirement-scenario-a"') && !html.includes('data-testid="retirement-scenario-b"'),
      'Default view should render Scenario A only until Compare Scenarios is clicked'
    );
  });

  it('2. Computes accurate retirement outcomes and positive surplus delta when comparing Scenario A vs improved Scenario B', () => {
    const base = computeRetirementOutcome(DEFAULT_SCENARIO_A);
    assert.equal(base.errorMsg, '');
    assert.ok(base.results);
    assert.equal(base.results.years, 13);
    assert.equal(base.results.horizon, 30);
    assert.ok(base.results.fundingCoveragePct > 0);

    // Scenario B: retire 2 years later + increase monthly contribution by ₹20,000
    const improved = computeRetirementOutcome({
      ...DEFAULT_SCENARIO_A,
      label: 'Scenario B (Comparison)',
      retirementAge: 60,
      contribution: 50000
    });
    assert.equal(improved.errorMsg, '');
    assert.ok(improved.results);
    assert.equal(improved.results.years, 15);
    assert.equal(improved.results.horizon, 28);
    assert.ok(
      improved.results.projected > base.results.projected,
      'Higher contribution and longer accumulation must yield a larger projected corpus'
    );
    assert.ok(
      improved.results.gap > base.results.gap,
      'Scenario B must improve the projected gap / surplus relative to Scenario A'
    );

    const diff = compareRetirementOutcomes(base.results, improved.results);
    assert.equal(diff.leader, 'B');
    assert.equal(diff.yearsDelta, 2);
    assert.equal(diff.horizonDelta, -2);
    assert.ok(diff.coverageDeltaPct > 0);

    const tieDiff = compareRetirementOutcomes(base.results, base.results);
    assert.equal(tieDiff.leader, 'tie');
  });

  it('3. Validates invalid retirement age, lifespan, and negative inputs independently per scenario', () => {
    const invalidAge = computeRetirementOutcome({ ...DEFAULT_SCENARIO_A, retirementAge: 45 });
    assert.equal(invalidAge.results, null);
    assert.ok(invalidAge.errorMsg.includes('greater than current age'));

    const invalidLifespan = computeRetirementOutcome({ ...DEFAULT_SCENARIO_A, lifespan: 58 });
    assert.equal(invalidLifespan.results, null);
    assert.ok(invalidLifespan.errorMsg.includes('greater than planned retirement age'));

    const negativeInput = computeRetirementOutcome({ ...DEFAULT_SCENARIO_A, contribution: -1000 });
    assert.equal(negativeInput.results, null);
    assert.ok(negativeInput.errorMsg.includes('zero or positive'));
  });
});
