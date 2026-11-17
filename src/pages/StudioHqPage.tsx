import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { HqSessionLifecycle } from '../lib/hqSessionLifecycle';

type HqIdentity = { uid: string; email: string };
type HqProject = { id: string; name: string; client_id: string; client_name: string; project_type: string; status: string; priority: string; target_date: string | null; archived_at: string | null };
type HqTask = { id: string; title: string; status: string; priority: string; due_date: string | null; milestone_name: string | null };
type HqMilestone = { id: string; name: string; status: string; due_date: string | null };
type HqClient = {
  id: string;
  name: string;
  business_name: string | null;
  status: string;
  email: string | null;
  phone: string | null;
  archived_at: string | null;
};

type HqApproval = {
  id: string;
  project_id: string;
  approval_type: string;
  status: string;
  requested_by: string;
  requested_from_email: string | null;
  decided_by?: string | null;
  decision_note?: string | null;
  requested_at: string;
  decided_at?: string | null;
  evidence_url?: string | null;
};

type HqQaCheck = {
  id: string;
  project_id: string;
  category: string;
  check_name: string;
  result: string;
  evidence_url: string | null;
  notes: string | null;
  checked_by?: string | null;
  checked_at?: string | null;
  created_at: string;
  updated_at: string;
};

const APPROVAL_TYPES = [
  { value: 'scope', label: 'Scope' },
  { value: 'design', label: 'Design' },
  { value: 'content', label: 'Content' },
  { value: 'qa', label: 'QA' },
  { value: 'production-release', label: 'Production Release' },
  { value: 'handover', label: 'Handover' },
  { value: 'other', label: 'Other' }
];

const QA_CATEGORIES = [
  { value: 'functionality', label: 'Functionality' },
  { value: 'responsive', label: 'Responsive' },
  { value: 'accessibility', label: 'Accessibility' },
  { value: 'seo', label: 'SEO' },
  { value: 'performance', label: 'Performance' },
  { value: 'security', label: 'Security' },
  { value: 'browser', label: 'Browser' },
  { value: 'content', label: 'Content' },
  { value: 'backup', label: 'Backup' },
  { value: 'other', label: 'Other' }
];

const QA_RESULTS = [
  { value: 'not-run', label: 'Not Run' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'not-applicable', label: 'N/A' }
];

