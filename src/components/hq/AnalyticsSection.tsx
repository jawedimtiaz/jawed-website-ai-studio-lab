// src/components/hq/AnalyticsSection.tsx
// Studio HQ Performance Analytics (100% real D1 aggregations)

import React, { useEffect, useState, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import { hqFetch, formatMoney, formatDate } from '../../services/hqService';
import { HqAnalyticsResponse, HqSubView } from '../../types/hq';
import { getClientProjectCount } from '../../services/hqClientHelpers';
import { KpiStatCard, StatusDotText, ProjectStatusBadge, EmptyState, LoadingSkeleton } from './HqUiPrimitives';

export const AnalyticsSection: React.FC<{
  subView: HqSubView;
  onSubViewChange: (sv: HqSubView) => void;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ subView, onSubViewChange, onToast }) => {
  const activeTab =
    subView === 'analytics-customers'
      ? 'customers'
      : subView === 'analytics-projects'
        ? 'projects'
        : subView === 'analytics-outstanding'
          ? 'outstanding'
          : 'revenue';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HqAnalyticsResponse | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hqFetch<HqAnalyticsResponse>('/api/hq/analytics');
      setData(res);
    } catch (err: any) {
      onToast('error', err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const tabs: Array<{ key: HqSubView; label: string }> = [
    { key: 'analytics-revenue', label: 'Revenue & Profit' },
    { key: 'analytics-customers', label: 'Customer Performance' },
    { key: 'analytics-projects', label: 'Project Performance' },
    { key: 'analytics-outstanding', label: 'Outstanding Payments' }
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Business Analytics</h1>
          <p className="text-xs text-slate-500 mt-0.5">Live revenue, customer yield, project margins, and receivables aging</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onSubViewChange(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                subView === t.key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : !data ? (
        <EmptyState
          icon={<BarChart3 className="w-5 h-5" />}
          title="Analytics unavailable"
          description="Could not load financial and operational analytics."
          actionLabel="Retry"
          onAction={loadAnalytics}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiStatCard label="Total Revenue" value={formatMoney(data.summary.totalRevenueMinor)} emphasis="positive" />
            <KpiStatCard label="Total Expenses" value={formatMoney(data.summary.totalExpensesMinor)} />
            <KpiStatCard
              label="Net Studio Profit"
              value={formatMoney(data.summary.netProfitMinor)}
              emphasis={data.summary.netProfitMinor >= 0 ? 'positive' : 'danger'}
            />
            <KpiStatCard
              label="Total Outstanding"
              value={formatMoney(data.summary.totalOutstandingMinor)}
              subtext={`Overdue: ${formatMoney(data.summary.overdueOutstandingMinor)}`}
              emphasis={data.summary.overdueOutstandingMinor > 0 ? 'danger' : 'warning'}
            />
          </div>

          {activeTab === 'revenue' && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
                Monthly Revenue, Expenses & Net Cashflow
              </div>
              {data.monthlySeries.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-500">No monthly cashflow records available yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Month</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Payments</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Revenue</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Expenses</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.monthlySeries.map((row) => {
                      const net = row.revenueMinor - row.expenseMinor;
                      return (
                        <tr key={row.month}>
                          <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">{row.month}</td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-slate-600">{row.paymentCount || 0}</td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-emerald-700 font-medium">
                            {formatMoney(row.revenueMinor)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-slate-700">
                            {formatMoney(row.expenseMinor)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono tabular-nums text-xs font-semibold ${
                              net >= 0 ? 'text-slate-900' : 'text-rose-700'
                            }`}
                          >
                            {formatMoney(net)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'customers' && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
                Customer Revenue & Project Yield
              </div>
              {data.customerPerformance.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-500">No customers found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Customer</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Projects</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Invoiced</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Paid</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.customerPerformance.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{c.business_name || c.name}</td>
                        <td className="px-4 py-3">
                          <StatusDotText status={c.status} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs">{getClientProjectCount(c)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs">{formatMoney(c.invoiced_minor)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-emerald-700 font-medium">
                          {formatMoney(c.paid_minor)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs font-semibold">
                          {formatMoney(c.outstanding_minor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
                Project Delivery & Defect Health
              </div>
              {data.projectPerformance.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-500">No projects recorded.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Project & Client</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Stage</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Tasks Done</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Open QA Fails</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Quoted</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Direct Expenses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.projectPerformance.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{p.name}</div>
                          <div className="text-xs text-slate-500">{p.client_business}</div>
                        </td>
                        <td className="px-4 py-3">
                          <ProjectStatusBadge status={p.status} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs">
                          {p.completed_tasks}/{p.total_tasks}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-rose-700 font-medium">
                          {p.open_defects}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs">
                          {formatMoney(p.quoted_amount_minor, p.currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs">
                          {formatMoney(p.expense_minor, p.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'outstanding' && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
                Open & Overdue Invoices
              </div>
              {data.outstandingInvoices.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-500">All issued invoices are settled.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Invoice #</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Customer</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Due Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Total</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.outstandingInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700">{inv.invoice_number}</td>
                        <td className="px-4 py-3 text-xs text-slate-800">{inv.client_business || inv.client_name}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-600">{formatDate(inv.due_date)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs">
                          {formatMoney(inv.total_minor, inv.currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs font-semibold text-rose-700">
                          {formatMoney(inv.balance_due_minor, inv.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
