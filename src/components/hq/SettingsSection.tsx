// src/components/hq/SettingsSection.tsx
// Studio HQ Settings Module: Profile, Security & Access Control, Application Settings, Audit Logs

import React, { useEffect, useState, useCallback } from 'react';
import { Shield, Settings2, History, UserCheck } from 'lucide-react';
import { hqFetch, formatDateTime } from '../../services/hqService';
import { HqOwner, HqStudioSettings, HqAuditLog, HqSubView } from '../../types/hq';
import { SectionToolbar, StatusDotText, LoadingSkeleton } from './HqUiPrimitives';

interface SettingsApiResponse {
  settings: HqStudioSettings;
  security: {
    allowedEmails: string[];
    enrolledOwners: Array<{
      uid: string;
      email: string;
      display_name: string;
      status: string;
      created_at: string;
      last_seen_at: string;
    }>;
    auditLogCount: number;
    authMode: string;
  };
}

export const SettingsSection: React.FC<{
  subView: HqSubView;
  owner: HqOwner;
  onSubViewChange: (sv: HqSubView) => void;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ subView, owner, onSubViewChange, onToast }) => {
  const activeTab =
    subView === 'settings-security'
      ? 'security'
      : subView === 'settings-application'
        ? 'application'
        : subView === 'settings-audit-logs'
          ? 'audit'
          : 'profile';

  const [loading, setLoading] = useState(true);
  const [settingsData, setSettingsData] = useState<SettingsApiResponse | null>(null);
  const [formState, setFormState] = useState<HqStudioSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<HqAuditLog[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'audit') {
        const params = new URLSearchParams({ limit: '50' });
        if (auditSearch) params.set('q', auditSearch);
        const res = await hqFetch<{ logs: HqAuditLog[] }>(`/api/hq/audit-logs?${params.toString()}`);
        setAuditLogs(res.logs || []);
      } else {
        const res = await hqFetch<SettingsApiResponse>('/api/hq/settings');
        setSettingsData(res);
        setFormState(res.settings);
      }
    } catch (err: any) {
      onToast('error', err.message || 'Failed to load workspace settings');
    } finally {
      setLoading(false);
    }
  }, [activeTab, auditSearch, onToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState) return;
    setSaving(true);
    try {
      const res = await hqFetch<{ settings: HqStudioSettings }>('/api/hq/settings', {
        method: 'PUT',
        body: JSON.stringify(formState)
      });
      setFormState(res.settings);
      onToast('success', 'Application settings updated');
    } catch (err: any) {
      onToast('error', err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ key: HqSubView; label: string }> = [
    { key: 'settings-profile', label: 'Profile' },
    { key: 'settings-security', label: 'Security' },
    { key: 'settings-application', label: 'Application Settings' },
    { key: 'settings-audit-logs', label: 'Audit Logs' }
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Settings & Governance</h1>
          <p className="text-xs text-slate-500 mt-0.5">Owner identity, cryptographic security enforcement, studio defaults, and audit trail</p>
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
        <LoadingSkeleton rows={5} />
      ) : (
        <>
          {activeTab === 'profile' && (
            <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-50 text-blue-700">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{owner.displayName || owner.email}</h2>
                  <p className="text-xs text-slate-500">Enrolled Studio HQ Owner</p>
                </div>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-200 text-xs">
                <div>
                  <dt className="text-slate-500">Verified Email</dt>
                  <dd className="font-mono font-medium text-slate-900 mt-0.5">{owner.email}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Firebase UID</dt>
                  <dd className="font-mono text-slate-700 mt-0.5">{owner.uid}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Account Status</dt>
                  <dd className="mt-0.5">
                    <StatusDotText status={owner.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Last Verified Session</dt>
                  <dd className="font-mono text-slate-700 mt-0.5">{formatDateTime(owner.lastSeenAt)}</dd>
                </div>
              </dl>
            </div>
          )}

          {activeTab === 'security' && settingsData && (
            <div className="space-y-5 max-w-4xl">
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center gap-2.5">
                  <Shield className="w-5 h-5 text-emerald-700" />
                  <h2 className="text-base font-semibold text-slate-900">Owner Authorization Architecture</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
                    <div className="text-slate-500">Verification Mode</div>
                    <div className="font-semibold text-slate-900 mt-1">{settingsData.security.authMode}</div>
                  </div>
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
                    <div className="text-slate-500">Audit Records Stored</div>
                    <div className="font-mono font-bold text-slate-900 mt-1">{settingsData.security.auditLogCount}</div>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Authorized Owner Allowlist</h3>
                  <div className="flex flex-wrap gap-2">
                    {settingsData.security.allowedEmails.map((em) => (
                      <span key={em} className="px-3 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-800">
                        {em}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
                  Enrolled D1 Owners (`hq_users`)
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Email</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">UID</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Status</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {settingsData.security.enrolledOwners.map((u) => (
                      <tr key={u.uid}>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-900">{u.email}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{u.uid}</td>
                        <td className="px-4 py-2.5">
                          <StatusDotText status={u.status} />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{formatDateTime(u.last_seen_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'application' && formState && (
            <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-lg p-6 max-w-2xl space-y-4 text-sm">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                <Settings2 className="w-4 h-4 text-blue-700" />
                <h2 className="font-semibold text-slate-900">Studio Workspace Defaults</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Studio Brand Name</label>
                  <input
                    value={formState.studioName}
                    onChange={(e) => setFormState({ ...formState, studioName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Owner Display Name</label>
                  <input
                    value={formState.ownerName}
                    onChange={(e) => setFormState({ ...formState, ownerName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Billing Contact Email</label>
                  <input
                    value={formState.contactEmail}
                    onChange={(e) => setFormState({ ...formState, contactEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Default Currency</label>
                  <select
                    value={formState.defaultCurrency}
                    onChange={(e) => setFormState({ ...formState, defaultCurrency: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Default Tax (bps, 1800 = 18%)</label>
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    value={formState.defaultTaxRateBps}
                    onChange={(e) => setFormState({ ...formState, defaultTaxRateBps: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Quotation Validity (Days)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={formState.quotationValidityDays}
                    onChange={(e) => setFormState({ ...formState, quotationValidityDays: Number(e.target.value) || 30 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Default Invoice Payment Terms</label>
                <textarea
                  rows={3}
                  value={formState.invoiceTerms}
                  onChange={(e) => setFormState({ ...formState, invoiceTerms: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
              >
                {saving ? 'Saving…' : 'Save Application Settings'}
              </button>
            </form>
          )}

          {activeTab === 'audit' && (
            <>
              <SectionToolbar
                searchValue={auditSearch}
                onSearchChange={setAuditSearch}
                searchPlaceholder="Filter audit logs by action, actor email or entity ID..."
              />
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <History className="w-4 h-4 text-slate-500" />
                  <span>Immutable Workspace Audit Trail ({auditLogs.length})</span>
                </div>
                {auditLogs.length === 0 ? (
                  <p className="p-8 text-center text-xs text-slate-500">No audit records match your filter.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div>
                          <span className="font-mono font-semibold text-slate-900">{log.action}</span>
                          <span className="text-slate-500 ml-2">
                            {log.entity_type} · {log.entity_id || '—'} · Actor: {log.actor_email || log.actor_uid}
                          </span>
                        </div>
                        <span className="font-mono text-slate-400">{formatDateTime(log.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
