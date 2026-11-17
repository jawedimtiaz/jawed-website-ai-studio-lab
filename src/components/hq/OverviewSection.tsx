// src/components/hq/OverviewSection.tsx
// Executive Dashboard using 100% real backend metrics from /api/hq/overview

import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, ArrowUpRight, CheckCircle2, Clock, Rocket, FileText } from 'lucide-react';
import { hqFetch, formatMoney, formatDate, formatDateTime } from '../../services/hqService';
import { HqOverviewKpis, RevenueSeriesPoint, HqSubView } from '../../types/hq';
import { KpiStatCard, StatusDotText, ProjectStatusBadge, getProjectStatusMeta, EmptyState, LoadingSkeleton } from './HqUiPrimitives';

interface OverviewResponse {
  kpis: HqOverviewKpis;
  revenueSeries: RevenueSeriesPoint[];
  projectDistribution: Array<{ status: string; count: number }>;
  recentDeployments: Array<{
    id: string;
    environment: string;
    version_tag: string;
    branch: string;
    status: string;
    deployment_url: string;
    deployed_at: string;
    project_name: string;
    client_business: string;
    client_name: string;
  }>;
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string;
    project_id: string;
    project_name: string;
  }>;
  pendingApprovalsList: Array<{
    id: string;
    stage: string;
    title: string;
    requested_at: string;
    project_id: string;
    project_name: string;
    client_business: string;
  }>;
  recentActivity: Array<{
    id: string;
    actor_email: string;
    action: string;
    entity_type: string;
    entity_id: string;
    created_at: string;
  }>;
}

