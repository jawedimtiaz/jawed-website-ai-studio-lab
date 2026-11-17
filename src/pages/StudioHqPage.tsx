// src/pages/StudioHqPage.tsx
// Jawed Web Studio — Business Management HQ (Protected Owner Workspace)

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Briefcase,
  ShieldCheck,
  GitBranch,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  LogOut,
  Lock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { hqFetch, HqApiError } from '../services/hqService';
import { HqNavSection, HqOwner, HqSubView } from '../types/hq';
import { ToastMessage, LoadingSkeleton } from '../components/hq/HqUiPrimitives';
import { OverviewSection } from '../components/hq/OverviewSection';
import { CrmSection } from '../components/hq/CrmSection';
import { ProjectsSection } from '../components/hq/ProjectsSection';
import { BusinessSection } from '../components/hq/BusinessSection';
import { OperationsSection } from '../components/hq/OperationsSection';
import { DevelopmentSection } from '../components/hq/DevelopmentSection';
import { AnalyticsSection } from '../components/hq/AnalyticsSection';
import { SettingsSection } from '../components/hq/SettingsSection';

interface NavGroupConfig {
  id: HqNavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultSubView: HqSubView;
  items: Array<{ subView: HqSubView; label: string }>;
}

const NAV_GROUPS: NavGroupConfig[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    defaultSubView: 'overview-dashboard',
    items: [{ subView: 'overview-dashboard', label: 'Executive Dashboard' }]
  },
  {
    id: 'crm',
    label: 'CRM',
    icon: Users,
    defaultSubView: 'crm-leads',
    items: [
      { subView: 'crm-leads', label: 'Leads' },
      { subView: 'crm-customers', label: 'Customers' },
      { subView: 'crm-contacts', label: 'Contacts' },
      { subView: 'crm-follow-ups', label: 'Follow-ups' },
      { subView: 'crm-notes', label: 'Communication History' }
    ]
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: FolderKanban,
    defaultSubView: 'projects-all',
    items: [
      { subView: 'projects-all', label: 'All Projects' },
      { subView: 'projects-active', label: 'Active Projects' },
      { subView: 'projects-details', label: 'Project Details' },
      { subView: 'projects-tasks', label: 'Tasks' },
      { subView: 'projects-milestones', label: 'Milestones' }
    ]
  },
  {
    id: 'business',
    label: 'Business',
    icon: Briefcase,
    defaultSubView: 'business-quotations',
    items: [
      { subView: 'business-quotations', label: 'Quotations' },
      { subView: 'business-proposals', label: 'Proposals' },
      { subView: 'business-invoices', label: 'Invoices' },
      { subView: 'business-payments', label: 'Payments' },
      { subView: 'business-expenses', label: 'Expenses' }
    ]
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: ShieldCheck,
    defaultSubView: 'ops-onboarding',
    items: [
      { subView: 'ops-onboarding', label: 'Onboarding' },
      { subView: 'ops-approvals', label: 'Approvals' },
      { subView: 'ops-qa', label: 'Quality Assurance' },
      { subView: 'ops-maintenance', label: 'Maintenance' },
      { subView: 'ops-support', label: 'Support Tickets' }
    ]
  },
  {
    id: 'development',
    label: 'Development',
    icon: GitBranch,
    defaultSubView: 'dev-repositories',
    items: [
      { subView: 'dev-repositories', label: 'GitHub Repositories' },
      { subView: 'dev-deployments', label: 'Deployments' },
      { subView: 'dev-releases', label: 'Release History' }
    ]
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    defaultSubView: 'analytics-revenue',
    items: [
      { subView: 'analytics-revenue', label: 'Revenue' },
      { subView: 'analytics-customers', label: 'Customer Performance' },
      { subView: 'analytics-projects', label: 'Project Performance' },
      { subView: 'analytics-outstanding', label: 'Outstanding Payments' }
    ]
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    defaultSubView: 'settings-profile',
    items: [
      { subView: 'settings-profile', label: 'Profile' },
      { subView: 'settings-security', label: 'Security' },
      { subView: 'settings-application', label: 'Application Settings' },
      { subView: 'settings-audit-logs', label: 'Audit Logs' }
    ]
  }
];

