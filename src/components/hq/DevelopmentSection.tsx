// src/components/hq/DevelopmentSection.tsx
// Studio HQ Development Module: GitHub Repositories (metadata only), Cloudflare Deployments & Release History

import React, { useEffect, useState, useCallback } from 'react';
import { GitBranch, Rocket, History, ExternalLink, Trash2 } from 'lucide-react';
import { hqFetch, formatDateTime } from '../../services/hqService';
import { HqRepository, HqDeployment, HqProject, HqSubView } from '../../types/hq';
import { SectionToolbar, StatusDotText, EmptyState, LoadingSkeleton, SlideOverDrawer, ConfirmDialog } from './HqUiPrimitives';

export const DevelopmentSection: React.FC<{
  subView: HqSubView;
  onSubViewChange: (sv: HqSubView) => void;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ subView, onSubViewChange, onToast }) => {
  const activeTab =
    subView === 'dev-deployments' ? 'deployments' : subView === 'dev-releases' ? 'releases' : 'repositories';

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<HqProject[]>([]);
  const [repos, setRepos] = useState<HqRepository[]>([]);
  const [deployments, setDeployments] = useState<HqDeployment[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  }>({ open: false, title: '', description: '', onConfirm: async () => {} });

  const [repoForm, setRepoForm] = useState({
    project_id: '',
    repo_name: '',
    repo_url: 'https://github.com/',
    main_branch: 'main',
    dev_branch: 'develop',
    hosting_platform: 'Cloudflare Workers',
    preview_url: '',
    production_url: '',
    deployment_status: 'Healthy',
    notes: ''
  });

  const [depForm, setDepForm] = useState({
    project_id: '',
    repository_id: '',
    environment: 'production',
    version_tag: 'v1.0.0',
    branch: 'main',
    commit_sha: '',
    deployment_url: '',
    status: 'Succeeded',
    release_notes: ''
  });

  const loadReferences = useCallback(async () => {
    try {
      const pRes = await hqFetch<{ projects: HqProject[] }>('/api/hq/projects?limit=200');
      setProjects(pRes.projects || []);
    } catch {}
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'repositories') {
        const res = await hqFetch<{ repositories: HqRepository[] }>('/api/hq/repositories');
        setRepos(res.repositories || []);
      } else {
        const [dRes, rRes] = await Promise.all([
          hqFetch<{ deployments: HqDeployment[] }>('/api/hq/deployments'),
          hqFetch<{ repositories: HqRepository[] }>('/api/hq/repositories')
        ]);
        setDeployments(dRes.deployments || []);
        setRepos(rRes.repositories || []);
      }
    } catch (err: any) {
      onToast('error', err.message || 'Failed to load development metadata');
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
    { key: 'dev-repositories', label: 'GitHub Repositories' },
    { key: 'dev-deployments', label: 'Deployments' },
    { key: 'dev-releases', label: 'Release History' }
  ];

  const openCreator = () => {
    setRepoForm((f) => ({ ...f, project_id: projects[0]?.id || '', repo_name: '' }));
    setDepForm((f) => ({ ...f, project_id: projects[0]?.id || '', repository_id: repos[0]?.id || '' }));
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Development & Releases</h1>
          <p className="text-xs text-slate-500 mt-0.5">Repository metadata registry, deployment status, and release changelog (metadata only)</p>
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

      {activeTab === 'repositories' && (
        <>
          <SectionToolbar primaryAction={{ label: 'Link Repository', onClick: openCreator }} />
          {loading ? (
            <LoadingSkeleton />
          ) : repos.length === 0 ? (
            <EmptyState
              icon={<GitBranch className="w-5 h-5" />}
              title="No GitHub repositories linked"
              description="Register client GitHub repositories, main/dev branches, and Cloudflare deployment URLs (tokens are never stored)."
              actionLabel="Link Repository"
              onAction={openCreator}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Repository & Project</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Branches</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Hosting & URLs</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Health</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {repos.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-semibold text-slate-900">{r.repo_name}</div>
                        <div className="text-xs text-slate-500">
                          {r.project_name} · {r.client_business}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-700">
                        {r.main_branch} / {r.dev_branch}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-slate-700">{r.hosting_platform}</div>
                        {r.production_url && (
                          <a href={r.production_url} target="_blank" rel="noreferrer" className="text-blue-700 inline-flex items-center gap-1 hover:underline">
                            Live <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusDotText status={r.deployment_status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmState({
                              open: true,
                              title: 'Unlink repository?',
                              description: `Remove repository metadata for "${r.repo_name}"?`,
                              onConfirm: async () => {
                                await hqFetch(`/api/hq/repositories?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
                                onToast('success', 'Repository unlinked');
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

      {(activeTab === 'deployments' || activeTab === 'releases') && (
        <>
          <SectionToolbar primaryAction={{ label: 'Log Deployment', onClick: openCreator }} />
          {loading ? (
            <LoadingSkeleton />
          ) : deployments.length === 0 ? (
            <EmptyState
              icon={activeTab === 'releases' ? <History className="w-5 h-5" /> : <Rocket className="w-5 h-5" />}
              title="No deployments or releases recorded"
              description="Record Cloudflare Worker or static asset releases with version tags, commit SHAs, and changelogs."
              actionLabel="Log Deployment"
              onAction={openCreator}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {deployments.map((d) => (
                <div key={d.id} className="p-4 flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-slate-900">{d.version_tag}</span>
                      <span className="text-sm font-semibold text-slate-900">{d.project_name}</span>
                      <StatusDotText status={d.status} />
                    </div>
                    <div className="text-xs text-slate-500">
                      {d.client_business} · Env: <strong>{d.environment}</strong> · Branch:{' '}
                      <span className="font-mono">{d.branch}</span>
                      {d.commit_sha ? ` · ${d.commit_sha.slice(0, 7)}` : ''} · Deployed {formatDateTime(d.deployed_at)}
                    </div>
                    {d.release_notes && <p className="text-xs text-slate-700 pt-1 whitespace-pre-wrap">{d.release_notes}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmState({
                        open: true,
                        title: 'Delete deployment log?',
                        description: `Remove deployment record ${d.version_tag}?`,
                        onConfirm: async () => {
                          await hqFetch(`/api/hq/deployments?id=${encodeURIComponent(d.id)}`, { method: 'DELETE' });
                          onToast('success', 'Deployment log deleted');
                          loadData();
                        }
                      })
                    }
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <SlideOverDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={activeTab === 'repositories' ? 'Link GitHub Repository' : 'Log Deployment / Release'}
      >
        {activeTab === 'repositories' ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await hqFetch('/api/hq/repositories', { method: 'POST', body: JSON.stringify(repoForm) });
                onToast('success', 'Repository linked');
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
                value={repoForm.project_id}
                onChange={(e) => setRepoForm({ ...repoForm, project_id: e.target.value })}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Repository Name *</label>
              <input
                required
                value={repoForm.repo_name}
                onChange={(e) => setRepoForm({ ...repoForm, repo_name: e.target.value })}
                placeholder="owner/repo-name"
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">GitHub URL *</label>
              <input
                required
                value={repoForm.repo_url}
                onChange={(e) => setRepoForm({ ...repoForm, repo_url: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Hosting Platform</label>
                <input
                  value={repoForm.hosting_platform}
                  onChange={(e) => setRepoForm({ ...repoForm, hosting_platform: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Production URL</label>
                <input
                  value={repoForm.production_url}
                  onChange={(e) => setRepoForm({ ...repoForm, production_url: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <button type="submit" disabled={busy} className="w-full py-2 text-xs font-semibold text-white bg-blue-700 rounded-md cursor-pointer">
              Save Repository Metadata
            </button>
          </form>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await hqFetch('/api/hq/deployments', { method: 'POST', body: JSON.stringify(depForm) });
                onToast('success', 'Deployment logged');
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
                value={depForm.project_id}
                onChange={(e) => setDepForm({ ...depForm, project_id: e.target.value })}
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Environment</label>
                <select
                  value={depForm.environment}
                  onChange={(e) => setDepForm({ ...depForm, environment: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                >
                  <option value="production">production</option>
                  <option value="staging">staging</option>
                  <option value="preview">preview</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Version Tag</label>
                <input
                  value={depForm.version_tag}
                  onChange={(e) => setDepForm({ ...depForm, version_tag: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Branch</label>
                <input
                  value={depForm.branch}
                  onChange={(e) => setDepForm({ ...depForm, branch: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={depForm.status}
                  onChange={(e) => setDepForm({ ...depForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                >
                  <option value="Succeeded">Succeeded</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Release Notes</label>
              <textarea
                rows={3}
                value={depForm.release_notes}
                onChange={(e) => setDepForm({ ...depForm, release_notes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <button type="submit" disabled={busy} className="w-full py-2 text-xs font-semibold text-white bg-blue-700 rounded-md cursor-pointer">
              Record Release
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