export const OverviewSection: React.FC<{
  onNavigate: (subView: HqSubView) => void;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ onNavigate, onToast }) => {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await hqFetch<OverviewResponse>('/api/hq/overview');
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleQuickApprove = async (approvalId: string) => {
    try {
      await hqFetch('/api/hq/approvals', {
        method: 'PUT',
        body: JSON.stringify({ id: approvalId, status: 'Approved', decision_notes: 'Approved from Executive Overview' })
      });
      onToast('success', 'Approval marked as Approved');
      loadOverview();
    } catch (err: any) {
      onToast('error', err.message || 'Failed to approve item');
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Unable to load Executive Overview"
        description={error || 'Backend data could not be loaded.'}
        actionLabel="Retry"
        onAction={loadOverview}
      />
    );
  }

  const { kpis, revenueSeries, projectDistribution, recentDeployments, upcomingDeadlines, pendingApprovalsList, recentActivity } =
    data;
  const maxChartVal = Math.max(
    1,
    ...revenueSeries.map((pt) => Math.max(pt.revenueMinor || 0, pt.expenseMinor || 0))
  );
  const totalProjectCount = Math.max(
    1,
    projectDistribution.reduce((acc, item) => acc + Number(item.count || 0), 0)
  );

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Executive Overview</h1>
          <p className="text-xs text-slate-500 mt-0.5">Live metrics across CRM, Delivery, Billing & Operations</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('crm-leads')}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
          >
            + New Lead
          </button>
          <button
            type="button"
            onClick={() => onNavigate('projects-all')}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
          >
            + New Project
          </button>
          <button
            type="button"
            onClick={() => onNavigate('business-invoices')}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
          >
            + Create Invoice
          </button>
          <button
            type="button"
            onClick={loadOverview}
            aria-label="Refresh overview"
            className="p-2 text-slate-500 bg-white border border-slate-200 rounded-md hover:text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiStatCard
          label="Monthly Revenue"
          value={formatMoney(kpis.monthlyRevenueMinor)}
          subtext={`Expenses this month: ${formatMoney(kpis.monthlyExpensesMinor)}`}
          emphasis="positive"
          onClick={() => onNavigate('analytics-revenue')}
        />
        <KpiStatCard
          label="Outstanding Payments"
          value={formatMoney(kpis.outstandingPaymentsMinor)}
          subtext={`Received total: ${formatMoney(kpis.paymentsReceivedMinor)}`}
          emphasis={kpis.outstandingPaymentsMinor > 0 ? 'warning' : 'default'}
          onClick={() => onNavigate('analytics-outstanding')}
        />
        <KpiStatCard
          label="Active Projects"
          value={kpis.activeProjects}
          subtext={`${kpis.completedProjects} completed · ${kpis.totalProjects} total`}
          onClick={() => onNavigate('projects-active')}
        />
        <KpiStatCard
          label="Customers & Leads"
          value={`${kpis.activeCustomers} / ${kpis.totalCustomers}`}
          subtext={`Active of total · ${kpis.newLeads} new leads (${kpis.openLeads} open)`}
          onClick={() => onNavigate('crm-customers')}
        />
      </div>

      {/* Secondary Operations Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiStatCard
          label="Invoiced Total"
          value={formatMoney(kpis.invoicedAmountMinor)}
          onClick={() => onNavigate('business-invoices')}
        />
        <KpiStatCard
          label="Quotations"
          value={kpis.totalQuotations}
          subtext={formatMoney(kpis.quotationsValueMinor)}
          onClick={() => onNavigate('business-quotations')}
        />
        <KpiStatCard
          label="Payments Received"
          value={formatMoney(kpis.paymentsReceivedMinor)}
          onClick={() => onNavigate('business-payments')}
        />
        <KpiStatCard
          label="Overdue Tasks"
          value={kpis.overdueTasks}
          emphasis={kpis.overdueTasks > 0 ? 'danger' : 'default'}
          onClick={() => onNavigate('projects-tasks')}
        />
        <KpiStatCard
          label="Pending Approvals"
          value={kpis.pendingApprovals}
          emphasis={kpis.pendingApprovals > 0 ? 'warning' : 'default'}
          onClick={() => onNavigate('ops-approvals')}
        />
        <KpiStatCard
          label="Renewals (30d)"
          value={kpis.upcomingRenewals}
          emphasis={kpis.upcomingRenewals > 0 ? 'warning' : 'default'}
          onClick={() => onNavigate('ops-maintenance')}
        />
      </div>

      {/* Charts Grid: Revenue vs Expenses + Project Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Revenue vs Expenses (Last 6 Months)</h2>
              <p className="text-xs text-slate-500">Recorded payments against logged business expenses</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" /> Revenue
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-300" /> Expenses
              </span>
            </div>
          </div>

          {revenueSeries.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-md">
              No recorded payments or expenses yet. Financial trends will appear here once transactions are logged.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-48 flex items-end gap-4 pt-4 border-b border-slate-200 px-2">
                {revenueSeries.map((pt) => {
                  const revH = Math.max(4, Math.round((pt.revenueMinor / maxChartVal) * 100));
                  const expH = Math.max(pt.expenseMinor > 0 ? 4 : 0, Math.round((pt.expenseMinor / maxChartVal) * 100));
                  return (
                    <div key={pt.month} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                      <div className="w-full h-36 flex items-end justify-center gap-1.5">
                        <div
                          className="w-5 sm:w-7 bg-blue-600 rounded-t transition-all"
                          style={{ height: `${revH}%` }}
                          title={`Revenue ${pt.month}: ${formatMoney(pt.revenueMinor)}`}
                        />
                        <div
                          className="w-5 sm:w-7 bg-slate-300 rounded-t transition-all"
                          style={{ height: `${expH}%` }}
                          title={`Expenses ${pt.month}: ${formatMoney(pt.expenseMinor)}`}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 truncate">{pt.month}</span>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {revenueSeries.slice(-3).map((pt) => (
                  <div key={pt.month} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
                    <div className="font-mono text-slate-500">{pt.month}</div>
                    <div className="font-mono font-semibold text-slate-900 mt-0.5">{formatMoney(pt.revenueMinor)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Project Status Distribution</h2>
            <button
              type="button"
              onClick={() => onNavigate('projects-all')}
              className="text-xs font-medium text-blue-700 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {projectDistribution.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-md">
              No projects recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {projectDistribution.map((row) => {
                const pct = Math.round((Number(row.count) / totalProjectCount) * 100);
                const meta = getProjectStatusMeta(row.status);
                return (
                  <div key={row.status} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <ProjectStatusBadge status={row.status} />
                      <span className="font-mono tabular-nums text-slate-700 font-medium shrink-0">
                        {row.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${meta.barColor} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Actionable Operational Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pending Approvals */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-slate-900">Pending Approvals</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ops-approvals')}
              className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
            >
              Manage all
            </button>
          </div>
          {pendingApprovalsList.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No pending project approvals.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingApprovalsList.map((ap) => (
                <div key={ap.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{ap.title}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {ap.client_business} · {ap.project_name} · {ap.stage}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickApprove(ap.id)}
                    className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 shrink-0 cursor-pointer"
                  >
                    Approve
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Deadlines */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-700" />
              <h2 className="text-sm font-semibold text-slate-900">Upcoming Task Deadlines</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('projects-tasks')}
              className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
            >
              Open tasks
            </button>
          </div>
          {upcomingDeadlines.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No upcoming task due dates scheduled.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {upcomingDeadlines.map((t) => (
                <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{t.title}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {t.project_name} · {t.priority}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono text-slate-700">{formatDate(t.due_date)}</div>
                    <StatusDotText status={t.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Deployments */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-blue-700" />
              <h2 className="text-sm font-semibold text-slate-900">Recent Deployments</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('dev-deployments')}
              className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
            >
              Release log
            </button>
          </div>
          {recentDeployments.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No deployments logged yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentDeployments.map((d) => (
                <div key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {d.project_name} · <span className="font-mono text-xs">{d.version_tag}</span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {d.client_business} · {d.environment} ({d.branch})
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <StatusDotText status={d.status} />
                    <div className="text-[11px] font-mono text-slate-400">{formatDate(d.deployed_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity (Audit Ledger) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-900">Recent Workspace Activity</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('settings-audit-logs')}
              className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
            >
              Audit logs
            </button>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No activity logged yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentActivity.map((act) => (
                <div key={act.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-semibold text-slate-800 truncate">{act.action}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {act.entity_type} · {act.actor_email || 'system'}
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 shrink-0">{formatDateTime(act.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