function getSectionForSubView(subView: HqSubView): HqNavSection {
  if (subView.startsWith('crm-')) return 'crm';
  if (subView.startsWith('projects-')) return 'projects';
  if (subView.startsWith('business-')) return 'business';
  if (subView.startsWith('ops-')) return 'operations';
  if (subView.startsWith('dev-')) return 'development';
  if (subView.startsWith('analytics-')) return 'analytics';
  if (subView.startsWith('settings-')) return 'settings';
  return 'overview';
}

function getLabelForSubView(subView: HqSubView): { sectionLabel: string; itemLabel: string } {
  for (const group of NAV_GROUPS) {
    const found = group.items.find((i) => i.subView === subView);
    if (found) {
      return { sectionLabel: group.label, itemLabel: found.label };
    }
  }
  return { sectionLabel: 'Overview', itemLabel: 'Executive Dashboard' };
}

export const StudioHqPage: React.FC = () => {
  const { user, loading: authLoading, isStudioEmail, signInWithGoogle, logout, authError } = useAuth();

  const [sessionLoading, setSessionLoading] = useState(false);
  const [owner, setOwner] = useState<HqOwner | null>(null);
  const [sessionError, setSessionError] = useState<{ code: string; message: string } | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);

  const [subView, setSubView] = useState<HqSubView>('overview-dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<HqNavSection, boolean>>({
    overview: true,
    crm: true,
    projects: true,
    business: false,
    operations: false,
    development: false,
    analytics: false,
    settings: false
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const activeSection = getSectionForSubView(subView);
  const { sectionLabel, itemLabel } = getLabelForSubView(subView);

  const addToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const verifyBackendSession = useCallback(async () => {
    if (!user || !isStudioEmail) {
      setOwner(null);
      setSessionError(null);
      return;
    }

    setSessionLoading(true);
    setSessionError(null);
    try {
      const res = await hqFetch<{ authenticated: boolean; owner: HqOwner }>('/api/hq/session');
      setOwner(res.owner);
    } catch (err: any) {
      setOwner(null);
      if (err instanceof HqApiError) {
        setSessionError({ code: err.code, message: err.message });
      } else {
        setSessionError({
          code: 'SESSION_ERROR',
          message: err?.message || 'Unable to verify Studio HQ session.'
        });
      }
    } finally {
      setSessionLoading(false);
    }
  }, [user, isStudioEmail]);

  useEffect(() => {
    if (!authLoading) {
      verifyBackendSession();
    }
  }, [authLoading, verifyBackendSession]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileNavOpen) {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [mobileNavOpen]);

  const handleNavigate = useCallback((nextSubView: HqSubView) => {
    setSubView(nextSubView);
    const nextGroup = getSectionForSubView(nextSubView);
    setExpandedGroups((prev) => ({ ...prev, [nextGroup]: true }));
    setMobileNavOpen(false);
  }, []);

  const handleOpenProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setSubView('projects-details');
    setExpandedGroups((prev) => ({ ...prev, projects: true }));
    setMobileNavOpen(false);
  }, []);

  const handleControlledBootstrap = async () => {
    setBootstrapping(true);
    try {
      const res = await hqFetch<{ enrolled: boolean; owner: HqOwner }>('/api/hq/session/enroll', {
        method: 'POST',
        body: JSON.stringify({})
      });
      if (res.owner) {
        setOwner(res.owner);
        setSessionError(null);
        addToast('success', 'Owner enrolled and Studio HQ session verified.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Controlled bootstrap failed.';
      setSessionError({ code: err?.code || 'BOOTSTRAP_FAILED', message: msg });
      addToast('error', msg);
    } finally {
      setBootstrapping(false);
    }
  };

  // 1. Auth Loading Gate
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">Jawed Web Studio</div>
          <h1 className="text-lg font-bold text-slate-900">Verifying Studio HQ Identity...</h1>
          <LoadingSkeleton rows={3} />
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Gate
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 mb-3">
            <Lock className="w-4 h-4" />
            <span>Private Operations Workspace</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Jawed Web Studio HQ</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Centralized SaaS operations dashboard for CRM, projects, quotations, invoicing, QA, deployments, and
            studio financial analytics. Authorized owner sign-in is required.
          </p>

          {authError && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
              {authError}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 transition-colors cursor-pointer"
            >
              Sign in with Google
            </button>
            <Link
              to="/"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium px-4 py-2 transition-colors"
            >
              <span>Return to Jawed Lab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Unauthorized Email Allowlist Gate
  if (!isStudioEmail) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-rose-200 rounded-xl p-8 shadow-sm">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-600 mb-3">
            <AlertTriangle className="w-4 h-4" />
            <span>403 — Access Restricted</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Unauthorized Studio HQ Account</h1>
          <p className="mt-2 text-sm text-slate-600">
            Signed in as <span className="font-mono font-medium text-slate-900">{user.email || 'Unknown user'}</span>.
            Studio HQ is strictly restricted to verified studio owner accounts.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2"
            >
              <span>Return to Lab</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 4. Backend D1 Verification Loading / Fail-Closed Error Gate
  if (sessionLoading || !owner) {
    const isNotEnrolled = sessionError?.code === 'OWNER_NOT_ENROLLED';
    const isDisabled = sessionError?.code === 'OWNER_DISABLED';
    const isBootstrapDisabled = sessionError?.code === 'BOOTSTRAP_DISABLED';

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-5">
          {sessionLoading && !sessionError ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Cryptographic Session Check
              </div>
              <h1 className="text-xl font-bold text-slate-900">Verifying Owner Enrollment in D1...</h1>
              <p className="text-xs text-slate-500">
                Validating Firebase RS256 token and fail-closed active owner record for{' '}
                <span className="font-mono text-slate-800">{user.email}</span>.
              </p>
              <LoadingSkeleton rows={3} />
            </>
          ) : (
            <>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                <span>{sessionError?.code || 'SESSION_VERIFICATION_REQUIRED'}</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900">
                {isNotEnrolled
                  ? 'Owner Account Not Yet Enrolled in D1'
                  : isDisabled
                    ? 'Studio HQ Owner Account Disabled'
                    : isBootstrapDisabled
                      ? 'Controlled Bootstrap Disabled'
                      : 'Unable to Verify Studio HQ Session'}
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                {sessionError?.message ||
                  'Backend session validation did not return an active owner record in D1.'}
              </p>

              {isNotEnrolled && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 space-y-1.5">
                  <div className="font-semibold text-slate-800">Fail-Closed Authorization Policy</div>
                  <p>
                    API requests never auto-enroll users. On local development environments, click{' '}
                    <span className="font-medium text-slate-900">Initialize Local Owner</span> to enroll your verified
                    UID into SQLite/D1. On production Cloudflare Workers, owners must be provisioned via controlled
                    D1 migration.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                {isNotEnrolled && (
                  <button
                    type="button"
                    disabled={bootstrapping}
                    onClick={handleControlledBootstrap}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{bootstrapping ? 'Enrolling Owner...' : 'Initialize Local Owner'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={verifyBackendSession}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry Check</span>
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // 5. Verified SaaS Workspace Shell
  const renderSidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 select-none">
      {/* Studio Brand Header */}
      <div className="h-14 px-3.5 flex items-center justify-between border-b border-slate-200 shrink-0">
        {(!sidebarCollapsed || isMobile) && (
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-slate-900 truncate">Jawed Web Studio</div>
            <div className="text-[11px] font-medium text-blue-600 uppercase tracking-wider">Business HQ</div>
          </div>
        )}
        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 mx-auto"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <nav aria-label="Studio HQ Navigation" className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
        {NAV_GROUPS.map((group) => {
          const Icon = group.icon;
          const isGroupActive = activeSection === group.id;
          const isExpanded = expandedGroups[group.id] || isGroupActive;
          const singleItem = group.items.length === 1;

          if (sidebarCollapsed && !isMobile) {
            return (
              <button
                key={group.id}
                type="button"
                title={group.label}
                aria-label={group.label}
                onClick={() => handleNavigate(group.defaultSubView)}
                className={`w-full flex items-center justify-center p-2.5 rounded-lg transition-colors cursor-pointer ${
                  isGroupActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          }

          return (
            <div key={group.id} className="space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  if (singleItem) {
                    handleNavigate(group.defaultSubView);
                  } else {
                    setExpandedGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }));
                    if (!isGroupActive) {
                      handleNavigate(group.defaultSubView);
                    }
                  }
                }}
                aria-expanded={singleItem ? undefined : isExpanded}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isGroupActive
                    ? 'bg-blue-50/80 text-blue-700'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isGroupActive ? 'text-blue-600' : 'text-slate-500'}`} />
                  <span className="truncate">{group.label}</span>
                </span>
                {!singleItem && (
                  <span className="text-slate-400">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </span>
                )}
              </button>

              {!singleItem && isExpanded && (
                <div className="pl-7 pr-1 py-0.5 space-y-0.5">
                  {group.items.map((item) => {
                    const active = subView === item.subView;
                    return (
                      <button
                        key={item.subView}
                        type="button"
                        onClick={() => handleNavigate(item.subView)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Owner Footer */}
      <div className="border-t border-slate-200 p-3 shrink-0 space-y-2">
        {(!sidebarCollapsed || isMobile) && (
          <div className="px-1">
            <div className="text-xs font-semibold text-slate-900 truncate">{owner.displayName || 'Studio Owner'}</div>
            <div className="text-[11px] font-mono text-slate-500 truncate">{owner.email}</div>
          </div>
        )}
        <div className={`flex items-center ${sidebarCollapsed && !isMobile ? 'justify-center' : 'justify-between gap-2'}`}>
          {(!sidebarCollapsed || isMobile) && (
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-600 px-1.5 py-1 rounded"
            >
              <span>Public Lab</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out of Studio HQ"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            {(!sidebarCollapsed || isMobile) && <span>Sign out</span>}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Fixed Sidebar */}
      <aside
        className={`hidden md:block shrink-0 sticky top-0 h-screen transition-all duration-150 z-30 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Slide-Over Sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{renderSidebarContent(true)}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Context Header */}
        <header className="sticky top-0 z-20 h-14 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
              <span className="font-semibold text-slate-500 truncate">{sectionLabel}</span>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-900 truncate">{itemLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-600 font-mono">
              <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
              <span>{owner.email}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 hover:bg-rose-50 rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeSection === 'overview' && (
            <OverviewSection onNavigate={handleNavigate} onToast={addToast} />
          )}
          {activeSection === 'crm' && (
            <CrmSection
              subView={subView}
              onSubViewChange={handleNavigate}
              onToast={addToast}
              onOpenProject={handleOpenProject}
            />
          )}
          {activeSection === 'projects' && (
            <ProjectsSection
              subView={subView}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              onSubViewChange={handleNavigate}
              onToast={addToast}
            />
          )}
          {activeSection === 'business' && (
            <BusinessSection
              subView={subView}
              onSubViewChange={handleNavigate}
              onToast={addToast}
            />
          )}
          {activeSection === 'operations' && (
            <OperationsSection
              subView={subView}
              onSubViewChange={handleNavigate}
              onToast={addToast}
            />
          )}
          {activeSection === 'development' && (
            <DevelopmentSection
              subView={subView}
              onSubViewChange={handleNavigate}
              onToast={addToast}
            />
          )}
          {activeSection === 'analytics' && (
            <AnalyticsSection
              subView={subView}
              onSubViewChange={handleNavigate}
              onToast={addToast}
            />
          )}
          {activeSection === 'settings' && (
            <SettingsSection
              subView={subView}
              owner={owner}
              onSubViewChange={handleNavigate}
              onToast={addToast}
            />
          )}
        </main>
      </div>

      {/* Dismissible Notification Toasts */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0 print:hidden"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-md bg-white text-xs font-medium ${
                toast.type === 'success'
                  ? 'border-emerald-200 text-emerald-900'
                  : toast.type === 'error'
                    ? 'border-rose-200 text-rose-900'
                    : 'border-blue-200 text-blue-900'
              }`}
            >
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
              {toast.type === 'error' && <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
              {toast.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />}
              <span className="flex-1 leading-relaxed">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudioHqPage;
