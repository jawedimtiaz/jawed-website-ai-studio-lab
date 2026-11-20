// functions/api/hq/overview.js
// Studio HQ Executive Dashboard Aggregated Overview API
// Reconciled with Canonical Studio HQ Schema (0001_studio_hq_schema.sql & 0002_financial_management.sql)

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse, hqOptionsResponse } from '../../lib/hqApi.js';

/**
 * Resilient query wrapper: ensures that individual query errors log a warning
 * and return the safe fallback rather than crashing the entire executive dashboard.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {T} fallback
 * @returns {Promise<T>}
 */
async function safeQuery(promise, fallback) {
  try {
    const res = await promise;
    return res !== undefined && res !== null ? res : fallback;
  } catch (err) {
    console.warn('[HQ Overview SafeQuery Warning]', err?.message || err);
    return fallback;
  }
}

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
      renewalsAgg,
      monthlyPaymentsRows,
      recentDeploymentsRows,
      upcomingDeadlinesRows,
      pendingApprovalsRows,
      recentActivityRows
    ] = await Promise.all([
      // 1. Clients summary
      safeQuery(
        db
          .prepare(
            `SELECT
               COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN lower(status) = 'active' THEN 1 ELSE 0 END), 0) AS active
             FROM clients
             WHERE archived_at IS NULL`
          )
          .first(),
        { total: 0, active: 0 }
      ),

      // 2. Leads summary (queried from canonical clients table by status)
      safeQuery(
        db
          .prepare(
            `SELECT
               COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN lower(status) IN ('lead', 'prospect') THEN 1 ELSE 0 END), 0) AS open_leads,
               COALESCE(SUM(CASE WHEN lower(status) IN ('lead', 'prospect') AND created_at >= date('now', '-30 days') THEN 1 ELSE 0 END), 0) AS new_leads
             FROM clients
             WHERE archived_at IS NULL`
          )
          .first(),
        { total: 0, open_leads: 0, new_leads: 0 }
      ),

      // 3. Projects summary
      safeQuery(
        db
          .prepare(
            `SELECT
               COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN lower(status) IN ('lead', 'discovery', 'quoted', 'approved', 'in-progress', 'review', 'blocked') THEN 1 ELSE 0 END), 0) AS active,
               COALESCE(SUM(CASE WHEN lower(status) = 'completed' THEN 1 ELSE 0 END), 0) AS completed
             FROM projects
             WHERE archived_at IS NULL`
          )
          .first(),
        { total: 0, active: 0, completed: 0 }
      ),

      // 4. Project status distribution
      safeQuery(
        db
          .prepare(
            `SELECT status, COUNT(*) AS count
             FROM projects
             WHERE archived_at IS NULL
             GROUP BY status
             ORDER BY count DESC`
          )
          .all(),
        { results: [] }
      ),

      // 5. Overdue tasks
      safeQuery(
        db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM project_tasks
             WHERE archived_at IS NULL
               AND lower(status) NOT IN ('done', 'completed', 'cancelled')
               AND due_date IS NOT NULL AND due_date != '' AND due_date < ?`
          )
          .bind(today)
          .first(),
        { count: 0 }
      ),

      // 6. Pending approvals count
      safeQuery(
        db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM approvals
             WHERE lower(status) = 'pending'`
          )
          .first(),
        { count: 0 }
      ),

      // 7. Quotations summary
      safeQuery(
        db
          .prepare(
            `SELECT
               COUNT(*) AS total,
               COALESCE(SUM(total_minor), 0) AS total_minor
             FROM quotations
             WHERE archived_at IS NULL`
          )
          .first(),
        { total: 0, total_minor: 0 }
      ),

      // 8. Invoices summary (canonical columns: total_minor, amount_paid_minor)
      safeQuery(
        db
          .prepare(
            `SELECT
               COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN lower(status) NOT IN ('void', 'draft') THEN total_minor ELSE 0 END), 0) AS invoiced_minor,
               COALESCE(SUM(CASE WHEN lower(status) NOT IN ('void', 'draft') THEN amount_paid_minor ELSE 0 END), 0) AS paid_minor,
               COALESCE(SUM(CASE WHEN lower(status) NOT IN ('void', 'draft') THEN (total_minor - amount_paid_minor) ELSE 0 END), 0) AS outstanding_minor
             FROM invoices
             WHERE archived_at IS NULL`
          )
          .first(),
        { total: 0, invoiced_minor: 0, paid_minor: 0, outstanding_minor: 0 }
      ),

      // 9. Payments received this month (canonical column: paid_at)
      safeQuery(
        db
          .prepare(
            `SELECT COALESCE(SUM(amount_minor), 0) AS monthly_minor
             FROM payments
             WHERE archived_at IS NULL AND substr(paid_at, 1, 7) = ?`
          )
          .bind(currentMonth)
          .first(),
        { monthly_minor: 0 }
      ),

      // 10. Maintenance renewals upcoming in 30 days
      safeQuery(
        db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM maintenance_plans
             WHERE archived_at IS NULL
               AND lower(status) = 'active'
               AND (
                 (renews_on IS NOT NULL AND renews_on != '' AND renews_on <= ?)
                 OR (ends_on IS NOT NULL AND ends_on != '' AND ends_on <= ?)
               )`
          )
          .bind(in30Days, in30Days)
          .first(),
        { count: 0 }
      ),

      // 11. 6-Month payments revenue series (canonical column: paid_at)
      safeQuery(
        db
          .prepare(
            `SELECT substr(paid_at, 1, 7) AS month, COALESCE(SUM(amount_minor), 0) AS revenue_minor
             FROM payments
             WHERE archived_at IS NULL
             GROUP BY substr(paid_at, 1, 7)
             ORDER BY month DESC
             LIMIT 6`
          )
          .all(),
        { results: [] }
      ),

      // 12. Recent deployments (canonical columns: commit_sha AS version_tag, branch_name AS branch)
      safeQuery(
        db
          .prepare(
            `SELECT d.id, d.environment, d.commit_sha AS version_tag, d.branch_name AS branch, d.status, d.deployment_url, d.deployed_at,
                    p.name AS project_name, c.business_name AS client_business, c.name AS client_name
             FROM deployments d
             LEFT JOIN projects p ON p.id = d.project_id
             LEFT JOIN clients c ON c.id = p.client_id
             ORDER BY d.deployed_at DESC
             LIMIT 5`
          )
          .all(),
        { results: [] }
      ),

      // 13. Upcoming task deadlines
      safeQuery(
        db
          .prepare(
            `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.project_id,
                    p.name AS project_name, 'task' AS kind
             FROM project_tasks t
             LEFT JOIN projects p ON p.id = t.project_id
             WHERE t.archived_at IS NULL
               AND lower(t.status) NOT IN ('done', 'completed', 'cancelled')
               AND t.due_date IS NOT NULL AND t.due_date != ''
             ORDER BY t.due_date ASC
             LIMIT 6`
          )
          .all(),
        { results: [] }
      ),

      // 14. Pending approvals list (canonical columns: approval_type, p.client_id)
      safeQuery(
        db
          .prepare(
            `SELECT a.id, a.approval_type AS stage, COALESCE(a.decision_note, a.approval_type) AS title, a.requested_at, a.project_id,
                    p.name AS project_name, c.business_name AS client_business, c.name AS client_name
             FROM approvals a
             LEFT JOIN projects p ON p.id = a.project_id
             LEFT JOIN clients c ON c.id = p.client_id
             WHERE lower(a.status) = 'pending'
             ORDER BY a.requested_at DESC
             LIMIT 5`
          )
          .all(),
        { results: [] }
      ),

      // 15. Recent activity from canonical audit_logs
      safeQuery(
        db
          .prepare(
            `SELECT id, actor_email, action, entity_type, entity_id, created_at
             FROM audit_logs
             ORDER BY created_at DESC
             LIMIT 8`
          )
          .all(),
        { results: [] }
      )
    ]);

    // Build 6-month revenue series (expenses default to 0 as canonical schema tracks revenue)
    const monthMap = new Map();
    for (const row of monthlyPaymentsRows?.results || []) {
      if (!row.month) continue;
      monthMap.set(row.month, {
        month: row.month,
        revenueMinor: Number(row.revenue_minor || 0),
        expenseMinor: 0
      });
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
        monthlyExpensesMinor: 0,
        upcomingRenewals: Number(renewalsAgg?.count || 0)
      },
      revenueSeries,
      projectDistribution: projectStatuses?.results || [],
      recentDeployments: recentDeploymentsRows?.results || [],
      upcomingDeadlines: upcomingDeadlinesRows?.results || [],
      pendingApprovalsList: pendingApprovalsRows?.results || [],
      recentActivity: recentActivityRows?.results || []
    });
  } catch (err) {
    console.error('[HQ Overview GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to compute executive dashboard metrics');
  }
}

export async function onRequestOptions(context) {
  return hqOptionsResponse(context, 'GET, OPTIONS');
}
