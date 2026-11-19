import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const requireFromTest = createRequire(import.meta.url);

describe('Tools Directory & Multi-Asset Portfolio Tracker Regression Suite', () => {
  let tmpDir;
  let toolsData;
  let ToolsPage;
  let ToolDetailPage;
  let PortfolioDashboardPage;
  let MemoryRouter;
  let Route;
  let Routes;

  const originalLocalStorage = globalThis.localStorage;

  before(async () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear()
    };

    const cacheBase = path.resolve('node_modules/.cache');
    fs.mkdirSync(cacheBase, { recursive: true });
    tmpDir = fs.mkdtempSync(path.join(cacheBase, 'tools-regression-'));
    const entryFile = path.join(tmpDir, 'entry.tsx');
    const outFile = path.join(tmpDir, 'bundle.cjs');

    fs.writeFileSync(
      entryFile,
      `
        export * as toolsData from ${JSON.stringify(path.resolve('src/data/toolsData.ts'))};
        export { ToolsPage } from ${JSON.stringify(path.resolve('src/pages/ToolsPage.tsx'))};
        export { ToolDetailPage } from ${JSON.stringify(path.resolve('src/pages/ToolDetailPage.tsx'))};
        export { PortfolioDashboardPage } from ${JSON.stringify(path.resolve('src/pages/PortfolioDashboardPage.tsx'))};
        export { MemoryRouter, Route, Routes } from 'react-router-dom';
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
    toolsData = mod.toolsData;
    ToolsPage = mod.ToolsPage;
    ToolDetailPage = mod.ToolDetailPage;
    PortfolioDashboardPage = mod.PortfolioDashboardPage;
    MemoryRouter = mod.MemoryRouter;
    Route = mod.Route;
    Routes = mod.Routes;
  });

  after(() => {
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. toolsList contains exactly 16 tools, 6 in Finance & Planning, and exactly one portfolio-tracker entry', () => {
    const { toolsList } = toolsData;
    assert.equal(toolsList.length, 16, `Expected 16 total tools, got ${toolsList.length}`);

    const financeTools = toolsList.filter((t) => t.category === 'Finance & Planning');
    assert.equal(financeTools.length, 6, `Expected 6 Finance & Planning tools, got ${financeTools.length}`);

    const portfolioEntries = toolsList.filter((t) => t.slug === 'portfolio-tracker');
    assert.equal(portfolioEntries.length, 1, 'Expected exactly one portfolio-tracker entry in toolsList');

    const entry = portfolioEntries[0];
    assert.equal(entry.title, 'Multi-Asset Portfolio Tracker');
    assert.equal(entry.category, 'Finance & Planning');
    assert.equal(entry.path, '/tools/portfolio-tracker/');
    assert.equal(entry.estimatedTime, '4 min');
    assert.deepEqual(entry.tags, ['Portfolio', 'Asset Allocation', 'US & India Stocks', 'LRS Tracker']);
  });

  it('2. ToolsPage renders All (16), Finance & Planning (6), and the Portfolio Tracker card linking to /tools/portfolio-tracker/', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/tools/'] },
        React.createElement(ToolsPage)
      )
    );

    assert.ok(html.includes('All (16)'), 'ToolsPage must display All (16) category count');
    assert.ok(html.includes('Finance &amp; Planning (6)'), 'ToolsPage must display Finance & Planning (6) category count');
    assert.ok(html.includes('data-testid="tool-card-portfolio-tracker"'), 'ToolsPage must render the Portfolio Tracker card');
    assert.ok(html.includes('Multi-Asset Portfolio Tracker'), 'ToolsPage must render the Multi-Asset Portfolio Tracker title');
    assert.ok(
      html.includes('data-testid="tool-link-portfolio-tracker"') && html.includes('href="/tools/portfolio-tracker/"'),
      'Portfolio Tracker card must link to /tools/portfolio-tracker/'
    );
  });

  it('3. Search for "Portfolio Tracker" and Finance & Planning category filter both return portfolio-tracker', () => {
    const { toolsList } = toolsData;
    const filterTools = (selectedCategory, searchQuery) =>
      toolsList.filter((tool) => {
        const matchCat = selectedCategory === 'All' || tool.category === selectedCategory;
        const q = searchQuery.toLowerCase().trim();
        const matchSearch =
          !q ||
          tool.title.toLowerCase().includes(q) ||
          tool.benefit.toLowerCase().includes(q) ||
          tool.description.toLowerCase().includes(q) ||
          tool.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          tool.category.toLowerCase().includes(q);
        return matchCat && matchSearch;
      });

    const searchMatches = filterTools('All', 'Portfolio Tracker');
    assert.ok(
      searchMatches.some((t) => t.slug === 'portfolio-tracker'),
      'Searching for "Portfolio Tracker" must return portfolio-tracker'
    );

    const financeMatches = filterTools('Finance & Planning', '');
    assert.equal(financeMatches.length, 6, 'Finance & Planning filter must return 6 tools');
    assert.ok(
      financeMatches.some((t) => t.slug === 'portfolio-tracker'),
      'Finance & Planning filter must include portfolio-tracker'
    );
  });

  it('4. Portfolio Tracker route renders PortfolioDashboardPage directly and via ToolDetailPage without "Tool Not Found"', () => {
    const directHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/tools/portfolio-tracker/'] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: '/tools/portfolio-tracker/',
            element: React.createElement(PortfolioDashboardPage)
          })
        )
      )
    );
    assert.ok(directHtml.length > 500, 'Direct /tools/portfolio-tracker/ render should produce full dashboard markup');
    assert.ok(!directHtml.includes('Tool Not Found'), 'Direct /tools/portfolio-tracker/ route must not render Tool Not Found');

    const slugHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/tools/portfolio-tracker/'] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: '/tools/:slug/',
            element: React.createElement(ToolDetailPage)
          })
        )
      )
    );
    assert.ok(!slugHtml.includes('Tool Not Found'), 'ToolDetailPage slug route for portfolio-tracker must not render Tool Not Found');
    assert.ok(
      slugHtml.includes('Multi-Asset Portfolio Tracker') || slugHtml.includes('LRS'),
      'ToolDetailPage must render Portfolio Tracker content'
    );
  });

  it('5. Production dist/ output contains static entry points, updated service worker cache version, and portfolio-tracker in JS bundle', () => {
    const distDir = path.resolve('dist');
    assert.ok(fs.existsSync(path.join(distDir, 'tools/index.html')), 'dist/tools/index.html must exist');
    assert.ok(
      fs.existsSync(path.join(distDir, 'tools/portfolio-tracker/index.html')),
      'dist/tools/portfolio-tracker/index.html must exist'
    );

    const ptHtml = fs.readFileSync(path.join(distDir, 'tools/portfolio-tracker/index.html'), 'utf8');
    assert.ok(ptHtml.includes('Multi-Asset Portfolio Tracker'), 'dist/tools/portfolio-tracker/index.html must include title');
    assert.ok(
      ptHtml.includes('https://jawed.co.in/tools/portfolio-tracker/'),
      'dist/tools/portfolio-tracker/index.html must include canonical URL'
    );

    const swText = fs.readFileSync(path.join(distDir, 'service-worker.js'), 'utf8');
    assert.ok(swText.includes("CACHE_NAME = 'jawed-pwa-v5'"), 'dist/service-worker.js must use bumped cache version jawed-pwa-v5');

    const assetFiles = fs.readdirSync(path.join(distDir, 'assets')).filter((f) => f.endsWith('.js'));
    const combinedBundleHasTracker = assetFiles.some((file) => {
      const content = fs.readFileSync(path.join(distDir, 'assets', file), 'utf8');
      return content.includes('portfolio-tracker') && content.includes('Multi-Asset Portfolio Tracker');
    });
    assert.ok(combinedBundleHasTracker, 'Built dist/assets/*.js bundle must contain portfolio-tracker registration');
  });
});
