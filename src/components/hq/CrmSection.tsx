// src/components/hq/CrmSection.tsx
// Studio HQ CRM Module: Leads, Customers (with isolated detail drawer), Contacts, Follow-ups & Communication Notes

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Phone,
  Mail,
  Globe,
  CalendarClock,
  MessageSquare,
  ArrowRightCircle,
  Archive,
  RotateCcw,
  Trash2,
  Edit3,
  Eye
} from 'lucide-react';
import {
  hqFetch,
  formatMoney,
  formatDate,
  formatDateTime,
  parseMajorToMinor,
  minorToMajorString
} from '../../services/hqService';
import {
  HqLead,
  HqClient,
  HqContact,
  HqFollowUp,
  HqNote,
  HqSubView,
  HqProject,
  HqInvoice,
  HqQuotation
} from '../../types/hq';
import {
  SectionToolbar,
  StatusDotText,
  ProjectStatusBadge,
  EmptyState,
  LoadingSkeleton,
  SlideOverDrawer,
  ConfirmDialog
} from './HqUiPrimitives';
import {
  CANONICAL_CLIENT_STATUSES,
  SELECTABLE_CLIENT_STATUSES,
  getClientStatusDisplayLabel,
  toCanonicalClientPayload,
  normalizeClientDetailResponse,
  type NormalizedClientDetailBundle
} from '../../services/hqClientHelpers';

const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Converted', 'Lost'];
const CLIENT_STATUSES = [...CANONICAL_CLIENT_STATUSES];
const FOLLOWUP_STATUSES = ['Scheduled', 'Completed', 'Cancelled'];

type CustomerDetailBundle = NormalizedClientDetailBundle;