function isValidHttpsUrl(val: string): boolean {
  if (!val.trim()) return true;
  try {
    const parsed = new URL(val.trim());
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatHqDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

export const StudioHqPage: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [identity, setIdentity] = useState<HqIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clients, setClients] = useState<HqClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientBusiness, setClientBusiness] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientError, setClientError] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [projects, setProjects] = useState<HqProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectClientId, setProjectClientId] = useState('');
  const [projectType, setProjectType] = useState('business-website');
  const [projectError, setProjectError] = useState('');
  const [savingProject, setSavingProject] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [projectWork, setProjectWork] = useState<Record<string, { tasks: HqTask[]; milestones: HqMilestone[] }>>({});
  const [workLoading, setWorkLoading] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newMilestoneName, setNewMilestoneName] = useState('');

  const [projectApprovals, setProjectApprovals] = useState<Record<string, HqApproval[]>>({});
  const [approvalsLoading, setApprovalsLoading] = useState<Record<string, boolean>>({});
  const [approvalErrors, setApprovalErrors] = useState<Record<string, string>>({});
  const [approvalForms, setApprovalForms] = useState<Record<string, { type: string; email: string; evidence: string }>>({});
  const [submittingApproval, setSubmittingApproval] = useState<Record<string, boolean>>({});
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [decidingApproval, setDecidingApproval] = useState<Record<string, boolean>>({});

  const [projectQa, setProjectQa] = useState<Record<string, HqQaCheck[]>>({});
  const [qaLoading, setQaLoading] = useState<Record<string, boolean>>({});
  const [qaErrors, setQaErrors] = useState<Record<string, string>>({});
  const [qaForms, setQaForms] = useState<Record<string, { category: string; name: string; result: string; notes: string; evidence: string }>>({});
  const [submittingQa, setSubmittingQa] = useState<Record<string, boolean>>({});
  const [updatingQa, setUpdatingQa] = useState<Record<string, boolean>>({});
  const [editingQaId, setEditingQaId] = useState<string | null>(null);
  const [editingQaData, setEditingQaData] = useState<{ result: string; notes: string; evidence: string }>({
    result: 'not-run',
    notes: '',
    evidence: ''
  });

  const [projectActiveTab, setProjectActiveTab] = useState<Record<string, 'all' | 'work' | 'approvals' | 'qa'>>({});
  const sessionLifecycle = useRef(new HqSessionLifecycle());

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    if (currentUser) {
      sessionLifecycle.current.startSession(currentUser.uid);
    } else {
      sessionLifecycle.current.endSession();
    }
    setIdentity(null);
    setClients([]);
    setProjects([]);
    setProjectWork({});
    setProjectApprovals({});
    setProjectQa({});
    setApprovalErrors({});
    setQaErrors({});
    setDecisionNotes({});
    setEditingQaId(null);
    setApprovalsLoading({});
    setSubmittingApproval({});
    setDecidingApproval({});
    setQaLoading({});
    setSubmittingQa({});
    setUpdatingQa({});
    setError('');
    setLoading(false);
  }), []);

  const authenticate = async (currentUser: User) => {
    const token = await currentUser.getIdToken();
    const response = await fetch('/api/hq/session', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      credentials: 'same-origin'
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.identity) {
      throw new Error(payload.error === 'HQ_OWNER_ACCESS_DENIED'
        ? 'This Google account is not authorized to access Studio HQ.'
        : 'Studio HQ could not verify this session. Please sign in again.');
    }
    setIdentity(payload.identity);
  };

  useEffect(() => {
    if (!user) return;
    let active = true;
    setBusy(true);
    authenticate(user)
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Authentication failed.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, [user]);

  const loadClients = async () => {
    if (!user) return;
    setClientsLoading(true);
    setClientError('');
    try {
      const token = await user.getIdToken();
      const query = showArchived ? '?archivedOnly=true' : '';
      const response = await fetch('/api/hq/clients' + query, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to load clients.');
      setClients(payload.clients || []);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Unable to load CRM clients.');
    } finally {
      setClientsLoading(false);
    }
  };

  useEffect(() => {
    if (identity && user) void loadClients();
  }, [identity, user, showArchived]);

  const loadProjects = async () => {
    if (!user) return;
    setProjectsLoading(true);
    setProjectError('');
    try {
      const token = await user.getIdToken();
      const query = showArchivedProjects ? '?archivedOnly=true' : '';
      const response = await fetch('/api/hq/projects' + query, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to load projects.');
      setProjects(payload.projects || []);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Unable to load projects.');
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    if (identity && user) void loadProjects();
  }, [identity, user, showArchivedProjects]);

  const handleCreateClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setSavingClient(true);
    setClientError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/hq/clients', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: clientName, business_name: clientBusiness, email: clientEmail }),
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to create client.');
      setClientName('');
      setClientBusiness('');
      setClientEmail('');
      await loadClients();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Unable to create client.');
    } finally {
      setSavingClient(false);
    }
  };

  const setClientArchived = async (client: HqClient, restore: boolean) => {
    if (!user) return;
    setClientError('');
    try {
      const token = await user.getIdToken();
      const action = restore ? 'restore' : 'archive';
      const response = await fetch(`/api/hq/clients/${encodeURIComponent(client.id)}/${action}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to update client.');
      await loadClients();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Unable to update client.');
    }
  };

  const loadProjectWork = async (projectId: string) => {
    if (!user) return;
    setWorkLoading(true);
    setProjectError('');
    try {
      const token = await user.getIdToken();
      const headers = { authorization: `Bearer ${token}` };
      const [taskResponse, milestoneResponse] = await Promise.all([
        fetch(`/api/hq/projects/${encodeURIComponent(projectId)}/tasks`, { headers, cache: 'no-store', credentials: 'same-origin' }),
        fetch(`/api/hq/projects/${encodeURIComponent(projectId)}/milestones`, { headers, cache: 'no-store', credentials: 'same-origin' })
      ]);
      const [taskPayload, milestonePayload] = await Promise.all([taskResponse.json(), milestoneResponse.json()]);
      if (!taskResponse.ok || !taskPayload.ok || !milestoneResponse.ok || !milestonePayload.ok) {
        throw new Error('Unable to load project tasks and milestones.');
      }
      setProjectWork(current => ({ ...current, [projectId]: { tasks: taskPayload.tasks || [], milestones: milestonePayload.milestones || [] } }));
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Unable to load project work.');
    } finally {
      setWorkLoading(false);
    }
  };

  const addProjectMilestone = async (event: React.FormEvent<HTMLFormElement>, projectId: string) => {
    event.preventDefault();
    if (!user || !newMilestoneName.trim()) return;
    setProjectError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/hq/projects/${encodeURIComponent(projectId)}/milestones`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: newMilestoneName }),
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to add milestone.');
      setNewMilestoneName('');
      await loadProjectWork(projectId);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Unable to add milestone.');
    }
  };

  const addProjectTask = async (event: React.FormEvent<HTMLFormElement>, projectId: string) => {
    event.preventDefault();
    if (!user || !newTaskTitle.trim()) return;
    setProjectError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/hq/projects/${encodeURIComponent(projectId)}/tasks`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ title: newTaskTitle }),
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to add task.');
      setNewTaskTitle('');
      await loadProjectWork(projectId);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Unable to add task.');
    }
  };

  const updateTaskStatus = async (projectId: string, taskId: string, status: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/hq/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to update task.');
      await loadProjectWork(projectId);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Unable to update task.');
    }
  };

  const updateMilestoneStatus = async (projectId: string, milestoneId: string, status: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/hq/projects/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to update milestone.');
      await loadProjectWork(projectId);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Unable to update milestone.');
    }
  };

  const handleCreateProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !projectClientId) return;
    setSavingProject(true);
    setProjectError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/hq/projects', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: projectClientId, name: projectName, project_type: projectType }),
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to create project.');
      setProjectName('');
      await loadProjects();
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Unable to create project.');
    } finally {
      setSavingProject(false);
    }
  };

  const setProjectArchived = async (project: HqProject, restore: boolean) => {
    if (!user) return;
    setProjectError('');
    try {
      const token = await user.getIdToken();
      const action = restore ? 'restore' : 'archive';
      const response = await fetch(`/api/hq/projects/${encodeURIComponent(project.id)}/${action}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to update project.');
      await loadProjects();
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Unable to update project.');
    }
  };

  const loadProjectApprovals = async (projectId: string) => {
    if (!user) return;
    const req = sessionLifecycle.current.createRequestToken(`${projectId}:approvals-load`);
    setApprovalsLoading(prev => ({ ...prev, [projectId]: true }));
    setApprovalErrors(prev => ({ ...prev, [projectId]: '' }));
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/hq/projects/${encodeURIComponent(projectId)}/approvals`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!req.isLatest()) return;
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to load project approvals.');
      setProjectApprovals(prev => ({ ...prev, [projectId]: payload.approvals || [] }));
    } catch (err) {
      if (!req.isLatest()) return;
      setApprovalErrors(prev => ({
        ...prev,
        [projectId]: err instanceof Error ? err.message : 'Unable to load project approvals.'
      }));
    } finally {
      if (req.isLatest()) {
        setApprovalsLoading(prev => ({ ...prev, [projectId]: false }));
      }
    }
  };

  const handleCreateApproval = async (event: React.FormEvent<HTMLFormElement>, projectId: string) => {
    event.preventDefault();
    if (!user) return;
    const form = approvalForms[projectId] || { type: 'scope', email: '', evidence: '' };
    const approvalType = form.type || 'scope';
    const email = form.email.trim();
    const evidence = form.evidence.trim();

    if (evidence && !isValidHttpsUrl(evidence)) {
      setApprovalErrors(prev => ({ ...prev, [projectId]: 'Evidence URL must be a valid HTTPS URL (e.g. https://example.com/spec).' }));
      return;
    }

    const req = sessionLifecycle.current.createRequestToken(`${projectId}:approval-create`);
    setSubmittingApproval(prev => ({ ...prev, [projectId]: true }));
    setApprovalErrors(prev => ({ ...prev, [projectId]: '' }));
    try {
      const token = await user.getIdToken();
      const body: { approval_type: string; requested_from_email?: string; evidence_url?: string } = {
        approval_type: approvalType
      };
      if (email) body.requested_from_email = email;
      if (evidence) body.evidence_url = evidence;

      const response = await fetch(`/api/hq/projects/${encodeURIComponent(projectId)}/approvals`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!req.isLatest()) return;
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to create approval request.');
      setApprovalForms(prev => ({ ...prev, [projectId]: { type: 'scope', email: '', evidence: '' } }));
      await loadProjectApprovals(projectId);
    } catch (err) {
      if (!req.isLatest()) return;
      setApprovalErrors(prev => ({
        ...prev,
        [projectId]: err instanceof Error ? err.message : 'Unable to create approval request.'
      }));
    } finally {
      if (req.isLatest()) {
        setSubmittingApproval(prev => ({ ...prev, [projectId]: false }));
      }
    }
  };

  const handleDecideApproval = async (projectId: string, approvalId: string, status: 'approved' | 'rejected' | 'withdrawn') => {
    if (!user) return;
    const req = sessionLifecycle.current.createRequestToken(`${projectId}:approval-decision:${approvalId}`);
    setDecidingApproval(prev => ({ ...prev, [approvalId]: true }));
    setApprovalErrors(prev => ({ ...prev, [projectId]: '' }));
    try {
      const token = await user.getIdToken();
      const userNote = (decisionNotes[approvalId] || '').trim();
      const decision_note = userNote || (status === 'approved' ? 'Review completed' : status === 'rejected' ? 'Rejected by owner' : 'Withdrawn by owner');

      const response = await fetch(`/api/hq/approvals/${encodeURIComponent(approvalId)}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status, decision_note }),
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!req.isLatest()) return;
      if (!response.ok || !payload.ok) throw new Error(payload.error || `Unable to ${status} approval.`);
      setDecisionNotes(prev => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });
      await loadProjectApprovals(projectId);
    } catch (err) {
      if (!req.isLatest()) return;
      setApprovalErrors(prev => ({
        ...prev,
        [projectId]: err instanceof Error ? err.message : 'Unable to decide approval request.'
      }));
    } finally {
      if (req.isLatest()) {
        setDecidingApproval(prev => ({ ...prev, [approvalId]: false }));
      }
    }
  };

  const loadProjectQa = async (projectId: string) => {
    if (!user) return;
    const req = sessionLifecycle.current.createRequestToken(`${projectId}:qa-load`);
    setQaLoading(prev => ({ ...prev, [projectId]: true }));
    setQaErrors(prev => ({ ...prev, [projectId]: '' }));
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/hq/projects/${encodeURIComponent(projectId)}/qa`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!req.isLatest()) return;
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to load project QA checks.');
      setProjectQa(prev => ({ ...prev, [projectId]: payload.checks || [] }));
    } catch (err) {
      if (!req.isLatest()) return;
      setQaErrors(prev => ({
        ...prev,
        [projectId]: err instanceof Error ? err.message : 'Unable to load project QA checks.'
      }));
    } finally {
      if (req.isLatest()) {
        setQaLoading(prev => ({ ...prev, [projectId]: false }));
      }
    }
  };

  const handleCreateQaCheck = async (event: React.FormEvent<HTMLFormElement>, projectId: string) => {
    event.preventDefault();
    if (!user) return;
    const form = qaForms[projectId] || { category: 'functionality', name: '', result: 'not-run', notes: '', evidence: '' };
    const category = form.category || 'functionality';
    const checkName = form.name.trim();
    const result = form.result || 'not-run';
    const notes = form.notes.trim();
    const evidence = form.evidence.trim();

    if (!checkName) {
      setQaErrors(prev => ({ ...prev, [projectId]: 'QA check name is required.' }));
      return;
    }
    if (evidence && !isValidHttpsUrl(evidence)) {
      setQaErrors(prev => ({ ...prev, [projectId]: 'Evidence URL must be a valid HTTPS URL (e.g. https://example.com/test).' }));
      return;
    }

    const req = sessionLifecycle.current.createRequestToken(`${projectId}:qa-create`);
    setSubmittingQa(prev => ({ ...prev, [projectId]: true }));
    setQaErrors(prev => ({ ...prev, [projectId]: '' }));
    try {
      const token = await user.getIdToken();
      const body: { category: string; check_name: string; result: string; notes?: string; evidence_url?: string } = {
        category,
        check_name: checkName,
        result
      };
      if (notes) body.notes = notes;
      if (evidence) body.evidence_url = evidence;

      const response = await fetch(`/api/hq/projects/${encodeURIComponent(projectId)}/qa`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!req.isLatest()) return;
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to create QA check.');
      setQaForms(prev => ({
        ...prev,
        [projectId]: { category: 'functionality', name: '', result: 'not-run', notes: '', evidence: '' }
      }));
      await loadProjectQa(projectId);
    } catch (err) {
      if (!req.isLatest()) return;
      setQaErrors(prev => ({
        ...prev,
        [projectId]: err instanceof Error ? err.message : 'Unable to create QA check.'
      }));
    } finally {
      if (req.isLatest()) {
        setSubmittingQa(prev => ({ ...prev, [projectId]: false }));
      }
    }
  };

  const handleUpdateQaCheck = async (
    projectId: string,
    checkId: string,
    updates: { result?: string; notes?: string | null; evidence_url?: string | null }
  ) => {
    if (!user) return;
    if (updates.evidence_url && !isValidHttpsUrl(updates.evidence_url)) {
      setQaErrors(prev => ({ ...prev, [projectId]: 'Evidence URL must be a valid HTTPS URL (e.g. https://example.com/test).' }));
      return;
    }

    const req = sessionLifecycle.current.createRequestToken(`${projectId}:qa-update:${checkId}`);
    setUpdatingQa(prev => ({ ...prev, [checkId]: true }));
    setQaErrors(prev => ({ ...prev, [projectId]: '' }));
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/hq/qa/${encodeURIComponent(checkId)}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(updates),
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!req.isLatest()) return;
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to update QA check.');
      if (editingQaId === checkId) {
        setEditingQaId(null);
      }
      await loadProjectQa(projectId);
    } catch (err) {
      if (!req.isLatest()) return;
      setQaErrors(prev => ({
        ...prev,
        [projectId]: err instanceof Error ? err.message : 'Unable to update QA check.'
      }));
    } finally {
      if (req.isLatest()) {
        setUpdatingQa(prev => ({ ...prev, [checkId]: false }));
      }
    }
  };

  const toggleExpandProject = (projectId: string) => {
    const next = expandedProjectId === projectId ? null : projectId;
    setExpandedProjectId(next);
    if (next) {
      void loadProjectWork(next);
      void loadProjectApprovals(next);
      void loadProjectQa(next);
    }
  };

  const handleSignIn = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    sessionLifecycle.current.endSession();
    setIdentity(null);
    setClients([]);
    setProjects([]);
    setProjectWork({});
    setProjectApprovals({});
    setProjectQa({});
    setApprovalErrors({});
    setQaErrors({});
    setDecisionNotes({});
    setEditingQaId(null);
    setApprovalsLoading({});
    setSubmittingApproval({});
    setDecidingApproval({});
    setQaLoading({});
    setSubmittingQa({});
    setUpdatingQa({});
    try {
      await signOut(auth);
    } catch {
      setError('Unable to sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', padding: '32px 18px', background: 'var(--background, #f7f8fa)' }}>
      <div style={{ width: '100%', maxWidth: 1080, margin: '0 auto' }}>
        <section aria-labelledby="hq-title" style={{ padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface, white)', marginBottom: 24 }}>
          <p style={{ color: 'var(--accent)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 12 }}>Private workspace</p>
          <h1 id="hq-title" style={{ marginTop: 8 }}>Jawed Web Studio HQ</h1>
          <p style={{ color: 'var(--muted)' }}>Business operations workspace for Jawed Web Studio.</p>
          {loading || busy ? <p role="status">Verifying your session…</p> : null}
          {error ? <p role="alert" style={{ color: '#b42318' }}>{error}</p> : null}
          {identity ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <p role="status">Owner access verified for <strong>{identity.email}</strong>.</p>
              <button type="button" onClick={handleSignOut}>Sign out</button>
            </div>
          ) : user ? (
            <div>
              <p>Signed in as {user.email || 'Google account'}, but owner authorization has not been confirmed.</p>
              <button type="button" onClick={handleSignOut} disabled={busy}>Sign out</button>
            </div>
          ) : (
            <button type="button" onClick={handleSignIn} disabled={busy}>Continue with Google</button>
          )}
        </section>

        {identity ? (
          <section aria-labelledby="crm-title" style={{ padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface, white)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 id="crm-title">CRM — Clients</h2>
                <p style={{ color: 'var(--muted)' }}>Add, review, archive and restore client records.</p>
              </div>
              <button type="button" onClick={() => setShowArchived(value => !value)}>
                {showArchived ? 'Show active clients' : 'Show archived clients'}
              </button>
            </div>

            <form onSubmit={handleCreateClient} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '20px 0', padding: 18, background: 'var(--surface-muted, #f7f8fa)', borderRadius: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Client name *</span>
                <input value={clientName} onChange={event => setClientName(event.target.value)} required maxLength={120} placeholder="Client or contact name" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Business name</span>
                <input value={clientBusiness} onChange={event => setClientBusiness(event.target.value)} maxLength={160} placeholder="Business name" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Email</span>
                <input type="email" value={clientEmail} onChange={event => setClientEmail(event.target.value)} maxLength={254} placeholder="client@example.com" />
              </label>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button type="submit" disabled={savingClient || !clientName.trim()}>{savingClient ? 'Saving…' : 'Add client'}</button>
              </div>
            </form>

            {clientError ? <p role="alert" style={{ color: '#b42318' }}>{clientError}</p> : null}
            {clientsLoading ? <p role="status">Loading clients…</p> : null}
            {!clientsLoading && clients.length === 0 ? <p>No {showArchived ? 'archived' : 'active'} clients yet.</p> : null}
            <div style={{ display: 'grid', gap: 10 }}>
              {clients.map(client => (
                <article key={client.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: 16, border: '1px solid var(--line)', borderRadius: 12 }}>
                  <div>
                    <strong>{client.name}</strong>
                    {client.business_name ? <span> · {client.business_name}</span> : null}
                    <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>{client.email || 'No email'} · {client.status}</p>
                  </div>
                  {client.archived_at
                    ? <button type="button" onClick={() => void setClientArchived(client, true)}>Restore</button>
                    : <button type="button" onClick={() => void setClientArchived(client, false)}>Archive</button>}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {identity ? (
          <section aria-labelledby="projects-title" style={{ padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface, white)', marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 id="projects-title">Projects & Delivery</h2>
                <p style={{ color: 'var(--muted)' }}>Track customer work, delivery status and target dates.</p>
              </div>
              <button type="button" onClick={() => setShowArchivedProjects(value => !value)}>
                {showArchivedProjects ? 'Show active projects' : 'Show archived projects'}
              </button>
            </div>
            {!showArchivedProjects ? (
              <form onSubmit={handleCreateProject} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '20px 0', padding: 18, background: 'var(--surface-muted, #f7f8fa)', borderRadius: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Project name *</span>
                  <input value={projectName} onChange={event => setProjectName(event.target.value)} required maxLength={160} placeholder="Website redesign" />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Client *</span>
                  <select value={projectClientId} onChange={event => setProjectClientId(event.target.value)} required>
                    <option value="">Select a client</option>
                    {clients.filter(client => !client.archived_at).map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Project type</span>
                  <select value={projectType} onChange={event => setProjectType(event.target.value)}>
                    <option value="business-website">Business website</option>
                    <option value="portfolio">Portfolio</option>
                    <option value="web-app">Web application</option>
                    <option value="automation">Automation</option>
                    <option value="ai-app">AI application</option>
                    <option value="calculator-generator">Calculator / generator</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <div style={{ display: 'flex', alignItems: 'end' }}>
                  <button type="submit" disabled={savingProject || !projectName.trim() || !projectClientId}>{savingProject ? 'Saving…' : 'Add project'}</button>
                </div>
              </form>
            ) : null}
            {projectError ? <p role="alert" style={{ color: '#b42318' }}>{projectError}</p> : null}
            {projectsLoading ? <p role="status">Loading projects…</p> : null}
            {!projectsLoading && projects.length === 0 ? <p>No {showArchivedProjects ? 'archived' : 'active'} projects yet.</p> : null}
            <div style={{ display: 'grid', gap: 10 }}>
              {projects.map(project => (
                <article key={project.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: 16, border: '1px solid var(--line)', borderRadius: 12 }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <strong>{project.name}</strong>
                    <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>{project.client_name} · {project.status} · {project.priority}{project.target_date ? ' · Due ' + project.target_date : ''}</p>
                    {!project.archived_at ? (
                      <button type="button" style={{ marginTop: 10 }} onClick={() => toggleExpandProject(project.id)}>
                        {expandedProjectId === project.id ? 'Hide project details' : 'Manage tasks, approvals & QA'}
                      </button>
                    ) : null}
                    {expandedProjectId === project.id && !project.archived_at ? (
                      <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: 'var(--surface-muted, #f7f8fa)', border: '1px solid var(--line)' }}>
                        <nav aria-label="Project workspace view filter" style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--line)', paddingBottom: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            aria-pressed={(projectActiveTab[project.id] || 'all') === 'all'}
                            onClick={() => setProjectActiveTab(prev => ({ ...prev, [project.id]: 'all' }))}
                            style={{
                              background: (projectActiveTab[project.id] || 'all') === 'all' ? 'var(--accent, #0284c7)' : 'transparent',
                              color: (projectActiveTab[project.id] || 'all') === 'all' ? 'white' : 'var(--text)',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              padding: '6px 12px',
                              fontSize: 13,
                              fontWeight: (projectActiveTab[project.id] || 'all') === 'all' ? 700 : 500,
                              cursor: 'pointer'
                            }}
                          >
                            All Workspace
                          </button>
                          <button
                            type="button"
                            aria-pressed={projectActiveTab[project.id] === 'work'}
                            onClick={() => setProjectActiveTab(prev => ({ ...prev, [project.id]: 'work' }))}
                            style={{
                              background: projectActiveTab[project.id] === 'work' ? 'var(--accent, #0284c7)' : 'transparent',
                              color: projectActiveTab[project.id] === 'work' ? 'white' : 'var(--text)',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              padding: '6px 12px',
                              fontSize: 13,
                              fontWeight: projectActiveTab[project.id] === 'work' ? 700 : 500,
                              cursor: 'pointer'
                            }}
                          >
                            Tasks & Milestones ({(projectWork[project.id]?.tasks?.length || 0) + (projectWork[project.id]?.milestones?.length || 0)})
                          </button>
                          <button
                            type="button"
                            aria-pressed={projectActiveTab[project.id] === 'approvals'}
                            onClick={() => setProjectActiveTab(prev => ({ ...prev, [project.id]: 'approvals' }))}
                            style={{
                              background: projectActiveTab[project.id] === 'approvals' ? 'var(--accent, #0284c7)' : 'transparent',
                              color: projectActiveTab[project.id] === 'approvals' ? 'white' : 'var(--text)',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              padding: '6px 12px',
                              fontSize: 13,
                              fontWeight: projectActiveTab[project.id] === 'approvals' ? 700 : 500,
                              cursor: 'pointer'
                            }}
                          >
                            Visual Approvals ({projectApprovals[project.id]?.length || 0})
                          </button>
                          <button
                            type="button"
                            aria-pressed={projectActiveTab[project.id] === 'qa'}
                            onClick={() => setProjectActiveTab(prev => ({ ...prev, [project.id]: 'qa' }))}
                            style={{
                              background: projectActiveTab[project.id] === 'qa' ? 'var(--accent, #0284c7)' : 'transparent',
                              color: projectActiveTab[project.id] === 'qa' ? 'white' : 'var(--text)',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              padding: '6px 12px',
                              fontSize: 13,
                              fontWeight: projectActiveTab[project.id] === 'qa' ? 700 : 500,
                              cursor: 'pointer'
                            }}
                          >
                            QA Checklist ({projectQa[project.id]?.length || 0})
                          </button>
                        </nav>

                        {((projectActiveTab[project.id] || 'all') === 'all' || projectActiveTab[project.id] === 'work') ? (
                          <section aria-label="Tasks and Milestones" style={{ marginBottom: 20 }}>
                            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Tasks & Milestones</h3>
                            {workLoading ? <p role="status">Loading project work…</p> : null}
                            <form onSubmit={event => void addProjectMilestone(event, project.id)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                              <input value={newMilestoneName} onChange={event => setNewMilestoneName(event.target.value)} required maxLength={160} placeholder="New milestone name" />
                              <button type="submit">Add milestone</button>
                            </form>
                            {(projectWork[project.id]?.milestones || []).map(milestone => (
                              <div key={milestone.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0' }}>
                                <span>{milestone.name} · {milestone.status}</span>
                                <button type="button" onClick={() => void updateMilestoneStatus(project.id, milestone.id, milestone.status === 'completed' ? 'in-progress' : 'completed')}>{milestone.status === 'completed' ? 'Reopen' : 'Complete'}</button>
                              </div>
                            ))}
                            <form onSubmit={event => void addProjectTask(event, project.id)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 8px' }}>
                              <input value={newTaskTitle} onChange={event => setNewTaskTitle(event.target.value)} required maxLength={160} placeholder="New task" />
                              <button type="submit">Add task</button>
                            </form>
                            {(projectWork[project.id]?.tasks || []).map(task => (
                              <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0' }}>
                                <span>{task.title} · {task.status}</span>
                                <button type="button" onClick={() => void updateTaskStatus(project.id, task.id, task.status === 'done' ? 'todo' : 'done')}>{task.status === 'done' ? 'Reopen' : 'Complete'}</button>
                              </div>
                            ))}
                          </section>
                        ) : null}

                        {((projectActiveTab[project.id] || 'all') === 'all' || projectActiveTab[project.id] === 'approvals') ? (
                          <section aria-label="Customer Approvals" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                              <div>
                                <h3 style={{ margin: 0, fontSize: 16 }}>Customer Approvals & Sign-offs</h3>
                                <p style={{ color: 'var(--muted)', fontSize: 12, margin: '2px 0 0' }}>
                                  Owner-managed delivery sign-offs. Reference email is stored for audit context only; no automated emails are sent.
                                </p>
                              </div>
                            </div>

                            <form onSubmit={event => void handleCreateApproval(event, project.id)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, margin: '14px 0', padding: 14, background: 'var(--surface, white)', border: '1px solid var(--line)', borderRadius: 10 }}>
                              <label style={{ display: 'grid', gap: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 600 }}>Approval type *</span>
                                <select
                                  value={approvalForms[project.id]?.type || 'scope'}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setApprovalForms(prev => ({ ...prev, [project.id]: { ...(prev[project.id] || { type: 'scope', email: '', evidence: '' }), type: val } }));
                                  }}
                                  required
                                >
                                  {APPROVAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                              </label>
                              <label style={{ display: 'grid', gap: 4 }}>
                                <span style={{ fontSize: 12 }}>Requested-from email (reference only)</span>
                                <input
                                  type="email"
                                  value={approvalForms[project.id]?.email || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setApprovalForms(prev => ({ ...prev, [project.id]: { ...(prev[project.id] || { type: 'scope', email: '', evidence: '' }), email: val } }));
                                  }}
                                  maxLength={254}
                                  placeholder="client@example.com"
                                />
                              </label>
                              <label style={{ display: 'grid', gap: 4 }}>
                                <span style={{ fontSize: 12 }}>Evidence link (HTTPS)</span>
                                <input
                                  type="url"
                                  value={approvalForms[project.id]?.evidence || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setApprovalForms(prev => ({ ...prev, [project.id]: { ...(prev[project.id] || { type: 'scope', email: '', evidence: '' }), evidence: val } }));
                                  }}
                                  placeholder="https://example.com/spec"
                                  pattern="https://.*"
                                  maxLength={1000}
                                />
                              </label>
                              <div style={{ display: 'flex', alignItems: 'end' }}>
                                <button
                                  type="submit"
                                  disabled={submittingApproval[project.id]}
                                >
                                  {submittingApproval[project.id] ? 'Requesting…' : 'Request approval'}
                                </button>
                              </div>
                            </form>

                            {approvalErrors[project.id] ? <p role="alert" style={{ color: '#b42318', fontSize: 13, margin: '8px 0' }}>{approvalErrors[project.id]}</p> : null}
                            {approvalsLoading[project.id] ? <p role="status" style={{ fontSize: 13, color: 'var(--muted)' }}>Loading approvals…</p> : null}
                            {!approvalsLoading[project.id] && (!projectApprovals[project.id] || projectApprovals[project.id].length === 0) ? (
                              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No approval requests recorded for this project.</p>
                            ) : null}

                            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                              {(projectApprovals[project.id] || []).map(approval => {
                                const typeInfo = APPROVAL_TYPES.find(t => t.value === approval.approval_type);
                                const typeLabel = typeInfo ? typeInfo.label : approval.approval_type;
                                const isPending = approval.status === 'pending';
                                const isDeciding = decidingApproval[approval.id];

                                let badgeBg = '#f1f5f9';
                                let badgeColor = '#475569';
                                let badgeBorder = '#cbd5e1';
                                if (approval.status === 'approved') {
                                  badgeBg = '#ecfdf5'; badgeColor = '#065f46'; badgeBorder = '#a7f3d0';
                                } else if (approval.status === 'rejected') {
                                  badgeBg = '#fef2f2'; badgeColor = '#991b1b'; badgeBorder = '#fecaca';
                                } else if (approval.status === 'pending') {
                                  badgeBg = '#fef3c7'; badgeColor = '#92400e'; badgeBorder = '#fcd34d';
                                }

                                return (
                                  <article
                                    key={approval.id}
                                    style={{
                                      padding: 14,
                                      border: '1px solid var(--line)',
                                      borderRadius: 10,
                                      background: 'var(--surface, white)'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                      <div>
                                        <strong style={{ fontSize: 14 }}>{typeLabel}</strong>
                                        <span
                                          style={{
                                            marginLeft: 8,
                                            display: 'inline-block',
                                            padding: '2px 8px',
                                            borderRadius: 12,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '.05em',
                                            background: badgeBg,
                                            color: badgeColor,
                                            border: `1px solid ${badgeBorder}`
                                          }}
                                        >
                                          {approval.status}
                                        </span>
                                      </div>
                                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                        Requested {formatHqDate(approval.requested_at)}
                                      </span>
                                    </div>

                                    <p style={{ color: 'var(--muted)', fontSize: 12, margin: '6px 0 0' }}>
                                      Requested from (reference only): {approval.requested_from_email || 'Not specified'}
                                    </p>

                                    {approval.evidence_url ? (
                                      <p style={{ fontSize: 12, margin: '4px 0 0' }}>
                                        <span>Evidence: </span>
                                        <a
                                          href={approval.evidence_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{ color: 'var(--accent, #0284c7)', textDecoration: 'underline' }}
                                        >
                                          {approval.evidence_url}
                                        </a>
                                      </p>
                                    ) : null}

                                    {approval.decision_note ? (
                                      <p style={{ fontSize: 13, margin: '6px 0 0', color: 'var(--text)' }}>
                                        <strong>Decision note:</strong> {approval.decision_note}
                                        {approval.decided_at ? <span style={{ color: 'var(--muted)', fontSize: 11 }}> · Decided {formatHqDate(approval.decided_at)}</span> : null}
                                      </p>
                                    ) : null}

                                    {isPending ? (
                                      <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--surface-muted, #f7f8fa)', border: '1px dashed var(--line)' }}>
                                        <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 6px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                                          Owner Decision (Owner-managed action)
                                        </p>
                                        <div style={{ display: 'grid', gap: 8 }}>
                                          <label style={{ display: 'grid', gap: 4 }}>
                                            <span style={{ fontSize: 12 }}>Decision note (optional)</span>
                                            <input
                                              value={decisionNotes[approval.id] || ''}
                                              onChange={e => setDecisionNotes(prev => ({ ...prev, [approval.id]: e.target.value }))}
                                              maxLength={2000}
                                              placeholder="e.g. Review completed"
                                              disabled={isDeciding}
                                            />
                                          </label>
                                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <button
                                              type="button"
                                              disabled={isDeciding}
                                              onClick={() => void handleDecideApproval(project.id, approval.id, 'approved')}
                                              style={{ background: '#059669', color: 'white', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
                                            >
                                              {isDeciding ? 'Deciding…' : 'Approve'}
                                            </button>
                                            <button
                                              type="button"
                                              disabled={isDeciding}
                                              onClick={() => void handleDecideApproval(project.id, approval.id, 'rejected')}
                                              style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
                                            >
                                              {isDeciding ? 'Deciding…' : 'Reject'}
                                            </button>
                                            <button
                                              type="button"
                                              disabled={isDeciding}
                                              onClick={() => void handleDecideApproval(project.id, approval.id, 'withdrawn')}
                                              style={{ background: '#64748b', color: 'white', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}
                                            >
                                              {isDeciding ? 'Deciding…' : 'Withdraw'}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}
                                  </article>
                                );
                              })}
                            </div>
                          </section>
                        ) : null}

                        {((projectActiveTab[project.id] || 'all') === 'all' || projectActiveTab[project.id] === 'qa') ? (
                          <section aria-label="QA Checklist" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                              <div>
                                <h3 style={{ margin: 0, fontSize: 16 }}>Quality Assurance (QA) Checklist</h3>
                                <p style={{ color: 'var(--muted)', fontSize: 12, margin: '2px 0 0' }}>
                                  Owner-verified delivery checks across responsive, accessibility, security, and performance categories.
                                </p>
                              </div>
                            </div>

                            <form onSubmit={event => void handleCreateQaCheck(event, project.id)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, margin: '14px 0', padding: 14, background: 'var(--surface, white)', border: '1px solid var(--line)', borderRadius: 10 }}>
                              <label style={{ display: 'grid', gap: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 600 }}>Category *</span>
                                <select
                                  value={qaForms[project.id]?.category || 'functionality'}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setQaForms(prev => ({ ...prev, [project.id]: { ...(prev[project.id] || { category: 'functionality', name: '', result: 'not-run', notes: '', evidence: '' }), category: val } }));
                                  }}
                                  required
                                >
                                  {QA_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                              </label>
                              <label style={{ display: 'grid', gap: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 600 }}>Check name *</span>
                                <input
                                  value={qaForms[project.id]?.name || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setQaForms(prev => ({ ...prev, [project.id]: { ...(prev[project.id] || { category: 'functionality', name: '', result: 'not-run', notes: '', evidence: '' }), name: val } }));
                                  }}
                                  required
                                  maxLength={200}
                                  placeholder="e.g. Navigation accessible via keyboard"
                                />
                              </label>
                              <label style={{ display: 'grid', gap: 4 }}>
                                <span style={{ fontSize: 12 }}>Initial result</span>
                                <select
                                  value={qaForms[project.id]?.result || 'not-run'}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setQaForms(prev => ({ ...prev, [project.id]: { ...(prev[project.id] || { category: 'functionality', name: '', result: 'not-run', notes: '', evidence: '' }), result: val } }));
                                  }}
                                >
                                  {QA_RESULTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                              </label>
                              <label style={{ display: 'grid', gap: 4 }}>
                                <span style={{ fontSize: 12 }}>Notes</span>
                                <input
                                  value={qaForms[project.id]?.notes || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setQaForms(prev => ({ ...prev, [project.id]: { ...(prev[project.id] || { category: 'functionality', name: '', result: 'not-run', notes: '', evidence: '' }), notes: val } }));
                                  }}
                                  maxLength={4000}
                                  placeholder="Verification observations"
                                />
                              </label>
                              <label style={{ display: 'grid', gap: 4 }}>
                                <span style={{ fontSize: 12 }}>Evidence link (HTTPS)</span>
                                <input
                                  type="url"
                                  value={qaForms[project.id]?.evidence || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setQaForms(prev => ({ ...prev, [project.id]: { ...(prev[project.id] || { category: 'functionality', name: '', result: 'not-run', notes: '', evidence: '' }), evidence: val } }));
                                  }}
                                  placeholder="https://example.com/test-report"
                                  pattern="https://.*"
                                  maxLength={1000}
                                />
                              </label>
                              <div style={{ display: 'flex', alignItems: 'end' }}>
                                <button
                                  type="submit"
                                  disabled={submittingQa[project.id] || !(qaForms[project.id]?.name || '').trim()}
                                >
                                  {submittingQa[project.id] ? 'Saving…' : 'Add QA Check'}
                                </button>
                              </div>
                            </form>

                            {qaErrors[project.id] ? <p role="alert" style={{ color: '#b42318', fontSize: 13, margin: '8px 0' }}>{qaErrors[project.id]}</p> : null}
                            {qaLoading[project.id] ? <p role="status" style={{ fontSize: 13, color: 'var(--muted)' }}>Loading QA checks…</p> : null}
                            {!qaLoading[project.id] && (!projectQa[project.id] || projectQa[project.id].length === 0) ? (
                              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No QA checks recorded yet for this project.</p>
                            ) : null}

                            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                              {(projectQa[project.id] || []).map(check => {
                                const catInfo = QA_CATEGORIES.find(c => c.value === check.category);
                                const catLabel = catInfo ? catInfo.label : check.category;
                                const isEditing = editingQaId === check.id;
                                const isUpdating = updatingQa[check.id];

                                let badgeBg = '#f8fafc';
                                let badgeColor = '#64748b';
                                let badgeBorder = '#e2e8f0';
                                if (check.result === 'pass') {
                                  badgeBg = '#ecfdf5'; badgeColor = '#065f46'; badgeBorder = '#a7f3d0';
                                } else if (check.result === 'fail') {
                                  badgeBg = '#fef2f2'; badgeColor = '#991b1b'; badgeBorder = '#fecaca';
                                } else if (check.result === 'blocked') {
                                  badgeBg = '#fef3c7'; badgeColor = '#92400e'; badgeBorder = '#fcd34d';
                                } else if (check.result === 'not-applicable') {
                                  badgeBg = '#f3f4f6'; badgeColor = '#4b5563'; badgeBorder = '#e5e7eb';
                                }

                                return (
                                  <article
                                    key={check.id}
                                    style={{
                                      padding: 14,
                                      border: '1px solid var(--line)',
                                      borderRadius: 10,
                                      background: 'var(--surface, white)'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span
                                          style={{
                                            display: 'inline-block',
                                            padding: '2px 8px',
                                            borderRadius: 6,
                                            fontSize: 11,
                                            fontWeight: 600,
                                            background: 'var(--surface-muted, #f1f5f9)',
                                            color: 'var(--text)',
                                            border: '1px solid var(--line)'
                                          }}
                                        >
                                          {catLabel}
                                        </span>
                                        <strong>{check.check_name}</strong>
                                        <span
                                          style={{
                                            display: 'inline-block',
                                            padding: '2px 8px',
                                            borderRadius: 12,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '.05em',
                                            background: badgeBg,
                                            color: badgeColor,
                                            border: `1px solid ${badgeBorder}`
                                          }}
                                        >
                                          {check.result}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                          <span>Update result:</span>
                                          <select
                                            value={check.result}
                                            disabled={isUpdating}
                                            onChange={e => void handleUpdateQaCheck(project.id, check.id, { result: e.target.value })}
                                            aria-label={`Update result for ${check.check_name}`}
                                          >
                                            {QA_RESULTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                          </select>
                                        </label>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (isEditing) {
                                              setEditingQaId(null);
                                            } else {
                                              setEditingQaId(check.id);
                                              setEditingQaData({
                                                result: check.result,
                                                notes: check.notes || '',
                                                evidence: check.evidence_url || ''
                                              });
                                            }
                                          }}
                                          style={{ fontSize: 12 }}
                                        >
                                          {isEditing ? 'Cancel edit' : 'Edit details'}
                                        </button>
                                      </div>
                                    </div>

                                    {check.notes ? (
                                      <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>
                                        <strong>Notes:</strong> {check.notes}
                                      </p>
                                    ) : null}

                                    {check.evidence_url ? (
                                      <p style={{ fontSize: 12, margin: '4px 0 0' }}>
                                        <span>Evidence: </span>
                                        <a
                                          href={check.evidence_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{ color: 'var(--accent, #0284c7)', textDecoration: 'underline' }}
                                        >
                                          {check.evidence_url}
                                        </a>
                                      </p>
                                    ) : null}

                                    {check.checked_at ? (
                                      <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                                        Owner checked at {formatHqDate(check.checked_at)}
                                      </span>
                                    ) : null}

                                    {isEditing ? (
                                      <form
                                        onSubmit={e => {
                                          e.preventDefault();
                                          void handleUpdateQaCheck(project.id, check.id, {
                                            result: editingQaData.result,
                                            notes: editingQaData.notes.trim() || null,
                                            evidence_url: editingQaData.evidence.trim() || null
                                          });
                                        }}
                                        style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--surface-muted, #f7f8fa)', border: '1px dashed var(--line)', display: 'grid', gap: 8 }}
                                      >
                                        <label style={{ display: 'grid', gap: 4 }}>
                                          <span style={{ fontSize: 12 }}>Result</span>
                                          <select
                                            value={editingQaData.result}
                                            onChange={e => setEditingQaData(d => ({ ...d, result: e.target.value }))}
                                            disabled={isUpdating}
                                          >
                                            {QA_RESULTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                          </select>
                                        </label>
                                        <label style={{ display: 'grid', gap: 4 }}>
                                          <span style={{ fontSize: 12 }}>Notes</span>
                                          <input
                                            value={editingQaData.notes}
                                            onChange={e => setEditingQaData(d => ({ ...d, notes: e.target.value }))}
                                            maxLength={4000}
                                            placeholder="Verification notes"
                                            disabled={isUpdating}
                                          />
                                        </label>
                                        <label style={{ display: 'grid', gap: 4 }}>
                                          <span style={{ fontSize: 12 }}>Evidence URL (HTTPS)</span>
                                          <input
                                            type="url"
                                            value={editingQaData.evidence}
                                            onChange={e => setEditingQaData(d => ({ ...d, evidence: e.target.value }))}
                                            pattern="https://.*"
                                            maxLength={1000}
                                            placeholder="https://example.com/test-evidence"
                                            disabled={isUpdating}
                                          />
                                        </label>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                          <button type="submit" disabled={isUpdating}>
                                            {isUpdating ? 'Saving…' : 'Save changes'}
                                          </button>
                                          <button type="button" onClick={() => setEditingQaId(null)} disabled={isUpdating}>
                                            Cancel
                                          </button>
                                        </div>
                                      </form>
                                    ) : null}
                                  </article>
                                );
                              })}
                            </div>
                          </section>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {project.archived_at
                    ? <button type="button" onClick={() => void setProjectArchived(project, true)}>Restore</button>
                    : <button type="button" onClick={() => void setProjectArchived(project, false)}>Archive</button>}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
};
