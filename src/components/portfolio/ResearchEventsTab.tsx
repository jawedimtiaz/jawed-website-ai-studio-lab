import React, { useState, useMemo } from 'react';
import {
  Calendar,
  BookOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  Search,
  ShieldAlert,
  TrendingUp,
  X
} from 'lucide-react';
import { PortfolioData, PortfolioEventItem, ThesisEntry } from '../../types/portfolio';
import { MOCK_PORTFOLIO_DATA } from '../../services/portfolioService';

interface ResearchEventsTabProps {
  data: PortfolioData;
  onAddEvent: (evt: PortfolioEventItem) => void;
  onAddThesis: (thesis: ThesisEntry) => void;
}

export const ResearchEventsTab: React.FC<ResearchEventsTabProps> = ({
  data,
  onAddEvent,
  onAddThesis
}) => {
  const [eventFilter, setEventFilter] = useState<'ALL' | 'Upcoming' | 'Completed'>('ALL');
  const [thesisSearch, setThesisSearch] = useState('');
  const [expandedThesisIds, setExpandedThesisIds] = useState<Record<string, boolean>>({
    'thesis-nvda': true,
    'thesis-msft': true
  });

  const [showEventModal, setShowEventModal] = useState(false);
  const [showThesisModal, setShowThesisModal] = useState(false);

  // Add Event State
  const [evtDate, setEvtDate] = useState('2026-12-01');
  const [evtTicker, setEvtTicker] = useState('');
  const [evtCompany, setEvtCompany] = useState('');
  const [evtType, setEvtType] = useState('Earnings');
  const [evtNotes, setEvtNotes] = useState('');

  // Add Thesis State
  const [thTicker, setThTicker] = useState('');
  const [thCompany, setThCompany] = useState('');
  const [thMarket, setThMarket] = useState<'US' | 'IN' | 'MF'>('US');
  const [thRole, setThRole] = useState('Core Growth');
  const [thConviction, setThConviction] = useState<'High' | 'Medium-High' | 'Medium'>('High');
  const [thSummary, setThSummary] = useState('');
  const [thCatalysts, setThCatalysts] = useState('');
  const [thRisks, setThRisks] = useState('');
  const [thValuation, setThValuation] = useState('');

  // Combine explicit theses with fallback synthesized theses if live sheet doesn't include `theses`
  const thesisList = useMemo<ThesisEntry[]>(() => {
    const base = data.theses && data.theses.length > 0 ? data.theses : MOCK_PORTFOLIO_DATA.theses || [];
    const existingTickers = new Set(base.map((t) => t.ticker.toUpperCase()));

    const synthesized: ThesisEntry[] = data.holdings
      .filter((h) => !existingTickers.has(h.ticker.toUpperCase()))
      .map((h) => ({
        id: `thesis-${h.ticker.toLowerCase()}`,
        ticker: h.ticker,
        company: h.name,
        market: h.market,
        role: h.role,
        thesisStatus: h.thesisStatus,
        lastUpdated: data.meta.lastUpdated.slice(0, 10),
        conviction: h.allocationPct >= 10 ? 'High' : 'Medium-High',
        summary:
          h.thesisNote ||
          `${h.name} serves as a ${h.role} holding in the ${h.market} sleeve (${h.allocationPct.toFixed(1)}% weight).`,
        bullCase: [
          `Sustained earnings compounding and market share leadership within ${h.sector || h.market} segment.`,
          `Disciplined capital allocation and strong return on invested capital.`
        ],
        risksAndKillCriteria: [
          `Structural margin deterioration or loss of competitive moat over 2+ consecutive quarters.`,
          `Valuation expansion significantly detached from underlying cash flow growth.`
        ],
        valuationMetrics: `Portfolio Allocation: ${h.allocationPct.toFixed(1)}% | Current P&L: ${
          h.pnlPct >= 0 ? '+' : ''
        }${h.pnlPct.toFixed(1)}%`
      }));

    return [...base, ...synthesized];
  }, [data.theses, data.holdings, data.meta.lastUpdated]);

  const filteredEvents = useMemo(() => {
    const list =
      eventFilter === 'ALL'
        ? data.events
        : data.events.filter((e) => e.status.toLowerCase() === eventFilter.toLowerCase());
    return [...list].sort((a, b) => a.date.localeCompare(b.date));
  }, [data.events, eventFilter]);

  const filteredTheses = useMemo(() => {
    const q = thesisSearch.trim().toLowerCase();
    if (!q) return thesisList;
    return thesisList.filter(
      (t) =>
        t.ticker.toLowerCase().includes(q) ||
        t.company.toLowerCase().includes(q) ||
        t.role.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q)
    );
  }, [thesisList, thesisSearch]);

  const toggleThesisExpand = (id: string) => {
    setExpandedThesisIds((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const expandAllTheses = () => {
    const next: Record<string, boolean> = {};
    filteredTheses.forEach((t) => {
      next[t.id] = true;
    });
    setExpandedThesisIds(next);
  };

  const collapseAllTheses = () => {
    setExpandedThesisIds({});
  };

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!evtTicker.trim() || !evtCompany.trim()) return;
    onAddEvent({
      date: evtDate,
      ticker: evtTicker.trim().toUpperCase(),
      company: evtCompany.trim(),
      type: evtType,
      status: 'Upcoming',
      notes: evtNotes.trim() || 'Monitor guidance and management commentary.'
    });
    setShowEventModal(false);
    setEvtTicker('');
    setEvtCompany('');
    setEvtNotes('');
  };

  const handleCreateThesis = (e: React.FormEvent) => {
    e.preventDefault();
    if (!thTicker.trim() || !thCompany.trim() || !thSummary.trim()) return;

    const entry: ThesisEntry = {
      id: `thesis-${thTicker.trim().toLowerCase()}-${Date.now()}`,
      ticker: thTicker.trim().toUpperCase(),
      company: thCompany.trim(),
      market: thMarket,
      role: thRole.trim() || 'Core Growth',
      thesisStatus: 'Validated',
      lastUpdated: new Date().toISOString().slice(0, 10),
      conviction: thConviction,
      summary: thSummary.trim(),
      bullCase: thCatalysts
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      risksAndKillCriteria: thRisks
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      valuationMetrics: thValuation.trim() || 'Target IRR > 15% over 5-year horizon'
    };

    onAddThesis(entry);
    setExpandedThesisIds((prev) => ({ ...prev, [entry.id]: true }));
    setShowThesisModal(false);
    setThTicker('');
    setThCompany('');
    setThSummary('');
    setThCatalysts('');
    setThRisks('');
    setThValuation('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Portfolio Events & Catalyst Timeline (5 cols on lg) */}
      <div className="lg:col-span-5 bg-[#0f172a] border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-400" />
              <span>Portfolio Events &amp; Catalyst Calendar</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Earnings releases, macro policy decisions, and thesis verification checkpoints.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowEventModal(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Event</span>
          </button>
        </div>

        {/* Filter Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-[#0b1120] border border-slate-800 rounded-lg">
          {(['ALL', 'Upcoming', 'Completed'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setEventFilter(status)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                eventFilter === status
                  ? 'bg-[#1e293b] text-sky-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {status === 'ALL' ? 'All Events' : status}
            </button>
          ))}
        </div>

        {/* Timeline List */}
        <div className="space-y-3">
          {filteredEvents.map((evt, idx) => {
            const isUpcoming = evt.status.toLowerCase() === 'upcoming';
            return (
              <div
                key={`${evt.ticker}-${evt.date}-${idx}`}
                className="p-4 rounded-xl bg-[#0b1120] border border-slate-800/90 hover:border-slate-700 transition-colors space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span className="text-sky-400 font-semibold">{evt.date}</span>
                    <span className="text-slate-600">·</span>
                    <span className="font-bold text-slate-100">{evt.ticker}</span>
                    <span className="text-slate-400 font-sans">({evt.company})</span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                      isUpcoming ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {isUpcoming ? (
                      <Clock className="w-3 h-3" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    <span>{evt.type} · {evt.status}</span>
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{evt.notes}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Expandable Investment Thesis Repository (7 cols on lg) */}
      <div className="lg:col-span-7 bg-[#0f172a] border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              <span>Investment Thesis Repository</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Expandable underwriting notes, bull-case catalysts, and objective kill criteria.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={expandAllTheses}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-slate-100 bg-[#0b1120] border border-slate-800 rounded-lg cursor-pointer"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAllTheses}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-slate-100 bg-[#0b1120] border border-slate-800 rounded-lg cursor-pointer"
            >
              Collapse All
            </button>
            <button
              type="button"
              onClick={() => setShowThesisModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Thesis Note</span>
            </button>
          </div>
        </div>

        {/* Thesis Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={thesisSearch}
            onChange={(e) => setThesisSearch(e.target.value)}
            placeholder="Search thesis repository by ticker, company, moat, or keyword..."
            className="w-full pl-10 pr-4 py-2 bg-[#0b1120] border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Expandable Thesis Cards */}
        <div className="space-y-3">
          {filteredTheses.map((item) => {
            const isExpanded = !!expandedThesisIds[item.id];
            const isOnTrack =
              item.thesisStatus.toLowerCase().includes('track') ||
              item.thesisStatus.toLowerCase().includes('valid');

            return (
              <div
                key={item.id}
                className="rounded-xl bg-[#0b1120] border border-slate-800/90 overflow-hidden transition-colors"
              >
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleThesisExpand(item.id)}
                  className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-[#1e293b]/40 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-slate-100">
                        {item.ticker}
                      </span>
                      <span className="text-xs font-medium text-slate-300">{item.company}</span>
                      <span className="text-xs text-slate-600">·</span>
                      <span className="text-xs text-sky-400">{item.role}</span>
                      <span className="text-xs text-slate-600">·</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Conviction: {item.conviction}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">{item.summary}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs font-medium ${
                        isOnTrack ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {item.thesisStatus}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-sky-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Accordion Body */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 space-y-4 text-xs">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 mb-1">
                        Core Underwriting Thesis
                      </div>
                      <p className="text-slate-200 leading-relaxed">{item.summary}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Bull Case Catalysts */}
                      {item.bullCase && item.bullCase.length > 0 && (
                        <div className="p-3 rounded-lg bg-[#0f172a] border border-slate-800/80 space-y-2">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>Key Growth Catalysts</span>
                          </div>
                          <ul className="space-y-1.5 text-slate-300 list-disc pl-4">
                            {item.bullCase.map((b, i) => (
                              <li key={i} className="leading-relaxed">
                                {b}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Kill Criteria & Risks */}
                      {item.risksAndKillCriteria && item.risksAndKillCriteria.length > 0 && (
                        <div className="p-3 rounded-lg bg-[#0f172a] border border-slate-800/80 space-y-2">
                          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Kill Criteria &amp; Key Risks</span>
                          </div>
                          <ul className="space-y-1.5 text-slate-300 list-disc pl-4">
                            {item.risksAndKillCriteria.map((r, i) => (
                              <li key={i} className="leading-relaxed">
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Valuation & Audit Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400 font-mono tabular-nums">
                      <span>{item.valuationMetrics}</span>
                      <span>Last Reviewed: {item.lastUpdated}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Catalyst Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-slate-100">
                Add Portfolio Catalyst Event
              </h3>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Event Date *</label>
                  <input
                    type="date"
                    required
                    value={evtDate}
                    onChange={(e) => setEvtDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Event Type</label>
                  <select
                    value={evtType}
                    onChange={(e) => setEvtType(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  >
                    <option value="Earnings">Earnings Release</option>
                    <option value="Macro">Macro / Central Bank</option>
                    <option value="Product">Product / AI Keynote</option>
                    <option value="Rebalance">Portfolio Rebalance</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Ticker *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MSFT"
                    value={evtTicker}
                    onChange={(e) => setEvtTicker(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Company / Entity *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Microsoft"
                    value={evtCompany}
                    onChange={(e) => setEvtCompany(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Research Watch Notes *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Key metrics to verify during event..."
                  value={evtNotes}
                  onChange={(e) => setEvtNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 bg-[#1e293b] text-slate-300 rounded-lg hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-500 text-slate-950 font-semibold rounded-lg hover:bg-sky-400 cursor-pointer"
                >
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Thesis Note Modal */}
      {showThesisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-slate-100">
                Author New Investment Thesis Note
              </h3>
              <button
                type="button"
                onClick={() => setShowThesisModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateThesis} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Ticker *</label>
                  <input
                    type="text"
                    required
                    placeholder="TSM"
                    value={thTicker}
                    onChange={(e) => setThTicker(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Company *</label>
                  <input
                    type="text"
                    required
                    placeholder="TSMC"
                    value={thCompany}
                    onChange={(e) => setThCompany(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Conviction</label>
                  <select
                    value={thConviction}
                    onChange={(e) =>
                      setThConviction(e.target.value as 'High' | 'Medium-High' | 'Medium')
                    }
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  >
                    <option value="High">High</option>
                    <option value="Medium-High">Medium-High</option>
                    <option value="Medium">Medium</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Market Sleeve</label>
                  <select
                    value={thMarket}
                    onChange={(e) => setThMarket(e.target.value as 'US' | 'IN' | 'MF')}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  >
                    <option value="US">US Equities</option>
                    <option value="IN">Indian Equities</option>
                    <option value="MF">Mutual Funds</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Strategic Role</label>
                  <input
                    type="text"
                    value={thRole}
                    onChange={(e) => setThRole(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Core Thesis Summary *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Describe structural moat and compounding engine..."
                  value={thSummary}
                  onChange={(e) => setThSummary(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Key Catalysts (One per line)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="CoWoS capacity doubling&#10;2nm GAA node pricing power"
                    value={thCatalysts}
                    onChange={(e) => setThCatalysts(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Kill Criteria (One per line)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Gross margin < 50%&#10;Customer concentration loss"
                    value={thRisks}
                    onChange={(e) => setThRisks(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Valuation Multiples</label>
                <input
                  type="text"
                  placeholder="Forward P/E: 21x | ROIC: 28%"
                  value={thValuation}
                  onChange={(e) => setThValuation(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowThesisModal(false)}
                  className="px-4 py-2 bg-[#1e293b] text-slate-300 rounded-lg hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-500 text-white font-semibold rounded-lg hover:bg-indigo-400 cursor-pointer"
                >
                  Publish Thesis
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
