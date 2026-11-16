import { PortfolioData, CurrencyCode, ThesisEntry } from '../types/portfolio';

export const MOCK_PORTFOLIO_DATA: PortfolioData = {
  meta: {
    lastUpdated: '2026-11-16T10:30:00+05:30',
    usdInr: 95.41,
    lrsUsedUsd: 5817.0,
    lrsUsedInr: 555000,
    lrsAnnualLimitUsd: 250000
  },
  summary: {
    totalValueInr: 4850000,
    investedValueInr: 4120000,
    unrealizedPnlInr: 730000,
    unrealizedPnlPct: 17.72,
    cashBalanceInr: 320000,
    investedPct: 93.4
  },
  allocation: [
    { category: 'Indian Equities', role: 'Core Growth', valueInr: 1850000, pct: 38.1 },
    { category: 'Mutual Funds', role: 'Compounder', valueInr: 1200000, pct: 24.7 },
    { category: 'US Equities', role: 'Global Tech', valueInr: 1480000, pct: 30.5 },
    { category: 'Cash & Liquid', role: 'Dry Powder', valueInr: 320000, pct: 6.6 }
  ],
  holdings: [
    {
      ticker: 'NVDA',
      name: 'NVIDIA Corp',
      market: 'US',
      role: 'Core',
      currentPrice: 142.5,
      currency: 'USD',
      valueInr: 680000,
      allocationPct: 14.0,
      pnlPct: 42.5,
      thesisStatus: 'On Track',
      sector: 'Semiconductors & AI',
      targetPct: 14.0,
      thesisNote: 'Hyperscaler Blackwell ramp and sovereign AI cluster buildouts driving sustained data center revenue visibility.'
    },
    {
      ticker: 'GOOGL',
      name: 'Alphabet Inc',
      market: 'US',
      role: 'Compounder',
      currentPrice: 194.8,
      currency: 'USD',
      valueInr: 440000,
      allocationPct: 9.1,
      pnlPct: 24.8,
      thesisStatus: 'On Track',
      sector: 'Cloud & Search AI',
      targetPct: 10.0,
      thesisNote: 'Google Cloud operating margin expansion to 17%+ alongside resilient Search monetization and custom TPU cost advantage.'
    },
    {
      ticker: 'AMZN',
      name: 'Amazon.com Inc',
      market: 'US',
      role: 'Compounder',
      currentPrice: 218.4,
      currency: 'USD',
      valueInr: 360000,
      allocationPct: 7.4,
      pnlPct: 19.6,
      thesisStatus: 'On Track',
      sector: 'Cloud & Commerce',
      targetPct: 8.0,
      thesisNote: 'AWS backlog acceleration paired with North America fulfillment regionalization driving record free cash flow conversion.'
    },
    {
      ticker: 'ICICIBANK',
      name: 'ICICI Bank Ltd',
      market: 'IN',
      role: 'Core Growth',
      currentPrice: 1315.0,
      currency: 'INR',
      valueInr: 580000,
      allocationPct: 12.0,
      pnlPct: 22.4,
      thesisStatus: 'On Track',
      sector: 'Private Banking',
      targetPct: 12.0,
      thesisNote: 'Industry-leading RoA (2.3%+), granular retail deposit franchise, and disciplined unsecured credit underwriting.'
    },
    {
      ticker: 'TCS',
      name: 'Tata Consultancy Services',
      market: 'IN',
      role: 'Compounder',
      currentPrice: 4180.0,
      currency: 'INR',
      valueInr: 470000,
      allocationPct: 9.7,
      pnlPct: 11.2,
      thesisStatus: 'Watch',
      sector: 'IT Services',
      targetPct: 9.0,
      thesisNote: 'Strong total contract value (TCV) deal wins ($9B+ quarterly), monitoring BFSI discretionary spend recovery in North America.'
    },
    {
      ticker: 'SUNPHARMA',
      name: 'Sun Pharmaceutical Industries',
      market: 'IN',
      role: 'Core Growth',
      currentPrice: 1890.0,
      currency: 'INR',
      valueInr: 430000,
      allocationPct: 8.9,
      pnlPct: 28.5,
      thesisStatus: 'On Track',
      sector: 'Specialty Pharma',
      targetPct: 8.5,
      thesisNote: 'Global specialty portfolio (Ilumya, Winlevi, Cequa) exceeding 20% of revenue with structurally higher gross margins.'
    },
    {
      ticker: 'LT',
      name: 'Larsen & Toubro Ltd',
      market: 'IN',
      role: 'Tactical / Cyclical',
      currentPrice: 3685.0,
      currency: 'INR',
      valueInr: 370000,
      allocationPct: 7.6,
      pnlPct: 15.8,
      thesisStatus: 'On Track',
      sector: 'Infrastructure & EPC',
      targetPct: 7.5,
      thesisNote: 'Order book crossing ₹5.1 Lakh Cr driven by domestic energy transition and Middle East hydrocarbon/grid capex.'
    },
    {
      ticker: 'PPFAS-FC',
      name: 'Parag Parikh Flexi Cap Direct Growth',
      market: 'MF',
      role: 'Compounder',
      currentPrice: 88.45,
      currency: 'INR',
      valueInr: 560000,
      allocationPct: 11.5,
      pnlPct: 21.3,
      thesisStatus: 'On Track',
      sector: 'Flexi Cap Equity',
      targetPct: 12.0,
      thesisNote: 'Low-churn value-oriented core portfolio with downside protection and international tech sleeve.'
    },
    {
      ticker: 'UTI-NIFTY50',
      name: 'UTI Nifty 50 Index Direct Growth',
      market: 'MF',
      role: 'Core Anchor',
      currentPrice: 168.2,
      currency: 'INR',
      valueInr: 380000,
      allocationPct: 7.8,
      pnlPct: 14.9,
      thesisStatus: 'On Track',
      sector: 'Large Cap Index',
      targetPct: 8.0,
      thesisNote: 'Ultra-low expense ratio (0.18%) passive exposure to India top-50 corporate earnings compounding.'
    },
    {
      ticker: 'MO-MIDCAP',
      name: 'Motilal Oswal Midcap Direct Growth',
      market: 'MF',
      role: 'Alpha Satellite',
      currentPrice: 104.6,
      currency: 'INR',
      valueInr: 260000,
      allocationPct: 5.4,
      pnlPct: -3.2,
      thesisStatus: 'Review',
      sector: 'Midcap Growth',
      targetPct: 5.0,
      thesisNote: 'High-growth midcap exposure; currently monitoring valuation multiples across domestic industrials and EMS holdings.'
    }
  ],
  snapshots: [
    {
      date: '2026-05-01',
      totalValueInr: 4050000,
      usEquityUsd: 12200,
      cashUsd: 2100,
      sp500: 5280,
      qqq: 442
    },
    {
      date: '2026-06-01',
      totalValueInr: 4190000,
      usEquityUsd: 12950,
      cashUsd: 1850,
      sp500: 5410,
      qqq: 458
    },
    {
      date: '2026-07-01',
      totalValueInr: 4340000,
      usEquityUsd: 13600,
      cashUsd: 1600,
      sp500: 5530,
      qqq: 471
    },
    {
      date: '2026-08-01',
      totalValueInr: 4410000,
      usEquityUsd: 13900,
      cashUsd: 1500,
      sp500: 5590,
      qqq: 476
    },
    {
      date: '2026-09-01',
      totalValueInr: 4515000,
      usEquityUsd: 14350,
      cashUsd: 1350,
      sp500: 5670,
      qqq: 482
    },
    {
      date: '2026-10-01',
      totalValueInr: 4620000,
      usEquityUsd: 14900,
      cashUsd: 1200,
      sp500: 5750,
      qqq: 490
    },
    {
      date: '2026-11-16',
      totalValueInr: 4850000,
      usEquityUsd: 15512,
      cashUsd: 3354,
      sp500: 5910,
      qqq: 508
    }
  ],
  watchlist: [
    {
      ticker: 'MSFT',
      company: 'Microsoft',
      stage: 'Ready to Deploy',
      targetRole: 'Compounder',
      sector: 'Cloud / AI',
      currentPrice: 425.0,
      high52w: 468.0,
      drawdownPct: -9.2,
      thesisStatus: 'Validated',
      allocatedCapitalUsd: 2500,
      nextStep: 'Buy tranche 1 on 10% pullback'
    },
    {
      ticker: 'ASML',
      company: 'ASML Holding NV',
      stage: 'Ready to Deploy',
      targetRole: 'Core Moat',
      sector: 'Semiconductor Lithography',
      currentPrice: 712.0,
      high52w: 1056.0,
      drawdownPct: -32.6,
      thesisStatus: 'Validated',
      allocatedCapitalUsd: 2000,
      nextStep: 'Accumulate tranche 1 below $720 on High-NA EUV order visibility'
    },
    {
      ticker: 'TSM',
      company: 'Taiwan Semiconductor (TSMC)',
      stage: 'Accumulating',
      targetRole: 'Core Growth',
      sector: 'Foundry / CoWoS Packaging',
      currentPrice: 188.5,
      high52w: 212.0,
      drawdownPct: -11.1,
      thesisStatus: 'Validated',
      allocatedCapitalUsd: 1800,
      nextStep: 'Add second tranche on N2 node & CoWoS capacity expansion update'
    },
    {
      ticker: 'AVGO',
      company: 'Broadcom Inc',
      stage: 'Monitoring',
      targetRole: 'Growth Compounder',
      sector: 'Custom AI XPUs & Networking',
      currentPrice: 171.2,
      high52w: 185.0,
      drawdownPct: -7.5,
      thesisStatus: 'Validated',
      allocatedCapitalUsd: 1500,
      nextStep: 'Wait for post-earnings consolidation near 50-DMA ($162)'
    },
    {
      ticker: 'BAJFINANCE',
      company: 'Bajaj Finance Ltd',
      stage: 'Ready to Deploy',
      targetRole: 'Core Growth (IN)',
      sector: 'NBFC / Consumer Lending',
      currentPrice: 6890.0,
      high52w: 7830.0,
      drawdownPct: -12.0,
      thesisStatus: 'Validated',
      allocatedCapitalUsd: 1600,
      nextStep: 'Deploy ₹1.5L tranche on credit cost stabilization below 1.9%'
    },
    {
      ticker: 'TITAN',
      company: 'Titan Company Ltd',
      stage: 'Researching',
      targetRole: 'Consumer Compounder',
      sector: 'Discretionary Retail',
      currentPrice: 3260.0,
      high52w: 3886.0,
      drawdownPct: -16.1,
      thesisStatus: 'Under Review',
      allocatedCapitalUsd: 1200,
      nextStep: 'Evaluate studded jewelry margin recovery in Q3 festive update'
    }
  ],
  events: [
    {
      date: '2026-11-20',
      ticker: 'NVDA',
      company: 'NVIDIA',
      type: 'Earnings',
      status: 'Upcoming',
      notes: 'Watch data center guidance, Blackwell rack gross margin trajectory (target >73%), and sovereign AI backlog.'
    },
    {
      date: '2026-11-28',
      ticker: 'IN-GDP',
      company: 'MOSPI India Q2 FY27 GDP',
      type: 'Macro',
      status: 'Upcoming',
      notes: 'Monitor gross fixed capital formation (GFCF) and urban private consumption growth rate for domestic banks & EPC.'
    },
    {
      date: '2026-12-05',
      ticker: 'AVGO',
      company: 'Broadcom Inc',
      type: 'Earnings',
      status: 'Upcoming',
      notes: 'Track custom AI accelerator (XPU) hyperscaler customer additions and VMware software EBITDA margin integration.'
    },
    {
      date: '2026-12-16',
      ticker: 'FOMC',
      company: 'US Federal Reserve Rate Decision',
      type: 'Macro',
      status: 'Upcoming',
      notes: 'Review updated Summary of Economic Projections (SEP) dot plot and USD/INR LRS remittance window timing.'
    },
    {
      date: '2027-01-12',
      ticker: 'TCS',
      company: 'Tata Consultancy Services',
      type: 'Earnings',
      status: 'Upcoming',
      notes: 'Assess Q3 seasonal furlough impact, North America BFSI green shoots, and GenAI pipeline conversion.'
    },
    {
      date: '2026-10-29',
      ticker: 'GOOGL',
      company: 'Alphabet Inc',
      type: 'Earnings',
      status: 'Completed',
      notes: 'Beat consensus: Google Cloud grew 35% YoY to $11.4B with operating margin expanding to 17.1%. Thesis validated.'
    }
  ],
  retirement: {
    targetCorpusInr: 50000000,
    currentProgressPct: 9.7,
    growthAllocationPct: 65.0,
    statusNote: 'On track — continue monthly SIP and US LRS tranches'
  },
  theses: [
    {
      id: 'thesis-nvda',
      ticker: 'NVDA',
      company: 'NVIDIA Corp',
      market: 'US',
      role: 'Core',
      thesisStatus: 'On Track',
      lastUpdated: '2026-11-10',
      conviction: 'High',
      summary: 'Full-stack accelerated computing moat anchored by CUDA ecosystem lock-in, NVLink interconnect superiority, and an annual 1-year architecture cadence (Hopper → Blackwell → Rubin).',
      bullCase: [
        'Hyperscaler capital expenditure shifting structurally from general-purpose CPUs to accelerated AI training and inference clusters.',
        'CUDA software libraries (TensorRT-LLM, NIM microservices) create high switching costs for enterprise AI workloads.',
        'Networking attach rates (InfiniBand & Spectrum-X Ethernet) compounding alongside GPU rack density.'
      ],
      risksAndKillCriteria: [
        'Gross margin compression below 70% for two consecutive quarters due to custom ASIC competition.',
        'Hyperscaler capex digestion phase resulting in >15% YoY decline in Data Center segment revenue.',
        'Geopolitical export restrictions or Taiwan foundry supply chain disruption.'
      ],
      valuationMetrics: 'Forward P/E: 31.5x | PEG: 1.05x | ROIC: 68% | FCF Yield: 2.8%'
    },
    {
      id: 'thesis-msft',
      ticker: 'MSFT',
      company: 'Microsoft',
      stage: 'Ready to Deploy',
      market: 'US',
      role: 'Compounder',
      thesisStatus: 'Validated',
      lastUpdated: '2026-11-12',
      conviction: 'High',
      summary: 'Enterprise distribution monopoly combining Azure AI infrastructure scale with M365 Copilot seat monetization across 400M+ commercial seats.',
      bullCase: [
        'Azure revenue re-acceleration driven by AI workload capacity coming online in H2 FY27.',
        'High-margin enterprise Copilot adoption lifting commercial ARPU by 15–20% over a 5-year cycle.',
        'Fortress balance sheet with AAA credit rating and disciplined capital return via buybacks and growing dividends.'
      ],
      risksAndKillCriteria: [
        'Capex intensity ($80B+ annualized) failing to translate into incremental cloud gross margin expansion within 18 months.',
        'Enterprise seat optimization slowing Office 365 Commercial revenue growth below 10% YoY.'
      ],
      valuationMetrics: 'Forward P/E: 29.8x | EV/EBITDA: 21.4x | Operating Margin: 44.5%'
    } as ThesisEntry,
    {
      id: 'thesis-icicibank',
      ticker: 'ICICIBANK',
      company: 'ICICI Bank Ltd',
      market: 'IN',
      role: 'Core Growth',
      thesisStatus: 'On Track',
      lastUpdated: '2026-11-05',
      conviction: 'High',
      summary: 'Premier Indian private sector banking compounder delivering 17%+ RoE and 2.3% RoA through superior digital underwriting and low-cost CASA franchise.',
      bullCase: [
        '15–16% sustainable loan book growth across high-quality retail, SME, and business banking segments.',
        'Best-in-class asset quality with Net NPA below 0.45% and strong provision coverage ratio (~80%).',
        'Digital stack (iMobile Pay & InstaBIZ) driving cross-sell fee income with minimal branch opex inflation.'
      ],
      risksAndKillCriteria: [
        'Net Interest Margin (NIM) compressing below 4.0% during RBI rate cut cycle.',
        'Gross NPA spike above 2.5% or deterioration in unsecured retail credit delinquency.'
      ],
      valuationMetrics: 'P/B (Standalone): 3.1x | RoA: 2.36% | RoE: 17.8% | Net NPA: 0.42%'
    },
    {
      id: 'thesis-asml',
      ticker: 'ASML',
      company: 'ASML Holding NV',
      market: 'US',
      role: 'Core Moat',
      thesisStatus: 'Validated',
      lastUpdated: '2026-11-14',
      conviction: 'High',
      summary: '100% technological monopoly in Extreme Ultraviolet (EUV) semiconductor lithography systems essential for sub-3nm logic and DRAM scaling.',
      bullCase: [
        '32% drawdown from 52-week high offers rare entry into an irreplaceable monopoly at ~25x 2027E earnings.',
        'High-NA EUV ($380M+ per system) adoption by TSMC, Intel, and Samsung for 2nm/1.4nm nodes drives ASP expansion.',
        'Installed Base Management (service & upgrades) provides resilient recurring cash flow (~25% of sales).'
      ],
      risksAndKillCriteria: [
        'Prolonged delay in foundry 2nm gate-all-around (GAA) node ramp pushing tool deliveries beyond 2027.',
        'Further sovereign export controls restricting DUV immersion service revenue in China below 18% of sales.'
      ],
      valuationMetrics: 'Forward P/E: 25.4x | Gross Margin: 51.5% | 2030 Revenue Guidance: €44B–€60B'
    }
  ]
};

