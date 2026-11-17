// src/components/hq/OperationsSection.tsx
// Studio HQ Operations: Onboarding, Approvals, Quality Assurance, Maintenance Plans & Support Tickets

import React, { useEffect, useState, useCallback } from 'react';
import { ClipboardCheck, ShieldCheck, Bug, Wrench, LifeBuoy, Trash2 } from 'lucide-react';
import { hqFetch, formatMoney, formatDate, parseMajorToMinor } from '../../services/hqService';
import {
  HqOnboardingItem,
  HqApproval,
  HqQaCheck,
  HqMaintenancePlan,
  HqSupportTicket,
  HqClient,
  HqProject,
  HqSubView
} from '../../types/hq';
import { SectionToolbar, StatusDotText, EmptyState, LoadingSkeleton, SlideOverDrawer, ConfirmDialog } from './HqUiPrimitives';

const APPROVAL_STAGES = [
  'Requirements',
  'Project Scope',
  'Design Approval',
  'Development Completion',
  'Final Delivery',
  'Website Launch'
];

const QA_CATEGORIES = [
  'Functional Testing',
  'Mobile Responsiveness',
  'SEO Checks',
  'Accessibility Checks',
  'Security Checks',
  'Performance Checks',
  'Browser Compatibility',
  'Deployment Readiness'
];

