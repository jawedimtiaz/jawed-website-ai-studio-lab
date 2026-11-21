// src/services/hqProjectHelpers.ts
// Pure helper functions for Studio HQ Projects module:
// Canonical status mapping, legacy compatibility, response normalization, and display formatting.

import type {
  HqProject,
  HqTask,
  HqMilestone,
  HqApproval,
  HqQaCheck,
  HqRepository,
  HqOnboardingItem,
  HqNote
} from '../types/hq.ts';

export const CANONICAL_PROJECT_STATUSES = [
  'lead',
  'discovery',
  'quoted',
  'approved',
  'in-progress',
  'review',
  'blocked',
  'completed',
  'on-hold',
  'cancelled'
] as const;

export type CanonicalProjectStatus = typeof CANONICAL_PROJECT_STATUSES[number];

export const CANONICAL_STATUS_SET = new Set<string>(CANONICAL_PROJECT_STATUSES);

export interface StatusOption {
  canonical: CanonicalProjectStatus;
  label: string;
  category: 'Active' | 'Completed' | 'On Hold' | 'Lead' | 'Cancelled';
}

export const SELECTABLE_PROJECT_STATUSES: readonly StatusOption[] = [
  { canonical: 'discovery', label: 'Discovery / Planning', category: 'Active' },
  { canonical: 'in-progress', label: 'In Progress', category: 'Active' },
  { canonical: 'review', label: 'Review', category: 'Active' },
  { canonical: 'approved', label: 'Client Approval', category: 'Active' },
  { canonical: 'quoted', label: 'Quoted', category: 'Active' },
  { canonical: 'lead', label: 'Lead', category: 'Lead' },
  { canonical: 'blocked', label: 'Blocked', category: 'Active' },
  { canonical: 'on-hold', label: 'On Hold', category: 'On Hold' },
  { canonical: 'completed', label: 'Completed', category: 'Completed' },
  { canonical: 'cancelled', label: 'Cancelled', category: 'Cancelled' }
] as const;

/**
 * Maps any status input (canonical, legacy, or formatted) to its canonical backend status value.
 * Returns null if the status has no known canonical equivalent.
 */
export function toCanonicalStatus(status: string | null | undefined): CanonicalProjectStatus | null {
  if (!status || typeof status !== 'string') return null;
  const normalized = status.trim().toLowerCase();

  if (CANONICAL_STATUS_SET.has(normalized)) {
    return normalized as CanonicalProjectStatus;
  }

  // Legacy frontend label mappings
  switch (normalized) {
    case 'planning':
      return 'discovery';
    case 'in progress':
    case 'active':
      return 'in-progress';
    case 'client approval':
      return 'approved';
    case 'on hold':
    case 'paused':
      return 'on-hold';
    case 'onboarding':
      // Legacy concept: onboarding belongs to approved/pre-execution stage in canonical flow
      return 'approved';
    case 'maintenance':
      // Legacy status: maps to completed/retained canonical state
      return 'completed';
    default:
      return null;
  }
}

/**
 * Returns a human-friendly display label for any project status.
 */
export function getStatusDisplayLabel(status: string | null | undefined): string {
  if (!status || typeof status !== 'string') return 'Discovery / Planning';
  const canonical = toCanonicalStatus(status);
  if (canonical) {
    const match = SELECTABLE_PROJECT_STATUSES.find((s) => s.canonical === canonical);
    if (match) return match.label;
  }

  // Fallback for custom / legacy strings: title-case formatting
  const trimmed = status.trim();
  if (!trimmed) return 'Discovery / Planning';
  return trimmed
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
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

/**
 * Validates and normalizes raw API responses into a clean ProjectDetailBundle.
 * Discards mismatched collection payloads { ok: true, projects: [...] } to prevent
 * render-time crashes like TypeError: Cannot read properties of undefined (reading 'status').
 */
export function normalizeProjectDetailBundle(
  projectRes: any,
  tasksRes?: any,
  milestonesRes?: any
): ProjectDetailBundle | null {
  if (!projectRes || typeof projectRes !== 'object') return null;

  // Extract the project object from canonical { ok: true, project: {...} },
  // legacy bundle { project: {...} }, or direct project object { id, ... }
  // Explicitly discard collection responses { ok: true, projects: [...] }
  const rawProject =
    projectRes.project && typeof projectRes.project === 'object'
      ? projectRes.project
      : ('id' in projectRes && !('projects' in projectRes) ? projectRes : null);

  if (!rawProject || typeof rawProject !== 'object' || !rawProject.id) {
    return null;
  }

  const rawStatus = typeof rawProject.status === 'string' && rawProject.status.trim()
    ? rawProject.status.trim()
    : 'discovery';
  const canonicalStatus = toCanonicalStatus(rawStatus) || rawStatus;

  const safeProject: HqProject = {
    ...rawProject,
    client_business: rawProject.client_business || rawProject.client_business_name || rawProject.client_name || '',
    status: canonicalStatus
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