export const CrmSection: React.FC<{
  subView: HqSubView;
  onSubViewChange: (sv: HqSubView) => void;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
  onOpenProject?: (projectId: string) => void;
}> = ({ subView, onSubViewChange, onToast, onOpenProject }) => {
  const activeTab =
    subView === 'crm-leads'
      ? 'leads'
      : subView === 'crm-contacts'
        ? 'contacts'
        : subView === 'crm-follow-ups'
          ? 'follow-ups'
          : subView === 'crm-notes'
            ? 'notes'
            : 'customers';

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [leads, setLeads] = useState<HqLead[]>([]);
  const [clients, setClients] = useState<HqClient[]>([]);
  const [allClients, setAllClients] = useState<HqClient[]>([]);
  const [contacts, setContacts] = useState<HqContact[]>([]);
  const [followUps, setFollowUps] = useState<HqFollowUp[]>([]);
  const [notes, setNotes] = useState<HqNote[]>([]);

  // Drawers & Modals
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<HqLead | null>(null);
  const [convertLeadTarget, setConvertLeadTarget] = useState<HqLead | null>(null);
  const [convertCreateProject, setConvertCreateProject] = useState(true);
  const [convertProjectName, setConvertProjectName] = useState('');

  const [clientDrawerOpen, setClientDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<HqClient | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetailBundle | null>(null);

  const [contactDrawerOpen, setContactDrawerOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<HqContact | null>(null);

  const [followUpDrawerOpen, setFollowUpDrawerOpen] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState<HqFollowUp | null>(null);

  const [noteDrawerOpen, setNoteDrawerOpen] = useState(false);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    destructive?: boolean;
    onConfirm: () => Promise<void>;
  }>({ open: false, title: '', description: '', onConfirm: async () => {} });
  const [busy, setBusy] = useState(false);

  // Form states
  const [leadForm, setLeadForm] = useState({
    business_name: '',
    contact_name: '',
    email: '',
    phone: '',
    category: 'Web Development',
    website: '',
    source: 'Website Enquiry',
    status: 'New',
    estimated_major: '0',
    currency: 'INR',
    next_follow_up_at: '',
    notes: ''
  });

  const [clientForm, setClientForm] = useState({
    business_name: '',
    name: '',
    email: '',
    phone: '',
    category: 'Business Website',
    website: '',
    address: '',
    status: 'active',
    lead_source: 'Direct',
    notes: ''
  });

  const [contactForm, setContactForm] = useState({
    client_id: '',
    name: '',
    role: '',
    email: '',
    phone: '',
    is_primary: false,
    notes: ''
  });

  const [followUpForm, setFollowUpForm] = useState({
    client_id: '',
    lead_id: '',
    title: '',
    channel: 'Email',
    scheduled_at: '',
    status: 'Scheduled',
    outcome_notes: ''
  });

  const [noteForm, setNoteForm] = useState({
    client_id: '',
    note_type: 'Call',
    subject: '',
    content: ''
  });

  const loadReferenceClients = useCallback(async () => {
    try {
      const res = await hqFetch<{ clients: HqClient[] }>('/api/hq/clients?limit=200');
      setAllClients(res.clients || []);
    } catch {
      // silent reference load
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'leads') {
        const params = new URLSearchParams({ page: String(page), limit: '25' });
        if (search) params.set('q', search);
        if (statusFilter !== 'All') params.set('status', statusFilter);
        const res = await hqFetch<{ leads: HqLead[]; total: number }>(`/api/hq/leads?${params.toString()}`);
        setLeads(res.leads || []);
        setTotal(res.total || 0);
      } else if (activeTab === 'customers') {
        const params = new URLSearchParams({ page: String(page), limit: '25' });
        if (search) params.set('q', search);
        if (statusFilter !== 'All') {
          if (statusFilter === 'archived') {
            params.set('archivedOnly', 'true');
          } else {
            params.set('status', statusFilter);
          }
        }
        const res = await hqFetch<{ clients: HqClient[]; total: number }>(`/api/hq/clients?${params.toString()}`);
        setClients(res.clients || []);
        setTotal(res.total || 0);
      } else if (activeTab === 'contacts') {
        const params = new URLSearchParams();
        if (search) params.set('q', search);
        const res = await hqFetch<{ contacts: HqContact[] }>(`/api/hq/contacts?${params.toString()}`);
        setContacts(res.contacts || []);
      } else if (activeTab === 'follow-ups') {
        const params = new URLSearchParams();
        if (statusFilter !== 'All') params.set('status', statusFilter);
        const res = await hqFetch<{ followUps: HqFollowUp[] }>(`/api/hq/follow-ups?${params.toString()}`);
        setFollowUps(res.followUps || []);
      } else if (activeTab === 'notes') {
        const res = await hqFetch<{ notes: HqNote[] }>('/api/hq/notes');
        setNotes(res.notes || []);
      }
    } catch (err: any) {
      onToast('error', err.message || 'Failed to load CRM data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, search, statusFilter, onToast]);

  useEffect(() => {
    setStatusFilter('All');
    setSearch('');
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    loadReferenceClients();
  }, [loadReferenceClients]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCustomerDetail = async (clientId: string) => {
    try {
      const clientRes = await hqFetch<{ ok?: boolean; client?: HqClient }>(
        `/api/hq/clients/${encodeURIComponent(clientId)}`
      );
      let linkedProjects: HqProject[] = [];
      let projectsError: string | null = null;
      try {
        const projRes = await hqFetch<{ ok?: boolean; projects?: HqProject[] }>(
          `/api/hq/projects?clientId=${encodeURIComponent(clientId)}`
        );
        linkedProjects = projRes.projects || [];
      } catch (err: any) {
        projectsError = err.message || 'Unable to load linked projects';
        onToast('error', `Customer loaded, but linked projects failed to load: ${projectsError}`);
      }
      const normalized = normalizeClientDetailResponse({
        ...clientRes,
        projects: linkedProjects,
        projectsError
      });
      setCustomerDetail(normalized);
    } catch (err: any) {
      onToast('error', err.message || 'Failed to inspect customer record');
    }
  };

  // Lead submit
  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadForm.business_name.trim() || !leadForm.contact_name.trim()) {
      onToast('error', 'Business name and contact person are required.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...(editingLead ? { id: editingLead.id } : {}),
        business_name: leadForm.business_name.trim(),
        contact_name: leadForm.contact_name.trim(),
        email: leadForm.email.trim(),
        phone: leadForm.phone.trim(),
        category: leadForm.category.trim(),
        website: leadForm.website.trim(),
        source: leadForm.source.trim(),
        status: leadForm.status,
        estimated_value_minor: parseMajorToMinor(leadForm.estimated_major),
        currency: leadForm.currency,
        next_follow_up_at: leadForm.next_follow_up_at || null,
        notes: leadForm.notes.trim()
      };
      await hqFetch('/api/hq/leads', {
        method: editingLead ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      onToast('success', editingLead ? 'Lead updated' : 'Lead created');
      setLeadDrawerOpen(false);
      setEditingLead(null);
      loadData();
    } catch (err: any) {
      onToast('error', err.message || 'Failed to save lead');
    } finally {
      setBusy(false);
    }
  };

  const handleQualifyLead = async (lead: HqLead) => {
    try {
      await hqFetch('/api/hq/leads', {
        method: 'PUT',
        body: JSON.stringify({ id: lead.id, status: 'Qualified' })
      });
      onToast('success', `${lead.business_name} marked as Qualified`);
      loadData();
    } catch (err: any) {
      onToast('error', err.message || 'Failed to qualify lead');
    }
  };

  const handleConvertLead = async () => {
    if (!convertLeadTarget) return;
    setBusy(true);
    try {
      await hqFetch('/api/hq/leads', {
        method: 'POST',
        body: JSON.stringify({
          action: 'convert',
          leadId: convertLeadTarget.id,
          createProject: convertCreateProject,
          projectName: convertProjectName.trim() || `${convertLeadTarget.business_name} Website`
        })
      });
      onToast('success', `${convertLeadTarget.business_name} converted to Customer`);
      setConvertLeadTarget(null);
      loadReferenceClients();
      loadData();
    } catch (err: any) {
      onToast('error', err.message || 'Conversion failed');
    } finally {
      setBusy(false);
    }
  };

  // Client submit
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientForm.business_name.trim() && !clientForm.name.trim()) {
      onToast('error', 'Business name or contact person is required.');
      return;
    }
    setBusy(true);
    try {
      const payload = toCanonicalClientPayload(clientForm, Boolean(editingClient));
      if (editingClient) {
        await hqFetch(`/api/hq/clients/${encodeURIComponent(editingClient.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        onToast('success', 'Customer updated');
      } else {
        await hqFetch('/api/hq/clients', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        onToast('success', 'Customer created');
      }
      setClientDrawerOpen(false);
      setEditingClient(null);
      loadReferenceClients();
      loadData();
    } catch (err: any) {
      const code = err.code && err.code !== 'API_ERROR' ? `${err.code}: ` : '';
      onToast('error', `${code}${err.message || 'Failed to save customer'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveToggle = async (client: HqClient) => {
    const isArchived = Boolean(client.archived_at);
    try {
      const action = isArchived ? 'restore' : 'archive';
      await hqFetch(`/api/hq/clients/${encodeURIComponent(client.id)}/${action}`, {
        method: 'POST'
      });
      onToast('success', isArchived ? 'Customer restored' : 'Customer archived');
      loadReferenceClients();
      loadData();
    } catch (err: any) {
      let msg = err.message || 'Action failed';
      if (err.message?.includes('CLIENT_HAS_ACTIVE_PROJECTS')) {
        msg = 'Cannot archive customer: client has active unarchived projects.';
      }
      onToast('error', msg);
    }
  };

  // Contact submit
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.client_id || !contactForm.name.trim()) {
      onToast('error', 'Customer and contact name are required.');
      return;
    }
    setBusy(true);
    try {
      await hqFetch('/api/hq/contacts', {
        method: editingContact ? 'PUT' : 'POST',
        body: JSON.stringify(editingContact ? { id: editingContact.id, ...contactForm } : contactForm)
      });
      onToast('success', editingContact ? 'Contact updated' : 'Contact added');
      setContactDrawerOpen(false);
      setEditingContact(null);
      loadData();
      if (customerDetail && customerDetail.client.id === contactForm.client_id) {
        openCustomerDetail(contactForm.client_id);
      }
    } catch (err: any) {
      onToast('error', err.message || 'Failed to save contact');
    } finally {
      setBusy(false);
    }
  };

  // Follow-up submit
  const handleSaveFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpForm.title.trim() || !followUpForm.scheduled_at) {
      onToast('error', 'Title and scheduled date/time are required.');
      return;
    }
    setBusy(true);
    try {
      await hqFetch('/api/hq/follow-ups', {
        method: editingFollowUp ? 'PUT' : 'POST',
        body: JSON.stringify(editingFollowUp ? { id: editingFollowUp.id, ...followUpForm } : followUpForm)
      });
      onToast('success', editingFollowUp ? 'Follow-up updated' : 'Follow-up scheduled');
      setFollowUpDrawerOpen(false);
      setEditingFollowUp(null);
      loadData();
      if (customerDetail && followUpForm.client_id === customerDetail.client.id) {
        openCustomerDetail(followUpForm.client_id);
      }
    } catch (err: any) {
      onToast('error', err.message || 'Failed to save follow-up');
    } finally {
      setBusy(false);
    }
  };

  // Note submit
  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteForm.client_id || !noteForm.content.trim()) {
      onToast('error', 'Customer and communication note content are required.');
      return;
    }
    setBusy(true);
    try {
      await hqFetch('/api/hq/notes', {
        method: 'POST',
        body: JSON.stringify(noteForm)
      });
      onToast('success', 'Communication note logged');
      setNoteDrawerOpen(false);
      setNoteForm({ client_id: '', note_type: 'Call', subject: '', content: '' });
      loadData();
      if (customerDetail && noteForm.client_id === customerDetail.client.id) {
        openCustomerDetail(noteForm.client_id);
      }
    } catch (err: any) {
      onToast('error', err.message || 'Failed to log note');
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ key: HqSubView; label: string }> = [
    { key: 'crm-leads', label: 'Leads' },
    { key: 'crm-customers', label: 'Customers' },
    { key: 'crm-contacts', label: 'Contacts' },
    { key: 'crm-follow-ups', label: 'Follow-ups' },
    { key: 'crm-notes', label: 'Communication History' }
  ];

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">CRM & Pipeline</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage enquiries, leads, customer accounts, contacts, and interactions</p>
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

      {/* LEADS TAB */}
      {activeTab === 'leads' && (
        <>
          <SectionToolbar
            searchValue={search}
            onSearchChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            searchPlaceholder="Search leads by business, contact, email or source..."
            filterValue={statusFilter}
            onFilterChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            filterOptions={LEAD_STATUSES}
            filterLabel="Stage"
            primaryAction={{
              label: 'New Lead',
              onClick: () => {
                setEditingLead(null);
                setLeadForm({
                  business_name: '',
                  contact_name: '',
                  email: '',
                  phone: '',
                  category: 'Web Development',
                  website: '',
                  source: 'Website Enquiry',
                  status: 'New',
                  estimated_major: '0',
                  currency: 'INR',
                  next_follow_up_at: '',
                  notes: ''
                });
                setLeadDrawerOpen(true);
              }
            }}
          />

          {loading ? (
            <LoadingSkeleton />
          ) : leads.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="w-5 h-5" />}
              title="No leads found"
              description="Capture incoming studio enquiries here to qualify, follow up, and convert into customers."
              actionLabel="Add First Lead"
              onAction={() => setLeadDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Business & Contact</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Stage</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Source</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Est. Value</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Follow-up</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leads.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{l.business_name}</div>
                          <div className="text-xs text-slate-500">
                            {l.contact_name}
                            {l.email ? ` · ${l.email}` : ''}
                            {l.phone ? ` · ${l.phone}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusDotText status={l.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{l.source || '—'}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs font-medium text-slate-900">
                          {formatMoney(l.estimated_value_minor, l.currency)}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-600">{formatDate(l.next_follow_up_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {l.status === 'New' || l.status === 'Contacted' ? (
                              <button
                                type="button"
                                onClick={() => handleQualifyLead(l)}
                                className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 cursor-pointer"
                              >
                                Qualify
                              </button>
                            ) : null}
                            {l.status !== 'Converted' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setConvertLeadTarget(l);
                                  setConvertProjectName(`${l.business_name} Website`);
                                  setConvertCreateProject(true);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 cursor-pointer"
                              >
                                <ArrowRightCircle className="w-3 h-3" /> Convert
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLead(l);
                                setLeadForm({
                                  business_name: l.business_name,
                                  contact_name: l.contact_name,
                                  email: l.email || '',
                                  phone: l.phone || '',
                                  category: l.category || '',
                                  website: l.website || '',
                                  source: l.source || '',
                                  status: l.status,
                                  estimated_major: minorToMajorString(l.estimated_value_minor),
                                  currency: l.currency || 'INR',
                                  next_follow_up_at: l.next_follow_up_at || '',
                                  notes: l.notes || ''
                                });
                                setLeadDrawerOpen(true);
                              }}
                              aria-label={`Edit ${l.business_name}`}
                              className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmState({
                                  open: true,
                                  title: 'Delete lead?',
                                  description: `Permanently delete ${l.business_name}? This cannot be undone.`,
                                  destructive: true,
                                  onConfirm: async () => {
                                    await hqFetch(`/api/hq/leads?id=${encodeURIComponent(l.id)}`, { method: 'DELETE' });
                                    onToast('success', 'Lead deleted');
                                    loadData();
                                  }
                                })
                              }
                              aria-label={`Delete ${l.business_name}`}
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
              {total > 25 && (
                <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Page {page} · {total} total leads
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 border border-slate-200 rounded disabled:opacity-40 cursor-pointer"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page * 25 >= total}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-2.5 py-1 border border-slate-200 rounded disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* CUSTOMERS TAB */}
      {activeTab === 'customers' && (
        <>
          <SectionToolbar
            searchValue={search}
            onSearchChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            searchPlaceholder="Search customers by business name, contact, email or category..."
            filterValue={statusFilter}
            onFilterChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            filterOptions={CLIENT_STATUSES}
            filterLabel="Status"
            primaryAction={{
              label: 'New Customer',
              onClick: () => {
                setEditingClient(null);
                setClientForm({
                  business_name: '',
                  name: '',
                  email: '',
                  phone: '',
                  category: 'Business Website',
                  website: '',
                  address: '',
                  status: 'active',
                  lead_source: 'Direct',
                  notes: ''
                });
                setClientDrawerOpen(true);
              }
            }}
          />

          {loading ? (
            <LoadingSkeleton />
          ) : clients.length === 0 ? (
            <EmptyState
              icon={<Users className="w-5 h-5" />}
              title="No customers found"
              description="Add a customer account directly or convert a qualified lead into an active customer."
              actionLabel="Add Customer"
              onAction={() => setClientDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Business & Contact</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Category</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Projects</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Outstanding</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Last Contact</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clients.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openCustomerDetail(c.id)}
                            className="text-left font-semibold text-slate-900 hover:text-blue-700 cursor-pointer"
                          >
                            {c.business_name || c.name}
                          </button>
                          <div className="text-xs text-slate-500">
                            {c.name}
                            {c.email ? ` · ${c.email}` : ''}
                            {c.phone ? ` · ${c.phone}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{c.category || '—'}</td>
                        <td className="px-4 py-3">
                          <StatusDotText status={c.status} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-slate-700">
                          {c.project_count ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs font-medium text-slate-900">
                          {formatMoney(c.outstanding_minor ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{formatDate(c.last_contact_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openCustomerDetail(c.id)}
                              title="Open Customer 360° Workspace"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" /> View
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingClient(c);
                                setClientForm({
                                  business_name: c.business_name || '',
                                  name: c.name || '',
                                  email: c.email || '',
                                  phone: c.phone || '',
                                  category: c.category || '',
                                  website: c.website || c.website_url || '',
                                  address: c.address || c.billing_address || '',
                                  status: c.status || 'active',
                                  lead_source: c.lead_source || c.source || '',
                                  notes: c.notes || ''
                                });
                                setClientDrawerOpen(true);
                              }}
                              aria-label={`Edit ${c.business_name}`}
                              className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchiveToggle(c)}
                              title={Boolean(c.archived_at) ? 'Restore Customer' : 'Archive Customer'}
                              className="p-1.5 text-slate-500 hover:text-amber-700 rounded hover:bg-amber-50 cursor-pointer"
                            >
                              {Boolean(c.archived_at) ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > 25 && (
                <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Page {page} · {total} total customers
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 border border-slate-200 rounded disabled:opacity-40 cursor-pointer"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page * 25 >= total}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-2.5 py-1 border border-slate-200 rounded disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* CONTACTS TAB */}
      {activeTab === 'contacts' && (
        <>
          <SectionToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search contacts by name, email or customer..."
            primaryAction={{
              label: 'New Contact',
              onClick: () => {
                setEditingContact(null);
                setContactForm({
                  client_id: allClients[0]?.id || '',
                  name: '',
                  role: '',
                  email: '',
                  phone: '',
                  is_primary: false,
                  notes: ''
                });
                setContactDrawerOpen(true);
              }
            }}
          />
          {loading ? (
            <LoadingSkeleton />
          ) : contacts.length === 0 ? (
            <EmptyState
              title="No contacts recorded"
              description="Add key stakeholders and billing contacts linked to your customer accounts."
              actionLabel="Add Contact"
              onAction={() => setContactDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Contact Person</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Customer</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Details</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contacts.map((ct) => (
                    <tr key={ct.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">
                          {ct.name}{' '}
                          {ct.is_primary === 1 && (
                            <span className="ml-1.5 text-[11px] font-mono text-blue-700 font-medium">[Primary]</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700">{ct.client_business || ct.client_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{ct.role || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div>{ct.email || '—'}</div>
                        <div className="font-mono text-slate-500">{ct.phone || ''}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingContact(ct);
                            setContactForm({
                              client_id: ct.client_id,
                              name: ct.name,
                              role: ct.role || '',
                              email: ct.email || '',
                              phone: ct.phone || '',
                              is_primary: ct.is_primary === 1,
                              notes: ct.notes || ''
                            });
                            setContactDrawerOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmState({
                              open: true,
                              title: 'Delete contact?',
                              description: `Remove ${ct.name} from contacts?`,
                              destructive: true,
                              onConfirm: async () => {
                                await hqFetch(`/api/hq/contacts?id=${encodeURIComponent(ct.id)}`, { method: 'DELETE' });
                                onToast('success', 'Contact removed');
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

      {/* FOLLOW-UPS TAB */}
      {activeTab === 'follow-ups' && (
        <>
          <SectionToolbar
            filterValue={statusFilter}
            onFilterChange={setStatusFilter}
            filterOptions={FOLLOWUP_STATUSES}
            filterLabel="Status"
            primaryAction={{
              label: 'Schedule Follow-up',
              onClick: () => {
                setEditingFollowUp(null);
                setFollowUpForm({
                  client_id: allClients[0]?.id || '',
                  lead_id: '',
                  title: '',
                  channel: 'Email',
                  scheduled_at: new Date().toISOString().slice(0, 16),
                  status: 'Scheduled',
                  outcome_notes: ''
                });
                setFollowUpDrawerOpen(true);
              }
            }}
          />
          {loading ? (
            <LoadingSkeleton />
          ) : followUps.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="w-5 h-5" />}
              title="No follow-ups scheduled"
              description="Schedule calls, proposal check-ins, and renewal reminders so nothing slips through the cracks."
              actionLabel="Schedule Follow-up"
              onAction={() => setFollowUpDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {followUps.map((f) => (
                <div key={f.id} className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-sm text-slate-900">{f.title}</span>
                      <StatusDotText status={f.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {f.client_business || f.lead_business || 'General'} · {f.channel} · Scheduled{' '}
                      <span className="font-mono">{formatDateTime(f.scheduled_at)}</span>
                    </div>
                    {f.outcome_notes && <p className="text-xs text-slate-600 mt-1">{f.outcome_notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {f.status === 'Scheduled' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await hqFetch('/api/hq/follow-ups', {
                            method: 'PUT',
                            body: JSON.stringify({ id: f.id, status: 'Completed' })
                          });
                          onToast('success', 'Follow-up completed');
                          loadData();
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 cursor-pointer"
                      >
                        Mark Done
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: 'Delete follow-up?',
                          description: `Remove "${f.title}"?`,
                          destructive: true,
                          onConfirm: async () => {
                            await hqFetch(`/api/hq/follow-ups?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' });
                            onToast('success', 'Follow-up deleted');
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

      {/* COMMUNICATION HISTORY TAB */}
      {activeTab === 'notes' && (
        <>
          <SectionToolbar
            primaryAction={{
              label: 'Log Communication Note',
              onClick: () => {
                setNoteForm({
                  client_id: allClients[0]?.id || '',
                  note_type: 'Call',
                  subject: '',
                  content: ''
                });
                setNoteDrawerOpen(true);
              }
            }}
          />
          {loading ? (
            <LoadingSkeleton />
          ) : notes.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="w-5 h-5" />}
              title="No communication notes yet"
              description="Record client calls, meetings, scope discussions, and email summaries for complete institutional memory."
              actionLabel="Log First Note"
              onAction={() => setNoteDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {notes.map((n) => (
                <div key={n.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-900">{n.client_business || n.client_name}</span>
                      <span>·</span>
                      <span className="font-mono text-blue-700 font-medium">{n.note_type}</span>
                      {n.project_name && (
                        <>
                          <span>·</span>
                          <span>{n.project_name}</span>
                        </>
                      )}
                      <span>·</span>
                      <span className="font-mono">{formatDateTime(n.created_at)}</span>
                    </div>
                    {n.subject && <div className="text-sm font-semibold text-slate-900">{n.subject}</div>}
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmState({
                        open: true,
                        title: 'Delete communication note?',
                        description: 'Permanently delete this communication record?',
                        destructive: true,
                        onConfirm: async () => {
                          await hqFetch(`/api/hq/notes?id=${encodeURIComponent(n.id)}`, { method: 'DELETE' });
                          onToast('success', 'Note deleted');
                          loadData();
                        }
                      })
                    }
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ISOLATED CUSTOMER 360° WORKSPACE DRAWER */}
      <SlideOverDrawer
        open={Boolean(customerDetail)}
        onClose={() => setCustomerDetail(null)}
        title={customerDetail ? customerDetail.client.business_name || customerDetail.client.name : ''}
        subtitle={
          customerDetail
            ? `Customer ID: ${customerDetail.client.id.slice(0, 8)} · ${customerDetail.client.category || 'Studio Client'}`
            : ''
        }
        widthClass="max-w-2xl"
      >
        {customerDetail && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold">{customerDetail.client.name}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{customerDetail.client.email || 'No email'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{customerDetail.client.phone || 'No phone'}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  <StatusDotText status={customerDetail.client.status} />
                </div>
                {customerDetail.client.website && (
                  <div className="flex items-center gap-1.5 text-blue-700 truncate">
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{customerDetail.client.website}</span>
                  </div>
                )}
                <div className="text-slate-500">Last Contact: {formatDate(customerDetail.client.last_contact_at)}</div>
              </div>
            </div>

            {customerDetail.client.notes && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-500 mb-1.5">Account Notes</h4>
                <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-md p-3 whitespace-pre-wrap">
                  {customerDetail.client.notes}
                </p>
              </div>
            )}

            {/* Quick actions inside customer context */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setNoteForm({ client_id: customerDetail.client.id, note_type: 'Call', subject: '', content: '' });
                  setNoteDrawerOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
              >
                + Log Note
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingContact(null);
                  setContactForm({
                    client_id: customerDetail.client.id,
                    name: '',
                    role: '',
                    email: '',
                    phone: '',
                    is_primary: false,
                    notes: ''
                  });
                  setContactDrawerOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
              >
                + Add Contact
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingFollowUp(null);
                  setFollowUpForm({
                    client_id: customerDetail.client.id,
                    lead_id: '',
                    title: '',
                    channel: 'Call',
                    scheduled_at: new Date().toISOString().slice(0, 16),
                    status: 'Scheduled',
                    outcome_notes: ''
                  });
                  setFollowUpDrawerOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
              >
                + Schedule Follow-up
              </button>
            </div>

            {/* Linked Projects */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase text-slate-500">
                  Projects {customerDetail.projectsError ? '' : `(${customerDetail.projects.length})`}
                </h4>
                {customerDetail.projectsError && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const projRes = await hqFetch<{ ok?: boolean; projects?: HqProject[] }>(
                          `/api/hq/projects?clientId=${encodeURIComponent(customerDetail.client.id)}`
                        );
                        setCustomerDetail((prev) =>
                          prev
                            ? {
                                ...prev,
                                projects: projRes.projects || [],
                                projectsError: null
                              }
                            : null
                        );
                        onToast('success', 'Projects loaded successfully');
                      } catch (err: any) {
                        onToast('error', err.message || 'Retry failed');
                      }
                    }}
                    className="text-xs text-amber-700 hover:underline cursor-pointer"
                  >
                    Retry loading
                  </button>
                )}
              </div>
              {customerDetail.projectsError ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
                  <span className="font-semibold">Unable to load linked projects:</span> {customerDetail.projectsError}
                </div>
              ) : customerDetail.projects.length === 0 ? (
                <p className="text-xs text-slate-500">No projects linked to this customer yet.</p>
              ) : (
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                  {customerDetail.projects.map((p) => (
                    <div key={p.id} className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerDetail(null);
                            onOpenProject?.(p.id);
                          }}
                          className="font-semibold text-blue-700 hover:underline cursor-pointer"
                        >
                          {p.name}
                        </button>
                        <div className="text-slate-500">{p.project_type}</div>
                      </div>
                      <ProjectStatusBadge status={p.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Linked Invoices */}
            <div>
              <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">
                Invoices ({customerDetail.invoices.length})
              </h4>
              {customerDetail.invoices.length === 0 ? (
                <p className="text-xs text-slate-500">No invoices issued for this customer.</p>
              ) : (
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                  {customerDetail.invoices.map((inv) => (
                    <div key={inv.id} className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-mono font-semibold text-slate-900">{inv.invoice_number}</span>
                        <span className="text-slate-500 ml-2">{inv.title}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono tabular-nums font-medium">{formatMoney(inv.total_minor, inv.currency)}</span>
                        <StatusDotText status={inv.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contacts & Notes summary */}
            <div>
              <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">
                Contacts ({customerDetail.contacts.length})
              </h4>
              <div className="space-y-1.5">
                {customerDetail.contacts.map((ct) => (
                  <div key={ct.id} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs flex justify-between">
                    <span>
                      <strong>{ct.name}</strong> {ct.role ? `· ${ct.role}` : ''}
                    </span>
                    <span className="text-slate-500">{ct.email || ct.phone}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">
                Communication History ({customerDetail.notes.length})
              </h4>
              <div className="space-y-2">
                {customerDetail.notes.map((n) => (
                  <div key={n.id} className="p-3 bg-white border border-slate-200 rounded text-xs">
                    <div className="flex justify-between text-slate-500 mb-1">
                      <span className="font-semibold text-blue-700">{n.note_type}</span>
                      <span className="font-mono">{formatDateTime(n.created_at)}</span>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">{n.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* LEAD FORM DRAWER */}
      <SlideOverDrawer
        open={leadDrawerOpen}
        onClose={() => setLeadDrawerOpen(false)}
        title={editingLead ? `Edit Lead: ${editingLead.business_name}` : 'Create New Lead'}
      >
        <form onSubmit={handleSaveLead} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Business Name *</label>
              <input
                required
                value={leadForm.business_name}
                onChange={(e) => setLeadForm({ ...leadForm, business_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Person *</label>
              <input
                required
                value={leadForm.contact_name}
                onChange={(e) => setLeadForm({ ...leadForm, contact_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={leadForm.email}
                onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
              <input
                value={leadForm.phone}
                onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Lead Source</label>
              <input
                value={leadForm.source}
                onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Stage</label>
              <select
                value={leadForm.status}
                onChange={(e) => setLeadForm({ ...leadForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Estimated Value ({leadForm.currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={leadForm.estimated_major}
                onChange={(e) => setLeadForm({ ...leadForm, estimated_major: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Next Follow-Up Date</label>
              <input
                type="date"
                value={leadForm.next_follow_up_at}
                onChange={(e) => setLeadForm({ ...leadForm, next_follow_up_at: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              rows={3}
              value={leadForm.notes}
              onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setLeadDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              {busy ? 'Saving…' : editingLead ? 'Save Changes' : 'Create Lead'}
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* CUSTOMER FORM DRAWER */}
      <SlideOverDrawer
        open={clientDrawerOpen}
        onClose={() => setClientDrawerOpen(false)}
        title={editingClient ? `Edit Customer: ${editingClient.business_name}` : 'Create Customer Account'}
      >
        <form onSubmit={handleSaveClient} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Business Name *</label>
              <input
                required
                value={clientForm.business_name}
                onChange={(e) => setClientForm({ ...clientForm, business_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Primary Contact Person *</label>
              <input
                required
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
              <input
                value={clientForm.phone}
                onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Business Category</label>
              <input
                value={clientForm.category}
                onChange={(e) => setClientForm({ ...clientForm, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={clientForm.status}
                onChange={(e) => setClientForm({ ...clientForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                {SELECTABLE_CLIENT_STATUSES.map((s) => (
                  <option key={s.canonical} value={s.canonical}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Website</label>
              <input
                value={clientForm.website}
                onChange={(e) => setClientForm({ ...clientForm, website: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Lead Source</label>
              <input
                value={clientForm.lead_source}
                onChange={(e) => setClientForm({ ...clientForm, lead_source: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
            <input
              value={clientForm.address}
              onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              rows={3}
              value={clientForm.notes}
              onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setClientDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              {busy ? 'Saving…' : editingClient ? 'Save Changes' : 'Create Customer'}
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* CONTACT DRAWER */}
      <SlideOverDrawer
        open={contactDrawerOpen}
        onClose={() => setContactDrawerOpen(false)}
        title={editingContact ? 'Edit Contact' : 'Add Contact'}
      >
        <form onSubmit={handleSaveContact} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Customer *</label>
            <select
              required
              value={contactForm.client_id}
              onChange={(e) => setContactForm({ ...contactForm, client_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            >
              <option value="">Select customer…</option>
              {allClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name || c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
            <input
              required
              value={contactForm.name}
              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
              <input
                value={contactForm.role}
                onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
              <input
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={contactForm.email}
              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={contactForm.is_primary}
              onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })}
            />
            Primary Contact for Customer
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setContactDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              Save Contact
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* FOLLOW-UP DRAWER */}
      <SlideOverDrawer open={followUpDrawerOpen} onClose={() => setFollowUpDrawerOpen(false)} title="Schedule Follow-up">
        <form onSubmit={handleSaveFollowUp} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Customer (optional)</label>
            <select
              value={followUpForm.client_id}
              onChange={(e) => setFollowUpForm({ ...followUpForm, client_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            >
              <option value="">General / No Customer</option>
              {allClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name || c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Title *</label>
            <input
              required
              value={followUpForm.title}
              onChange={(e) => setFollowUpForm({ ...followUpForm, title: e.target.value })}
              placeholder="e.g., Review quotation feedback with client"
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Channel</label>
              <select
                value={followUpForm.channel}
                onChange={(e) => setFollowUpForm({ ...followUpForm, channel: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="Email">Email</option>
                <option value="Phone Call">Phone Call</option>
                <option value="Video Meeting">Video Meeting</option>
                <option value="WhatsApp">WhatsApp</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Scheduled Date & Time *</label>
              <input
                type="datetime-local"
                required
                value={followUpForm.scheduled_at}
                onChange={(e) => setFollowUpForm({ ...followUpForm, scheduled_at: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Outcome / Context Notes</label>
            <textarea
              rows={3}
              value={followUpForm.outcome_notes}
              onChange={(e) => setFollowUpForm({ ...followUpForm, outcome_notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFollowUpDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              Schedule
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* COMMUNICATION NOTE DRAWER */}
      <SlideOverDrawer open={noteDrawerOpen} onClose={() => setNoteDrawerOpen(false)} title="Log Communication Note">
        <form onSubmit={handleSaveNote} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Customer *</label>
            <select
              required
              value={noteForm.client_id}
              onChange={(e) => setNoteForm({ ...noteForm, client_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            >
              <option value="">Select customer…</option>
              {allClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name || c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Interaction Type</label>
              <select
                value={noteForm.note_type}
                onChange={(e) => setNoteForm({ ...noteForm, note_type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="Call">Call</option>
                <option value="Email">Email</option>
                <option value="Meeting">Meeting</option>
                <option value="Note">Internal Note</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
              <input
                value={noteForm.subject}
                onChange={(e) => setNoteForm({ ...noteForm, subject: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes *</label>
            <textarea
              required
              rows={4}
              value={noteForm.content}
              onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setNoteDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              Save Note
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* LEAD CONVERSION MODAL */}
      {convertLeadTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45" role="dialog" aria-modal="true">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Convert Lead to Customer</h3>
            <p className="text-xs text-slate-600">
              Convert <strong>{convertLeadTarget.business_name}</strong> ({convertLeadTarget.contact_name}) into an active CRM
              customer record.
            </p>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={convertCreateProject}
                onChange={(e) => setConvertCreateProject(e.target.checked)}
              />
              Also create an Onboarding Project automatically
            </label>
            {convertCreateProject && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Starter Project Name</label>
                <input
                  value={convertProjectName}
                  onChange={(e) => setConvertProjectName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConvertLeadTarget(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConvertLead}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-md hover:bg-emerald-800 cursor-pointer"
              >
                {busy ? 'Converting…' : 'Confirm Conversion'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        destructive={confirmState.destructive}
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
