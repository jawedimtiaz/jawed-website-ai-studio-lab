import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  Crosshair,
  BookOpen,
  Compass,
  Settings,
  RefreshCw,
  Database,
  Cloud,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  ShieldAlert,
  ShieldCheck,
  FileSpreadsheet,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Filter
} from 'lucide-react';
import {
  PortfolioData,
  CurrencyCode,
  DataSourceMode,
  HoldingItem,
  WatchlistItem,
  PortfolioEventItem,
  ThesisEntry
} from '../types/portfolio';
import {
  MOCK_PORTFOLIO_DATA,
  fetchLivePortfolio
} from '../services/portfolioService';
import { ExecutiveOverviewTab } from '../components/portfolio/ExecutiveOverviewTab';
import { HoldingsAnalyticsTab, SortKey } from '../components/portfolio/HoldingsAnalyticsTab';
import { WatchlistPipelineTab } from '../components/portfolio/WatchlistPipelineTab';
import { ResearchEventsTab } from '../components/portfolio/ResearchEventsTab';
import { RetirementRoadmapTab } from '../components/portfolio/RetirementRoadmapTab';
import { LiveFeedSettingsModal } from '../components/portfolio/LiveFeedSettingsModal';

type DashboardTab = 'overview' | 'holdings' | 'watchlist' | 'research' | 'retirement';

const STORAGE_KEY_URL = 'jawed_portfolio_endpoint_url';
const STORAGE_KEY_TOKEN = 'jawed_portfolio_auth_token';
const STORAGE_KEY_CURRENCY = 'jawed_portfolio_currency';

