/**
 * Jawed Portfolio Tracker — read-only Google Sheets feed
 * Configure Script Properties:
 *   PORTFOLIO_SPREADSHEET_ID = your Google Sheet ID
 *   PORTFOLIO_FEED_TOKEN = long random secret
 *
 * Deploy as Web App (execute as you). The feed is intended to be called
 * server-to-server by a Cloudflare Worker proxy, not directly by browsers.
 * Token is passed as ?token=... because Apps Script web apps do not provide
 * a reliable request-header interface for Authorization headers.
 */
const SOURCE = {
  sheet: 'Portfolio Live',
  headerRow: 12,
  firstDataRow: 13,
  lastDataRow: 49
};

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty('PORTFOLIO_FEED_TOKEN');
  const supplied = e && e.parameter ? String(e.parameter.token || '') : '';
  if (!expected || !constantTimeEqual_(expected, supplied)) {
    return json_({ error: 'Unauthorized' });
  }
  try {
    const spreadsheetId = props.getProperty('PORTFOLIO_SPREADSHEET_ID');
    if (!spreadsheetId) throw new Error('Missing spreadsheet configuration');
    return json_(buildFeed_(spreadsheetId));
  } catch (err) {
    console.error('Portfolio feed failed: ' + String(err));
    return json_({ error: 'Feed generation failed; review Apps Script configuration.' });
  }
}

function buildFeed_(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName(SOURCE.sheet);
  if (!sheet) throw new Error('Source sheet missing');

  const headers = sheet.getRange(SOURCE.headerRow, 1, 1, 33).getDisplayValues()[0]
    .map(h => String(h).trim());
  const rows = sheet.getRange(SOURCE.firstDataRow, 1,
    SOURCE.lastDataRow - SOURCE.firstDataRow + 1, 33).getValues();

  const idx = {};
  headers.forEach((h, i) => { if (h) idx[h] = i; });
  const col = (header) => idx[header] === undefined ? -1 : idx[header];
  const val = (row, header) => col(header) < 0 ? null : row[col(header)];
  const num = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (v === null || v === '') return 0;
    const n = Number(String(v).replace(/[₹,$,%\s,]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const totalValue = num(sheet.getRange('B2').getValue());
  const usdInr = num(sheet.getRange('K1').getValue());
  const holdings = [];

  rows.forEach(row => {
    const name = String(val(row, 'Stock/Fund Name') || '').trim();
    const symbol = String(val(row, 'Symbol') || '').trim();
    if (!name && !symbol) return;

    const assetClass = String(val(row, 'Asset Class') || '').trim();
    const isCash = /cash/i.test(assetClass + ' ' + name + ' ' + symbol);
    const isUS = assetClass === 'US Equity' ||
      (assetClass === '' && /^[A-Z.]{1,6}$/.test(symbol) &&
       !/GOLD|CASH/i.test(symbol) && name === symbol);
    const currency = isUS && !isCash ? 'USD' : 'INR';
    const valueInr = num(val(row, 'Current Value'));
    const currentPrice = isUS
      ? num(val(row, 'CMP (USD)'))
      : num(val(row, 'NAV/CMP'));
    const category = assetClass || (isUS ? 'US Equity' : (isCash ? 'Cash' : 'Unclassified'));

    holdings.push({
      ticker: symbol || name,
      name,
      market: isCash ? 'Cash' : (isUS ? 'US' : 'IN'),
      category,
      role: String(val(row, 'Role') || 'Unassigned'),
      bucket: String(val(row, 'Bucket') || ''),
      currentPrice,
      currency,
      quantity: num(val(row, 'Units')),
      valueInr,
      investedValueInr: num(val(row, 'Invested Amount')),
      allocationPct: num(val(row, 'Current Allocation %')),
      pnlInr: num(val(row, 'Unrealised P/L')),
      pnlPct: num(val(row, 'Unrealised %')),
      targetPct: num(val(row, 'Target %')),
      maxAllocationPct: num(val(row, 'Maximum Allocation %')),
      thesisStatus: String(val(row, 'Status') || ''),
      priority: String(val(row, 'Priority') || ''),
      investmentGoal: String(val(row, 'Investment Goal') || ''),
      conviction: String(val(row, 'Conviction') || ''),
      risk: String(val(row, 'Risk') || ''),
      expectedCagr: num(val(row, 'Expected CAGR')),
      aiScore: num(val(row, 'AI Score')),
      currentPriceUsd: isUS ? currentPrice : null,
      high52wUsd: isUS ? num(val(row, '52W High (USD)')) : null,
      drawdownPct: isUS ? num(val(row, '% Below 52W High')) : null,
      priceIntegrity: String(val(row, 'Price Integrity') || ''),
      action: String(val(row, 'Action') || ''),
      masterSignal: String(val(row, 'Master Signal') || ''),
      triggerAlert: String(val(row, 'Trigger Alert') || ''),
      capitalDeployment: num(val(row, 'Capital Deployment')),
      decisionReason: String(val(row, 'Decision Reason') || '')
    });
  });

  const investedValueInr = holdings.reduce((s, h) => s + h.investedValueInr, 0);
  const pnlInr = holdings.reduce((s, h) => s + h.pnlInr, 0);
  const cash = holdings.filter(h => h.market === 'Cash')
    .reduce((s, h) => s + h.valueInr, 0);
  const allocationMap = {};
  holdings.forEach(h => {
    const key = h.category || 'Unclassified';
    allocationMap[key] = (allocationMap[key] || 0) + h.valueInr;
  });
  const allocation = Object.keys(allocationMap).map(category => ({
    category,
    role: 'Asset Class',
    valueInr: allocationMap[category],
    pct: totalValue ? allocationMap[category] / totalValue * 100 : 0
  }));

  return {
    meta: {
      lastUpdated: new Date().toISOString(),
      usdInr,
      source: 'Google Sheets / Portfolio Live',
      sourceSheet: SOURCE.sheet
    },
    summary: {
      totalValueInr: totalValue || holdings.reduce((s, h) => s + h.valueInr, 0),
      investedValueInr,
      unrealizedPnlInr: pnlInr,
      unrealizedPnlPct: investedValueInr ? pnlInr / investedValueInr * 100 : 0,
      cashBalanceInr: cash,
      investedPct: totalValue ? (totalValue - cash) / totalValue * 100 : 0
    },
    allocation,
    holdings,
    snapshots: [],
    watchlist: [],
    events: [],
    retirement: {},
    theses: [],
    sourceAudit: {
      sheet: SOURCE.sheet,
      headerRow: SOURCE.headerRow,
      sourceRows: SOURCE.firstDataRow + '-' + SOURCE.lastDataRow,
      holdingsCount: holdings.length,
      unclassifiedCount: holdings.filter(h => h.category === 'Unclassified').length
    }
  };
}

function constantTimeEqual_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
