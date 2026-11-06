// functions/api/hq/session.js
// Studio HQ Session API Endpoint

import { verifyAndAuthorizeOwner, jsonResponse } from '../../lib/hqApi.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) {
    return auth.response;
  }

  return jsonResponse({
    success: true,
    authenticated: true,
    owner: auth.owner,
    timestamp: new Date().toISOString()
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAndAuthorizeOwner(request, env);
  if (!auth.authorized) {
    return auth.response;
  }

  return jsonResponse({
    success: true,
    authenticated: true,
    sessionVerified: true,
    owner: auth.owner,
    timestamp: new Date().toISOString()
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '86400'
    }
  });
}
