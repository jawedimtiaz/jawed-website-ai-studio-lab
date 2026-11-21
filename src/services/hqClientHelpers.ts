// src/services/hqClientHelpers.ts
// Pure helper functions and type definitions for Studio HQ CRM Client/Customer module:
// Canonical status mapping, payload normalization, response normalization, and display formatting.

import type {
  HqClient,
  HqContact,
  HqNote,
  HqFollowUp,
  HqProject,
  HqInvoice,
  HqQuotation
} from '../types/hq.ts';

export const CANONICAL_CLIENT_STATUSES = [
  'lead',
  'prospect',
  'active',
  'paused',
  'completed',
  'closed'
] as const;

export type CanonicalClientStatus = typeof CANONICAL_CLIENT_STATUSES[number];

export const CANONICAL_CLIENT_STATUS_SET = new Set<string>(CANONICAL_CLIENT_STATUSES);

export interface ClientStatusOption {
  canonical: CanonicalClientStatus;
  label: string;
}

export const SELECTABLE_CLIENT_STATUSES: readonly ClientStatusOption[] = [
  { canonical: 'active', label: 'Active' },
  { canonical: 'prospect', label: 'Prospect' },
  { canonical: 'lead', label: 'Lead' },
  { canonical: 'paused', label: 'Paused' },
  { canonical: 'completed', label: 'Completed' },
  { canonical: 'closed', label: 'Closed' }
] as const;

export interface ClientFormData {
  id?: string;
  name: string;
  business_name: string;
  email: string;
  phone: string;
  category: string;
  website: string;
  address: string;
  status: string;
  lead_source: string;
  notes: string;
}