/**
 * Fetches live portfolio JSON from a Cloudflare Worker or Google Apps Script endpoint.
 * Normalizes and validates the payload against the PortfolioData schema.
 */
export async function fetchLivePortfolio(
  endpointUrl: string,
  authToken?: string
): Promise<PortfolioData> {
  const trimmedUrl = endpointUrl.trim();
  if (!trimmedUrl) {
    throw new Error('Please provide a valid Cloudflare Worker or Google Apps Script endpoint URL.');
  }

  let parsedUrlString: string;
  try {
    if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
      parsedUrlString = new URL(trimmedUrl).toString();
    } else if (trimmedUrl.startsWith('/')) {
      parsedUrlString = new URL(trimmedUrl, window.location.origin).toString();
    } else {
      parsedUrlString = new URL(`https://${trimmedUrl}`).toString();
    }
  } catch {
    throw new Error('Invalid URL format. Ensure the URL starts with https:// or http://.');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json'
  };

  if (authToken && authToken.trim()) {
    headers['Authorization'] = `Bearer ${authToken.trim()}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(parsedUrlString, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Endpoint returned HTTP ${response.status} (${response.statusText || 'Error'})`);
    }

    const raw = await response.json();
    return normalizePortfolioPayload(raw);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Live sync timed out after 15 seconds. Check your endpoint availability.');
    }
    throw err instanceof Error ? err : new Error('Failed to fetch live portfolio feed.');
  }
}