export const OperationsSection: React.FC<{
  subView: HqSubView;
  onSubViewChange: (sv: HqSubView) => void;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ subView, onSubViewChange, onToast }) => {
  const activeTab =
    subView === 'ops-approvals'
      ? 'approvals'
      : subView === 'ops-qa'
        ? 'qa'
        : subView === 'ops-maintenance'
          ? 'maintenance'
          : subView === 'ops-support'
            ? 'support'
            : 'onboarding';

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<HqClient[]>([]);
  const [projects, setProjects] = useState<HqProject[]>([]);
  const [onboarding, setOnboarding] = useState<HqOnboardingItem[]>([]);
  const [approvals, setApprovals] = useState<HqApproval[]>([]);
  const [qaChecks, setQaChecks] = useState<HqQaCheck[]>([]);
  const [plans, setPlans] = useState<HqMaintenancePlan[]>([]);
  const [tickets, setTickets] = useState<HqSupportTicket[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  }>({ open: false, title: '', description: '', onConfirm: async () => {} });

  const [obForm, setObForm] = useState({ client_id: '', project_id: '', title: '', category: 'Domain & DNS', owner_role: 'Client', due_date: '' });
  const [apForm, setApForm] = useState({ project_id: '', stage: 'Design Approval', title: '', summary: '' });
  const [qaForm, setQaForm] = useState({
    project_id: '',
    category: 'Functional Testing',
    title: '',
    status: 'Not Run',
    severity: 'Medium',
    defect_description: '',
    assigned_action: ''
  });
  const [planForm, setPlanForm] = useState({
    client_id: '',
    project_id: '',
    plan_name: 'Managed Care & Security Retainer',
    billing_cycle: 'Monthly',
    amount_major: '5000',
    currency: 'INR',
    start_date: new Date().toISOString().slice(0, 10),
    expiry_date: new Date(Date.now() + 365 * 86400 * 1000).toISOString().slice(0, 10),
    scope_notes: ''
  });
  const [ticketForm, setTicketForm] = useState({
    client_id: '',
    project_id: '',
    subject: '',
    category: 'Bug Fix',
    priority: 'Medium',
    description: ''
  });

  const loadReferences = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        hqFetch<{ clients: HqClient[] }>('/api/hq/clients?limit=200'),
        hqFetch<{ projects: HqProject[] }>('/api/hq/projects?limit=200')
      ]);
      setClients(cRes.clients || []);
      setProjects(pRes.projects || []);
    } catch {
      // silent
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'onboarding') {
        const res = await hqFetch<{ items: HqOnboardingItem[] }>('/api/hq/onboarding');
        setOnboarding(res.items || []);
      } else if (activeTab === 'approvals') {
        const res = await hqFetch<{ approvals: HqApproval[] }>('/api/hq/approvals');
        setApprovals(res.approvals || []);
      } else if (activeTab === 'qa') {
        const res = await hqFetch<{ checks: HqQaCheck[] }>('/api/hq/qa');
        setQaChecks(res.checks || []);
      } else if (activeTab === 'maintenance') {
        const res = await hqFetch<{ plans: HqMaintenancePlan[] }>('/api/hq/maintenance');
        setPlans(res.plans || []);
      } else if (activeTab === 'support') {
        const res = await hqFetch<{ tickets: HqSupportTicket[] }>('/api/hq/support');
        setTickets(res.tickets || []);
      }
    } catch (err: any) {
      onToast('error', err.message || 'Failed to load operations data');
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

  const tabs: Array<{ key: HqSubView; label: string }> = [
    { key: 'ops-onboarding', label: 'Onboarding' },
    { key: 'ops-approvals', label: 'Approvals' },
    { key: 'ops-qa', label: 'Quality Assurance' },
    { key: 'ops-maintenance', label: 'Maintenance' },
    { key: 'ops-support', label: 'Support Tickets' }
  ];

  const openCreator = () => {
    setObForm((f) => ({ ...f, client_id: clients[0]?.id || '', project_id: projects[0]?.id || '', title: '' }));
    setApForm((f) => ({ ...f, project_id: projects[0]?.id || '', title: '' }));
    setQaForm((f) => ({ ...f, project_id: projects[0]?.id || '', title: '' }));
    setPlanForm((f) => ({ ...f, client_id: clients[0]?.id || '', project_id: projects[0]?.id || '' }));
    setTicketForm((f) => ({ ...f, client_id: clients[0]?.id || '', project_id: projects[0]?.id || '', subject: '' }));
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Studio Operations</h1>
          <p className="text-xs text-slate-500 mt-0.5">Onboarding checklists, client sign-offs, QA testing, retainers, and support</p>
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

      {/* ONBOARDING */}
      {activeTab === 'onboarding' && (
        <>
          <SectionToolbar primaryAction={{ label: 'Add Onboarding Item', onClick: openCreator }} />
          {loading ? (
            <LoadingSkeleton />
          ) : onboarding.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="w-5 h-5" />}
              title="No onboarding checklists yet"
              description="Track DNS credentials, brand assets, analytics setup, and kickoff prerequisites for new customers."
              actionLabel="Add Item"
              onAction={openCreator}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {onboarding.map((item) => (
                <div key={item.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-sm text-slate-900">{item.title}</span>
                      <StatusDotText status={item.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {item.client_business} {item.project_name ? `· ${item.project_name}` : ''} · {item.category} · Owner:{' '}
                      {item.owner_role}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status !== 'Completed' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await hqFetch('/api/hq/onboarding', {
                            method: 'PUT',
                            body: JSON.stringify({ id: item.id, status: 'Completed' })
                          });
                          onToast('success', 'Onboarding item completed');
                          loadData();
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded cursor-pointer"
                      >
                        Mark Complete
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: 'Delete onboarding item?',
                          description: `Remove "${item.title}"?`,
                          onConfirm: async () => {
                            await hqFetch(`/api/hq/onboarding?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
                            onToast('success', 'Deleted');
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

      {/* APPROVALS */}
      {activeTab === 'approvals' && (
        <>
          <SectionToolbar primaryAction={{ label: 'Request Approval', onClick: openCreator }} />
          {loading ? (
            <LoadingSkeleton />
          ) : approvals.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="w-5 h-5" />}
              title="No project approval gates"
              description="Track client sign-offs across Requirements, Project Scope, Design, Development, Final Delivery, and Launch."
              actionLabel="Request Approval"
              onAction={openCreator}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {approvals.map((ap) => (
                <div key={ap.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-sm text-slate-900">{ap.title}</span>
                      <StatusDotText status={ap.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {ap.client_business} · {ap.project_name} · Stage: <strong>{ap.stage}</strong>
                    </div>
                    {ap.decision_notes && <p className="text-xs text-slate-600 mt-1">{ap.decision_notes}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ap.status === 'Pending' && (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            await hqFetch('/api/hq/approvals', {
                              method: 'PUT',
                              body: JSON.stringify({ id: ap.id, status: 'Approved', decision_notes: 'Signed off' })
                            });
                            onToast('success', 'Approval recorded');
                            loadData();
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await hqFetch('/api/hq/approvals', {
                              method: 'PUT',
                              body: JSON.stringify({ id: ap.id, status: 'Changes Requested', decision_notes: 'Revisions requested' })
                            });
                            onToast('info', 'Marked as Changes Requested');
                            loadData();
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded cursor-pointer"
                        >
                          Request Changes
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: 'Delete approval gate?',
                          description: `Remove "${ap.title}"?`,
                          onConfirm: async () => {
                            await hqFetch(`/api/hq/approvals?id=${encodeURIComponent(ap.id)}`, { method: 'DELETE' });
                            onToast('success', 'Deleted');
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

      {/* QUALITY ASSURANCE */}
      {activeTab === 'qa' && (
        <>
          <SectionToolbar primaryAction={{ label: 'Add QA Check', onClick: openCreator }} />
          {loading ? (
            <LoadingSkeleton />
          ) : qaChecks.length === 0 ? (
            <EmptyState
              icon={<Bug className="w-5 h-5" />}
              title="No QA checks recorded"
              description="Audit functional, mobile, SEO, accessibility, security, and performance readiness before launch."
              actionLabel="Add QA Check"
              onAction={openCreator}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Check & Project</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Severity</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Result</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {qaChecks.map((q) => (
                    <tr key={q.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{q.title}</div>
                        <div className="text-xs text-slate-500">
                          {q.project_name} · {q.client_business}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">{q.category}</td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700">{q.severity}</td>
                      <td className="px-4 py-3">
                        <StatusDotText status={q.status} />
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <button
                          type="button"
                          onClick={async () => {
                            await hqFetch('/api/hq/qa', { method: 'PUT', body: JSON.stringify({ id: q.id, status: 'Pass' }) });
                            onToast('success', 'QA Check passed');
                            loadData();
                          }}
                          className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded cursor-pointer"
                        >
                          Pass
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await hqFetch('/api/hq/qa', { method: 'PUT', body: JSON.stringify({ id: q.id, status: 'Fail' }) });
                            onToast('info', 'QA Check marked Fail');
                            loadData();
                          }}
                          className="px-2 py-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded cursor-pointer"
                        >
                          Fail
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

      {/* MAINTENANCE */}
      {activeTab === 'maintenance' && (
        <>
          <SectionToolbar primaryAction={{ label: 'New Maintenance Plan', onClick: openCreator }} />
          {loading ? (
            <LoadingSkeleton />
          ) : plans.length === 0 ? (
            <EmptyState
              icon={<Wrench className="w-5 h-5" />}
              title="No maintenance contracts"
              description="Manage recurring retainer plans, renewal alerts, and monthly maintenance logs."
              actionLabel="Add Maintenance Plan"
              onAction={openCreator}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {plans.map((pl) => (
                <div key={pl.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-sm text-slate-900">{pl.plan_name}</span>
                      <StatusDotText status={pl.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {pl.client_business} · {pl.billing_cycle} ·{' '}
                      <span className="font-mono font-semibold text-slate-800">{formatMoney(pl.amount_minor, pl.currency)}</span> ·
                      Renews {formatDate(pl.expiry_date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await hqFetch('/api/hq/maintenance', {
                          method: 'PUT',
                          body: JSON.stringify({ id: pl.id, logMaintenance: true })
                        });
                        onToast('success', 'Maintenance check logged');
                        loadData();
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded cursor-pointer"
                    >
                      Log Maintenance
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: 'Delete maintenance contract?',
                          description: `Remove "${pl.plan_name}"?`,
                          onConfirm: async () => {
                            await hqFetch(`/api/hq/maintenance?id=${encodeURIComponent(pl.id)}`, { method: 'DELETE' });
                            onToast('success', 'Deleted');
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

      {/* SUPPORT TICKETS */}
      {activeTab === 'support' && (
        <>
          <SectionToolbar primaryAction={{ label: 'New Support Ticket', onClick: openCreator }} />
          {loading ? (
            <LoadingSkeleton />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={<LifeBuoy className="w-5 h-5" />}
              title="No support tickets open"
              description="Track client bug fixes, content updates, and SLA resolution notes."
              actionLabel="Create Ticket"
              onAction={openCreator}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {tickets.map((t) => (
                <div key={t.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-semibold text-blue-700">{t.ticket_number}</span>
                      <span className="font-semibold text-sm text-slate-900">{t.subject}</span>
                      <StatusDotText status={t.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {t.client_business} · {t.category} · Priority: {t.priority}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status !== 'Resolved' && t.status !== 'Closed' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await hqFetch('/api/hq/support', {
                            method: 'PUT',
                            body: JSON.stringify({ id: t.id, status: 'Resolved', resolution_notes: 'Resolved by Studio HQ' })
                          });
                          onToast('success', `${t.ticket_number} marked Resolved`);
                          loadData();
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded cursor-pointer"
                      >
                        Resolve
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: 'Delete ticket?',
                          description: `Delete ${t.ticket_number}?`,
                          onConfirm: async () => {
                            await hqFetch(`/api/hq/support?id=${encodeURIComponent(t.id)}`, { method: 'DELETE' });
                            onToast('success', 'Ticket deleted');
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

      {/* DYNAMIC CREATE DRAWER FOR ACTIVE OPS TAB */}
      <SlideOverDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={
          activeTab === 'onboarding'
            ? 'Add Onboarding Checklist Item'
            : activeTab === 'approvals'
              ? 'Request Project Approval'
              : activeTab === 'qa'
                ? 'Log QA Verification Check'
                : activeTab === 'maintenance'
                  ? 'Create Maintenance Retainer'
                  : 'Create Support Ticket'
        }
      >
        {activeTab === 'onboarding' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await hqFetch('/api/hq/onboarding', { method: 'POST', body: JSON.stringify(obForm) });
                onToast('success', 'Onboarding item added');
                setDrawerOpen(false);
                loadData();
              } catch (err: any) {
                onToast('error', err.message);
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-4 text-sm"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Customer *</label>
              <select
                required
                value={obForm.client_id}
                onChange={(e) => setObForm({ ...obForm, client_id: e.target.value })}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Checklist Title *</label>
              <input
                required
                value={obForm.title}
                onChange={(e) => setObForm({ ...obForm, title: e.target.value })}
                placeholder="e.g., Obtain Cloudflare DNS zone access"
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                <input
                  value={obForm.category}
                  onChange={(e) => setObForm({ ...obForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Owner</label>
                <select
                  value={obForm.owner_role}
                  onChange={(e) => setObForm({ ...obForm, owner_role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                >
                  <option value="Studio">Studio</option>
                  <option value="Client">Client</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={busy} className="w-full py-2 text-xs font-semibold text-white bg-blue-700 rounded-md cursor-pointer">
              Save Item
            </button>
          </form>
        )}

        {activeTab === 'approvals' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await hqFetch('/api/hq/approvals', { method: 'POST', body: JSON.stringify(apForm) });
                onToast('success', 'Approval gate created');
                setDrawerOpen(false);
                loadData();
              } catch (err: any) {
                onToast('error', err.message);
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-4 text-sm"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Project *</label>
              <select
                required
                value={apForm.project_id}
                onChange={(e) => setApForm({ ...apForm, project_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Approval Stage</label>
              <select
                value={apForm.stage}
                onChange={(e) => setApForm({ ...apForm, stage: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                {APPROVAL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Title *</label>
              <input
                required
                value={apForm.title}
                onChange={(e) => setApForm({ ...apForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <button type="submit" disabled={busy} className="w-full py-2 text-xs font-semibold text-white bg-blue-700 rounded-md cursor-pointer">
              Create Approval Request
            </button>
          </form>
        )}

        {activeTab === 'qa' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await hqFetch('/api/hq/qa', { method: 'POST', body: JSON.stringify(qaForm) });
                onToast('success', 'QA check added');
                setDrawerOpen(false);
                loadData();
              } catch (err: any) {
                onToast('error', err.message);
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-4 text-sm"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Project *</label>
              <select
                required
                value={qaForm.project_id}
                onChange={(e) => setQaForm({ ...qaForm, project_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={qaForm.category}
                  onChange={(e) => setQaForm({ ...qaForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                >
                  {QA_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Severity</label>
                <select
                  value={qaForm.severity}
                  onChange={(e) => setQaForm({ ...qaForm, severity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Test Case / Check Title *</label>
              <input
                required
                value={qaForm.title}
                onChange={(e) => setQaForm({ ...qaForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <button type="submit" disabled={busy} className="w-full py-2 text-xs font-semibold text-white bg-blue-700 rounded-md cursor-pointer">
              Save QA Check
            </button>
          </form>
        )}

        {activeTab === 'maintenance' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await hqFetch('/api/hq/maintenance', {
                  method: 'POST',
                  body: JSON.stringify({
                    ...planForm,
                    project_id: planForm.project_id || null,
                    amount_minor: parseMajorToMinor(planForm.amount_major)
                  })
                });
                onToast('success', 'Maintenance plan created');
                setDrawerOpen(false);
                loadData();
              } catch (err: any) {
                onToast('error', err.message);
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-4 text-sm"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Customer *</label>
              <select
                required
                value={planForm.client_id}
                onChange={(e) => setPlanForm({ ...planForm, client_id: e.target.value })}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Plan Name *</label>
              <input
                required
                value={planForm.plan_name}
                onChange={(e) => setPlanForm({ ...planForm, plan_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Billing Cycle</label>
                <select
                  value={planForm.billing_cycle}
                  onChange={(e) => setPlanForm({ ...planForm, billing_cycle: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Annual">Annual</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Amount ({planForm.currency})</label>
                <input
                  type="number"
                  step="0.01"
                  value={planForm.amount_major}
                  onChange={(e) => setPlanForm({ ...planForm, amount_major: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  required
                  value={planForm.start_date}
                  onChange={(e) => setPlanForm({ ...planForm, start_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Renewal / Expiry Date</label>
                <input
                  type="date"
                  required
                  value={planForm.expiry_date}
                  onChange={(e) => setPlanForm({ ...planForm, expiry_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <button type="submit" disabled={busy} className="w-full py-2 text-xs font-semibold text-white bg-blue-700 rounded-md cursor-pointer">
              Save Maintenance Plan
            </button>
          </form>
        )}

        {activeTab === 'support' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await hqFetch('/api/hq/support', {
                  method: 'POST',
                  body: JSON.stringify({ ...ticketForm, project_id: ticketForm.project_id || null })
                });
                onToast('success', 'Support ticket opened');
                setDrawerOpen(false);
                loadData();
              } catch (err: any) {
                onToast('error', err.message);
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-4 text-sm"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Customer *</label>
              <select
                required
                value={ticketForm.client_id}
                onChange={(e) => setTicketForm({ ...ticketForm, client_id: e.target.value })}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Subject *</label>
              <input
                required
                value={ticketForm.subject}
                onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                <input
                  value={ticketForm.category}
                  onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                <select
                  value={ticketForm.priority}
                  onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Issue Description</label>
              <textarea
                rows={3}
                value={ticketForm.description}
                onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <button type="submit" disabled={busy} className="w-full py-2 text-xs font-semibold text-white bg-blue-700 rounded-md cursor-pointer">
              Open Ticket
            </button>
          </form>
        )}
      </SlideOverDrawer>

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
