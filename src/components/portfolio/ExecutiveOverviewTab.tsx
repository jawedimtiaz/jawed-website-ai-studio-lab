import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Wallet,
  Globe,
  ShieldCheck,
  ArrowUpRight,
  Layers,
  Activity
} from 'lucide-react';
import { PortfolioData, CurrencyCode } from '../../types/portfolio';
import { formatPortfolioValue } from '../../services/portfolioService';
import { PrivateMoney } from './PrivateMoney';
import { RebalancingCalculatorPanel } from './RebalancingCalculatorPanel';

interface ExecutiveOverviewTabProps {
  data: PortfolioData;
  currency: CurrencyCode;
  privacyMode?: boolean;
  highlightRebalancing?: boolean;
  rebalanceSearchQuery?: string;
  onRebalanceSearchChange?: (next: string) => void;
  onNavigateTab: (tab: 'overview' | 'holdings' | 'watchlist' | 'research' | 'retirement') => void;
}

const SLICE_COLORS = [
  { stroke: '#38bdf8', bg: 'bg-sky-400', text: 'text-sky-400' },       // Indian Equities
  { stroke: '#6366f1', bg: 'bg-indigo-500', text: 'text-indigo-400' }, // Mutual Funds
  { stroke: '#10b981', bg: 'bg-emerald-500', text: 'text-emerald-400' }, // US Equities
  { stroke: '#f59e0b', bg: 'bg-amber-500', text: 'text-amber-400' }    // Cash & Liquid
];

