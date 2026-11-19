import React, { useState, useMemo } from 'react';
import {
  Target,
  TrendingDown,
  CheckCircle2,
  Clock,
  Plus,
  LayoutGrid,
  List,
  ArrowRight,
  X,
  DollarSign
} from 'lucide-react';
import { PortfolioData, WatchlistItem, CurrencyCode } from '../../types/portfolio';
import { formatPortfolioValue } from '../../services/portfolioService';
import { PrivateMoney, getPrivacyMask } from './PrivateMoney';

interface WatchlistPipelineTabProps {
  data: PortfolioData;
  currency: CurrencyCode;
  privacyMode?: boolean;
  onAddWatchlistItem: (item: WatchlistItem) => void;
  onDeployWatchlistTranche: (item: WatchlistItem) => void;
}

export const WatchlistPipelineTab: React.FC<WatchlistPipelineTabProps> = ({
  data,
  currency,
  privacyMode = false,
  onAddWatchlistItem,
  onDeployWatchlistTranche
}) => {
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showAddModal, setShowAddModal] = useState(false);
  const [deployedBanner, setDeployedBanner] = useState<string | null>(null);

  // Add Candidate Form State
  const [ticker, setTicker] = useState('');
  const [company, setCompany] = useState('');
  const [stage, setStage] = useState('Ready to Deploy');
  const [targetRole, setTargetRole] = useState('Compounder');
  const [sector, setSector] = useState('Cloud / AI');
  const [currentPrice, setCurrentPrice] = useState('');
  const [high52w, setHigh52w] = useState('');
  const [allocatedUsd, setAllocatedUsd] = useState('');
  const [nextStep, setNextStep] = useState('');

  const usdInr = data.meta.usdInr || 95.41;

  const filteredWatchlist = useMemo(() => {
    if (stageFilter === 'ALL') return data.watchlist;
    return data.watchlist.filter((w) => w.stage.toLowerCase() === stageFilter.toLowerCase());
  }, [data.watchlist, stageFilter]);

  const pipelineStats = useMemo(() => {
    const totalAllocatedUsd = data.watchlist.reduce((acc, w) => acc + w.allocatedCapitalUsd, 0);
    const totalAllocatedInr = totalAllocatedUsd * usdInr;
    const readyCount = data.watchlist.filter(
      (w) => w.stage.toLowerCase() === 'ready to deploy'
    ).length;
    const avgDrawdown =
      data.watchlist.length > 0
        ? data.watchlist.reduce((acc, w) => acc + w.drawdownPct, 0) / data.watchlist.length
        : 0;
    const cashCoveragePct =
      totalAllocatedInr > 0
        ? Math.min(999, (data.summary.cashBalanceInr / totalAllocatedInr) * 100)
        : 100;

    return {
      totalAllocatedUsd,
      totalAllocatedInr,
      readyCount,
      avgDrawdown,
      cashCoveragePct
    };
  }, [data.watchlist, data.summary.cashBalanceInr, usdInr]);

  const formatAllocatedCapital = (usdAmount: number) => {
    if (currency === 'USD') {
      return `$${usdAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
    return formatPortfolioValue(usdAmount * usdInr, 'INR', usdInr);
  };

  const handleCreateCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim() || !company.trim()) return;

    const curr = Number(currentPrice) || 100;
    const high = Number(high52w) || curr * 1.15;
    const drawdown = Number((((curr - high) / high) * 100).toFixed(1));

    const item: WatchlistItem = {
      ticker: ticker.trim().toUpperCase(),
      company: company.trim(),
      stage,
      targetRole: targetRole.trim() || 'Compounder',
      sector: sector.trim() || 'Technology',
      currentPrice: curr,
      high52w: high,
      drawdownPct: drawdown,
      thesisStatus: 'Validated',
      allocatedCapitalUsd: Number(allocatedUsd) || 1500,
      nextStep: nextStep.trim() || 'Buy tranche 1 on target pullback zone'
    };

    onAddWatchlistItem(item);
    setShowAddModal(false);
    setTicker('');
    setCompany('');
    setCurrentPrice('');
    setHigh52w('');
    setAllocatedUsd('');
    setNextStep('');
  };

  const handleTriggerDeploy = (item: WatchlistItem) => {
    onDeployWatchlistTranche(item);
    const amountLabel = privacyMode
      ? getPrivacyMask(currency)
      : formatAllocatedCapital(item.allocatedCapitalUsd);
    setDeployedBanner(
      `Simulated Tranche Deployment: ${item.ticker} (${amountLabel}) moved from Watchlist into Active Holdings.`
    );
    setTimeout(() => setDeployedBanner(null), 6000);
  };

  return (
    <div className="space-y-6">
      {/* Deployment Feedback Notification */}
      {deployedBanner && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{deployedBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setDeployedBanner(null)}
            className="text-emerald-400 hover:text-emerald-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pipeline Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Total Pipeline Capital Earmarked</div>
          <div className="text-2xl font-bold text-slate-100 font-mono tabular-nums">
            <PrivateMoney
              value={formatAllocatedCapital(pipelineStats.totalAllocatedUsd)}
              currency={currency}
              privacyMode={privacyMode}
            />
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-1">
            Across {data.watchlist.length} high-conviction targets
          </div>
        </div>

        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Ready to Deploy Candidates</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            {pipelineStats.readyCount} / {data.watchlist.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Thesis validated &amp; near buy zone
          </div>
        </div>

        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Avg. Drawdown from 52W High</div>
          <div className="text-2xl font-bold text-amber-400 font-mono tabular-nums">
            {pipelineStats.avgDrawdown.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Margin-of-safety pullback window
          </div>
        </div>

        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Available Dry Powder Ratio</div>
          <div className="text-2xl font-bold text-sky-400 font-mono tabular-nums">
            {pipelineStats.cashCoveragePct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-1">
            Cash:{' '}
            <PrivateMoney
              value={formatPortfolioValue(data.summary.cashBalanceInr, currency, usdInr)}
              currency={currency}
              privacyMode={privacyMode}
            />
          </div>
        </div>
      </div>

      {/* Filter & View Switch Bar */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['ALL', 'Ready to Deploy', 'Accumulating', 'Monitoring', 'Researching'] as const).map(
            (st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStageFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  stageFilter === st
                    ? 'bg-[#1e293b] text-sky-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 bg-[#0b1120] border border-slate-800/80'
                }`}
              >
                {st === 'ALL' ? 'All Pipeline Stages' : st}
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="flex items-center gap-1 p-1 bg-[#0b1120] border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'cards' ? 'bg-[#1e293b] text-sky-400' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Deployment Cards View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-[#1e293b] text-sky-400' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Pipeline Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Watchlist Target</span>
          </button>
        </div>
      </div>

      {/* Cards View vs Table View */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredWatchlist.map((item) => {
            const isReady = item.stage.toLowerCase() === 'ready to deploy';
            const drawdownAbs = Math.min(100, Math.abs(item.drawdownPct));

            return (
              <div
                key={item.ticker}
                className="bg-[#0f172a] border border-slate-800 hover:border-slate-700 rounded-xl p-5 flex flex-col justify-between transition-colors"
              >
                <div>
                  {/* Header: Ticker, Company, Stage */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-100 font-mono">
                          {item.ticker}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-sky-400 font-medium">{item.targetRole}</span>
                      </div>
                      <div className="text-xs text-slate-300 mt-0.5">
                        {item.company} <span className="text-slate-500">· {item.sector}</span>
                      </div>
                    </div>

                    <span
                      className={`text-xs font-medium ${
                        isReady ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {item.stage}
                    </span>
                  </div>

                  {/* Price & 52-Week High Drawdown Visualizer */}
                  <div className="p-3.5 rounded-lg bg-[#0b1120] border border-slate-800/90 space-y-2.5 my-3 font-mono tabular-nums text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">
                          Current Price
                        </span>
                        <span className="text-sm font-bold text-slate-100">
                          {item.currentPrice > 1000 ? `₹${item.currentPrice}` : `$${item.currentPrice.toFixed(2)}`}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-[10px] text-slate-400 block font-sans">
                          52-Week High
                        </span>
                        <span className="text-slate-300">
                          {item.high52w > 1000 ? `₹${item.high52w}` : `$${item.high52w.toFixed(2)}`}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-sans">
                          52W Drawdown
                        </span>
                        <span className="text-amber-400 font-bold inline-flex items-center gap-0.5">
                          <TrendingDown className="w-3.5 h-3.5" />
                          {item.drawdownPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Visual Pullback Gauge */}
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400 font-sans mb-1">
                        <span>52W Peak</span>
                        <span>Pullback Depth ({drawdownAbs.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            drawdownAbs >= 10 ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(100, drawdownAbs * 2.5)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Allocated Capital & Thesis Validation */}
                  <div className="flex items-center justify-between text-xs py-2 border-b border-slate-800/80">
                    <div>
                      <span className="text-slate-400">Allocated Capital: </span>
                      <strong className="text-slate-100 font-mono tabular-nums">
                        <PrivateMoney
                          value={formatAllocatedCapital(item.allocatedCapitalUsd)}
                          currency={currency}
                          privacyMode={privacyMode}
                        />
                      </strong>
                    </div>
                    <div className="flex items-center gap-1 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Thesis: {item.thesisStatus}</span>
                    </div>
                  </div>

                  {/* Next Action Trigger */}
                  <div className="mt-3 text-xs">
                    <div className="text-[11px] text-slate-400 font-medium mb-1 flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-sky-400" />
                      <span>Next Action Trigger</span>
                    </div>
                    <p className="text-slate-200 font-medium leading-relaxed">{item.nextStep}</p>
                  </div>
                </div>

                {/* Simulate Execution Action */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                    USD Budget:{' '}
                    <PrivateMoney
                      value={`$${item.allocatedCapitalUsd.toLocaleString('en-US')}`}
                      currency="USD"
                      privacyMode={privacyMode}
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTriggerDeploy(item)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 cursor-pointer"
                  >
                    <span>Execute Tranche</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0b1120]/60 text-[11px] text-slate-400 font-medium">
                  <th className="py-3.5 pl-5 pr-3">Ticker &amp; Company</th>
                  <th className="py-3.5 px-3">Pipeline Stage</th>
                  <th className="py-3.5 px-3">Target Role · Sector</th>
                  <th className="py-3.5 px-3 text-right">Price / 52W High</th>
                  <th className="py-3.5 px-3 text-right">Drawdown</th>
                  <th className="py-3.5 px-3 text-right">Allocated Capital</th>
                  <th className="py-3.5 px-3">Thesis Validation</th>
                  <th className="py-3.5 pl-3 pr-5">Next Action Step</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {filteredWatchlist.map((item) => (
                  <tr key={item.ticker} className="hover:bg-[#1e293b]/40 transition-colors">
                    <td className="py-3.5 pl-5 pr-3">
                      <div className="font-mono font-bold text-slate-100 text-sm">
                        {item.ticker}
                      </div>
                      <div className="text-slate-400">{item.company}</div>
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`font-medium ${
                          item.stage.toLowerCase() === 'ready to deploy'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {item.stage}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="text-slate-200 font-medium">{item.targetRole}</div>
                      <div className="text-[11px] text-slate-400">{item.sector}</div>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-200">
                      <div>${item.currentPrice.toFixed(2)}</div>
                      <div className="text-[11px] text-slate-400">
                        52W: ${item.high52w.toFixed(2)}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-amber-400">
                      {item.drawdownPct.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-sky-400">
                      <PrivateMoney
                        value={formatAllocatedCapital(item.allocatedCapitalUsd)}
                        currency={currency}
                        privacyMode={privacyMode}
                      />
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{item.thesisStatus}</span>
                      </span>
                    </td>
                    <td className="py-3.5 pl-3 pr-5 text-slate-200">
                      <div className="flex items-center justify-between gap-3">
                        <span>{item.nextStep}</span>
                        <button
                          type="button"
                          onClick={() => handleTriggerDeploy(item)}
                          className="px-2.5 py-1 bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 rounded text-[11px] font-semibold whitespace-nowrap cursor-pointer"
                        >
                          Deploy
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Watchlist Candidate Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-slate-100">
                Add Watchlist &amp; Deployment Pipeline Candidate
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCandidate} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Ticker *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. META"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Meta Platforms"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Pipeline Stage</label>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  >
                    <option value="Ready to Deploy">Ready to Deploy</option>
                    <option value="Accumulating">Accumulating</option>
                    <option value="Monitoring">Monitoring</option>
                    <option value="Researching">Researching</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Target Role</label>
                  <input
                    type="text"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Sector</label>
                  <input
                    type="text"
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Current Price ($)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="560.0"
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">52-Week High ($)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="602.0"
                    value={high52w}
                    onChange={(e) => setHigh52w(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Allocated Capital ($)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="2000"
                    value={allocatedUsd}
                    onChange={(e) => setAllocatedUsd(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Next Action Step *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Buy tranche 1 on 10% pullback below $540"
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                />
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
                  Add to Pipeline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
