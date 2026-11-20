import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Plus,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Eye,
  X,
  Filter
} from 'lucide-react';
import { PortfolioData, HoldingItem, CurrencyCode } from '../../types/portfolio';
import { formatPortfolioValue, formatAssetPrice } from '../../services/portfolioService';
import { PrivateMoney } from './PrivateMoney';

export type SortKey = 'ticker' | 'valueInr' | 'allocationPct' | 'pnlPct' | 'currentPrice' | 'sector' | 'thesisStatus';
export type SortOrder = 'asc' | 'desc';

interface HoldingsAnalyticsTabProps {
  data: PortfolioData;
  currency: CurrencyCode;
  privacyMode?: boolean;
  onAddHolding: (newHolding: HoldingItem) => void;
  selectedSector?: string;
  selectedThesisStatus?: string;
  assetSortKey?: SortKey;
  assetSortOrder?: SortOrder;
  onSectorChange?: (sector: string) => void;
  onThesisStatusChange?: (status: string) => void;
  onSortChange?: (key: SortKey) => void;
  onResetFilters?: () => void;
}

export const HoldingsAnalyticsTab: React.FC<HoldingsAnalyticsTabProps> = ({
  data,
  currency,
  privacyMode = false,
  onAddHolding,
  selectedSector,
  selectedThesisStatus,
  assetSortKey,
  assetSortOrder,
  onSectorChange,
  onThesisStatusChange,
  onSortChange,
  onResetFilters
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'IN' | 'MF' | 'US'>('ALL');
  const [sectorFilter, setSectorFilter] = useState<string>(() => selectedSector || 'ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'On Track' | 'Watch' | 'Review'>(
    () => (selectedThesisStatus as any) || 'ALL'
  );
  const [sortKey, setSortKey] = useState<SortKey>(() => assetSortKey || 'valueInr');
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => assetSortOrder || 'desc');
  const [expandedTicker, setExpandedTicker] = useState<string | null>('NVDA');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  // Synchronize with external filter & sort props from parent page
  useEffect(() => {
    if (selectedSector !== undefined) {
      setSectorFilter(selectedSector);
    }
  }, [selectedSector]);

  useEffect(() => {
    if (selectedThesisStatus !== undefined) {
      setStatusFilter(selectedThesisStatus as any);
    }
  }, [selectedThesisStatus]);

  useEffect(() => {
    if (assetSortKey !== undefined) {
      setSortKey(assetSortKey);
    }
  }, [assetSortKey]);

  useEffect(() => {
    if (assetSortOrder !== undefined) {
      setSortOrder(assetSortOrder);
    }
  }, [assetSortOrder]);

  // Add Position Form State
  const [newTicker, setNewTicker] = useState('');
  const [newName, setNewName] = useState('');
  const [newMarket, setNewMarket] = useState<'US' | 'IN' | 'MF'>('US');
  const [newRole, setNewRole] = useState('Core Growth');
  const [newPrice, setNewPrice] = useState('');
  const [newValueInr, setNewValueInr] = useState('');
  const [newPnlPct, setNewPnlPct] = useState('');
  const [newStatus, setNewStatus] = useState<'On Track' | 'Watch' | 'Review'>('On Track');
  const [newThesis, setNewThesis] = useState('');

  const usdInr = data.meta.usdInr || 95.41;

  // Extract unique available sectors dynamically
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    data.holdings.forEach((h) => {
      if (h.sector) set.add(h.sector);
    });
    return Array.from(set).sort();
  }, [data.holdings]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder(key === 'sector' || key === 'thesisStatus' || key === 'ticker' ? 'asc' : 'desc');
    }
    onSortChange?.(key);
  };

  const filteredAndSortedHoldings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = data.holdings.filter((h) => {
      const matchesMarket = marketFilter === 'ALL' || h.market.toUpperCase() === marketFilter;

      const matchesSector = (() => {
        if (sectorFilter === 'ALL') return true;
        const sLower = sectorFilter.toLowerCase().trim();
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
        if (statusFilter === 'ALL') return true;
        const stLower = statusFilter.toLowerCase().trim();
        const hStatus = (h.thesisStatus || '').toLowerCase().trim();

        if (hStatus === stLower) return true;
        if (stLower === 'on track' && (hStatus.includes('track') || hStatus.includes('valid'))) return true;
        if (stLower === 'watch' && hStatus.includes('watch')) return true;
        if (stLower === 'review' && hStatus.includes('review')) return true;

        return hStatus.includes(stLower);
      })();

      const matchesSearch =
        !q ||
        h.ticker.toLowerCase().includes(q) ||
        h.name.toLowerCase().includes(q) ||
        h.role.toLowerCase().includes(q) ||
        (h.sector && h.sector.toLowerCase().includes(q));

      return matchesMarket && matchesSector && matchesStatus && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortKey === 'ticker') {
        comparison = a.ticker.localeCompare(b.ticker);
      } else if (sortKey === 'sector') {
        comparison = (a.sector || '').localeCompare(b.sector || '');
      } else if (sortKey === 'thesisStatus') {
        comparison = a.thesisStatus.localeCompare(b.thesisStatus);
      } else {
        comparison = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [data.holdings, searchQuery, marketFilter, sectorFilter, statusFilter, sortKey, sortOrder]);

  // Filtered Sub-Totals
  const filteredMetrics = useMemo(() => {
    const totalValInr = filteredAndSortedHoldings.reduce((acc, h) => acc + h.valueInr, 0);
    const totalAllocPct = filteredAndSortedHoldings.reduce((acc, h) => acc + h.allocationPct, 0);
    const weightedPnl =
      totalValInr > 0
        ? filteredAndSortedHoldings.reduce((acc, h) => acc + h.pnlPct * h.valueInr, 0) / totalValInr
        : 0;
    return { totalValInr, totalAllocPct, weightedPnl };
  }, [filteredAndSortedHoldings]);

  const handleExportCsv = () => {
    const headers = [
      'Ticker',
      'Company Name',
      'Market',
      'Role',
      'Current Price',
      'Currency',
      'Value (INR)',
      'Allocation (%)',
      'Unrealized P&L (%)',
      'Thesis Status'
    ];
    const rows = filteredAndSortedHoldings.map((h) => [
      h.ticker,
      `"${h.name.replace(/"/g, '""')}"`,
      h.market,
      `"${h.role}"`,
      h.currentPrice,
      h.currency,
      h.valueInr,
      h.allocationPct.toFixed(2),
      h.pnlPct.toFixed(2),
      h.thesisStatus
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `portfolio-holdings-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCreatePosition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker.trim() || !newName.trim()) return;

    const valInr = Number(newValueInr) || 250000;
    const totalPortInr = data.summary.totalValueInr + valInr;
    const allocPct = Number(((valInr / totalPortInr) * 100).toFixed(1));

    const item: HoldingItem = {
      ticker: newTicker.trim().toUpperCase(),
      name: newName.trim(),
      market: newMarket,
      role: newRole.trim() || 'Core',
      currentPrice: Number(newPrice) || 100,
      currency: newMarket === 'US' ? 'USD' : 'INR',
      valueInr: valInr,
      allocationPct: allocPct,
      pnlPct: Number(newPnlPct) || 0,
      thesisStatus: newStatus,
      sector: newMarket === 'US' ? 'Global Equities' : 'Domestic Equities',
      targetPct: allocPct,
      thesisNote: newThesis.trim() || 'Custom position added to portfolio simulation.'
    };

    onAddHolding(item);
    setShowAddModal(false);
    setNewTicker('');
    setNewName('');
    setNewPrice('');
    setNewValueInr('');
    setNewPnlPct('');
    setNewThesis('');
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-sky-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-sky-400" />
    );
  };

  const renderThesisStatusIndicator = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized.includes('track') || normalized.includes('valid')) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    }
    if (normalized.includes('watch')) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
          <Eye className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Filter Bar */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticker, company, strategic role, or sector..."
              className="w-full pl-10 pr-4 py-2 bg-[#0b1120] border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>

          {/* Market Filter Segmented Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#0b1120] border border-slate-800 rounded-lg">
              {(
                [
                  { id: 'ALL', label: 'All Markets' },
                  { id: 'IN', label: 'Indian Stocks (IN)' },
                  { id: 'MF', label: 'Mutual Funds (MF)' },
                  { id: 'US', label: 'US Equities (US)' }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMarketFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    marketFilter === tab.id
                      ? 'bg-[#1e293b] text-sky-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Position</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#1e293b] hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Secondary Filter Bar: Sector Filter, Thesis Status & Sort Options */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Sector Filter Select */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="holdings-sector-filter" className="text-slate-400 font-medium">
                Sector:
              </label>
              <select
                id="holdings-sector-filter"
                value={sectorFilter}
                onChange={(e) => {
                  setSectorFilter(e.target.value);
                  onSectorChange?.(e.target.value);
                }}
                data-testid="sector-filter"
                data-testid-alt="holdings-sector-filter"
                aria-label="Filter by Sector"
                className="px-2.5 py-1 bg-[#0b1120] border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium cursor-pointer"
              >
                <option value="ALL">All Sectors ({availableSectors.length})</option>
                <option value="US Tech">US Tech (AI, Cloud, Semis)</option>
                <option value="Indian Banking">Indian Banking (Private Banks)</option>
                {availableSectors.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>

            {/* Thesis Status Filter Select / Buttons */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="holdings-status-filter" className="text-slate-400 font-medium">
                Thesis Status:
              </label>
              <select
                id="holdings-status-filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  onThesisStatusChange?.(e.target.value);
                }}
                data-testid="thesis-status-filter"
                data-testid-alt="holdings-status-filter"
                aria-label="Filter by Thesis Status"
                className="px-2.5 py-1 bg-[#0b1120] border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="On Track">On Track</option>
                <option value="Watch">Watch</option>
                <option value="Review">Review</option>
              </select>
            </div>

            {/* Sort Action Buttons */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Sort:</span>
              <button
                type="button"
                onClick={() => handleSort('sector')}
                data-testid="btn-sort-sector"
                data-testid-alt="sort-by-sector-btn"
                aria-label="Sort by Sector"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  sortKey === 'sector'
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 bg-[#0b1120] border border-slate-800'
                }`}
              >
                <span>Sort by Sector</span>
                {renderSortIcon('sector')}
              </button>
              <button
                type="button"
                onClick={() => handleSort('thesisStatus')}
                data-testid="btn-sort-thesis-status"
                data-testid-alt="sort-by-status-btn"
                aria-label="Sort by Thesis Status"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  sortKey === 'thesisStatus'
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 bg-[#0b1120] border border-slate-800'
                }`}
              >
                <span>Sort by Thesis Status</span>
                {renderSortIcon('thesisStatus')}
              </button>
            </div>

            {/* Reset Button */}
            {(sectorFilter !== 'ALL' || statusFilter !== 'ALL' || sortKey !== 'valueInr' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setMarketFilter('ALL');
                  setSectorFilter('ALL');
                  setStatusFilter('ALL');
                  setSortKey('valueInr');
                  setSortOrder('desc');
                  onResetFilters?.();
                }}
                data-testid="reset-filters-btn"
                aria-label="Reset All Filters"
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-sky-400 hover:text-sky-300 bg-[#0b1120] hover:bg-[#1e293b] border border-slate-700 rounded-md font-medium cursor-pointer transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 text-slate-400 font-mono tabular-nums">
            <span>
              Showing <strong className="text-slate-100" data-testid="holdings-filtered-count">{filteredAndSortedHoldings.length}</strong> of{' '}
              {data.holdings.length} positions
            </span>
            <span>·</span>
            <span>
              Selected Value:{' '}
              <strong className="text-sky-400">
                <PrivateMoney
                  value={formatPortfolioValue(filteredMetrics.totalValInr, currency, usdInr)}
                  currency={currency}
                  privacyMode={privacyMode}
                />
              </strong>{' '}
              ({filteredMetrics.totalAllocPct.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden">
        {/* Filter Dropdown Menu Bar directly above Holdings Table */}
        <div
          data-testid="holdings-table-filter-bar"
          className="px-4 sm:px-5 py-3 border-b border-slate-800 bg-[#0b1120]/80 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-2.5">
            <h3 className="text-xs sm:text-sm font-bold text-slate-100 m-0 flex items-center gap-2">
              <span>Holdings Table</span>
              <span className="text-slate-400 font-mono text-xs font-normal tabular-nums">
                ({filteredAndSortedHoldings.length} {filteredAndSortedHoldings.length === 1 ? 'asset' : 'assets'})
              </span>
            </h3>
            {(sectorFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold">
                Filtered
              </span>
            )}
          </div>

          {/* Filter Dropdown Menus above Holdings Table */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Sector Filter Dropdown Menu */}
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="table-sector-filter"
                className="text-slate-400 font-medium whitespace-nowrap flex items-center gap-1"
              >
                <Filter className="w-3 h-3 text-sky-400" />
                <span>Sector:</span>
              </label>
              <select
                id="table-sector-filter"
                data-testid="table-sector-filter"
                aria-label="Filter assets by sector"
                value={sectorFilter}
                onChange={(e) => {
                  setSectorFilter(e.target.value);
                  onSectorChange?.(e.target.value);
                }}
                className="px-2.5 py-1.5 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium cursor-pointer"
              >
                <option value="ALL">All Sectors ({availableSectors.length})</option>
                <option value="US Tech">US Tech (e.g. Semis, Cloud AI)</option>
                <option value="Indian Banking">Indian Banking (e.g. Private Banks)</option>
                {availableSectors.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>

            {/* Thesis Status Filter Dropdown Menu */}
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="table-thesis-status-filter"
                className="text-slate-400 font-medium whitespace-nowrap"
              >
                Thesis Status:
              </label>
              <select
                id="table-thesis-status-filter"
                data-testid="table-thesis-status-filter"
                aria-label="Filter assets by thesis status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  onThesisStatusChange?.(e.target.value);
                }}
                className="px-2.5 py-1.5 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="On Track">On Track</option>
                <option value="Watch">Watch</option>
                <option value="Review">Review</option>
              </select>
            </div>

            {/* Filter Dropdown Menu Button & Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
                data-testid="filter-dropdown-menu"
                aria-label="Filter dropdown menu"
                aria-haspopup="true"
                aria-expanded={isFilterDropdownOpen}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  isFilterDropdownOpen || sectorFilter !== 'ALL' || statusFilter !== 'ALL'
                    ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 font-semibold'
                    : 'bg-[#0b1120] text-slate-300 hover:text-white border-slate-700'
                }`}
              >
                <Filter className="w-3.5 h-3.5 text-sky-400" />
                <span>Filter Menu</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isFilterDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isFilterDropdownOpen && (
                <div
                  role="menu"
                  aria-label="Filter holdings by sector and thesis status"
                  className="absolute right-0 top-full mt-1.5 w-64 p-3 bg-[#0b1120] border border-slate-700 rounded-xl shadow-2xl z-40 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-sky-400" />
                      Filter Holdings
                    </span>
                    {(sectorFilter !== 'ALL' || statusFilter !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSectorFilter('ALL');
                          setStatusFilter('ALL');
                          onResetFilters?.();
                        }}
                        className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
                      >
                        Reset All
                      </button>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Filter by Sector
                    </span>
                    <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                      {[
                        { id: 'ALL', label: 'All Sectors' },
                        { id: 'US Tech', label: 'US Tech (Semis, Cloud AI)' },
                        { id: 'Indian Banking', label: 'Indian Banking (Private)' },
                        ...availableSectors.map((s) => ({ id: s, label: s }))
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSectorFilter(item.id);
                            onSectorChange?.(item.id);
                          }}
                          className={`w-full text-left px-2 py-1 rounded-md text-xs transition-colors cursor-pointer flex items-center justify-between ${
                            sectorFilter === item.id
                              ? 'bg-sky-500/20 text-sky-300 font-semibold'
                              : 'text-slate-300 hover:bg-[#1e293b]'
                          }`}
                        >
                          <span className="truncate">{item.label}</span>
                          {sectorFilter === item.id && <span className="text-sky-400 font-bold">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Filter by Thesis Status
                    </span>
                    <div className="space-y-1">
                      {['ALL', 'On Track', 'Watch', 'Review'].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            setStatusFilter(st as any);
                            onThesisStatusChange?.(st);
                          }}
                          className={`w-full text-left px-2 py-1 rounded-md text-xs transition-colors cursor-pointer flex items-center justify-between ${
                            statusFilter === st
                              ? 'bg-sky-500/20 text-sky-300 font-semibold'
                              : 'text-slate-300 hover:bg-[#1e293b]'
                          }`}
                        >
                          <span>{st === 'ALL' ? 'All Statuses' : st}</span>
                          {statusFilter === st && <span className="text-sky-400 font-bold">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Clear shortcut if filtered */}
            {(sectorFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSectorFilter('ALL');
                  setStatusFilter('ALL');
                  onResetFilters?.();
                }}
                className="text-xs text-sky-400 hover:text-sky-300 px-2 py-1 rounded hover:bg-[#1e293b] cursor-pointer transition-colors"
                title="Reset sector and thesis status filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {filteredAndSortedHoldings.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-semibold text-slate-200 mb-1">
              No holdings match your active filter criteria
            </p>
            <p className="text-xs text-slate-400 mb-4">
              Try clearing your search query or switching sector, market, and thesis filters back to All.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setMarketFilter('ALL');
                setSectorFilter('ALL');
                setStatusFilter('ALL');
                setSortKey('valueInr');
                setSortOrder('desc');
              }}
              data-testid="reset-filters-btn"
              className="px-4 py-2 bg-[#1e293b] hover:bg-slate-700 text-sky-400 text-xs font-medium rounded-lg border border-slate-700 cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" data-testid="holdings-table">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0b1120]/60 text-[11px] text-slate-400 font-medium">
                  <th className="py-3.5 pl-5 pr-3">
                    <button
                      type="button"
                      onClick={() => handleSort('ticker')}
                      className="inline-flex items-center gap-1.5 hover:text-slate-200 cursor-pointer"
                    >
                      <span>Ticker &amp; Asset</span>
                      {renderSortIcon('ticker')}
                    </button>
                  </th>
                  <th className="py-3.5 px-3">
                    <button
                      type="button"
                      onClick={() => handleSort('sector')}
                      className="inline-flex items-center gap-1.5 hover:text-slate-200 cursor-pointer"
                      data-testid="sort-sector-column"
                      aria-label="Sort by Sector"
                    >
                      <span>Market · Sector · Role</span>
                      {renderSortIcon('sector')}
                    </button>
                  </th>
                  <th className="py-3.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('currentPrice')}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-slate-200 cursor-pointer ml-auto"
                    >
                      <span>Last Price</span>
                      {renderSortIcon('currentPrice')}
                    </button>
                  </th>
                  <th className="py-3.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('valueInr')}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-slate-200 cursor-pointer ml-auto"
                    >
                      <span>Market Value ({currency})</span>
                      {renderSortIcon('valueInr')}
                    </button>
                  </th>
                  <th className="py-3.5 px-3 w-44">
                    <button
                      type="button"
                      onClick={() => handleSort('allocationPct')}
                      className="inline-flex items-center gap-1.5 hover:text-slate-200 cursor-pointer"
                    >
                      <span>Portfolio Weight</span>
                      {renderSortIcon('allocationPct')}
                    </button>
                  </th>
                  <th className="py-3.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('pnlPct')}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-slate-200 cursor-pointer ml-auto"
                    >
                      <span>Unrealized P&amp;L</span>
                      {renderSortIcon('pnlPct')}
                    </button>
                  </th>
                  <th className="py-3.5 pl-3 pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('thesisStatus')}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-slate-200 cursor-pointer ml-auto"
                      data-testid="sort-thesis-status-column"
                      aria-label="Sort by Thesis Status"
                    >
                      <span>Thesis Status</span>
                      {renderSortIcon('thesisStatus')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {filteredAndSortedHoldings.map((holding) => {
                  const isExpanded = expandedTicker === holding.ticker;
                  const impliedCostInr = holding.valueInr / (1 + holding.pnlPct / 100);
                  const unrealizedPnlInr = holding.valueInr - impliedCostInr;

                  return (
                    <React.Fragment key={holding.ticker}>
                      <tr
                        onClick={() =>
                          setExpandedTicker(isExpanded ? null : holding.ticker)
                        }
                        className={`cursor-pointer transition-colors ${
                          isExpanded ? 'bg-[#1e293b]/70' : 'hover:bg-[#1e293b]/40'
                        }`}
                      >
                        <td className="py-3.5 pl-5 pr-3">
                          <div className="flex items-center gap-2.5">
                            <div className="text-slate-400">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-sky-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <div className="font-mono font-bold text-slate-100 text-sm">
                                {holding.ticker}
                              </div>
                              <div className="text-slate-400 text-xs">{holding.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-sky-400">
                              {holding.market}
                            </span>
                            <span className="text-slate-600">·</span>
                            <span>{holding.role}</span>
                          </div>
                          {holding.sector && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {holding.sector}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-200">
                          <div>{formatAssetPrice(holding.currentPrice, holding.currency)}</div>
                          <div className="text-[10px] text-slate-500">{holding.currency} Native</div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-100">
                          <div>
                            <PrivateMoney
                              value={formatPortfolioValue(holding.valueInr, currency, usdInr)}
                              currency={currency}
                              privacyMode={privacyMode}
                            />
                          </div>
                          <div className="text-[11px] font-normal text-slate-400">
                            Cost:{' '}
                            <PrivateMoney
                              value={formatPortfolioValue(impliedCostInr, currency, usdInr, { compact: true })}
                              currency={currency}
                              privacyMode={privacyMode}
                            />
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex items-center justify-between font-mono tabular-nums text-xs mb-1">
                            <span className="text-slate-200 font-semibold">
                              {holding.allocationPct.toFixed(1)}%
                            </span>
                            {holding.targetPct !== undefined && (
                              <span className="text-[10px] text-slate-400">
                                Target: {holding.targetPct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-sky-400 rounded-full"
                              style={{
                                width: `${Math.min(100, (holding.allocationPct / 20) * 100)}%`
                              }}
                            />
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          <div
                            className={`font-semibold ${
                              holding.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {holding.pnlPct >= 0 ? '+' : ''}
                            {holding.pnlPct.toFixed(1)}%
                          </div>
                          <div
                            className={`text-[11px] ${
                              unrealizedPnlInr >= 0 ? 'text-emerald-500/80' : 'text-rose-500/80'
                            }`}
                          >
                            <PrivateMoney
                              prefix={unrealizedPnlInr >= 0 ? '+' : ''}
                              value={formatPortfolioValue(unrealizedPnlInr, currency, usdInr, {
                                compact: true
                              })}
                              currency={currency}
                              privacyMode={privacyMode}
                            />
                          </div>
                        </td>
                        <td className="py-3.5 pl-3 pr-5 text-right">
                          {renderThesisStatusIndicator(holding.thesisStatus)}
                        </td>
                      </tr>

                      {/* Expanded Analytical Detail Row */}
                      {isExpanded && (
                        <tr className="bg-[#0b1120]/90 border-b border-slate-800">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              <div className="md:col-span-2 space-y-1.5">
                                <div className="text-slate-400 font-medium">
                                  Investment Thesis &amp; Position Mandate
                                </div>
                                <p className="text-slate-200 leading-relaxed">
                                  {holding.thesisNote ||
                                    `${holding.name} (${holding.ticker}) operates as a ${holding.role} position within the ${holding.market} sleeve. Current portfolio weight is ${holding.allocationPct.toFixed(1)}% with unrealized return of ${holding.pnlPct >= 0 ? '+' : ''}${holding.pnlPct.toFixed(1)}%.`}
                                </p>
                              </div>
                              <div className="flex flex-col justify-between p-3 rounded-lg bg-[#0f172a] border border-slate-800/80 font-mono tabular-nums space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400 font-sans">Implied Cost Basis:</span>
                                  <span className="text-slate-200">
                                    <PrivateMoney
                                      value={formatPortfolioValue(impliedCostInr, currency, usdInr)}
                                      currency={currency}
                                      privacyMode={privacyMode}
                                    />
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400 font-sans">Weight Drift vs Target:</span>
                                  <span className="text-sky-400">
                                    {holding.targetPct !== undefined
                                      ? `${(holding.allocationPct - holding.targetPct >= 0 ? '+' : '')}${(
                                          holding.allocationPct - holding.targetPct
                                        ).toFixed(1)}%`
                                      : '0.0% (Aligned)'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400 font-sans">Audit Status:</span>
                                  <span className="text-emerald-400">{holding.thesisStatus}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Position Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-slate-100">
                Add Portfolio Holding (Simulation / Sandbox)
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePosition} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Ticker Symbol *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AAPL or HDFCBANK"
                    value={newTicker}
                    onChange={(e) => setNewTicker(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Market Sleeve</label>
                  <select
                    value={newMarket}
                    onChange={(e) => setNewMarket(e.target.value as 'US' | 'IN' | 'MF')}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  >
                    <option value="US">US Equities (USD)</option>
                    <option value="IN">Indian Equities (INR)</option>
                    <option value="MF">Mutual Funds (INR)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Asset / Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apple Inc"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Strategic Role</label>
                  <input
                    type="text"
                    placeholder="e.g. Compounder"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Current Price ({newMarket === 'US' ? '$' : '₹'})
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="225.00"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Position Value (₹ INR)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="350000"
                    value={newValueInr}
                    onChange={(e) => setNewValueInr(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Unrealized P&amp;L (%)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="18.5"
                    value={newPnlPct}
                    onChange={(e) => setNewPnlPct(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Thesis Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as 'On Track' | 'Watch' | 'Review')}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  >
                    <option value="On Track">On Track</option>
                    <option value="Watch">Watch</option>
                    <option value="Review">Review</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Core Thesis Note</label>
                  <input
                    type="text"
                    placeholder="Key investment catalyst..."
                    value={newThesis}
                    onChange={(e) => setNewThesis(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-[#1e293b] text-slate-300 rounded-lg hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-500 text-slate-950 font-semibold rounded-lg hover:bg-sky-400 cursor-pointer"
                >
                  Save Position
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