export const ExecutiveOverviewTab: React.FC<ExecutiveOverviewTabProps> = ({
  data,
  currency,
  privacyMode = false,
  highlightRebalancing = false,
  rebalanceSearchQuery = '',
  onRebalanceSearchChange,
  onNavigateTab
}) => {
  const [activeSliceIdx, setActiveSliceIdx] = useState<number | null>(null);
  const [chartMode, setChartMode] = useState<'indexed' | 'absolute'>('indexed');
  const [hoveredSnapIdx, setHoveredSnapIdx] = useState<number | null>(null);

  const { meta, summary, allocation, snapshots } = data;
  const usdInr = meta.usdInr || 95.41;

  const lrsPct = useMemo(() => {
    if (!meta.lrsAnnualLimitUsd) return 0;
    return Math.min(100, (meta.lrsUsedUsd / meta.lrsAnnualLimitUsd) * 100);
  }, [meta.lrsUsedUsd, meta.lrsAnnualLimitUsd]);

  const lrsRemainingUsd = Math.max(0, meta.lrsAnnualLimitUsd - meta.lrsUsedUsd);

  // Donut Chart Geometry
  const donutSegments = useMemo(() => {
    const totalPct = allocation.reduce((acc, item) => acc + item.pct, 0) || 100;
    const radius = 78;
    const circumference = 2 * Math.PI * radius;
    let cumulativePct = 0;

    return allocation.map((item, idx) => {
      const normalizedPct = (item.pct / totalPct) * 100;
      const strokeDasharray = `${(normalizedPct / 100) * circumference} ${circumference}`;
      const strokeDashoffset = -((cumulativePct / 100) * circumference);
      cumulativePct += normalizedPct;
      const color = SLICE_COLORS[idx % SLICE_COLORS.length];

      return {
        ...item,
        idx,
        radius,
        circumference,
        strokeDasharray,
        strokeDashoffset,
        color
      };
    });
  }, [allocation]);

  const selectedSegment = activeSliceIdx !== null ? donutSegments[activeSliceIdx] : null;

  // Benchmark & Portfolio Growth Series
  const chartSeries = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];
    const basePort = snapshots[0].totalValueInr || 1;
    const baseSp500 = snapshots[0].sp500 || 1;
    const baseQqq = snapshots[0].qqq || 1;

    return snapshots.map((snap, idx) => {
      const portGrowthPct = ((snap.totalValueInr - basePort) / basePort) * 100;
      const sp500GrowthPct = ((snap.sp500 - baseSp500) / baseSp500) * 100;
      const qqqGrowthPct = ((snap.qqq - baseQqq) / baseQqq) * 100;

      return {
        ...snap,
        idx,
        portGrowthPct,
        sp500GrowthPct,
        qqqGrowthPct
      };
    });
  }, [snapshots]);

  // SVG Coordinate Computation for Growth Chart
  const svgChart = useMemo(() => {
    const width = 760;
    const height = 250;
    const padLeft = 48;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 34;
    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;

    if (chartSeries.length === 0) {
      return null;
    }

    if (chartMode === 'indexed') {
      const allVals = chartSeries.flatMap((d) => [
        d.portGrowthPct,
        d.sp500GrowthPct,
        d.qqqGrowthPct
      ]);
      const minVal = Math.min(0, ...allVals);
      const maxVal = Math.max(20, ...allVals) * 1.1;
      const range = maxVal - minVal || 1;

      const getX = (i: number) =>
        padLeft + (chartSeries.length === 1 ? innerW / 2 : (i / (chartSeries.length - 1)) * innerW);
      const getY = (v: number) => padTop + innerH - ((v - minVal) / range) * innerH;

      const portPoints = chartSeries.map((d, i) => ({ x: getX(i), y: getY(d.portGrowthPct), d }));
      const spPoints = chartSeries.map((d, i) => ({ x: getX(i), y: getY(d.sp500GrowthPct), d }));
      const qqqPoints = chartSeries.map((d, i) => ({ x: getX(i), y: getY(d.qqqGrowthPct), d }));

      const toPath = (pts: { x: number; y: number }[]) =>
        pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

      const portPath = toPath(portPoints);
      const areaPath = `${portPath} L${portPoints[portPoints.length - 1].x.toFixed(1)},${(
        padTop + innerH
      ).toFixed(1)} L${portPoints[0].x.toFixed(1)},${(padTop + innerH).toFixed(1)} Z`;

      const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const val = minVal + t * range;
        return {
          y: getY(val),
          label: `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
        };
      });

      return {
        width,
        height,
        padLeft,
        padRight,
        padTop,
        padBottom,
        innerW,
        innerH,
        portPoints,
        spPoints,
        qqqPoints,
        portPath,
        spPath: toPath(spPoints),
        qqqPath: toPath(qqqPoints),
        areaPath,
        yTicks
      };
    } else {
      // Absolute Portfolio Value mode
      const vals = chartSeries.map((d) => d.totalValueInr);
      const minVal = Math.min(...vals) * 0.96;
      const maxVal = Math.max(...vals) * 1.03;
      const range = maxVal - minVal || 1;

      const getX = (i: number) =>
        padLeft + (chartSeries.length === 1 ? innerW / 2 : (i / (chartSeries.length - 1)) * innerW);
      const getY = (v: number) => padTop + innerH - ((v - minVal) / range) * innerH;

      const portPoints = chartSeries.map((d, i) => ({ x: getX(i), y: getY(d.totalValueInr), d }));
      const toPath = (pts: { x: number; y: number }[]) =>
        pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

      const portPath = toPath(portPoints);
      const areaPath = `${portPath} L${portPoints[portPoints.length - 1].x.toFixed(1)},${(
        padTop + innerH
      ).toFixed(1)} L${portPoints[0].x.toFixed(1)},${(padTop + innerH).toFixed(1)} Z`;

      const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const val = minVal + t * range;
        return {
          y: getY(val),
          label: privacyMode
            ? currency === 'USD'
              ? '$ ••K'
              : '₹ ••L'
            : formatPortfolioValue(val, currency, usdInr, { compact: true })
        };
      });

      return {
        width,
        height,
        padLeft,
        padRight,
        padTop,
        padBottom,
        innerW,
        innerH,
        portPoints,
        spPoints: [],
        qqqPoints: [],
        portPath,
        spPath: '',
        qqqPath: '',
        areaPath,
        yTicks
      };
    }
  }, [chartSeries, chartMode, currency, usdInr, privacyMode]);

  const activeSnap =
    hoveredSnapIdx !== null && chartSeries[hoveredSnapIdx]
      ? chartSeries[hoveredSnapIdx]
      : chartSeries[chartSeries.length - 1];

  return (
    <div className="space-y-6">
      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Total Portfolio Value */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
            <span>Total Portfolio Value</span>
            <Layers className="w-4 h-4 text-sky-400 shrink-0" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-100 font-mono tabular-nums tracking-tight">
              <PrivateMoney
                value={formatPortfolioValue(summary.totalValueInr, currency, usdInr)}
                currency={currency}
                privacyMode={privacyMode}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
              <span>
                Invested:{' '}
                <PrivateMoney
                  value={formatPortfolioValue(summary.investedValueInr, currency, usdInr, { compact: true })}
                  currency={currency}
                  privacyMode={privacyMode}
                />
              </span>
              <span className="text-sky-400">{summary.investedPct.toFixed(1)}% Deployed</span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Unrealized P&L */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
            <span>Total Unrealized P&amp;L</span>
            <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <div>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span
                className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight ${
                  summary.unrealizedPnlInr >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                <PrivateMoney
                  prefix={summary.unrealizedPnlInr >= 0 ? '+' : ''}
                  value={formatPortfolioValue(summary.unrealizedPnlInr, currency, usdInr)}
                  currency={currency}
                  privacyMode={privacyMode}
                />
              </span>
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold font-mono tabular-nums ${
                  summary.unrealizedPnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                {summary.unrealizedPnlPct >= 0 ? '+' : ''}
                {summary.unrealizedPnlPct.toFixed(2)}%
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
              <span>Net Return on Cost Basis</span>
              <span className="text-emerald-400">Outperforming Benchmark</span>
            </div>
          </div>
        </div>

        {/* Card 3: Cash / Dry Powder Available */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
            <span>Cash / Dry Powder Available</span>
            <Wallet className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-100 font-mono tabular-nums tracking-tight">
              <PrivateMoney
                value={formatPortfolioValue(summary.cashBalanceInr, currency, usdInr)}
                currency={currency}
                privacyMode={privacyMode}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
              <span>{(100 - summary.investedPct).toFixed(1)}% Liquid Buffer</span>
              <button
                type="button"
                onClick={() => onNavigateTab('watchlist')}
                className="text-amber-400 hover:underline cursor-pointer font-sans"
              >
                View Pipeline →
              </button>
            </div>
          </div>
        </div>

        {/* Card 4: FY 26-27 LRS Utilization */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
            <span>FY 26-27 LRS Utilization</span>
            <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-slate-100 font-mono tabular-nums tracking-tight">
                <PrivateMoney
                  value={`$${meta.lrsUsedUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                  currency="USD"
                  privacyMode={privacyMode}
                />
              </span>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                / ${(meta.lrsAnnualLimitUsd / 1000).toFixed(0)}K Cap
              </span>
            </div>
            {/* LRS Progress Bar */}
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-2.5">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(4, lrsPct)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
              <span>
                Remitted:{' '}
                <PrivateMoney
                  value={`₹${(meta.lrsUsedInr / 100000).toFixed(2)}L`}
                  currency="INR"
                  privacyMode={privacyMode}
                />
              </span>
              <span className="text-indigo-400">
                <PrivateMoney
                  value={`$${lrsRemainingUsd.toLocaleString('en-US')}`}
                  currency="USD"
                  privacyMode={privacyMode}
                />{' '}
                Headroom
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: Asset Allocation Donut + Breakdown Table & Portfolio Growth Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Asset Allocation Card (5 cols on lg) */}
        <div className="lg:col-span-5 bg-[#0f172a] border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold text-slate-100">
                Multi-Asset Allocation &amp; Strategy Roles
              </h2>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                {allocation.length} Sleeves
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              Hover or select an asset class slice to inspect role mandate and capital weight.
            </p>

            {/* Interactive SVG Donut Chart */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 my-4">
              <div className="relative w-48 h-48 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                  <circle
                    cx="100"
                    cy="100"
                    r="78"
                    fill="transparent"
                    stroke="#1e293b"
                    strokeWidth="22"
                  />
                  {donutSegments.map((seg) => {
                    const isSelected = activeSliceIdx === seg.idx;
                    return (
                      <circle
                        key={seg.category}
                        cx="100"
                        cy="100"
                        r={seg.radius}
                        fill="transparent"
                        stroke={seg.color.stroke}
                        strokeWidth={isSelected ? 26 : 22}
                        strokeDasharray={seg.strokeDasharray}
                        strokeDashoffset={seg.strokeDashoffset}
                        className="cursor-pointer transition-all duration-200"
                        style={{
                          opacity: activeSliceIdx === null || isSelected ? 1 : 0.45
                        }}
                        onMouseEnter={() => setActiveSliceIdx(seg.idx)}
                        onMouseLeave={() => setActiveSliceIdx(null)}
                        onClick={() =>
                          setActiveSliceIdx(activeSliceIdx === seg.idx ? null : seg.idx)
                        }
                      />
                    );
                  })}
                </svg>
                {/* Donut Center Readout */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">
                  <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
                    {selectedSegment ? selectedSegment.category : 'Total Portfolio'}
                  </span>
                  <span className="text-lg font-bold text-slate-100 font-mono tabular-nums mt-0.5">
                    {selectedSegment ? (
                      `${selectedSegment.pct.toFixed(1)}%`
                    ) : (
                      <PrivateMoney
                        value={formatPortfolioValue(summary.totalValueInr, currency, usdInr, {
                          compact: true
                        })}
                        currency={currency}
                        privacyMode={privacyMode}
                      />
                    )}
                  </span>
                  <span className="text-[11px] text-sky-400 font-mono tabular-nums mt-0.5">
                    {selectedSegment ? (
                      <PrivateMoney
                        value={formatPortfolioValue(selectedSegment.valueInr, currency, usdInr, {
                          compact: true
                        })}
                        currency={currency}
                        privacyMode={privacyMode}
                      />
                    ) : (
                      `${summary.investedPct.toFixed(1)}% Invested`
                    )}
                  </span>
                </div>
              </div>

              {/* Legend Summary */}
              <div className="flex flex-col gap-2.5 w-full">
                {donutSegments.map((seg) => (
                  <button
                    key={seg.category}
                    type="button"
                    onMouseEnter={() => setActiveSliceIdx(seg.idx)}
                    onMouseLeave={() => setActiveSliceIdx(null)}
                    onClick={() =>
                      setActiveSliceIdx(activeSliceIdx === seg.idx ? null : seg.idx)
                    }
                    className={`flex items-center justify-between p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                      activeSliceIdx === seg.idx
                        ? 'bg-[#1e293b] border-slate-600'
                        : 'bg-[#0b1120]/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${seg.color.bg}`} />
                      <div className="truncate">
                        <div className="text-xs font-medium text-slate-200 truncate">
                          {seg.category}
                        </div>
                        <div className="text-[11px] text-slate-400">{seg.role}</div>
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0 ml-2">
                      <div className="text-xs font-semibold text-slate-100">
                        {seg.pct.toFixed(1)}%
                      </div>
                      <div className="text-[11px] text-slate-400">
                        <PrivateMoney
                          value={formatPortfolioValue(seg.valueInr, currency, usdInr, { compact: true })}
                          currency={currency}
                          privacyMode={privacyMode}
                        />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Allocation Breakdown Table */}
          <div className="mt-4 pt-4 border-t border-slate-800/80 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400 font-medium">
                  <th className="pb-2 font-medium">Asset Category</th>
                  <th className="pb-2 font-medium">Strategic Role</th>
                  <th className="pb-2 font-medium text-right">Value</th>
                  <th className="pb-2 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {donutSegments.map((seg) => (
                  <tr
                    key={seg.category}
                    onMouseEnter={() => setActiveSliceIdx(seg.idx)}
                    onMouseLeave={() => setActiveSliceIdx(null)}
                    className={`transition-colors ${
                      activeSliceIdx === seg.idx ? 'bg-[#1e293b]/70' : 'hover:bg-[#1e293b]/40'
                    }`}
                  >
                    <td className="py-2.5 font-medium text-slate-200">{seg.category}</td>
                    <td className="py-2.5 text-slate-400">{seg.role}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-200">
                      <PrivateMoney
                        value={formatPortfolioValue(seg.valueInr, currency, usdInr)}
                        currency={currency}
                        privacyMode={privacyMode}
                      />
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums font-semibold text-sky-400">
                      {seg.pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Portfolio Growth vs Benchmark Chart (7 cols on lg) */}
        <div className="lg:col-span-7 bg-[#0f172a] border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sky-400" />
                  <span>Portfolio Growth vs. Benchmark (S&amp;P 500 &amp; QQQ)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Historical performance snapshots comparing cumulative portfolio trajectory against US indices.
                </p>
              </div>

              {/* Mode Switch */}
              <div className="flex items-center gap-1 p-1 bg-[#0b1120] border border-slate-800 rounded-lg self-start">
                <button
                  type="button"
                  onClick={() => setChartMode('indexed')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    chartMode === 'indexed'
                      ? 'bg-[#1e293b] text-sky-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Relative Return (%)
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('absolute')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    chartMode === 'absolute'
                      ? 'bg-[#1e293b] text-sky-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Absolute Value ({currency === 'INR' ? '₹' : '$'})
                </button>
              </div>
            </div>

            {/* Active Snapshot Readout Bar */}
            {activeSnap && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-[#0b1120] border border-slate-800/90 mb-4 text-xs font-mono tabular-nums">
                <div>
                  <span className="text-slate-400 block font-sans text-[11px]">Snapshot Date</span>
                  <span className="text-slate-100 font-semibold">{activeSnap.date}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans text-[11px]">Portfolio Value</span>
                  <span className="text-sky-400 font-semibold">
                    <PrivateMoney
                      value={formatPortfolioValue(activeSnap.totalValueInr, currency, usdInr)}
                      currency={currency}
                      privacyMode={privacyMode}
                    />{' '}
                    ({activeSnap.portGrowthPct >= 0 ? '+' : ''}
                    {activeSnap.portGrowthPct.toFixed(1)}%)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans text-[11px]">S&amp;P 500 Index</span>
                  <span className="text-indigo-400 font-semibold">
                    {activeSnap.sp500.toLocaleString('en-US')} (
                    {activeSnap.sp500GrowthPct >= 0 ? '+' : ''}
                    {activeSnap.sp500GrowthPct.toFixed(1)}%)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans text-[11px]">QQQ (Nasdaq-100)</span>
                  <span className="text-emerald-400 font-semibold">
                    ${activeSnap.qqq.toLocaleString('en-US')} (
                    {activeSnap.qqqGrowthPct >= 0 ? '+' : ''}
                    {activeSnap.qqqGrowthPct.toFixed(1)}%)
                  </span>
                </div>
              </div>
            )}

            {/* SVG Line / Area Chart */}
            {svgChart && (
              <div className="relative w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${svgChart.width} ${svgChart.height}`}
                  className="w-full h-auto select-none"
                >
                  <defs>
                    <linearGradient id="portAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid Lines & Y-Axis Labels */}
                  {svgChart.yTicks.map((t, idx) => (
                    <g key={idx}>
                      <line
                        x1={svgChart.padLeft}
                        y1={t.y}
                        x2={svgChart.width - svgChart.padRight}
                        y2={t.y}
                        stroke="#1e293b"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={svgChart.padLeft - 6}
                        y={t.y + 4}
                        textAnchor="end"
                        className={`fill-slate-500 text-[10px] font-mono ${
                          chartMode === 'absolute' && privacyMode ? 'monetary-value privacy-blur' : ''
                        }`.trim()}
                      >
                        {t.label}
                      </text>
                    </g>
                  ))}

                  {/* Area under Portfolio curve */}
                  <path d={svgChart.areaPath} fill="url(#portAreaGrad)" />

                  {/* Benchmark Curves in Indexed Mode */}
                  {chartMode === 'indexed' && (
                    <>
                      <path
                        d={svgChart.spPath}
                        fill="none"
                        stroke="#818cf8"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                      />
                      <path
                        d={svgChart.qqqPath}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2"
                      />
                    </>
                  )}

                  {/* Primary Portfolio Curve */}
                  <path
                    d={svgChart.portPath}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.75"
                  />

                  {/* Interactive Data Points */}
                  {svgChart.portPoints.map((pt, i) => {
                    const isHovered = hoveredSnapIdx === i;
                    return (
                      <g
                        key={pt.d.date}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredSnapIdx(i)}
                        onMouseLeave={() => setHoveredSnapIdx(null)}
                      >
                        {isHovered && (
                          <line
                            x1={pt.x}
                            y1={svgChart.padTop}
                            x2={pt.x}
                            y2={svgChart.padTop + svgChart.innerH}
                            stroke="#475569"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                          />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 5.5 : 3.5}
                          fill="#0f172a"
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                        />
                        {/* X-axis Date Label */}
                        <text
                          x={pt.x}
                          y={svgChart.height - 10}
                          textAnchor="middle"
                          className={`text-[10px] font-mono ${
                            isHovered ? 'fill-sky-400 font-semibold' : 'fill-slate-400'
                          }`}
                        >
                          {pt.d.date.slice(5)}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Chart Legend */}
                <div className="flex flex-wrap items-center justify-between gap-4 mt-2 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                  <div className="flex items-center gap-5">
                    <span className="inline-flex items-center gap-2 text-slate-200 font-medium">
                      <span className="w-3 h-0.5 bg-sky-400 inline-block" />
                      Total Portfolio
                    </span>
                    {chartMode === 'indexed' && (
                      <>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-3 h-0.5 bg-emerald-400 inline-block" />
                          QQQ (Nasdaq-100)
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-3 h-0.5 bg-indigo-400 inline-block border-b border-dashed" />
                          S&amp;P 500
                        </span>
                      </>
                    )}
                  </div>
                  <span className="font-mono tabular-nums text-[11px] text-slate-400">
                    US Equity Sleeve:{' '}
                    <PrivateMoney
                      value={`$${activeSnap?.usEquityUsd.toLocaleString('en-US')}`}
                      currency="USD"
                      privacyMode={privacyMode}
                    />{' '}
                    · US Cash:{' '}
                    <PrivateMoney
                      value={`$${activeSnap?.cashUsd.toLocaleString('en-US')}`}
                      currency="USD"
                      privacyMode={privacyMode}
                    />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Governance Callout */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Portfolio Mandate: <strong className="text-slate-200">{data.retirement.statusNote}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('holdings')}
              className="text-sky-400 hover:underline font-medium cursor-pointer"
            >
              Inspect All {data.holdings.length} Holdings →
            </button>
          </div>
        </div>
      </div>

      {/* Portfolio Rebalancing & Capital Deployment Calculator */}
      <RebalancingCalculatorPanel
        data={data}
        currency={currency}
        privacyMode={privacyMode}
        highlighted={highlightRebalancing}
        searchQuery={rebalanceSearchQuery}
        onSearchQueryChange={onRebalanceSearchChange}
      />
    </div>
  );
};
