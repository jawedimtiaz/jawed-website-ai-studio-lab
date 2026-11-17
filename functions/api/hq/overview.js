// functions/api/hq/overview.js
// Studio HQ Executive Dashboard Aggregated Overview API

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse, hqOptionsResponse } from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const currentMonth = nowIso.slice(0, 7);
  const in30Days = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10);

  try {
    const [
      clientsAgg,
      leadsAgg,
      projectsAgg,
      projectStatuses,
      overdueTasksAgg,
      pendingApprovalsAgg,
      quotationsAgg,
      invoicesAgg,
      paymentsMonthAgg,
      expensesMonthAgg,
      renewalsAgg,
      monthlyPaymentsRows,
      monthlyExpensesRows,
      recentDeploymentsRows,
      upcomingDeadlinesRows,
      pendingApprovalsRows,
      recentActivityRows
    ] = await Promise.all([
      db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
        FROM clients
        WHERE archived_at IS NULL
      `).first(),
      db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('New', 'Contacted', 'Qualified') THEN 1 ELSE 0 END) AS open_leads,
          SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) AS new_leads
        FROM leads
      `).first(),
      db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('Planning', 'Quoted', 'Onboarding', 'In Progress', 'Review', 'Client Approval') THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed
        FROM projects
        WHERE archived_at IS NULL
      `).first(),
      db.prepare(`
        SELECT status, COUNT(*) AS count
        FROM projects
        WHERE archived_at IS NULL
        GROUP BY status
        ORDER BY count DESC
      `).all(),
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM project_tasks
        WHERE archived_at IS NULL
          AND status NOT IN ('Done', 'Completed', 'Cancelled')
          AND due_date IS NOT NULL AND due_date != '' AND due_date < ?
      `).bind(today).first(),
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM approvals
        WHERE status = 'Pending'
      `).first(),
      db.prepare(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(total_minor), 0) AS total_minor
        FROM quotations
      `).first(),
      db.prepare(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN status != 'Void' AND status != 'Draft' THEN total_minor ELSE 0 END), 0) AS invoiced_minor,
          COALESCE(SUM(CASE WHEN status != 'Void' AND status != 'Draft' THEN paid_amount_minor ELSE 0 END), 0) AS paid_minor,
          COALESCE(SUM(CASE WHEN status != 'Void' AND status != 'Draft' THEN balance_due_minor ELSE 0 END), 0) AS outstanding_minor
        FROM invoices
      `).first(),
      db.prepare(`
        SELECT COALESCE(SUM(amount_minor), 0) AS monthly_minor
        FROM payments
        WHERE status = 'Recorded' AND substr(payment_date, 1, 7) = ?
      `).bind(currentMonth).first(),
      db.prepare(`
        SELECT COALESCE(SUM(amount_minor), 0) AS monthly_minor
        FROM expenses
        WHERE status != 'Void' AND substr(incurred_date, 1, 7) = ?
      `).bind(currentMonth).first(),
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM maintenance_plans
        WHERE status IN ('Active', 'Expiring Soon')
          AND expiry_date <= ?
      `).bind(in30Days).first(),
      db.prepare(`
        SELECT substr(payment_date, 1, 7) AS month, COALESCE(SUM(amount_minor), 0) AS revenue_minor
        FROM payments
        WHERE status = 'Recorded'
        GROUP BY substr(payment_date, 1, 7)
        ORDER BY month DESC
        LIMIT 6
      `).all(),
      db.prepare(`
        SELECT substr(incurred_date, 1, 7) AS month, COALESCE(SUM(amount_minor), 0) AS expense_minor
        FROM expenses
        WHERE status != 'Void'
        GROUP BY substr(incurred_date, 1, 7)
        ORDER BY month DESC
        LIMIT 6
      `).all(),
      db.prepare(`
        SELECT d.id, d.environment, d.version_tag, d.branch, d.status, d.deployment_url, d.deployed_at,
               p.name AS project_name, c.business_name AS client_business, c.name AS client_name
        FROM deployments d
        LEFT JOIN projects p ON p.id = d.project_id
        LEFT JOIN clients c ON c.id = d.client_id
        ORDER BY d.deployed_at DESC
        LIMIT 5
      `).all(),
      db.prepare(`
        SELECT t.id, t.title, t.status, t.priority, t.due_date, t.project_id,
               p.name AS project_name, 'task' AS kind
        FROM project_tasks t
        LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.archived_at IS NULL
          AND t.status NOT IN ('Done', 'Completed', 'Cancelled')
          AND t.due_date IS NOT NULL AND t.due_date != ''
        ORDER BY t.due_date ASC
        LIMIT 6
      `).all(),
      db.prepare(`
        SELECT a.id, a.stage, a.title, a.requested_at, a.project_id,
               p.name AS project_name, c.business_name AS client_business, c.name AS client_name
        FROM approvals a
        LEFT JOIN projects p ON p.id = a.project_id
        LEFT JOIN clients c ON c.id = a.client_id
        WHERE a.status = 'Pending'
        ORDER BY a.requested_at DESC
        LIMIT 5
      `).all(),
      db.prepare(`
        SELECT id, actor_email, action, entity_type, entity_id, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 8
      `).all()
    ]);

    // Merge 6-month revenue & expenses cleanly
    const monthMap = new Map();
    for (const row of monthlyPaymentsRows.results || []) {
      if (!row.month) continue;
      monthMap.set(row.month, {
        month: row.month,
        revenueMinor: Number(row.revenue_minor || 0),
        expenseMinor: 0
      });
    }
    for (const row of monthlyExpensesRows.results || []) {
      if (!row.month) continue;
      const existing = monthMap.get(row.month) || { month: row.month, revenueMinor: 0, expenseMinor: 0 };
      existing.expenseMinor = Number(row.expense_minor || 0);
      monthMap.set(row.month, existing);
    }
    const revenueSeries = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    return jsonResponse({
      success: true,
      kpis: {
        totalCustomers: Number(clientsAgg?.total || 0),
        activeCustomers: Number(clientsAgg?.active || 0),
        newLeads: Number(leadsAgg?.new_leads || 0),
        openLeads: Number(leadsAgg?.open_leads || 0),
        activeProjects: Number(projectsAgg?.active || 0),
        completedProjects: Number(projectsAgg?.completed || 0),
        totalProjects: Number(projectsAgg?.total || 0),
        overdueTasks: Number(overdueTasksAgg?.count || 0),
        pendingApprovals: Number(pendingApprovalsAgg?.count || 0),
        totalQuotations: Number(quotationsAgg?.total || 0),
        quotationsValueMinor: Number(quotationsAgg?.total_minor || 0),
        invoicedAmountMinor: Number(invoicesAgg?.invoiced_minor || 0),
        paymentsReceivedMinor: Number(invoicesAgg?.paid_minor || 0),
        outstandingPaymentsMinor: Number(invoicesAgg?.outstanding_minor || 0),
        monthlyRevenueMinor: Number(paymentsMonthAgg?.monthly_minor || 0),
        monthlyExpensesMinor: Number(expensesMonthAgg?.monthly_minor || 0),
        upcomingRenewals: Number(renewalsAgg?.count || 0)
      },
      revenueSeries,
      projectDistribution: projectStatuses.results || [],
      recentDeployments: recentDeploymentsRows.results || [],
      upcomingDeadlines: upcomingDeadlinesRows.results || [],
      pendingApprovalsList: pendingApprovalsRows.results || [],
      recentActivity: recentActivityRows.results || []
    });
  } catch (err) {
    console.error('[HQ Overview GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to compute executive dashboard metrics');
  }
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, OPTIONS');
}
