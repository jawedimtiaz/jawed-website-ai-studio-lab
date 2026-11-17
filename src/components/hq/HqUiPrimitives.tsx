// src/components/hq/HqUiPrimitives.tsx
// Reusable SaaS UI Primitives for Jawed Web Studio HQ

import React, { useEffect } from 'react';
import { X, AlertTriangle, Printer, Download, Search } from 'lucide-react';
import { formatMoney, formatDate } from '../../services/hqService';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

const STATUS_DOT_COLOR: Record<string, string> = {
  active: 'bg-emerald-600',
  Active: 'bg-emerald-600',
  Completed: 'bg-emerald-600',
  completed: 'bg-emerald-600',
  Paid: 'bg-emerald-600',
  Approved: 'bg-emerald-600',
  Accepted: 'bg-emerald-600',
  Pass: 'bg-emerald-600',
  Verified: 'bg-emerald-600',
  Resolved: 'bg-emerald-600',
  Succeeded: 'bg-emerald-600',
  Healthy: 'bg-emerald-600',
  Recorded: 'bg-emerald-600',
  Converted: 'bg-emerald-600',

  'In Progress': 'bg-blue-600',
  Issued: 'bg-blue-600',
  Sent: 'bg-blue-600',
  Qualified: 'bg-blue-600',
  Scheduled: 'bg-blue-600',
  Planning: 'bg-blue-600',
  Review: 'bg-blue-600',
  'Under Review': 'bg-blue-600',
  onboarding: 'bg-blue-600',
  Onboarding: 'bg-blue-600',
  Quoted: 'bg-blue-600',

  Pending: 'bg-amber-500',
  'Client Approval': 'bg-amber-500',
  'Partially Paid': 'bg-amber-500',
  'Expiring Soon': 'bg-amber-500',
  'Waiting on Client': 'bg-amber-500',
  'Changes Requested': 'bg-amber-500',
  Contacted: 'bg-amber-500',
  New: 'bg-amber-500',
  Delayed: 'bg-amber-500',
  paused: 'bg-amber-500',
  'On Hold': 'bg-amber-500',
  Paused: 'bg-amber-500',
  Open: 'bg-amber-500',

  Fail: 'bg-rose-600',
  Failed: 'bg-rose-600',
  Overdue: 'bg-rose-600',
  Rejected: 'bg-rose-600',
  Declined: 'bg-rose-600',
  Blocked: 'bg-rose-600',
  Expired: 'bg-rose-600',
  Cancelled: 'bg-rose-600',
  Lost: 'bg-rose-600',
  Void: 'bg-rose-600',
  Reversed: 'bg-rose-600',
  Degraded: 'bg-rose-600',
  Critical: 'bg-rose-600',
  Urgent: 'bg-rose-600'
};

