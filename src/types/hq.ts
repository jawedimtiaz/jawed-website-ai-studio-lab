// src/types/hq.ts
// Canonical TypeScript types for Jawed Web Studio — Business Management HQ

export type HqNavSection =
  | 'overview'
  | 'crm'
  | 'projects'
  | 'business'
  | 'operations'
  | 'development'
  | 'analytics'
  | 'settings';

export type HqSubView =
  // Overview
  | 'overview-dashboard'
  // CRM
  | 'crm-leads'
  | 'crm-customers'
  | 'crm-contacts'
  | 'crm-follow-ups'
  | 'crm-notes'
  // Projects
  | 'projects-all'
  | 'projects-active'
  | 'projects-details'
  | 'projects-tasks'
  | 'projects-milestones'
  // Business
  | 'business-quotations'
  | 'business-proposals'
  | 'business-invoices'
  | 'business-payments'
  | 'business-expenses'
  // Operations
  | 'ops-onboarding'
  | 'ops-approvals'
  | 'ops-qa'
  | 'ops-maintenance'
  | 'ops-support'
  // Development
  | 'dev-repositories'
  | 'dev-deployments'
  | 'dev-releases'
  // Analytics
  | 'analytics-revenue'
  | 'analytics-customers'
  | 'analytics-projects'
  | 'analytics-outstanding'
  // Settings
  | 'settings-profile'
  | 'settings-security'
  | 'settings-application'
  | 'settings-audit-logs';

export interface HqOwner {
  uid: string;
  email: string;
  displayName: string;
  status: 'active' | 'disabled' | string;
  createdAt: string;
  lastSeenAt: string;
}

export interface HqOverviewKpis {
  totalCustomers: number;
  activeCustomers: number;
  newLeads: number;
  openLeads: number;
  activeProjects: number;
  completedProjects: number;
  totalProjects: number;
  overdueTasks: number;
  pendingApprovals: number;
  totalQuotations: number;
  quotationsValueMinor: number;
  invoicedAmountMinor: number;
  paymentsReceivedMinor: number;
  outstandingPaymentsMinor: number;
  monthlyRevenueMinor: number;
  monthlyExpensesMinor: number;
  upcomingRenewals: number;
}

export interface RevenueSeriesPoint {
  month: string;
  revenueMinor: number;
  expenseMinor: number;
  paymentCount?: number;
}

