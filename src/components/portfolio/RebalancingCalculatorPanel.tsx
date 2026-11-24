import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Check,
  Info,
  X,
  Search,
  Lock,
  Unlock,
  History,
  BookmarkPlus,
  Trash2,
  Clock
} from 'lucide-react';
import { PortfolioData, CurrencyCode, HoldingItem, AllocationItem } from '../../types/portfolio';
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
    matchKeywords: ['indian', 'india', 'domestic', 'nse', 'bse', 'direct equity']
  },
  {
    key: 'mutualFunds',
    label: 'Mutual Funds',
    defaultRole: 'Compounder',
    defaultTargetPct: 25,
    dotClass: 'bg-indigo-500',
    accentClass: 'accent-indigo-400',
    matchKeywords: ['mutual', 'mf', 'fund', 'index', 'etf', 'sip']
  },
  {
    key: 'usEquities',
    label: 'US Equities',
    defaultRole: 'Global Tech',
    defaultTargetPct: 30,
    dotClass: 'bg-emerald-500',
    accentClass: 'accent-emerald-400',
    matchKeywords: ['us ', 'u.s.', 'usa', 'us equity', 'us equities', 'us stock', 'global', 'international', 'nasdaq']
  },
  {
    key: 'cashLiquid',
    label: 'Cash & Liquid',
    defaultRole: 'Dry Powder',
    defaultTargetPct: 10,
    dotClass: 'bg-amber-500',
    accentClass: 'accent-amber-400',
    matchKeywords: ['cash', 'liquid', 'debt', 'money market', 'dry powder', 'reserve']
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
export const STORAGE_KEY_REBALANCE_HISTORY = 'jawed_portfolio_rebalance_history';

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

export interface RebalanceHistoryActionItem {
  key: RebalanceSleeveConfig['key'];
  label: string;
  currentPct: number;
  targetPct: number;
  actionType: 'buy' | 'trim' | 'hold';
  actionAmountInr: number;
}

export interface RebalanceHistoryEntry {
  id: string;
  timestamp: string;
  strategyMode: RebalanceStrategyMode;
  currency: CurrencyCode;
  freshCapitalInr: number;
  totalBuyInr: number;
  totalTrimInr: number;
  maxDriftPct: number;
  targetWeights: TargetWeightsMap;
  actions: RebalanceHistoryActionItem[];
  note?: string;
}

export const DEFAULT_REBALANCE_HISTORY_SEED: RebalanceHistoryEntry[] = [
  {
    id: 'hist-seed-2026-10-05',
    timestamp: '2026-10-05T09:30:00.000Z',
    strategyMode: 'cash-only',
    currency: 'INR',
    freshCapitalInr: 250000,
    totalBuyInr: 250000,
    totalTrimInr: 0,
    maxDriftPct: 3.4,
    targetWeights: { indianEquities: 35, mutualFunds: 25, usEquities: 30, cashLiquid: 10 },
    actions: [
      { key: 'usEquities', label: 'US Equities', currentPct: 28.4, targetPct: 30, actionType: 'buy', actionAmountInr: 135000 },
      { key: 'cashLiquid', label: 'Cash & Liquid', currentPct: 6.6, targetPct: 10, actionType: 'buy', actionAmountInr: 115000 },
      { key: 'indianEquities', label: 'Indian Equities', currentPct: 38.4, targetPct: 35, actionType: 'hold', actionAmountInr: 0 },
      { key: 'mutualFunds', label: 'Mutual Funds', currentPct: 26.6, targetPct: 25, actionType: 'hold', actionAmountInr: 0 }
    ],
    note: 'Monthly SIP cash-only deployment to underweight sleeves'
  },
  {
    id: 'hist-seed-2026-08-15',
    timestamp: '2026-08-15T10:15:00.000Z',
    strategyMode: 'full',
    currency: 'INR',
    freshCapitalInr: 0,
    totalBuyInr: 185000,
    totalTrimInr: 185000,
    maxDriftPct: 4.1,
    targetWeights: { indianEquities: 35, mutualFunds: 25, usEquities: 30, cashLiquid: 10 },
    actions: [
      { key: 'indianEquities', label: 'Indian Equities', currentPct: 39.1, targetPct: 35, actionType: 'trim', actionAmountInr: -185000 },
      { key: 'usEquities', label: 'US Equities', currentPct: 27.6, targetPct: 30, actionType: 'buy', actionAmountInr: 112000 },
      { key: 'cashLiquid', label: 'Cash & Liquid', currentPct: 8.3, targetPct: 10, actionType: 'buy', actionAmountInr: 73000 },
      { key: 'mutualFunds', label: 'Mutual Funds', currentPct: 25.0, targetPct: 25, actionType: 'hold', actionAmountInr: 0 }
    ],
    note: 'Quarterly portfolio drift realignment'
  }
];

export function readSavedRebalanceHistory(): RebalanceHistoryEntry[] {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_REBALANCE_HISTORY_SEED.map((entry) => ({
      ...entry,
      targetWeights: { ...entry.targetWeights },
      actions: entry.actions.map((a) => ({ ...a }))
    }));
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REBALANCE_HISTORY);
    if (raw === null) {
      return DEFAULT_REBALANCE_HISTORY_SEED.map((entry) => ({
        ...entry,
        targetWeights: { ...entry.targetWeights },
        actions: entry.actions.map((a) => ({ ...a }))
      }));
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is RebalanceHistoryEntry =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.timestamp === 'string' &&
          Array.isArray(item.actions) &&
          Boolean(item.targetWeights)
      )
      .slice(0, 50);
  } catch {
    return DEFAULT_REBALANCE_HISTORY_SEED.map((entry) => ({
      ...entry,
      targetWeights: { ...entry.targetWeights },
      actions: entry.actions.map((a) => ({ ...a }))
    }));
  }
}

export function createRebalanceHistoryEntry(
  plan: ReturnType<typeof computeRebalancePlan>,
  targets: TargetWeightsMap,
  freshCapitalInr: number,
  strategyMode: RebalanceStrategyMode,
  currency: CurrencyCode,
  note?: string,
  timestampIso?: string
): RebalanceHistoryEntry {
  const timestamp = timestampIso || new Date().toISOString();
  const maxDriftPct = Number(
    plan.rows.reduce((max, row) => Math.max(max, Math.abs(row.driftPct)), 0).toFixed(1)
  );
  const trimmedNote = note?.trim();

  return {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp,
    strategyMode,
    currency,
    freshCapitalInr: Math.max(0, Math.round(freshCapitalInr)),
    totalBuyInr: Math.round(plan.totalBuyInr),
    totalTrimInr: Math.round(plan.totalTrimInr),
    maxDriftPct,
    targetWeights: {
      indianEquities: targets.indianEquities,
      mutualFunds: targets.mutualFunds,
      usEquities: targets.usEquities,
      cashLiquid: targets.cashLiquid
    },
    actions: plan.rows.map((row) => ({
      key: row.key,
      label: row.label,
      currentPct: Number(row.currentPct.toFixed(1)),
      targetPct: Number(row.targetPct.toFixed(1)),
      actionType: row.actionType,
      actionAmountInr: Math.round(row.actionAmountInr)
    })),
    ...(trimmedNote ? { note: trimmedNote } : {})
  };
}

