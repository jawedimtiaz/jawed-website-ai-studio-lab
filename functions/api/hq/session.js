import { authorizeHqOwner, hqJson } from '../../lib/hqApi.js';

export async function onRequestPost({ request, env }) {
  const auth = await authorizeHqOwner(request, env);
  if (!auth.ok) return auth.response;

  return hqJson({
    ok: true,
    identity: auth.identity,
    authorization: 'owner'
  });
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return hqJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return hqJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
  }
  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'no-store, private, max-age=0',
      'allow': 'POST, OPTIONS',
      'vary': 'Origin'
    }
  });
}