/**
 * Validates and normalizes a raw JSON object into a complete PortfolioData structure.
 */
export function normalizePortfolioPayload(raw: any): PortfolioData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Payload is not a valid JSON object.');
  }

  // Handle common wrappers like { data: { ... } } or { result: { ... } }
  const root = raw.data && typeof raw.data === 'object' && raw.data.meta ? raw.data
             : raw.result && typeof raw.result === 'object' && raw.result.meta ? raw.result
             : raw;

  if (!root.meta || !root.summary || !Array.isArray(root.allocation) || !Array.isArray(root.holdings)) {
    throw new Error(
      'JSON payload is missing required root keys: meta, summary, allocation, or holdings.'
    );
  }

  const usdInr = Number(raw.meta.usdInr) || 95.41;

  const normalized: PortfolioData = {
    meta: {
      lastUpdated: String(raw.meta.lastUpdated || new Date().toISOString()),
      usdInr,
      lrsUsedUsd: Number(raw.meta.lrsUsedUsd) ?? 0,
      lrsUsedInr: Number(raw.meta.lrsUsedInr) ?? 0,
      lrsAnnualLimitUsd: Number(raw.meta.lrsAnnualLimitUsd) || 250000
    },
    summary: {
      totalValueInr: Number(raw.summary.totalValueInr) || 0,
      investedValueInr: Number(raw.summary.investedValueInr) || 0,
      unrealizedPnlInr: Number(raw.summary.unrealizedPnlInr) || 0,
      unrealizedPnlPct: Number(raw.summary.unrealizedPnlPct) || 0,
      cashBalanceInr: Number(raw.summary.cashBalanceInr) || 0,
      investedPct: Number(raw.summary.investedPct) || 0
    },
    allocation: (raw.allocation || []).map((a: any) => ({
      category: String(a.category || 'Uncategorized'),
      role: String(a.role || 'Core'),
      valueInr: Number(a.valueInr) || 0,
      pct: Number(a.pct) || 0
    })),
    holdings: (raw.holdings || []).map((h: any) => ({
      ticker: String(h.ticker || 'UNKNOWN'),
      name: String(h.name || h.ticker || 'Unknown Asset'),
      market: String(h.market || 'IN'),
      role: String(h.role || 'Core'),
      currentPrice: Number(h.currentPrice) || 0,
      currency: String(h.currency || (h.market === 'US' ? 'USD' : 'INR')),
      valueInr: Number(h.valueInr) || 0,
      allocationPct: Number(h.allocationPct) || 0,
      pnlPct: Number(h.pnlPct) || 0,
      thesisStatus: String(h.thesisStatus || 'On Track'),
      sector: h.sector ? String(h.sector) : undefined,
      targetPct: h.targetPct !== undefined ? Number(h.targetPct) : Number(h.allocationPct) || 0,
      thesisNote: h.thesisNote ? String(h.thesisNote) : undefined
    })),
    snapshots: Array.isArray(raw.snapshots)
      ? raw.snapshots.map((s: any) => ({
          date: String(s.date || ''),
          totalValueInr: Number(s.totalValueInr) || 0,
          usEquityUsd: Number(s.usEquityUsd) || 0,
          cashUsd: Number(s.cashUsd) || 0,
          sp500: Number(s.sp500) || 0,
          qqq: Number(s.qqq) || 0
        }))
      : MOCK_PORTFOLIO_DATA.snapshots,
    watchlist: Array.isArray(raw.watchlist)
      ? raw.watchlist.map((w: any) => ({
          ticker: String(w.ticker || ''),
          company: String(w.company || w.ticker || ''),
          stage: String(w.stage || 'Monitoring'),
          targetRole: String(w.targetRole || 'Core'),
          sector: String(w.sector || 'General'),
          currentPrice: Number(w.currentPrice) || 0,
          high52w: Number(w.high52w) || 0,
          drawdownPct: Number(w.drawdownPct) || 0,
          thesisStatus: String(w.thesisStatus || 'Validated'),
          allocatedCapitalUsd: Number(w.allocatedCapitalUsd) || 0,
          nextStep: String(w.nextStep || 'Monitor price action')
        }))
      : [],
    events: Array.isArray(raw.events)
      ? raw.events.map((e: any) => ({
          date: String(e.date || ''),
          ticker: String(e.ticker || ''),
          company: String(e.company || ''),
          type: String(e.type || 'Earnings'),
          status: String(e.status || 'Upcoming'),
          notes: String(e.notes || '')
        }))
      : [],
    retirement: raw.retirement
      ? {
          targetCorpusInr: Number(raw.retirement.targetCorpusInr) || 50000000,
          currentProgressPct: Number(raw.retirement.currentProgressPct) || 0,
          growthAllocationPct: Number(raw.retirement.growthAllocationPct) || 65.0,
          statusNote: String(raw.retirement.statusNote || 'On track')
        }
      : MOCK_PORTFOLIO_DATA.retirement,
    theses: Array.isArray(raw.theses) && raw.theses.length > 0 ? raw.theses : undefined
  };

  return normalized;
}