export function formatHistoryTimestamp(isoString: string): string {
  try {
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return isoString;
    return dt.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoString;
  }
}

export function classifyHoldingSleeve(
  holding: HoldingItem
): 'indianEquities' | 'mutualFunds' | 'usEquities' {
  const market = (holding.market || '').toUpperCase().trim();
  const sector = (holding.sector || '').toLowerCase();
  const name = (holding.name || '').toLowerCase();
  const currency = (holding.currency || '').toUpperCase().trim();

  if (
    market === 'MF' ||
    market.includes('FUND') ||
    sector.includes('mutual') ||
    sector.includes('index') ||
    sector.includes('flexi cap') ||
    name.includes('fund') ||
    name.includes('direct growth')
  ) {
    return 'mutualFunds';
  }
  if (market === 'US' || currency === 'USD') {
    return 'usEquities';
  }
  return 'indianEquities';
}

export function deriveAllocationFromHoldings(
  holdings: HoldingItem[],
  cashBalanceInr: number,
  fallbackAllocation: AllocationItem[] = []
): AllocationItem[] {
  const totals: Record<RebalanceSleeveConfig['key'], number> = {
    indianEquities: 0,
    mutualFunds: 0,
    usEquities: 0,
    cashLiquid: Math.max(0, Number(cashBalanceInr) || 0)
  };

  for (const holding of holdings || []) {
    const sleeveKey = classifyHoldingSleeve(holding);
    totals[sleeveKey] += Math.max(0, Number(holding.valueInr) || 0);
  }

  const grandTotal =
    totals.indianEquities + totals.mutualFunds + totals.usEquities + totals.cashLiquid;

  if (grandTotal <= 0 && fallbackAllocation.length > 0) {
    return fallbackAllocation;
  }

  return REBALANCE_SLEEVES.map((sleeve) => {
    const existing = fallbackAllocation.find((item) =>
      sleeve.matchKeywords.some((kw) => item.category.toLowerCase().includes(kw))
    );
    const val = totals[sleeve.key];
    return {
      category: sleeve.label,
      role: existing?.role || sleeve.defaultRole,
      valueInr: Math.round(val),
      pct: grandTotal > 0 ? Number(((val / grandTotal) * 100).toFixed(1)) : 0
    };
  });
}

export interface RebalanceRowResult {
  key: RebalanceSleeveConfig['key'];
  label: string;
  role: string;
  dotClass: string;
  holdingsCount: number;
  holdingTickers: string[];
  tickers: string[];
  currentValueInr: number;
  currentPct: number;
  targetPct: number;
  driftPct: number;
  targetValueInr: number;
  postActionPct: number;
  actionAmountInr: number;
  actionType: 'buy' | 'trim' | 'hold';
}

export function filterRebalanceRows(
  rows: RebalanceRowResult[],
  query: string
): RebalanceRowResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;

  const terms = normalized.split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    const actionLabel =
      row.actionType === 'buy'
        ? 'buy underweight add'
        : row.actionType === 'trim'
        ? 'trim sell overweight reduce'
        : 'hold on target neutral no sell';
    const haystack = [
      row.label,
      row.role,
      row.key,
      actionLabel,
      ...row.tickers
    ]
      .join(' ')
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}

export interface RebalanceValidationResult {
  isValidSum: boolean;
  targetSum: number;
  deltaFrom100: number;
  hasNegativeTarget: boolean;
  hasOver100Target: boolean;
  invalidTargetKeys: RebalanceSleeveConfig['key'][];
  isFreshCapitalValid: boolean;
  freshCapitalError: string | null;
  targetSumError: string | null;
  isAllValid: boolean;
  errors: string[];
}

export function validateRebalanceInputs(
  targets: TargetWeightsMap,
  freshCapitalRaw: string | number
): RebalanceValidationResult {
  const invalidTargetKeys: RebalanceSleeveConfig['key'][] = [];
  let hasNegativeTarget = false;
  let hasOver100Target = false;
  let rawSum = 0;

  for (const sleeve of REBALANCE_SLEEVES) {
    const val = Number(targets[sleeve.key]);
    if (!Number.isFinite(val) || val < 0) {
      hasNegativeTarget = true;
      invalidTargetKeys.push(sleeve.key);
    } else if (val > 100) {
      hasOver100Target = true;
      invalidTargetKeys.push(sleeve.key);
    }
    rawSum += Number.isFinite(val) ? val : 0;
  }

  const targetSum = Math.round(rawSum * 10) / 10;
  const deltaFrom100 = Math.round((targetSum - 100) * 10) / 10;
  const isValidSum = Math.abs(targetSum - 100) < 0.001 && !hasNegativeTarget && !hasOver100Target;

  let targetSumError: string | null = null;
  if (hasNegativeTarget) {
    targetSumError = 'Target allocation percentages cannot be negative (must be 0% to 100%).';
  } else if (hasOver100Target) {
    targetSumError = 'Individual target allocation percentages cannot exceed 100%.';
  } else if (!isValidSum) {
    targetSumError =
      deltaFrom100 > 0
        ? `Target allocations sum to ${targetSum.toFixed(1)}% (+${deltaFrom100.toFixed(1)}% over). Reduce by ${deltaFrom100.toFixed(1)}% or click Normalize to 100%.`
        : `Target allocations sum to ${targetSum.toFixed(1)}% (${deltaFrom100.toFixed(1)}% short). Add ${Math.abs(deltaFrom100).toFixed(1)}% or click Normalize to 100%.`;
  }

  const trimmedCapital = String(freshCapitalRaw ?? '').trim().replace(/,/g, '');
  let isFreshCapitalValid = true;
  let freshCapitalError: string | null = null;
  if (trimmedCapital !== '') {
    const parsed = Number(trimmedCapital);
    if (!Number.isFinite(parsed)) {
      isFreshCapitalValid = false;
      freshCapitalError = 'Fresh capital must be a valid non-negative number.';
    } else if (parsed < 0) {
      isFreshCapitalValid = false;
      freshCapitalError = 'Fresh capital cannot be negative. Enter 0 or a positive amount.';
    }
  }

  const errors: string[] = [];
  if (targetSumError) errors.push(targetSumError);
  if (freshCapitalError) errors.push(freshCapitalError);

  return {
    isValidSum,
    targetSum,
    deltaFrom100,
    hasNegativeTarget,
    hasOver100Target,
    invalidTargetKeys,
    isFreshCapitalValid,
    freshCapitalError,
    targetSumError,
    isAllValid: isValidSum && isFreshCapitalValid,
    errors
  };
}

