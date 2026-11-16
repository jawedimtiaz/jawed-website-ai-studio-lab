export interface PortfolioMeta {
  lastUpdated: string;
  usdInr: number;
  lrsUsedUsd: number;
  lrsUsedInr: number;
  lrsAnnualLimitUsd: number;
}

export interface PortfolioSummary {
  totalValueInr: number;
  investedValueInr: number;
  unrealizedPnlInr: number;
  unrealizedPnlPct: number;
  cashBalanceInr: number;
  investedPct: number;
}

export interface AllocationItem {
  category: string;
  role: string;
  valueInr: number;
  pct: number;
}

export interface HoldingItem {
  ticker: string;
  name: string;
  market: 'US' | 'IN' | 'MF' | string;
  role: string;
  currentPrice: number;
  currency: 'USD' | 'INR' | string;
  valueInr: number;
  allocationPct: number;
  pnlPct: number;
  thesisStatus: 'On Track' | 'Watch' | 'Review' | string;
  sector?: string;
  targetPct?: number;
  thesisNote?: string;
}

export interface SnapshotItem {
  date: string;
  totalValueInr: number;
  usEquityUsd: number;
  cashUsd: number;
  sp500: number;
  qqq: number;
}

export interface WatchlistItem {
  ticker: string;
  company: string;
  stage: 'Ready to Deploy' | 'Accumulating' | 'Monitoring' | 'Researching' | string;
  targetRole: string;
  sector: string;
  currentPrice: number;
  high52w: number;
  drawdownPct: number;
  thesisStatus: 'Validated' | 'Monitoring' | 'Under Review' | string;
  allocatedCapitalUsd: number;
  nextStep: string;
}

export interface PortfolioEventItem {
  date: string;
  ticker: string;
  company: string;
  type: 'Earnings' | 'Macro' | 'Product' | 'Dividend' | 'Rebalance' | string;
  status: 'Upcoming' | 'Completed' | 'Monitoring' | string;
  notes: string;
}

export interface RetirementData {
  targetCorpusInr: number;
  currentProgressPct: number;
  growthAllocationPct: number;
  statusNote: string;
}

export interface ThesisEntry {
  id: string;
  ticker: string;
  company: string;
  market: 'US' | 'IN' | 'MF' | string;
  role: string;
  thesisStatus: string;
  lastUpdated: string;
  conviction: 'High' | 'Medium-High' | 'Medium';
  summary: string;
  bullCase: string[];
  risksAndKillCriteria: string[];
  valuationMetrics: string;
}

export interface PortfolioData {
  meta: PortfolioMeta;
  summary: PortfolioSummary;
  allocation: AllocationItem[];
  holdings: HoldingItem[];
  snapshots: SnapshotItem[];
  watchlist: WatchlistItem[];
  events: PortfolioEventItem[];
  retirement: RetirementData;
  theses?: ThesisEntry[];
}

export type CurrencyCode = 'INR' | 'USD';
export type DataSourceMode = 'demo' | 'live';
