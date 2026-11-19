/**
 * Portfolio Tracker Google Sheets JSON feed — starter template.
 * READ-ONLY. Configure header names before deploying.
 *
 * Set Script Property PORTFOLIO_FEED_TOKEN to a long random token.
 * Deploy as Web App, execute as you, access: Anyone (token is validated in doGet).
 * Do not commit your token.
 */
const CONFIG = {
  spreadsheetId: 'PASTE_SPREADSHEET_ID_HERE',
  sheetName: 'Portfolio Live',
  headerRow: 1,
  // Replace values with the EXACT header names in your sheet.
  columns: {
    ticker: 'Ticker',
    name: 'Name',
    market: 'Market',
    role: 'Role',
    price: 'Current Price',
    currency: 'Currency',
    valueInr: 'Current Value (INR)',
    investedInr: 'Invested Value (INR)',
    allocationPct: 'Allocation %',
    targetPct: 'Target %',
    pnlPct: 'Return %',
    sector: 'Sector',
    thesisStatus: 'Thesis Status',
    thesisNote: 'Notes'
  },
  // Optional: configure these from a separate summary sheet once verified.
  usdInr: 0,
  lrsUsedUsd: 0,
  lrsUsedInr: 0,
  lrsAnnualLimitUsd: 250000,
  cashBalanceInr: 0,
  retirementTargetInr: 0
};

function doGet(e) {
  const expected = PropertiesService.getScriptProperties().getProperty('PORTFOLIO_FEED_TOKEN');
  const supplied = (e && e.parameter && e.parameter.token) || '';
  if (!expected || supplied !== expected) {
    return json_({ error: 'Unauthorized' }, 401);
  }
  try {
    return json_(buildPortfolio_(), 200);
  } catch (err) {
    // Never expose sheet values or stack traces in a public response.
    console.error(err);
    return json_({ error: 'Portfolio feed could not be generated. Check script configuration.' }, 500);
  }
}

function buildPortfolio_() {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(CONFIG.sheetName);
  if (!sheet) throw new Error('Configured sheet not found');
  const values = sheet.getDataRange().getValues();
  if (values.length <= CONFIG.headerRow) return emptyPortfolio_();

  const headers = values[CONFIG.headerRow - 1].map(v => String(v).trim());
  const idx = {};
  Object.keys(CONFIG.columns).forEach(key => {
    const header = CONFIG.columns[key];
    idx[key] = header ? headers.indexOf(header) : -1;
  });

  const get = (row, key) => idx[key] >= 0 ? row[idx[key]] : '';
  const num = value => {
    if (typeof value === 'number') return value;
    const cleaned = String(value || '').replace(/[₹,$,%\s,]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };
  const holdings = values.slice(CONFIG.headerRow).filter(row => {
    return get(row, 'ticker') || get(row, 'name');
  }).map(row => {
    const currency = String(get(row, 'currency') || 'INR').toUpperCase();
    return {
      ticker: String(get(row, 'ticker') || '').trim().toUpperCase(),
      name: String(get(row, 'name') || get(row, 'ticker') || '').trim(),
      market: String(get(row, 'market') || (currency === 'USD' ? 'US' : 'IN')).trim(),
      role: String(get(row, 'role') || 'Core'),
      currentPrice: num(get(row, 'price')),
      currency: currency,
      valueInr: num(get(row, 'valueInr')),
      allocationPct: num(get(row, 'allocationPct')),
      pnlPct: num(get(row, 'pnlPct')),
      thesisStatus: String(get(row, 'thesisStatus') || 'On Track'),
      sector: String(get(row, 'sector') || ''),
      targetPct: num(get(row, 'targetPct')),
      thesisNote: String(get(row, 'thesisNote') || '')
    };
  }).filter(h => h.ticker || h.name);

  const totalValue = holdings.reduce((sum, h) => sum + h.valueInr, 0);
  const investedValue = holdings.reduce((sum, h) => {
    const cost = h.pnlPct !== 0 ? h.valueInr / (1 + h.pnlPct / 100) : h.valueInr;
    return sum + cost;
  }, 0);
  const pnl = totalValue - investedValue;
  const allocationMap = {};
  holdings.forEach(h => {
    const category = h.market === 'US' ? 'US Equities' :
      h.market === 'MF' ? 'Mutual Funds' :
      h.market === 'IN' ? 'Indian Equities' : h.market;
    allocationMap[category] = (allocationMap[category] || 0) + h.valueInr;
  });
  const allocation = Object.keys(allocationMap).map(category => ({
    category,
    role: 'Portfolio',
    valueInr: allocationMap[category],
    pct: totalValue ? allocationMap[category] / totalValue * 100 : 0
  }));

  return {
    meta: {
      lastUpdated: new Date().toISOString(),
      usdInr: CONFIG.usdInr || 0,
      lrsUsedUsd: CONFIG.lrsUsedUsd,
      lrsUsedInr: CONFIG.lrsUsedInr,
      lrsAnnualLimitUsd: CONFIG.lrsAnnualLimitUsd
    },
    summary: {
      totalValueInr: totalValue,
      investedValueInr: investedValue,
      unrealizedPnlInr: pnl,
      unrealizedPnlPct: investedValue ? pnl / investedValue * 100 : 0,
      cashBalanceInr: CONFIG.cashBalanceInr,
      investedPct: totalValue ? (totalValue - CONFIG.cashBalanceInr) / totalValue * 100 : 0
    },
    allocation,
    holdings,
    snapshots: [],
    watchlist: [],
    events: [],
    retirement: {
      targetCorpusInr: CONFIG.retirementTargetInr,
      currentProgressPct: CONFIG.retirementTargetInr ? totalValue / CONFIG.retirementTargetInr * 100 : 0,
      growthAllocationPct: 0,
      statusNote: 'Imported from Google Sheets'
    },
    theses: []
  };
}

function emptyPortfolio_() {
  return {
    meta: { lastUpdated: new Date().toISOString(), usdInr: CONFIG.usdInr, lrsUsedUsd: CONFIG.lrsUsedUsd, lrsUsedInr: CONFIG.lrsUsedInr, lrsAnnualLimitUsd: CONFIG.lrsAnnualLimitUsd },
    summary: { totalValueInr: 0, investedValueInr: 0, unrealizedPnlInr: 0, unrealizedPnlPct: 0, cashBalanceInr: CONFIG.cashBalanceInr, investedPct: 0 },
    allocation: [], holdings: [], snapshots: [], watchlist: [], events: [],
    retirement: { targetCorpusInr: CONFIG.retirementTargetInr, currentProgressPct: 0, growthAllocationPct: 0, statusNote: 'Imported from Google Sheets' },
    theses: []
  };
}

function json_(data, status) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
