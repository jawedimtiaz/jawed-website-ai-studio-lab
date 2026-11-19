import React, { useState, useMemo, useEffect } from 'react';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Copy,
  Check
} from 'lucide-react';
import { PortfolioData, CurrencyCode } from '../../types/portfolio';
import { formatPortfolioValue } from '../../services/portfolioService';
import { PrivateMoney } from './PrivateMoney';

export interface RebalanceSleeveConfig {
  key: 'indianEquities' | 'mutualFunds' | 'usEquities' | 'cashLiquid';
  label: string;
  defaultRole: string;
  defaultTargetPct: number;
  dotClass: string;
  accentClass: string;
  matchKeywords: string[];
}

export const REBALANCE_SLEEVES: RebalanceSleeveConfig[] = [
  {
    key: 'indianEquities',
    label: 'Indian Equities',
    defaultRole: 'Core Growth',
    defaultTargetPct: 35,
    dotClass: 'bg-sky-400',
    accentClass: 'accent-sky-400',
    matchKeywords: ['indian', 'india', 'domestic']
  },
  {
    key: 'mutualFunds',
    label: 'Mutual Funds',
    defaultRole: 'Compounder',
    defaultTargetPct: 25,
    dotClass: 'bg-indigo-500',
    accentClass: 'accent-indigo-400',
    matchKeywords: ['mutual', 'mf', 'fund', 'index']
  },
  {
    key: 'usEquities',
    label: 'US Equities',
    defaultRole: 'Global Tech',
    defaultTargetPct: 30,
    dotClass: 'bg-emerald-500',
    accentClass: 'accent-emerald-400',
    matchKeywords: ['us ', 'u.s.', 'global', 'international', 'us equities']
  },
  {
    key: 'cashLiquid',
    label: 'Cash & Liquid',
    defaultRole: 'Dry Powder',
    defaultTargetPct: 10,
    dotClass: 'bg-amber-500',
    accentClass: 'accent-amber-400',
    matchKeywords: ['cash', 'liquid', 'debt', 'money market']
  }
];

export type TargetWeightsMap = Record<RebalanceSleeveConfig['key'], number>;

export const DEFAULT_TARGET_WEIGHTS: TargetWeightsMap = {
  indianEquities: 35,
  mutualFunds: 25,
  usEquities: 30,
  cashLiquid: 10
};

export const STORAGE_KEY_REBALANCE_TARGETS = 'jawed_portfolio_rebalance_targets';

function readSavedTargetWeights(): TargetWeightsMap {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_TARGET_WEIGHTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REBALANCE_TARGETS);
    if (!raw) return { ...DEFAULT_TARGET_WEIGHTS };
    const parsed = JSON.parse(raw);
    const next: TargetWeightsMap = { ...DEFAULT_TARGET_WEIGHTS };
    for (const sleeve of REBALANCE_SLEEVES) {
      const val = Number(parsed?.[sleeve.key]);
      if (Number.isFinite(val) && val >= 0 && val <= 100) {
        next[sleeve.key] = val;
      }
    }
    return next;
  } catch {
    return { ...DEFAULT_TARGET_WEIGHTS };
  }
}

export type RebalanceStrategyMode = 'full' | 'cash-only';

export interface RebalanceRowResult {
  key: RebalanceSleeveConfig['key'];
  label: string;
  role: string;
  dotClass: string;
  currentValueInr: number;
  currentPct: number;
  targetPct: number;
  driftPct: number;
  targetValueInr: number;
  postActionPct: number;
  actionAmountInr: number;
  actionType: 'buy' | 'trim' | 'hold';
}

