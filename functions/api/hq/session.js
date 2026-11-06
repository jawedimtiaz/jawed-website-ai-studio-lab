import { verifyHqFirebaseToken } from '../lib/hqAuth.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, private, max-age=0',
  'pragma': 'no-cache',
  'vary': 'Authorization, Origin'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  const fetchSite = request.headers.get('sec-fetch-site');
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

export async function onRequestPost({ request }) {
  if (!isSameOrigin(request)) return json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);

  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ ok: false, error: 'AUTH_REQUIRED' }, 401);

  const result = await verifyHqFirebaseToken(match[1]);
  if (!result.ok) {
    return json({ ok: false, error: result.code }, result.status);
  }

  return json({
    ok: true,
    identity: result.identity,
    authorization: 'owner'
  });
}

export async function onRequestOptions({ request }) {
  if (!isSameOrigin(request)) return json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'no-store, private, max-age=0',
      'allow': 'POST, OPTIONS',
      'vary': 'Origin'
    }
  });
}
