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
  let ExecutiveOverviewTab;
  let HoldingsAnalyticsTab;
  let WatchlistPipelineTab;
  let RetirementRoadmapTab;
  let MOCK_PORTFOLIO_DATA;
  let computeRebalancePlan;
  let filterRebalanceRows;
  let validateRebalanceInputs;
  let rebalanceWeightsLocked100;
  let DEFAULT_TARGET_WEIGHTS;
  let deriveAllocationFromHoldings;
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
        export { ExecutiveOverviewTab } from ${JSON.stringify(path.resolve('src/components/portfolio/ExecutiveOverviewTab.tsx'))};
        export { HoldingsAnalyticsTab } from ${JSON.stringify(path.resolve('src/components/portfolio/HoldingsAnalyticsTab.tsx'))};
        export { WatchlistPipelineTab } from ${JSON.stringify(path.resolve('src/components/portfolio/WatchlistPipelineTab.tsx'))};
        export { RetirementRoadmapTab } from ${JSON.stringify(path.resolve('src/components/portfolio/RetirementRoadmapTab.tsx'))};
        export { MOCK_PORTFOLIO_DATA } from ${JSON.stringify(path.resolve('src/services/portfolioService.ts'))};
        export { computeRebalancePlan, filterRebalanceRows, validateRebalanceInputs, rebalanceWeightsLocked100, DEFAULT_TARGET_WEIGHTS, deriveAllocationFromHoldings } from ${JSON.stringify(path.resolve('src/components/portfolio/RebalancingCalculatorPanel.tsx'))};
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
    ExecutiveOverviewTab = mod.ExecutiveOverviewTab;
    HoldingsAnalyticsTab = mod.HoldingsAnalyticsTab;
    WatchlistPipelineTab = mod.WatchlistPipelineTab;
    RetirementRoadmapTab = mod.RetirementRoadmapTab;
    MOCK_PORTFOLIO_DATA = mod.MOCK_PORTFOLIO_DATA;
    computeRebalancePlan = mod.computeRebalancePlan;
    filterRebalanceRows = mod.filterRebalanceRows;
    validateRebalanceInputs = mod.validateRebalanceInputs;
    rebalanceWeightsLocked100 = mod.rebalanceWeightsLocked100;
    DEFAULT_TARGET_WEIGHTS = mod.DEFAULT_TARGET_WEIGHTS;
    deriveAllocationFromHoldings = mod.deriveAllocationFromHoldings;
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

  it('6. PortfolioDashboardPage renders .dashboard-control-bar with Privacy Blur toggle and Rebalancing Calculator with persisted localStorage privacy support', () => {
    globalThis.localStorage.clear();
    const defaultHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/tools/portfolio-tracker/'] },
        React.createElement(PortfolioDashboardPage)
      )
    );

    assert.ok(
      defaultHtml.includes('dashboard-control-bar'),
      'Header must include .dashboard-control-bar container'
    );
    assert.ok(
      defaultHtml.includes('data-testid="privacy-blur-toggle"') && defaultHtml.includes('Privacy Blur'),
      'Header must render Privacy Blur toggle inside .dashboard-control-bar'
    );
    assert.ok(
      defaultHtml.includes('data-testid="control-bar-rebalance-btn"') &&
        defaultHtml.includes('data-testid="control-bar-rebalance-search"') &&
        defaultHtml.includes('id="portfolio-rebalancing-panel"') &&
        defaultHtml.includes('data-testid="rebalancing-calculator-panel"') &&
        defaultHtml.includes('class="panel scroll-mt-24') &&
        defaultHtml.includes('Portfolio Rebalancing &amp; Capital Deployment') &&
        defaultHtml.includes('data-testid="rebalance-formula-info-btn"') &&
        defaultHtml.includes('data-testid="rebalance-formula-tooltip"') &&
        defaultHtml.includes('data-testid="rebalance-match-current-btn"') &&
        defaultHtml.includes('data-testid="rebalance-lock-100-btn"') &&
        defaultHtml.includes('data-testid="rebalance-execution-summary"') &&
        defaultHtml.includes('Actionable Buy / Trim Formula') &&
        defaultHtml.includes('(Current Total + Fresh Capital) × Target %') &&
        defaultHtml.includes('Target Value − Current Sleeve Value') &&
        defaultHtml.includes('(Sleeve Shortfall ÷ Total Shortfall) × Fresh Capital') &&
        defaultHtml.includes('(Current Sleeve + Action) ÷ Projected Total') &&
        defaultHtml.includes('data-testid="rebalance-formula-live-example"') &&
        defaultHtml.includes('Target Sum: 100.0% (Valid)'),
      'Executive Overview and .dashboard-control-bar must wire the Portfolio Rebalancing & Capital Deployment .panel with formula info tooltip and valid 100% default sum'
    );
    assert.ok(
      !defaultHtml.includes('data-privacy-masked="true"') && !defaultHtml.includes('monetary-value privacy-blur'),
      'Monetary figures must not have privacy-blur class when Privacy Blur is off'
    );

    // Simulate persisted Privacy Mode enabled in localStorage
    globalThis.localStorage.setItem('jawed_portfolio_privacy_mode', 'true');
    const privateHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/tools/portfolio-tracker/'] },
        React.createElement(PortfolioDashboardPage)
      )
    );
    globalThis.localStorage.removeItem('jawed_portfolio_privacy_mode');

    assert.ok(
      privateHtml.includes('Privacy Blur: On') && privateHtml.includes('aria-pressed="true"'),
      'Header toggle must reflect active state when persisted privacy blur is enabled'
    );
    assert.ok(
      privateHtml.includes('monetary-value privacy-blur') &&
        privateHtml.includes('data-privacy-masked="true"') &&
        privateHtml.includes('₹ ••,••,•••'),
      'Executive Overview must apply privacy-blur CSS class to monetary values when Privacy Blur is on'
    );
    assert.ok(
      privateHtml.includes('93.4% Deployed') && privateHtml.includes('+17.72%'),
      'Percentages and status labels must remain 100% legible when Privacy Blur is on'
    );
  });

  it('7. Privacy Blur Mode masks monetary values across Holdings, Watchlist, and Retirement tabs while preserving tickers and percentages', () => {
    const holdingsHtml = renderToStaticMarkup(
      React.createElement(HoldingsAnalyticsTab, {
        data: MOCK_PORTFOLIO_DATA,
        currency: 'USD',
        privacyMode: true,
        onAddHolding: () => {}
      })
    );
    assert.ok(holdingsHtml.includes('$ ••,•••'), 'Holdings tab must mask USD monetary values');
    assert.ok(
      holdingsHtml.includes('NVDA') && holdingsHtml.includes('On Track'),
      'Holdings tab must keep tickers and status badges readable in Privacy Mode'
    );

    const watchlistHtml = renderToStaticMarkup(
      React.createElement(WatchlistPipelineTab, {
        data: MOCK_PORTFOLIO_DATA,
        currency: 'INR',
        privacyMode: true,
        onAddWatchlistItem: () => {},
        onDeployWatchlistTranche: () => {}
      })
    );
    assert.ok(watchlistHtml.includes('₹ ••,••,•••'), 'Watchlist tab must mask earmarked INR capital');
    assert.ok(
      watchlistHtml.includes('MSFT') && watchlistHtml.includes('Ready to Deploy'),
      'Watchlist tab must keep tickers and deployment stages readable in Privacy Mode'
    );

    const retirementHtml = renderToStaticMarkup(
      React.createElement(RetirementRoadmapTab, {
        data: MOCK_PORTFOLIO_DATA,
        currency: 'INR',
        privacyMode: true
      })
    );
    assert.ok(retirementHtml.includes('₹ ••,••,•••'), 'Retirement tab must mask corpus and milestone INR figures');
    assert.ok(
      !retirementHtml.includes('(₹50L)') && retirementHtml.includes('10%'),
      'Retirement progress ticks must hide monetary suffixes while keeping percentage markers readable'
    );
  });

  it('8. computeRebalancePlan accurately computes pure rebalancing, fresh capital deployment, and invalid weight validation', () => {
    // Pure rebalancing (freshCapitalInr = 0) with default 35 / 25 / 30 / 10
    const purePlan = computeRebalancePlan(MOCK_PORTFOLIO_DATA, DEFAULT_TARGET_WEIGHTS, 0);
    assert.equal(purePlan.targetSum, 100);
    assert.equal(purePlan.isValidSum, true);
    assert.equal(purePlan.rows.length, 4);
    assert.ok(
      Math.abs(purePlan.totalBuyInr - purePlan.totalTrimInr) < 1,
      'Pure rebalancing buys and trims must balance to zero net cash'
    );

    const inRow = purePlan.rows.find((r) => r.key === 'indianEquities');
    const cashRow = purePlan.rows.find((r) => r.key === 'cashLiquid');
    assert.equal(inRow.actionType, 'trim', 'Overweight Indian Equities (38.1% vs 35%) must recommend Trim');
    assert.equal(cashRow.actionType, 'buy', 'Underweight Cash & Liquid (6.6% vs 10%) must recommend Buy');

    // Fresh capital deployment (+₹5,00,000)
    const freshPlan = computeRebalancePlan(MOCK_PORTFOLIO_DATA, DEFAULT_TARGET_WEIGHTS, 500000);
    assert.equal(freshPlan.projectedTotalInr, freshPlan.currentTotalInr + 500000);
    const netActionSum = freshPlan.rows.reduce((sum, r) => sum + r.actionAmountInr, 0);
    assert.ok(
      Math.abs(netActionSum - 500000) < 1,
      `Net sum of Buy/Trim actions must equal fresh capital ₹500,000 (got ${netActionSum})`
    );

    // Tax-aware Cash-Only (No Sell) deployment (+₹5,00,000)
    const cashOnlyPlan = computeRebalancePlan(
      MOCK_PORTFOLIO_DATA,
      DEFAULT_TARGET_WEIGHTS,
      500000,
      'cash-only'
    );
    assert.equal(cashOnlyPlan.totalTrimInr, 0, 'Cash-Only mode must never recommend trimming existing holdings');
    assert.ok(
      Math.abs(cashOnlyPlan.totalBuyInr - 500000) < 1,
      `Cash-Only mode must deploy 100% of fresh capital ₹500,000 (got ${cashOnlyPlan.totalBuyInr})`
    );

    // Invalid target sum detection (110%)
    const invalidPlan = computeRebalancePlan(
      MOCK_PORTFOLIO_DATA,
      { indianEquities: 40, mutualFunds: 30, usEquities: 30, cashLiquid: 10 },
      0
    );
    assert.equal(invalidPlan.targetSum, 110);
    assert.equal(invalidPlan.isValidSum, false);

    // Holdings mutation sync: adding a ₹5,00,000 US holding updates derived allocation and increases US Equities Trim
    const addedUsHoldings = [
      {
        ticker: 'MSFT',
        name: 'Microsoft Corp',
        market: 'US',
        role: 'Core',
        currentPrice: 430,
        currency: 'USD',
        valueInr: 500000,
        allocationPct: 9.3,
        pnlPct: 0,
        thesisStatus: 'On Track'
      },
      ...MOCK_PORTFOLIO_DATA.holdings
    ];
    const derivedAllocation = deriveAllocationFromHoldings(
      addedUsHoldings,
      MOCK_PORTFOLIO_DATA.summary.cashBalanceInr,
      MOCK_PORTFOLIO_DATA.allocation
    );
    const updatedPlan = computeRebalancePlan(
      { ...MOCK_PORTFOLIO_DATA, holdings: addedUsHoldings, allocation: derivedAllocation },
      DEFAULT_TARGET_WEIGHTS,
      0
    );
    const usRow = updatedPlan.rows.find((r) => r.key === 'usEquities');
    assert.equal(usRow.holdingsCount, 4, 'US Equities sleeve must reflect 4 holdings after adding MSFT');
    assert.equal(usRow.actionType, 'trim', 'Overweight US Equities (~37% vs 30%) must recommend Trim');

    // Live-feed resilience: unmatched allocation labels fall back to holdings-derived sleeves
    const customFeedPlan = computeRebalancePlan(
      {
        ...MOCK_PORTFOLIO_DATA,
        allocation: [{ category: 'Custom Bucket A', role: 'Core', valueInr: 4850000, pct: 100 }]
      },
      DEFAULT_TARGET_WEIGHTS,
      0
    );
    const derivedSum = customFeedPlan.rows.reduce((sum, r) => sum + r.currentValueInr, 0);
    assert.ok(derivedSum > 4000000, 'Unmatched live feed categories must fall back to holdings-derived sleeve totals');
  });

  it('9. Control bar search query filters actionable Buy/Trim rows by action, sleeve name, and holding ticker', () => {
    const plan = computeRebalancePlan(MOCK_PORTFOLIO_DATA, DEFAULT_TARGET_WEIGHTS, 0);

    const buyOnly = filterRebalanceRows(plan.rows, 'buy');
    assert.ok(buyOnly.length > 0 && buyOnly.every((r) => r.actionType === 'buy'), 'Query "buy" must return only Buy sleeves');

    const trimOnly = filterRebalanceRows(plan.rows, 'trim');
    assert.ok(trimOnly.length > 0 && trimOnly.every((r) => r.actionType === 'trim'), 'Query "trim" must return only Trim sleeves');

    const nvdaMatch = filterRebalanceRows(plan.rows, 'NVDA');
    assert.equal(nvdaMatch.length, 1);
    assert.equal(nvdaMatch[0].key, 'usEquities', 'Query "NVDA" must match the US Equities sleeve');

    const noneMatch = filterRebalanceRows(plan.rows, 'nonexistent-sleeve-xyz');
    assert.equal(noneMatch.length, 0);

    const filteredHtml = renderToStaticMarkup(
      React.createElement(ExecutiveOverviewTab, {
        data: MOCK_PORTFOLIO_DATA,
        currency: 'INR',
        rebalanceSearchQuery: 'NVDA',
        onNavigateTab: () => {}
      })
    );
    assert.ok(
      filteredHtml.includes('data-testid="rebalance-active-filter-banner"') &&
        filteredHtml.includes('data-testid="rebalance-row-usEquities"') &&
        !filteredHtml.includes('data-testid="rebalance-row-indianEquities"'),
      'ExecutiveOverviewTab must render only matching actionable rows and active filter banner when rebalanceSearchQuery is set'
    );

    const emptyHtml = renderToStaticMarkup(
      React.createElement(ExecutiveOverviewTab, {
        data: MOCK_PORTFOLIO_DATA,
        currency: 'INR',
        rebalanceSearchQuery: 'does-not-exist',
        onNavigateTab: () => {}
      })
    );
    assert.ok(
      emptyHtml.includes('data-testid="rebalance-empty-filter-row"'),
      'Empty search matches must render the empty-state guidance row'
    );
  });

  it('10. Client-side validation enforces exact 100% target sum, non-negative inputs, and Lock 100% redistribution', () => {
    const valid = validateRebalanceInputs(DEFAULT_TARGET_WEIGHTS, '250000');
    assert.equal(valid.isAllValid, true);
    assert.equal(valid.isValidSum, true);
    assert.equal(valid.isFreshCapitalValid, true);
    assert.equal(valid.errors.length, 0);

    const overSum = validateRebalanceInputs(
      { indianEquities: 40, mutualFunds: 25, usEquities: 30, cashLiquid: 10 },
      '0'
    );
    assert.equal(overSum.isValidSum, false);
    assert.equal(overSum.targetSum, 105);
    assert.equal(overSum.isAllValid, false);
    assert.ok(overSum.targetSumError.includes('105.0%'));

    const negTarget = validateRebalanceInputs(
      { indianEquities: -5, mutualFunds: 35, usEquities: 40, cashLiquid: 30 },
      '0'
    );
    assert.equal(negTarget.hasNegativeTarget, true);
    assert.equal(negTarget.isValidSum, false);
    assert.equal(negTarget.isAllValid, false);

    const negCapital = validateRebalanceInputs(DEFAULT_TARGET_WEIGHTS, '-50000');
    assert.equal(negCapital.isFreshCapitalValid, false);
    assert.equal(negCapital.isAllValid, false);
    assert.ok(negCapital.freshCapitalError.includes('cannot be negative'));

    const locked = rebalanceWeightsLocked100(DEFAULT_TARGET_WEIGHTS, 'usEquities', 45);
    const lockedCheck = validateRebalanceInputs(locked, '100000');
    assert.equal(locked.usEquities, 45);
    assert.equal(lockedCheck.targetSum, 100);
    assert.equal(lockedCheck.isValidSum, true);
    assert.ok(
      Object.values(locked).every((v) => v >= 0 && v <= 100),
      'Locked 100% redistribution must keep every sleeve non-negative and <= 100%'
    );
  });

  it('9. Static tools/portfolio-tracker/index.html navigation satisfies parity contract across inline and multiline whitespace variations', () => {
    const ptHtml = fs.readFileSync(path.resolve('tools/portfolio-tracker/index.html'), 'utf8');
    const navMatch = ptHtml.match(/<nav id="site-nav" class="site-nav" aria-label="Main navigation">([\s\S]*?)<\/nav>/);
    assert.ok(navMatch, 'tools/portfolio-tracker/index.html must contain #site-nav navigation element');

    const nav = navMatch[1];
    const navPattern = /<details class="nav-group">\s*<summary>Explore<\/summary>/;

    // Actual page validation
    assert.ok(navPattern.test(nav), 'portfolio tracker navigation must match Explore details/summary pattern');
    assert.ok(nav.includes('<a href="/topics/">Topics</a>'), 'portfolio tracker navigation must link to Topics');
    assert.ok(nav.includes('<a href="/notes/">Notes</a>'), 'portfolio tracker navigation must link to Notes');
    assert.ok(nav.includes('<a href="/blog/">Blog</a>'), 'portfolio tracker navigation must link to Blog');
    assert.ok(nav.includes('<a href="/resources/">Resources</a>'), 'portfolio tracker navigation must link to Resources');
    assert.ok(/<a href="\/tools\/"(?:\s[^>]*)?>Tools<\/a>/.test(nav), 'portfolio tracker navigation must link to Tools');
    assert.ok(nav.includes('<a href="/ai/">AI</a>'), 'portfolio tracker navigation must link to AI');
    assert.ok(nav.includes('<a href="/contact/">Contact</a>'), 'portfolio tracker navigation must link to Contact');

    // Inline markup variation coverage
    const inlineNav = '<details class="nav-group"><summary>Explore</summary></details>';
    assert.ok(navPattern.test(inlineNav), 'navPattern must match compact inline HTML markup');

    // Multiline with indentation variation coverage
    const multilineNav = '<details class="nav-group">\n            <summary>Explore</summary>\n          </details>';
    assert.ok(navPattern.test(multilineNav), 'navPattern must match multiline HTML markup with arbitrary whitespace');
  });
});