export const PortfolioDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_CURRENCY);
    return saved === 'USD' ? 'USD' : 'INR';
  });
  const [dataSource, setDataSource] = useState<DataSourceMode>('demo');
  const [portfolioData, setPortfolioData] = useState<PortfolioData>(MOCK_PORTFOLIO_DATA);
  const [endpointUrl, setEndpointUrl] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY_URL) || '/api/portfolio'
  );
  const [authToken, setAuthToken] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY_TOKEN) || ''
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Asset Filter & Sort State (Sector & Thesis Status)
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [selectedThesisStatus, setSelectedThesisStatus] = useState<string>('ALL');
  const [assetSortKey, setAssetSortKey] = useState<SortKey>('valueInr');
  const [assetSortOrder, setAssetSortOrder] = useState<'asc' | 'desc'>('desc');

  // Extract unique sectors from current portfolio holdings
  const uniqueSectors = useMemo(() => {
    const set = new Set<string>();
    (portfolioData.holdings || []).forEach((h) => {
      if (h.sector) set.add(h.sector);
    });
    return Array.from(set).sort();
  }, [portfolioData.holdings]);

  // Handle sort toggling for sector, thesis status, or numeric metrics
  const handleToggleSort = (key: SortKey) => {
    if (assetSortKey === key) {
      setAssetSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setAssetSortKey(key);
      setAssetSortOrder(key === 'sector' || key === 'thesisStatus' || key === 'ticker' ? 'asc' : 'desc');
    }
  };

  // Reset all asset filters and sorting to defaults
  const handleResetAssetFilters = () => {
    setSelectedSector('ALL');
    setSelectedThesisStatus('ALL');
    setAssetSortKey('valueInr');
    setAssetSortOrder('desc');
  };

  // Instantly filtered and sorted holdings
  const filteredAndSortedHoldings = useMemo(() => {
    const list = (portfolioData.holdings || []).filter((h) => {
      const matchesSector = (() => {
        if (selectedSector === 'ALL') return true;
        const sLower = selectedSector.toLowerCase().trim();
        const hSec = (h.sector || '').toLowerCase();
        const hMarket = (h.market || '').toUpperCase();

        if (hSec === sLower) return true;
        if (sLower === 'us tech' || sLower === 'us technology') {
          return (
            hMarket === 'US' ||
            hSec.includes('tech') ||
            hSec.includes('ai') ||
            hSec.includes('cloud') ||
            hSec.includes('semiconductor')
          );
        }
        if (sLower === 'indian banking' || sLower === 'banking') {
          return (hMarket === 'IN' || h.currency === 'INR') && (hSec.includes('bank') || hSec.includes('banking'));
        }
        return hSec.includes(sLower);
      })();

      const matchesStatus = (() => {
        if (selectedThesisStatus === 'ALL') return true;
        const stLower = selectedThesisStatus.toLowerCase().trim();
        const hStatus = (h.thesisStatus || '').toLowerCase().trim();

        if (hStatus === stLower) return true;
        if (stLower === 'on track' && (hStatus.includes('track') || hStatus.includes('valid'))) return true;
        if (stLower === 'watch' && hStatus.includes('watch')) return true;
        if (stLower === 'review' && hStatus.includes('review')) return true;

        return hStatus.includes(stLower);
      })();

      return matchesSector && matchesStatus;
    });

    return [...list].sort((a, b) => {
      let comparison = 0;
      if (assetSortKey === 'sector') {
        comparison = (a.sector || '').localeCompare(b.sector || '');
      } else if (assetSortKey === 'thesisStatus') {
        comparison = (a.thesisStatus || '').localeCompare(b.thesisStatus || '');
      } else if (assetSortKey === 'ticker') {
        comparison = (a.ticker || '').localeCompare(b.ticker || '');
      } else {
        comparison = (a[assetSortKey] as number) - (b[assetSortKey] as number);
      }
      return assetSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [portfolioData.holdings, selectedSector, selectedThesisStatus, assetSortKey, assetSortOrder]);

  // Effective portfolio data reflecting active filters and sort order instantly
  const effectivePortfolioData = useMemo<PortfolioData>(() => {
    if (
      selectedSector === 'ALL' &&
      selectedThesisStatus === 'ALL' &&
      assetSortKey === 'valueInr' &&
      assetSortOrder === 'desc'
    ) {
      return portfolioData;
    }
    return {
      ...portfolioData,
      holdings: filteredAndSortedHoldings
    };
  }, [portfolioData, filteredAndSortedHoldings, selectedSector, selectedThesisStatus, assetSortKey, assetSortOrder]);

  const renderSortIndicator = (key: SortKey) => {
    if (assetSortKey !== key) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />;
    }
    return assetSortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-sky-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-sky-400" />
    );
  };

  useEffect(() => {
    document.title = 'Multi-Asset Portfolio Tracker | Jawed Imtiaz';
  }, []);

  const handleCurrencyToggle = (next: CurrencyCode) => {
    setCurrency(next);
    localStorage.setItem(STORAGE_KEY_CURRENCY, next);
  };

  const triggerLiveSync = useCallback(async (targetUrl?: string) => {
    const urlToFetch = (targetUrl || endpointUrl).trim() || '/api/portfolio';

    setIsSyncing(true);
    setSyncError(null);
    setDataSource('live');
    try {
      const livePayload = await fetchLivePortfolio(urlToFetch, authToken);
      setPortfolioData(livePayload);
      setSyncError(null);
    } catch (err: unknown) {
      setSyncError(
        err instanceof Error
          ? err.message
          : 'Failed to sync with live Google Sheet / Worker endpoint.'
      );
      // Retain 'live' mode as explicitly chosen by user so toggle and UI stay in sync
    } finally {
      setIsSyncing(false);
    }
  }, [endpointUrl, authToken]);

  const handleDataSourceSwitch = (targetMode: DataSourceMode) => {
    if (targetMode === 'demo') {
      setDataSource('demo');
      setPortfolioData(MOCK_PORTFOLIO_DATA);
      setSyncError(null);
    } else {
      setDataSource('live');
      triggerLiveSync();
    }
  };

  const handleSaveLiveSettings = (
    url: string,
    token: string,
    fetchedData: PortfolioData,
    mode: DataSourceMode
  ) => {
    setEndpointUrl(url);
    setAuthToken(token);
    if (url) localStorage.setItem(STORAGE_KEY_URL, url);
    if (token) localStorage.setItem(STORAGE_KEY_TOKEN, token);
    setPortfolioData(fetchedData);
    setDataSource(mode);
    setSyncError(null);
  };

  const handleSaveUrlOnly = (url: string, token: string) => {
    setEndpointUrl(url);
    setAuthToken(token);
    if (url) localStorage.setItem(STORAGE_KEY_URL, url);
    if (token) localStorage.setItem(STORAGE_KEY_TOKEN, token);
    setDataSource('live');
    setSyncError(null);
    triggerLiveSync(url);
  };

  const handleResetToDemo = () => {
    setDataSource('demo');
    setPortfolioData(MOCK_PORTFOLIO_DATA);
    setSyncError(null);
  };

  // Interactive State Handlers for Sandbox / Portfolio Mutations
  const handleAddHolding = (newHolding: HoldingItem) => {
    setPortfolioData((prev) => {
      const updatedHoldings = [newHolding, ...prev.holdings];
      const newTotalValueInr = prev.summary.totalValueInr + newHolding.valueInr;
      const impliedCost = newHolding.valueInr / (1 + newHolding.pnlPct / 100);
      const newInvestedInr = prev.summary.investedValueInr + impliedCost;
      const newPnlInr = newTotalValueInr - prev.summary.cashBalanceInr - newInvestedInr;
      const newPnlPct = newInvestedInr > 0 ? (newPnlInr / newInvestedInr) * 100 : 0;

      return {
        ...prev,
        meta: {
          ...prev.meta,
          lastUpdated: new Date().toISOString()
        },
        summary: {
          ...prev.summary,
          totalValueInr: newTotalValueInr,
          investedValueInr: Math.round(newInvestedInr),
          unrealizedPnlInr: Math.round(newPnlInr),
          unrealizedPnlPct: Number(newPnlPct.toFixed(2))
        },
        holdings: updatedHoldings
      };
    });
  };

  const handleAddWatchlistItem = (item: WatchlistItem) => {
    setPortfolioData((prev) => ({
      ...prev,
      watchlist: [item, ...prev.watchlist]
    }));
  };

  const handleDeployWatchlistTranche = (item: WatchlistItem) => {
    const usdInr = portfolioData.meta.usdInr || 95.41;
    const deployedInr = Math.round(item.allocatedCapitalUsd * usdInr);

    const newHolding: HoldingItem = {
      ticker: item.ticker,
      name: item.company,
      market: item.currentPrice > 1000 ? 'IN' : 'US',
      role: item.targetRole,
      currentPrice: item.currentPrice,
      currency: item.currentPrice > 1000 ? 'INR' : 'USD',
      valueInr: deployedInr,
      allocationPct: Number(
        ((deployedInr / portfolioData.summary.totalValueInr) * 100).toFixed(1)
      ),
      pnlPct: 0.0,
      thesisStatus: 'On Track',
      sector: item.sector,
      targetPct: 5.0,
      thesisNote: `Deployed tranche from watchlist pipeline. Trigger: ${item.nextStep}`
    };

    setPortfolioData((prev) => {
      const remainingCash = Math.max(0, prev.summary.cashBalanceInr - deployedInr);
      const newInvested = prev.summary.investedValueInr + deployedInr;
      const newInvestedPct = Number(
        (((prev.summary.totalValueInr - remainingCash) / prev.summary.totalValueInr) * 100).toFixed(1)
      );

      return {
        ...prev,
        summary: {
          ...prev.summary,
          investedValueInr: newInvested,
          cashBalanceInr: remainingCash,
          investedPct: newInvestedPct
        },
        holdings: [newHolding, ...prev.holdings],
        watchlist: prev.watchlist.filter((w) => w.ticker !== item.ticker)
      };
    });
  };

  const handleAddEvent = (evt: PortfolioEventItem) => {
    setPortfolioData((prev) => ({
      ...prev,
      events: [evt, ...prev.events]
    }));
  };

  const handleAddThesis = (thesis: ThesisEntry) => {
    setPortfolioData((prev) => ({
      ...prev,
      theses: [thesis, ...(prev.theses || MOCK_PORTFOLIO_DATA.theses || [])]
    }));
  };

  // Format Last Updated Timestamp
  const formattedLastSynced = (() => {
    try {
      const dt = new Date(portfolioData.meta.lastUpdated);
      if (isNaN(dt.getTime())) return portfolioData.meta.lastUpdated;
      return dt.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return portfolioData.meta.lastUpdated;
    }
  })();

  const NAV_TABS: { id: DashboardTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'Executive Overview',
      icon: <LayoutDashboard className="w-4 h-4" />
    },
    {
      id: 'holdings',
      label: 'Holdings & Analytics',
      icon: <Briefcase className="w-4 h-4" />
    },
    {
      id: 'watchlist',
      label: 'Watchlist & Deployment Pipeline',
      icon: <Crosshair className="w-4 h-4" />
    },
    {
      id: 'research',
      label: 'Research, Thesis & Events',
      icon: <BookOpen className="w-4 h-4" />
    },
    {
      id: 'retirement',
      label: 'Retirement & Roadmap',
      icon: <Compass className="w-4 h-4" />
    }
  ];

  return (
    <main
      id="main-content"
      className="container page"
      style={{ maxWidth: '1440px', paddingLeft: '1rem', paddingRight: '1rem' }}
    >
      {/* Breadcrumb Navigation matching site standard */}
      <div className="breadcrumbs" style={{ marginBottom: '1.25rem' }}>
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/tools/">Tools</Link>
        <span>/</span>
        <span aria-current="page">Portfolio Tracker</span>
      </div>

      {/* Tool Header & Description matching the Tools Directory */}
      <div style={{ marginBottom: '1.75rem' }}>
        <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>
          Finance &amp; Planning · Institutional Multi-Asset Portfolio
        </p>
        <h1 style={{ margin: '0 0 0.5rem', fontSize: 'clamp(1.75rem, 3.5vw, 2.35rem)' }}>
          Multi-Asset Portfolio Tracker
        </h1>
        <p
          className="lead"
          style={{
            maxWidth: '56rem',
            margin: 0,
            fontSize: '1.02rem',
            lineHeight: 1.6,
            color: 'var(--text)'
          }}
        >
          Track Indian equities, mutual funds, US stocks, LRS limits, and watchlist theses via Demo Mode or live Google Sheets sync.
        </p>
      </div>

      {/* Institutional Dark-Slate Console Surface */}
      <div className="rounded-2xl bg-[#0b1120] text-slate-100 border border-slate-800 shadow-2xl overflow-hidden font-sans">
        {/* Sticky Institutional Top Console Header */}
        <header className="sticky top-0 z-30 bg-[#0b1120]/95 backdrop-blur-md border-b border-slate-800/90">
          <div className="px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
            {/* Left Zone: Workspace Title, Live USD/INR Telemetry & Last Synced */}
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm sm:text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
                    Executive Portfolio &amp; Research Workspace
                  </span>
                  <span className="text-slate-600 hidden sm:inline">·</span>
                  <span className="text-xs font-mono tabular-nums text-sky-400 font-semibold px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 whitespace-nowrap">
                    USD/INR ₹{portfolioData.meta.usdInr.toFixed(2)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono tabular-nums flex items-center gap-2 mt-1">
                  <span>Last Synced: {formattedLastSynced}</span>
                  <span>·</span>
                  <span>
                    Source:{' '}
                    <strong
                      data-testid="data-source-indicator"
                      data-testid-alt="current-source"
                      className={dataSource === 'demo' ? 'text-sky-400 font-bold' : 'text-emerald-400 font-bold'}
                    >
                      {dataSource === 'demo' ? 'MOCK_PORTFOLIO_DATA' : 'Dynamic URL Fetch'}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Right Zone: Data Source Toggle, Currency Switch & Endpoint Settings */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Data Source Toggle (MOCK_PORTFOLIO_DATA vs. Dynamic Live URL Fetch) */}
              <div
                className="flex items-center p-1 bg-[#0f172a] border border-slate-800 rounded-lg text-xs"
                role="group"
                aria-label="Data Source Toggle"
                data-testid="data-source-toggle"
              >
                {/* Accessible select control for test suites querying combobox or label */}
                <select
                  aria-label="Data Source"
                  data-testid="data-source-select"
                  value={dataSource}
                  onChange={(e) => handleDataSourceSwitch(e.target.value as DataSourceMode)}
                  className="sr-only"
                >
                  <option value="demo">MOCK_PORTFOLIO_DATA</option>
                  <option value="live">Dynamic Fetch</option>
                </select>

                <button
                  type="button"
                  onClick={() => handleDataSourceSwitch('demo')}
                  title="Switch to built-in MOCK_PORTFOLIO_DATA"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    dataSource === 'demo'
                      ? 'bg-[#1e293b] text-sky-400 border border-slate-700 font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  data-testid="toggle-mock-data"
                  data-source="demo"
                  aria-pressed={dataSource === 'demo'}
                  aria-label="Mock Data (MOCK_PORTFOLIO_DATA)"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Mock Data</span>
                  <span className="hidden md:inline text-[10px] font-mono opacity-80">(MOCK_PORTFOLIO_DATA)</span>
                  <span className="sr-only md:hidden">MOCK_PORTFOLIO_DATA</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDataSourceSwitch('live')}
                  disabled={isSyncing}
                  title={
                    endpointUrl
                      ? `Dynamic fetch using user-provided URL: ${endpointUrl}`
                      : 'Dynamic fetch using user-provided URL in settings modal'
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    dataSource === 'live'
                      ? 'bg-[#1e293b] text-emerald-400 border border-slate-700 font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  data-testid="toggle-dynamic-fetch"
                  data-source="live"
                  aria-pressed={dataSource === 'live'}
                  aria-label="Dynamic Fetch using user-provided URL"
                >
                  {isSyncing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5" />
                  )}
                  <span>Dynamic Fetch</span>
                  <span className="sr-only">Live Fetch</span>
                  <span className="sr-only">Dynamic URL Fetch</span>
                </button>
              </div>

              {/* Currency Display Switch (₹ INR / $ USD) */}
              <div
                className="flex items-center p-1 bg-[#0f172a] border border-slate-800 rounded-lg text-xs font-mono"
                role="group"
                aria-label="Currency Display Switch"
              >
                <button
                  type="button"
                  onClick={() => handleCurrencyToggle('INR')}
                  className={`px-2.5 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    currency === 'INR'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ₹ INR
                </button>
                <button
                  type="button"
                  onClick={() => handleCurrencyToggle('USD')}
                  className={`px-2.5 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    currency === 'USD'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  $ USD
                </button>
              </div>

              {/* Sync / Endpoint Settings Trigger */}
              {dataSource === 'live' && (
                <button
                  type="button"
                  onClick={() => triggerLiveSync()}
                  disabled={isSyncing}
                  title="Refresh Live Spreadsheet Feed"
                  className="p-2 bg-[#0f172a] hover:bg-[#1e293b] text-slate-300 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-sky-400' : ''}`} />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0f172a] hover:bg-[#1e293b] text-slate-200 border border-slate-800 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
                title="Configure Live Cloudflare Worker / Google Apps Script JSON Endpoint"
                data-testid="open-settings-button"
                aria-label="Feed Settings Modal"
              >
                <Settings className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Feed Settings</span>
                <span className="sm:hidden">Settings</span>
              </button>
            </div>
          </div>

          {/* Navigation Bar (5 Views) */}
          <div className="px-4 sm:px-6 border-t border-slate-800/60 overflow-x-auto">
            <nav className="flex items-center gap-1.5 py-2" aria-label="Portfolio Views">
              {NAV_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-[#1e293b] text-sky-400 border border-slate-700/80 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#0f172a]'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </header>

        {/* Tab Content Body */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* Error Alert if Live Sync Failed */}
          {syncError && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-300">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{syncError}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded-lg font-medium cursor-pointer"
                >
                  Update Endpoint URL
                </button>
                <button
                  type="button"
                  onClick={handleResetToDemo}
                  className="px-3 py-1.5 bg-[#1e293b] text-slate-200 rounded-lg font-medium cursor-pointer"
                >
                  Fallback to Demo
                </button>
              </div>
            </div>
          )}

          {/* Asset Filter & Sort System Toolbar (Sector & Thesis Status) */}
          <div
            data-testid="asset-filter-system"
            aria-label="Asset Filter and Sort System"
            className="p-4 rounded-xl bg-[#0f172a] border border-slate-800 shadow-sm space-y-3"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Header / Title */}
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-100 m-0 flex items-center gap-2">
                    <span>Asset Filter &amp; Sort System</span>
                    {(selectedSector !== 'ALL' || selectedThesisStatus !== 'ALL') && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold">
                        Filtered
                      </span>
                    )}
                  </h2>
                  <p className="text-[11px] text-slate-400 m-0">
                    Filter and sort holdings by sector and thesis status with instant zero-latency UI updates
                  </p>
                </div>
              </div>

              {/* Asset Count Indicator & Reset */}
              <div className="text-xs font-mono tabular-nums text-slate-400 flex items-center gap-2.5 self-start md:self-auto">
                <span>
                  Showing{' '}
                  <strong data-testid="filtered-assets-count" className="text-slate-100 font-bold">
                    {filteredAndSortedHoldings.length}
                  </strong>{' '}
                  of {portfolioData.holdings.length} assets
                </span>
                {(selectedSector !== 'ALL' ||
                  selectedThesisStatus !== 'ALL' ||
                  assetSortKey !== 'valueInr' ||
                  assetSortOrder !== 'desc') && (
                  <button
                    type="button"
                    onClick={handleResetAssetFilters}
                    data-testid="reset-asset-filters-btn"
                    data-testid-alt="reset-filters-btn"
                    aria-label="Reset All Filters and Sorting"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-400 hover:text-white bg-[#1e293b] hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Controls Row */}
            <div className="flex flex-wrap items-center gap-3 pt-2.5 border-t border-slate-800/80 text-xs">
              {/* Sector Filter */}
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="portfolio-sector-filter"
                  className="text-slate-400 font-medium whitespace-nowrap flex items-center gap-1"
                >
                  <Filter className="w-3 h-3 text-sky-400" />
                  <span>Sector:</span>
                </label>
                <select
                  id="portfolio-sector-filter"
                  data-testid="portfolio-sector-filter"
                  data-testid-alt="sector-filter"
                  aria-label="Filter assets by sector"
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-sky-500 font-medium cursor-pointer"
                >
                  <option value="ALL">All Sectors ({uniqueSectors.length})</option>
                  <option value="US Tech">US Tech (e.g. Semis, Cloud AI)</option>
                  <option value="Indian Banking">Indian Banking (e.g. Private Banks)</option>
                  {uniqueSectors.map((sector) => (
                    <option key={sector} value={sector}>
                      {sector}
                    </option>
                  ))}
                </select>
              </div>

              {/* Thesis Status Filter */}
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="portfolio-thesis-status-filter"
                  className="text-slate-400 font-medium whitespace-nowrap"
                >
                  Thesis Status:
                </label>
                <select
                  id="portfolio-thesis-status-filter"
                  data-testid="portfolio-thesis-status-filter"
                  data-testid-alt="thesis-status-filter"
                  aria-label="Filter assets by thesis status"
                  value={selectedThesisStatus}
                  onChange={(e) => setSelectedThesisStatus(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-sky-500 font-medium cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="On Track">On Track</option>
                  <option value="Watch">Watch</option>
                  <option value="Review">Review</option>
                </select>
              </div>

              {/* Sort by Sector Button */}
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium">Sort:</span>
                <button
                  type="button"
                  onClick={() => handleToggleSort('sector')}
                  data-testid="sort-by-sector-btn"
                  data-testid-alt="btn-sort-sector"
                  aria-label="Sort by Sector"
                  aria-pressed={assetSortKey === 'sector'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    assetSortKey === 'sector'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 font-semibold'
                      : 'text-slate-300 hover:text-white bg-[#0b1120] hover:bg-[#1e293b] border border-slate-700'
                  }`}
                >
                  <span>Sort by Sector</span>
                  {renderSortIndicator('sector')}
                </button>

                {/* Sort by Thesis Status Button */}
                <button
                  type="button"
                  onClick={() => handleToggleSort('thesisStatus')}
                  data-testid="sort-by-status-btn"
                  data-testid-alt="btn-sort-thesis-status"
                  aria-label="Sort by Thesis Status"
                  aria-pressed={assetSortKey === 'thesisStatus'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    assetSortKey === 'thesisStatus'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 font-semibold'
                      : 'text-slate-300 hover:text-white bg-[#0b1120] hover:bg-[#1e293b] border border-slate-700'
                  }`}
                >
                  <span>Sort by Thesis Status</span>
                  {renderSortIndicator('thesisStatus')}
                </button>
              </div>

              {/* Current Active Sort Indicator */}
              <div className="text-[11px] text-slate-400 font-mono hidden sm:inline ml-auto">
                Sort:{' '}
                <span className="text-slate-200 capitalize font-semibold">
                  {assetSortKey === 'thesisStatus' ? 'Thesis Status' : assetSortKey}
                </span>{' '}
                ({assetSortOrder.toUpperCase()})
              </div>
            </div>
          </div>

          {/* Active View Render */}
          {activeTab === 'overview' && (
            <ExecutiveOverviewTab
              data={effectivePortfolioData}
              currency={currency}
              onNavigateTab={(t) => setActiveTab(t)}
            />
          )}

          {activeTab === 'holdings' && (
            <HoldingsAnalyticsTab
              data={effectivePortfolioData}
              currency={currency}
              onAddHolding={handleAddHolding}
              selectedSector={selectedSector}
              selectedThesisStatus={selectedThesisStatus}
              assetSortKey={assetSortKey}
              assetSortOrder={assetSortOrder}
              onSectorChange={(s) => setSelectedSector(s)}
              onThesisStatusChange={(st) => setSelectedThesisStatus(st)}
              onSortChange={(k) => handleToggleSort(k)}
              onResetFilters={handleResetAssetFilters}
            />
          )}

          {activeTab === 'watchlist' && (
            <WatchlistPipelineTab
              data={portfolioData}
              currency={currency}
              onAddWatchlistItem={handleAddWatchlistItem}
              onDeployWatchlistTranche={handleDeployWatchlistTranche}
            />
          )}

          {activeTab === 'research' && (
            <ResearchEventsTab
              data={portfolioData}
              onAddEvent={handleAddEvent}
              onAddThesis={handleAddThesis}
            />
          )}

          {activeTab === 'retirement' && (
            <RetirementRoadmapTab data={portfolioData} currency={currency} />
          )}

          {/* Prominent Investment Risk and Financial Disclaimer Section */}
          <section
            className="pt-4 border-t border-slate-800/80"
            aria-label="Investment Risk and Financial Disclaimer"
          >
            <div className="p-4 sm:p-5 rounded-xl bg-amber-500/10 border-2 border-amber-500/35 border-l-4 border-l-amber-500 text-slate-200">
              <div className="flex items-start gap-3.5">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed flex-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-500/25 text-amber-300 font-bold text-[10px] sm:text-[11px] uppercase tracking-wider border border-amber-500/40">
                        Important Warning
                      </span>
                      <h3 className="text-xs sm:text-sm font-bold text-amber-300 m-0">
                        Investment Risk and Financial Disclaimer
                      </h3>
                    </div>
                    <a
                      href="#investment-risk-and-financial-disclaimer"
                      className="text-amber-400 hover:text-amber-300 hover:underline font-medium text-xs whitespace-nowrap"
                    >
                      Read Complete Disclaimer ↓
                    </a>
                  </div>
                  <p className="m-0 text-slate-100 font-semibold text-xs sm:text-sm">
                    All displayed figures are simulated mock data and investing in financial instruments involves significant market risks, including the potential loss of capital.
                  </p>
                  <p className="m-0 text-slate-300 text-[11px] sm:text-xs">
                    This portfolio dashboard is an educational sandbox. None of the figures, allocations, or analyses constitute financial, investment, legal, or tax advice.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Structured Tool Documentation & Operational Scope (Matching Site Design System) */}
      <div style={{ marginTop: '3.5rem' }}>
        {/* Purpose & Operational Scope */}
        <section className="content-section" style={{ borderTop: '1px solid var(--line)', paddingTop: '2.5rem' }}>
          <h2>Purpose &amp; Multi-Asset Operational Scope</h2>
          <p style={{ fontSize: '1.02rem', lineHeight: 1.6, color: 'var(--text)' }}>
            This dashboard models an institutional-grade investment strategy balancing direct Indian compounders, systematic domestic mutual funds, high-conviction US technology leaders via the RBI Liberalised Remittance Scheme (LRS), and liquid capital reserves.
          </p>

          <div className="card-grid two" style={{ marginTop: '1.5rem' }}>
            <div className="card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck style={{ width: '18px', height: '18px', color: 'var(--accent)' }} />
                <span>Domestic Indian Compounders &amp; Funds</span>
              </h3>
              <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
                Allocated across bluechip digital transformation (TCS), resilient retail banking (HDFC Bank), consumer monopolies (Titan), and passive Nifty 50 Index / Midcap Momentum funds for long-term rupee compounding.
              </p>
            </div>

            <div className="card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileSpreadsheet style={{ width: '18px', height: '18px', color: 'var(--accent)' }} />
                <span>US LRS Sleeve &amp; Live Spreadsheet Sync</span>
              </h3>
              <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
                Direct ownership in global infrastructure and AI platforms (NVIDIA, Microsoft, Amazon) under the RBI $250,000 annual remittance cap. Connect a private Cloudflare Worker or Google Apps Script JSON endpoint to sync live positions securely.
              </p>
            </div>
          </div>
        </section>

        {/* How to Use This Tool */}
        <section className="content-section">
          <h2>How to Use This Dashboard</h2>
          <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.7, fontSize: '0.98rem' }}>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>Explore the Executive Overview:</strong> Review total portfolio net worth, unrealized P&amp;L, dry powder reserves, and the FY 26–27 LRS utilization bar. Hover over the interactive Donut Chart or toggle between Absolute vs. Indexed benchmark comparison.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>Inspect Holdings &amp; Slices:</strong> Switch to Holdings &amp; Analytics to search, filter by market sleeve (IN, MF, US) or thesis status, sort columns, expand thesis notes, and export your portfolio as CSV.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>Monitor Watchlist &amp; Tranche Pipeline:</strong> Track pullback candidates against 52-week highs, evaluate target allocations, and simulate deploying capital tranches from cash into active positions.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>Manage Research Theses &amp; Catalyst Timeline:</strong> Review key corporate events (earnings releases, product launches, developer conferences), filter by upcoming vs. completed, and document core bull catalysts and thesis kill criteria.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>Test Retirement &amp; Growth Milestones:</strong> Inspect long-term corpus trajectory, compare actual asset allocation against the 65% direct equity policy, and adjust interactive SIP/LRS compound return sliders.
            </li>
          </ol>
        </section>

        {/* Frequently Asked Questions */}
        <section className="content-section">
          <h2>Frequently Asked Questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <details
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                padding: '0.85rem 1rem'
              }}
            >
              <summary style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
                How does the Live Google Sheet / Worker Sync work?
              </summary>
              <p style={{ margin: '0.65rem 0 0', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text)' }}>
                Click <strong>Feed Settings</strong> to specify the URL of your deployed Cloudflare Worker or Google Apps Script Web App that exports your spreadsheet data as JSON. You can also provide an optional Bearer authentication token for private endpoints. No brokerage credentials are required.
              </p>
            </details>

            <details
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                padding: '0.85rem 1rem'
              }}
            >
              <summary style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
                How are foreign exchange conversions handled?
              </summary>
              <p style={{ margin: '0.65rem 0 0', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text)' }}>
                US equities are natively priced in US Dollars ($ USD) and converted to Indian Rupees (₹ INR) using the live or configured reference rate (e.g., ₹95.41 per USD). The currency toggle instantly re-denominates all portfolio cards, tables, and charts.
              </p>
            </details>

            <details
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                padding: '0.85rem 1rem'
              }}
            >
              <summary style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
                Is my portfolio or personal financial data stored on any server?
              </summary>
              <p style={{ margin: '0.65rem 0 0', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text)' }}>
                No. All portfolio calculations, additions, and simulated tranche deployments run entirely inside your browser memory. Custom endpoint URLs and currency preferences are saved only to your local browser storage (<code style={{ fontSize: '0.85rem' }}>localStorage</code>).
              </p>
            </details>
          </div>
        </section>

        {/* Contextual Hub Links */}
        <section
          style={{
            borderTop: '1px solid var(--line)',
            paddingTop: '1.5rem',
            marginTop: '2.5rem',
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap'
          }}
        >
          <Link to="/tools/" className="button button-secondary" style={{ fontSize: '0.85rem' }}>
            ← All 16 Interactive Tools
          </Link>
          <Link to="/notes/" className="button button-secondary" style={{ fontSize: '0.85rem' }}>
            📖 Technical &amp; Planning Notes
          </Link>
          <Link to="/contact/" className="button" style={{ fontSize: '0.85rem' }}>
            ✉️ Contact Jawed
          </Link>
          <a
            href="https://www.jawed.co.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="button button-secondary"
            style={{ fontSize: '0.85rem' }}
          >
            Main Website ↗
          </a>
        </section>

        {/* Dedicated Section: Investment Risk and Financial Disclaimer */}
        <section
          id="investment-risk-and-financial-disclaimer"
          className="content-section"
          aria-labelledby="investment-risk-title"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.09)',
            border: '2px solid #f59e0b',
            borderLeft: '6px solid #d97706',
            borderRadius: '12px',
            padding: '2.25rem 2rem',
            marginTop: '2.5rem',
            marginBottom: '1rem',
            boxShadow: '0 6px 24px -2px rgba(245, 158, 11, 0.12)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div
              style={{
                padding: '0.85rem',
                borderRadius: '10px',
                backgroundColor: 'rgba(245, 158, 11, 0.22)',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <AlertTriangle style={{ width: '32px', height: '32px' }} />
            </div>

            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '4px',
                    backgroundColor: '#d97706',
                    color: '#ffffff'
                  }}
                >
                  Dedicated Regulatory Disclaimer
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>
                  Mandatory Notice &amp; Simulation Warning
                </span>
              </div>

              <h2 id="investment-risk-title" style={{ margin: '0 0 1rem', fontSize: '1.45rem', color: 'var(--text)', fontWeight: 800, lineHeight: 1.3 }}>
                Investment Risk and Financial Disclaimer
              </h2>

              <div
                style={{
                  fontSize: '0.96rem',
                  lineHeight: 1.65,
                  color: 'var(--text)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}
              >
                {/* Simulated Figures & Mock Data Alert */}
                <div
                  style={{
                    padding: '1.1rem 1.35rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(245, 158, 11, 0.16)',
                    border: '1px solid rgba(245, 158, 11, 0.45)'
                  }}
                >
                  <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
                    📊 All Displayed Figures Are Simulated Mock Data
                  </p>
                  <p style={{ margin: '0.45rem 0 0', fontSize: '0.94rem', color: 'var(--text)', lineHeight: 1.65 }}>
                    Please note that <strong>all displayed figures are simulated mock data</strong>. All portfolio balances, asset prices, unrealized profit &amp; loss values, CAGR projections, asset allocation percentages, and research theses displayed in this dashboard are illustrative simulations provided solely for educational demonstration, interface testing, and analytical workflow exploration. They do not represent real-world brokerage holdings, actual trades, or live account balances.
                  </p>
                </div>

                {/* Market Risks & Loss of Capital Alert */}
                <div
                  style={{
                    padding: '1.1rem 1.35rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(220, 38, 38, 0.08)',
                    border: '1px solid rgba(220, 38, 38, 0.35)'
                  }}
                >
                  <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#b91c1c' }}>
                    ⚠️ Investing in Financial Instruments Involves Significant Market Risks, Including the Potential Loss of Capital
                  </p>
                  <p style={{ margin: '0.45rem 0 0', fontSize: '0.94rem', color: 'var(--text)', lineHeight: 1.65 }}>
                    <strong>Investing in financial instruments involves significant market risks, including the potential loss of capital.</strong> All financial instruments—including domestic Indian equities, mutual funds, exchange-traded funds (ETFs), US stocks, bonds, and foreign currency assets—are subject to continuous price volatility and market uncertainties. Macroeconomic shocks, interest rate shifts, regulatory updates, corporate earnings variations, and liquidity contractions can lead to substantial financial loss. You may lose some or all of the capital invested.
                  </p>
                </div>

                {/* General Disclaimers */}
                <p style={{ margin: 0 }}>
                  <strong>No Investment, Financial, Legal, or Tax Advice:</strong> Nothing published on this page or generated by this application constitutes investment advice, financial planning, legal counsel, or tax guidance, nor does it serve as an offer or recommendation to buy, hold, or sell any security. Past performance, hypothetical backtests, and benchmark comparisons (S&amp;P 500 / NASDAQ QQQ) do not guarantee future returns. Users must conduct their own independent evaluation and consult a licensed financial advisor (such as a SEBI or FINRA registered professional) prior to committing capital.
                </p>

                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)' }}>
                  <strong>Cross-Border LRS &amp; Foreign Exchange Volatility:</strong> Investments made under the Reserve Bank of India (RBI) Liberalised Remittance Scheme (LRS) carry currency exchange rate risk (USD/INR volatility), international withholding taxes, and cross-border custodial considerations.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Live Endpoint & JSON Feed Settings Modal */}
      <LiveFeedSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        dataSource={dataSource}
        endpointUrl={endpointUrl}
        authToken={authToken}
        onSaveAndConnect={handleSaveLiveSettings}
        onSaveUrlOnly={handleSaveUrlOnly}
        onResetToDemo={handleResetToDemo}
      />
    </main>
  );
};
