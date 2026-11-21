// src/components/hq/ProjectsSection.tsx
// Studio HQ Projects Module: All Projects, Active Projects, Rich Project Details, Tasks, Milestones

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  FolderKanban,
  CheckSquare,
  Flag,
  Plus,
  Edit3,
  Trash2,
  ArrowLeft,
  Filter,
  Check,
  Minus,
  RotateCcw,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Calendar,
  Clock
} from 'lucide-react';
import {
  hqFetch,
  formatMoney,
  formatDate,
  parseMajorToMinor,
  minorToMajorString
} from '../../services/hqService';
import {
  HqProject,
  HqClient,
  HqTask,
  HqMilestone,
  HqApproval,
  HqQaCheck,
  HqRepository,
  HqOnboardingItem,
  HqNote,
  HqSubView,
  PROJECT_STATUS_LIST
} from '../../types/hq';
import {
  SectionToolbar,
  StatusDotText,
  ProjectStatusBadge,
  getProjectStatusMeta,
  EmptyState,
  LoadingSkeleton,
  SlideOverDrawer,
  ConfirmDialog
} from './HqUiPrimitives';

const TASK_STATUSES = ['Todo', 'In Progress', 'Review', 'Blocked', 'Done', 'Completed', 'Cancelled'];
const MILESTONE_STATUSES = ['Pending', 'In Progress', 'Completed', 'Delayed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const ACTIVE_PROJECT_STATUSES: string[] = [
  'Planning',
  'Quoted',
  'Onboarding',
  'In Progress',
  'Review',
  'Client Approval'
];

const STATUS_VISIBILITY_GROUPS: Array<{
  id: string;
  label: string;
  dotColor: string;
  statuses: string[];
}> = [
  { id: 'active', label: 'Active', dotColor: 'bg-blue-600', statuses: ACTIVE_PROJECT_STATUSES },
  { id: 'completed', label: 'Completed', dotColor: 'bg-emerald-600', statuses: ['Completed'] },
  { id: 'on-hold', label: 'On Hold', dotColor: 'bg-amber-500', statuses: ['On Hold'] },
  { id: 'maintenance', label: 'Maintenance', dotColor: 'bg-indigo-600', statuses: ['Maintenance'] },
  { id: 'lead', label: 'Lead', dotColor: 'bg-slate-500', statuses: ['Lead'] },
  { id: 'cancelled', label: 'Cancelled', dotColor: 'bg-rose-600', statuses: ['Cancelled'] }
];