export function computeRebalancePlan(
  data: PortfolioData,
  targets: TargetWeightsMap,
  freshCapitalInr: number,
  strategyMode: RebalanceStrategyMode = 'full'
): {
  rows: RebalanceRowResult[];
  currentTotalInr: number;
  projectedTotalInr: number;
  targetSum: number;
  isValidSum: boolean;
  totalBuyInr: number;
  totalTrimInr: number;
} {
  const safeFreshInr = Math.max(0, Number.isFinite(freshCapitalInr) ? freshCapitalInr : 0);
  const usedAllocationIndices = new Set<number>();

  const matchedSleeves = REBALANCE_SLEEVES.map((sleeve) => {
    const matchIdx = data.allocation.findIndex((item, idx) => {
      if (usedAllocationIndices.has(idx)) return false;
      const lower = item.category.toLowerCase();
      return sleeve.matchKeywords.some((kw) => lower.includes(kw));
    });

    if (matchIdx >= 0) {
      usedAllocationIndices.add(matchIdx);
      const found = data.allocation[matchIdx];
      return {
        sleeve,
        role: found.role || sleeve.defaultRole,
        currentValueInr: Math.max(0, found.valueInr || 0)
      };
    }

    return {
      sleeve,
      role: sleeve.defaultRole,
      currentValueInr: 0
    };
  });

  const sumMatchedInr = matchedSleeves.reduce((sum, item) => sum + item.currentValueInr, 0);
  const currentTotalInr = sumMatchedInr > 0 ? sumMatchedInr : Math.max(0, data.summary.totalValueInr || 0);
  const projectedTotalInr = currentTotalInr + safeFreshInr;

  const targetSum = Number(
    REBALANCE_SLEEVES.reduce((sum, s) => sum + (Number(targets[s.key]) || 0), 0).toFixed(1)
  );
  const isValidSum = Math.abs(targetSum - 100) < 0.05;

  const baseRows = matchedSleeves.map(({ sleeve, role, currentValueInr }) => {
    const currentPct = currentTotalInr > 0 ? (currentValueInr / currentTotalInr) * 100 : 0;
    const targetPct = Math.max(0, Math.min(100, Number(targets[sleeve.key]) || 0));
    const driftPct = currentPct - targetPct;
    const targetValueInr = projectedTotalInr * (targetPct / 100);
    const fullDeltaInr = targetValueInr - currentValueInr;

    return {
      sleeve,
      role,
      currentValueInr,
      currentPct,
      targetPct,
      driftPct,
      targetValueInr,
      fullDeltaInr
    };
  });

  const positiveShortfallSum = baseRows.reduce(
    (sum, r) => sum + (r.fullDeltaInr > 0 ? r.fullDeltaInr : 0),
    0
  );

  const rows: RebalanceRowResult[] = baseRows.map((item) => {
    let actionAmountInr = item.fullDeltaInr;

    if (strategyMode === 'cash-only') {
      if (safeFreshInr <= 0) {
        actionAmountInr = 0;
      } else if (positiveShortfallSum > 0) {
        actionAmountInr =
          item.fullDeltaInr > 0 ? (item.fullDeltaInr / positiveShortfallSum) * safeFreshInr : 0;
      } else {
        // Fallback: allocate fresh cash by target weights if no sleeve has positive shortfall
        const denom = targetSum > 0 ? targetSum : 100;
        actionAmountInr = safeFreshInr * (item.targetPct / denom);
      }
    }

    let actionType: 'buy' | 'trim' | 'hold' = 'hold';
    if (actionAmountInr >= 100) actionType = 'buy';
    else if (actionAmountInr <= -100) actionType = 'trim';

    const postActionValueInr = Math.max(0, item.currentValueInr + actionAmountInr);
    const postActionPct =
      projectedTotalInr > 0 ? (postActionValueInr / projectedTotalInr) * 100 : item.targetPct;

    return {
      key: item.sleeve.key,
      label: item.sleeve.label,
      role: item.role,
      dotClass: item.sleeve.dotClass,
      currentValueInr: item.currentValueInr,
      currentPct: item.currentPct,
      targetPct: item.targetPct,
      driftPct: item.driftPct,
      targetValueInr: item.targetValueInr,
      postActionPct,
      actionAmountInr,
      actionType
    };
  });

  const totalBuyInr = rows.reduce((sum, r) => sum + (r.actionAmountInr > 0 ? r.actionAmountInr : 0), 0);
  const totalTrimInr = rows.reduce((sum, r) => sum + (r.actionAmountInr < 0 ? Math.abs(r.actionAmountInr) : 0), 0);

  return {
    rows,
    currentTotalInr,
    projectedTotalInr,
    targetSum,
    isValidSum,
    totalBuyInr,
    totalTrimInr
  };
}

