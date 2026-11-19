import React, { useState, useMemo } from 'react';
import {
  Compass,
  Flag,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  TrendingUp,
  Layers
} from 'lucide-react';
import { PortfolioData, CurrencyCode } from '../../types/portfolio';
import { formatPortfolioValue } from '../../services/portfolioService';
import { PrivateMoney } from './PrivateMoney';

interface RetirementRoadmapTabProps {
  data: PortfolioData;
  currency: CurrencyCode;
  privacyMode?: boolean;
}

export const RetirementRoadmapTab: React.FC<RetirementRoadmapTabProps> = ({
  data,
  currency,
  privacyMode = false
}) => {
  const { retirement, summary, allocation, meta } = data;
  const usdInr = meta.usdInr || 95.41;

  // Interactive Compounding Simulator Controls
  const [monthlySipInr, setMonthlySipInr] = useState<number>(85000);
  const [quarterlyLrsUsd, setQuarterlyLrsUsd] = useState<number>(2000);
  const [assumedCagrPct, setAssumedCagrPct] = useState<number>(14.5);
  const [annualStepUpPct, setAnnualStepUpPct] = useState<number>(8.0);

  // Calculate actual Growth vs Compounder vs Liquid from allocation
  const actualMix = useMemo(() => {
    const indianEq =
      allocation.find((a) => a.category.toLowerCase().includes('indian'))?.pct ?? 38.1;
    const usEq =
      allocation.find((a) => a.category.toLowerCase().includes('us'))?.pct ?? 30.5;
    const mf =
      allocation.find((a) => a.category.toLowerCase().includes('mutual'))?.pct ?? 24.7;
    const cash =
      allocation.find((a) => a.category.toLowerCase().includes('cash'))?.pct ?? 6.6;

    const currentGrowthPct = Number((indianEq + usEq).toFixed(1));
    const targetGrowthPct = retirement.growthAllocationPct || 65.0;
    const driftPct = Number((currentGrowthPct - targetGrowthPct).toFixed(1));

    return {
      indianEq,
      usEq,
      mf,
      cash,
      currentGrowthPct,
      targetGrowthPct,
      driftPct
    };
  }, [allocation, retirement.growthAllocationPct]);

  // Simulate Year-by-Year Corpus Trajectory & Milestone Crossings
  const projection = useMemo(() => {
    const startCorpus = summary.totalValueInr || 4850000;
    const targetCorpus = retirement.targetCorpusInr || 50000000;
    const currentYear = 2026;

    let balance = startCorpus;
    let annualInflowInr = monthlySipInr * 12 + quarterlyLrsUsd * 4 * usdInr;
    const r = assumedCagrPct / 100;
    const stepUp = annualStepUpPct / 100;

    const trajectory: {
      year: number;
      ageOffset: number;
      startBalanceInr: number;
      annualContributionInr: number;
      endBalanceInr: number;
      progressPct: number;
    }[] = [];

    for (let yr = 1; yr <= 20; yr++) {
      const startB = balance;
      const endB = (startB + annualInflowInr / 2) * (1 + r) + annualInflowInr / 2;
      const pct = Math.min(100, (endB / targetCorpus) * 100);

      trajectory.push({
        year: currentYear + yr,
        ageOffset: yr,
        startBalanceInr: startB,
        annualContributionInr: annualInflowInr,
        endBalanceInr: endB,
        progressPct: pct
      });

      balance = endB;
      annualInflowInr = annualInflowInr * (1 + stepUp);
    }

    const milestones = [
      {
        title: 'Stage 1 · Foundation Reserve',
        targetInr: 5000000, // ₹50 Lakh
        role: 'Core Liquidity & Initial Global Tech Base'
      },
      {
        title: 'Stage 2 · Critical Compounding Mass',
        targetInr: 10000000, // ₹1.0 Crore
        role: 'Portfolio Returns Exceed Annual Fresh Contributions'
      },
      {
        title: 'Stage 3 · Coast FI Inflection',
        targetInr: 25000000, // ₹2.5 Crore
        role: '50% Target Corpus — Optionality & Downside Buffer'
      },
      {
        title: 'Stage 4 · Full Sovereignty Target Corpus',
        targetInr: targetCorpus, // ₹5.0 Crore
        role: 'Complete Financial Independence Target'
      }
    ].map((m) => {
      if (startCorpus >= m.targetInr) {
        return { ...m, achieved: true, estYear: currentYear, yearsAway: 0 };
      }
      const hit = trajectory.find((t) => t.endBalanceInr >= m.targetInr);
      return {
        ...m,
        achieved: false,
        estYear: hit ? hit.year : currentYear + 20,
        yearsAway: hit ? hit.ageOffset : 20
      };
    });

    return { trajectory, milestones };
  }, [
    summary.totalValueInr,
    retirement.targetCorpusInr,
    monthlySipInr,
    quarterlyLrsUsd,
    assumedCagrPct,
    annualStepUpPct,
    usdInr
  ]);

  const remainingCorpusInr = Math.max(0, retirement.targetCorpusInr - summary.totalValueInr);

  return (
    <div className="space-y-6">
      {/* Top Row: Corpus Progress Tracker & Target Asset-Mix Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Long-Term Corpus Progress Card (7 cols) */}
        <div className="lg:col-span-7 bg-[#0f172a] border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Compass className="w-4 h-4 text-sky-400" />
                <span>Long-Term Retirement Corpus Tracker</span>
              </h2>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Trajectory On Track</span>
              </span>
            </div>
            <p className="text-xs text-slate-400">{retirement.statusNote}</p>

            {/* Primary Corpus Numbers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-5 p-4 rounded-xl bg-[#0b1120] border border-slate-800/90 font-mono tabular-nums">
              <div>
                <span className="text-[11px] text-slate-400 block font-sans">
                  Current Accumulated Corpus
                </span>
                <span className="text-xl font-bold text-sky-400">
                  <PrivateMoney
                    value={formatPortfolioValue(summary.totalValueInr, currency, usdInr)}
                    currency={currency}
                    privacyMode={privacyMode}
                  />
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  <PrivateMoney
                    value={formatPortfolioValue(summary.totalValueInr, currency, usdInr, {
                      compact: true
                    })}
                    currency={currency}
                    privacyMode={privacyMode}
                  />
                </span>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block font-sans">
                  Target Retirement Corpus
                </span>
                <span className="text-xl font-bold text-slate-100">
                  <PrivateMoney
                    value={formatPortfolioValue(retirement.targetCorpusInr, currency, usdInr, {
                      compact: true
                    })}
                    currency={currency}
                    privacyMode={privacyMode}
                  />
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  <PrivateMoney
                    value={formatPortfolioValue(retirement.targetCorpusInr, currency, usdInr)}
                    currency={currency}
                    privacyMode={privacyMode}
                  />
                </span>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block font-sans">
                  Remaining Funding Gap
                </span>
                <span className="text-xl font-bold text-slate-300">
                  <PrivateMoney
                    value={formatPortfolioValue(remainingCorpusInr, currency, usdInr, {
                      compact: true
                    })}
                    currency={currency}
                    privacyMode={privacyMode}
                  />
                </span>
                <span className="text-[11px] text-emerald-400 block mt-0.5">
                  {retirement.currentProgressPct.toFixed(1)}% Completed
                </span>
              </div>
            </div>

            {/* Visual Progress Bar with Milestone Ticks */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                <span className="text-slate-300 font-semibold">
                  Corpus Completion: {retirement.currentProgressPct.toFixed(1)}%
                </span>
                <span className="text-slate-400">
                  Target:{' '}
                  <PrivateMoney
                    value={formatPortfolioValue(retirement.targetCorpusInr, currency, usdInr, {
                      compact: true
                    })}
                    currency={currency}
                    privacyMode={privacyMode}
                  />
                </span>
              </div>
              <div className="relative w-full h-3.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(3, Math.min(100, retirement.currentProgressPct))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-500 pt-1">
                <span>0%</span>
                <span>{privacyMode ? '10%' : '10% (₹50L)'}</span>
                <span>{privacyMode ? '20%' : '20% (₹1Cr)'}</span>
                <span>{privacyMode ? '50%' : '50% (₹2.5Cr)'}</span>
                <span>{privacyMode ? '100%' : '100% (₹5Cr)'}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>Dual-Currency Strategy: INR Domestic Compounders + USD Global AI/Tech</span>
            </span>
            <span className="font-mono tabular-nums text-slate-300">
              USD/INR Reference: ₹{usdInr.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Target Asset-Mix Gauge Card (5 cols) */}
        <div className="lg:col-span-5 bg-[#0f172a] border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Target Asset-Mix &amp; Growth Gauge</span>
              </h2>
              <span className="text-xs font-mono tabular-nums text-indigo-400 font-semibold">
                Target: {actualMix.targetGrowthPct.toFixed(1)}% Growth
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Monitors direct equity growth exposure (Indian + US Equities) against target policy benchmark.
            </p>

            {/* Semi-Circular SVG Gauge */}
            <div className="flex flex-col items-center justify-center my-2">
              <svg viewBox="0 0 220 125" className="w-56 h-auto">
                {/* Background Arc */}
                <path
                  d="M 20 105 A 90 90 0 0 1 200 105"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="18"
                  strokeLinecap="round"
                />
                {/* Target Growth Arc */}
                <path
                  d="M 20 105 A 90 90 0 0 1 200 105"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeDasharray={`${(actualMix.currentGrowthPct / 100) * 283} 283`}
                />
                <text
                  x="110"
                  y="82"
                  textAnchor="middle"
                  className="fill-slate-100 text-2xl font-bold font-mono"
                >
                  {actualMix.currentGrowthPct.toFixed(1)}%
                </text>
                <text
                  x="110"
                  y="102"
                  textAnchor="middle"
                  className="fill-slate-400 text-[11px] font-sans"
                >
                  Direct Equity Growth vs {actualMix.targetGrowthPct.toFixed(0)}% Target
                </text>
              </svg>
            </div>

            {/* Policy vs Actual Breakdown */}
            <div className="space-y-2.5 mt-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0b1120] border border-slate-800/80">
                <span className="text-slate-300">Direct Growth Equities (IN + US)</span>
                <span className="font-mono tabular-nums font-semibold text-sky-400">
                  {actualMix.currentGrowthPct.toFixed(1)}% (Target {actualMix.targetGrowthPct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0b1120] border border-slate-800/80">
                <span className="text-slate-300">Diversified Mutual Fund Compounders</span>
                <span className="font-mono tabular-nums font-semibold text-indigo-400">
                  {actualMix.mf.toFixed(1)}% (Target 25.0%)
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0b1120] border border-slate-800/80">
                <span className="text-slate-300">Dry Powder / Tactical Cash Buffer</span>
                <span className="font-mono tabular-nums font-semibold text-amber-400">
                  {actualMix.cash.toFixed(1)}% (Target 10.0%)
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
            <span>Growth Policy Drift:</span>
            <span className="text-emerald-400 font-semibold">
              {actualMix.driftPct >= 0 ? '+' : ''}
              {actualMix.driftPct.toFixed(1)}% (Within ±5% Band)
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Capital Deployment Milestones & Interactive Compounding Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Capital Deployment Milestones (6 cols) */}
        <div className="lg:col-span-6 bg-[#0f172a] border border-slate-800 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Flag className="w-4 h-4 text-emerald-400" />
              <span>Capital Deployment &amp; Corpus Milestones</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Projected timeline to each wealth inflection checkpoint under your active contribution cadence.
            </p>
          </div>

          <div className="space-y-3">
            {projection.milestones.map((ms, idx) => {
              const pctOfMilestone = Math.min(100, (summary.totalValueInr / ms.targetInr) * 100);
              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-[#0b1120] border border-slate-800/90 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-100">{ms.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{ms.role}</div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-sm font-bold text-sky-400">
                        <PrivateMoney
                          value={formatPortfolioValue(ms.targetInr, currency, usdInr, {
                            compact: true
                          })}
                          currency={currency}
                          privacyMode={privacyMode}
                        />
                      </div>
                      <div className="text-[11px] text-emerald-400">
                        {ms.achieved
                          ? 'Achieved'
                          : `Est. ${ms.estYear} (${ms.yearsAway} yr${ms.yearsAway === 1 ? '' : 's'})`}
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${pctOfMilestone}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400">
                    <span>Current Fill: {pctOfMilestone.toFixed(1)}%</span>
                    <span>
                      Target:{' '}
                      <PrivateMoney
                        value={formatPortfolioValue(ms.targetInr, currency, usdInr)}
                        currency={currency}
                        privacyMode={privacyMode}
                      />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Interactive SIP + LRS Compounding Simulator (6 cols) */}
        <div className="lg:col-span-6 bg-[#0f172a] border border-slate-800 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              <span>Interactive SIP &amp; LRS Roadmap Simulator</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Stress-test how monthly domestic SIPs and quarterly US LRS remittances accelerate target corpus completion.
            </p>
          </div>

          {/* Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[#0b1120] border border-slate-800/90 text-xs">
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-slate-300 font-medium">Monthly India SIP (₹)</label>
                <span className="font-mono tabular-nums text-sky-400 font-semibold">
                  <PrivateMoney
                    value={`₹${monthlySipInr.toLocaleString('en-IN')}`}
                    currency="INR"
                    privacyMode={privacyMode}
                  />
                </span>
              </div>
              <input
                type="range"
                min={25000}
                max={300000}
                step={5000}
                value={monthlySipInr}
                onChange={(e) => setMonthlySipInr(Number(e.target.value))}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-slate-300 font-medium">Quarterly US LRS ($)</label>
                <span className="font-mono tabular-nums text-indigo-400 font-semibold">
                  <PrivateMoney
                    value={`$${quarterlyLrsUsd.toLocaleString('en-US')}`}
                    currency="USD"
                    privacyMode={privacyMode}
                  />
                </span>
              </div>
              <input
                type="range"
                min={500}
                max={10000}
                step={250}
                value={quarterlyLrsUsd}
                onChange={(e) => setQuarterlyLrsUsd(Number(e.target.value))}
                className="w-full accent-indigo-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-slate-300 font-medium">Expected Portfolio CAGR</label>
                <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                  {assumedCagrPct.toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={8}
                max={22}
                step={0.5}
                value={assumedCagrPct}
                onChange={(e) => setAssumedCagrPct(Number(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-slate-300 font-medium">Annual Step-Up Rate</label>
                <span className="font-mono tabular-nums text-amber-400 font-semibold">
                  {annualStepUpPct.toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={15}
                step={1}
                value={annualStepUpPct}
                onChange={(e) => setAnnualStepUpPct(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>

          {/* 5-Year & 10-Year Projection Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                  <th className="py-2 font-medium">Horizon Year</th>
                  <th className="py-2 font-medium text-right">Annual Inflow</th>
                  <th className="py-2 font-medium text-right">Projected Corpus</th>
                  <th className="py-2 font-medium text-right">Target Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                {projection.trajectory
                  .filter((_, idx) => [0, 2, 4, 7, 9, 11, 14].includes(idx))
                  .map((row) => (
                    <tr key={row.year} className="hover:bg-[#1e293b]/40">
                      <td className="py-2.5 text-slate-200 font-semibold">
                        {row.year} <span className="text-slate-500 font-normal">(+{row.ageOffset}Y)</span>
                      </td>
                      <td className="py-2.5 text-right text-slate-300">
                        <PrivateMoney
                          value={formatPortfolioValue(row.annualContributionInr, currency, usdInr, {
                            compact: true
                          })}
                          currency={currency}
                          privacyMode={privacyMode}
                        />
                      </td>
                      <td className="py-2.5 text-right font-bold text-sky-400">
                        <PrivateMoney
                          value={formatPortfolioValue(row.endBalanceInr, currency, usdInr, {
                            compact: true
                          })}
                          currency={currency}
                          privacyMode={privacyMode}
                        />
                      </td>
                      <td className="py-2.5 text-right text-emerald-400 font-semibold">
                        {row.progressPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
