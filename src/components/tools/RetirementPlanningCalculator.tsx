import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Columns2, X, RotateCcw, ArrowLeftRight } from 'lucide-react';

export interface RetirementScenarioInputs {
  label: string;
  age: number;
  spending: number;
  corpus: number;
  contribution: number;
  retirementAge: number;
  lifespan: number;
  inflation: number;
  preReturn: number;
  realReturn: number;
}

export interface RetirementOutcome {
  years: number;
  horizon: number;
  futureSpending: number;
  required: number;
  projected: number;
  gap: number;
  fundingCoveragePct: number;
}

export const DEFAULT_SCENARIO_A: RetirementScenarioInputs = {
  label: 'Scenario A (Base)',
  age: 45,
  spending: 720000,
  corpus: 3000000,
  contribution: 30000,
  retirementAge: 58,
  lifespan: 88,
  inflation: 6,
  preReturn: 10,
  realReturn: 3
};

export function computeRetirementOutcome(inputs: RetirementScenarioInputs): {
  results: RetirementOutcome | null;
  errorMsg: string;
} {
  const {
    age,
    spending,
    corpus,
    contribution,
    retirementAge,
    lifespan,
    inflation,
    preReturn,
    realReturn
  } = inputs;

  if (retirementAge <= age) {
    return {
      results: null,
      errorMsg: 'Planned retirement age must be greater than current age.'
    };
  }
  if (lifespan <= retirementAge) {
    return {
      results: null,
      errorMsg: 'Planning lifespan must be greater than planned retirement age.'
    };
  }
  if (
    age < 0 ||
    spending < 0 ||
    corpus < 0 ||
    contribution < 0 ||
    inflation < 0 ||
    preReturn < 0 ||
    realReturn < 0
  ) {
    return {
      results: null,
      errorMsg: 'All inputs must be zero or positive.'
    };
  }

  const years = retirementAge - age;
  const months = Math.round(years * 12);
  const horizon = lifespan - retirementAge;
  const infRate = inflation / 100;
  const preMonthly = preReturn / 100 / 12;
  const real = realReturn / 100;

  const futureSpending = spending * Math.pow(1 + infRate, years);

  let projected = 0;
  if (preMonthly === 0) {
    projected = corpus + contribution * months;
  } else {
    const factor = Math.pow(1 + preMonthly, months);
    projected = corpus * factor + contribution * ((factor - 1) / preMonthly);
  }

  let required = 0;
  if (real === 0) {
    required = futureSpending * horizon;
  } else {
    required = (futureSpending * (1 - Math.pow(1 + real, -horizon))) / real;
  }

  const gap = projected - required;
  const fundingCoveragePct = required > 0 ? (projected / required) * 100 : 100;

  if (![futureSpending, projected, required, gap, fundingCoveragePct].every(Number.isFinite)) {
    return {
      results: null,
      errorMsg: 'The inputs resulted in numbers too large to calculate.'
    };
  }

  return {
    results: {
      years,
      horizon,
      futureSpending,
      required,
      projected,
      gap,
      fundingCoveragePct
    },
    errorMsg: ''
  };
}

export function compareRetirementOutcomes(
  outcomeA: RetirementOutcome,
  outcomeB: RetirementOutcome
): {
  yearsDelta: number;
  horizonDelta: number;
  futureSpendingDelta: number;
  requiredDelta: number;
  projectedDelta: number;
  gapDelta: number;
  coverageDeltaPct: number;
  leader: 'A' | 'B' | 'tie';
} {
  const gapDelta = outcomeB.gap - outcomeA.gap;
  const leader: 'A' | 'B' | 'tie' =
    Math.abs(gapDelta) < 1 ? 'tie' : gapDelta > 0 ? 'B' : 'A';
  return {
    yearsDelta: outcomeB.years - outcomeA.years,
    horizonDelta: outcomeB.horizon - outcomeA.horizon,
    futureSpendingDelta: outcomeB.futureSpending - outcomeA.futureSpending,
    requiredDelta: outcomeB.required - outcomeA.required,
    projectedDelta: outcomeB.projected - outcomeA.projected,
    gapDelta,
    coverageDeltaPct: outcomeB.fundingCoveragePct - outcomeA.fundingCoveragePct,
    leader
  };
}

const formatMoney = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(n);

