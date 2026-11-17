// functions/api/hq/session.js
// Studio HQ Session & Controlled Enrollment Endpoint

import {
  verifyAndAuthorizeOwner,
  controlledOwnerBootstrap,
  jsonResponse,
  hqOptionsResponse
} from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'session' });
  if (!auth.authorized) return auth.response;

  return jsonResponse({
    success: true,
    authenticated: true,
    owner: auth.owner,
    timestamp: new Date().toISOString()
  });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (url.pathname.endsWith('/enroll') || url.pathname.endsWith('/enroll/')) {
    return controlledOwnerBootstrap(request, env);
  }

  const auth = await verifyAndAuthorizeOwner(request, env, { rateLimitKind: 'session' });
  if (!auth.authorized) return auth.response;

  return jsonResponse({
    success: true,
    authenticated: true,
    sessionVerified: true,
    owner: auth.owner,
    timestamp: new Date().toISOString()
  });
}

export async function onRequestOptions() {
  return hqOptionsResponse('GET, POST, OPTIONS');
}