export const StatusDotText: React.FC<{ status: string; className?: string }> = ({ status, className = '' }) => {
  const dotColor = STATUS_DOT_COLOR[status] || 'bg-slate-400';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 ${className}`}>
      <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
      <span>{status || '—'}</span>
    </span>
  );
};

export const KpiStatCard: React.FC<{
  label: string;
  value: string | number;
  subtext?: string;
  emphasis?: 'default' | 'positive' | 'warning' | 'danger';
  onClick?: () => void;
}> = ({ label, value, subtext, emphasis = 'default', onClick }) => {
  const valColor =
    emphasis === 'positive'
      ? 'text-emerald-700'
      : emphasis === 'warning'
        ? 'text-amber-700'
        : emphasis === 'danger'
          ? 'text-rose-700'
          : 'text-slate-900';

  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full text-left bg-white border border-slate-200 rounded-lg p-4 transition-colors ${
        onClick ? 'hover:border-blue-300 cursor-pointer' : ''
      }`}
    >
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold font-mono tabular-nums tracking-tight ${valColor}`}>{value}</div>
      {subtext && <div className="mt-1 text-xs text-slate-500 truncate">{subtext}</div>}
    </Tag>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}> = ({ title, description, actionLabel, onAction, icon }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
    {icon && <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">{icon}</div>}
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors cursor-pointer"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const LoadingSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3" aria-busy="true" aria-label="Loading records">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-9 rounded bg-slate-100 animate-pulse" />
    ))}
  </div>
);

export const SectionToolbar: React.FC<{
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  filterValue?: string;
  onFilterChange?: (val: string) => void;
  filterOptions?: string[];
  filterLabel?: string;
  extraFilters?: React.ReactNode;
  primaryAction?: { label: string; onClick: () => void };
}> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search records...',
  filterValue,
  onFilterChange,
  filterOptions,
  filterLabel = 'Status',
  extraFilters,
  primaryAction
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
    <div className="flex flex-wrap items-center gap-2.5 flex-1">
      {onSearchChange !== undefined && (
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchValue || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
          />
        </div>
      )}
      {filterOptions && onFilterChange && (
        <select
          value={filterValue || 'All'}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label={`Filter by ${filterLabel}`}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-blue-600"
        >
          <option value="All">All {filterLabel}</option>
          {filterOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}
      {extraFilters}
    </div>
    {primaryAction && (
      <button
        type="button"
        onClick={primaryAction.onClick}
        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors shrink-0 cursor-pointer"
      >
        <span>+ {primaryAction.label}</span>
      </button>
    )}
  </div>
);

export const SlideOverDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  widthClass?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, widthClass = 'max-w-xl', children }) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex-1" onClick={onClose} />
      <div className={`w-full ${widthClass} bg-white h-full border-l border-slate-200 flex flex-col overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 bg-white">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45" role="alertdialog" aria-modal="true">
      <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6">
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-md shrink-0 ${
              destructive ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mt-1.5 text-sm text-slate-600">{description}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`px-3.5 py-2 text-xs font-semibold text-white rounded-md cursor-pointer ${
              destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-700 hover:bg-blue-800'
            } disabled:opacity-60`}
          >
            {busy ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export interface PrintableDocumentData {
  kind: 'Quotation' | 'Invoice' | 'Proposal';
  docNumber: string;
  title: string;
  status: string;
  issueDate?: string;
  dueDate?: string;
  clientBusiness: string;
  clientName?: string;
  clientEmail?: string;
  clientAddress?: string;
  projectName?: string;
  currency: string;
  items?: Array<{ description: string; quantity: number; unit_price_minor: number; line_total_minor: number }>;
  subtotalMinor?: number;
  discountMinor?: number;
  taxMinor?: number;
  taxRateBps?: number;
  totalMinor: number;
  paidMinor?: number;
  balanceDueMinor?: number;
  notes?: string;
  terms?: string;
  summaryText?: string;
  scopeText?: string;
  deliverablesText?: string;
}

export const PrintableDocumentModal: React.FC<{
  doc: PrintableDocumentData | null;
  onClose: () => void;
}> = ({ doc, onClose }) => {
  if (!doc) return null;

  const handleDownloadHtml = () => {
    const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${doc.docNumber} - ${doc.title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; margin: 40px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { margin: 0; font-size: 22px; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; text-align: left; font-size: 14px; }
  th { background: #f8fafc; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { margin-left: auto; width: 320px; }
  .totals td { border: none; padding: 4px 8px; }
  .grand { font-weight: 700; font-size: 16px; border-top: 2px solid #0f172a !important; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Jawed Web Studio</h1>
      <div>jawed@jawed.co.in · https://jawed.co.in</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:12px;color:#475569;text-transform:uppercase">${doc.kind}</div>
      <strong style="font-size:18px">${doc.docNumber}</strong>
      <div>Status: ${doc.status}</div>
    </div>
  </div>
  <div><strong>Prepared For:</strong> ${doc.clientBusiness} ${doc.clientName ? `(${doc.clientName})` : ''}</div>
  ${doc.clientEmail ? `<div>Email: ${doc.clientEmail}</div>` : ''}
  ${doc.clientAddress ? `<div>Address: ${doc.clientAddress}</div>` : ''}
  ${doc.projectName ? `<div>Project: ${doc.projectName}</div>` : ''}
  <div>Issue / Date: ${formatDate(doc.issueDate)} ${doc.dueDate ? `· Valid / Due: ${formatDate(doc.dueDate)}` : ''}</div>
  <h2 style="margin-top:24px">${doc.title}</h2>
  ${doc.summaryText ? `<p>${doc.summaryText.replace(/</g, '&lt;')}</p>` : ''}
  ${doc.scopeText ? `<h3>Scope</h3><pre style="white-space:pre-wrap;font-family:inherit">${doc.scopeText.replace(/</g, '&lt;')}</pre>` : ''}
  ${doc.deliverablesText ? `<h3>Deliverables</h3><pre style="white-space:pre-wrap;font-family:inherit">${doc.deliverablesText.replace(/</g, '&lt;')}</pre>` : ''}
  ${
    doc.items && doc.items.length > 0
      ? `<table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Total</th></tr></thead>
    <tbody>${doc.items
      .map(
        (i) =>
          `<tr><td>${i.description.replace(/</g, '&lt;')}</td><td class="num">${i.quantity}</td><td class="num">${formatMoney(
            i.unit_price_minor,
            doc.currency
          )}</td><td class="num">${formatMoney(i.line_total_minor, doc.currency)}</td></tr>`
      )
      .join('')}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${formatMoney(doc.subtotalMinor, doc.currency)}</td></tr>
    ${doc.discountMinor ? `<tr><td>Discount</td><td class="num">-${formatMoney(doc.discountMinor, doc.currency)}</td></tr>` : ''}
    ${doc.taxMinor ? `<tr><td>Tax (${((doc.taxRateBps || 0) / 100).toFixed(2)}%)</td><td class="num">${formatMoney(doc.taxMinor, doc.currency)}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="num">${formatMoney(doc.totalMinor, doc.currency)}</td></tr>
    ${doc.paidMinor !== undefined ? `<tr><td>Paid</td><td class="num">${formatMoney(doc.paidMinor, doc.currency)}</td></tr>` : ''}
    ${doc.balanceDueMinor !== undefined ? `<tr><td><strong>Balance Due</strong></td><td class="num"><strong>${formatMoney(doc.balanceDueMinor, doc.currency)}</strong></td></tr>` : ''}
  </table>`
      : `<p><strong>Proposed Value:</strong> ${formatMoney(doc.totalMinor, doc.currency)}</p>`
  }
  ${doc.notes ? `<p><strong>Notes:</strong><br/>${doc.notes.replace(/</g, '&lt;')}</p>` : ''}
  ${doc.terms ? `<p><strong>Terms:</strong><br/>${doc.terms.replace(/</g, '&lt;')}</p>` : ''}
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.docNumber}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50" role="dialog" aria-modal="true">
      <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 print:hidden">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {doc.kind} Document — {doc.docNumber}
            </h3>
            <p className="text-xs text-slate-500">{doc.clientBusiness}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download HTML
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close document preview"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 text-slate-900 space-y-6">
          <div className="flex flex-wrap justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="text-lg font-bold tracking-tight text-slate-900">Jawed Web Studio</div>
              <div className="text-xs text-slate-500 mt-1">jawed@jawed.co.in · https://jawed.co.in</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{doc.kind}</div>
              <div className="text-lg font-bold font-mono text-slate-900">{doc.docNumber}</div>
              <div className="mt-1 flex justify-end">
                <StatusDotText status={doc.status} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Prepared For</div>
              <div className="font-semibold text-slate-900 mt-1">{doc.clientBusiness}</div>
              {doc.clientName && <div className="text-slate-600">{doc.clientName}</div>}
              {doc.clientEmail && <div className="text-slate-600">{doc.clientEmail}</div>}
              {doc.clientAddress && <div className="text-slate-600 text-xs mt-1">{doc.clientAddress}</div>}
            </div>
            <div className="sm:text-right space-y-1 text-xs text-slate-600">
              {doc.projectName && (
                <div>
                  <span className="font-medium text-slate-500">Project:</span> {doc.projectName}
                </div>
              )}
              {doc.issueDate && (
                <div>
                  <span className="font-medium text-slate-500">Date:</span> {formatDate(doc.issueDate)}
                </div>
              )}
              {doc.dueDate && (
                <div>
                  <span className="font-medium text-slate-500">{doc.kind === 'Invoice' ? 'Due Date:' : 'Valid Until:'}</span>{' '}
                  {formatDate(doc.dueDate)}
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-base font-semibold text-slate-900">{doc.title}</h4>
            {doc.summaryText && <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{doc.summaryText}</p>}
            {doc.scopeText && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase text-slate-500 mb-1">Scope & Architecture</div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-md border border-slate-200">
                  {doc.scopeText}
                </div>
              </div>
            )}
            {doc.deliverablesText && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase text-slate-500 mb-1">Deliverables</div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">{doc.deliverablesText}</div>
              </div>
            )}
          </div>

          {doc.items && doc.items.length > 0 ? (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Description</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-600">Qty</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-600">Unit Price</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {doc.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2.5 text-slate-800">{item.description}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">{item.quantity}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                          {formatMoney(item.unit_price_minor, doc.currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium text-slate-900">
                          {formatMoney(item.line_total_minor, doc.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <div className="w-72 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">{formatMoney(doc.subtotalMinor, doc.currency)}</span>
                  </div>
                  {(doc.discountMinor || 0) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Discount</span>
                      <span className="font-mono tabular-nums">-{formatMoney(doc.discountMinor, doc.currency)}</span>
                    </div>
                  )}
                  {(doc.taxMinor || 0) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Tax ({((doc.taxRateBps || 0) / 100).toFixed(2)}%)</span>
                      <span className="font-mono tabular-nums">{formatMoney(doc.taxMinor, doc.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2">
                    <span>Grand Total</span>
                    <span className="font-mono tabular-nums">{formatMoney(doc.totalMinor, doc.currency)}</span>
                  </div>
                  {doc.paidMinor !== undefined && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Payments Received</span>
                      <span className="font-mono tabular-nums">{formatMoney(doc.paidMinor, doc.currency)}</span>
                    </div>
                  )}
                  {doc.balanceDueMinor !== undefined && (
                    <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1.5">
                      <span>Balance Due</span>
                      <span className="font-mono tabular-nums">{formatMoney(doc.balanceDueMinor, doc.currency)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Proposed Investment</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {formatMoney(doc.totalMinor, doc.currency)}
              </span>
            </div>
          )}

          {(doc.notes || doc.terms) && (
            <div className="border-t border-slate-200 pt-4 space-y-3 text-xs text-slate-600">
              {doc.notes && (
                <div>
                  <span className="font-semibold text-slate-700">Notes: </span>
                  {doc.notes}
                </div>
              )}
              {doc.terms && (
                <div>
                  <span className="font-semibold text-slate-700">Terms: </span>
                  {doc.terms}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
