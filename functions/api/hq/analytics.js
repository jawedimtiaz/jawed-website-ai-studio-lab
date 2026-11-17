// functions/api/hq/analytics.js
// Studio HQ Business Performance Analytics API (100% real D1 aggregations)

import { verifyAndAuthorizeOwner, jsonResponse, errorResponse, hqOptionsResponse } from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  const db = env.HQ_DB;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const [
      revenueMonthly,
      expensesMonthly,
      customerPerformance,
      projectPerformance,
      outstandingInvoices,
      totals
    ] = await Promise.all([
      db
        .prepare(
          `SELECT substr(payment_date, 1, 7) AS month,
                  COALESCE(SUM(amount_minor), 0) AS revenue_minor,
                  COUNT(*) AS payment_count
           FROM payments
           WHERE status = 'Recorded'
           GROUP BY substr(payment_date, 1, 7)
           ORDER BY month ASC
           LIMIT 12`
        )
        .all(),
      db
        .prepare(
          `SELECT substr(incurred_date, 1, 7) AS month,
                  COALESCE(SUM(amount_minor), 0) AS expense_minor
           FROM expenses
           WHERE status != 'Void'
           GROUP BY substr(incurred_date, 1, 7)
           ORDER BY month ASC
           LIMIT 12`
        )
        .all(),
      db
        .prepare(
          `SELECT c.id, c.business_name, c.name, c.status,
                  COUNT(DISTINCT p.id) AS project_count,
                  COALESCE((SELECT SUM(i.total_minor) FROM invoices i WHERE i.client_id = c.id AND i.status NOT IN ('Draft', 'Void')), 0) AS invoiced_minor,
                  COALESCE((SELECT SUM(i.paid_amount_minor) FROM invoices i WHERE i.client_id = c.id AND i.status NOT IN ('Draft', 'Void')), 0) AS paid_minor,
                  COALESCE((SELECT SUM(i.balance_due_minor) FROM invoices i WHERE i.client_id = c.id AND i.status NOT IN ('Draft', 'Void')), 0) AS outstanding_minor
           FROM clients c
           LEFT JOIN projects p ON p.client_id = c.id AND p.archived_at IS NULL
           WHERE c.archived_at IS NULL
           GROUP BY c.id
           ORDER BY paid_minor DESC, invoiced_minor DESC
           LIMIT 25`
        )
        .all(),
      db
        .prepare(
          `SELECT p.id, p.name, p.project_type, p.status, p.priority, p.quoted_amount_minor, p.currency,
                  p.start_date, p.target_date, c.business_name AS client_business,
                  (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.archived_at IS NULL) AS total_tasks,
                  (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.archived_at IS NULL AND t.status IN ('Done', 'Completed')) AS completed_tasks,
                  (SELECT COUNT(*) FROM qa_checks q WHERE q.project_id = p.id AND q.status = 'Fail') AS open_defects,
                  COALESCE((SELECT SUM(e.amount_minor) FROM expenses e WHERE e.project_id = p.id AND e.status != 'Void'), 0) AS expense_minor
           FROM projects p
           LEFT JOIN clients c ON c.id = p.client_id
           WHERE p.archived_at IS NULL
           ORDER BY p.updated_at DESC
           LIMIT 30`
        )
        .all(),
      db
        .prepare(
          `SELECT i.id, i.invoice_number, i.title, i.status, i.total_minor, i.paid_amount_minor,
                  i.balance_due_minor, i.currency, i.issue_date, i.due_date,
                  c.business_name AS client_business, c.name AS client_name
           FROM invoices i
           JOIN clients c ON c.id = i.client_id
           WHERE i.balance_due_minor > 0 AND i.status NOT IN ('Draft', 'Void')
           ORDER BY i.due_date ASC`
        )
        .all(),
      db
        .prepare(
          `SELECT
             COALESCE((SELECT SUM(amount_minor) FROM payments WHERE status = 'Recorded'), 0) AS total_revenue_minor,
             COALESCE((SELECT SUM(amount_minor) FROM expenses WHERE status != 'Void'), 0) AS total_expenses_minor,
             COALESCE((SELECT SUM(balance_due_minor) FROM invoices WHERE status NOT IN ('Draft', 'Void')), 0) AS total_outstanding_minor,
             COALESCE((SELECT SUM(balance_due_minor) FROM invoices WHERE status NOT IN ('Draft', 'Void', 'Paid') AND due_date < ?), 0) AS overdue_outstanding_minor`
        )
        .bind(today)
        .first()
    ]);

    const monthMap = new Map();
    for (const r of revenueMonthly.results || []) {
      if (!r.month) continue;
      monthMap.set(r.month, {
        month: r.month,
        revenueMinor: Number(r.revenue_minor || 0),
        expenseMinor: 0,
        paymentCount: Number(r.payment_count || 0)
      });
    }
    for (const e of expensesMonthly.results || []) {
      if (!e.month) continue;
      const cur = monthMap.get(e.month) || { month: e.month, revenueMinor: 0, expenseMinor: 0, paymentCount: 0 };
      cur.expenseMinor = Number(e.expense_minor || 0);
      monthMap.set(e.month, cur);
    }

    return jsonResponse({
      success: true,
      summary: {
        totalRevenueMinor: Number(totals?.total_revenue_minor || 0),
        totalExpensesMinor: Number(totals?.total_expenses_minor || 0),
        netProfitMinor: Number(totals?.total_revenue_minor || 0) - Number(totals?.total_expenses_minor || 0),
        totalOutstandingMinor: Number(totals?.total_outstanding_minor || 0),
        overdueOutstandingMinor: Number(totals?.overdue_outstanding_minor || 0)
      },
      monthlySeries: Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
      customerPerformance: customerPerformance.results || [],
      projectPerformance: projectPerformance.results || [],
      outstandingInvoices: outstandingInvoices.results || []
    });
  } catch (err) {
    console.error('[HQ Analytics GET Error]', err);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to compute analytics');
  }
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, OPTIONS');
}
