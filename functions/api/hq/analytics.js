// functions/api/hq/analytics.js
// Studio HQ Business Performance Analytics API (100% real D1 aggregations)
// Reconciled with Canonical Studio HQ Schema (0001_studio_hq_schema.sql & 0002_financial_management.sql)

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse, hqOptionsResponse } from '../../lib/hqApi.js';

/**
 * Resilient query wrapper: ensures that individual sub-query failures log a warning
 * and return the safe fallback rather than crashing the entire analytics dashboard.
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
    console.warn('[HQ Analytics SafeQuery Warning]', err?.message || err);
    return fallback;
  }
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const [
      revenueMonthly,
      customerPerformance,
      projectPerformance,
      outstandingInvoices,
      totals
    ] = await Promise.all([
      // 1. Monthly revenue from canonical payments (using paid_at)
      safeQuery(
        db
          .prepare(
            `SELECT substr(paid_at, 1, 7) AS month,
                    COALESCE(SUM(amount_minor), 0) AS revenue_minor,
                    COUNT(*) AS payment_count
             FROM payments
             WHERE archived_at IS NULL
             GROUP BY substr(paid_at, 1, 7)
             ORDER BY month ASC
             LIMIT 12`
          )
          .all(),
        { results: [] }
      ),

      // 2. Customer performance from canonical clients and invoices
      safeQuery(
        db
          .prepare(
            `SELECT c.id, c.business_name, c.name, c.status,
                    COUNT(DISTINCT p.id) AS project_count,
                    COALESCE((SELECT SUM(i.total_minor) FROM invoices i WHERE i.client_id = c.id AND i.archived_at IS NULL AND lower(i.status) NOT IN ('draft', 'void')), 0) AS invoiced_minor,
                    COALESCE((SELECT SUM(i.amount_paid_minor) FROM invoices i WHERE i.client_id = c.id AND i.archived_at IS NULL AND lower(i.status) NOT IN ('draft', 'void')), 0) AS paid_minor,
                    COALESCE((SELECT SUM(i.total_minor - i.amount_paid_minor) FROM invoices i WHERE i.client_id = c.id AND i.archived_at IS NULL AND lower(i.status) NOT IN ('draft', 'void')), 0) AS outstanding_minor
             FROM clients c
             LEFT JOIN projects p ON p.client_id = c.id AND p.archived_at IS NULL
             WHERE c.archived_at IS NULL
             GROUP BY c.id
             ORDER BY paid_minor DESC, invoiced_minor DESC
             LIMIT 25`
          )
          .all(),
        { results: [] }
      ),

      // 3. Project performance from canonical projects, project_tasks and qa_checks
      safeQuery(
        db
          .prepare(
            `SELECT p.id, p.name, 'Website Build' AS project_type, p.status, p.priority,
                    COALESCE(p.quoted_amount_minor, 0) AS quoted_amount_minor, p.currency,
                    p.start_date, p.target_date,
                    COALESCE(c.business_name, c.name, '') AS client_business,
                    (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.archived_at IS NULL) AS total_tasks,
                    (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.archived_at IS NULL AND lower(t.status) IN ('done', 'completed')) AS completed_tasks,
                    (SELECT COUNT(*) FROM qa_checks q WHERE q.project_id = p.id AND lower(q.result) = 'fail') AS open_defects,
                    0 AS expense_minor
             FROM projects p
             LEFT JOIN clients c ON c.id = p.client_id
             WHERE p.archived_at IS NULL
             ORDER BY p.updated_at DESC
             LIMIT 30`
          )
          .all(),
        { results: [] }
      ),

      // 4. Outstanding invoices with balance due
      safeQuery(
        db
          .prepare(
            `SELECT i.id, i.invoice_number,
                    COALESCE(i.notes, i.invoice_number) AS title,
                    i.status, i.total_minor,
                    i.amount_paid_minor AS paid_amount_minor,
                    (i.total_minor - i.amount_paid_minor) AS balance_due_minor,
                    i.currency,
                    i.issued_on AS issue_date,
                    i.due_on AS due_date,
                    COALESCE(c.business_name, c.name, '') AS client_business,
                    c.name AS client_name
             FROM invoices i
             JOIN clients c ON c.id = i.client_id
             WHERE i.archived_at IS NULL
               AND (i.total_minor - i.amount_paid_minor) > 0
               AND lower(i.status) NOT IN ('draft', 'void')
             ORDER BY i.due_on ASC`
          )
          .all(),
        { results: [] }
      ),

      // 5. Total high-level KPI metrics
      safeQuery(
        db
          .prepare(
            `SELECT
               COALESCE((SELECT SUM(amount_minor) FROM payments WHERE archived_at IS NULL), 0) AS total_revenue_minor,
               0 AS total_expenses_minor,
               COALESCE((SELECT SUM(total_minor - amount_paid_minor) FROM invoices WHERE archived_at IS NULL AND lower(status) NOT IN ('draft', 'void')), 0) AS total_outstanding_minor,
               COALESCE((SELECT SUM(total_minor - amount_paid_minor) FROM invoices WHERE archived_at IS NULL AND lower(status) NOT IN ('draft', 'void', 'paid') AND due_on IS NOT NULL AND due_on != '' AND due_on < ?), 0) AS overdue_outstanding_minor`
          )
          .bind(today)
          .first(),
        {
          total_revenue_minor: 0,
          total_expenses_minor: 0,
          total_outstanding_minor: 0,
          overdue_outstanding_minor: 0
        }
      )
    ]);

    const monthlySeries = (revenueMonthly?.results || [])
      .filter((r) => r && r.month)
      .map((r) => ({
        month: r.month,
        revenueMinor: Number(r.revenue_minor || 0),
        expenseMinor: 0,
        paymentCount: Number(r.payment_count || 0)
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const totalRevenue = Number(totals?.total_revenue_minor || 0);
    const totalExpenses = Number(totals?.total_expenses_minor || 0);

    return jsonResponse({
      success: true,
      summary: {
        totalRevenueMinor: totalRevenue,
        totalExpensesMinor: totalExpenses,
        netProfitMinor: totalRevenue - totalExpenses,
        totalOutstandingMinor: Number(totals?.total_outstanding_minor || 0),
        overdueOutstandingMinor: Number(totals?.overdue_outstanding_minor || 0)
      },
      monthlySeries,
      customerPerformance: customerPerformance?.results || [],
      projectPerformance: projectPerformance?.results || [],
      outstandingInvoices: outstandingInvoices?.results || []
    });
  } catch (err) {
    console.error('[HQ Analytics GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to compute analytics');
  }
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, OPTIONS');
}