export interface HqLead {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  category: string;
  website: string;
  source: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'Proposal Sent' | 'Converted' | 'Lost' | string;
  estimated_value_minor: number;
  currency: string;
  notes: string;
  next_follow_up_at: string | null;
  converted_client_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HqClient {
  id: string;
  name: string;
  business_name: string;
  status: 'lead' | 'onboarding' | 'active' | 'paused' | 'completed' | 'archived' | string;
  email: string;
  phone: string;
  category: string;
  website: string;
  address: string;
  lead_source: string;
  notes: string;
  last_contact_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  project_count?: number;
  outstanding_minor?: number;
}

export interface HqContact {
  id: string;
  client_id: string;
  client_business?: string;
  client_name?: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  is_primary: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface HqNote {
  id: string;
  client_id: string;
  project_id: string | null;
  client_business?: string;
  client_name?: string;
  project_name?: string;
  note_type: string;
  subject: string;
  content: string;
  created_by: string;
  created_at: string;
}

export interface HqFollowUp {
  id: string;
  client_id: string | null;
  lead_id: string | null;
  project_id: string | null;
  client_business?: string;
  client_name?: string;
  lead_business?: string;
  project_name?: string;
  title: string;
  channel: string;
  scheduled_at: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | string;
  outcome_notes: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const PROJECT_STATUS_LIST = [
  'Lead',
  'Planning',
  'Quoted',
  'Onboarding',
  'In Progress',
  'Review',
  'Client Approval',
  'Completed',
  'Maintenance',
  'On Hold',
  'Cancelled'
] as const;

export interface HqProject {
  id: string;
  client_id: string;
  client_business?: string;
  client_name?: string;
  client_email?: string;
  name: string;
  project_type: string;
  status: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical' | string;
  summary: string;
  scope_markdown: string;
  start_date: string | null;
  target_date: string | null;
  completed_at: string | null;
  currency: string;
  quoted_amount_minor: number;
  total_tasks?: number;
  completed_tasks?: number;
  total_milestones?: number;
  completed_milestones?: number;
  created_at: string;
  updated_at: string;
}

export interface HqTask {
  id: string;
  project_id: string;
  milestone_id: string | null;
  project_name?: string;
  client_business?: string;
  milestone_name?: string;
  title: string;
  description: string;
  status: 'Todo' | 'In Progress' | 'Review' | 'Blocked' | 'Done' | 'Completed' | 'Cancelled' | string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical' | string;
  assigned_to: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HqMilestone {
  id: string;
  project_id: string;
  project_name?: string;
  client_business?: string;
  name: string;
  description: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Delayed' | string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HqLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor?: number;
}

export interface HqQuotation {
  id: string;
  quotation_number: string;
  client_id: string;
  project_id: string | null;
  client_business?: string;
  client_name?: string;
  client_email?: string;
  client_address?: string;
  project_name?: string;
  title: string;
  status: 'Draft' | 'Sent' | 'Approved' | 'Declined' | 'Expired' | 'Converted' | string;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  tax_rate_bps: number;
  tax_minor: number;
  total_minor: number;
  valid_until: string | null;
  notes: string;
  terms: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HqProposal {
  id: string;
  proposal_number: string;
  client_id: string;
  project_id: string | null;
  quotation_id: string | null;
  client_business?: string;
  client_name?: string;
  project_name?: string;
  quotation_number?: string;
  title: string;
  executive_summary: string;
  scope_markdown: string;
  timeline_summary: string;
  deliverables: string;
  amount_minor: number;
  currency: string;
  status: 'Draft' | 'Sent' | 'Under Review' | 'Accepted' | 'Declined' | string;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HqInvoice {
  id: string;
  invoice_number: string;
  client_id: string;
  project_id: string | null;
  quotation_id: string | null;
  client_business?: string;
  client_name?: string;
  client_email?: string;
  client_address?: string;
  project_name?: string;
  title: string;
  status: 'Draft' | 'Issued' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Void' | string;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  tax_rate_bps: number;
  tax_minor: number;
  total_minor: number;
  paid_amount_minor: number;
  balance_due_minor: number;
  issue_date: string;
  due_date: string;
  notes: string;
  terms: string;
  created_at: string;
  updated_at: string;
}

export interface HqPayment {
  id: string;
  invoice_id: string;
  client_id: string;
  invoice_number?: string;
  invoice_title?: string;
  client_business?: string;
  client_name?: string;
  amount_minor: number;
  currency: string;
  payment_method: string;
  reference_number: string;
  payment_date: string;
  notes: string;
  status: 'Recorded' | 'Reversed' | string;
  recorded_by: string;
  created_at: string;
}

export interface HqExpense {
  id: string;
  client_id: string | null;
  project_id: string | null;
  client_business?: string;
  project_name?: string;
  category: string;
  vendor: string;
  description: string;
  amount_minor: number;
  currency: string;
  incurred_date: string;
  billable: number;
  status: string;
  created_at: string;
}

export interface HqOnboardingItem {
  id: string;
  client_id: string;
  project_id: string | null;
  client_business?: string;
  project_name?: string;
  title: string;
  category: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Blocked' | string;
  owner_role: string;
  due_date: string | null;
  notes: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HqApproval {
  id: string;
  client_id: string;
  project_id: string;
  client_business?: string;
  project_name?: string;
  stage: string;
  title: string;
  summary: string;
  status: 'Pending' | 'Approved' | 'Changes Requested' | 'Rejected' | string;
  requested_by: string;
  reviewed_by: string;
  decision_notes: string;
  requested_at: string;
  decided_at: string | null;
}

export interface HqQaCheck {
  id: string;
  client_id: string;
  project_id: string;
  client_business?: string;
  project_name?: string;
  category: string;
  title: string;
  status: 'Not Run' | 'Pass' | 'Fail' | 'Blocked' | string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical' | string;
  defect_description: string;
  assigned_action: string;
  resolution_status: 'Open' | 'In Progress' | 'Resolved' | 'Verified' | string;
  tested_by: string;
  tested_at: string | null;
  updated_at: string;
}

export interface HqRepository {
  id: string;
  client_id: string;
  project_id: string;
  client_business?: string;
  project_name?: string;
  repo_name: string;
  repo_url: string;
  main_branch: string;
  dev_branch: string;
  hosting_platform: string;
  preview_url: string;
  production_url: string;
  deployment_status: string;
  last_deployed_at: string | null;
  notes: string;
  updated_at: string;
}

export interface HqDeployment {
  id: string;
  client_id: string;
  project_id: string;
  repository_id: string | null;
  client_business?: string;
  project_name?: string;
  repo_name?: string;
  environment: string;
  version_tag: string;
  branch: string;
  commit_sha: string;
  deployment_url: string;
  status: string;
  release_notes: string;
  deployed_by: string;
  deployed_at: string;
}

export interface HqMaintenancePlan {
  id: string;
  client_id: string;
  project_id: string | null;
  client_business?: string;
  client_name?: string;
  project_name?: string;
  plan_name: string;
  billing_cycle: string;
  amount_minor: number;
  currency: string;
  status: 'Active' | 'Expiring Soon' | 'Expired' | 'Paused' | 'Cancelled' | string;
  start_date: string;
  expiry_date: string;
  renewal_reminder_days: number;
  scope_notes: string;
  last_maintenance_at: string | null;
  updated_at: string;
}

export interface HqSupportTicket {
  id: string;
  ticket_number: string;
  client_id: string;
  project_id: string | null;
  maintenance_plan_id: string | null;
  client_business?: string;
  client_name?: string;
  project_name?: string;
  subject: string;
  description: string;
  category: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent' | string;
  status: 'Open' | 'In Progress' | 'Waiting on Client' | 'Resolved' | 'Closed' | string;
  resolution_notes: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface HqAnalyticsResponse {
  summary: {
    totalRevenueMinor: number;
    totalExpensesMinor: number;
    netProfitMinor: number;
    totalOutstandingMinor: number;
    overdueOutstandingMinor: number;
  };
  monthlySeries: RevenueSeriesPoint[];
  customerPerformance: Array<{
    id: string;
    business_name: string;
    name: string;
    status: string;
    project_count: number;
    invoiced_minor: number;
    paid_minor: number;
    outstanding_minor: number;
  }>;
  projectPerformance: Array<{
    id: string;
    name: string;
    project_type: string;
    status: string;
    priority: string;
    quoted_amount_minor: number;
    currency: string;
    start_date: string | null;
    target_date: string | null;
    client_business: string;
    total_tasks: number;
    completed_tasks: number;
    open_defects: number;
    expense_minor: number;
  }>;
  outstandingInvoices: HqInvoice[];
}

export interface HqStudioSettings {
  studioName: string;
  ownerName: string;
  contactEmail: string;
  website: string;
  defaultCurrency: string;
  defaultTaxRateBps: number;
  invoiceTerms: string;
  quotationValidityDays: number;
}

export interface HqAuditLog {
  id: string;
  actor_uid: string;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  request_id: string;
  ip_address: string;
  before_json: string | null;
  after_json: string | null;
  metadata_json: string | null;
  created_at: string;
}