interface RebalancingCalculatorPanelProps {
  data: PortfolioData;
  currency: CurrencyCode;
  privacyMode?: boolean;
  highlighted?: boolean;
}

const TARGET_PRESETS: { label: string; weights: TargetWeightsMap }[] = [
  { label: 'Balanced (35/25/30/10)', weights: { indianEquities: 35, mutualFunds: 25, usEquities: 30, cashLiquid: 10 } },
  { label: 'Growth (40/20/35/5)', weights: { indianEquities: 40, mutualFunds: 20, usEquities: 35, cashLiquid: 5 } },
  { label: 'Defensive (25/35/20/20)', weights: { indianEquities: 25, mutualFunds: 35, usEquities: 20, cashLiquid: 20 } }
];

export const RebalancingCalculatorPanel: React.FC<RebalancingCalculatorPanelProps> = ({
  data,
  currency,
  privacyMode = false,
  highlighted = false
}) => {
  const [targets, setTargets] = useState<TargetWeightsMap>(readSavedTargetWeights);
  const [freshCapitalInput, setFreshCapitalInput] = useState<string>('0');
  const [strategyMode, setStrategyMode] = useState<RebalanceStrategyMode>('full');
  const [copiedPlan, setCopiedPlan] = useState<boolean>(false);

  const usdInr = data.meta.usdInr || 95.41;

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_REBALANCE_TARGETS, JSON.stringify(targets));
      } catch {
        // Ignore storage quota / private mode errors
      }
    }
  }, [targets]);

  const parsedFreshAmount = useMemo(() => {
    const cleaned = Number(String(freshCapitalInput).replace(/,/g, ''));
    return Number.isFinite(cleaned) && cleaned > 0 ? cleaned : 0;
  }, [freshCapitalInput]);

  const freshCapitalInr = currency === 'USD' ? parsedFreshAmount * usdInr : parsedFreshAmount;

  const plan = useMemo(
    () => computeRebalancePlan(data, targets, freshCapitalInr, strategyMode),
    [data, targets, freshCapitalInr, strategyMode]
  );

  const handleWeightChange = (key: RebalanceSleeveConfig['key'], rawValue: number) => {
    const clamped = Math.max(0, Math.min(100, Number.isFinite(rawValue) ? rawValue : 0));
    setTargets((prev) => ({
      ...prev,
      [key]: Math.round(clamped * 10) / 10
    }));
  };

  const handleResetDefaults = () => {
    setTargets({ ...DEFAULT_TARGET_WEIGHTS });
    setFreshCapitalInput('0');
  };

  const handleNormalizeTo100 = () => {
    const sum = REBALANCE_SLEEVES.reduce((acc, s) => acc + (targets[s.key] || 0), 0);
    if (sum <= 0) {
      setTargets({ ...DEFAULT_TARGET_WEIGHTS });
      return;
    }
    const scaled = REBALANCE_SLEEVES.map((s) => ({
      key: s.key,
      val: Math.round(((targets[s.key] / sum) * 100) * 10) / 10
    }));
    const roundedSum = scaled.reduce((acc, item) => acc + item.val, 0);
    const diff = Math.round((100 - roundedSum) * 10) / 10;
    scaled[0].val = Math.max(0, Math.round((scaled[0].val + diff) * 10) / 10);

    const next = { ...DEFAULT_TARGET_WEIGHTS };
    for (const item of scaled) {
      next[item.key] = item.val;
    }
    setTargets(next);
  };

  const handleCopyExecutionPlan = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    const modeLabel = strategyMode === 'full' ? 'Buy & Trim (Full Rebalance)' : 'Cash-Only (No Sell)';
    const lines = [
      `Portfolio Rebalancing & Capital Deployment (${modeLabel})`,
      `Target Sum: ${plan.targetSum.toFixed(1)}% | Currency: ${currency}`,
      ...plan.rows.map((row) => {
        const actionStr =
          row.actionType === 'buy'
            ? `BUY ${privacyMode ? '[HIDDEN]' : `+${formatPortfolioValue(row.actionAmountInr, currency, usdInr)}`}`
            : row.actionType === 'trim'
            ? `TRIM ${privacyMode ? '[HIDDEN]' : `-${formatPortfolioValue(Math.abs(row.actionAmountInr), currency, usdInr)}`}`
            : 'HOLD';
        return `- ${row.label}: Current ${row.currentPct.toFixed(1)}% -> Target ${row.targetPct.toFixed(1)}% (Drift ${row.driftPct > 0 ? '+' : ''}${row.driftPct.toFixed(1)}%) | ${actionStr} (Post: ${row.postActionPct.toFixed(1)}%)`;
      })
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedPlan(true);
      window.setTimeout(() => setCopiedPlan(false), 2000);
    }).catch(() => {});
  };

  const deltaFrom100 = Number((plan.targetSum - 100).toFixed(1));
  const quickPresets =
    currency === 'USD'
      ? [
          { label: '$0', value: '0' },
          { label: '+$2.5K', value: '2500' },
          { label: '+$5K', value: '5000' },
          { label: '+$10K', value: '10000' }
        ]
      : [
          { label: '₹0', value: '0' },
          { label: '+₹1L', value: '100000' },
          { label: '+₹2.5L', value: '250000' },
          { label: '+₹5L', value: '500000' }
        ];

  return (
    <section
      id="portfolio-rebalancing-panel"
      data-testid="rebalancing-calculator-panel"
      aria-label="Portfolio Rebalancing and Capital Deployment Calculator"
      className={`scroll-mt-24 bg-[#0f172a] border rounded-xl p-6 space-y-5 transition-all duration-300 ${
        highlighted
          ? 'border-sky-400 ring-2 ring-sky-400/40 shadow-lg shadow-sky-500/10'
          : 'border-slate-800'
      }`}
    >
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2 m-0">
            <Scale className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Portfolio Rebalancing &amp; Capital Deployment</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 mb-0">
            Configure target allocation weights and optional fresh capital to calculate exact Buy / Trim orders from current portfolio drift.
          </p>
        </div>

        {/* Live Target Sum Validation Indicator + Reset */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            data-testid="rebalance-weight-validation"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono tabular-nums font-semibold ${
              plan.isValidSum
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/35 text-amber-300'
            }`}
          >
            {plan.isValidSum ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Target Sum: 100.0% (Valid)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Target Sum: {plan.targetSum.toFixed(1)}% ({deltaFrom100 > 0 ? `+${deltaFrom100.toFixed(1)}%` : `${deltaFrom100.toFixed(1)}%`})
                </span>
              </>
            )}
          </div>

          {!plan.isValidSum && (
            <button
              type="button"
              onClick={handleNormalizeTo100}
              data-testid="rebalance-normalize-btn"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-medium transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Normalize to 100%</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyExecutionPlan}
            data-testid="rebalance-copy-btn"
            title={
              privacyMode
                ? 'Copy Rebalance Plan (monetary amounts redacted while Privacy Blur is active)'
                : 'Copy actionable Buy / Trim execution summary to clipboard'
            }
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0b1120] hover:bg-[#1e293b] text-slate-300 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
          >
            {copiedPlan ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-sky-400" />
                <span>Copy Plan</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleResetDefaults}
            data-testid="rebalance-reset-btn"
            title="Reset target weights to 35% / 25% / 30% / 10% and fresh capital to 0"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0b1120] hover:bg-[#1e293b] text-slate-300 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset 35/25/30/10</span>
          </button>
        </div>
      </div>

      {/* Controls Grid: Editable Target Sliders + Fresh Capital Input */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 8 cols: 4 Sleeve Target Controls + Quick Policy Presets */}
        <div className="lg:col-span-8 p-4 rounded-xl bg-[#0b1120] border border-slate-800/90 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400">
              Editable Target Allocation Sliders (persisted locally)
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {TARGET_PRESETS.map((preset) => {
                const isMatch = REBALANCE_SLEEVES.every(
                  (s) => Math.abs((targets[s.key] || 0) - preset.weights[s.key]) < 0.05
                );
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setTargets({ ...preset.weights })}
                    className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-colors cursor-pointer ${
                      isMatch
                        ? 'bg-sky-500/15 text-sky-300 border-sky-500/40 font-semibold'
                        : 'bg-[#0f172a] text-slate-400 hover:text-slate-200 border-slate-800'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {REBALANCE_SLEEVES.map((sleeve) => {
              const val = targets[sleeve.key];
              const rowData = plan.rows.find((r) => r.key === sleeve.key);
              const currentPct = rowData ? rowData.currentPct : 0;
              return (
                <div
                  key={sleeve.key}
                  className="p-3 rounded-lg bg-[#0f172a] border border-slate-800/80 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`rebalance-input-${sleeve.key}`}
                      className="text-xs font-medium text-slate-200 flex items-center gap-2"
                    >
                      <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${sleeve.dotClass}`} />
                      <span>{sleeve.label}</span>
                    </label>

                    <div className="flex items-center gap-1">
                      <input
                        id={`rebalance-input-${sleeve.key}`}
                        data-testid={`rebalance-target-input-${sleeve.key}`}
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={val}
                        onChange={(e) => handleWeightChange(sleeve.key, Number(e.target.value))}
                        aria-label={`${sleeve.label} Target Allocation Percentage`}
                        className="w-16 px-2 py-1 bg-[#0b1120] border border-slate-700 rounded text-right text-xs font-mono tabular-nums text-sky-400 font-semibold focus:outline-none focus:border-sky-500"
                      />
                      <span className="text-xs font-mono text-slate-400">%</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={val}
                    onChange={(e) => handleWeightChange(sleeve.key, Number(e.target.value))}
                    aria-label={`${sleeve.label} Target Allocation Slider`}
                    className={`w-full ${sleeve.accentClass} cursor-pointer`}
                  />

                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500">
                    <span>Current: {currentPct.toFixed(1)}%</span>
                    <span>
                      Drift:{' '}
                      <strong
                        className={
                          currentPct - val > 0.05
                            ? 'text-amber-400'
                            : currentPct - val < -0.05
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                        }
                      >
                        {currentPct - val > 0 ? '+' : ''}
                        {(currentPct - val).toFixed(1)}%
                      </strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 4 cols: Fresh Capital to Deploy Input + Projected Total */}
        <div className="lg:col-span-4 p-4 rounded-xl bg-[#0b1120] border border-slate-800/90 flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <label
              htmlFor="rebalance-fresh-capital"
              className="block text-xs font-semibold text-slate-200"
            >
              Fresh Capital to Deploy ({currency === 'USD' ? '$' : '₹'})
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-400 pointer-events-none">
                {currency === 'USD' ? '$' : '₹'}
              </span>
              <input
                id="rebalance-fresh-capital"
                data-testid="rebalance-fresh-capital-input"
                type="number"
                min={0}
                step={currency === 'USD' ? 250 : 10000}
                value={freshCapitalInput}
                onChange={(e) => setFreshCapitalInput(e.target.value)}
                placeholder="0"
                className="w-full pl-7 pr-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {quickPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setFreshCapitalInput(preset.value)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-colors cursor-pointer ${
                    freshCapitalInput === preset.value
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 font-semibold'
                      : 'bg-[#0f172a] text-slate-400 hover:text-slate-200 border-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {/* Execution Mode Switch: Full Rebalance vs. Cash-Only (No Trim) */}
            <div className="pt-1">
              <div
                className="grid grid-cols-2 gap-1 p-1 bg-[#0f172a] border border-slate-800 rounded-lg text-[11px]"
                role="group"
                aria-label="Rebalancing Execution Mode"
              >
                <button
                  type="button"
                  onClick={() => setStrategyMode('full')}
                  data-testid="rebalance-mode-full"
                  aria-pressed={strategyMode === 'full'}
                  className={`px-2 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    strategyMode === 'full'
                      ? 'bg-[#1e293b] text-sky-400 border border-slate-700 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Buy &amp; Trim
                </button>
                <button
                  type="button"
                  onClick={() => setStrategyMode('cash-only')}
                  data-testid="rebalance-mode-cash-only"
                  aria-pressed={strategyMode === 'cash-only'}
                  className={`px-2 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    strategyMode === 'cash-only'
                      ? 'bg-[#1e293b] text-emerald-400 border border-slate-700 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Cash-Only (No Sell)
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 m-0 leading-relaxed">
              {strategyMode === 'full' ? (
                <>
                  Leave at <strong className="text-slate-300">0</strong> for pure zero-cash rebalancing, or add fresh SIP / lump-sum cash to deploy alongside drift correction.
                </>
              ) : (
                <>
                  Tax-aware mode: routes fresh capital solely to underweight sleeves without trimming existing positions.
                </>
              )}
            </p>
          </div>

          <div className="pt-3 border-t border-slate-800/80 space-y-1.5 text-xs font-mono tabular-nums">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-sans">Current Portfolio:</span>
              <span className="text-slate-200 font-semibold">
                <PrivateMoney
                  value={formatPortfolioValue(plan.currentTotalInr, currency, usdInr)}
                  currency={currency}
                  privacyMode={privacyMode}
                />
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-sans">Post-Deployment Total:</span>
              <span className="text-sky-400 font-bold">
                <PrivateMoney
                  value={formatPortfolioValue(plan.projectedTotalInr, currency, usdInr)}
                  currency={currency}
                  privacyMode={privacyMode}
                />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Banner when Target Sum != 100% */}
      {!plan.isValidSum && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Target allocation weights currently sum to <strong>{plan.targetSum.toFixed(1)}%</strong> instead of 100%. Adjust the sliders or click <strong>Normalize to 100%</strong> for a balanced buy/trim plan.
            </span>
          </div>
        </div>
      )}

      {/* Actionable Rebalancing Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800/90 bg-[#0b1120]/60">
        <table className="w-full text-left border-collapse" data-testid="rebalance-results-table">
          <thead>
            <tr className="border-b border-slate-800 bg-[#0b1120] text-[11px] text-slate-400 font-medium">
              <th className="py-3 pl-4 pr-3 font-medium">Asset Sleeve</th>
              <th className="py-3 px-3 font-medium text-right">Current %</th>
              <th className="py-3 px-3 font-medium text-right">Target %</th>
              <th className="py-3 px-3 font-medium text-right">Drift (+/- %)</th>
              <th className="py-3 pl-3 pr-4 font-medium text-right">
                Actionable Buy / Trim ({currency === 'USD' ? '$' : '₹'})
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-xs">
            {plan.rows.map((row) => {
              const absAmountFormatted = formatPortfolioValue(
                Math.abs(row.actionAmountInr),
                currency,
                usdInr
              );
              const isOverweight = row.driftPct > 0.05;
              const isUnderweight = row.driftPct < -0.05;

              return (
                <tr
                  key={row.key}
                  data-testid={`rebalance-row-${row.key}`}
                  className="hover:bg-[#1e293b]/40 transition-colors"
                >
                  <td className="py-3 pl-4 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${row.dotClass}`} />
                      <div>
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="text-[11px] text-slate-400">{row.role}</div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    <div className="text-slate-200 font-semibold">{row.currentPct.toFixed(1)}%</div>
                    <div className="text-[10px] text-slate-500">
                      <PrivateMoney
                        value={formatPortfolioValue(row.currentValueInr, currency, usdInr, {
                          compact: true
                        })}
                        currency={currency}
                        privacyMode={privacyMode}
                      />
                    </div>
                  </td>

                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    <div className="text-sky-400 font-semibold">{row.targetPct.toFixed(1)}%</div>
                    <div className="text-[10px] text-slate-500">
                      <PrivateMoney
                        value={formatPortfolioValue(row.targetValueInr, currency, usdInr, {
                          compact: true
                        })}
                        currency={currency}
                        privacyMode={privacyMode}
                      />
                    </div>
                  </td>

                  <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                    <div
                      className={
                        isOverweight
                          ? 'text-amber-400'
                          : isUnderweight
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                      }
                    >
                      {row.driftPct > 0 ? '+' : ''}
                      {row.driftPct.toFixed(1)}%
                    </div>
                    <div className="mt-1 ml-auto w-16 h-1 bg-slate-800 rounded-full overflow-hidden flex">
                      <div className="w-1/2 flex justify-end">
                        {isUnderweight && (
                          <div
                            className="h-full bg-emerald-400 rounded-l-full"
                            style={{ width: `${Math.min(100, Math.abs(row.driftPct) * 5)}%` }}
                          />
                        )}
                      </div>
                      <div className="w-1/2 flex justify-start">
                        {isOverweight && (
                          <div
                            className="h-full bg-amber-400 rounded-r-full"
                            style={{ width: `${Math.min(100, Math.abs(row.driftPct) * 5)}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-3 pl-3 pr-4 text-right font-mono tabular-nums">
                    {row.actionType === 'buy' && (
                      <div className="inline-flex flex-col items-end">
                        <span className="inline-flex items-center justify-end gap-1.5 text-emerald-400 font-semibold">
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-sans text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30">
                            Buy
                          </span>
                          <PrivateMoney
                            value={`+${absAmountFormatted}`}
                            currency={currency}
                            privacyMode={privacyMode}
                          />
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5">
                          Post: {row.postActionPct.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {row.actionType === 'trim' && (
                      <div className="inline-flex flex-col items-end">
                        <span className="inline-flex items-center justify-end gap-1.5 text-rose-400 font-semibold">
                          <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-sans text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30">
                            Trim
                          </span>
                          <PrivateMoney
                            value={`-${absAmountFormatted}`}
                            currency={currency}
                            privacyMode={privacyMode}
                          />
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5">
                          Post: {row.postActionPct.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {row.actionType === 'hold' && (
                      <div className="inline-flex flex-col items-end">
                        <span className="inline-flex items-center justify-end gap-1.5 text-slate-400 font-medium">
                          <Minus className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {strategyMode === 'cash-only' && (isOverweight || isUnderweight)
                              ? 'Hold (No Sell)'
                              : 'On Target'}
                          </span>
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5">
                          Post: {row.postActionPct.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700/80 bg-[#0b1120] text-xs font-mono tabular-nums">
              <td className="py-3 pl-4 pr-3 font-sans font-semibold text-slate-300">
                Net Execution Summary
              </td>
              <td className="py-3 px-3 text-right font-semibold text-slate-200">100.0%</td>
              <td
                className={`py-3 px-3 text-right font-semibold ${
                  plan.isValidSum ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {plan.targetSum.toFixed(1)}%
              </td>
              <td className="py-3 px-3 text-right text-slate-400">—</td>
              <td className="py-3 pl-3 pr-4 text-right text-slate-200">
                <span className="text-emerald-400 font-semibold">
                  Buy{' '}
                  <PrivateMoney
                    value={formatPortfolioValue(plan.totalBuyInr, currency, usdInr, { compact: true })}
                    currency={currency}
                    privacyMode={privacyMode}
                  />
                </span>
                <span className="text-slate-600 mx-1.5">·</span>
                <span className="text-rose-400 font-semibold">
                  Trim{' '}
                  <PrivateMoney
                    value={formatPortfolioValue(plan.totalTrimInr, currency, usdInr, { compact: true })}
                    currency={currency}
                    privacyMode={privacyMode}
                  />
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
};
