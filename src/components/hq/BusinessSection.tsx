// src/components/hq/BusinessSection.tsx
// Studio HQ Business & Financials: Quotations, Proposals, Invoices, Payments (no card storage) & Expenses

import React, { useEffect, useState, useCallback } from 'react';
import { FileSpreadsheet, Receipt, CreditCard, Wallet, Printer, ArrowRightCircle, Trash2, Plus } from 'lucide-react';
import {
  hqFetch,
  formatMoney,
  formatDate,
  parseMajorToMinor,
  minorToMajorString
} from '../../services/hqService';
import {
  HqQuotation,
  HqProposal,
  HqInvoice,
  HqPayment,
  HqExpense,
  HqClient,
  HqProject,
  HqSubView
} from '../../types/hq';
import {
  SectionToolbar,
  StatusDotText,
  EmptyState,
  LoadingSkeleton,
  SlideOverDrawer,
  ConfirmDialog,
  PrintableDocumentModal,
  PrintableDocumentData
} from './HqUiPrimitives';

interface EditableLineItem {
  description: string;
  quantity: string;
  unitPriceMajor: string;
}

export const BusinessSection: React.FC<{
  subView: HqSubView;
  onSubViewChange: (sv: HqSubView) => void;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ subView, onSubViewChange, onToast }) => {
  const activeTab =
    subView === 'business-proposals'
      ? 'proposals'
      : subView === 'business-invoices'
        ? 'invoices'
        : subView === 'business-payments'
          ? 'payments'
          : subView === 'business-expenses'
            ? 'expenses'
            : 'quotations';

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<HqClient[]>([]);
  const [projects, setProjects] = useState<HqProject[]>([]);
  const [quotations, setQuotations] = useState<HqQuotation[]>([]);
  const [proposals, setProposals] = useState<HqProposal[]>([]);
  const [invoices, setInvoices] = useState<HqInvoice[]>([]);
  const [payments, setPayments] = useState<HqPayment[]>([]);
  const [expenses, setExpenses] = useState<HqExpense[]>([]);

  const [printableDoc, setPrintableDoc] = useState<PrintableDocumentData | null>(null);
  const [quoteDrawerOpen, setQuoteDrawerOpen] = useState(false);
  const [proposalDrawerOpen, setProposalDrawerOpen] = useState(false);
  const [invoiceDrawerOpen, setInvoiceDrawerOpen] = useState(false);
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [expenseDrawerOpen, setExpenseDrawerOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  }>({ open: false, title: '', description: '', onConfirm: async () => {} });

  const [quoteForm, setQuoteForm] = useState({
    client_id: '',
    project_id: '',
    title: '',
    status: 'Draft',
    currency: 'INR',
    discount_major: '0',
    tax_pct: '0',
    valid_until: '',
    notes: '',
    terms: '50% advance, 50% on final delivery.',
    items: [{ description: 'Custom Website Design & Development', quantity: '1', unitPriceMajor: '25000' }] as EditableLineItem[]
  });

  const [proposalForm, setProposalForm] = useState({
    client_id: '',
    project_id: '',
    title: '',
    status: 'Draft',
    amount_major: '0',
    currency: 'INR',
    valid_until: '',
    executive_summary: '',
    scope_markdown: '',
    timeline_summary: '4-6 weeks',
    deliverables: ''
  });

  const [invoiceForm, setInvoiceForm] = useState({
    client_id: '',
    project_id: '',
    title: '',
    status: 'Issued',
    currency: 'INR',
    discount_major: '0',
    tax_pct: '0',
    due_date: new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10),
    notes: '',
    terms: 'Payment due within 14 days via bank transfer or UPI.',
    items: [{ description: 'Web Development Milestone', quantity: '1', unitPriceMajor: '25000' }] as EditableLineItem[]
  });

  const [paymentForm, setPaymentForm] = useState({
    invoice_id: '',
    amount_major: '0',
    payment_method: 'Bank Transfer',
    reference_number: '',
    payment_date: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  const [expenseForm, setExpenseForm] = useState({
    client_id: '',
    project_id: '',
    category: 'Infrastructure',
    vendor: 'Cloudflare',
    description: '',
    amount_major: '0',
    currency: 'INR',
    incurred_date: new Date().toISOString().slice(0, 10),
    billable: false
  });

  const loadReferences = useCallback(async () => {
    try {
      const [cRes, pRes, iRes] = await Promise.all([
        hqFetch<{ clients: HqClient[] }>('/api/hq/clients?limit=200'),
        hqFetch<{ projects: HqProject[] }>('/api/hq/projects?limit=200'),
        hqFetch<{ invoices: HqInvoice[] }>('/api/hq/invoices')
      ]);
      setClients(cRes.clients || []);
      setProjects(pRes.projects || []);
      if (activeTab !== 'invoices') setInvoices(iRes.invoices || []);
    } catch {
      // silent
    }
  }, [activeTab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'quotations') {
        const res = await hqFetch<{ quotations: HqQuotation[] }>('/api/hq/quotations');
        setQuotations(res.quotations || []);
      } else if (activeTab === 'proposals') {
        const res = await hqFetch<{ proposals: HqProposal[] }>('/api/hq/proposals');
        setProposals(res.proposals || []);
      } else if (activeTab === 'invoices') {
        const res = await hqFetch<{ invoices: HqInvoice[] }>('/api/hq/invoices');
        setInvoices(res.invoices || []);
      } else if (activeTab === 'payments') {
        const res = await hqFetch<{ payments: HqPayment[] }>('/api/hq/payments');
        setPayments(res.payments || []);
      } else if (activeTab === 'expenses') {
        const res = await hqFetch<{ expenses: HqExpense[] }>('/api/hq/expenses');
        setExpenses(res.expenses || []);
      }
    } catch (err: any) {
      onToast('error', err.message || 'Failed to load financial records');
    } finally {
      setLoading(false);
    }
  }, [activeTab, onToast]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const previewQuotationDoc = async (qId: string) => {
    try {
      const res = await hqFetch<{ quotation: HqQuotation; items: any[] }>(`/api/hq/quotations?id=${encodeURIComponent(qId)}`);
      const q = res.quotation;
      setPrintableDoc({
        kind: 'Quotation',
        docNumber: q.quotation_number,
        title: q.title,
        status: q.status,
        issueDate: q.created_at,
        dueDate: q.valid_until || undefined,
        clientBusiness: q.client_business || q.client_name || '',
        clientName: q.client_name,
        clientEmail: q.client_email,
        clientAddress: q.client_address,
        projectName: q.project_name || undefined,
        currency: q.currency,
        items: res.items,
        subtotalMinor: q.subtotal_minor,
        discountMinor: q.discount_minor,
        taxMinor: q.tax_minor,
        taxRateBps: q.tax_rate_bps,
        totalMinor: q.total_minor,
        notes: q.notes,
        terms: q.terms
      });
    } catch (err: any) {
      onToast('error', err.message || 'Failed to load quotation preview');
    }
  };

  const previewInvoiceDoc = async (invId: string) => {
    try {
      const res = await hqFetch<{ invoice: HqInvoice; items: any[] }>(`/api/hq/invoices?id=${encodeURIComponent(invId)}`);
      const inv = res.invoice;
      setPrintableDoc({
        kind: 'Invoice',
        docNumber: inv.invoice_number,
        title: inv.title,
        status: inv.status,
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        clientBusiness: inv.client_business || inv.client_name || '',
        clientName: inv.client_name,
        clientEmail: inv.client_email,
        clientAddress: inv.client_address,
        projectName: inv.project_name || undefined,
        currency: inv.currency,
        items: res.items,
        subtotalMinor: inv.subtotal_minor,
        discountMinor: inv.discount_minor,
        taxMinor: inv.tax_minor,
        taxRateBps: inv.tax_rate_bps,
        totalMinor: inv.total_minor,
        paidMinor: inv.paid_amount_minor,
        balanceDueMinor: inv.balance_due_minor,
        notes: inv.notes,
        terms: inv.terms
      });
    } catch (err: any) {
      onToast('error', err.message || 'Failed to load invoice preview');
    }
  };

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteForm.client_id || !quoteForm.title.trim()) {
      onToast('error', 'Customer and quotation title are required.');
      return;
    }
    setBusy(true);
    try {
      await hqFetch('/api/hq/quotations', {
        method: 'POST',
        body: JSON.stringify({
          client_id: quoteForm.client_id,
          project_id: quoteForm.project_id || null,
          title: quoteForm.title.trim(),
          status: quoteForm.status,
          currency: quoteForm.currency,
          discount_minor: parseMajorToMinor(quoteForm.discount_major),
          tax_rate_bps: Math.round((parseFloat(quoteForm.tax_pct || '0') || 0) * 100),
          valid_until: quoteForm.valid_until || null,
          notes: quoteForm.notes,
          terms: quoteForm.terms,
          items: quoteForm.items
            .filter((i) => i.description.trim())
            .map((i) => ({
              description: i.description.trim(),
              quantity: Math.max(0.01, parseFloat(i.quantity || '1') || 1),
              unit_price_minor: parseMajorToMinor(i.unitPriceMajor)
            }))
        })
      });
      onToast('success', 'Quotation created');
      setQuoteDrawerOpen(false);
      loadData();
    } catch (err: any) {
      onToast('error', err.message || 'Failed to create quotation');
    } finally {
      setBusy(false);
    }
  };

  const handleConvertQuotationToInvoice = async (q: HqQuotation) => {
    setBusy(true);
    try {
      await hqFetch('/api/hq/quotations', {
        method: 'POST',
        body: JSON.stringify({ action: 'convert_to_invoice', quotationId: q.id })
      });
      onToast('success', `Converted ${q.quotation_number} to Invoice`);
      loadReferences();
      loadData();
    } catch (err: any) {
      onToast('error', err.message || 'Conversion failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalForm.client_id || !proposalForm.title.trim()) {
      onToast('error', 'Customer and proposal title are required.');
      return;
    }
    setBusy(true);
    try {
      await hqFetch('/api/hq/proposals', {
        method: 'POST',
        body: JSON.stringify({
          ...proposalForm,
          project_id: proposalForm.project_id || null,
          amount_minor: parseMajorToMinor(proposalForm.amount_major)
        })
      });
      onToast('success', 'Proposal created');
      setProposalDrawerOpen(false);
      loadData();
    } catch (err: any) {
      onToast('error', err.message || 'Failed to create proposal');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.client_id || !invoiceForm.title.trim()) {
      onToast('error', 'Customer and invoice title are required.');
      return;
    }
    setBusy(true);
    try {
      await hqFetch('/api/hq/invoices', {
        method: 'POST',
        body: JSON.stringify({
          client_id: invoiceForm.client_id,
          project_id: invoiceForm.project_id || null,
          title: invoiceForm.title.trim(),
          status: invoiceForm.status,
          currency: invoiceForm.currency,
          discount_minor: parseMajorToMinor(invoiceForm.discount_major),
          tax_rate_bps: Math.round((parseFloat(invoiceForm.tax_pct || '0') || 0) * 100),
          due_date: invoiceForm.due_date,
          notes: invoiceForm.notes,
          terms: invoiceForm.terms,
          items: invoiceForm.items
            .filter((i) => i.description.trim())
            .map((i) => ({
              description: i.description.trim(),
              quantity: Math.max(0.01, parseFloat(i.quantity || '1') || 1),
              unit_price_minor: parseMajorToMinor(i.unitPriceMajor)
            }))
        })
      });
      onToast('success', 'Invoice created');
      setInvoiceDrawerOpen(false);
      loadReferences();
      loadData();
    } catch (err: any) {
      onToast('error', err.message || 'Failed to create invoice');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountMinor = parseMajorToMinor(paymentForm.amount_major);
    if (!paymentForm.invoice_id || amountMinor <= 0) {
      onToast('error', 'Select an invoice and enter a positive payment amount.');
      return;
    }
    setBusy(true);
    try {
      await hqFetch('/api/hq/payments', {
        method: 'POST',
        idempotencyKey: `pay_${paymentForm.invoice_id}_${Date.now()}`,
        body: JSON.stringify({
          invoice_id: paymentForm.invoice_id,
          amount_minor: amountMinor,
          payment_method: paymentForm.payment_method,
          reference_number: paymentForm.reference_number.trim(),
          payment_date: paymentForm.payment_date,
          notes: paymentForm.notes.trim()
        })
      });
      onToast('success', 'Payment recorded and invoice balance updated');
      setPaymentDrawerOpen(false);
      loadReferences();
      loadData();
    } catch (err: any) {
      onToast('error', err.message || 'Failed to record payment');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.description.trim()) {
      onToast('error', 'Expense description is required.');
      return;
    }
    setBusy(true);
    try {
      await hqFetch('/api/hq/expenses', {
        method: 'POST',
        body: JSON.stringify({
          ...expenseForm,
          client_id: expenseForm.client_id || null,
          project_id: expenseForm.project_id || null,
          amount_minor: parseMajorToMinor(expenseForm.amount_major)
        })
      });
      onToast('success', 'Expense recorded');
      setExpenseDrawerOpen(false);
      loadData();
    } catch (err: any) {
      onToast('error', err.message || 'Failed to record expense');
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ key: HqSubView; label: string }> = [
    { key: 'business-quotations', label: 'Quotations' },
    { key: 'business-proposals', label: 'Proposals' },
    { key: 'business-invoices', label: 'Invoices' },
    { key: 'business-payments', label: 'Payments' },
    { key: 'business-expenses', label: 'Expenses' }
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Business & Financials</h1>
          <p className="text-xs text-slate-500 mt-0.5">Quotations, client proposals, invoices, payment ledger, and expenses</p>
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

      {/* QUOTATIONS */}
      {activeTab === 'quotations' && (
        <>
          <SectionToolbar
            primaryAction={{
              label: 'New Quotation',
              onClick: () => {
                setQuoteForm((f) => ({ ...f, client_id: clients[0]?.id || '', title: '' }));
                setQuoteDrawerOpen(true);
              }
            }}
          />
          {loading ? (
            <LoadingSkeleton />
          ) : quotations.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="w-5 h-5" />}
              title="No quotations created"
              description="Create itemized project estimates with discount and tax, export printable documents, and convert to invoices."
              actionLabel="Create Quotation"
              onAction={() => setQuoteDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Number & Title</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Customer</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Grand Total</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Valid Until</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quotations.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-semibold text-blue-700">{q.quotation_number}</div>
                          <div className="font-medium text-slate-900">{q.title}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">{q.client_business || q.client_name}</td>
                        <td className="px-4 py-3">
                          <StatusDotText status={q.status} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
                          {formatMoney(q.total_minor, q.currency)}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{formatDate(q.valid_until)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => previewQuotationDoc(q.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer"
                            >
                              <Printer className="w-3 h-3" /> Document
                            </button>
                            {q.status !== 'Converted' && (
                              <button
                                type="button"
                                onClick={() => handleConvertQuotationToInvoice(q)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 cursor-pointer"
                              >
                                <ArrowRightCircle className="w-3 h-3" /> Convert to Invoice
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmState({
                                  open: true,
                                  title: 'Delete quotation?',
                                  description: `Delete quotation ${q.quotation_number}?`,
                                  onConfirm: async () => {
                                    await hqFetch(`/api/hq/quotations?id=${encodeURIComponent(q.id)}`, { method: 'DELETE' });
                                    onToast('success', 'Quotation deleted');
                                    loadData();
                                  }
                                })
                              }
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* PROPOSALS */}
      {activeTab === 'proposals' && (
        <>
          <SectionToolbar
            primaryAction={{
              label: 'New Proposal',
              onClick: () => {
                setProposalForm((f) => ({ ...f, client_id: clients[0]?.id || '', title: '' }));
                setProposalDrawerOpen(true);
              }
            }}
          />
          {loading ? (
            <LoadingSkeleton />
          ) : proposals.length === 0 ? (
            <EmptyState
              title="No client proposals yet"
              description="Draft structured client proposals with executive summary, deliverables, and investment breakdown."
              actionLabel="Create Proposal"
              onAction={() => setProposalDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {proposals.map((pr) => (
                <div key={pr.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-semibold text-blue-700">{pr.proposal_number}</span>
                      <span className="font-semibold text-slate-900">{pr.title}</span>
                      <StatusDotText status={pr.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {pr.client_business || pr.client_name} · Timeline: {pr.timeline_summary || 'TBD'} ·{' '}
                      <span className="font-mono font-semibold text-slate-800">{formatMoney(pr.amount_minor, pr.currency)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPrintableDoc({
                          kind: 'Proposal',
                          docNumber: pr.proposal_number,
                          title: pr.title,
                          status: pr.status,
                          issueDate: pr.created_at,
                          dueDate: pr.valid_until || undefined,
                          clientBusiness: pr.client_business || pr.client_name || '',
                          projectName: pr.project_name || undefined,
                          currency: pr.currency,
                          totalMinor: pr.amount_minor,
                          summaryText: pr.executive_summary,
                          scopeText: pr.scope_markdown,
                          deliverablesText: pr.deliverables
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded cursor-pointer"
                    >
                      <Printer className="w-3 h-3" /> Preview / Print
                    </button>
                    {pr.status === 'Draft' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await hqFetch('/api/hq/proposals', {
                            method: 'PUT',
                            body: JSON.stringify({ id: pr.id, status: 'Sent' })
                          });
                          onToast('success', 'Proposal marked Sent');
                          loadData();
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded cursor-pointer"
                      >
                        Mark Sent
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: 'Delete proposal?',
                          description: `Remove ${pr.proposal_number}?`,
                          onConfirm: async () => {
                            await hqFetch(`/api/hq/proposals?id=${encodeURIComponent(pr.id)}`, { method: 'DELETE' });
                            onToast('success', 'Proposal deleted');
                            loadData();
                          }
                        })
                      }
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* INVOICES */}
      {activeTab === 'invoices' && (
        <>
          <SectionToolbar
            primaryAction={{
              label: 'New Invoice',
              onClick: () => {
                setInvoiceForm((f) => ({ ...f, client_id: clients[0]?.id || '', title: '' }));
                setInvoiceDrawerOpen(true);
              }
            }}
          />
          {loading ? (
            <LoadingSkeleton />
          ) : invoices.length === 0 ? (
            <EmptyState
              icon={<Receipt className="w-5 h-5" />}
              title="No invoices issued"
              description="Issue sequential invoices directly or convert an approved quotation into an invoice."
              actionLabel="Create Invoice"
              onAction={() => setInvoiceDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Invoice</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Customer</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Total</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Balance Due</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Due Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-semibold text-blue-700">{inv.invoice_number}</div>
                          <div className="font-medium text-slate-900">{inv.title}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">{inv.client_business || inv.client_name}</td>
                        <td className="px-4 py-3">
                          <StatusDotText status={inv.status} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-slate-900">
                          {formatMoney(inv.total_minor, inv.currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
                          {formatMoney(inv.balance_due_minor, inv.currency)}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{formatDate(inv.due_date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => previewInvoiceDoc(inv.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded cursor-pointer"
                            >
                              <Printer className="w-3 h-3" /> Print / PDF
                            </button>
                            {inv.balance_due_minor > 0 && inv.status !== 'Void' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentForm({
                                    invoice_id: inv.id,
                                    amount_major: minorToMajorString(inv.balance_due_minor),
                                    payment_method: 'Bank Transfer',
                                    reference_number: '',
                                    payment_date: new Date().toISOString().slice(0, 10),
                                    notes: ''
                                  });
                                  setPaymentDrawerOpen(true);
                                }}
                                className="px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded cursor-pointer"
                              >
                                Record Payment
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* PAYMENTS */}
      {activeTab === 'payments' && (
        <>
          <SectionToolbar
            primaryAction={{
              label: 'Record Payment',
              onClick: () => {
                const unpaid = invoices.find((i) => i.balance_due_minor > 0) || invoices[0];
                setPaymentForm({
                  invoice_id: unpaid?.id || '',
                  amount_major: unpaid ? minorToMajorString(unpaid.balance_due_minor) : '0',
                  payment_method: 'Bank Transfer',
                  reference_number: '',
                  payment_date: new Date().toISOString().slice(0, 10),
                  notes: ''
                });
                setPaymentDrawerOpen(true);
              }
            }}
          />
          {loading ? (
            <LoadingSkeleton />
          ) : payments.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="w-5 h-5" />}
              title="No payments recorded"
              description="Log bank transfers, UPI settlements, and wire references against open invoices. No payment card numbers are ever stored."
              actionLabel="Record Payment"
              onAction={() => setPaymentDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Date & Reference</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Invoice & Customer</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Method</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Amount</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((pay) => (
                    <tr key={pay.id}>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono text-slate-900">{formatDate(pay.payment_date)}</div>
                        <div className="text-slate-500">{pay.reference_number || 'No ref'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono font-semibold text-blue-700">{pay.invoice_number}</div>
                        <div className="text-slate-600">{pay.client_business || pay.client_name}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">{pay.payment_method}</td>
                      <td className="px-4 py-3">
                        <StatusDotText status={pay.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
                        {formatMoney(pay.amount_minor, pay.currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pay.status === 'Recorded' && (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                open: true,
                                title: 'Reverse payment?',
                                description: 'Reverse this payment and recalculate the invoice balance due?',
                                onConfirm: async () => {
                                  await hqFetch(`/api/hq/payments?id=${encodeURIComponent(pay.id)}`, { method: 'DELETE' });
                                  onToast('success', 'Payment reversed');
                                  loadReferences();
                                  loadData();
                                }
                              })
                            }
                            className="text-xs font-medium text-rose-600 hover:underline cursor-pointer"
                          >
                            Reverse
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* EXPENSES */}
      {activeTab === 'expenses' && (
        <>
          <SectionToolbar
            primaryAction={{
              label: 'Log Expense',
              onClick: () => setExpenseDrawerOpen(true)
            }}
          />
          {loading ? (
            <LoadingSkeleton />
          ) : expenses.length === 0 ? (
            <EmptyState
              icon={<Wallet className="w-5 h-5" />}
              title="No expenses logged"
              description="Track infrastructure hosting, domains, software subscriptions, and contractor expenses."
              actionLabel="Log Expense"
              onAction={() => setExpenseDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Description & Vendor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Category</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Amount</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((ex) => (
                    <tr key={ex.id}>
                      <td className="px-4 py-3 text-xs font-mono text-slate-600">{formatDate(ex.incurred_date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 text-sm">{ex.description}</div>
                        <div className="text-xs text-slate-500">
                          {ex.vendor || 'General'} {ex.project_name ? `· ${ex.project_name}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">{ex.category}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
                        {formatMoney(ex.amount_minor, ex.currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmState({
                              open: true,
                              title: 'Delete expense?',
                              description: `Remove expense "${ex.description}"?`,
                              onConfirm: async () => {
                                await hqFetch(`/api/hq/expenses?id=${encodeURIComponent(ex.id)}`, { method: 'DELETE' });
                                onToast('success', 'Expense deleted');
                                loadData();
                              }
                            })
                          }
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* QUOTATION DRAWER */}
      <SlideOverDrawer open={quoteDrawerOpen} onClose={() => setQuoteDrawerOpen(false)} title="Create Quotation" widthClass="max-w-2xl">
        <form onSubmit={handleSaveQuotation} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Customer *</label>
              <select
                required
                value={quoteForm.client_id}
                onChange={(e) => setQuoteForm({ ...quoteForm, client_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="">Select customer…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name || c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Linked Project (optional)</label>
              <select
                value={quoteForm.project_id}
                onChange={(e) => setQuoteForm({ ...quoteForm, project_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Quotation Title *</label>
              <input
                required
                value={quoteForm.title}
                onChange={(e) => setQuoteForm({ ...quoteForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Line Items</label>
              <button
                type="button"
                onClick={() =>
                  setQuoteForm({
                    ...quoteForm,
                    items: [...quoteForm.items, { description: '', quantity: '1', unitPriceMajor: '0' }]
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>
            {quoteForm.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => {
                    const next = [...quoteForm.items];
                    next[idx] = { ...next[idx], description: e.target.value };
                    setQuoteForm({ ...quoteForm, items: next });
                  }}
                  className="col-span-6 px-2.5 py-1.5 border border-slate-200 rounded text-xs"
                />
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  value={item.quantity}
                  onChange={(e) => {
                    const next = [...quoteForm.items];
                    next[idx] = { ...next[idx], quantity: e.target.value };
                    setQuoteForm({ ...quoteForm, items: next });
                  }}
                  className="col-span-2 px-2 py-1.5 border border-slate-200 rounded text-xs font-mono"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.unitPriceMajor}
                  onChange={(e) => {
                    const next = [...quoteForm.items];
                    next[idx] = { ...next[idx], unitPriceMajor: e.target.value };
                    setQuoteForm({ ...quoteForm, items: next });
                  }}
                  className="col-span-3 px-2 py-1.5 border border-slate-200 rounded text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (quoteForm.items.length > 1) {
                      setQuoteForm({ ...quoteForm, items: quoteForm.items.filter((_, i) => i !== idx) });
                    }
                  }}
                  className="col-span-1 text-slate-400 hover:text-rose-600 text-xs cursor-pointer"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Discount ({quoteForm.currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={quoteForm.discount_major}
                onChange={(e) => setQuoteForm({ ...quoteForm, discount_major: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tax (%)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={quoteForm.tax_pct}
                onChange={(e) => setQuoteForm({ ...quoteForm, tax_pct: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Valid Until</label>
              <input
                type="date"
                value={quoteForm.valid_until}
                onChange={(e) => setQuoteForm({ ...quoteForm, valid_until: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setQuoteDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              Create Quotation
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* PROPOSAL DRAWER */}
      <SlideOverDrawer open={proposalDrawerOpen} onClose={() => setProposalDrawerOpen(false)} title="Create Client Proposal" widthClass="max-w-2xl">
        <form onSubmit={handleSaveProposal} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Customer *</label>
              <select
                required
                value={proposalForm.client_id}
                onChange={(e) => setProposalForm({ ...proposalForm, client_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="">Select customer…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name || c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Proposed Amount ({proposalForm.currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={proposalForm.amount_major}
                onChange={(e) => setProposalForm({ ...proposalForm, amount_major: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Proposal Title *</label>
            <input
              required
              value={proposalForm.title}
              onChange={(e) => setProposalForm({ ...proposalForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Executive Summary</label>
            <textarea
              rows={3}
              value={proposalForm.executive_summary}
              onChange={(e) => setProposalForm({ ...proposalForm, executive_summary: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Technical Scope & Deliverables</label>
            <textarea
              rows={4}
              value={proposalForm.scope_markdown}
              onChange={(e) => setProposalForm({ ...proposalForm, scope_markdown: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setProposalDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              Create Proposal
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* INVOICE DRAWER */}
      <SlideOverDrawer open={invoiceDrawerOpen} onClose={() => setInvoiceDrawerOpen(false)} title="Issue New Invoice" widthClass="max-w-2xl">
        <form onSubmit={handleSaveInvoice} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Customer *</label>
              <select
                required
                value={invoiceForm.client_id}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, client_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="">Select customer…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name || c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Due Date *</label>
              <input
                type="date"
                required
                value={invoiceForm.due_date}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Invoice Title *</label>
              <input
                required
                value={invoiceForm.title}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Line Items</label>
              <button
                type="button"
                onClick={() =>
                  setInvoiceForm({
                    ...invoiceForm,
                    items: [...invoiceForm.items, { description: '', quantity: '1', unitPriceMajor: '0' }]
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>
            {invoiceForm.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => {
                    const next = [...invoiceForm.items];
                    next[idx] = { ...next[idx], description: e.target.value };
                    setInvoiceForm({ ...invoiceForm, items: next });
                  }}
                  className="col-span-6 px-2.5 py-1.5 border border-slate-200 rounded text-xs"
                />
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  value={item.quantity}
                  onChange={(e) => {
                    const next = [...invoiceForm.items];
                    next[idx] = { ...next[idx], quantity: e.target.value };
                    setInvoiceForm({ ...invoiceForm, items: next });
                  }}
                  className="col-span-2 px-2 py-1.5 border border-slate-200 rounded text-xs font-mono"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.unitPriceMajor}
                  onChange={(e) => {
                    const next = [...invoiceForm.items];
                    next[idx] = { ...next[idx], unitPriceMajor: e.target.value };
                    setInvoiceForm({ ...invoiceForm, items: next });
                  }}
                  className="col-span-3 px-2 py-1.5 border border-slate-200 rounded text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (invoiceForm.items.length > 1) {
                      setInvoiceForm({ ...invoiceForm, items: invoiceForm.items.filter((_, i) => i !== idx) });
                    }
                  }}
                  className="col-span-1 text-slate-400 hover:text-rose-600 text-xs cursor-pointer"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setInvoiceDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              Issue Invoice
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* RECORD PAYMENT DRAWER (Zero card fields ever) */}
      <SlideOverDrawer
        open={paymentDrawerOpen}
        onClose={() => setPaymentDrawerOpen(false)}
        title="Record Payment"
        subtitle="Log settled bank transfer, UPI, or wire reference against an invoice"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Invoice *</label>
            <select
              required
              value={paymentForm.invoice_id}
              onChange={(e) => setPaymentForm({ ...paymentForm, invoice_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            >
              <option value="">Select invoice…</option>
              {invoices
                .filter((i) => i.status !== 'Void')
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoice_number} — {i.client_business} (Due: {formatMoney(i.balance_due_minor, i.currency)})
                  </option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Amount Received *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={paymentForm.amount_major}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount_major: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Settlement Date</label>
              <input
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Method</label>
              <select
                value={paymentForm.payment_method}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="Bank Transfer">Bank Transfer / NEFT / IMPS</option>
                <option value="UPI">UPI</option>
                <option value="Wire">International Wire</option>
                <option value="Gateway Link">External Payment Gateway Reference</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Transaction / UTR Reference</label>
              <input
                value={paymentForm.reference_number}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPaymentDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-md hover:bg-emerald-800 cursor-pointer"
            >
              Save Payment
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* EXPENSE DRAWER */}
      <SlideOverDrawer open={expenseDrawerOpen} onClose={() => setExpenseDrawerOpen(false)} title="Log Studio Expense">
        <form onSubmit={handleSaveExpense} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description *</label>
            <input
              required
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="Infrastructure">Cloud / Hosting</option>
                <option value="Domains">Domain Registration</option>
                <option value="Software">Software / SaaS License</option>
                <option value="Contractor">Contractor / Design</option>
                <option value="Operations">General Operations</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Vendor</label>
              <input
                value={expenseForm.vendor}
                onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Amount ({expenseForm.currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={expenseForm.amount_major}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount_major: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={expenseForm.incurred_date}
                onChange={(e) => setExpenseForm({ ...expenseForm, incurred_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setExpenseDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              Save Expense
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      <PrintableDocumentModal doc={printableDoc} onClose={() => setPrintableDoc(null)} />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        destructive
        busy={busy}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
        onConfirm={async () => {
          setBusy(true);
          try {
            await confirmState.onConfirm();
            setConfirmState((s) => ({ ...s, open: false }));
          } catch (err: any) {
            onToast('error', err.message || 'Operation failed');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
};