const formatSignedMoney = (n: number) => {
  const prefix = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${prefix}${formatMoney(Math.abs(n))}`;
};

interface ScenarioColumnProps {
  idPrefix: 'a' | 'b';
  scenario: RetirementScenarioInputs;
  outcome: { results: RetirementOutcome | null; errorMsg: string };
  isComparing: boolean;
  accentColor: string;
  onChange: <K extends keyof RetirementScenarioInputs>(
    field: K,
    value: RetirementScenarioInputs[K]
  ) => void;
  onReset: () => void;
  onSyncFromA?: () => void;
  onApplyPreset?: (preset: 'delay2' | 'boostSip' | 'conservative') => void;
  onRemove?: () => void;
}

const ScenarioColumn: React.FC<ScenarioColumnProps> = ({
  idPrefix,
  scenario,
  outcome,
  isComparing,
  accentColor,
  onChange,
  onReset,
  onSyncFromA,
  onApplyPreset,
  onRemove
}) => {
  const { results, errorMsg } = outcome;

  return (
    <div
      data-testid={`retirement-scenario-${idPrefix}`}
      className={
        isComparing
          ? 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between gap-5'
          : 'space-y-6'
      }
      style={
        isComparing
          ? { borderTop: `4px solid ${accentColor}` }
          : undefined
      }
    >
      <div>
        {isComparing && (
          <div className="space-y-2.5 pb-4 mb-4 border-b border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="text"
                aria-label={`Scenario ${idPrefix.toUpperCase()} label`}
                value={scenario.label}
                onChange={(e) => onChange('label', e.target.value)}
                className="font-bold text-base text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 focus:outline-none focus:border-blue-600"
              />
              <div className="flex items-center gap-2">
                {onSyncFromA && (
                  <button
                    type="button"
                    onClick={onSyncFromA}
                    data-testid="copy-a-to-b-btn"
                    title="Duplicate Scenario A inputs into Scenario B"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Duplicate A → B</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onReset}
                  title="Reset this scenario to defaults"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
                {onRemove && (
                  <button
                    type="button"
                    onClick={onRemove}
                    data-testid="remove-comparison-btn"
                    title="Close Scenario B comparison"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Close</span>
                  </button>
                )}
              </div>
            </div>

            {onApplyPreset && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium mr-1">Quick What-If:</span>
                <button
                  type="button"
                  onClick={() => onApplyPreset('delay2')}
                  data-testid="preset-delay-2yrs"
                  className="px-2 py-0.5 rounded border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 font-medium cursor-pointer"
                >
                  Retire +2 yrs
                </button>
                <button
                  type="button"
                  onClick={() => onApplyPreset('boostSip')}
                  data-testid="preset-boost-sip"
                  className="px-2 py-0.5 rounded border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 font-medium cursor-pointer"
                >
                  +₹20K/mo SIP
                </button>
                <button
                  type="button"
                  onClick={() => onApplyPreset('conservative')}
                  data-testid="preset-conservative"
                  className="px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 font-medium cursor-pointer"
                >
                  −1.5% Return
                </button>
              </div>
            )}
          </div>
        )}

        <h2 style={{ marginTop: 0, fontSize: isComparing ? '1.05rem' : undefined }}>
          1. Today&apos;s Situation
        </h2>
        <div className="card-grid two">
          <div className="form-field">
            <label htmlFor={`${idPrefix}-age`}>Current age</label>
            <input
              id={`${idPrefix}-age`}
              type="number"
              min="18"
              max="100"
              value={scenario.age}
              onChange={(e) => onChange('age', Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-spending`}>Current annual retirement spending (₹)</label>
            <input
              id={`${idPrefix}-spending`}
              type="number"
              min="0"
              step="10000"
              value={scenario.spending}
              onChange={(e) => onChange('spending', Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-corpus`}>Current retirement corpus (₹)</label>
            <input
              id={`${idPrefix}-corpus`}
              type="number"
              min="0"
              step="50000"
              value={scenario.corpus}
              onChange={(e) => onChange('corpus', Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-contribution`}>Monthly retirement contribution (₹)</label>
            <input
              id={`${idPrefix}-contribution`}
              type="number"
              min="0"
              step="1000"
              value={scenario.contribution}
              onChange={(e) => onChange('contribution', Number(e.target.value))}
            />
          </div>
        </div>

        <h2 style={{ marginTop: '24px', fontSize: isComparing ? '1.05rem' : undefined }}>
          2. Planning Assumptions
        </h2>
        <div className="card-grid two">
          <div className="form-field">
            <label htmlFor={`${idPrefix}-retAge`}>Planned retirement age</label>
            <input
              id={`${idPrefix}-retAge`}
              type="number"
              min="20"
              max="100"
              value={scenario.retirementAge}
              onChange={(e) => onChange('retirementAge', Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-lifespan`}>Planning lifespan (age)</label>
            <input
              id={`${idPrefix}-lifespan`}
              type="number"
              min="40"
              max="120"
              value={scenario.lifespan}
              onChange={(e) => onChange('lifespan', Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-inflation`}>Assumed annual inflation (%)</label>
            <input
              id={`${idPrefix}-inflation`}
              type="number"
              min="0"
              step="0.1"
              value={scenario.inflation}
              onChange={(e) => onChange('inflation', Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-preReturn`}>Pre-retirement return (%)</label>
            <input
              id={`${idPrefix}-preReturn`}
              type="number"
              min="0"
              step="0.1"
              value={scenario.preReturn}
              onChange={(e) => onChange('preReturn', Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`${idPrefix}-realReturn`}>In-retirement real return (%)</label>
            <input
              id={`${idPrefix}-realReturn`}
              type="number"
              min="0"
              step="0.1"
              value={scenario.realReturn}
              onChange={(e) => onChange('realReturn', Number(e.target.value))}
            />
          </div>
        </div>

        {errorMsg && (
          <p className="form-note" style={{ color: '#b91c1c', marginTop: '10px' }}>
            {errorMsg}
          </p>
        )}
      </div>

      {/* Inline Outcome Cards when in Side-by-Side Mode */}
      {isComparing && (
        <div
          className="pt-4 border-t border-slate-200"
          aria-live="polite"
          data-testid={`retirement-outcomes-${idPrefix}`}
        >
          <h3 className="text-sm font-bold text-slate-800 mt-0 mb-3">
            Outcomes · {scenario.label}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="stat" style={{ padding: '14px' }}>
              <strong style={{ fontSize: '1.15rem' }}>
                {results ? `${results.years} yrs` : '—'}
              </strong>
              <span style={{ fontSize: '0.82rem' }}>Years to retirement</span>
            </div>
            <div className="stat" style={{ padding: '14px' }}>
              <strong style={{ fontSize: '1.15rem' }}>
                {results ? `${results.horizon} yrs` : '—'}
              </strong>
              <span style={{ fontSize: '0.82rem' }}>Funding horizon</span>
            </div>
            <div className="stat" style={{ padding: '14px' }}>
              <strong style={{ fontSize: '1.15rem' }}>
                {results ? formatMoney(results.futureSpending) : '—'}
              </strong>
              <span style={{ fontSize: '0.82rem' }}>Year 1 retirement spending</span>
            </div>
            <div className="stat" style={{ padding: '14px' }}>
              <strong style={{ fontSize: '1.15rem' }}>
                {results ? formatMoney(results.required) : '—'}
              </strong>
              <span style={{ fontSize: '0.82rem' }}>Corpus required</span>
            </div>
            <div className="stat" style={{ padding: '14px' }}>
              <strong style={{ fontSize: '1.15rem' }}>
                {results ? formatMoney(results.projected) : '—'}
              </strong>
              <span style={{ fontSize: '0.82rem' }}>Projected corpus</span>
            </div>
            <div className="stat" style={{ padding: '14px' }}>
              <strong
                style={{
                  fontSize: '1.15rem',
                  color: results && results.gap >= 0 ? '#166534' : '#b91c1c'
                }}
              >
                {results ? formatMoney(results.gap) : '—'}
              </strong>
              <span style={{ fontSize: '0.82rem' }}>Projected gap / surplus</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const RetirementPlanningCalculator: React.FC = () => {
  const [scenarioA, setScenarioA] = useState<RetirementScenarioInputs>({ ...DEFAULT_SCENARIO_A });
  const [scenarioB, setScenarioB] = useState<RetirementScenarioInputs | null>(null);
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [compareViewMode, setCompareViewMode] = useState<'side-by-side' | 'a' | 'b'>('side-by-side');

  const outcomeA = useMemo(() => computeRetirementOutcome(scenarioA), [scenarioA]);
  const outcomeB = useMemo(
    () => (scenarioB ? computeRetirementOutcome(scenarioB) : null),
    [scenarioB]
  );

  const handleUpdateA = <K extends keyof RetirementScenarioInputs>(
    field: K,
    value: RetirementScenarioInputs[K]
  ) => {
    setScenarioA((prev) => ({ ...prev, [field]: value }));
  };

  const handleUpdateB = <K extends keyof RetirementScenarioInputs>(
    field: K,
    value: RetirementScenarioInputs[K]
  ) => {
    setScenarioB((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const handleCompareScenarios = () => {
    setScenarioB((prev) =>
      prev ?? {
        ...scenarioA,
        label: 'Scenario B (Comparison)'
      }
    );
    setIsComparing(true);
    setCompareViewMode('side-by-side');
  };

  const handleDuplicateAtoB = () => {
    setScenarioB({
      ...scenarioA,
      label: scenarioB?.label || 'Scenario B (Comparison)'
    });
  };

  const handleSwapScenarios = () => {
    if (!scenarioB) return;
    const prevA = { ...scenarioA };
    const prevB = { ...scenarioB };
    setScenarioA(prevB);
    setScenarioB(prevA);
  };

  const handleApplyPresetB = (preset: 'delay2' | 'boostSip' | 'conservative') => {
    if (preset === 'delay2') {
      setScenarioB({
        ...scenarioA,
        label: 'Scenario B (+2 Yrs Retire)',
        retirementAge: Math.min(scenarioA.lifespan - 1, scenarioA.retirementAge + 2)
      });
    } else if (preset === 'boostSip') {
      setScenarioB({
        ...scenarioA,
        label: 'Scenario B (+₹20K SIP)',
        contribution: scenarioA.contribution + 20000
      });
    } else {
      setScenarioB({
        ...scenarioA,
        label: 'Scenario B (Conservative)',
        preReturn: Math.max(0, Number((scenarioA.preReturn - 1.5).toFixed(1)))
      });
    }
  };

  const handleCloseComparison = () => {
    setIsComparing(false);
    setCompareViewMode('side-by-side');
  };

  const handleResetA = () => {
    setScenarioA({ ...DEFAULT_SCENARIO_A });
  };

  const handleResetB = () => {
    setScenarioB({
      ...DEFAULT_SCENARIO_A,
      label: 'Scenario B (Comparison)'
    });
  };

  const resultsA = outcomeA.results;
  const resultsB = outcomeB?.results ?? null;
  const comparisonSummary = useMemo(
    () => (resultsA && resultsB ? compareRetirementOutcomes(resultsA, resultsB) : null),
    [resultsA, resultsB]
  );

  return (
    <main
      id="main-content"
      className={isComparing ? 'container page' : 'container narrow page'}
      style={isComparing ? { maxWidth: '1240px' } : undefined}
    >
      <p className="eyebrow">Tool · Finance</p>
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/tools/">Tools</Link>
        <span>/</span>
        <span aria-current="page">Retirement Planning Calculator</span>
      </div>

      <h1>Retirement Planning Calculator</h1>
      <p className="lead">
        Explore a hypothetical retirement corpus requirement and projected corpus using living expenses, inflation, and investment return assumptions.
      </p>

      <section className="content-section panel" data-testid="retirement-calculator-panel">
        {/* Scenario Mode & View Switcher Bar */}
        <div
          className="actions"
          style={{
            marginTop: 0,
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div
              role="group"
              aria-label="Scenario comparison mode"
              className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 gap-1"
            >
              <button
                type="button"
                data-testid="exit-compare-scenario-btn"
                aria-pressed={!isComparing}
                onClick={handleCloseComparison}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  !isComparing
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Single Scenario
              </button>
              <button
                type="button"
                data-testid="compare-scenario-btn"
                aria-pressed={isComparing}
                onClick={handleCompareScenarios}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  isComparing
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Compare Scenarios</span>
              </button>
            </div>

            {isComparing && (
              <>
                <div
                  role="group"
                  aria-label="Comparison layout toggle"
                  data-testid="scenario-view-toggle"
                  className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1"
                >
                  <button
                    type="button"
                    onClick={() => setCompareViewMode('side-by-side')}
                    aria-pressed={compareViewMode === 'side-by-side'}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      compareViewMode === 'side-by-side'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Side-by-Side
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareViewMode('a')}
                    aria-pressed={compareViewMode === 'a'}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      compareViewMode === 'a'
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Scenario A
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareViewMode('b')}
                    aria-pressed={compareViewMode === 'b'}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      compareViewMode === 'b'
                        ? 'bg-teal-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Scenario B
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSwapScenarios}
                  data-testid="swap-scenarios-btn"
                  title="Swap Scenario A and Scenario B inputs"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Swap A ↔ B</span>
                </button>
              </>
            )}

            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                handleResetA();
                if (isComparing) {
                  setScenarioB({
                    ...DEFAULT_SCENARIO_A,
                    label: 'Scenario B (Comparison)'
                  });
                }
              }}
            >
              Reset to Defaults
            </button>
          </div>

          {isComparing && (
            <p className="form-note" style={{ margin: 0 }}>
              Toggle side-by-side or inspect Scenario A vs. Scenario B individually; outcomes update in real time.
            </p>
          )}
        </div>

        {/* Single Scenario or Side-by-Side Comparison Grid */}
        <div
          className={
            isComparing && compareViewMode === 'side-by-side'
              ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-start'
              : ''
          }
        >
          {(!isComparing || compareViewMode === 'side-by-side' || compareViewMode === 'a') && (
            <ScenarioColumn
              idPrefix="a"
              scenario={scenarioA}
              outcome={outcomeA}
              isComparing={isComparing}
              accentColor="#1d4ed8"
              onChange={handleUpdateA}
              onReset={handleResetA}
            />
          )}

          {isComparing &&
            scenarioB &&
            outcomeB &&
            (compareViewMode === 'side-by-side' || compareViewMode === 'b') && (
              <ScenarioColumn
                idPrefix="b"
                scenario={scenarioB}
                outcome={outcomeB}
                isComparing={true}
                accentColor="#0f766e"
                onChange={handleUpdateB}
                onReset={handleResetB}
                onSyncFromA={handleDuplicateAtoB}
                onApplyPreset={handleApplyPresetB}
                onRemove={handleCloseComparison}
              />
            )}
        </div>
      </section>

      {/* Single-Scenario Outcome Cards */}
      {!isComparing && (
        <section className="content-section" aria-live="polite">
          <h2>3. Illustrative results</h2>
          <div className="stats-grid">
            <div className="stat">
              <strong>{resultsA ? `${resultsA.years} years` : '—'}</strong>
              <span>Years to retirement</span>
            </div>
            <div className="stat">
              <strong>{resultsA ? formatMoney(resultsA.futureSpending) : '—'}</strong>
              <span>First-year retirement spending</span>
            </div>
            <div className="stat">
              <strong>{resultsA ? `${resultsA.horizon} years` : '—'}</strong>
              <span>Retirement funding horizon</span>
            </div>
            <div className="stat">
              <strong>{resultsA ? formatMoney(resultsA.required) : '—'}</strong>
              <span>Estimated corpus required</span>
            </div>
            <div className="stat">
              <strong>{resultsA ? formatMoney(resultsA.projected) : '—'}</strong>
              <span>Projected corpus at retirement</span>
            </div>
            <div className="stat">
              <strong
                style={{
                  color: resultsA && resultsA.gap >= 0 ? '#166534' : '#b91c1c'
                }}
              >
                {resultsA ? formatMoney(resultsA.gap) : '—'}
              </strong>
              <span>Projected gap / surplus</span>
            </div>
          </div>
        </section>
      )}

      {/* Side-by-Side Scenario Delta Table */}
      {isComparing && scenarioB && (
        <section
          className="content-section"
          aria-live="polite"
          data-testid="scenario-comparison-table-section"
        >
          <h2>3. Side-by-Side Scenario Comparison</h2>

          {comparisonSummary && resultsA && resultsB && (
            <div
              data-testid="scenario-advantage-banner"
              className={`mb-4 rounded-xl border px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2 ${
                comparisonSummary.leader === 'B'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : comparisonSummary.leader === 'A'
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <span>
                {comparisonSummary.leader === 'tie' ? (
                  <>
                    <strong>Identical Outcomes:</strong> Adjust any assumption in <strong>{scenarioB.label}</strong> (or click a Quick What-If preset) to see how your retirement gap changes.
                  </>
                ) : comparisonSummary.leader === 'B' ? (
                  <>
                    <strong>{scenarioB.label}</strong> improves your projected retirement surplus by{' '}
                    <strong>{formatSignedMoney(comparisonSummary.gapDelta)}</strong> over <strong>{scenarioA.label}</strong>.
                  </>
                ) : (
                  <>
                    <strong>{scenarioA.label}</strong> leads <strong>{scenarioB.label}</strong> by{' '}
                    <strong>{formatSignedMoney(Math.abs(comparisonSummary.gapDelta))}</strong> in projected retirement surplus.
                  </>
                )}
              </span>
              <span className="font-mono text-xs font-semibold">
                Funding Coverage: A {resultsA.fundingCoveragePct.toFixed(0)}% vs. B {resultsB.fundingCoveragePct.toFixed(0)}%
              </span>
            </div>
          )}

          <div className="table-wrap">
            <table data-testid="scenario-comparison-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>{scenarioA.label}</th>
                  <th>{scenarioB.label}</th>
                  <th>Difference (B − A)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Years to retirement</td>
                  <td>{resultsA ? `${resultsA.years} years` : '—'}</td>
                  <td>{resultsB ? `${resultsB.years} years` : '—'}</td>
                  <td>
                    {resultsA && resultsB
                      ? `${resultsB.years - resultsA.years > 0 ? '+' : ''}${resultsB.years - resultsA.years} years`
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <td>Retirement funding horizon</td>
                  <td>{resultsA ? `${resultsA.horizon} years` : '—'}</td>
                  <td>{resultsB ? `${resultsB.horizon} years` : '—'}</td>
                  <td>
                    {resultsA && resultsB
                      ? `${resultsB.horizon - resultsA.horizon > 0 ? '+' : ''}${resultsB.horizon - resultsA.horizon} years`
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <td>First-year retirement spending</td>
                  <td>{resultsA ? formatMoney(resultsA.futureSpending) : '—'}</td>
                  <td>{resultsB ? formatMoney(resultsB.futureSpending) : '—'}</td>
                  <td>
                    {resultsA && resultsB
                      ? formatSignedMoney(resultsB.futureSpending - resultsA.futureSpending)
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <td>Estimated corpus required</td>
                  <td>{resultsA ? formatMoney(resultsA.required) : '—'}</td>
                  <td>{resultsB ? formatMoney(resultsB.required) : '—'}</td>
                  <td>
                    {resultsA && resultsB
                      ? formatSignedMoney(resultsB.required - resultsA.required)
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <td>Projected corpus at retirement</td>
                  <td>{resultsA ? formatMoney(resultsA.projected) : '—'}</td>
                  <td>{resultsB ? formatMoney(resultsB.projected) : '—'}</td>
                  <td
                    style={{
                      fontWeight: 600,
                      color:
                        resultsA && resultsB
                          ? resultsB.projected >= resultsA.projected
                            ? '#166534'
                            : '#b91c1c'
                          : undefined
                    }}
                  >
                    {resultsA && resultsB
                      ? formatSignedMoney(resultsB.projected - resultsA.projected)
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Projected gap / surplus</strong>
                  </td>
                  <td
                    style={{
                      fontWeight: 700,
                      color: resultsA && resultsA.gap >= 0 ? '#166534' : '#b91c1c'
                    }}
                  >
                    {resultsA ? formatMoney(resultsA.gap) : '—'}
                  </td>
                  <td
                    style={{
                      fontWeight: 700,
                      color: resultsB && resultsB.gap >= 0 ? '#166534' : '#b91c1c'
                    }}
                  >
                    {resultsB ? formatMoney(resultsB.gap) : '—'}
                  </td>
                  <td
                    style={{
                      fontWeight: 700,
                      color:
                        resultsA && resultsB
                          ? resultsB.gap >= resultsA.gap
                            ? '#166534'
                            : '#b91c1c'
                          : undefined
                    }}
                  >
                    {resultsA && resultsB
                      ? formatSignedMoney(resultsB.gap - resultsA.gap)
                      : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="content-section">
        <h2>Methodology</h2>
        <p className="tool-output">
          Retirement-year spending = Current annual spending × (1 + inflation)ʸᵉᵃʳˢ
          {'\n\n'}
          Required corpus = W × [1 − (1 + r)⁻ᴺ] ÷ r
        </p>
      </section>

      <section className="content-section financial-disclosure">
        <h2>Financial Content Disclosure</h2>
        <p>
          This website provides general educational information only. It does not provide personalized investment, financial, tax or trading advice.
        </p>
      </section>
    </main>
  );
};
