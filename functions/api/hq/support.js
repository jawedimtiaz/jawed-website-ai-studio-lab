// functions/api/hq/support.js
// Studio HQ Customer Support Tickets API (Safe Compatibility Adapter)
// Reconciled with Canonical Studio HQ Schema (0001_studio_hq_schema.sql)
// Note: Support ticketing persistence is not supported by the active canonical schema.
// Returns safe empty responses to allow frontend UI empty-state rendering without SQL crashes.

import {
  verifyAndAuthorizeOwner,
  jsonResponse,
  errorResponse,
  hqOptionsResponse
} from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'general' });
  if (!auth.authorized) return auth.response;

  return jsonResponse({
    success: true,
    tickets: [],
    supported: false,
    message: 'Support ticket tracking is not supported by the active canonical schema'
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  return errorResponse(
    400,
    'UNSUPPORTED_OPERATION',
    'Support ticket persistence is not supported by the active canonical schema'
  );
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  return errorResponse(404, 'NOT_FOUND', 'Support ticket not found');
}

export async function onRequestPatch(ctx) {
  return onRequestPut(ctx);
}

export async function onRequestDelete({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'write' });
  if (!auth.authorized) return auth.response;

  return errorResponse(404, 'NOT_FOUND', 'Support ticket not found');
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, POST, PUT, DELETE, OPTIONS');
}
