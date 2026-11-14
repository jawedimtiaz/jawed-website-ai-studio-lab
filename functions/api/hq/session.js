import { authorizeHqOwner, hqJson, isHqSameOrigin, HQ_JSON_HEADERS } from '../../lib/hqApi.js';
import { checkHqRateLimit } from '../../lib/hqRateLimit.js';

export async function onRequestPost({ request, env }) {
  const rateLimit = await checkHqRateLimit(request, env, { type: 'session' });
  if (!rateLimit.ok) return rateLimit.response;

  const auth = await authorizeHqOwner(request, env);
  if (!auth.ok) return auth.response;

  return hqJson({
    ok: true,
    identity: auth.identity,
    authorization: 'owner'
  });
}

export async function onRequestOptions({ request }) {
  if (!isHqSameOrigin(request)) {
    return hqJson({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...HQ_JSON_HEADERS,
      'allow': 'POST, OPTIONS'
    }
  });
}
