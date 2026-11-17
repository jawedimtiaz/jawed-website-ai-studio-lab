// src/services/hqService.ts
// Authenticated Studio HQ API Client + Minor-Unit Money & Date Formatting Helpers

import { auth } from '../lib/firebase';

export class HqApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = 'API_ERROR') {
    super(message);
    this.name = 'HqApiError';
    this.status = status;
    this.code = code;
  }
}

export async function hqFetch<T = any>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new HqApiError('Not signed in to Firebase Authentication', 401, 'UNAUTHORIZED');
  }

  const token = await user.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.idempotencyKey) {
    headers.set('X-Idempotency-Key', options.idempotencyKey);
  }

  const res = await fetch(path, {
    ...options,
    headers
  });

  let data: any = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: { message: text || 'Invalid server response' } };
  }

  if (!res.ok) {
    const code = data?.error?.code || 'API_ERROR';
    const msg = data?.error?.message || data?.message || `Request failed with status ${res.status}`;
    throw new HqApiError(msg, res.status, code);
  }

  return data as T;
}

export function formatMoney(minorUnits: number | null | undefined, currency = 'INR'): string {
  const amount = (Number(minorUnits) || 0) / 100;
  const code = (currency || 'INR').toUpperCase();
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function parseMajorToMinor(majorInput: string | number): number {
  const num = typeof majorInput === 'number' ? majorInput : parseFloat(String(majorInput || '0').replace(/,/g, ''));
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

export function minorToMajorString(minorUnits: number | null | undefined): string {
  return ((Number(minorUnits) || 0) / 100).toFixed(2);
}