function parseDateUtcMidnight(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00Z` : trimmed;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

interface ProjectTimelineInfo {
  hasSchedule: boolean;
  progressPct: number;
  durationLabel: string;
  barClass: string;
  labelClass: string;
  isOverdue: boolean;
  startLabel: string;
  targetLabel: string;
}

function getProjectTimelineInfo(project: HqProject, statusCategory: string, defaultBarClass: string): ProjectTimelineInfo {
  const startMs = parseDateUtcMidnight(project.start_date);
  const targetMs = parseDateUtcMidnight(project.target_date);
  const completedMs = parseDateUtcMidnight(project.completed_at);
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const msPerDay = 86400000;

  const startLabel = project.start_date ? formatDate(project.start_date) : 'Unscheduled';
  const targetLabel = project.target_date ? formatDate(project.target_date) : 'No target';

  if (statusCategory === 'Completed') {
    let durationLabel = project.completed_at ? `Completed ${formatDate(project.completed_at)}` : 'Completed';
    if (startMs !== null && (completedMs ?? targetMs) !== null) {
      const endMs = (completedMs ?? targetMs)!;
      const totalDays = Math.max(1, Math.round((endMs - startMs) / msPerDay));
      durationLabel = `${totalDays}d total · Completed`;
    }
    return {
      hasSchedule: startMs !== null || targetMs !== null,
      progressPct: 100,
      durationLabel,
      barClass: 'bg-emerald-600',
      labelClass: 'text-emerald-700',
      isOverdue: false,
      startLabel,
      targetLabel
    };
  }

  if (statusCategory === 'Cancelled') {
    return {
      hasSchedule: startMs !== null || targetMs !== null,
      progressPct: 0,
      durationLabel: 'Cancelled',
      barClass: 'bg-rose-500',
      labelClass: 'text-rose-700',
      isOverdue: false,
      startLabel,
      targetLabel
    };
  }

  if (startMs !== null && targetMs !== null && targetMs >= startMs) {
    const totalDays = Math.max(1, Math.round((targetMs - startMs) / msPerDay));
    const elapsedDays = Math.round((todayMs - startMs) / msPerDay);
    const remainingDays = Math.round((targetMs - todayMs) / msPerDay);
    const progressPct = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));

    if (remainingDays < 0) {
      return {
        hasSchedule: true,
        progressPct: 100,
        durationLabel: `${Math.abs(remainingDays)}d overdue`,
        barClass: 'bg-rose-600',
        labelClass: 'text-rose-700 font-semibold',
        isOverdue: true,
        startLabel,
        targetLabel
      };
    }
    if (remainingDays === 0) {
      return {
        hasSchedule: true,
        progressPct: 100,
        durationLabel: `Due today (${totalDays}d span)`,
        barClass: 'bg-amber-500',
        labelClass: 'text-amber-700 font-semibold',
        isOverdue: false,
        startLabel,
        targetLabel
      };
    }
    if (elapsedDays < 0) {
      return {
        hasSchedule: true,
        progressPct: 0,
        durationLabel: `Starts in ${Math.abs(elapsedDays)}d · ${totalDays}d span`,
        barClass: defaultBarClass,
        labelClass: 'text-slate-600',
        isOverdue: false,
        startLabel,
        targetLabel
      };
    }
    return {
      hasSchedule: true,
      progressPct,
      durationLabel: `${remainingDays}d left of ${totalDays}d`,
      barClass: defaultBarClass,
      labelClass: 'text-slate-700',
      isOverdue: false,
      startLabel,
      targetLabel
    };
  }

  if (targetMs !== null) {
    const remainingDays = Math.round((targetMs - todayMs) / msPerDay);
    if (remainingDays < 0) {
      return {
        hasSchedule: true,
        progressPct: 100,
        durationLabel: `${Math.abs(remainingDays)}d overdue`,
        barClass: 'bg-rose-600',
        labelClass: 'text-rose-700 font-semibold',
        isOverdue: true,
        startLabel,
        targetLabel
      };
    }
    if (remainingDays === 0) {
      return {
        hasSchedule: true,
        progressPct: 100,
        durationLabel: 'Due today',
        barClass: 'bg-amber-500',
        labelClass: 'text-amber-700 font-semibold',
        isOverdue: false,
        startLabel,
        targetLabel
      };
    }
    return {
      hasSchedule: true,
      progressPct: Math.min(90, Math.max(15, 100 - Math.min(85, remainingDays * 2))),
      durationLabel: `${remainingDays}d until target`,
      barClass: defaultBarClass,
      labelClass: 'text-slate-700',
      isOverdue: false,
      startLabel,
      targetLabel
    };
  }

  if (startMs !== null) {
    const elapsedDays = Math.round((todayMs - startMs) / msPerDay);
    return {
      hasSchedule: true,
      progressPct: elapsedDays > 0 ? 35 : 0,
      durationLabel: elapsedDays >= 0 ? `Day ${elapsedDays + 1} active` : `Starts in ${Math.abs(elapsedDays)}d`,
      barClass: defaultBarClass,
      labelClass: 'text-slate-600',
      isOverdue: false,
      startLabel,
      targetLabel
    };
  }

  return {
    hasSchedule: false,
    progressPct: 0,
    durationLabel: 'No dates set',
    barClass: 'bg-slate-300',
    labelClass: 'text-slate-400',
    isOverdue: false,
    startLabel,
    targetLabel
  };
}

export interface ProjectDetailBundle {
  project: HqProject;
  tasks: HqTask[];
  milestones: HqMilestone[];
  approvals: HqApproval[];
  qaChecks: HqQaCheck[];
  repositories: HqRepository[];
  onboarding: HqOnboardingItem[];
  notes: HqNote[];
}

export function normalizeProjectDetailBundle(
  projectRes: any,
  tasksRes?: any,
  milestonesRes?: any
): ProjectDetailBundle | null {
  if (!projectRes || typeof projectRes !== 'object') return null;

  // Extract the project object from canonical { ok: true, project: {...} },
  // legacy bundle { project: {...} }, or direct project object { id, ... }
  // Discard collection responses { ok: true, projects: [...] }
  const rawProject =
    projectRes.project && typeof projectRes.project === 'object'
      ? projectRes.project
      : ('id' in projectRes && !('projects' in projectRes) ? projectRes : null);

  if (!rawProject || typeof rawProject !== 'object' || !rawProject.id) {
    return null;
  }

  const safeProject: HqProject = {
    ...rawProject,
    client_business: rawProject.client_business || rawProject.client_business_name || rawProject.client_name || '',
    status: typeof rawProject.status === 'string' && rawProject.status.trim() ? rawProject.status : 'Planning'
  };

  return {
    project: safeProject,
    tasks: Array.isArray(tasksRes?.tasks)
      ? tasksRes.tasks
      : Array.isArray(projectRes?.tasks)
        ? projectRes.tasks
        : [],
    milestones: Array.isArray(milestonesRes?.milestones)
      ? milestonesRes.milestones
      : Array.isArray(projectRes?.milestones)
        ? projectRes.milestones
        : [],
    approvals: Array.isArray(projectRes?.approvals) ? projectRes.approvals : [],
    qaChecks: Array.isArray(projectRes?.qaChecks) ? projectRes.qaChecks : [],
    repositories: Array.isArray(projectRes?.repositories) ? projectRes.repositories : [],
    onboarding: Array.isArray(projectRes?.onboarding) ? projectRes.onboarding : [],
    notes: Array.isArray(projectRes?.notes) ? projectRes.notes : []
  };
}

export const ProjectsSection: React.FC<{
  subView: HqSubView;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onSubViewChange: (sv: HqSubView) => void;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ subView, selectedProjectId, onSelectProject, onSubViewChange, onToast }) => {
  const activeTab =
    subView === 'projects-active'
      ? 'active'
      : subView === 'projects-details'
        ? 'details'
        : subView === 'projects-tasks'
          ? 'tasks'
          : subView === 'projects-milestones'
            ? 'milestones'
            : 'all';

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [visibleStatuses, setVisibleStatuses] = useState<string[]>([...PROJECT_STATUS_LIST]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [totalUnfilteredProjects, setTotalUnfilteredProjects] = useState(0);
  const [showStageToggles, setShowStageToggles] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const [projects, setProjects] = useState<HqProject[]>([]);
  const firstProjectIdRef = useRef<string | null>(null);
  firstProjectIdRef.current = projects[0]?.id ?? null;
  const [clients, setClients] = useState<HqClient[]>([]);
  const [tasks, setTasks] = useState<HqTask[]>([]);
  const [milestones, setMilestones] = useState<HqMilestone[]>([]);
  const [detail, setDetail] = useState<ProjectDetailBundle | null>(null);
  const [detailSubTab, setDetailSubTab] = useState<'tasks' | 'milestones' | 'approvals' | 'qa' | 'notes'>('tasks');

  // Modals / Drawers
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<HqProject | null>(null);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<HqTask | null>(null);
  const [milestoneDrawerOpen, setMilestoneDrawerOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<HqMilestone | null>(null);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  }>({ open: false, title: '', description: '', onConfirm: async () => {} });
  const [busy, setBusy] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const [projectForm, setProjectForm] = useState({
    client_id: '',
    name: '',
    project_type: 'Website Build',
    status: 'Planning',
    priority: 'Medium',
    start_date: '',
    target_date: '',
    quoted_major: '0',
    currency: 'INR',
    summary: '',
    scope_markdown: ''
  });

  const [taskForm, setTaskForm] = useState({
    project_id: '',
    title: '',
    description: '',
    status: 'Todo',
    priority: 'Medium',
    assigned_to: 'Jawed Imtiaz',
    due_date: ''
  });

  const [milestoneForm, setMilestoneForm] = useState({
    project_id: '',
    name: '',
    description: '',
    status: 'Pending',
    due_date: ''
  });

  const loadReferenceData = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        hqFetch<{ clients: HqClient[] }>('/api/hq/clients?limit=200'),
        hqFetch<{ projects: HqProject[] }>('/api/hq/projects?limit=200')
      ]);
      setClients(cRes.clients || []);
      if (activeTab !== 'all' && activeTab !== 'active') {
        const fetched = pRes.projects || [];
        setProjects(fetched);
        if (!selectedProjectId && fetched.length > 0 && activeTab === 'details') {
          onSelectProject(fetched[0].id);
        }
      }
    } catch {
      // silent
    }
  }, [activeTab, selectedProjectId, onSelectProject]);

  const loadMain = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'all' || activeTab === 'active') {
        const params = new URLSearchParams({ limit: '100' });
        if (visibleStatuses.length < PROJECT_STATUS_LIST.length) {
          params.set('statuses', visibleStatuses.join(','));
        }
        if (search) params.set('q', search);
        const res = await hqFetch<{
          projects: HqProject[];
          totalUnfiltered?: number;
          statusCounts?: Record<string, number>;
        }>(`/api/hq/projects?${params.toString()}`);
        setProjects(res.projects || []);
        setStatusCounts(res.statusCounts || {});
        setTotalUnfilteredProjects(Number(res.totalUnfiltered ?? res.projects?.length ?? 0));
      } else if (activeTab === 'details') {
        const targetId = selectedProjectId || firstProjectIdRef.current || projects[0]?.id;
        if (targetId) {
          try {
            const [projectRes, tasksRes, milestonesRes] = await Promise.all([
              hqFetch<{ ok?: boolean; project?: HqProject }>(`/api/hq/projects/${encodeURIComponent(targetId)}`),
              hqFetch<{ ok?: boolean; tasks?: HqTask[] }>(`/api/hq/projects/${encodeURIComponent(targetId)}/tasks`).catch(() => ({ ok: false, tasks: [] })),
              hqFetch<{ ok?: boolean; milestones?: HqMilestone[] }>(`/api/hq/projects/${encodeURIComponent(targetId)}/milestones`).catch(() => ({ ok: false, milestones: [] }))
            ]);
            const bundle = normalizeProjectDetailBundle(projectRes, tasksRes, milestonesRes);
            setDetail(bundle);
            if (bundle && !selectedProjectId) {
              onSelectProject(targetId);
            }
          } catch (err: any) {
            setDetail(null);
            onToast('error', err.message || 'Failed to load project details');
          }
        } else {
          setDetail(null);
        }
      } else if (activeTab === 'tasks') {
        const params = new URLSearchParams();
        if (statusFilter !== 'All') params.set('status', statusFilter);
        const res = await hqFetch<{ tasks: HqTask[] }>(`/api/hq/tasks?${params.toString()}`);
        setTasks(res.tasks || []);
      } else if (activeTab === 'milestones') {
        const res = await hqFetch<{ milestones: HqMilestone[] }>('/api/hq/milestones');
        setMilestones(res.milestones || []);
      }
    } catch (err: any) {
      onToast('error', err.message || 'Failed to load projects data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, visibleStatuses, search, selectedProjectId, projects, onSelectProject, onToast]);

  useEffect(() => {
    setStatusFilter('All');
    setSearch('');
    if (activeTab === 'active') {
      setVisibleStatuses([...ACTIVE_PROJECT_STATUSES]);
    } else if (activeTab === 'all') {
      setVisibleStatuses([...PROJECT_STATUS_LIST]);
    }
  }, [activeTab]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadMain();
  }, [loadMain]);

  const toggleSingleStatus = (statusName: string) => {
    setVisibleStatuses((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(statusName)) {
        nextSet.delete(statusName);
      } else {
        nextSet.add(statusName);
      }
      return PROJECT_STATUS_LIST.filter((s) => nextSet.has(s));
    });
  };

  const toggleStatusGroup = (groupStatuses: string[]) => {
    setVisibleStatuses((prev) => {
      const nextSet = new Set(prev);
      const allGroupVisible = groupStatuses.every((s) => nextSet.has(s));
      if (allGroupVisible) {
        for (const s of groupStatuses) nextSet.delete(s);
      } else {
        for (const s of groupStatuses) nextSet.add(s);
      }
      return PROJECT_STATUS_LIST.filter((s) => nextSet.has(s));
    });
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectForm.client_id || !projectForm.name.trim()) {
      onToast('error', 'Linked customer and project name are required.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...(editingProject ? { id: editingProject.id } : {}),
        client_id: projectForm.client_id,
        name: projectForm.name.trim(),
        project_type: projectForm.project_type.trim(),
        status: projectForm.status,
        priority: projectForm.priority,
        start_date: projectForm.start_date || null,
        target_date: projectForm.target_date || null,
        quoted_amount_minor: parseMajorToMinor(projectForm.quoted_major),
        currency: projectForm.currency,
        summary: projectForm.summary.trim(),
        scope_markdown: projectForm.scope_markdown.trim()
      };
      await hqFetch('/api/hq/projects', {
        method: editingProject ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      onToast('success', editingProject ? 'Project updated' : 'Project created');
      setProjectDrawerOpen(false);
      setEditingProject(null);
      loadMain();
    } catch (err: any) {
      onToast('error', err.message || 'Failed to save project');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickStatusChange = async (project: HqProject, nextStatus: string) => {
    if (!nextStatus || nextStatus === project.status) return;
    const previousStatus = project.status;
    setUpdatingStatusId(project.id);
    setProjects((prev) =>
      prev.map((item) => (item.id === project.id ? { ...item, status: nextStatus } : item))
    );
    try {
      await hqFetch('/api/hq/projects', {
        method: 'PUT',
        body: JSON.stringify({ id: project.id, status: nextStatus })
      });
      onToast('success', `${project.name} marked as ${nextStatus}`);
      await loadMain();
    } catch (err: any) {
      setProjects((prev) =>
        prev.map((item) => (item.id === project.id ? { ...item, status: previousStatus } : item))
      );
      onToast('error', err.message || 'Failed to update project status');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.project_id || !taskForm.title.trim()) {
      onToast('error', 'Project and task title are required.');
      return;
    }
    setBusy(true);
    try {
      await hqFetch('/api/hq/tasks', {
        method: editingTask ? 'PUT' : 'POST',
        body: JSON.stringify(editingTask ? { id: editingTask.id, ...taskForm } : taskForm)
      });
      onToast('success', editingTask ? 'Task updated' : 'Task created');
      setTaskDrawerOpen(false);
      setEditingTask(null);
      loadMain();
    } catch (err: any) {
      onToast('error', err.message || 'Failed to save task');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!milestoneForm.project_id || !milestoneForm.name.trim()) {
      onToast('error', 'Project and milestone name are required.');
      return;
    }
    setBusy(true);
    try {
      await hqFetch('/api/hq/milestones', {
        method: editingMilestone ? 'PUT' : 'POST',
        body: JSON.stringify(editingMilestone ? { id: editingMilestone.id, ...milestoneForm } : milestoneForm)
      });
      onToast('success', editingMilestone ? 'Milestone updated' : 'Milestone created');
      setMilestoneDrawerOpen(false);
      setEditingMilestone(null);
      loadMain();
    } catch (err: any) {
      onToast('error', err.message || 'Failed to save milestone');
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ key: HqSubView; label: string }> = [
    { key: 'projects-all', label: 'All Projects' },
    { key: 'projects-active', label: 'Active Projects' },
    { key: 'projects-details', label: 'Project Details' },
    { key: 'projects-tasks', label: 'Tasks' },
    { key: 'projects-milestones', label: 'Milestones' }
  ];

  const openNewProject = () => {
    setEditingProject(null);
    setProjectForm({
      client_id: clients[0]?.id || '',
      name: '',
      project_type: 'Website Build',
      status: 'Planning',
      priority: 'Medium',
      start_date: new Date().toISOString().slice(0, 10),
      target_date: '',
      quoted_major: '0',
      currency: 'INR',
      summary: '',
      scope_markdown: ''
    });
    setProjectDrawerOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Projects & Delivery</h1>
          <p className="text-xs text-slate-500 mt-0.5">Website & application lifecycles, tasks, milestones, and client scope</p>
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

      {/* ALL / ACTIVE PROJECTS TABLE */}
      {(activeTab === 'all' || activeTab === 'active') && (
        <>
          <SectionToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search projects by title, type or customer..."
            primaryAction={{ label: 'New Project', onClick: openNewProject }}
          />

          {/* Status Visibility Filtering System */}
          <div
            className="bg-white border border-slate-200 rounded-lg p-3.5 mb-4 space-y-3"
            role="region"
            aria-label="Project status visibility filters"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-semibold text-slate-800">Status Visibility</span>
                <span className="text-slate-400">·</span>
                <span className="font-mono tabular-nums text-slate-500">
                  Showing {projects.length} of {totalUnfilteredProjects} projects ({visibleStatuses.length}/
                  {PROJECT_STATUS_LIST.length} stages visible)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setVisibleStatuses([...PROJECT_STATUS_LIST])}
                  disabled={visibleStatuses.length === PROJECT_STATUS_LIST.length}
                  className="px-2.5 py-1 text-xs font-medium rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-default cursor-pointer"
                >
                  Show All
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleStatuses([...ACTIVE_PROJECT_STATUSES])}
                  className="px-2.5 py-1 text-xs font-medium rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Active Only
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleStatuses([])}
                  disabled={visibleStatuses.length === 0}
                  className="px-2.5 py-1 text-xs font-medium rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-default cursor-pointer"
                >
                  Hide All
                </button>
                {(visibleStatuses.length < PROJECT_STATUS_LIST.length || search) && (
                  <button
                    type="button"
                    onClick={() => {
                      setVisibleStatuses([...PROJECT_STATUS_LIST]);
                      setSearch('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  aria-expanded={showStageToggles}
                  onClick={() => setShowStageToggles((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border cursor-pointer ${
                    showStageToggles
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  All Stages ({PROJECT_STATUS_LIST.length})
                </button>
                <div className="inline-flex rounded border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Project layout view">
                  <button
                    type="button"
                    aria-pressed={viewMode === 'cards'}
                    onClick={() => setViewMode('cards')}
                    title="Card View"
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-sm cursor-pointer ${
                      viewMode === 'cards' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <LayoutGrid className="w-3 h-3" />
                    Cards
                  </button>
                  <button
                    type="button"
                    aria-pressed={viewMode === 'table'}
                    onClick={() => setViewMode('table')}
                    title="Table View"
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-sm cursor-pointer ${
                      viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <List className="w-3 h-3" />
                    Table
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Status Category Toggles (Active, Completed, On Hold, Maintenance, Lead, Cancelled) */}
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_VISIBILITY_GROUPS.map((group) => {
                const selectedInGroup = group.statuses.filter((s) => visibleStatuses.includes(s)).length;
                const allChecked = selectedInGroup === group.statuses.length;
                const partialChecked = selectedInGroup > 0 && selectedInGroup < group.statuses.length;
                const groupCount = group.statuses.reduce((sum, s) => sum + Number(statusCounts[s] ?? 0), 0);

                return (
                  <button
                    key={group.id}
                    type="button"
                    aria-pressed={allChecked}
                    onClick={() => toggleStatusGroup(group.statuses)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      allChecked
                        ? 'bg-blue-50/90 border-blue-300 text-slate-900'
                        : partialChecked
                          ? 'bg-slate-50 border-blue-200 text-slate-800'
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border shrink-0 ${
                        allChecked
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : partialChecked
                            ? 'bg-blue-100 border-blue-500 text-blue-700'
                            : 'bg-white border-slate-300'
                      }`}
                      aria-hidden="true"
                    >
                      {allChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      {partialChecked && <Minus className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${group.dotColor}`} aria-hidden="true" />
                    <span>{group.label}</span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500">({groupCount})</span>
                  </button>
                );
              })}
            </div>

            {/* Expandable Individual Stage Toggles */}
            {showStageToggles && (
              <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {PROJECT_STATUS_LIST.map((stage) => {
                  const checked = visibleStatuses.includes(stage);
                  const count = Number(statusCounts[stage] ?? 0);
                  return (
                    <label
                      key={stage}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-slate-50 border-slate-300 text-slate-900 font-medium'
                          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSingleStatus(stage)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                        />
                        <StatusDotText status={stage} className="truncate" />
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500">{count}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {loading ? (
            <LoadingSkeleton />
          ) : projects.length === 0 ? (
            totalUnfilteredProjects > 0 || visibleStatuses.length < PROJECT_STATUS_LIST.length || search ? (
              <EmptyState
                icon={<Filter className="w-5 h-5" />}
                title="No projects match visible filters"
                description={
                  visibleStatuses.length === 0
                    ? 'All project statuses are currently toggled off. Enable one or more status toggles above to inspect projects.'
                    : 'No projects match the currently enabled status filters or search query.'
                }
                actionLabel="Show All Statuses"
                onAction={() => {
                  setVisibleStatuses([...PROJECT_STATUS_LIST]);
                  setSearch('');
                }}
              />
            ) : (
              <EmptyState
                icon={<FolderKanban className="w-5 h-5" />}
                title="No projects found"
                description="Create a project linked to an existing customer to track milestones, tasks, QA, and billing."
                actionLabel="Create Project"
                onAction={openNewProject}
              />
            )
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {projects.map((p) => {
                const statusMeta = getProjectStatusMeta(p.status);
                const statusSlug = statusMeta.category.toLowerCase().replace(/\s+/g, '-');
                const totalTasks = Number(p.total_tasks ?? 0);
                const doneTasks = Number(p.completed_tasks ?? 0);
                const taskPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
                const totalMilestones = Number(p.total_milestones ?? 0);
                const doneMilestones = Number(p.completed_milestones ?? 0);
                const timeline = getProjectTimelineInfo(p, statusMeta.category, statusMeta.barColor);

                return (
                  <article
                    key={p.id}
                    aria-busy={updatingStatusId === p.id}
                    data-status-category={statusMeta.category}
                    data-status-stage={p.status}
                    className={`project-card project-card--${statusSlug} bg-white border border-slate-200 border-l-4 ${statusMeta.accentBorderClass} rounded-lg p-4 flex flex-col justify-between gap-3.5 hover:border-slate-300 transition-colors`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectProject(p.id);
                              onSubViewChange('projects-details');
                            }}
                            className="text-left text-sm font-semibold text-slate-900 hover:text-blue-700 transition-colors line-clamp-1 cursor-pointer"
                          >
                            {p.name}
                          </button>
                          <div className="text-xs text-slate-500 truncate mt-0.5">
                            {p.client_business || p.client_name} · {p.project_type}
                          </div>
                        </div>
                        <ProjectStatusBadge status={p.status} align="end" className="shrink-0" />
                      </div>

                      {p.summary && (
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{p.summary}</p>
                      )}
                    </div>

                    <div className="space-y-3 pt-2.5 border-t border-slate-100">
                      {/* Project Lifecycle Timeline & Duration Bar */}
                      <div className="project-card__timeline space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
                            <span>Timeline</span>
                          </span>
                          <span className={`inline-flex items-center gap-1 font-mono tabular-nums ${timeline.labelClass}`}>
                            <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{timeline.durationLabel}</span>
                          </span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`Project timeline progress for ${p.name}`}
                          aria-valuenow={timeline.progressPct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden"
                        >
                          <div
                            className={`h-full ${timeline.barClass} rounded-full transition-all duration-300`}
                            style={{ width: `${timeline.progressPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                          <span className="truncate" title={`Start date: ${timeline.startLabel}`}>
                            Start: {timeline.startLabel}
                          </span>
                          <span
                            className={`truncate ${timeline.isOverdue ? 'text-rose-600 font-semibold' : ''}`}
                            title={`Target date: ${timeline.targetLabel}`}
                          >
                            Target: {timeline.targetLabel}
                          </span>
                        </div>
                      </div>

                      {/* Tasks Completion Progress */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>Tasks Progress</span>
                          <span className="font-mono tabular-nums text-slate-700 font-medium">
                            {doneTasks}/{totalTasks} ({taskPct}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${statusMeta.barColor} rounded-full`} style={{ width: `${taskPct}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">Budget</div>
                            <div className="font-mono tabular-nums font-semibold text-slate-900">
                              {formatMoney(p.quoted_amount_minor, p.currency)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">Milestones</div>
                            <div className="font-mono tabular-nums text-slate-700 font-medium">
                              {doneMilestones}/{totalMilestones}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">Priority</div>
                            <div className="font-medium text-slate-700">{p.priority}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <select
                            aria-label={`Change status for ${p.name}`}
                            value={p.status}
                            disabled={updatingStatusId === p.id}
                            onChange={(e) => handleQuickStatusChange(p, e.target.value)}
                            className="h-7 px-2 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
                          >
                            {PROJECT_STATUS_LIST.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProject(p);
                              setProjectForm({
                                client_id: p.client_id,
                                name: p.name,
                                project_type: p.project_type || 'Website Build',
                                status: p.status,
                                priority: p.priority,
                                start_date: p.start_date || '',
                                target_date: p.target_date || '',
                                quoted_major: minorToMajorString(p.quoted_amount_minor),
                                currency: p.currency || 'INR',
                                summary: p.summary || '',
                                scope_markdown: p.scope_markdown || ''
                              });
                              setProjectDrawerOpen(true);
                            }}
                            aria-label={`Edit ${p.name}`}
                            className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                open: true,
                                title: 'Delete project?',
                                description: `Delete project "${p.name}" and its child tasks/milestones?`,
                                onConfirm: async () => {
                                  await hqFetch(`/api/hq/projects?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
                                  onToast('success', 'Project deleted');
                                  loadMain();
                                }
                              })
                            }
                            aria-label={`Delete ${p.name}`}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Project & Customer</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Priority</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Tasks</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Budget</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Target Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projects.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectProject(p.id);
                              onSubViewChange('projects-details');
                            }}
                            className="text-left font-semibold text-slate-900 hover:text-blue-700 cursor-pointer"
                          >
                            {p.name}
                          </button>
                          <div className="text-xs text-slate-500">
                            {p.client_business || p.client_name} · {p.project_type}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <ProjectStatusBadge status={p.status} />
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-700">{p.priority}</td>
                        <td className="px-4 py-3 text-xs font-mono tabular-nums text-slate-600">
                          {p.completed_tasks ?? 0}/{p.total_tasks ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs font-medium text-slate-900">
                          {formatMoney(p.quoted_amount_minor, p.currency)}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{formatDate(p.target_date)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProject(p);
                              setProjectForm({
                                client_id: p.client_id,
                                name: p.name,
                                project_type: p.project_type || 'Website Build',
                                status: p.status,
                                priority: p.priority,
                                start_date: p.start_date || '',
                                target_date: p.target_date || '',
                                quoted_major: minorToMajorString(p.quoted_amount_minor),
                                currency: p.currency || 'INR',
                                summary: p.summary || '',
                                scope_markdown: p.scope_markdown || ''
                              });
                              setProjectDrawerOpen(true);
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
                                title: 'Delete project?',
                                description: `Delete project "${p.name}" and its child tasks/milestones?`,
                                onConfirm: async () => {
                                  await hqFetch(`/api/hq/projects?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
                                  onToast('success', 'Project deleted');
                                  loadMain();
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
            </div>
          )}
        </>
      )}

      {/* PROJECT DETAILS VIEW */}
      {activeTab === 'details' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onSubViewChange('projects-all')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> All Projects
              </button>
              <select
                value={selectedProjectId || detail?.project?.id || ''}
                onChange={(e) => onSelectProject(e.target.value)}
                aria-label="Select project"
                className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-md text-slate-900 font-medium"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.client_business || (p as any).client_business_name || p.client_name})
                  </option>
                ))}
                {projects.length === 0 && detail?.project && (
                  <option value={detail.project.id}>
                    {detail.project.name} ({detail.project.client_business || detail.project.client_name || 'Project'})
                  </option>
                )}
              </select>
            </div>
            {detail && detail.project && (
              <div className="flex items-center gap-2">
                <select
                  value={detail.project.status || ''}
                  onChange={async (e) => {
                    const nextStatus = e.target.value;
                    try {
                      await hqFetch(`/api/hq/projects/${encodeURIComponent(detail.project.id)}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: nextStatus })
                      });
                      onToast('success', `Stage changed to ${nextStatus}`);
                      loadMain();
                    } catch (err: any) {
                      onToast('error', err.message || 'Failed to update project status');
                    }
                  }}
                  aria-label="Change project status"
                  className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md"
                >
                  {PROJECT_STATUS_LIST.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {loading ? (
            <LoadingSkeleton />
          ) : !detail || !detail.project ? (
            <EmptyState
              title="No project selected"
              description="Select or create a project to view its tasks, milestones, approvals, QA checks, and notes."
              actionLabel="Create Project"
              onAction={openNewProject}
            />
          ) : (
            <>
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-bold text-slate-900">{detail.project.name || 'Untitled Project'}</h2>
                      <ProjectStatusBadge status={detail.project.status || 'Planning'} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {detail.project.client_business || (detail.project as any).client_business_name || detail.project.client_name || 'No customer'} · {detail.project.project_type || 'General'} · Priority:{' '}
                      {detail.project.priority || 'Normal'}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-mono font-bold text-base text-slate-900">
                      {formatMoney(detail.project.quoted_amount_minor, detail.project.currency || 'INR')}
                    </div>
                    <div className="text-slate-500">
                      {formatDate(detail.project.start_date)} → {formatDate(detail.project.target_date)}
                    </div>
                  </div>
                </div>
                {detail.project.summary && <p className="mt-3 text-sm text-slate-700">{detail.project.summary}</p>}
              </div>

              <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
                {(
                  [
                    ['tasks', `Tasks (${(detail.tasks || []).length})`],
                    ['milestones', `Milestones (${(detail.milestones || []).length})`],
                    ['approvals', `Approvals (${(detail.approvals || []).length})`],
                    ['qa', `QA Checks (${(detail.qaChecks || []).length})`],
                    ['notes', `Notes (${(detail.notes || []).length})`]
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDetailSubTab(k)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                      detailSubTab === k ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              {detailSubTab === 'tasks' && (
                <div className="bg-white border border-slate-200 rounded-lg">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Project Tasks</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTask(null);
                        setTaskForm({
                          project_id: detail.project.id,
                          title: '',
                          description: '',
                          status: 'Todo',
                          priority: 'Medium',
                          assigned_to: 'Jawed Imtiaz',
                          due_date: ''
                        });
                        setTaskDrawerOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-700 rounded cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Task
                    </button>
                  </div>
                  {(detail.tasks || []).length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-500">No tasks in this project yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {(detail.tasks || []).map((t) => (
                        <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900">{t.title}</div>
                            <div className="text-xs text-slate-500">
                              {t.priority} · Due {formatDate(t.due_date)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusDotText status={t.status} />
                            {t.status !== 'Done' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await hqFetch('/api/hq/tasks', {
                                    method: 'PUT',
                                    body: JSON.stringify({ id: t.id, status: 'Done' })
                                  });
                                  onToast('success', 'Task marked Done');
                                  loadMain();
                                }}
                                className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded cursor-pointer"
                              >
                                Complete
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailSubTab === 'milestones' && (
                <div className="bg-white border border-slate-200 rounded-lg">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Project Milestones</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMilestone(null);
                        setMilestoneForm({ project_id: detail.project.id, name: '', description: '', status: 'Pending', due_date: '' });
                        setMilestoneDrawerOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-700 rounded cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Milestone
                    </button>
                  </div>
                  {(detail.milestones || []).length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-500">No milestones added yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {(detail.milestones || []).map((m) => (
                        <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900">{m.name}</div>
                            <div className="text-xs text-slate-500">Target: {formatDate(m.due_date)}</div>
                          </div>
                          <StatusDotText status={m.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailSubTab === 'approvals' && (
                <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {(detail.approvals || []).length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-500">No approval gates logged for this project.</p>
                  ) : (
                    (detail.approvals || []).map((a) => (
                      <div key={a.id} className="px-4 py-3 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-slate-900">{a.title}</div>
                          <div className="text-slate-500">{a.stage}</div>
                        </div>
                        <StatusDotText status={a.status} />
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailSubTab === 'qa' && (
                <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {(detail.qaChecks || []).length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-500">No QA checks recorded for this project.</p>
                  ) : (
                    (detail.qaChecks || []).map((q) => (
                      <div key={q.id} className="px-4 py-3 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-slate-900">{q.title}</div>
                          <div className="text-slate-500">
                            {q.category} · {q.severity}
                          </div>
                        </div>
                        <StatusDotText status={q.status} />
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailSubTab === 'notes' && (
                <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {(detail.notes || []).length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-500">No project notes logged yet.</p>
                  ) : (
                    (detail.notes || []).map((n) => (
                      <div key={n.id} className="p-4 text-xs space-y-1">
                        <div className="font-semibold text-blue-700">{n.note_type}</div>
                        <p className="text-slate-700 whitespace-pre-wrap">{n.content}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* GLOBAL TASKS TAB */}
      {activeTab === 'tasks' && (
        <>
          <SectionToolbar
            filterValue={statusFilter}
            onFilterChange={setStatusFilter}
            filterOptions={TASK_STATUSES}
            filterLabel="Status"
            primaryAction={{
              label: 'New Task',
              onClick: () => {
                setEditingTask(null);
                setTaskForm({
                  project_id: projects[0]?.id || '',
                  title: '',
                  description: '',
                  status: 'Todo',
                  priority: 'Medium',
                  assigned_to: 'Jawed Imtiaz',
                  due_date: ''
                });
                setTaskDrawerOpen(true);
              }
            }}
          />
          {loading ? (
            <LoadingSkeleton />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={<CheckSquare className="w-5 h-5" />}
              title="No tasks found"
              description="Create engineering, design, or deployment tasks linked to a project."
              actionLabel="Create Task"
              onAction={() => setTaskDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Task & Project</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Priority</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Due Date</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{t.title}</div>
                        <div className="text-xs text-slate-500">
                          {t.project_name} · {t.client_business}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusDotText status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">{t.priority}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-600">{formatDate(t.due_date)}</td>
                      <td className="px-4 py-3 text-right">
                        {t.status !== 'Done' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await hqFetch('/api/hq/tasks', {
                                method: 'PUT',
                                body: JSON.stringify({ id: t.id, status: 'Done' })
                              });
                              onToast('success', 'Task marked Done');
                              loadMain();
                            }}
                            className="px-2 py-1 mr-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded cursor-pointer"
                          >
                            Done
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmState({
                              open: true,
                              title: 'Delete task?',
                              description: `Remove task "${t.title}"?`,
                              onConfirm: async () => {
                                await hqFetch(`/api/hq/tasks?id=${encodeURIComponent(t.id)}`, { method: 'DELETE' });
                                onToast('success', 'Task deleted');
                                loadMain();
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

      {/* MILESTONES TAB */}
      {activeTab === 'milestones' && (
        <>
          <SectionToolbar
            primaryAction={{
              label: 'New Milestone',
              onClick: () => {
                setEditingMilestone(null);
                setMilestoneForm({ project_id: projects[0]?.id || '', name: '', description: '', status: 'Pending', due_date: '' });
                setMilestoneDrawerOpen(true);
              }
            }}
          />
          {loading ? (
            <LoadingSkeleton />
          ) : milestones.length === 0 ? (
            <EmptyState
              icon={<Flag className="w-5 h-5" />}
              title="No milestones tracked"
              description="Define key project delivery phases (Design, Beta, Launch) with target due dates."
              actionLabel="Add Milestone"
              onAction={() => setMilestoneDrawerOpen(true)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {milestones.map((m) => (
                <div key={m.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-sm text-slate-900">{m.name}</span>
                      <StatusDotText status={m.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {m.project_name} · {m.client_business} · Due {formatDate(m.due_date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.status !== 'Completed' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await hqFetch('/api/hq/milestones', {
                            method: 'PUT',
                            body: JSON.stringify({ id: m.id, status: 'Completed' })
                          });
                          onToast('success', 'Milestone completed');
                          loadMain();
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded cursor-pointer"
                      >
                        Complete
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: 'Delete milestone?',
                          description: `Remove milestone "${m.name}"?`,
                          onConfirm: async () => {
                            await hqFetch(`/api/hq/milestones?id=${encodeURIComponent(m.id)}`, { method: 'DELETE' });
                            onToast('success', 'Milestone deleted');
                            loadMain();
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

      {/* PROJECT FORM DRAWER */}
      <SlideOverDrawer
        open={projectDrawerOpen}
        onClose={() => setProjectDrawerOpen(false)}
        title={editingProject ? `Edit Project: ${editingProject.name}` : 'Create New Project'}
      >
        <form onSubmit={handleSaveProject} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Linked Customer *</label>
            <select
              required
              value={projectForm.client_id}
              onChange={(e) => setProjectForm({ ...projectForm, client_id: e.target.value })}
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
            <label className="block text-xs font-medium text-slate-700 mb-1">Project Name *</label>
            <input
              required
              value={projectForm.name}
              onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Project Type</label>
              <input
                value={projectForm.project_type}
                onChange={(e) => setProjectForm({ ...projectForm, project_type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Stage</label>
              <select
                value={projectForm.status}
                onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                {PROJECT_STATUS_LIST.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={projectForm.priority}
                onChange={(e) => setProjectForm({ ...projectForm, priority: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Quoted Budget ({projectForm.currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={projectForm.quoted_major}
                onChange={(e) => setProjectForm({ ...projectForm, quoted_major: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={projectForm.start_date}
                onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Target Launch Date</label>
              <input
                type="date"
                value={projectForm.target_date}
                onChange={(e) => setProjectForm({ ...projectForm, target_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Summary</label>
            <textarea
              rows={3}
              value={projectForm.summary}
              onChange={(e) => setProjectForm({ ...projectForm, summary: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setProjectDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              {busy ? 'Saving…' : editingProject ? 'Save Project' : 'Create Project'}
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* TASK DRAWER */}
      <SlideOverDrawer open={taskDrawerOpen} onClose={() => setTaskDrawerOpen(false)} title="Create Task">
        <form onSubmit={handleSaveTask} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Project *</label>
            <select
              required
              value={taskForm.project_id}
              onChange={(e) => setTaskForm({ ...taskForm, project_id: e.target.value })}
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
            <label className="block text-xs font-medium text-slate-700 mb-1">Task Title *</label>
            <input
              required
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={taskForm.status}
                onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Due Date</label>
              <input
                type="date"
                value={taskForm.due_date}
                onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Assigned To</label>
              <input
                value={taskForm.assigned_to}
                onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setTaskDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              Save Task
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* MILESTONE DRAWER */}
      <SlideOverDrawer open={milestoneDrawerOpen} onClose={() => setMilestoneDrawerOpen(false)} title="Create Milestone">
        <form onSubmit={handleSaveMilestone} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Project *</label>
            <select
              required
              value={milestoneForm.project_id}
              onChange={(e) => setMilestoneForm({ ...milestoneForm, project_id: e.target.value })}
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
            <label className="block text-xs font-medium text-slate-700 mb-1">Milestone Name *</label>
            <input
              required
              value={milestoneForm.name}
              onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={milestoneForm.status}
                onChange={(e) => setMilestoneForm({ ...milestoneForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              >
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Target Date</label>
              <input
                type="date"
                value={milestoneForm.due_date}
                onChange={(e) => setMilestoneForm({ ...milestoneForm, due_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setMilestoneDrawerOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
            >
              Save Milestone
            </button>
          </div>
        </form>
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
            onToast('error', err.message || 'Delete failed');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
};