export interface CanonicalClientPayload {
  name: string;
  business_name?: string | null;
  client_code?: string | null;
  status?: CanonicalClientStatus;
  email?: string | null;
  phone?: string | null;
  website_url?: string | null;
  billing_address?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface NormalizedClientDetailBundle {
  client: HqClient;
  contacts: HqContact[];
  notes: HqNote[];
  followUps: HqFollowUp[];
  projects: HqProject[];
  invoices: HqInvoice[];
  quotations: HqQuotation[];
}

/**
 * Maps any client status string (canonical or legacy) to its canonical backend status value.
 * Returns null if the status has no known canonical equivalent.
 */
export function toCanonicalClientStatus(status: string | null | undefined): CanonicalClientStatus | null {
  if (!status || typeof status !== 'string') return null;
  const normalized = status.trim().toLowerCase();

  if (CANONICAL_CLIENT_STATUS_SET.has(normalized)) {
    return normalized as CanonicalClientStatus;
  }

  // Legacy status mappings
  switch (normalized) {
    case 'onboarding':
      return 'prospect';
    case 'archived':
      return 'closed';
    default:
      return null;
  }
}

/**
 * Returns a human-friendly display label for any client status.
 */
export function getClientStatusDisplayLabel(status: string | null | undefined): string {
  if (!status || typeof status !== 'string') return 'Active';
  const canonical = toCanonicalClientStatus(status);
  if (canonical) {
    const match = SELECTABLE_CLIENT_STATUSES.find((s) => s.canonical === canonical);
    if (match) return match.label;
  }
  const trimmed = status.trim();
  if (!trimmed) return 'Active';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Normalizes user-facing form inputs into a strictly valid CanonicalClientPayload.
 * Ensures:
 * 1. website -> website_url
 * 2. address -> billing_address
 * 3. lead_source -> source
 * 4. category is never sent as a separate field; appended to notes if provided without duplication
 * 5. name is mandatory; if blank, falls back to business_name
 * 6. Empty strings normalized to null or omitted
 * 7. status is validated against canonical statuses
 * 8. id is never sent in body
 */
export function toCanonicalClientPayload(
  form: Partial<ClientFormData> | null | undefined,
  partial = false
): CanonicalClientPayload {
  if (!form || typeof form !== 'object') {
    throw new Error('CLIENT_PAYLOAD_INVALID');
  }

  const rawBusinessName = typeof form.business_name === 'string' ? form.business_name.trim() : '';
  const rawName = typeof form.name === 'string' ? form.name.trim() : '';

  // Name resolution: mandatory in backend D1 schema. If contact name is blank, use business_name.
  const resolvedName = rawName || rawBusinessName;
  if (!partial && !resolvedName) {
    throw new Error('NAME_REQUIRED');
  }

  const payload: CanonicalClientPayload = {} as CanonicalClientPayload;
  if (resolvedName) {
    payload.name = resolvedName;
  }

  if (rawBusinessName) {
    payload.business_name = rawBusinessName;
  } else if (partial && 'business_name' in form) {
    payload.business_name = null;
  }

  // Email
  if (typeof form.email === 'string') {
    const trimmed = form.email.trim();
    payload.email = trimmed || null;
  }

  // Phone
  if (typeof form.phone === 'string') {
    const trimmed = form.phone.trim();
    payload.phone = trimmed || null;
  }

  // Website -> website_url
  const rawWebsite = typeof form.website === 'string' ? form.website.trim() : '';
  if (rawWebsite) {
    payload.website_url = rawWebsite;
  } else if ('website' in form || 'website_url' in (form as any)) {
    payload.website_url = null;
  }

  // Address -> billing_address
  const rawAddress = typeof form.address === 'string' ? form.address.trim() : '';
  if (rawAddress) {
    payload.billing_address = rawAddress;
  } else if ('address' in form || 'billing_address' in (form as any)) {
    payload.billing_address = null;
  }

  // Lead Source -> source
  const rawSource = typeof form.lead_source === 'string'
    ? form.lead_source.trim()
    : (typeof (form as any).source === 'string' ? (form as any).source.trim() : '');
  if (rawSource) {
    payload.source = rawSource;
  } else if ('lead_source' in form || 'source' in (form as any)) {
    payload.source = null;
  }

  // Status
  const rawStatus = typeof form.status === 'string' ? form.status.trim() : '';
  if (rawStatus) {
    const canonicalStatus = toCanonicalClientStatus(rawStatus);
    if (!canonicalStatus) {
      throw new Error('STATUS_INVALID');
    }
    payload.status = canonicalStatus;
  } else if (!partial) {
    payload.status = 'active';
  }

  // Notes & Category Preservation
  let notes = typeof form.notes === 'string' ? form.notes.trim() : '';
  const rawCategory = typeof form.category === 'string' ? form.category.trim() : '';
  if (rawCategory) {
    const categoryTag = `[Category: ${rawCategory}]`;
    if (!notes.includes(categoryTag) && !notes.includes(`Category: ${rawCategory}`)) {
      notes = notes ? `${notes}\n${categoryTag}` : categoryTag;
    }
  }

  if (notes) {
    payload.notes = notes;
  } else if ('notes' in form || 'category' in form) {
    payload.notes = null;
  }

  return payload;
}

/**
 * Defensively normalizes client detail responses from the canonical API.
 * Ensures the returned bundle never causes undefined property exceptions in the UI.
 */
export function normalizeClientDetailResponse(response: any): NormalizedClientDetailBundle {
  if (!response || typeof response !== 'object') {
    throw new Error('CLIENT_DETAIL_INVALID');
  }

  const rawClient = response.client ||
    (response.id ? response : (Array.isArray(response.clients) ? response.clients[0] : null)) ||
    {};

  const client: HqClient = {
    id: String(rawClient.id || ''),
    name: String(rawClient.name || rawClient.business_name || 'Unnamed Client'),
    business_name: String(rawClient.business_name || rawClient.name || ''),
    status: rawClient.status || 'active',
    email: String(rawClient.email || ''),
    phone: String(rawClient.phone || ''),
    category: String(rawClient.category || ''),
    website: String(rawClient.website_url || rawClient.website || ''),
    address: String(rawClient.billing_address || rawClient.address || ''),
    lead_source: String(rawClient.source || rawClient.lead_source || ''),
    notes: String(rawClient.notes || ''),
    last_contact_at: String(rawClient.last_contact_at || rawClient.updated_at || ''),
    archived_at: rawClient.archived_at || null,
    created_at: String(rawClient.created_at || ''),
    updated_at: String(rawClient.updated_at || ''),
    project_count: typeof rawClient.active_projects_count === 'number'
      ? rawClient.active_projects_count
      : (typeof rawClient.project_count === 'number' ? rawClient.project_count : 0),
    outstanding_minor: typeof rawClient.outstanding_minor === 'number' ? rawClient.outstanding_minor : 0
  };

  // Contacts from client.contacts or response.contacts
  const rawContacts = Array.isArray(rawClient.contacts)
    ? rawClient.contacts
    : (Array.isArray(response?.contacts) ? response.contacts : []);

  const contacts: HqContact[] = rawContacts.map((c: any) => ({
    id: String(c.id || ''),
    client_id: String(c.client_id || client.id || ''),
    name: String(c.name || c.full_name || ''),
    full_name: String(c.full_name || c.name || ''),
    role: String(c.role || c.role_title || ''),
    role_title: String(c.role_title || c.role || ''),
    email: String(c.email || ''),
    phone: String(c.phone || ''),
    is_primary: Boolean(c.is_primary),
    notes: String(c.notes || ''),
    created_at: String(c.created_at || ''),
    updated_at: String(c.updated_at || '')
  }));

  const notes: HqNote[] = Array.isArray(response?.notes) ? response.notes : [];
  const followUps: HqFollowUp[] = Array.isArray(response?.followUps) ? response.followUps : [];
  const projects: HqProject[] = Array.isArray(response?.projects) ? response.projects : [];
  const invoices: HqInvoice[] = Array.isArray(response?.invoices) ? response.invoices : [];
  const quotations: HqQuotation[] = Array.isArray(response?.quotations) ? response.quotations : [];

  return {
    client,
    contacts,
    notes,
    followUps,
    projects,
    invoices,
    quotations
  };
}