/**
 * Formats an INR value into either INR (₹) or USD ($) based on active currency and exchange rate.
 */
export function formatPortfolioValue(
  valueInr: number,
  currency: CurrencyCode,
  usdInr: number,
  options?: { compact?: boolean; maximumFractionDigits?: number }
): string {
  const safeRate = usdInr > 0 ? usdInr : 95.41;

  if (currency === 'USD') {
    const valUsd = valueInr / safeRate;
    if (options?.compact) {
      if (Math.abs(valUsd) >= 1_000_000) {
        return `$${(valUsd / 1_000_000).toFixed(2)}M`;
      }
      if (Math.abs(valUsd) >= 1_000) {
        return `$${(valUsd / 1_000).toFixed(1)}K`;
      }
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: options?.maximumFractionDigits ?? 0
    }).format(valUsd);
  }

  // INR Formatting
  if (options?.compact) {
    const abs = Math.abs(valueInr);
    const sign = valueInr < 0 ? '-' : '';
    if (abs >= 1_00_00_000) {
      return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
    }
    if (abs >= 1_00_000) {
      return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
    }
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: options?.maximumFractionDigits ?? 0
  }).format(valueInr);
}

/**
 * Formats a native price in its own currency (USD or INR) or converts if requested.
 */
export function formatAssetPrice(price: number, assetCurrency: string): string {
  if (assetCurrency.toUpperCase() === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: price < 500 ? 2 : 0,
    maximumFractionDigits: 2
  }).format(price);
}