export function rebalanceWeightsLocked100(
  current: TargetWeightsMap,
  changedKey: RebalanceSleeveConfig['key'],
  rawNextValue: number
): TargetWeightsMap {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(rawNextValue) ? rawNextValue : 0));
  const roundedVal = Math.round(clamped * 10) / 10;
  const remaining = Math.max(0, Math.round((100 - roundedVal) * 10) / 10);
  const otherKeys = REBALANCE_SLEEVES.map((s) => s.key).filter((k) => k !== changedKey);
  const otherSum = otherKeys.reduce((acc, k) => acc + Math.max(0, Number(current[k]) || 0), 0);

  const next: TargetWeightsMap = { ...current, [changedKey]: roundedVal };
  if (otherSum <= 0) {
    const equalShare = Math.round((remaining / otherKeys.length) * 10) / 10;
    otherKeys.forEach((k) => {
      next[k] = equalShare;
    });
  } else {
    otherKeys.forEach((k) => {
      const weight = Math.max(0, Number(current[k]) || 0);
      next[k] = Math.round(((weight / otherSum) * remaining) * 10) / 10;
    });
  }

  // Absorb any 0.1% rounding drift on the largest other sleeve so sum === 100.0 exactly
  const totalNow = Math.round(
    REBALANCE_SLEEVES.reduce((acc, s) => acc + next[s.key], 0) * 10
  ) / 10;
  const residual = Math.round((100 - totalNow) * 10) / 10;
  if (Math.abs(residual) > 0) {
    const absorbKey = [...otherKeys].sort((a, b) => next[b] - next[a])[0];
    next[absorbKey] = Math.max(0, Math.round((next[absorbKey] + residual) * 10) / 10);
  }

  return next;
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
  const holdingsCounts: Record<RebalanceSleeveConfig['key'], number> = {
    indianEquities: 0,
    mutualFunds: 0,
    usEquities: 0,
    cashLiquid: 0
  };
  const sleeveHoldingTickers: Record<RebalanceSleeveConfig['key'], string[]> = {
    indianEquities: [],
    mutualFunds: [],
    usEquities: [],
    cashLiquid: []
  };
  const sleeveTickers: Record<RebalanceSleeveConfig['key'], string[]> = {
    indianEquities: [],
    mutualFunds: [],
    usEquities: [],
    cashLiquid: []
  };
  for (const holding of data.holdings || []) {
    const sleeveKey = classifyHoldingSleeve(holding);
    holdingsCounts[sleeveKey] += 1;
    if (holding.ticker) {
      sleeveHoldingTickers[sleeveKey].push(holding.ticker);
      sleeveTickers[sleeveKey].push(holding.ticker);
    }
    if (holding.name) sleeveTickers[sleeveKey].push(holding.name);
    if (holding.sector) sleeveTickers[sleeveKey].push(holding.sector);
  }

  const effectiveAllocation =
    data.allocation && data.allocation.length > 0
      ? data.allocation
      : deriveAllocationFromHoldings(data.holdings || [], data.summary.cashBalanceInr || 0);

  const mapAllocationToSleeves = (sourceAllocation: AllocationItem[]) => {
    const usedIndices = new Set<number>();
    return REBALANCE_SLEEVES.map((sleeve) => {
      let totalValueInr = 0;
      let resolvedRole = sleeve.defaultRole;
      let matchedAny = false;

      sourceAllocation.forEach((item, idx) => {
        if (usedIndices.has(idx)) return;
        const lower = item.category.toLowerCase();
        if (sleeve.matchKeywords.some((kw) => lower.includes(kw))) {
          usedIndices.add(idx);
          totalValueInr += Math.max(0, Number(item.valueInr) || 0);
          if (!matchedAny && item.role) {
            resolvedRole = item.role;
          }
          matchedAny = true;
        }
      });

      return {
        sleeve,
        role: resolvedRole,
        holdingsCount: holdingsCounts[sleeve.key],
        currentValueInr: totalValueInr
      };
    });
  };

  let matchedSleeves = mapAllocationToSleeves(effectiveAllocation);
  let sumMatchedInr = matchedSleeves.reduce((sum, item) => sum + item.currentValueInr, 0);

  if (sumMatchedInr <= 0 && (data.holdings?.length || 0) > 0) {
    const derivedFallback = deriveAllocationFromHoldings(
      data.holdings || [],
      data.summary.cashBalanceInr || 0,
      effectiveAllocation
    );
    matchedSleeves = mapAllocationToSleeves(derivedFallback);
    sumMatchedInr = matchedSleeves.reduce((sum, item) => sum + item.currentValueInr, 0);
  }

  const currentTotalInr = sumMatchedInr > 0 ? sumMatchedInr : Math.max(0, data.summary.totalValueInr || 0);
  const projectedTotalInr = currentTotalInr + safeFreshInr;

  const targetSum = Number(
    REBALANCE_SLEEVES.reduce((sum, s) => sum + (Number(targets[s.key]) || 0), 0).toFixed(1)
  );
  const hasInvalidTarget = REBALANCE_SLEEVES.some((s) => {
    const v = Number(targets[s.key]);
    return !Number.isFinite(v) || v < 0 || v > 100;
  });
  const isValidSum = Math.abs(targetSum - 100) < 0.001 && !hasInvalidTarget;

  const baseRows = matchedSleeves.map(({ sleeve, role, holdingsCount, currentValueInr }) => {
    const currentPct = currentTotalInr > 0 ? (currentValueInr / currentTotalInr) * 100 : 0;
    const targetPct = Math.max(0, Math.min(100, Number(targets[sleeve.key]) || 0));
    const driftPct = currentPct - targetPct;
    const targetValueInr = projectedTotalInr * (targetPct / 100);
    const fullDeltaInr = targetValueInr - currentValueInr;

    return {
      sleeve,
      role,
      holdingsCount,
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
      holdingsCount: item.holdingsCount,
      holdingTickers: sleeveHoldingTickers[item.sleeve.key],
      tickers: sleeveTickers[item.sleeve.key],
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
  searchQuery?: string;
  onSearchQueryChange?: (next: string) => void;
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
  highlighted = false,
  searchQuery = '',
  onSearchQueryChange
}) => {
  const [targets, setTargets] = useState<TargetWeightsMap>(readSavedTargetWeights);
  const [freshCapitalInput, setFreshCapitalInput] = useState<string>('0');
  const [strategyMode, setStrategyMode] = useState<RebalanceStrategyMode>('full');
  const [autoLock100, setAutoLock100] = useState<boolean>(false);
  const [weightBoundNotice, setWeightBoundNotice] = useState<string | null>(null);
  const [copiedPlan, setCopiedPlan] = useState<boolean>(false);
  const [history, setHistory] = useState<RebalanceHistoryEntry[]>(readSavedRebalanceHistory);
  const [historyNoteInput, setHistoryNoteInput] = useState<string>('');
  const [justLoggedAction, setJustLoggedAction] = useState<boolean>(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState<boolean>(false);
  const [isFormulaHovered, setIsFormulaHovered] = useState<boolean>(false);
  const [isFormulaPinned, setIsFormulaPinned] = useState<boolean>(false);
  const formulaTooltipRef = useRef<HTMLDivElement | null>(null);

  const showFormulaTooltip = isFormulaHovered || isFormulaPinned;

  useEffect(() => {
    if (!isFormulaPinned || typeof document === 'undefined') return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        formulaTooltipRef.current &&
        !formulaTooltipRef.current.contains(event.target as Node)
      ) {
        setIsFormulaPinned(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFormulaPinned(false);
        setIsFormulaHovered(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFormulaPinned]);

  const usdInr = data.meta.usdInr || 95.41;
  const prevCurrencyRef = useRef<CurrencyCode>(currency);

  useEffect(() => {
    if (prevCurrencyRef.current !== currency) {
      const prevCurrency = prevCurrencyRef.current;
      prevCurrencyRef.current = currency;
      const numeric = Number(String(freshCapitalInput).replace(/,/g, ''));
      if (Number.isFinite(numeric) && numeric > 0) {
        const converted =
          prevCurrency === 'INR' && currency === 'USD'
            ? Math.round(numeric / usdInr)
            : Math.round(numeric * usdInr);
        setFreshCapitalInput(String(converted));
      }
    }
  }, [currency, freshCapitalInput, usdInr]);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_REBALANCE_TARGETS, JSON.stringify(targets));
      } catch {
        // Ignore storage quota / private mode errors
      }
    }
  }, [targets]);

  const validation = useMemo(
    () => validateRebalanceInputs(targets, freshCapitalInput),
    [targets, freshCapitalInput]
  );

  const parsedFreshAmount = useMemo(() => {
    const cleaned = Number(String(freshCapitalInput).replace(/,/g, ''));
    return Number.isFinite(cleaned) && cleaned > 0 ? cleaned : 0;
  }, [freshCapitalInput]);

  const freshCapitalInr = currency === 'USD' ? parsedFreshAmount * usdInr : parsedFreshAmount;

  const plan = useMemo(
    () => computeRebalancePlan(data, targets, freshCapitalInr, strategyMode),
    [data, targets, freshCapitalInr, strategyMode]
  );

  const visibleRows = useMemo(
    () => filterRebalanceRows(plan.rows, searchQuery),
    [plan.rows, searchQuery]
  );

  const maxAbsDriftPct = useMemo(
    () =>
      plan.rows.reduce((max, row) => Math.max(max, Math.abs(row.driftPct)), 0),
    [plan.rows]
  );

  const formulaExampleRow = useMemo(() => {
    if (plan.rows.length === 0) return null;
    return plan.rows.reduce((best, row) =>
      Math.abs(row.actionAmountInr) > Math.abs(best.actionAmountInr) ? row : best
    , plan.rows[0]);
  }, [plan.rows]);

  const handleWeightChange = (key: RebalanceSleeveConfig['key'], rawValue: number) => {
    if (!Number.isFinite(rawValue) || rawValue < 0) {
      setWeightBoundNotice('Target allocation percentages must be non-negative (0% to 100%). Clamped to 0%.');
    } else if (rawValue > 100) {
      setWeightBoundNotice('Individual target allocation percentages cannot exceed 100%. Clamped to 100%.');
    } else {
      setWeightBoundNotice(null);
    }

    const clamped = Math.max(0, Math.min(100, Number.isFinite(rawValue) ? rawValue : 0));
    setTargets((prev) =>
      autoLock100
        ? rebalanceWeightsLocked100(prev, key, clamped)
        : {
            ...prev,
            [key]: Math.round(clamped * 10) / 10
          }
    );
  };

  const handleResetDefaults = () => {
    setTargets({ ...DEFAULT_TARGET_WEIGHTS });
    setFreshCapitalInput('0');
    setWeightBoundNotice(null);
  };

  const handleMatchCurrentWeights = () => {
    const scaled = plan.rows.map((row) => ({
      key: row.key,
      val: Math.round(row.currentPct * 10) / 10
    }));
    const sum = scaled.reduce((acc, item) => acc + item.val, 0);
    if (sum <= 0) {
      setTargets({ ...DEFAULT_TARGET_WEIGHTS });
      return;
    }
    const diff = Math.round((100 - sum) * 10) / 10;
    scaled[0].val = Math.max(0, Math.round((scaled[0].val + diff) * 10) / 10);
    const next = { ...DEFAULT_TARGET_WEIGHTS };
    for (const item of scaled) {
      next[item.key] = item.val;
    }
    setTargets(next);
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

  const persistHistory = (nextHistory: RebalanceHistoryEntry[]) => {
    setHistory(nextHistory);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_REBALANCE_HISTORY, JSON.stringify(nextHistory));
      } catch {
        // Ignore storage quota / private mode errors
      }
    }
  };

  const handleLogRebalanceAction = () => {
    if (!validation.isAllValid) return;
    const entry = createRebalanceHistoryEntry(
      plan,
      targets,
      freshCapitalInr,
      strategyMode,
      currency,
      historyNoteInput
    );
    const nextHistory = [entry, ...history].slice(0, 50);
    persistHistory(nextHistory);
    setHistoryNoteInput('');
    setConfirmClearHistory(false);
    setJustLoggedAction(true);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setJustLoggedAction(false), 2000);
    }
  };

  const handleRestoreHistoryTargets = (entry: RebalanceHistoryEntry) => {
    setTargets({ ...entry.targetWeights });
    setStrategyMode(entry.strategyMode);
    setWeightBoundNotice(null);
  };

  const handleDeleteHistoryEntry = (id: string) => {
    const nextHistory = history.filter((item) => item.id !== id);
    persistHistory(nextHistory);
  };

  const handleClearAllHistory = () => {
    persistHistory([]);
    setConfirmClearHistory(false);
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
      className={`panel scroll-mt-24 bg-[#0f172a] border rounded-xl p-6 space-y-5 transition-all duration-300 ${
        highlighted
          ? 'border-sky-400 ring-2 ring-sky-400/40 shadow-lg shadow-sky-500/10'
          : 'border-slate-800'
      }`}
    >
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div ref={formulaTooltipRef} className="relative inline-flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2 m-0">
              <Scale className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Portfolio Rebalancing &amp; Capital Deployment</span>
            </h2>

            {/* Calculation Formula Info Tooltip Trigger + Zero-Gap Hover Bridge */}
            <div
              className="inline-flex items-center group/info"
              onMouseEnter={() => setIsFormulaHovered(true)}
              onMouseLeave={() => setIsFormulaHovered(false)}
            >
              <button
                type="button"
                onClick={() => setIsFormulaPinned((prev) => !prev)}
                onFocus={() => setIsFormulaHovered(true)}
                onBlur={(event) => {
                  if (!formulaTooltipRef.current?.contains(event.relatedTarget as Node)) {
                    setIsFormulaHovered(false);
                  }
                }}
                data-testid="rebalance-formula-info-btn"
                aria-label="How Actionable Buy/Trim amounts are calculated"
                aria-describedby="rebalance-formula-tooltip"
                aria-expanded={showFormulaTooltip}
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full border transition-colors cursor-pointer ${
                  showFormulaTooltip
                    ? 'bg-sky-500/20 border-sky-400/60 text-sky-300 shadow-sm shadow-sky-500/20'
                    : 'bg-slate-800/80 border-slate-700 text-sky-300/90 hover:text-sky-300 hover:border-sky-500/60 hover:bg-sky-500/15'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
              </button>

              <div
                id="rebalance-formula-tooltip"
                role="tooltip"
                data-testid="rebalance-formula-tooltip"
                className={`absolute left-0 top-full pt-2 z-40 w-[min(25rem,calc(100vw-3rem))] transition-all duration-150 ${
                  showFormulaTooltip
                    ? 'opacity-100 translate-y-0 pointer-events-auto'
                    : 'opacity-0 -translate-y-1 pointer-events-none group-hover/info:opacity-100 group-hover/info:translate-y-0 group-hover/info:pointer-events-auto'
                }`}
              >
                <div className="p-4 rounded-xl bg-[#0b1120] border border-slate-700/90 shadow-2xl text-[11px] leading-relaxed text-slate-300">
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>Actionable Buy / Trim Formula</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          strategyMode === 'full'
                            ? 'bg-sky-500/15 border-sky-500/35 text-sky-300'
                            : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                        }`}
                      >
                        {strategyMode === 'full' ? 'Buy & Trim' : 'Cash-Only'}
                      </span>
                      {isFormulaPinned && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsFormulaPinned(false);
                            setIsFormulaHovered(false);
                          }}
                          aria-label="Close formula tooltip"
                          className="p-0.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="font-mono text-[10px] text-sky-300 bg-[#0f172a] border border-slate-800 rounded-lg px-2.5 py-2 space-y-1">
                      <div>
                        <span className="text-slate-400">1. Target Value =</span> (Current Total + Fresh Capital) × Target %
                      </div>
                      <div>
                        <span className="text-slate-400">2. Buy &amp; Trim =</span> Target Value − Current Sleeve Value
                      </div>
                      <div>
                        <span className="text-slate-400">3. Cash-Only =</span> (Sleeve Shortfall ÷ Total Shortfall) × Fresh Capital
                      </div>
                      <div className="pt-1 border-t border-slate-800/80 text-emerald-300">
                        <span className="text-slate-400">4. Realigned % =</span> (Current Sleeve + Action) ÷ Projected Total
                      </div>
                    </div>

                    <ul className="space-y-1 m-0 pl-3.5 list-disc text-slate-300">
                      <li>
                        <strong className="text-emerald-400">Buy (+)</strong>: Sleeve is underweight relative to its post-deployment target value.
                      </li>
                      <li>
                        <strong className="text-rose-400">Trim (−)</strong>: Sleeve exceeds target value in <em>Buy &amp; Trim</em> mode.
                      </li>
                      <li>
                        <strong className="text-slate-100">Cash-Only (No Sell)</strong>: Routes fresh capital proportionally to underweight sleeves (shortfall &gt; 0) without trimming holdings.
                      </li>
                      <li>
                        <strong className="text-slate-200">Drift &amp; Threshold</strong>: Drift % = Current % − Target %. Actions under ₹100 display as <em>On Target</em>.
                      </li>
                    </ul>

                    {formulaExampleRow && (
                      <div
                        data-testid="rebalance-formula-live-example"
                        className="rounded-lg bg-[#0f172a]/90 border border-slate-800 px-2.5 py-2 text-[10px] font-mono tabular-nums text-slate-300"
                      >
                        <div className="font-sans text-[10px] font-semibold text-slate-200 mb-1">
                          Live Example ({formulaExampleRow.label}):
                        </div>
                        <div>
                          Target{' '}
                          <PrivateMoney
                            value={formatPortfolioValue(formulaExampleRow.targetValueInr, currency, usdInr, { compact: true })}
                            currency={currency}
                            privacyMode={privacyMode}
                          />{' '}
                          − Current{' '}
                          <PrivateMoney
                            value={formatPortfolioValue(formulaExampleRow.currentValueInr, currency, usdInr, { compact: true })}
                            currency={currency}
                            privacyMode={privacyMode}
                          />{' '}
                          ={' '}
                          <strong
                            className={
                              formulaExampleRow.actionType === 'buy'
                                ? 'text-emerald-400'
                                : formulaExampleRow.actionType === 'trim'
                                ? 'text-rose-400'
                                : 'text-slate-300'
                            }
                          >
                            {formulaExampleRow.actionType === 'buy'
                              ? 'Buy +'
                              : formulaExampleRow.actionType === 'trim'
                              ? 'Trim -'
                              : 'Hold '}
                            <PrivateMoney
                              value={formatPortfolioValue(Math.abs(formulaExampleRow.actionAmountInr), currency, usdInr, { compact: true })}
                              currency={currency}
                              privacyMode={privacyMode}
                            />
                          </strong>{' '}
                          → {formulaExampleRow.postActionPct.toFixed(1)}%
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
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
            onClick={handleLogRebalanceAction}
            disabled={!validation.isAllValid}
            data-testid="rebalance-header-log-btn"
            title={
              !validation.isAllValid
                ? 'Fix validation errors before logging this rebalancing action'
                : 'Log current rebalancing plan with timestamp to Rebalancing History'
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              validation.isAllValid
                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/35 cursor-pointer'
                : 'bg-[#0b1120]/60 text-slate-500 border-slate-800 cursor-not-allowed opacity-60'
            }`}
          >
            {justLoggedAction ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>Logged</span>
              </>
            ) : (
              <>
                <BookmarkPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Log Action</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyExecutionPlan}
            disabled={!validation.isAllValid}
            data-testid="rebalance-copy-btn"
            title={
              !validation.isAllValid
                ? 'Fix target weight sum (must equal 100%) and non-negative capital validation errors before copying'
                : privacyMode
                ? 'Copy Rebalance Plan (monetary amounts redacted while Privacy Blur is active)'
                : 'Copy actionable Buy / Trim execution summary to clipboard'
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              validation.isAllValid
                ? 'bg-[#0b1120] hover:bg-[#1e293b] text-slate-300 border-slate-700 cursor-pointer'
                : 'bg-[#0b1120]/60 text-slate-500 border-slate-800 cursor-not-allowed opacity-60'
            }`}
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
        <div
          className={`lg:col-span-8 p-4 rounded-xl bg-[#0b1120] border space-y-3.5 transition-colors ${
            validation.isValidSum ? 'border-slate-800/90' : 'border-amber-500/50'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400">
              Editable Target Allocation Sliders (must total 100.0%)
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setAutoLock100((prev) => {
                    const next = !prev;
                    if (next && !validation.isValidSum) {
                      handleNormalizeTo100();
                    }
                    return next;
                  });
                }}
                data-testid="rebalance-lock-100-btn"
                aria-pressed={autoLock100}
                title="Automatically rebalance remaining sleeves when dragging any slider so weights stay locked at 100%"
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono border transition-colors cursor-pointer ${
                  autoLock100
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/45 font-semibold'
                    : 'bg-[#0f172a] text-slate-400 hover:text-slate-200 border-slate-800'
                }`}
              >
                {autoLock100 ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                <span>{autoLock100 ? 'Locked 100%' : 'Lock 100%'}</span>
              </button>
              {TARGET_PRESETS.map((preset) => {
                const isMatch = REBALANCE_SLEEVES.every(
                  (s) => Math.abs((targets[s.key] || 0) - preset.weights[s.key]) < 0.05
                );
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTargets({ ...preset.weights });
                      setWeightBoundNotice(null);
                    }}
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
              <button
                type="button"
                onClick={() => {
                  handleMatchCurrentWeights();
                  setWeightBoundNotice(null);
                }}
                data-testid="rebalance-match-current-btn"
                title="Set target sliders to match your current portfolio allocation weights"
                className="px-2 py-1 rounded-md text-[11px] font-mono border bg-[#0f172a] text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/30 transition-colors cursor-pointer"
              >
                Match Current
              </button>
            </div>
          </div>

          {weightBoundNotice && (
            <div
              role="alert"
              data-testid="rebalance-weight-bound-notice"
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/35 text-[11px] text-rose-200 flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>{weightBoundNotice}</span>
              </span>
              <button
                type="button"
                onClick={() => setWeightBoundNotice(null)}
                aria-label="Dismiss weight validation notice"
                className="text-rose-300 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {REBALANCE_SLEEVES.map((sleeve) => {
              const val = targets[sleeve.key];
              const rowData = plan.rows.find((r) => r.key === sleeve.key);
              const currentPct = rowData ? rowData.currentPct : 0;
              return (
                <div
                  key={sleeve.key}
                  className={`p-3 rounded-lg bg-[#0f172a] border space-y-2 ${
                    validation.isValidSum ? 'border-slate-800/80' : 'border-amber-500/30'
                  }`}
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
                        aria-invalid={!validation.isValidSum}
                        onKeyDown={(e) => {
                          if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                            e.preventDefault();
                            setWeightBoundNotice('Target allocation percentages must be non-negative (0% to 100%).');
                          }
                        }}
                        onChange={(e) => handleWeightChange(sleeve.key, Number(e.target.value))}
                        aria-label={`${sleeve.label} Target Allocation Percentage`}
                        className={`w-16 px-2 py-1 bg-[#0b1120] border rounded text-right text-xs font-mono tabular-nums font-semibold focus:outline-none ${
                          validation.isValidSum
                            ? 'border-slate-700 text-sky-400 focus:border-sky-500'
                            : 'border-amber-500/60 text-amber-300 focus:border-amber-400'
                        }`}
                      />
                      <span className="text-xs font-mono text-slate-400">%</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={val}
                    aria-invalid={!validation.isValidSum}
                    onChange={(e) => handleWeightChange(sleeve.key, Number(e.target.value))}
                    aria-label={`${sleeve.label} Target Allocation Slider`}
                    className={`w-full ${sleeve.accentClass} cursor-pointer`}
                  />

                  {/* Current vs Target visual alignment bar */}
                  <div className="relative h-1.5 w-full rounded-full bg-slate-800/90 overflow-hidden" aria-hidden="true">
                    <div
                      className={`h-full opacity-45 ${sleeve.dotClass}`}
                      style={{ width: `${Math.min(100, Math.max(0, currentPct))}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.8)]"
                      style={{ left: `${Math.min(99, Math.max(0, val))}%` }}
                    />
                  </div>

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
        <div
          className={`lg:col-span-4 p-4 rounded-xl bg-[#0b1120] border flex flex-col justify-between space-y-4 transition-colors ${
            validation.isFreshCapitalValid ? 'border-slate-800/90' : 'border-rose-500/60'
          }`}
        >
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
                aria-invalid={!validation.isFreshCapitalValid}
                aria-describedby={!validation.isFreshCapitalValid ? 'rebalance-fresh-capital-error' : undefined}
                onChange={(e) => setFreshCapitalInput(e.target.value)}
                placeholder="0"
                className={`w-full pl-7 pr-3 py-2 bg-[#0f172a] border rounded-lg text-sm font-mono tabular-nums text-slate-100 focus:outline-none ${
                  validation.isFreshCapitalValid
                    ? 'border-slate-700 focus:border-sky-500'
                    : 'border-rose-500 text-rose-200 focus:border-rose-400'
                }`}
              />
            </div>

            {!validation.isFreshCapitalValid && validation.freshCapitalError && (
              <div
                id="rebalance-fresh-capital-error"
                role="alert"
                data-testid="rebalance-fresh-capital-error"
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/35 text-[11px] text-rose-200"
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>{validation.freshCapitalError}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setFreshCapitalInput('0')}
                  data-testid="rebalance-fix-capital-btn"
                  className="shrink-0 px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 border border-rose-500/40 font-medium cursor-pointer"
                >
                  Set to 0
                </button>
              </div>
            )}

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

      {/* Unified Client-Side Validation Alert Banner */}
      {!validation.isAllValid && (
        <div
          role="alert"
          data-testid="rebalance-validation-alert"
          className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/35 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              {validation.errors.map((err, idx) => (
                <div key={idx}>{err}</div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!validation.isValidSum && (
              <button
                type="button"
                onClick={handleNormalizeTo100}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/40 font-medium cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Normalize to 100%</span>
              </button>
            )}
            {!validation.isFreshCapitalValid && (
              <button
                type="button"
                onClick={() => setFreshCapitalInput('0')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 border border-rose-500/40 font-medium cursor-pointer"
              >
                <span>Reset Capital to 0</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Execution Summary Strip */}
      <div
        data-testid="rebalance-execution-summary"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <div className="p-3 rounded-lg bg-[#0b1120] border border-slate-800/90">
          <div className="text-[11px] text-slate-400">Fresh Capital Added</div>
          <div className="text-sm font-bold font-mono tabular-nums text-sky-400 mt-0.5">
            <PrivateMoney
              value={formatPortfolioValue(freshCapitalInr, currency, usdInr)}
              currency={currency}
              privacyMode={privacyMode}
            />
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[#0b1120] border border-slate-800/90">
          <div className="text-[11px] text-slate-400">Total Buy Orders</div>
          <div className="text-sm font-bold font-mono tabular-nums text-emerald-400 mt-0.5">
            <PrivateMoney
              prefix="+"
              value={formatPortfolioValue(plan.totalBuyInr, currency, usdInr)}
              currency={currency}
              privacyMode={privacyMode}
            />
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[#0b1120] border border-slate-800/90">
          <div className="text-[11px] text-slate-400">Total Trim Orders</div>
          <div className="text-sm font-bold font-mono tabular-nums text-rose-400 mt-0.5">
            <PrivateMoney
              prefix={plan.totalTrimInr > 0 ? '-' : ''}
              value={formatPortfolioValue(plan.totalTrimInr, currency, usdInr)}
              currency={currency}
              privacyMode={privacyMode}
            />
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[#0b1120] border border-slate-800/90">
          <div className="text-[11px] text-slate-400">Max Sleeve Drift</div>
          <div
            className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${
              maxAbsDriftPct >= 3 ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {maxAbsDriftPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Active Search Filter Status Strip */}
      {searchQuery.trim() && (
        <div
          data-testid="rebalance-active-filter-banner"
          className="px-3.5 py-2 rounded-lg bg-sky-500/10 border border-sky-500/30 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-200"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>
              Filtering rebalancing assets by{' '}
              <strong className="text-sky-300">&ldquo;{searchQuery.trim()}&rdquo;</strong> — showing{' '}
              <strong className="font-mono">{visibleRows.length}</strong> of{' '}
              <span className="font-mono">{plan.rows.length}</span> asset sleeves
            </span>
          </div>
          {onSearchQueryChange && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              data-testid="rebalance-clear-filter-btn"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/35 text-[11px] font-medium transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Clear Filter</span>
            </button>
          )}
        </div>
      )}

      {/* Actionable Rebalancing Table */}
      {(() => {
        const isFiltered = searchQuery.trim().length > 0;
        const normalizedTerms = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const visibleBuyInr = visibleRows.reduce(
          (sum, r) => sum + (r.actionAmountInr > 0 ? r.actionAmountInr : 0),
          0
        );
        const visibleTrimInr = visibleRows.reduce(
          (sum, r) => sum + (r.actionAmountInr < 0 ? Math.abs(r.actionAmountInr) : 0),
          0
        );
        const visibleCurrentPct = visibleRows.reduce((sum, r) => sum + r.currentPct, 0);
        const visibleTargetPct = visibleRows.reduce((sum, r) => sum + r.targetPct, 0);

        return (
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
                {visibleRows.length === 0 ? (
                  <tr data-testid="rebalance-empty-filter-row">
                    <td colSpan={5} className="py-8 px-4 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <span>
                          No actionable Buy / Trim sleeves match{' '}
                          <strong className="text-slate-200">&ldquo;{searchQuery.trim()}&rdquo;</strong>.
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Try searching by sleeve name (e.g. &ldquo;US Equities&rdquo;, &ldquo;Cash&rdquo;), action (&ldquo;Buy&rdquo;, &ldquo;Trim&rdquo;), or holding ticker (e.g. &ldquo;NVDA&rdquo;).
                        </span>
                        {onSearchQueryChange && (
                          <button
                            type="button"
                            onClick={() => onSearchQueryChange('')}
                            className="mt-1 inline-flex items-center gap-1 px-3 py-1 rounded-md bg-[#1e293b] hover:bg-slate-700 text-sky-300 border border-slate-700 text-xs font-medium cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reset Search Filter</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => {
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
                        <div className="text-[11px] text-slate-400">
                          {row.role} ·{' '}
                          {row.key === 'cashLiquid'
                            ? 'Liquid reserve'
                            : `${row.holdingsCount} ${
                                row.key === 'mutualFunds'
                                  ? row.holdingsCount === 1
                                    ? 'fund'
                                    : 'funds'
                                  : row.holdingsCount === 1
                                  ? 'holding'
                                  : 'holdings'
                              }`}
                        </div>
                        {row.holdingTickers.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-mono text-slate-400">
                            {row.holdingTickers.map((ticker) => {
                              const isTickerMatch =
                                normalizedTerms.length > 0 &&
                                normalizedTerms.some((term) => ticker.toLowerCase().includes(term));
                              return (
                                <span
                                  key={ticker}
                                  className={
                                    isTickerMatch
                                      ? 'text-sky-300 font-semibold underline decoration-sky-400/70 underline-offset-2'
                                      : 'text-slate-500'
                                  }
                                >
                                  {ticker}
                                </span>
                              );
                            })}
                          </div>
                        )}
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
            }))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700/80 bg-[#0b1120] text-xs font-mono tabular-nums">
              <td className="py-3 pl-4 pr-3 font-sans font-semibold text-slate-300">
                {isFiltered
                  ? `Filtered Summary (${visibleRows.length} of ${plan.rows.length} sleeves)`
                  : 'Net Execution Summary'}
              </td>
              <td className="py-3 px-3 text-right font-semibold text-slate-200">
                {isFiltered ? `${visibleCurrentPct.toFixed(1)}%` : '100.0%'}
              </td>
              <td
                className={`py-3 px-3 text-right font-semibold ${
                  isFiltered
                    ? 'text-sky-400'
                    : plan.isValidSum
                    ? 'text-emerald-400'
                    : 'text-amber-300'
                }`}
              >
                {(isFiltered ? visibleTargetPct : plan.targetSum).toFixed(1)}%
              </td>
              <td className="py-3 px-3 text-right text-slate-400">—</td>
              <td className="py-3 pl-3 pr-4 text-right text-slate-200">
                <span className="text-emerald-400 font-semibold">
                  Buy{' '}
                  <PrivateMoney
                    value={formatPortfolioValue(isFiltered ? visibleBuyInr : plan.totalBuyInr, currency, usdInr, { compact: true })}
                    currency={currency}
                    privacyMode={privacyMode}
                  />
                </span>
                <span className="text-slate-600 mx-1.5">·</span>
                <span className="text-rose-400 font-semibold">
                  Trim{' '}
                  <PrivateMoney
                    value={formatPortfolioValue(isFiltered ? visibleTrimInr : plan.totalTrimInr, currency, usdInr, { compact: true })}
                    currency={currency}
                    privacyMode={privacyMode}
                  />
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
        );
      })()}

      {/* Rebalancing History Table */}
      <div
        data-testid="rebalancing-history-section"
        className="pt-4 border-t border-slate-800/80 space-y-3"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2 m-0">
                <History className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Rebalancing History</span>
              </h3>
              <span className="text-[11px] font-mono tabular-nums text-slate-400 px-2 py-0.5 rounded bg-[#0b1120] border border-slate-800">
                {history.length} {history.length === 1 ? 'Entry' : 'Entries'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-0">
              Chronological audit log of recorded rebalancing plans, target weights, and Buy / Trim executions with timestamps.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={historyNoteInput}
              onChange={(e) => setHistoryNoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && validation.isAllValid) {
                  handleLogRebalanceAction();
                }
              }}
              placeholder="Optional note (e.g. Q4 Rebalance)..."
              aria-label="Optional note for rebalancing history log"
              data-testid="rebalance-history-note-input"
              maxLength={120}
              className="w-44 sm:w-56 px-2.5 py-1.5 bg-[#0b1120] border border-slate-800 hover:border-slate-700 focus:border-sky-500 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={handleLogRebalanceAction}
              disabled={!validation.isAllValid}
              data-testid="rebalance-log-action-btn"
              title={
                !validation.isAllValid
                  ? 'Fix target allocation and capital validation errors before logging'
                  : 'Record current Buy / Trim plan and timestamp to Rebalancing History'
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                validation.isAllValid
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/35 cursor-pointer'
                  : 'bg-[#0b1120]/60 text-slate-500 border-slate-800 cursor-not-allowed opacity-60'
              }`}
            >
              {justLoggedAction ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Action Logged</span>
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Log Rebalance</span>
                </>
              )}
            </button>

            {history.length > 0 && (
              confirmClearHistory ? (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleClearAllHistory}
                    data-testid="rebalance-confirm-clear-history-btn"
                    className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 text-xs font-medium cursor-pointer"
                  >
                    Confirm Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearHistory(false)}
                    className="px-2 py-1.5 rounded-lg bg-[#0b1120] hover:bg-[#1e293b] text-slate-400 border border-slate-800 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearHistory(true)}
                  data-testid="rebalance-clear-history-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0b1120] hover:bg-[#1e293b] text-slate-400 hover:text-rose-300 border border-slate-800 text-xs font-medium transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800/90 bg-[#0b1120]/60">
          <table className="w-full text-left border-collapse" data-testid="rebalancing-history-table">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0b1120] text-[11px] text-slate-400 font-medium">
                <th className="py-2.5 pl-4 pr-3 font-medium">Timestamp &amp; Note</th>
                <th className="py-2.5 px-3 font-medium">Mode &amp; Target Split</th>
                <th className="py-2.5 px-3 font-medium">Logged Buy / Trim Actions</th>
                <th className="py-2.5 px-3 font-medium text-right">Net Buy / Trim</th>
                <th className="py-2.5 pl-3 pr-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {history.length === 0 ? (
                <tr data-testid="rebalancing-history-empty">
                  <td colSpan={5} className="py-7 px-4 text-center text-slate-400">
                    No rebalancing actions logged yet. Click{' '}
                    <strong className="text-emerald-300">Log Rebalance</strong> above to snapshot the current calculation with a timestamp.
                  </td>
                </tr>
              ) : (
                history.map((entry) => {
                  const activeActions = entry.actions.filter((a) => a.actionType !== 'hold');
                  const splitLabel = `${entry.targetWeights.indianEquities}/${entry.targetWeights.mutualFunds}/${entry.targetWeights.usEquities}/${entry.targetWeights.cashLiquid}%`;
                  return (
                    <tr
                      key={entry.id}
                      data-testid={`rebalance-history-row-${entry.id}`}
                      className="hover:bg-[#1e293b]/40 transition-colors align-top"
                    >
                      <td className="py-3 pl-4 pr-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono tabular-nums text-slate-200 font-medium">
                          <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                          <time dateTime={entry.timestamp}>
                            {formatHistoryTimestamp(entry.timestamp)}
                          </time>
                        </div>
                        {entry.note && (
                          <div className="text-[11px] text-slate-400 mt-1 max-w-xs whitespace-normal">
                            {entry.note}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                              entry.strategyMode === 'full'
                                ? 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            }`}
                          >
                            {entry.strategyMode === 'full' ? 'Buy & Trim' : 'Cash-Only'}
                          </span>
                          <span className="font-mono tabular-nums text-slate-300 text-[11px]">
                            {splitLabel}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-1">
                          Fresh Capital:{' '}
                          <PrivateMoney
                            value={formatPortfolioValue(entry.freshCapitalInr, currency, usdInr, {
                              compact: true
                            })}
                            currency={currency}
                            privacyMode={privacyMode}
                          />
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        {activeActions.length === 0 ? (
                          <span className="text-slate-400 text-[11px]">All sleeves on target (Hold)</span>
                        ) : (
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                            {activeActions.map((act) => (
                              <span
                                key={act.key}
                                className="inline-flex items-center gap-1 font-mono tabular-nums whitespace-nowrap"
                              >
                                <span
                                  className={
                                    act.actionType === 'buy'
                                      ? 'text-emerald-400 font-semibold'
                                      : 'text-rose-400 font-semibold'
                                  }
                                >
                                  {act.actionType === 'buy' ? 'Buy' : 'Trim'}
                                </span>
                                <span className="font-sans text-slate-300">{act.label}</span>
                                <span
                                  className={
                                    act.actionType === 'buy' ? 'text-emerald-300' : 'text-rose-300'
                                  }
                                >
                                  <PrivateMoney
                                    value={`${act.actionType === 'buy' ? '+' : '-'}${formatPortfolioValue(
                                      Math.abs(act.actionAmountInr),
                                      currency,
                                      usdInr,
                                      { compact: true }
                                    )}`}
                                    currency={currency}
                                    privacyMode={privacyMode}
                                  />
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="text-emerald-400 font-semibold">
                          +
                          <PrivateMoney
                            value={formatPortfolioValue(entry.totalBuyInr, currency, usdInr, {
                              compact: true
                            })}
                            currency={currency}
                            privacyMode={privacyMode}
                          />
                        </div>
                        <div className="text-rose-400 text-[11px]">
                          {entry.totalTrimInr > 0 ? '-' : ''}
                          <PrivateMoney
                            value={formatPortfolioValue(entry.totalTrimInr, currency, usdInr, {
                              compact: true
                            })}
                            currency={currency}
                            privacyMode={privacyMode}
                          />
                        </div>
                      </td>

                      <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleRestoreHistoryTargets(entry)}
                            title="Load these target weights and mode into the calculator"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#0f172a] hover:bg-[#1e293b] text-sky-300 border border-slate-700 text-[11px] font-medium cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHistoryEntry(entry.id)}
                            aria-label={`Delete history entry from ${formatHistoryTimestamp(entry.timestamp)}`}
                            title="Remove this history entry"
                            className="p-1 rounded bg-[#0f172a] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
